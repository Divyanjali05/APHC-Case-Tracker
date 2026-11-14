"""Deterministic mock adapter for court data and listing tracking.

Provides reproducible fixtures and state transition capabilities for testing
without connecting to external court registries.
"""

from __future__ import annotations

import datetime
from typing import Any

from django.utils import timezone

from .base import (
    CourtDataProvider,
    CourtDataProviderError,
    CourtDataProviderServerError,
    CourtDataProviderTimeoutError,
    CourtDataProviderUnavailableError,
    CourtListingObservation,
)


class APHCRegistryMockAdapter(CourtDataProvider):
    """Deterministic mock provider simulating Andhra Pradesh High Court Registry data feeds.

    Features:
    - Deterministic baseline fixtures for registered cases.
    - Mutable state registry for testing live transitions (e.g. WAITING -> CALLED -> IN_PROGRESS).
    - Failure and timeout injection switches for testing resilience.
    - Explicit mock labeling on all returned records.
    """

    PROVIDER_NAME = "APHC_REGISTRY_MOCK"

    def __init__(
        self,
        simulate_timeout: bool = False,
        simulate_error: bool = False,
        simulate_unknown_status: bool = False,
        simulate_500: bool = False,
        simulate_503: bool = False,
        simulate_connection_refused: bool = False,
        simulate_dns_failure: bool = False,
    ):
        self._simulate_timeout = simulate_timeout
        self._simulate_error = simulate_error
        self._simulate_unknown_status = simulate_unknown_status
        self._simulate_500 = simulate_500
        self._simulate_503 = simulate_503
        self._simulate_connection_refused = simulate_connection_refused
        self._simulate_dns_failure = simulate_dns_failure
        # In-memory dynamic override state for testing transitions across sync cycles
        self._case_state_overrides: dict[str, dict[str, Any]] = {}
        self.call_count: int = 0

    @property
    def provider_name(self) -> str:
        return self.PROVIDER_NAME

    @property
    def is_live_provider(self) -> bool:
        return False

    def set_case_override(
        self,
        case_type: str,
        case_number: str,
        filing_year: int,
        **kwargs: Any,
    ) -> None:
        """Inject or override simulated court status for a specific case matter."""
        key = f"{case_type}_{case_number}_{filing_year}".upper()
        self._case_state_overrides[key] = kwargs

    def clear_overrides(self) -> None:
        """Clear all in-memory dynamic state overrides."""
        self._case_state_overrides.clear()

    def fetch_case_status(
        self,
        case_type: str,
        case_number: str,
        filing_year: int,
    ) -> CourtListingObservation | None:
        """Fetch deterministic mock listing status for a case."""
        self.call_count += 1
        if self._simulate_timeout:
            raise CourtDataProviderTimeoutError(
                "APHC registry mock gateway timed out after 10000ms"
            )

        if self._simulate_500:
            raise CourtDataProviderServerError(
                "HTTP 500 Internal Server Error: Court portal database error"
            )

        if self._simulate_503:
            raise CourtDataProviderUnavailableError(
                "HTTP 503 Service Unavailable: High Court Registry maintenance"
            )

        if self._simulate_connection_refused:
            raise ConnectionRefusedError("Connection refused by court portal (port 443)")

        if self._simulate_dns_failure:
            raise ConnectionError("DNS resolution failed for cis.aphc.gov.in")

        if self._simulate_error:
            raise CourtDataProviderError(
                "APHC registry mock gateway returned HTTP 503 Service Unavailable"
            )

        key = f"{case_type}_{case_number}_{filing_year}".upper()
        now = timezone.now()
        today = now.date()

        # Check if an override was explicitly injected for this test
        override = self._case_state_overrides.get(key)
        if override is not None:
            if override.get("is_not_found"):
                return None

            source_status = (
                "UNKNOWN_REGISTRY_FLAG"
                if self._simulate_unknown_status
                else override.get("source_status", "LISTED")
            )
            return CourtListingObservation(
                case_type=case_type,
                case_number=case_number,
                filing_year=filing_year,
                court_name="High Court of Andhra Pradesh (Amaravati)",
                bench=override.get("bench", "Hon'ble Division Bench I"),
                court_hall=override.get("court_hall", 3),
                listing_date=override.get("listing_date", today),
                session=override.get("session", "Morning Session (10:30 AM)"),
                item_number=override.get("item_number", 14),
                token_number=override.get("token_number", f"TKN-{case_number}"),
                source_status=source_status,
                provider_name=self.PROVIDER_NAME,
                observed_at=now,
                source_reference=override.get("source_reference", f"MOCK-LISTING-{case_number}"),
                safe_metadata={
                    "is_mock": True,
                    "simulated_stage": override.get("simulated_stage", "Daily Cause List"),
                    "serial_number": override.get("item_number", 14),
                },
                is_mock=True,
            )

        # Baseline deterministic cases
        if case_type == "WP" and case_number in ("8801", "1001"):
            source_status = "unknown_code_99" if self._simulate_unknown_status else "listed"
            return CourtListingObservation(
                case_type=case_type,
                case_number=case_number,
                filing_year=filing_year,
                court_name="High Court of Andhra Pradesh (Amaravati)",
                bench="Hon'ble Justice Sri K. Suresh Reddy & Hon'ble Justice Sri B. Krishna Mohan",
                court_hall=4,
                listing_date=today,
                session="Morning Session (10:30 AM)",
                item_number=18,
                token_number=f"TKN-{case_number}-04",
                source_status=source_status,
                provider_name=self.PROVIDER_NAME,
                observed_at=now,
                source_reference=f"MOCK-APHC-LIST-{today.strftime('%Y%m%d')}-{case_number}",
                safe_metadata={"cause_list_type": "Daily List", "is_mock": True},
                is_mock=True,
            )

        if case_type == "WA" and case_number == "9901":
            return CourtListingObservation(
                case_type=case_type,
                case_number=case_number,
                filing_year=filing_year,
                court_name="High Court of Andhra Pradesh (Amaravati)",
                bench="Hon'ble The Chief Justice Court",
                court_hall=1,
                listing_date=today,
                session="Morning Session (10:30 AM)",
                item_number=5,
                token_number="TKN-9901-01",
                source_status="waiting",
                provider_name=self.PROVIDER_NAME,
                observed_at=now,
                source_reference=f"MOCK-APHC-LIST-{today.strftime('%Y%m%d')}-9901",
                safe_metadata={"cause_list_type": "Motion Hearing", "is_mock": True},
                is_mock=True,
            )

        # Default fallback for untracked/unlisted test cases
        return CourtListingObservation(
            case_type=case_type,
            case_number=case_number,
            filing_year=filing_year,
            court_name="High Court of Andhra Pradesh (Amaravati)",
            source_status="not_listed",
            provider_name=self.PROVIDER_NAME,
            observed_at=now,
            safe_metadata={"is_mock": True, "notice": "Case matter not in current daily list"},
            is_mock=True,
        )

    def fetch_daily_board_status(
        self,
        court_date: datetime.date | None = None,
    ) -> list[CourtListingObservation]:
        """Fetch current listings across active court halls."""
        if self._simulate_timeout:
            raise CourtDataProviderTimeoutError("APHC registry board gateway timed out")

        obs1 = self.fetch_case_status("WP", "8801", 2024)
        obs2 = self.fetch_case_status("WA", "9901", 2024)
        return [o for o in (obs1, obs2) if o is not None]

    def fetch_case_details(
        self,
        case_type: str,
        case_number: str,
        filing_year: int,
    ) -> dict[str, Any] | None:
        """Fetch full case details payload including hearings and judgments."""
        self.call_count += 1
        if self._simulate_timeout:
            raise CourtDataProviderTimeoutError(
                "APHC registry mock gateway timed out after 10000ms"
            )

        if self._simulate_500:
            raise CourtDataProviderServerError(
                "HTTP 500 Internal Server Error: Court portal database error"
            )

        if self._simulate_503:
            raise CourtDataProviderUnavailableError(
                "HTTP 503 Service Unavailable: High Court Registry maintenance"
            )

        if self._simulate_connection_refused:
            raise ConnectionRefusedError("Connection refused by court portal (port 443)")

        if self._simulate_dns_failure:
            raise ConnectionError("DNS resolution failed for cis.aphc.gov.in")

        if self._simulate_error:
            raise CourtDataProviderError(
                "APHC registry mock gateway returned HTTP 503 Service Unavailable"
            )

        key = f"{case_type}_{case_number}_{filing_year}".upper()
        override = self._case_state_overrides.get(key)
        if override is not None:
            if override.get("is_not_found"):
                return None
            return {
                "case_type": case_type,
                "case_number": case_number,
                "filing_year": filing_year,
                "petitioner": override.get("petitioner", "Mock Petitioner"),
                "respondent": override.get("respondent", "Mock Respondent"),
                "bench": override.get("bench", "Division Bench I"),
                "court_hall_number": override.get("court_hall", 4),
                "next_hearing_date": str(override.get("listing_date", "2026-11-20")),
                "item_number": override.get("item_number", 18),
                "token_number": override.get("token_number", f"TKN-{case_number}"),
                "source_status": override.get("source_status", "LISTED"),
                "hearings": override.get("hearings", []),
                "judgments": override.get("judgments", []),
                "is_mock": True,
            }

        return {
            "case_type": case_type,
            "case_number": case_number,
            "filing_year": filing_year,
            "petitioner": "Coastal Ports Authority",
            "respondent": "Maritime Workers Union",
            "petitioner_advocate": "Venkatesh Prasad",
            "respondent_advocate": "Sujatha Rao",
            "current_stage": "HEARING",
            "bench": "Hon'ble Division Bench I",
            "court_hall_number": 4,
            "next_hearing_date": "2026-11-20",
            "hearing_time": "10:30:00",
            "item_number": 18,
            "token_number": f"TKN-{case_number}-04",
            "source_status": "LISTED",
            "court_name": "High Court of Andhra Pradesh (Amaravati)",
            "hearings": [
                {
                    "hearing_date": "2026-11-20",
                    "hearing_time": "10:30:00",
                    "court_hall_number": 4,
                    "item_number": 18,
                    "business_conducted": "Arguments heard in part.",
                    "status": "SCHEDULED",
                }
            ],
            "judgments": [],
            "is_mock": True,
        }

    def check_health(self) -> dict[str, Any]:
        """Report mock provider operational availability."""
        return {
            "status": "healthy",
            "provider": self.PROVIDER_NAME,
            "is_live": False,
            "latency_ms": 1.2,
            "notice": "Operating in deterministic mock mode. No live APHC credentials required.",
        }
