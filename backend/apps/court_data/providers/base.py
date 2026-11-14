"""Abstract base interfaces and data models for provider-independent court data retrieval."""

from __future__ import annotations

import datetime
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


class CourtDataProviderError(Exception):
    """Base exception for court data provider issues."""


class CourtDataProviderTimeoutError(CourtDataProviderError):
    """Raised when court provider request times out."""


class CourtDataProviderUnavailableError(CourtDataProviderError):
    """Raised when court provider service is unreachable or authorization is pending."""


class CourtDataProviderServerError(CourtDataProviderError):
    """Raised when court provider returns HTTP 5xx server error."""


@dataclass(frozen=True)
class CourtListingObservation:
    """Typed observation payload returned by a court data provider.

    Represents an immutable snapshot of a case's listing and token status
    at a specific point in time.
    """

    case_type: str
    case_number: str
    filing_year: int
    court_name: str = "High Court of Andhra Pradesh"
    bench: str | None = None
    court_hall: int | None = None
    listing_date: datetime.date | None = None
    session: str | None = None
    item_number: int | None = None
    token_number: str | None = None
    source_status: str = "NOT_LISTED"
    provider_name: str = "GENERIC_PROVIDER"
    observed_at: datetime.datetime = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)  # noqa: UP017
    )
    source_reference: str | None = None
    safe_metadata: dict[str, Any] = field(default_factory=dict)
    is_mock: bool = False

    @property
    def formatted_case_ref(self) -> str:
        return f"{self.case_type} {self.case_number}/{self.filing_year}"


class CourtDataProvider(ABC):
    """Abstract interface decoupling court data ingestion from application business logic.

    Allows plugging in mock adapters during testing, and official court registry APIs
    in production without rewriting downstream status tracking, audit logging, or alert dispatch.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique identifier string for the provider."""
        raise NotImplementedError

    @property
    @abstractmethod
    def is_live_provider(self) -> bool:
        """True if connecting to live court registry; False if mock."""
        raise NotImplementedError

    @abstractmethod
    def fetch_case_status(
        self,
        case_type: str,
        case_number: str,
        filing_year: int,
    ) -> CourtListingObservation | None:
        """Fetch current listing and token status for an individual case matter.

        Returns None if the case is not found or not in any cause list.
        """
        raise NotImplementedError

    @abstractmethod
    def fetch_daily_board_status(
        self,
        court_date: datetime.date | None = None,
    ) -> list[CourtListingObservation]:
        """Fetch listings and current board statuses across all court halls for a given date."""
        raise NotImplementedError

    @abstractmethod
    def check_health(self) -> dict[str, Any]:
        """Check provider connectivity, latency, and operational status."""
        raise NotImplementedError
