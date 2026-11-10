"""Celery background tasks for court token alert monitoring and status sync."""

from __future__ import annotations

import logging
from typing import Any

from celery import shared_task

from common.distributed_lock import DistributedLock, InsecureLockBackendError

from .services import TokenAlertSyncService

logger = logging.getLogger(__name__)

TASK_LOCK_KEY = "lock:token_alert_sync_task"
TASK_LOCK_LEASE_TTL = 60
TASK_LOCK_HEARTBEAT_INTERVAL = 20
TASK_LOCK_MAX_DURATION = 1800


@shared_task(name="tokens.sync_active_token_alerts")
def sync_active_token_alerts() -> dict[str, Any]:
    """Periodic Celery task synchronizing active token alerts against court hall board observations.

    Guarantees:
    - Distributed locking prevents concurrent worker overlap.
    - Idempotent alert dispatch guarantees advocates receive at most one alert per transition.
    - Gracefully handles cache/lock backend failures.
    """
    try:
        lock = DistributedLock(
            key=TASK_LOCK_KEY,
            timeout=TASK_LOCK_LEASE_TTL,
            heartbeat_interval=TASK_LOCK_HEARTBEAT_INTERVAL,
            max_duration=TASK_LOCK_MAX_DURATION,
        )
    except InsecureLockBackendError as backend_err:
        logger.critical("Token alert sync skipped due to insecure cache backend: %s", backend_err)
        return {
            "total_synced": 0,
            "approaching_alerts_dispatched": 0,
            "called_alerts_dispatched": 0,
            "stale_count": 0,
            "errors": 1,
            "skipped_due_to_insecure_backend": 1,
        }

    try:
        with lock:
            service = TokenAlertSyncService()
            result = service.sync_all_active_alerts()
            logger.info("Token alert sync completed: %s", result)
            return result
    except TimeoutError:
        logger.info("Token alert sync skipped: previous worker task is still executing.")
        return {
            "total_synced": 0,
            "approaching_alerts_dispatched": 0,
            "called_alerts_dispatched": 0,
            "stale_count": 0,
            "errors": 0,
            "skipped_due_to_overlap": 1,
        }
    except Exception as exc:
        logger.error("Unexpected error in sync_active_token_alerts: %s", exc, exc_info=True)
        return {
            "total_synced": 0,
            "approaching_alerts_dispatched": 0,
            "called_alerts_dispatched": 0,
            "stale_count": 0,
            "errors": 1,
            "last_error": str(exc),
        }
