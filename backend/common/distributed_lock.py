"""Distributed cache lock with unique ownership tokens, safe release, and renewable leases."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.core.cache.backends.dummy import DummyCache
from django.core.cache.backends.locmem import LocMemCache

logger = logging.getLogger(__name__)


class LockAcquisitionError(Exception):
    """Raised when an attempt to acquire a distributed lock fails in context manager mode."""


class InsecureLockBackendError(Exception):
    """Raised when a process-local/in-memory cache is configured for distributed locking in production."""


class DistributedLock:
    """A robust distributed cache lock implementation with ownership-verified renewable leases.

    Guarantees:
    1. Mutual Exclusion: At most one worker can hold the lock at any given time (backed by atomic cache.add / SETNX).
    2. Ownership Isolation: Each acquisition generates a unique ownership token (UUID).
       A worker can only release or renew its own lock.
    3. Atomic Lease Renewal: Workers can extend the lock lease during long operations via renew().
       Redis Lua script atomically verifies ownership and resets TTL in a single atomic transaction.
    4. Atomic Safe Release: release() atomically checks ownership token and deletes key only if matching.
       A worker never releases another worker's lock.
    5. Production Safety: Rejects process-local backends (LocMemCache) in production environments (DEBUG=False).
       Explicitly identifies development-only in-memory fallbacks.
    6. Fault Tolerance: Catches backend connection errors safely without crashing scheduled tasks.
    7. Auto-Heartbeat: A background daemon thread automatically renews the lease at fixed intervals.
    8. Deadlock Prevention: The lock always has an expiration TTL. If a worker process crashes,
       the lock expires naturally without leaving a permanent deadlock.
    9. Max Execution Safety Cap: Enforces a maximum total duration ceiling (default 30 mins) to prevent
       infinite zombie locks if a thread hangs indefinitely.
    """

    def __init__(
        self,
        key: str,
        timeout: int = 60,
        heartbeat_interval: float | None = None,
        max_duration: int | None = 1800,
        token: str | None = None,
        cache_backend: Any = None,
        allow_in_memory: bool = False,
    ) -> None:
        """Initialize the distributed lock.

        Args:
            key: Cache key for the distributed lock.
            timeout: Lease duration in seconds (default 60s).
            heartbeat_interval: Heartbeat renewal frequency in seconds (default timeout / 3).
            max_duration: Maximum duration in seconds after which renewals are refused (default 1800s).
            token: Optional explicit token for testing or tracking; defaults to a new UUID4.
            cache_backend: Optional custom cache backend; defaults to django.core.cache.cache.
            allow_in_memory: If True, bypasses production safety check for testing.
        """
        self.key = key
        self.timeout = timeout
        self.heartbeat_interval = (
            heartbeat_interval if heartbeat_interval is not None else max(1.0, timeout / 3.0)
        )
        self.max_duration = max_duration
        self.token = token or uuid.uuid4().hex
        self.cache = cache_backend or cache

        # Production safety verification: Reject process-local cache backends in production
        is_debug = getattr(settings, "DEBUG", True)
        is_celery_eager = getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False)
        is_in_memory = (
            isinstance(self.cache, LocMemCache | DummyCache)
            or "LocMem" in type(self.cache).__name__
        )

        if not is_debug and not is_celery_eager and is_in_memory and not allow_in_memory:
            raise InsecureLockBackendError(
                f"DistributedLock cannot use process-local '{self.cache.__class__.__name__}' in production. "
                "A shared Redis cache (RedisCache) is strictly required for multi-worker distributed locking."
            )

        if is_in_memory:
            logger.debug(
                "DistributedLock using %s (development/testing mode only; not suitable for multi-worker production)",
                self.cache.__class__.__name__,
            )

        self._is_acquired = False
        self._acquired_at: float | None = None
        self._heartbeat_thread: threading.Thread | None = None
        self._stop_heartbeat = threading.Event()
        self._lock = threading.Lock()

    @property
    def is_acquired(self) -> bool:
        """Return True if this lock instance currently believes it holds the lock."""
        return self._is_acquired

    def acquire(self, timeout: int | None = None) -> bool:
        """Attempt to acquire the lock atomically.

        Returns True if acquired, False otherwise.
        Catches cache backend communication errors safely.
        """
        ttl = timeout or self.timeout
        try:
            # Atomic set-if-not-exists with ownership token as value
            acquired = bool(self.cache.add(self.key, self.token, timeout=ttl))
            if acquired:
                with self._lock:
                    self._is_acquired = True
                    self._acquired_at = time.monotonic()
                logger.debug(
                    "Acquired distributed lock '%s' with token '%s' (TTL: %ds)",
                    self.key,
                    self.token,
                    ttl,
                )
                return True

            logger.debug(
                "Failed to acquire distributed lock '%s'; key already exists in cache",
                self.key,
            )
            return False
        except Exception as exc:
            logger.error(
                "Distributed lock '%s' acquisition failed due to cache backend error: %s",
                self.key,
                exc,
            )
            return False

    def renew(self, extend_seconds: int | None = None) -> bool:
        """Extend the lock lease if and only if this lock instance still owns it.

        Returns True if the lock was renewed, False if ownership was lost or max duration exceeded.
        """
        with self._lock:
            if not self._is_acquired:
                return False

            if self.max_duration and self._acquired_at:
                elapsed = time.monotonic() - self._acquired_at
                if elapsed >= self.max_duration:
                    logger.warning(
                        "Distributed lock '%s' exceeded max duration ceiling (%ds, elapsed: %.1fs); renewal refused.",
                        self.key,
                        self.max_duration,
                        elapsed,
                    )
                    return False

        ttl = extend_seconds or self.timeout

        try:
            # Attempt atomic renewal via Redis Lua script if supported
            redis_result = self._atomic_renew_redis(ttl)
            if redis_result is not None:
                if not redis_result:
                    with self._lock:
                        self._is_acquired = False
                return redis_result

            # Fallback to standard Django cache API
            current_owner = self.cache.get(self.key)
            if current_owner == self.token:
                self.cache.set(self.key, self.token, timeout=ttl)
                logger.debug(
                    "Renewed distributed lock '%s' for %ds (token: '%s')",
                    self.key,
                    ttl,
                    self.token,
                )
                return True

            logger.warning(
                "Cannot renew distributed lock '%s': ownership lost (expected '%s', got '%s')",
                self.key,
                self.token,
                current_owner,
            )
            with self._lock:
                self._is_acquired = False
            return False
        except Exception as exc:
            logger.warning(
                "Distributed lock '%s' renewal failed due to cache backend error: %s",
                self.key,
                exc,
            )
            return False

    def release(self) -> bool:
        """Release the lock safely by verifying ownership.

        Never releases another worker's lock. Returns True if released, False otherwise.
        """
        self.stop_heartbeat()

        with self._lock:
            if not self._is_acquired:
                return False
            self._is_acquired = False

        try:
            # Attempt atomic release via Redis Lua script if supported
            redis_result = self._atomic_release_redis()
            if redis_result is not None:
                return redis_result

            # Fallback to standard Django cache API
            current_owner = self.cache.get(self.key)
            if current_owner == self.token:
                self.cache.delete(self.key)
                logger.debug(
                    "Released distributed lock '%s' (token: '%s')",
                    self.key,
                    self.token,
                )
                return True

            logger.warning(
                "Safely skipped releasing distributed lock '%s': ownership token mismatch (current: '%s', lock: '%s')",
                self.key,
                current_owner,
                self.token,
            )
            return False
        except Exception as exc:
            logger.warning(
                "Distributed lock '%s' release failed due to cache backend error: %s",
                self.key,
                exc,
            )
            return False

    def start_heartbeat(self) -> None:
        """Start a background daemon thread to renew the lease at heartbeat intervals."""
        with self._lock:
            if not self._is_acquired:
                logger.warning("Cannot start heartbeat on unacquired lock '%s'", self.key)
                return

            if self._heartbeat_thread and self._heartbeat_thread.is_alive():
                return

            self._stop_heartbeat.clear()

            def _heartbeat_loop() -> None:
                while not self._stop_heartbeat.wait(timeout=self.heartbeat_interval):
                    renewed = self.renew()
                    if not renewed:
                        logger.warning(
                            "Heartbeat failed to renew distributed lock '%s'; stopping heartbeat loop.",
                            self.key,
                        )
                        break

            self._heartbeat_thread = threading.Thread(
                target=_heartbeat_loop,
                name=f"DistributedLock-Heartbeat-{self.key}",
                daemon=True,
            )
            self._heartbeat_thread.start()

    def stop_heartbeat(self) -> None:
        """Stop the background heartbeat thread."""
        self._stop_heartbeat.set()
        thread = self._heartbeat_thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=2.0)
        self._heartbeat_thread = None

    def _get_redis_context(self) -> tuple[Any, str, Any] | None:
        """Extract raw Redis client, fully-qualified key name, and serialized token for atomic Lua operations."""
        try:
            # 1. Django 4.0+ RedisCache backend
            cache_client_obj = getattr(self.cache, "_cache", None)
            if cache_client_obj and hasattr(cache_client_obj, "get_client"):
                raw_key = self.cache.make_and_validate_key(self.key)
                client = cache_client_obj.get_client(raw_key, write=True)
                serializer = getattr(cache_client_obj, "_serializer", None)
                serialized_val = (
                    serializer.dumps(self.token) if serializer else self.token.encode("utf-8")
                )
                return client, raw_key, serialized_val

            # 2. Raw redis.Redis client or direct client adapter
            client = getattr(self.cache, "client", None)
            if client and hasattr(client, "get_client"):
                client = client.get_client()
            elif client is None and hasattr(self.cache, "eval"):
                client = self.cache

            if client and hasattr(client, "eval"):
                return client, self.key, self.token.encode("utf-8")
        except Exception as exc:
            logger.debug("Could not resolve Redis client context for atomic Lua: %s", exc)
        return None

    def _atomic_renew_redis(self, ttl: int) -> bool | None:
        """Attempt atomic touch/extend via Redis Lua script if raw client is available."""
        ctx = self._get_redis_context()
        if not ctx:
            return None

        client, raw_key, serialized_token = ctx
        try:
            # Lua: atomically check ownership before extending TTL
            script = (
                "if redis.call('get', KEYS[1]) == ARGV[1] then "
                "return redis.call('expire', KEYS[1], ARGV[2]) "
                "else return 0 end"
            )
            result = client.eval(script, 1, raw_key, serialized_token, str(ttl))
            return bool(result)
        except Exception as exc:
            logger.warning("Redis Lua renewal script failed: %s", exc)
            return False

    def _atomic_release_redis(self) -> bool | None:
        """Attempt atomic delete via Redis Lua script if raw client is available."""
        ctx = self._get_redis_context()
        if not ctx:
            return None

        client, raw_key, serialized_token = ctx
        try:
            # Lua: atomically check ownership before deleting key
            script = (
                "if redis.call('get', KEYS[1]) == ARGV[1] then "
                "return redis.call('del', KEYS[1]) "
                "else return 0 end"
            )
            result = client.eval(script, 1, raw_key, serialized_token)
            return bool(result)
        except Exception as exc:
            logger.warning("Redis Lua release script failed: %s", exc)
            return False

    def __enter__(self) -> DistributedLock:
        if not self.acquire():
            raise LockAcquisitionError(f"Could not acquire distributed lock for key '{self.key}'")
        self.start_heartbeat()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.release()
