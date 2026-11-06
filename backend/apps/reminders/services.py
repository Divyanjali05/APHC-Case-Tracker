from __future__ import annotations

import datetime
import logging
from typing import TYPE_CHECKING, Any

from django.db import IntegrityError, models, transaction
from django.utils import timezone

from apps.cases.history_service import CaseHistoryService
from apps.notifications.services import NotificationService

from .models import Reminder, ReminderPreference

if TYPE_CHECKING:
    from apps.cases.models import Hearing

logger = logging.getLogger(__name__)


class ReminderService:
    """Service handling hearing reminder generation, scheduling, and rescheduling workflows."""

    DEFAULT_HEARING_TIME = datetime.time(10, 30)
    MAX_RETRIES = 3

    @classmethod
    def get_or_create_preferences(cls, advocate: Any) -> ReminderPreference:
        """Fetch or create default reminder preferences for the advocate."""
        pref, _ = ReminderPreference.objects.get_or_create(
            advocate=advocate,
            defaults={
                "remind_24h_before": True,
                "remind_1h_before": True,
                "email_notifications": False,
                "push_notifications": True,
            },
        )
        return pref

    @classmethod
    def get_hearing_datetime(cls, hearing: Hearing) -> datetime.datetime:
        """Combine hearing date and time into a timezone-aware datetime."""
        h_time = hearing.hearing_time or cls.DEFAULT_HEARING_TIME
        combined = datetime.datetime.combine(hearing.hearing_date, h_time)
        current_tz = timezone.get_current_timezone()
        if timezone.is_naive(combined):
            return timezone.make_aware(combined, current_tz)
        return combined

    @classmethod
    def schedule_hearing_reminders(
        cls,
        hearing: Hearing,
        advocate: Any | None = None,
    ) -> list[Reminder]:
        """Create pending reminder records for upcoming hearings based on advocate preferences.

        Idempotent: will not create duplicate reminders for the same hearing and interval.
        Safely ignores completed, cancelled, or past hearings.
        """
        if hearing.status in ("COMPLETED", "CANCELLED"):
            logger.info(
                "Skipping reminder scheduling for %s hearing %s", hearing.status, hearing.id
            )
            return []

        hearing_dt = cls.get_hearing_datetime(hearing)
        now = timezone.now()

        # If hearing is already in the past, do not schedule future reminders
        if hearing_dt <= now:
            return []

        case = hearing.case
        advocates = [advocate] if advocate else list(case.tracked_by.all())
        created_reminders = []

        case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"

        for adv in advocates:
            pref = cls.get_or_create_preferences(adv)

            # Friday reminder for Monday hearings (72 hours prior)
            # Monday is weekday() == 0
            if hearing.hearing_date.weekday() == 0:
                due_friday = hearing_dt - datetime.timedelta(days=3)
                if due_friday > now:
                    exists_friday = Reminder.objects.filter(
                        advocate=adv,
                        hearing=hearing,
                        reminder_interval_hours=72,
                        due_date=due_friday,
                        status__in=["PENDING", "PROCESSING", "SENT"],
                    ).exists()
                    if not exists_friday:
                        try:
                            reminder_friday = Reminder.objects.create(
                                advocate=adv,
                                case=case,
                                hearing=hearing,
                                title=f"Friday Hearing Reminder: {case_ref}",
                                description=(
                                    f"Upcoming Monday court appearance for {case_ref} on {hearing.hearing_date} "
                                    f"{f'at {hearing.hearing_time}' if hearing.hearing_time else 'at 10:30 AM'} "
                                    f"in Court Hall {hearing.court_hall_number or 'Unassigned'}."
                                ),
                                reminder_type="HEARING",
                                reminder_interval_hours=72,
                                due_date=due_friday,
                                status="PENDING",
                            )
                            created_reminders.append(reminder_friday)
                        except IntegrityError:
                            logger.info(
                                "Concurrent Friday reminder creation caught for hearing %s",
                                hearing.id,
                            )

            # 24-hour reminder interval
            if pref.remind_24h_before:
                due_24h = hearing_dt - datetime.timedelta(hours=24)
                if due_24h > now:
                    exists = Reminder.objects.filter(
                        advocate=adv,
                        hearing=hearing,
                        reminder_interval_hours=24,
                        due_date=due_24h,
                        status__in=["PENDING", "PROCESSING", "SENT"],
                    ).exists()
                    if not exists:
                        try:
                            reminder_24 = Reminder.objects.create(
                                advocate=adv,
                                case=case,
                                hearing=hearing,
                                title=f"Hearing in 24 Hours: {case_ref}",
                                description=(
                                    f"Appearance scheduled for {hearing.hearing_date} "
                                    f"{f'at {hearing.hearing_time}' if hearing.hearing_time else 'at 10:30 AM'} "
                                    f"in Court Hall {hearing.court_hall_number or 'Unassigned'}."
                                ),
                                reminder_type="HEARING",
                                reminder_interval_hours=24,
                                due_date=due_24h,
                                status="PENDING",
                            )
                            created_reminders.append(reminder_24)
                        except IntegrityError:
                            logger.info(
                                "Concurrent 24h reminder creation caught for hearing %s", hearing.id
                            )

            # 1-hour reminder interval
            if pref.remind_1h_before:
                due_1h = hearing_dt - datetime.timedelta(hours=1)
                if due_1h > now:
                    exists = Reminder.objects.filter(
                        advocate=adv,
                        hearing=hearing,
                        reminder_interval_hours=1,
                        due_date=due_1h,
                        status__in=["PENDING", "PROCESSING", "SENT"],
                    ).exists()
                    if not exists:
                        try:
                            reminder_1 = Reminder.objects.create(
                                advocate=adv,
                                case=case,
                                hearing=hearing,
                                title=f"Hearing in 1 Hour: {case_ref}",
                                description=(
                                    f"Court session commencing soon for {case_ref}. "
                                    f"Court Hall {hearing.court_hall_number or 'Unassigned'}, "
                                    f"Item #{hearing.item_number or '—'}."
                                ),
                                reminder_type="HEARING",
                                reminder_interval_hours=1,
                                due_date=due_1h,
                                status="PENDING",
                            )
                            created_reminders.append(reminder_1)
                        except IntegrityError:
                            logger.info(
                                "Concurrent 1h reminder creation caught for hearing %s", hearing.id
                            )

        return created_reminders

    @classmethod
    def cancel_pending_hearing_reminders(
        cls,
        hearing: Hearing,
        reason: str = "Hearing rescheduled",
    ) -> int:
        """Invalidate obsolete pending, processing, or failed reminders for rescheduled hearing."""
        count = Reminder.objects.filter(
            hearing=hearing,
            status__in=["PENDING", "PROCESSING", "FAILED"],
        ).update(
            status="CANCELLED",
            description=reason,
            updated_at=timezone.now(),
        )
        logger.info("Cancelled %d obsolete pending reminders for hearing %s", count, hearing.id)
        return count

    @classmethod
    def process_due_reminders(cls) -> int:
        """Idempotent scheduled processor executed by Celery Beat to dispatch due notifications.

        Uses select_for_update(skip_locked=True) to prevent concurrent workers from processing
        the same reminder.
        Handles failed deliveries with retry counters and separate FAILED state.
        Ensures idempotent notification creation.
        """
        now = timezone.now()

        # Step 1: Concurrency-safe selection using select_for_update(skip_locked=True)
        with transaction.atomic():
            due_reminders = list(
                Reminder.objects.select_for_update(skip_locked=True)
                .filter(
                    models.Q(status="PENDING") | models.Q(status="FAILED"),
                    due_date__lte=now,
                    is_completed=False,
                    retry_count__lt=cls.MAX_RETRIES,
                )
                .select_related("advocate", "case", "hearing")
            )
            for r in due_reminders:
                r.status = "PROCESSING"
                r.save(update_fields=["status", "updated_at"])

        processed_count = 0
        for reminder in due_reminders:
            hearing = reminder.hearing
            # Safety check: if hearing has been cancelled or completed since reminder was scheduled
            if hearing and hearing.status in ("COMPLETED", "CANCELLED"):
                reminder.status = "CANCELLED"
                reminder.save(update_fields=["status", "updated_at"])
                continue

            try:
                NotificationService.send_reminder_notification(reminder)
                reminder.status = "SENT"
                reminder.notification_sent_at = timezone.now()
                reminder.save(update_fields=["status", "notification_sent_at", "updated_at"])
                processed_count += 1
            except Exception as exc:
                reminder.retry_count += 1
                reminder.status = "FAILED"
                reminder.save(update_fields=["status", "retry_count", "updated_at"])
                logger.error(
                    "Failed to process reminder %s (attempt %d/%d): %s",
                    reminder.id,
                    reminder.retry_count,
                    cls.MAX_RETRIES,
                    exc,
                )

        return processed_count

    @classmethod
    @transaction.atomic
    def reschedule_hearing(
        cls,
        hearing: Hearing,
        new_date: datetime.date | str,
        new_time: datetime.time | str | None = None,
        reason: str = "",
        court_hall_number: int | None = None,
        item_number: int | None = None,
        changed_by: Any | None = None,
    ) -> Hearing:
        """Securely reschedule a hearing appearance.

        - Preserves previous hearing date and time.
        - Updates hearing date, time, and status to RESCHEDULED.
        - Records audit event in CaseHistoryService with HEARING_RESCHEDULED.
        - Invalidates obsolete pending reminders.
        - Schedules fresh reminders for the updated date/time.
        - Dispatches notifications to assigned advocates.
        """
        old_date = hearing.hearing_date
        old_time = hearing.hearing_time

        # Convert string date to datetime.date if needed
        if isinstance(new_date, str):
            new_date = datetime.date.fromisoformat(new_date)

        # Convert string time to datetime.time if needed
        if isinstance(new_time, str):
            try:
                new_time = datetime.time.fromisoformat(new_time)
            except ValueError:
                new_time = cls.DEFAULT_HEARING_TIME

        # Store prior values
        hearing.previous_hearing_date = old_date
        hearing.previous_hearing_time = old_time
        hearing.hearing_date = new_date
        if new_time is not None:
            hearing.hearing_time = new_time
        if court_hall_number is not None:
            hearing.court_hall_number = court_hall_number
        if item_number is not None:
            hearing.item_number = item_number

        hearing.status = "RESCHEDULED"
        hearing.rescheduled_reason = reason or "Court calendar adjournment"
        hearing.save()

        # Update case's next hearing date
        case = hearing.case
        case.next_hearing_date = new_date
        case.save(update_fields=["next_hearing_date", "updated_at"])

        # 1. Cancel obsolete reminders
        cls.cancel_pending_hearing_reminders(
            hearing,
            reason=f"Obsolete: appearance rescheduled to {new_date}",
        )

        # 2. Record audit history in CaseHistoryService
        old_val_str = f"{old_date}{f' {old_time}' if old_time else ''}"
        new_val_str = f"{new_date}{f' {new_time}' if new_time else ''}"
        desc = (
            f"Hearing appearance rescheduled from {old_val_str} to {new_val_str}."
            f"{f' Reason: {reason}.' if reason else ''}"
        )
        CaseHistoryService.record_event(
            case=case,
            event_type="HEARING_RESCHEDULED",
            field_name="hearing_date",
            old_value=old_val_str,
            new_value=new_val_str,
            description=desc,
            source="MANUAL" if changed_by else "SYSTEM",
            changed_by=changed_by,
        )

        # 3. Schedule fresh reminders for the updated schedule
        cls.schedule_hearing_reminders(hearing)

        # 4. Notify advocate(s)
        for adv in case.tracked_by.all():
            NotificationService.send_rescheduled_notification(
                hearing=hearing,
                old_date=old_date,
                new_date=new_date,
                advocate=adv,
                old_time=old_time,
                new_time=new_time,
            )

        return hearing
