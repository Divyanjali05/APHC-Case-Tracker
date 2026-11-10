"""Celery background tasks for Agenda and Calendar Synchronization."""

from __future__ import annotations

import logging
from typing import Any

from celery import shared_task
from django.contrib.auth import get_user_model

from apps.agenda.models import CalendarSyncSetting
from apps.agenda.sync_service import CalendarSyncService

logger = logging.getLogger(__name__)
User = get_user_model()


@shared_task(name="agenda.sync_external_calendars")
def sync_external_calendars(advocate_id: int | None = None) -> dict[str, Any]:
    """Background task to synchronize calendars for one or all enabled advocates."""
    if advocate_id is not None:
        try:
            advocate = User.objects.get(id=advocate_id)
            result = CalendarSyncService.sync_external_calendar(advocate)
            return {"advocate_id": advocate_id, "result": result}
        except User.DoesNotExist:
            logger.warning(f"Advocate {advocate_id} does not exist for calendar sync task.")
            return {"advocate_id": advocate_id, "error": "Advocate not found"}

    # Periodic/batch sync for all enabled accounts
    enabled_settings = CalendarSyncSetting.objects.filter(sync_enabled=True).select_related(
        "advocate"
    )
    total_synced = 0
    errors = 0

    for setting in enabled_settings:
        try:
            res = CalendarSyncService.sync_external_calendar(setting.advocate)
            if res.get("status") == "SUCCESS":
                total_synced += 1
            else:
                errors += 1
        except Exception as exc:
            logger.error(f"Error syncing calendar for advocate {setting.advocate_id}: {exc}")
            errors += 1

    return {"processed": len(enabled_settings), "successful": total_synced, "errors": errors}
