from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from django.utils import timezone

from .models import DeviceRegistration, NotificationHistory
from .providers import get_push_provider

if TYPE_CHECKING:
    from apps.cases.models import Hearing, Judgment
    from apps.reminders.models import Reminder

logger = logging.getLogger(__name__)

EXPO_TOKEN_REGEX = re.compile(
    r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-\.]+\]$|"
    r"^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$"
)


def is_valid_expo_token(token: str | None) -> bool:
    """Validate whether a token matches standard Expo push token patterns."""
    if not token or not isinstance(token, str):
        return False
    return bool(EXPO_TOKEN_REGEX.match(token.strip()))


class PushDeliveryError(Exception):
    """Base exception for push delivery failures."""


class TemporaryPushDeliveryError(PushDeliveryError):
    """Temporary push delivery failure (e.g. gateway timeout, connection reset, HTTP 5xx, rate limit 429)."""


class PermanentPushDeliveryError(PushDeliveryError):
    """Permanent push delivery failure (e.g. malformed token, DeviceNotRegistered)."""


def sanitize_push_payload(
    title: str,
    body: str,
    category: str = "GENERAL",
) -> tuple[str, str]:
    """Sanitize lock-screen push notification content to preserve client and case confidentiality.

    Party names, sensitive petitioner/respondent identities, and confidential
    case strategy are kept off lock-screen previews. The complete details are
    provided in the in-app notification center and the secure `data_payload`.
    """
    cat = (category or "").upper()
    if cat in ("HEARING_REMINDER", "REMINDER"):
        return (
            "APHC Hearing Alert",
            "You have an upcoming High Court hearing listed. Open app for details.",
        )
    if cat in ("TOKEN_APPROACHING", "TOKEN_ALERT"):
        return (
            "APHC Court Token Alert",
            "A listed matter in your cause list is approaching hearing. Open app for details.",
        )
    if cat == "TOKEN_CALLED":
        return (
            "APHC Court Token Alert",
            "A listed matter in your cause list has been called. Open app for details.",
        )
    if cat in ("CASE_UPDATE", "HEARING_CHANGE", "JUDGMENT"):
        return (
            "APHC Docket Update",
            "An update has been posted to a tracked High Court case. Open app for details.",
        )
    if cat == "VOICE_TRANSCRIPTION_COMPLETED":
        return (
            "APHC Voice Note",
            "Voice transcription is ready. Open app to view case notes.",
        )
    if cat == "VOICE_TRANSCRIPTION_FAILED":
        return (
            "APHC Voice Note",
            "Voice note transcription failed. Open app to retry or view note.",
        )
    if cat in ("CALENDAR_REMINDER", "COMPLIANCE_DEADLINE"):
        return (
            "APHC Agenda Alert",
            "You have an upcoming court calendar agenda item. Open app for details.",
        )
    return ("APHC Court Alert", "New notification available in APHC Case Tracker.")


class NotificationService:
    """Service for registering devices, dispatching push notifications, and managing notification history."""

    MAX_RETRIES = 3

    @classmethod
    def register_device(
        cls,
        user: Any,
        expo_push_token: str,
        platform: str = "android",
        device_id: str = "",
        app_version: str = "",
        device_name: str = "",
    ) -> DeviceRegistration:
        """Register or rotate an advocate's mobile push device token."""
        clean_token = expo_push_token.strip() if expo_push_token else ""
        if not is_valid_expo_token(clean_token):
            raise PermanentPushDeliveryError(f"Invalid Expo push token format: {clean_token}")

        clean_platform = (platform or "android").lower()
        if clean_platform not in ("android", "ios", "web"):
            clean_platform = "android"

        if device_id:
            DeviceRegistration.objects.filter(
                user=user,
                device_id=device_id.strip(),
            ).exclude(expo_push_token=clean_token).update(is_active=False)

        device, _ = DeviceRegistration.objects.update_or_create(
            expo_push_token=clean_token,
            defaults={
                "user": user,
                "platform": clean_platform,
                "device_id": device_id.strip() if device_id else "",
                "app_version": app_version.strip() if app_version else "",
                "device_name": device_name.strip() if device_name else f"{clean_platform.capitalize()} Device",
                "is_active": True,
                "failure_count": 0,
                "last_seen_at": timezone.now(),
            },
        )
        return device

    @classmethod
    def deactivate_device(
        cls,
        user: Any,
        expo_push_token: str | None = None,
        device_id: str | None = None,
        all_devices: bool = False,
    ) -> int:
        """Deactivate advocate's push registration(s) upon logout or notification disable."""
        qs = DeviceRegistration.objects.filter(user=user, is_active=True)
        if all_devices:
            return qs.update(is_active=False)
        if expo_push_token:
            return qs.filter(expo_push_token=expo_push_token.strip()).update(is_active=False)
        if device_id:
            return qs.filter(device_id=device_id.strip()).update(is_active=False)
        return 0

    @classmethod
    def dispatch_push_to_devices(
        cls,
        user: Any,
        title: str,
        body: str,
        data_payload: dict | None = None,
        is_sensitive: bool = False,
        category: str = "GENERAL",
    ) -> int:
        """Deliver push notification to registered Expo push tokens for the user."""
        devices = list(DeviceRegistration.objects.filter(user=user, is_active=True))
        if not devices:
            return 0

        dispatched_count = 0
        temporary_errors: list[str] = []
        permanent_errors: list[str] = []

        push_title, push_body = (
            sanitize_push_payload(title, body, category)
            if is_sensitive
            else (title, body)
        )

        for device in devices:
            token = device.expo_push_token
            if not is_valid_expo_token(token):
                device.is_active = False
                device.save(update_fields=["is_active"])
                logger.warning(
                    "Deactivated device %s due to invalid Expo token format: %s",
                    device.id,
                    token,
                )
                permanent_errors.append(f"Invalid token format on device {device.id}")
                continue

            try:
                logger.info(
                    "Mock push dispatched to %s [%s]: %s - %s",
                    device.user.username,
                    device.platform,
                    title,
                    body,
                )
                provider = get_push_provider()
                batch = provider.send_push(
                    tokens=[token],
                    title=push_title,
                    body=push_body,
                    data=data_payload or {},
                )
                for res in batch.results:
                    if res.status == "ok":
                        dispatched_count += 1
                    else:
                        err_msg = res.message or "Push dispatch error"
                        if res.is_permanent_error or "devicenotregistered" in err_msg.lower():
                            device.is_active = False
                            device.failure_count += 1
                            device.save(update_fields=["is_active", "failure_count"])
                            permanent_errors.append(err_msg)
                        else:
                            device.failure_count += 1
                            device.save(update_fields=["failure_count"])
                            temporary_errors.append(err_msg)
            except Exception as exc:
                err_str = str(exc)
                if "devicenotregistered" in err_str.lower() or "unregistered" in err_str.lower():
                    device.is_active = False
                    device.failure_count += 1
                    device.save(update_fields=["is_active", "failure_count"])
                    logger.warning("Deactivated unregistered device %s: %s", device.id, exc)
                    permanent_errors.append(f"DeviceNotRegistered on device {device.id}")
                else:
                    device.failure_count += 1
                    device.save(update_fields=["failure_count"])
                    logger.warning("Temporary push failure on device %s: %s", device.id, exc)
                    temporary_errors.append(str(exc))

        if dispatched_count == 0:
            if temporary_errors:
                raise TemporaryPushDeliveryError(
                    f"Temporary delivery failure on {len(temporary_errors)} device(s): {'; '.join(temporary_errors)}"
                )
            if permanent_errors:
                raise PermanentPushDeliveryError(
                    f"Permanent delivery failure on {len(permanent_errors)} device(s): {'; '.join(permanent_errors)}"
                )

        return dispatched_count

    @classmethod
    def dispatch_notification_to_devices(
        cls,
        notification: NotificationHistory,
        raise_on_error: bool = False,
        is_sensitive: bool = False,
    ) -> bool:
        """Attempt push delivery to registered devices and record delivery status on data_payload."""
        user = notification.user
        payload = dict(notification.data_payload or {})
        retry_count = payload.get("retry_count", 0)

        try:
            dispatched = cls.dispatch_push_to_devices(
                user=user,
                title=notification.title,
                body=notification.body,
                data_payload=payload,
                is_sensitive=is_sensitive,
                category=notification.category,
            )
            if dispatched == 0:
                payload["delivery_status"] = "NO_ACTIVE_DEVICES"
                notification.delivery_status = "NO_ACTIVE_DEVICES"
            else:
                payload["delivery_status"] = "DELIVERED"
                payload["delivery_devices_count"] = dispatched
                notification.delivery_status = "DELIVERED"

            payload["dispatched_at"] = timezone.now().isoformat()
            notification.data_payload = payload
            notification.save(update_fields=["data_payload", "delivery_status"])
            return True
        except TemporaryPushDeliveryError as exc:
            retry_count += 1
            payload["retry_count"] = retry_count
            payload["last_error"] = str(exc)
            payload["failure_type"] = "TEMPORARY"
            if retry_count >= cls.MAX_RETRIES:
                payload["delivery_status"] = "PERMANENT_FAILURE"
                notification.delivery_status = "PERMANENT_FAILURE"
                logger.error(
                    "Notification %s reached max retries (%d). Marked as PERMANENT_FAILURE: %s",
                    notification.id,
                    cls.MAX_RETRIES,
                    exc,
                )
            else:
                payload["delivery_status"] = "FAILED"
                notification.delivery_status = "FAILED"
                logger.warning(
                    "Notification %s temporary push failure (attempt %d/%d): %s",
                    notification.id,
                    retry_count,
                    cls.MAX_RETRIES,
                    exc,
                )
            notification.data_payload = payload
            notification.save(update_fields=["data_payload", "delivery_status"])
            if raise_on_error:
                raise
            return False
        except (PermanentPushDeliveryError, PushDeliveryError) as exc:
            err_str = str(exc).lower()
            is_permanent = isinstance(exc, PermanentPushDeliveryError) or (
                "devicenotregistered" in err_str or "permanent" in err_str or "invalid" in err_str
            )
            retry_count += 1
            payload["retry_count"] = retry_count
            payload["last_error"] = str(exc)

            if is_permanent or retry_count >= cls.MAX_RETRIES:
                payload["delivery_status"] = "PERMANENT_FAILURE"
                notification.delivery_status = "PERMANENT_FAILURE"
                payload["failure_type"] = "PERMANENT"
                logger.error(
                    "Notification %s permanent push failure: %s",
                    notification.id,
                    exc,
                )
            else:
                payload["delivery_status"] = "FAILED"
                notification.delivery_status = "FAILED"
                payload["failure_type"] = "TEMPORARY"
                logger.warning(
                    "Notification %s push delivery error (attempt %d/%d): %s",
                    notification.id,
                    retry_count,
                    cls.MAX_RETRIES,
                    exc,
                )

            notification.data_payload = payload
            notification.save(update_fields=["data_payload", "delivery_status"])
            if raise_on_error:
                raise
            return False

    @classmethod
    def retry_failed_notifications(cls, max_retries: int = MAX_RETRIES) -> int:
        """Scan and retry delivery for notifications that previously failed with temporary errors."""
        failed_notifications = list(
            NotificationHistory.objects.filter(data_payload__delivery_status="FAILED")
        )
        successful_retries = 0

        for notification in failed_notifications:
            payload = dict(notification.data_payload or {})
            current_retries = payload.get("retry_count", 0)
            if current_retries >= max_retries:
                payload["delivery_status"] = "PERMANENT_FAILURE"
                payload["failure_type"] = "PERMANENT"
                notification.delivery_status = "PERMANENT_FAILURE"
                notification.data_payload = payload
                notification.save(update_fields=["data_payload", "delivery_status"])
                continue

            if cls.dispatch_notification_to_devices(notification, raise_on_error=False):
                if (notification.data_payload or {}).get("delivery_status") == "DELIVERED":
                    successful_retries += 1

        return successful_retries

    @classmethod
    def send_push_notification(
        cls,
        user: Any,
        title: str,
        body: str,
        category: str = "SYSTEM_ALERT",
        data_payload: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        is_sensitive: bool = True,
        async_delivery: bool = False,
    ) -> NotificationHistory:
        """Create and dispatch a push notification to all active devices of an advocate."""
        if idempotency_key:
            existing = NotificationHistory.objects.filter(
                user=user,
                idempotency_key=idempotency_key,
            ).first()
            if existing:
                return existing

        payload = dict(data_payload or {})
        payload["original_title"] = title
        payload["original_body"] = body

        notification = NotificationHistory.objects.create(
            user=user,
            title=title,
            body=body,
            category=category,
            data_payload=payload,
            delivery_status="QUEUED",
            idempotency_key=idempotency_key,
        )

        if async_delivery:
            try:
                from .tasks import send_push_notification_task

                send_push_notification_task.delay(notification.id, idempotency_key=idempotency_key)
                return notification
            except Exception as exc:
                logger.warning("Async Celery dispatch failed; falling back to sync: %s", exc)

        cls.dispatch_notification_to_devices(
            notification,
            raise_on_error=False,
            is_sensitive=is_sensitive,
        )
        try:
            from .realtime import RealtimeService

            RealtimeService.publish_notification_event(notification)
        except Exception as exc:
            logger.debug("Failed to publish notification realtime event: %s", exc)

        return notification

    @classmethod
    def process_async_push_delivery(
        cls,
        notification_id: int,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        """Worker task routine delivering a queued notification with retry validation."""
        notification = NotificationHistory.objects.get(id=notification_id)
        if notification.delivery_status == "DELIVERED":
            return {"status": "already_delivered", "notification_id": notification_id}

        success = cls.dispatch_notification_to_devices(
            notification,
            raise_on_error=True,
            is_sensitive=True,
        )
        return {
            "notification_id": notification_id,
            "status": "delivered" if success else "failed",
            "delivery_status": notification.delivery_status,
        }

    @classmethod
    def send_reminder_notification(cls, reminder: Reminder) -> NotificationHistory | None:
        """Create an archived notification and dispatch push for a due hearing reminder."""
        advocate = reminder.advocate
        case = reminder.case
        hearing = reminder.hearing

        pref = getattr(advocate, "reminder_preferences", None)
        if pref and not pref.push_notifications:
            logger.info(
                "Push notifications disabled in preferences for advocate %s", advocate.username
            )
            return None

        case_ref = (
            f"{case.case_type} {case.case_number}/{case.filing_year}" if case else "Court Matter"
        )
        time_text = (
            f" at {hearing.hearing_time.strftime('%I:%M %p')}"
            if hearing and hearing.hearing_time
            else " (Morning Session)"
        )
        date_text = hearing.hearing_date.strftime("%d %b %Y") if hearing else "Upcoming"

        title = "Upcoming Hearing Reminder"
        body = f"Listed appearance for {case_ref} on {date_text}{time_text}."
        if hearing and hearing.court_hall_number:
            body += f" Court Hall {hearing.court_hall_number}."

        existing_notification = NotificationHistory.objects.filter(
            user=advocate,
            category="REMINDER",
            data_payload__reminder_id=reminder.id,
        ).first()

        if existing_notification:
            notification = existing_notification
            existing_payload = notification.data_payload or {}
            if (
                existing_payload.get("delivery_status") == "FAILED"
                and existing_payload.get("retry_count", 0) < cls.MAX_RETRIES
            ):
                cls.dispatch_notification_to_devices(notification, raise_on_error=True)
        else:
            notification = NotificationHistory.objects.create(
                user=advocate,
                title=title,
                body=body,
                category="REMINDER",
                data_payload={
                    "reminder_id": reminder.id,
                    "case_id": case.id if case else None,
                    "hearing_id": hearing.id if hearing else None,
                    "sent_at": timezone.now().isoformat(),
                    "delivery_status": "PENDING",
                    "retry_count": 0,
                    "max_retries": cls.MAX_RETRIES,
                },
            )
            cls.dispatch_notification_to_devices(notification, raise_on_error=True)
            try:
                from .realtime import RealtimeService

                RealtimeService.publish_notification_event(notification)
                RealtimeService.publish_event(
                    advocate,
                    "REMINDER_DUE",
                    {
                        "reminder_id": reminder.id,
                        "case_id": case.id if case else None,
                        "hearing_id": hearing.id if hearing else None,
                        "title": title,
                        "body": body,
                    },
                )
            except Exception as exc:
                logger.warning("Failed to emit reminder_due realtime event: %s", exc)

        return notification

    @classmethod
    def send_rescheduled_notification(
        cls,
        hearing: Hearing,
        old_date: Any,
        new_date: Any,
        advocate: Any,
        old_time: Any | None = None,
        new_time: Any | None = None,
    ) -> NotificationHistory | None:
        """Notify advocate when a hearing appearance has been rescheduled."""
        pref = getattr(advocate, "reminder_preferences", None)
        if pref:
            if not pref.push_notifications or not getattr(
                pref, "hearing_change_push_notifications", True
            ):
                logger.info(
                    "Hearing rescheduled notification suppressed by preferences for advocate %s",
                    advocate.username,
                )
                return None

        case = hearing.case
        case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"
        title = f"Hearing Rescheduled: {case_ref}"
        time_info = f" at {new_time}" if new_time else ""
        reason_info = f" ({hearing.rescheduled_reason})" if hearing.rescheduled_reason else ""
        body = f"Hearing appearance for {case_ref} rescheduled from {old_date} to {new_date}{time_info}.{reason_info}"

        existing_notification = NotificationHistory.objects.filter(
            user=advocate,
            category="REMINDER",
            data_payload__hearing_id=hearing.id,
            data_payload__new_date=str(new_date),
        ).first()

        if existing_notification:
            notification = existing_notification
            existing_payload = notification.data_payload or {}
            if (
                existing_payload.get("delivery_status") == "FAILED"
                and existing_payload.get("retry_count", 0) < cls.MAX_RETRIES
            ):
                cls.dispatch_notification_to_devices(notification, raise_on_error=False)
        else:
            notification = NotificationHistory.objects.create(
                user=advocate,
                title=title,
                body=body,
                category="REMINDER",
                data_payload={
                    "case_id": case.id,
                    "hearing_id": hearing.id,
                    "old_date": str(old_date),
                    "new_date": str(new_date),
                    "old_time": str(old_time) if old_time else None,
                    "new_time": str(new_time) if new_time else None,
                    "reason": hearing.rescheduled_reason,
                    "sent_at": timezone.now().isoformat(),
                    "delivery_status": "PENDING",
                    "retry_count": 0,
                    "max_retries": cls.MAX_RETRIES,
                },
            )
            cls.dispatch_notification_to_devices(notification, raise_on_error=False)

        return notification

    @classmethod
    def send_judgment_notification(
        cls,
        judgment: Judgment,
        is_new: bool = True,
        document_uploaded: bool = False,
        changed_by: Any | None = None,
    ) -> list[NotificationHistory]:
        """Dispatch push notifications to all advocates tracking the case when a judgment or order is posted."""
        case = judgment.case
        advocates = list(case.tracked_by.all())
        if not advocates:
            return []

        case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"
        event_tag = (
            "DOCUMENT_UPLOADED" if document_uploaded else ("PRONOUNCED" if is_new else "UPDATED")
        )

        if document_uploaded:
            title = f"Order Document Available: {case_ref}"
            body = (
                f"Certified order document has been uploaded for {case_ref} "
                f"(Judgment dated {judgment.judgment_date})."
            )
        elif is_new:
            bench_text = f" by {judgment.bench}" if judgment.bench else ""
            order_text = f" Order #{judgment.order_number}." if judgment.order_number else ""
            title = f"Judgment Pronounced: {case_ref}"
            body = f"Judgment pronounced on {judgment.judgment_date}{bench_text} for {case_ref}.{order_text}"
        else:
            title = f"Judgment Details Updated: {case_ref}"
            body = f"Judgment record dated {judgment.judgment_date} updated for {case_ref}."

        created_notifications: list[NotificationHistory] = []
        for advocate in advocates:
            pref = getattr(advocate, "reminder_preferences", None)
            if pref:
                if not pref.push_notifications or not getattr(
                    pref, "judgment_push_notifications", True
                ):
                    logger.info(
                        "Judgment notifications suppressed by preferences for advocate %s",
                        advocate.username,
                    )
                    continue

            existing_query = NotificationHistory.objects.filter(
                user=advocate,
                category="JUDGMENT",
                data_payload__judgment_id=judgment.id,
                data_payload__event=event_tag,
            )
            if document_uploaded:
                existing_query = existing_query.filter(
                    data_payload__document_link=judgment.document_link or ""
                )
            elif not is_new:
                existing_query = existing_query.filter(
                    data_payload__order_number=judgment.order_number or "",
                    data_payload__judgment_date=str(judgment.judgment_date),
                )

            existing = existing_query.first()
            if existing:
                existing_payload = existing.data_payload or {}
                if (
                    existing_payload.get("delivery_status") == "FAILED"
                    and existing_payload.get("retry_count", 0) < cls.MAX_RETRIES
                ):
                    cls.dispatch_notification_to_devices(existing, raise_on_error=False)
                created_notifications.append(existing)
                continue

            notification = NotificationHistory.objects.create(
                user=advocate,
                title=title,
                body=body,
                category="JUDGMENT",
                data_payload={
                    "case_id": case.id,
                    "judgment_id": judgment.id,
                    "judgment_date": str(judgment.judgment_date),
                    "judgment_type": judgment.judgment_type,
                    "order_number": judgment.order_number or "",
                    "has_document": bool(judgment.document_link),
                    "document_link": judgment.document_link or "",
                    "event": event_tag,
                    "sent_at": timezone.now().isoformat(),
                    "delivery_status": "PENDING",
                    "retry_count": 0,
                    "max_retries": cls.MAX_RETRIES,
                },
            )

            cls.dispatch_notification_to_devices(notification, raise_on_error=False)
            try:
                from .realtime import RealtimeService

                RealtimeService.publish_notification_event(notification)
            except Exception as exc:
                logger.warning("Failed to emit notification_created realtime event: %s", exc)

            created_notifications.append(notification)

        try:
            from .realtime import RealtimeService

            RealtimeService.publish_judgment_event(
                judgment, is_new=is_new, document_uploaded=document_uploaded
            )
        except Exception as exc:
            logger.warning("Failed to emit judgment realtime event: %s", exc)

        return created_notifications

    @classmethod
    def send_hearing_change_notification(
        cls,
        hearing: Hearing,
        change_type: str,
        details: dict | None = None,
        advocates: list[Any] | None = None,
        changed_by: Any | None = None,
    ) -> list[NotificationHistory]:
        """Dispatch push notifications to tracking advocates when a hearing status or parameter changes."""
        case = hearing.case
        target_advocates = advocates if advocates is not None else list(case.tracked_by.all())
        if not target_advocates:
            return []

        case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"
        dtls = details or {}

        if change_type == "RESCHEDULED":
            old_str = dtls.get("old_date", "")
            if dtls.get("old_time"):
                old_str += f" {dtls.get('old_time')}"
            new_str = dtls.get("new_date", str(hearing.hearing_date))
            if dtls.get("new_time"):
                new_str += f" {dtls.get('new_time')}"
            reason_str = f" ({dtls.get('reason')})" if dtls.get("reason") else ""
            title = f"Hearing Rescheduled: {case_ref}"
            body = f"Hearing for {case_ref} rescheduled from {old_str} to {new_str}.{reason_str}"
        elif change_type == "ADJOURNED":
            next_date = dtls.get("next_date") or hearing.next_date
            next_str = f" Next date posted to {next_date}." if next_date else " Matter adjourned."
            title = f"Matter Adjourned: {case_ref}"
            body = (
                f"Hearing appearance for {case_ref} on {hearing.hearing_date} adjourned.{next_str}"
            )
        elif change_type == "CANCELLED":
            title = f"Hearing Cancelled: {case_ref}"
            body = f"Scheduled hearing appearance for {case_ref} on {hearing.hearing_date} has been cancelled."
        elif change_type == "COURT_HALL_CHANGED":
            hall_info = f"Court Hall {hearing.court_hall_number or '—'}"
            item_info = f", Item #{hearing.item_number}" if hearing.item_number else ""
            title = f"Court Hall Updated: {case_ref}"
            body = f"Hearing for {case_ref} on {hearing.hearing_date} relocated to {hall_info}{item_info}."
        elif change_type == "PROCEEDINGS_RECORDED":
            title = f"Proceedings Recorded: {case_ref}"
            proceedings_text = (
                hearing.business_conducted[:150]
                if hearing.business_conducted
                else "Orders entered."
            )
            body = f"Hearing proceedings recorded for {case_ref}: {proceedings_text}"
        else:
            title = f"Hearing Updated: {case_ref}"
            body = f"Hearing on {hearing.hearing_date} for {case_ref} has been updated."

        created_notifications: list[NotificationHistory] = []
        for advocate in target_advocates:
            pref = getattr(advocate, "reminder_preferences", None)
            if pref:
                if not pref.push_notifications or not getattr(
                    pref, "hearing_change_push_notifications", True
                ):
                    logger.info(
                        "Hearing change notifications suppressed by preferences for advocate %s",
                        advocate.username,
                    )
                    continue

            existing_query = NotificationHistory.objects.filter(
                user=advocate,
                category="HEARING_CHANGE",
                data_payload__hearing_id=hearing.id,
                data_payload__change_type=change_type,
            )
            if change_type == "RESCHEDULED":
                existing_query = existing_query.filter(
                    data_payload__new_date=str(dtls.get("new_date", hearing.hearing_date))
                )
            elif change_type == "COURT_HALL_CHANGED":
                existing_query = existing_query.filter(
                    data_payload__court_hall_number=hearing.court_hall_number or "",
                    data_payload__item_number=hearing.item_number or "",
                )
            elif change_type == "ADJOURNED":
                existing_query = existing_query.filter(
                    data_payload__next_date=str(dtls.get("next_date", hearing.next_date or ""))
                )
            elif change_type == "PROCEEDINGS_RECORDED":
                existing_query = existing_query.filter(
                    data_payload__business_conducted=hearing.business_conducted or ""
                )

            existing = existing_query.first()
            if existing:
                existing_payload = existing.data_payload or {}
                if (
                    existing_payload.get("delivery_status") == "FAILED"
                    and existing_payload.get("retry_count", 0) < cls.MAX_RETRIES
                ):
                    cls.dispatch_notification_to_devices(existing, raise_on_error=False)
                created_notifications.append(existing)
                continue

            notification = NotificationHistory.objects.create(
                user=advocate,
                title=title,
                body=body,
                category="HEARING_CHANGE",
                data_payload={
                    "case_id": case.id,
                    "hearing_id": hearing.id,
                    "change_type": change_type,
                    "hearing_date": str(hearing.hearing_date),
                    "old_date": str(dtls.get("old_date", "")),
                    "new_date": str(dtls.get("new_date", hearing.hearing_date)),
                    "court_hall_number": hearing.court_hall_number or "",
                    "item_number": hearing.item_number or "",
                    "next_date": str(hearing.next_date or ""),
                    "status": hearing.status,
                    "business_conducted": hearing.business_conducted or "",
                    "sent_at": timezone.now().isoformat(),
                    "delivery_status": "PENDING",
                    "retry_count": 0,
                    "max_retries": cls.MAX_RETRIES,
                },
            )

            cls.dispatch_notification_to_devices(notification, raise_on_error=False)
            try:
                from .realtime import RealtimeService

                RealtimeService.publish_notification_event(notification)
            except Exception as exc:
                logger.warning("Failed to emit notification_created realtime event: %s", exc)

            created_notifications.append(notification)

        try:
            from .realtime import RealtimeService

            RealtimeService.publish_hearing_change(
                hearing,
                change_type=change_type,
                details=dtls,
                advocates=target_advocates,
            )
        except Exception as exc:
            logger.warning("Failed to emit hearing_change realtime event: %s", exc)

        return created_notifications
