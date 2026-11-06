"""Regression tests for distributed locking strategy and concurrency control in court status synchronization."""

from __future__ import annotations

import concurrent.futures
import os
import time
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.cache.backends.locmem import LocMemCache

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case
from apps.court_data.services import CourtStatusSyncService
from apps.court_data.tasks import (
    TASK_LOCK_HEARTBEAT_INTERVAL,
    TASK_LOCK_KEY,
    TASK_LOCK_LEASE_TTL,
    sync_tracked_case_statuses,
)
from common.distributed_lock import (
    DistributedLock,
    InsecureLockBackendError,
    LockAcquisitionError,
)

User = get_user_model()


def is_real_redis_available() -> bool:
    """Check if a real Redis instance is currently reachable."""
    try:
        import redis

        redis_url = os.environ.get("REDIS_URL") or os.environ.get(
            "CELERY_BROKER_URL", "redis://localhost:6379/0"
        )
        client = redis.Redis.from_url(redis_url, socket_timeout=1.0)
        return bool(client.ping())
    except Exception:
        return False


@pytest.fixture(autouse=True)
def clean_cache():
    """Ensure distributed lock cache key is clean before and after each test."""
    cache.delete(TASK_LOCK_KEY)
    cache.delete("test_lock_key")
    cache.delete("test_ownership_key")
    yield
    cache.delete(TASK_LOCK_KEY)
    cache.delete("test_lock_key")
    cache.delete("test_ownership_key")


@pytest.fixture
def tracked_case_fixture(db):
    """Create an advocate user with an actively tracked case for testing."""
    advocate = User.objects.create_user(
        username="lock_advocate",
        email="lock_advocate@aphc.gov.in",
        password="TestPassword123!",
        first_name="Lock",
        last_name="Advocate",
    )
    AdvocateProfile.objects.create(
        user=advocate,
        bar_council_enrollment_number="AP/8888/2026",
        role="ADVOCATE",
    )
    case = Case.objects.create(
        case_type="WP",
        case_number="7701",
        filing_year=2026,
        petitioner="Distributed Lock Petitioner",
        respondent="State of Andhra Pradesh",
        current_stage="HEARING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.mark.django_db
class TestDistributedLockRegression:
    """Comprehensive test suite verifying the 7 required distributed locking regression scenarios."""

    def test_scenario_1_normal_lock_acquisition_and_release(self, tracked_case_fixture):
        """1. Normal lock acquisition and release.

        Verifies that:
        - DistributedLock generates a unique ownership token and stores it in cache.
        - Lock release deletes the key when ownership matches.
        - Celery task completes end-to-end and cleans up the lock upon exit.
        """
        lock = DistributedLock("test_lock_key", timeout=30)
        assert lock.is_acquired is False
        assert cache.get("test_lock_key") is None

        # Direct acquisition
        acquired = lock.acquire()
        assert acquired is True
        assert lock.is_acquired is True
        assert cache.get("test_lock_key") == lock.token

        # Direct release
        released = lock.release()
        assert released is True
        assert lock.is_acquired is False
        assert cache.get("test_lock_key") is None

        # Full Celery task execution acquires and cleans up
        result = sync_tracked_case_statuses()
        assert result.get("skipped_due_to_overlap") is None
        assert result["synced_count"] >= 1
        assert cache.get(TASK_LOCK_KEY) is None

    def test_scenario_2_second_task_skipping_while_first_holds_lock(self, tracked_case_fixture):
        """2. A second task skipping while the first task holds the lock.

        Verifies that:
        - When a worker holds the distributed lock, a subsequent task skips execution.
        - Skipped task returns skipped_due_to_overlap: 1 and performs no mutations.
        - The first worker's lock remains undisturbed.
        """
        holder_lock = DistributedLock(TASK_LOCK_KEY, timeout=60, token="worker-1-active-token")
        assert holder_lock.acquire() is True
        assert cache.get(TASK_LOCK_KEY) == "worker-1-active-token"

        # Subsequent scheduled task fires while worker 1 is running
        skip_result = sync_tracked_case_statuses()

        assert skip_result["skipped_due_to_overlap"] == 1
        assert skip_result["total_cases"] == 0
        assert skip_result["synced_count"] == 0
        assert skip_result["changed_count"] == 0
        assert skip_result["error_count"] == 0

        # Worker 1 still retains its lock
        assert cache.get(TASK_LOCK_KEY) == "worker-1-active-token"
        assert holder_lock.release() is True
        assert cache.get(TASK_LOCK_KEY) is None

    def test_scenario_3_task_running_longer_than_original_290s_ttl(self, tracked_case_fixture):
        """3. A task running longer than the original 290-second TTL.

        Verifies that:
        - Renewable lease extension ensures a task running past 290s retains its lock.
        - Multiple renewal heartbeats extend the lock without changing the ownership token.
        - A competing task at t=300s (Celery Beat trigger) is safely rejected.
        - When the long task finishes (e.g. at virtual t=350s), it cleanly releases the lock.
        """
        worker_lock = DistributedLock(
            TASK_LOCK_KEY,
            timeout=TASK_LOCK_LEASE_TTL,
            heartbeat_interval=TASK_LOCK_HEARTBEAT_INTERVAL,
        )
        assert worker_lock.acquire() is True
        initial_token = worker_lock.token

        # Simulate progressive renewals across a long-running batch spanning 350 seconds
        simulated_elapsed_intervals = [60, 120, 180, 240, 290, 310, 350]
        for elapsed in simulated_elapsed_intervals:
            renewed = worker_lock.renew(extend_seconds=TASK_LOCK_LEASE_TTL)
            assert renewed is True, f"Failed renewal at simulated {elapsed}s"
            # Ownership token remains identical across renewals
            assert cache.get(TASK_LOCK_KEY) == initial_token

        # At t=300s (beyond original 290s TTL), next Celery Beat task attempts to run
        overlapping_task_result = sync_tracked_case_statuses()
        assert overlapping_task_result["skipped_due_to_overlap"] == 1
        assert overlapping_task_result["synced_count"] == 0

        # Worker finishes at 350s and releases lock cleanly
        released = worker_lock.release()
        assert released is True
        assert cache.get(TASK_LOCK_KEY) is None

        # Next scheduled task can now acquire and run normally
        subsequent_result = sync_tracked_case_statuses()
        assert subsequent_result.get("skipped_due_to_overlap") is None
        assert subsequent_result["synced_count"] >= 1

    def test_scenario_4_expired_lock_recovery(self, tracked_case_fixture):
        """4. Expired lock recovery.

        Verifies that:
        - If a worker crashes or abandons a lock (simulated by key expiration or TTL expiry),
          the system recovers automatically without deadlock.
        - The next scheduled task successfully acquires the lock and processes court data.
        """
        dead_worker_lock = DistributedLock("test_lock_key", timeout=1, token="crashed-worker-token")
        assert dead_worker_lock.acquire() is True

        # Simulate expiration of crashed worker's key
        cache.delete("test_lock_key")

        # New worker arrives and acquires successfully
        new_worker_lock = DistributedLock("test_lock_key", timeout=60, token="new-worker-token")
        assert new_worker_lock.acquire() is True
        assert cache.get("test_lock_key") == "new-worker-token"
        assert new_worker_lock.release() is True

        # Test recovery on the actual task key
        cache.set(TASK_LOCK_KEY, "expired-token", timeout=1)
        cache.delete(TASK_LOCK_KEY)  # Expired state

        recovery_result = sync_tracked_case_statuses()
        assert recovery_result.get("skipped_due_to_overlap") is None
        assert recovery_result["synced_count"] >= 1

    def test_scenario_5_ownership_safe_lock_release(self):
        """5. Ownership-safe lock release.

        Verifies that:
        - A worker CANNOT release a lock held by another worker.
        - If Worker 1's lock expired and Worker 2 subsequently acquired the lock,
          Worker 1's late release attempt fails and leaves Worker 2's lock intact.
        """
        lock_worker_1 = DistributedLock("test_lock_key", timeout=30, token="worker-1-uuid-token")
        lock_worker_2 = DistributedLock("test_lock_key", timeout=30, token="worker-2-uuid-token")

        assert lock_worker_1.acquire() is True
        assert cache.get("test_lock_key") == "worker-1-uuid-token"

        # Simulate Worker 1's key being replaced in cache by Worker 2 (e.g. after expiry)
        cache.set("test_lock_key", "worker-2-uuid-token", timeout=30)
        lock_worker_2._is_acquired = True

        # Worker 1 attempts to release its lock
        released_by_1 = lock_worker_1.release()
        assert released_by_1 is False

        # CRITICAL: Worker 2's lock must NOT have been deleted!
        assert cache.get("test_lock_key") == "worker-2-uuid-token"

        # Worker 2 releases its own lock successfully
        released_by_2 = lock_worker_2.release()
        assert released_by_2 is True
        assert cache.get("test_lock_key") is None

    def test_scenario_6_task_failure_and_cleanup(self, tracked_case_fixture):
        """6. Task failure and cleanup.

        Verifies that:
        - When an unhandled exception occurs during court status synchronization,
          the distributed lock is guaranteed to be released in the finally block.
        - No lingering or permanent locks remain after task crashes.
        """
        with patch.object(
            CourtStatusSyncService,
            "sync_all_tracked_cases",
            side_effect=RuntimeError("Simulated unhandled provider/database failure"),
        ):
            with pytest.raises(RuntimeError, match="Simulated unhandled provider/database failure"):
                sync_tracked_case_statuses()

        # Lock was cleanly released despite unhandled exception
        assert cache.get(TASK_LOCK_KEY) is None

        # Subsequent task can acquire and run cleanly
        subsequent_run = sync_tracked_case_statuses()
        assert subsequent_run.get("skipped_due_to_overlap") is None
        assert subsequent_run["synced_count"] >= 1

    def test_scenario_7_repeated_task_execution_without_overlapping_synchronization(
        self, tracked_case_fixture
    ):
        """7. Repeated task execution without overlapping synchronization.

        Verifies that:
        - Multiple consecutive scheduled Celery runs execute sequentially and cleanly.
        - No false overlap detections or lingering locks occur across runs.
        """
        for _iteration in range(3):
            # Verify lock is clear before run
            assert cache.get(TASK_LOCK_KEY) is None

            result = sync_tracked_case_statuses()
            assert result.get("skipped_due_to_overlap") is None
            assert result["synced_count"] >= 1

            # Verify lock is clear immediately after run
            assert cache.get(TASK_LOCK_KEY) is None

    def test_distributed_lock_context_manager_and_heartbeat(self):
        """Verify context manager protocol and background heartbeat thread execution."""
        with DistributedLock("test_lock_key", timeout=10, heartbeat_interval=0.1) as lock:
            assert lock.is_acquired is True
            assert cache.get("test_lock_key") == lock.token
            time.sleep(0.25)  # Allow heartbeat thread to fire at least twice
            assert cache.get("test_lock_key") == lock.token

        # On exit, heartbeat stopped and lock released
        assert cache.get("test_lock_key") is None

    def test_distributed_lock_acquisition_failure_in_context_manager(self):
        """Verify LockAcquisitionError is raised when context manager cannot acquire lock."""
        cache.set("test_lock_key", "existing-owner", timeout=60)

        with pytest.raises(LockAcquisitionError, match="Could not acquire distributed lock"):
            with DistributedLock("test_lock_key", timeout=10):
                pass

        # Existing owner's lock was not deleted
        assert cache.get("test_lock_key") == "existing-owner"

    def test_distributed_lock_max_duration_ceiling(self):
        """Verify max_duration ceiling stops renewal to prevent indefinite zombie locks."""
        lock = DistributedLock(
            "test_lock_key",
            timeout=10,
            max_duration=1,  # 1 second max duration
        )
        assert lock.acquire() is True
        time.sleep(1.1)

        # Renewal refused because elapsed > max_duration
        renewed = lock.renew()
        assert renewed is False

        # Release cleans up
        lock.release()
        assert cache.get("test_lock_key") is None

    def test_two_workers_concurrent_acquisition_threading(self):
        """Verify two simultaneous worker attempts result in exactly one acquisition."""
        lock1 = DistributedLock("test_ownership_key", timeout=30, token="token-1")
        lock2 = DistributedLock("test_ownership_key", timeout=30, token="token-2")

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future1 = executor.submit(lock1.acquire)
            future2 = executor.submit(lock2.acquire)
            r1 = future1.result()
            r2 = future2.result()

        # Exactly one worker succeeded in acquiring the lock
        assert (r1 and not r2) or (r2 and not r1)
        active_lock = lock1 if r1 else lock2
        other_lock = lock2 if r1 else lock1

        assert cache.get("test_ownership_key") == active_lock.token
        # Non-holder cannot release
        assert other_lock.release() is False
        # Active holder releases cleanly
        assert active_lock.release() is True
        assert cache.get("test_ownership_key") is None

    def test_old_worker_renewal_rejected_after_lease_expires(self):
        """Verify old worker cannot renew if its lease expired and key disappeared."""
        old_worker_lock = DistributedLock("test_ownership_key", timeout=1, token="old-worker-token")
        assert old_worker_lock.acquire() is True
        # Key deleted (expired)
        cache.delete("test_ownership_key")

        # Renewal fails because key no longer owned
        assert old_worker_lock.renew() is False
        assert old_worker_lock.is_acquired is False

    def test_redis_lua_atomic_renewal_verified(self):
        """Verify atomic Lua renewal script handles match and mismatch correctly."""
        mock_client = MagicMock()
        mock_cache = MagicMock()
        mock_cache.add.return_value = True
        mock_cache.eval = mock_client.eval

        lock = DistributedLock(
            "test_lock_key", timeout=60, token="lua-test-token", cache_backend=mock_cache
        )
        lock._is_acquired = True

        # Case 1: Lua script confirms ownership match (eval returns 1)
        mock_client.eval.return_value = 1
        with patch.object(
            lock, "_get_redis_context", return_value=(mock_client, "raw_key", b"lua-test-token")
        ):
            assert lock.renew(extend_seconds=45) is True
            mock_client.eval.assert_called_once()
            args = mock_client.eval.call_args[0]
            # Check script contains atomic ownership verification before expire
            assert "redis.call('get', KEYS[1]) == ARGV[1]" in args[0]
            assert "expire" in args[0]
            assert args[2] == "raw_key"
            assert args[3] == b"lua-test-token"
            assert args[4] == "45"

        # Case 2: Lua script detects token mismatch/expired (eval returns 0)
        mock_client.eval.reset_mock()
        mock_client.eval.return_value = 0
        with patch.object(
            lock, "_get_redis_context", return_value=(mock_client, "raw_key", b"lua-test-token")
        ):
            assert lock.renew(extend_seconds=45) is False
            assert lock.is_acquired is False

    def test_redis_lua_atomic_release_verified(self):
        """Verify atomic Lua release script deletes only when ownership matches."""
        mock_client = MagicMock()
        mock_cache = MagicMock()
        mock_cache.add.return_value = True

        lock = DistributedLock(
            "test_lock_key", timeout=60, token="lua-release-token", cache_backend=mock_cache
        )
        lock._is_acquired = True

        # Case 1: Lua script confirms ownership and deletes (eval returns 1)
        mock_client.eval.return_value = 1
        with patch.object(
            lock, "_get_redis_context", return_value=(mock_client, "raw_key", b"lua-release-token")
        ):
            assert lock.release() is True
            mock_client.eval.assert_called_once()
            args = mock_client.eval.call_args[0]
            # Check script contains atomic ownership verification before del
            assert "redis.call('get', KEYS[1]) == ARGV[1]" in args[0]
            assert "del" in args[0]
            assert args[2] == "raw_key"
            assert args[3] == b"lua-release-token"

        # Case 2: Lua script detects ownership lost (eval returns 0)
        lock._is_acquired = True
        mock_client.eval.reset_mock()
        mock_client.eval.return_value = 0
        with patch.object(
            lock, "_get_redis_context", return_value=(mock_client, "raw_key", b"lua-release-token")
        ):
            assert lock.release() is False

    def test_production_backend_safety_rejects_locmem_in_production(self, settings):
        """Verify LocMemCache is rejected in production (DEBUG=False) without explicit override."""
        settings.DEBUG = False
        settings.CELERY_TASK_ALWAYS_EAGER = False

        locmem_cache = LocMemCache("test-locmem", {})

        # Rejected without allow_in_memory
        with pytest.raises(
            InsecureLockBackendError, match="cannot use process-local 'LocMemCache'"
        ):
            DistributedLock("prod_test_key", cache_backend=locmem_cache)

        # Allowed with explicit override
        lock = DistributedLock("prod_test_key", cache_backend=locmem_cache, allow_in_memory=True)
        assert lock.key == "prod_test_key"

    def test_celery_task_handles_insecure_backend_safely(self, settings):
        """Verify Celery task fails safely with clear diagnostic if production backend is insecure."""
        settings.DEBUG = False
        settings.CELERY_TASK_ALWAYS_EAGER = False

        with patch("common.distributed_lock.cache", LocMemCache("unshared-prod-cache", {})):
            result = sync_tracked_case_statuses()
            assert result.get("skipped_due_to_insecure_backend") == 1
            assert result["error_count"] == 1
            assert result["total_cases"] == 0

    def test_cache_backend_failure_handling(self):
        """Verify connection/network errors from cache backend are handled safely without crashing."""
        failing_cache = MagicMock(spec=["add", "get", "set", "delete"])
        failing_cache.add.side_effect = ConnectionError("Connection refused to Redis cluster")
        failing_cache.get.side_effect = TimeoutError("Redis timeout")
        failing_cache.set.side_effect = TimeoutError("Redis timeout")
        failing_cache.delete.side_effect = ConnectionError("Redis down")

        lock = DistributedLock(
            "test_fail_key",
            timeout=30,
            cache_backend=failing_cache,
            allow_in_memory=True,
        )

        # Acquire fails safely
        assert lock.acquire() is False

        # Renew fails safely on get/set timeout
        lock._is_acquired = True
        assert lock.renew() is False

        # Release fails safely on delete connection error
        lock._is_acquired = True
        assert lock.release() is False

        # Also verify Redis Lua eval failure handling
        failing_redis = MagicMock()
        failing_redis.eval.side_effect = ConnectionError("Redis cluster unreachable")
        redis_fail_lock = DistributedLock(
            "test_fail_key_2",
            timeout=30,
            cache_backend=failing_redis,
            allow_in_memory=True,
        )
        redis_fail_lock._is_acquired = True
        with patch.object(
            redis_fail_lock,
            "_get_redis_context",
            return_value=(failing_redis, "raw_key", b"test_token"),
        ):
            assert redis_fail_lock.renew() is False
            assert redis_fail_lock.release() is False

    def test_heartbeat_shutdown_on_task_exception(self):
        """Verify heartbeat daemon thread stops and is joined even if task raises an exception."""
        lock_ref = None
        try:
            with DistributedLock("test_hb_exc_key", timeout=10, heartbeat_interval=0.1) as lock:
                lock_ref = lock
                assert lock.is_acquired is True
                assert lock._heartbeat_thread is not None
                assert lock._heartbeat_thread.is_alive()
                raise ValueError("Simulated task exception inside context manager")
        except ValueError:
            pass

        assert lock_ref is not None
        assert lock_ref._heartbeat_thread is None
        assert cache.get("test_hb_exc_key") is None

    @pytest.mark.skipif(
        not is_real_redis_available(),
        reason="Real Redis server not reachable on localhost:6379 (requires active Redis instance)",
    )
    def test_real_redis_multiprocess_synchronization(self):
        """Live multi-process concurrency test executed against real Redis instance when available."""
        from django.core.cache.backends.redis import RedisCache

        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        real_cache = RedisCache(redis_url, {})

        lock_a = DistributedLock("aphc:live:test_lock", timeout=10, cache_backend=real_cache)
        lock_b = DistributedLock("aphc:live:test_lock", timeout=10, cache_backend=real_cache)

        # Worker A acquires
        assert lock_a.acquire() is True
        # Worker B rejected
        assert lock_b.acquire() is False

        # Worker A renews atomically via Lua
        assert lock_a.renew(extend_seconds=20) is True

        # Worker B cannot release Worker A's lock
        lock_b._is_acquired = True
        assert lock_b.release() is False

        # Worker A releases atomically via Lua
        assert lock_a.release() is True

        # Now Worker B can acquire
        assert lock_b.acquire() is True
        assert lock_b.release() is True
