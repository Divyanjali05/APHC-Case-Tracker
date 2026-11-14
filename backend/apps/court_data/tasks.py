"""Celery tasks for scheduled court status synchronization."""

from __future__ import annotations

import logging

from celery import shared_task

from common.distributed_lock import DistributedLock, InsecureLockBackendError

from .services import CourtStatusSyncService

logger = logging.getLogger(__name__)

TASK_LOCK_KEY = "lock:court_data_sync_task"
# Lease TTL in seconds: short window for fast crash recovery (60s vs Celery Beat 300s schedule)
TASK_LOCK_LEASE_TTL = 60
# Alias preserved for backwards compatibility
TASK_LOCK_TIMEOUT_SECONDS = TASK_LOCK_LEASE_TTL
# Heartbeat interval: renews lease every 20s while the task is actively executing
TASK_LOCK_HEARTBEAT_INTERVAL = 20
# Safety cap: prevents zombie locks if worker process deadlocks indefinitely (30 minutes)
TASK_LOCK_MAX_DURATION = 1800


@shared_task(name="court_data.sync_tracked_case_statuses")
def sync_tracked_case_statuses() -> dict[str, int]:
    """Periodic Celery task synchronizing active court listings and token statuses for all tracked cases.

    Uses a renewable distributed cache lock with ownership verification.
    Guarantees:
    - Running synchronization tasks never lose their lock regardless of execution duration.
    - Each acquisition generates a unique UUID ownership token; workers never release another worker's lock.
    - Subsequent scheduled runs safely skip with skipped_due_to_overlap: 1 while a task is running.
    - Crashed or killed workers do not leave permanent locks; leases expire naturally after TASK_LOCK_LEASE_TTL.
    - Fails safely with clear diagnostics if an insecure backend or cache failure occurs.
    """
    try:
        lock = DistributedLock(
            key=TASK_LOCK_KEY,
            timeout=TASK_LOCK_LEASE_TTL,
            heartbeat_interval=TASK_LOCK_HEARTBEAT_INTERVAL,
            max_duration=TASK_LOCK_MAX_DURATION,
        )
    except InsecureLockBackendError as backend_err:
        logger.critical("Court status synchronization skipped: %s", backend_err)
        return {
            "total_cases": 0,
            "synced_count": 0,
            "changed_count": 0,
            "error_count": 1,
            "skipped_due_to_insecure_backend": 1,
        }

    try:
        acquired = lock.acquire()
    except Exception as exc:
        logger.error("Court status synchronization lock acquisition failed: %s", exc)
        return {
            "total_cases": 0,
            "synced_count": 0,
            "changed_count": 0,
            "error_count": 1,
            "skipped_due_to_backend_error": 1,
        }

    if not acquired:
        logger.warning(
            "Scheduled court status synchronization skipped: prior sync task is still running."
        )
        return {
            "total_cases": 0,
            "synced_count": 0,
            "changed_count": 0,
            "error_count": 0,
            "skipped_due_to_overlap": 1,
        }

    lock.start_heartbeat()
    try:
        logger.info("Starting scheduled court status and token alert synchronization.")
        results = CourtStatusSyncService.sync_all_tracked_cases(heartbeat_callback=lock.renew)
        logger.info(
            "Completed court status synchronization: %d total, %d synced, %d transitions, %d errors",
            results["total_cases"],
            results["synced_count"],
            results["changed_count"],
            results["error_count"],
        )
        return results
    finally:
        lock.release()
