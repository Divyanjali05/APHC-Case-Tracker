"""Retry mechanisms and resilience wrappers for external court data communications."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from .providers.base import (
    CourtDataProviderError,
    CourtDataProviderServerError,
    CourtDataProviderTimeoutError,
    CourtDataProviderUnavailableError,
)

logger = logging.getLogger(__name__)

DEFAULT_RETRYABLE_EXCEPTIONS: tuple[type[Exception], ...] = (
    CourtDataProviderTimeoutError,
    CourtDataProviderUnavailableError,
    CourtDataProviderServerError,
    TimeoutError,
    ConnectionError,
    ConnectionResetError,
    ConnectionRefusedError,
    OSError,
)


@dataclass
class RetryConfig:
    """Configurable retry policies for court integration operations."""

    max_retries: int = 3
    initial_delay: float = 0.02  # seconds
    backoff_factor: float = 2.0
    retryable_exceptions: tuple[type[Exception], ...] = DEFAULT_RETRYABLE_EXCEPTIONS


T = TypeVar("T")


def execute_with_retry(  # noqa: UP047
    operation: Callable[[], T],
    config: RetryConfig | None = None,
    on_retry: Callable[[Exception, int, float], None] | None = None,
    operation_name: str = "Court Registry Operation",
) -> T:
    """Execute a callable with controlled retries and exponential backoff for temporary network failures.

    Guarantees:
    - Retries only transient exceptions in `retryable_exceptions`.
    - Never catches or retries unexpected parsing errors, validation errors, or permanent data bugs.
    - Limits retries strictly to `config.max_retries` to prevent infinite loops.
    - Sanitizes log outputs: logs operational state and attempt numbers, never confidential payload contents.
    - Re-raises the underlying exception upon exhausting retries so callers retain specific exception types.
    """
    cfg = config or RetryConfig()
    delay = cfg.initial_delay
    last_exc: Exception | None = None

    for attempt in range(1, cfg.max_retries + 1):
        try:
            return operation()
        except cfg.retryable_exceptions as exc:
            last_exc = exc
            if attempt >= cfg.max_retries:
                logger.error(
                    "%s failed permanently after %d attempts. Last error: %s",
                    operation_name,
                    attempt,
                    exc,
                )
                raise exc

            logger.warning(
                "%s failed on attempt %d/%d (%s). Retrying in %.3fs...",
                operation_name,
                attempt,
                cfg.max_retries,
                exc,
                delay,
            )

            if on_retry is not None:
                try:
                    on_retry(exc, attempt, delay)
                except Exception as cb_exc:
                    logger.debug("on_retry callback raised: %s", cb_exc)

            time.sleep(delay)
            delay *= cfg.backoff_factor

    if last_exc:
        raise last_exc
    raise CourtDataProviderError(f"{operation_name} failed with no attempts executed.")
