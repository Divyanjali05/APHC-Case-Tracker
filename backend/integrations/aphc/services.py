from typing import Any

from .client import BaseAPHCClient, get_aphc_client


class APHCService:
    """High-level service coordinating calls through the injected APHC client."""

    def __init__(self, client: BaseAPHCClient | None = None):
        self.client = client or get_aphc_client()

    def get_case(self, case_type: str, case_number: str, filing_year: int) -> dict[str, Any] | None:
        return self.client.fetch_case_by_number(case_type, case_number, filing_year)

    def get_display_board(self) -> list[dict[str, Any]]:
        return self.client.fetch_display_board_status()

    def get_cause_list(self, court_date: str) -> list[dict[str, Any]]:
        return self.client.fetch_daily_cause_list(court_date)
