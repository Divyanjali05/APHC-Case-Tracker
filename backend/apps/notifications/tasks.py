import logging
from typing import Any

from celery import shared_task

from .services import NotificationService

logger = logging.getLogger(__name__)


@shared_task(
    name="notifications.send_push_notification_task",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def send_push_notification_task(
    self: Any,
    notification_id: int,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Asynchronous Celery worker task to dispatch push notification with exponential backoff."""
    logger.info("Executing async push notification task for Notification ID=%s", notification_id)
    try:
        return NotificationService.process_async_push_delivery(
            notification_id=notification_id,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:
        logger.warning(
            "Async push delivery failure for Notification ID=%s: %s (attempt %d/%d)",
            notification_id,
            exc,
            self.request.retries + 1,
            self.max_retries,
        )
        countdown = 2 ** self.request.retries * 5
        raise self.retry(exc=exc, countdown=countdown) from exc


@shared_task(name="notifications.retry_failed_push_notifications")
def retry_failed_push_notifications() -> int:
    """Periodic Celery task scanning and retrying temporarily failed push notifications."""
    logger.info("Starting periodic retry job for failed push notifications.")
    recovered = NotificationService.retry_failed_notifications()
    logger.info("Completed failed push notification retry job. Recovered: %d", recovered)
    return recovered


@shared_task(name="notifications.prune_realtime_events")
def prune_realtime_events_task(days: int = 30) -> int:
    """Periodic Celery task pruning real-time event logs older than retention period."""
    from .realtime import RealtimeService

    logger.info(
        "Starting periodic retention prune for RealtimeEvent logs older than %d days.", days
    )
    deleted = RealtimeService.prune_expired_events(days=days)
    logger.info("Completed RealtimeEvent retention prune. Pruned records: %d", deleted)
    return deleted
