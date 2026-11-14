"""Court data provider abstraction and factory."""

from __future__ import annotations

import os

from django.conf import settings

from .base import (
    CourtDataProvider,
    CourtDataProviderError,
    CourtDataProviderServerError,
    CourtDataProviderTimeoutError,
    CourtDataProviderUnavailableError,
    CourtListingObservation,
)
from .mock_adapter import APHCRegistryMockAdapter
from .official_adapter import APHCOfficialAdapter

__all__ = [
    "CourtDataProvider",
    "CourtDataProviderError",
    "CourtDataProviderServerError",
    "CourtDataProviderTimeoutError",
    "CourtDataProviderUnavailableError",
    "CourtListingObservation",
    "APHCRegistryMockAdapter",
    "APHCOfficialAdapter",
    "get_court_data_provider",
]

_active_provider_override: CourtDataProvider | None = None


def set_court_data_provider_override(provider: CourtDataProvider | None) -> None:
    """Inject custom provider instance for testing or runtime mocking."""
    global _active_provider_override
    _active_provider_override = provider


def get_court_data_provider() -> CourtDataProvider:
    """Factory returning configured court data provider instance.

    Checks:
    1. Explicit runtime override (if set for testing)
    2. settings.COURT_DATA_PROVIDER / os.getenv('COURT_DATA_PROVIDER')
    3. Defaults to APHCRegistryMockAdapter
    """
    global _active_provider_override
    if _active_provider_override is not None:
        return _active_provider_override

    provider_type = getattr(
        settings, "COURT_DATA_PROVIDER", os.getenv("COURT_DATA_PROVIDER", "MOCK")
    ).upper()

    if provider_type == "OFFICIAL":
        return APHCOfficialAdapter()

    return APHCRegistryMockAdapter()
