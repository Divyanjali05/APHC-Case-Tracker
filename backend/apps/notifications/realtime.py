from __future__ import annotations

import json
import logging
import secrets
import time
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from .models import RealtimeEvent

if TYPE_CHECKING:
    from apps.cases.models import Hearing, Judgment
    from apps.court_data.models import CourtStatusObservation
    from apps.notifications.models import NotificationHistory

logger = logging.getLogger(__name__)


class RealtimeService:
    """Service for publishing, buffering, and streaming in-app real-time events.

    Provides monotonic cursor-based catch-up for reconnects and offline clients
    with strict advocate isolation.
    """

    STREAM_TICKET_TTL_SECONDS = 60
    RETENTION_DAYS = 30

    _redis_client: Any | None = None
    _redis_last_check: float = 0.0
    _redis_is_available: bool = False

    @classmethod
    def generate_stream_ticket(cls, user: Any) -> str:
        """Generate a cryptographically secure, single-use stream ticket valid for 60s."""
        ticket = secrets.token_urlsafe(32)
        cache_key = f"realtime_ticket:{ticket}"
        cache.set(cache_key, user.id, timeout=cls.STREAM_TICKET_TTL_SECONDS)
        return ticket

    @classmethod
    def consume_stream_ticket(cls, ticket: str) -> Any | None:
        """Atomically validate and consume a single-use stream ticket."""
        if not ticket or not isinstance(ticket, str) or len(ticket) < 16:
            return None
        cache_key = f"realtime_ticket:{ticket}"
        user_id = cache.get(cache_key)
        if not user_id:
            return None
        # Consume immediately (single-use guarantee)
        cache.delete(cache_key)

        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            return User.objects.filter(id=user_id, is_active=True).first()
        except Exception:
            return None

    @classmethod
    def get_redis_client(cls) -> Any | None:
        """Attempt to get an active Redis client for pub/sub if configured."""
        now = time.time()
        if now - cls._redis_last_check < 15.0:
            return cls._redis_client if cls._redis_is_available else None

        cls._redis_last_check = now
        redis_url = getattr(settings, "REDIS_CACHE_URL", None) or getattr(
            settings, "CELERY_BROKER_URL", None
        )
        if not redis_url or not redis_url.startswith("redis://"):
            cls._redis_is_available = False
            return None
        try:
            import redis

            client = redis.from_url(redis_url, socket_timeout=0.1)
            client.ping()
            cls._redis_client = client
            cls._redis_is_available = True
            return client
        except Exception as exc:
            cls._redis_is_available = False
            cls._redis_client = None
            logger.debug("Redis client unavailable for real-time pub/sub: %s", exc)
            return None

    @classmethod
    def publish_event(
        cls,
        user: Any,
        event_type: str,
        payload: dict[str, Any],
    ) -> RealtimeEvent:
        """Publish a real-time event for an advocate, storing in DB and emitting to Redis pub/sub."""
        event = RealtimeEvent.objects.create(
            user=user,
            event_type=event_type,
            payload=payload,
        )

        def _broadcast():
            try:
                r = cls.get_redis_client()
                if r is not None:
                    channel = f"realtime:user:{user.id}"
                    message = json.dumps(
                        {
                            "id": event.id,
                            "event_uuid": str(event.event_uuid),
                            "event_type": event.event_type,
                            "payload": event.payload,
                            "created_at": event.created_at.isoformat(),
                        }
                    )
                    r.publish(channel, message)
            except Exception as exc:
                logger.warning("Failed to publish real-time event to Redis pub/sub: %s", exc)

        transaction.on_commit(_broadcast)

        logger.info(
            "Published real-time event [%s] #%d for advocate %s",
            event_type,
            event.id,
            user.username,
        )
        return event

    @classmethod
    def get_events_since(
        cls,
        user: Any,
        since_id: int = 0,
        limit: int = 50,
    ) -> list[RealtimeEvent]:
        """Retrieve missed events for advocate strictly after since_id cursor in chronological order."""
        return list(RealtimeEvent.objects.filter(user=user, id__gt=since_id).order_by("id")[:limit])

    @classmethod
    def get_latest_event_id(cls, user: Any) -> int:
        """Get latest monotonic event ID for advocate cursor initialization."""
        latest = (
            RealtimeEvent.objects.filter(user=user)
            .order_by("-id")
            .values_list("id", flat=True)
            .first()
        )
        return latest or 0

    @classmethod
    def get_oldest_event_id(cls, user: Any) -> int | None:
        """Get oldest available event ID for advocate to detect expired/pruned cursors."""
        return (
            RealtimeEvent.objects.filter(user=user)
            .order_by("id")
            .values_list("id", flat=True)
            .first()
        )

    @classmethod
    def prune_expired_events(cls, days: int = RETENTION_DAYS) -> int:
        """Prune real-time event logs older than retention period (default 30 days)."""
        cutoff = timezone.now() - timedelta(days=days)
        deleted_count, _ = RealtimeEvent.objects.filter(created_at__lt=cutoff).delete()
        logger.info(
            "Pruned %d expired RealtimeEvent records older than %d days", deleted_count, days
        )
        return deleted_count

    @classmethod
    def format_sse_frame(cls, event: RealtimeEvent) -> str:
        """Format a RealtimeEvent into standard Server-Sent Events (SSE) wire protocol."""
        data = {
            "id": event.id,
            "event_uuid": str(event.event_uuid),
            "event_type": event.event_type,
            "payload": event.payload,
            "created_at": event.created_at.isoformat(),
        }
        return f"id: {event.id}\nevent: {event.event_type}\ndata: {json.dumps(data)}\n\n"

    @classmethod
    def format_sse_ping(cls) -> str:
        """Format an SSE heartbeat ping frame to keep persistent connections alive."""
        data = {"time": timezone.now().isoformat()}
        return f"event: ping\ndata: {json.dumps(data)}\n\n"

    # Domain-specific event publishers:

    @classmethod
    def publish_court_token_update(
        cls,
        case: Any,
        observation: CourtStatusObservation,
    ) -> list[RealtimeEvent]:
        """Publish real-time token and stage update to all advocates tracking the case."""
        advocates = list(case.tracked_by.all())
        if not advocates:
            return []

        court_hall = getattr(
            observation, "court_hall", getattr(observation, "court_hall_number", None)
        )
        status_val = getattr(observation, "normalized_status", getattr(observation, "status", ""))
        safe_meta = getattr(observation, "safe_metadata", {}) or {}
        stage_val = safe_meta.get("stage") or getattr(observation, "stage", "")
        bench_sitting = safe_meta.get("is_bench_sitting")
        if bench_sitting is None:
            bench_sitting = getattr(observation, "is_bench_sitting", True)

        payload = {
            "case_id": case.id,
            "case_number": f"{case.case_type} {case.case_number}/{case.filing_year}",
            "court_hall_number": court_hall,
            "token_number": observation.token_number,
            "status": status_val,
            "stage": stage_val,
            "is_bench_sitting": bench_sitting,
            "observed_at": observation.observed_at.isoformat()
            if hasattr(observation.observed_at, "isoformat")
            else str(observation.observed_at),
        }

        events = []
        for advocate in advocates:
            events.append(cls.publish_event(advocate, "COURT_TOKEN_UPDATED", payload))
        return events

    @classmethod
    def publish_judgment_event(
        cls,
        judgment: Judgment,
        is_new: bool = True,
        document_uploaded: bool = False,
    ) -> list[RealtimeEvent]:
        """Publish real-time judgment pronouncement or document upload to all advocates tracking the case."""
        case = judgment.case
        advocates = list(case.tracked_by.all())
        if not advocates:
            return []

        event_type = (
            "JUDGMENT_DOCUMENT_UPLOADED"
            if document_uploaded
            else ("JUDGMENT_PRONOUNCED" if is_new else "JUDGMENT_PRONOUNCED")
        )
        payload = {
            "judgment_id": judgment.id,
            "case_id": case.id,
            "case_number": f"{case.case_type} {case.case_number}/{case.filing_year}",
            "judgment_date": str(judgment.judgment_date),
            "judgment_type": judgment.judgment_type,
            "order_number": judgment.order_number or "",
            "document_link": judgment.document_link or "",
            "has_document": bool(judgment.document_link),
            "event": "DOCUMENT_UPLOADED"
            if document_uploaded
            else ("PRONOUNCED" if is_new else "UPDATED"),
        }

        events = []
        for advocate in advocates:
            events.append(cls.publish_event(advocate, event_type, payload))
        return events

    @classmethod
    def publish_hearing_change(
        cls,
        hearing: Hearing,
        change_type: str,
        details: dict[str, Any] | None = None,
        advocates: list[Any] | None = None,
    ) -> list[RealtimeEvent]:
        """Publish real-time hearing change or rescheduling event to tracking advocates."""
        case = hearing.case
        target_advocates = advocates if advocates is not None else list(case.tracked_by.all())
        if not target_advocates:
            return []

        event_type = "HEARING_RESCHEDULED" if change_type == "RESCHEDULED" else "HEARING_CHANGED"
        payload = {
            "hearing_id": hearing.id,
            "case_id": case.id,
            "case_number": f"{case.case_type} {case.case_number}/{case.filing_year}",
            "change_type": change_type,
            "hearing_date": str(hearing.hearing_date),
            "court_hall_number": hearing.court_hall_number,
            "item_number": hearing.item_number,
            "status": hearing.status,
            "details": details or {},
        }

        events = []
        for advocate in target_advocates:
            events.append(cls.publish_event(advocate, event_type, payload))
        return events

    @classmethod
    def publish_notification_event(
        cls,
        notification: NotificationHistory,
    ) -> RealtimeEvent:
        """Publish new archived notification to advocate's active session for immediate UI badging."""
        payload = {
            "notification_id": notification.id,
            "title": notification.title,
            "body": notification.body,
            "category": notification.category,
            "data_payload": notification.data_payload,
            "sent_at": notification.sent_at.isoformat(),
        }
        return cls.publish_event(notification.user, "NOTIFICATION_CREATED", payload)

    @classmethod
    def publish_notification_read(
        cls,
        user: Any,
        notification_ids: list[int],
        unread_count: int,
    ) -> RealtimeEvent:
        """Publish read-status update to sync unread badges across advocate's concurrent sessions."""
        payload = {
            "read_notification_ids": notification_ids,
            "unread_count": unread_count,
        }
        return cls.publish_event(user, "NOTIFICATION_READ", payload)
