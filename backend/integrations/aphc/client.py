from abc import ABC, abstractmethod
from typing import Any


class BaseAPHCClient(ABC):
    """Abstract interface for communicating with Andhra Pradesh High Court public services.

    Actual endpoints and authentication schemas will be plugged in once verified.
    """

    @abstractmethod
    def fetch_case_by_number(
        self, case_type: str, case_number: str, filing_year: int
    ) -> dict[str, Any] | None:
        """Fetch case details by case type, number, and year."""
        raise NotImplementedError

    @abstractmethod
    def fetch_daily_cause_list(self, court_date: str) -> list[dict[str, Any]]:
        """Fetch daily cause list for a specified date."""
        raise NotImplementedError

    @abstractmethod
    def fetch_display_board_status(self) -> list[dict[str, Any]]:
        """Fetch current item status across all court halls."""
        raise NotImplementedError


class MockAPHCClient(BaseAPHCClient):
    """Mock implementation returning labeled placeholder test fixtures.

    Used during Phase 0 / early development before verified external portal integration.
    """

    MOCK_CASE_FIXTURE: dict[str, Any] = {
        "is_mock": True,
        "source": "APHC_MOCK_FIXTURE_PHASE_0",
        "case_type": "WP",
        "case_number": "1001",
        "filing_year": 2024,
        "petitioner": "Mock Litigant",
        "respondent": "State of Andhra Pradesh & Others",
        "status": "PENDING_VERIFIED_INTEGRATION",
    }

    MOCK_DISPLAY_BOARD_FIXTURE: list[dict[str, Any]] = [
        {
            "is_mock": True,
            "court_hall_number": 1,
            "bench_name": "Hon'ble The Chief Justice Court",
            "current_item_number": 12,
            "stage": "MOTION_HEARING",
        },
        {
            "is_mock": True,
            "court_hall_number": 2,
            "bench_name": "Court Hall 2",
            "current_item_number": 5,
            "stage": "ADMISSION",
        },
    ]

    def fetch_case_by_number(
        self, case_type: str, case_number: str, filing_year: int
    ) -> dict[str, Any]:
        return {
            **self.MOCK_CASE_FIXTURE,
            "case_type": case_type,
            "case_number": case_number,
            "filing_year": filing_year,
        }

    def fetch_daily_cause_list(self, court_date: str) -> list[dict[str, Any]]:
        return [
            {
                "is_mock": True,
                "court_date": court_date,
                "court_hall": 1,
                "item_number": 1,
                "case_type": "WP",
                "case_number": "1001",
                "advocate_name": "Mock Advocate",
            }
        ]

    def fetch_display_board_status(self) -> list[dict[str, Any]]:
        return self.MOCK_DISPLAY_BOARD_FIXTURE


def get_aphc_client() -> BaseAPHCClient:
    """Factory returning active APHC client instance."""
    return MockAPHCClient()
