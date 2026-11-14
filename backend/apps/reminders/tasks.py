import logging

from celery import shared_task

from .services import ReminderService

logger = logging.getLogger(__name__)


@shared_task(name="reminders.check_and_send_due_reminders")
def check_and_send_due_reminders() -> int:
    """Periodic task executed by Celery Beat to dispatch due hearing reminders."""
    logger.info("Starting scheduled due reminder dispatch job.")
    processed = ReminderService.process_due_reminders()
    logger.info("Completed reminder dispatch job. Total processed: %d", processed)
    return processed
