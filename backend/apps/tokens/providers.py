"""Provider architecture for Court Token Alert Engine.

Supports interchangeable data providers:
- DemoCourtTokenProvider: deterministic simulation for local development and integration tests
- OfficialCourtTokenProvider: sanctioned integration when official court API credentials are provided

Explicitly flags demo/mock status in accordance with compliance guidelines.
Never fabricates live court token data and never scrapes restricted court portals.
"""

from __future__ import annotations

import datetime
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.utils import timezone


class CourtTokenProviderError(Exception):
    """Base exception for court token provider errors."""


class CourtTokenProviderTimeoutError(CourtTokenProviderError):
    """Raised when court token provider request times out."""


class CourtTokenProviderUnavailableError(CourtTokenProviderError):
    """Raised when court token provider is unreachable or unauthorized."""


@dataclass(frozen=True)
class CourtTokenObservation:
    """Immutable snapshot of a court hall's token/item status at a point in time."""

    court_hall_number: int
    court_name: str = "High Court of Andhra Pradesh"
    bench_name: str = ""
    presiding_judges: str = ""
    current_item_number: int = 0
    current_stage: str = "IN_PROGRESS"
    observed_at: datetime.datetime = field(default_factory=lambda: timezone.now())
    is_mock: bool = True
    provider_name: str = "APHC_DEMO_PROVIDER"
    is_available: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


class CourtTokenProvider(ABC):
    """Abstract interface decoupling court token ingestion from alert business logic."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique identifier string for the provider."""
        raise NotImplementedError

    @property
    @abstractmethod
    def is_live_provider(self) -> bool:
        """True if connecting to official live court registry; False if mock."""
        raise NotImplementedError

    @abstractmethod
    def fetch_hall_token_status(self, hall_number: int) -> CourtTokenObservation:
        """Fetch current active item number and session status for a specific court hall."""
        raise NotImplementedError

    @abstractmethod
    def fetch_all_halls_status(self) -> list[CourtTokenObservation]:
        """Fetch current item status across all active court halls."""
        raise NotImplementedError

    @abstractmethod
    def check_health(self) -> dict[str, Any]:
        """Check provider connectivity, latency, and operational health."""
        raise NotImplementedError


class DemoCourtTokenProvider(CourtTokenProvider):
    """Deterministic simulation provider for development, demo, and automated testing.

    Explicitly tagged is_mock=True. Reads from database CourtHall and CourtTokenStatus models.
    """

    @property
    def provider_name(self) -> str:
        return "APHC_DEMO_PROVIDER"

    @property
    def is_live_provider(self) -> bool:
        return False

    def fetch_hall_token_status(self, hall_number: int) -> CourtTokenObservation:
        from apps.tokens.models import CourtHall

        hall = CourtHall.objects.filter(hall_number=hall_number, is_active=True).first()
        if not hall:
            return CourtTokenObservation(
                court_hall_number=hall_number,
                is_available=False,
                is_mock=True,
                provider_name=self.provider_name,
            )

        status_obj = getattr(hall, "token_status", None)
        current_item = status_obj.current_item_number if status_obj else 0
        stage = status_obj.current_stage if status_obj else "IN_PROGRESS"
        observed_at = status_obj.last_polled_at if status_obj else timezone.now()

        return CourtTokenObservation(
            court_hall_number=hall.hall_number,
            court_name="High Court of Andhra Pradesh",
            bench_name=hall.bench_name,
            presiding_judges=hall.presiding_judges,
            current_item_number=current_item,
            current_stage=stage,
            observed_at=observed_at,
            is_mock=True,
            provider_name=self.provider_name,
            is_available=True,
        )

    def fetch_all_halls_status(self) -> list[CourtTokenObservation]:
        from apps.tokens.models import CourtHall

        halls = CourtHall.objects.filter(is_active=True).select_related("token_status")
        observations = []
        for hall in halls:
            status_obj = getattr(hall, "token_status", None)
            current_item = status_obj.current_item_number if status_obj else 0
            stage = status_obj.current_stage if status_obj else "IN_PROGRESS"
            observed_at = status_obj.last_polled_at if status_obj else timezone.now()

            observations.append(
                CourtTokenObservation(
                    court_hall_number=hall.hall_number,
                    court_name="High Court of Andhra Pradesh",
                    bench_name=hall.bench_name,
                    presiding_judges=hall.presiding_judges,
                    current_item_number=current_item,
                    current_stage=stage,
                    observed_at=observed_at,
                    is_mock=True,
                    provider_name=self.provider_name,
                    is_available=True,
                )
            )
        return observations

    def check_health(self) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "status": "HEALTHY",
            "is_mock": True,
            "is_live_provider": False,
            "timestamp": timezone.now().isoformat(),
        }


class OfficialCourtTokenProvider(CourtTokenProvider):
    """Sanctioned official integration with Andhra Pradesh High Court display boards.

    Strict compliance: If no sanctioned API endpoint or credentials are configured,
    it raises CourtTokenProviderUnavailableError rather than attempting illegal scraping
    or fabricating fake status data.
    """

    def __init__(self, api_url: str | None = None, api_key: str | None = None):
        self.api_url = api_url or getattr(settings, "APHC_TOKEN_API_URL", None)
        self.api_key = api_key or getattr(settings, "APHC_TOKEN_API_KEY", None)

    @property
    def provider_name(self) -> str:
        return "APHC_OFFICIAL_PROVIDER"

    @property
    def is_live_provider(self) -> bool:
        return True

    def fetch_hall_token_status(self, hall_number: int) -> CourtTokenObservation:
        if not self.api_url:
            raise CourtTokenProviderUnavailableError(
                "Official APHC live token endpoint is not configured or publicly authorized."
            )
        # Placeholder for sanctioned official API integration
        raise CourtTokenProviderUnavailableError("Official APHC API integration in progress.")

    def fetch_all_halls_status(self) -> list[CourtTokenObservation]:
        if not self.api_url:
            raise CourtTokenProviderUnavailableError(
                "Official APHC live token endpoint is not configured or publicly authorized."
            )
        raise CourtTokenProviderUnavailableError("Official APHC API integration in progress.")

    def check_health(self) -> dict[str, Any]:
        return {
            "provider": self.provider_name,
            "status": "CONFIGURED" if self.api_url else "UNCONFIGURED",
            "is_mock": False,
            "is_live_provider": True,
            "timestamp": timezone.now().isoformat(),
        }


_PROVIDER_OVERRIDE: CourtTokenProvider | None = None


def get_court_token_provider() -> CourtTokenProvider:
    """Factory function returning the active CourtTokenProvider instance."""
    global _PROVIDER_OVERRIDE
    if _PROVIDER_OVERRIDE is not None:
        return _PROVIDER_OVERRIDE

    configured = getattr(settings, "COURT_TOKEN_PROVIDER", "DEMO")
    if configured.upper() == "OFFICIAL":
        return OfficialCourtTokenProvider()
    return DemoCourtTokenProvider()


def set_court_token_provider_override(provider: CourtTokenProvider | None) -> None:
    """Sets a global provider override for testing purposes."""
    global _PROVIDER_OVERRIDE
    _PROVIDER_OVERRIDE = provider
