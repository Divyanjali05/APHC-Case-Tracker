from integrations.aphc.client import MockAPHCClient
from integrations.aphc.services import APHCService


def test_mock_aphc_client():
    """Verify that MockAPHCClient returns clearly labeled mock fixtures."""
    client = MockAPHCClient()
    case_data = client.fetch_case_by_number("WP", "1234", 2024)
    assert case_data["is_mock"] is True
    assert case_data["case_type"] == "WP"
    assert case_data["case_number"] == "1234"
    assert case_data["filing_year"] == 2024

    halls = client.fetch_display_board_status()
    assert len(halls) > 0
    assert halls[0]["is_mock"] is True


def test_aphc_service_wrapper():
    """Verify that APHCService coordinates through the injected mock client."""
    service = APHCService(client=MockAPHCClient())
    board = service.get_display_board()
    assert len(board) >= 2
    assert board[0]["court_hall_number"] == 1
