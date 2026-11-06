import logging

from celery import shared_task

from .services import NotificationService

logger = logging.getLogger(__name__)


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
