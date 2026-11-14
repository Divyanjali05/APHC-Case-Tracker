"""Unit tests for CourtDataParser (Phase 6).

Verifies response parsing across Scenarios A, B, and C:
- Safe parsing of ISO and Indian judicial date formats.
- Safe integer and time extraction.
- HTML tag stripping and text sanitization.
- Handling of null and missing optional fields.
- Safe rejection of unexpected structure, HTML error pages, and empty payloads.
- Fault-tolerant handling of malformed hearing/judgment dates.
"""

from __future__ import annotations

import datetime

import pytest

from apps.court_data.parser import (
    CourtDataParser,
    InvalidCourtDataError,
    ParsedCourtCasePayload,
)
from tests.fixtures.court_mock_payloads import (
    SCENARIO_A_SUCCESSFUL_PAYLOAD,
    SCENARIO_B_MISSING_FIELDS_PAYLOAD,
    SCENARIO_C1_UNEXPECTED_STRUCTURE,
    SCENARIO_C2_INVALID_TYPES,
    SCENARIO_C3_MALFORMED_DATES,
    SCENARIO_C4_UNEXPECTED_HTML,
    SCENARIO_C5_EMPTY_DICT,
    SCENARIO_C5_EMPTY_STRING,
)


class TestCourtDataParserPrimitiveParsers:
    """Tests for low-level primitive safe parsing functions."""

    def test_parse_date_safe_iso(self):
        assert CourtDataParser.parse_date_safe("2026-11-20") == datetime.date(2026, 11, 20)
        assert CourtDataParser.parse_date_safe("2026-11-20T10:30:00Z") == datetime.date(
            2026, 11, 20
        )

    def test_parse_date_safe_indian_formats(self):
        # DD-MM-YYYY
        assert CourtDataParser.parse_date_safe("20-11-2026") == datetime.date(2026, 11, 20)
        # DD/MM/YYYY
        assert CourtDataParser.parse_date_safe("20/11/2026") == datetime.date(2026, 11, 20)

    def test_parse_date_safe_already_date_or_datetime(self):
        d = datetime.date(2026, 11, 20)
        dt = datetime.datetime(2026, 11, 20, 10, 30)
        assert CourtDataParser.parse_date_safe(d) == d
        assert CourtDataParser.parse_date_safe(dt) == d

    def test_parse_date_safe_malformed_returns_none_without_raising(self):
        assert CourtDataParser.parse_date_safe("not-a-date") is None
        assert CourtDataParser.parse_date_safe("99-99-9999") is None
        assert CourtDataParser.parse_date_safe("2024-02-31") is None
        assert CourtDataParser.parse_date_safe(None) is None
        assert CourtDataParser.parse_date_safe("") is None
        assert CourtDataParser.parse_date_safe(12345) is None
        assert CourtDataParser.parse_date_safe([]) is None

    def test_parse_time_safe(self):
        assert CourtDataParser.parse_time_safe("10:30") == datetime.time(10, 30)
        assert CourtDataParser.parse_time_safe("10:30:00") == datetime.time(10, 30)
        assert CourtDataParser.parse_time_safe("14:45:30") == datetime.time(14, 45, 30)
        assert CourtDataParser.parse_time_safe(None) is None
        assert CourtDataParser.parse_time_safe("invalid-time") is None
        assert CourtDataParser.parse_time_safe("25:70:99") is None

    def test_parse_int_safe(self):
        assert CourtDataParser.parse_int_safe(4) == 4
        assert CourtDataParser.parse_int_safe("4") == 4
        assert CourtDataParser.parse_int_safe("Court Hall 4") == 4
        assert CourtDataParser.parse_int_safe("Item #18") == 18
        assert CourtDataParser.parse_int_safe("CH-05") == 5
        assert CourtDataParser.parse_int_safe(None) is None
        assert CourtDataParser.parse_int_safe("") is None
        assert CourtDataParser.parse_int_safe("no numbers here") is None

    def test_parse_str_safe_html_sanitization(self):
        assert CourtDataParser.parse_str_safe("<b>Coastal Ports</b>") == "Coastal Ports"
        assert CourtDataParser.parse_str_safe("  Plea for stay  ") == "Plea for stay"
        assert CourtDataParser.parse_str_safe("<script>alert(1)</script>Clean") == "Clean"
        assert CourtDataParser.parse_str_safe(None) == ""
        assert CourtDataParser.parse_str_safe(123) == "123"


class TestCourtDataParserScenarios:
    """Tests for full payload parsing across mock scenarios."""

    def test_scenario_a_successful_payload_parsing(self):
        """Scenario A: Parse full valid court payload into typed structure."""
        parsed = CourtDataParser.parse_case_payload(SCENARIO_A_SUCCESSFUL_PAYLOAD)

        assert isinstance(parsed, ParsedCourtCasePayload)
        assert parsed.case_type == "WP"
        assert parsed.case_number == "8801"
        assert parsed.filing_year == 2024
        assert parsed.petitioner == "Coastal Ports Authority"
        assert parsed.respondent == "Maritime Workers Union"
        assert parsed.court_hall_number == 4
        assert parsed.next_hearing_date == datetime.date(2026, 11, 20)
        assert parsed.source_status == "LISTED"
        assert parsed.token_number == "TKN-8801-04"

        # Hearings parsed
        assert len(parsed.hearings) == 2
        assert parsed.hearings[0].hearing_date == datetime.date(2026, 11, 20)
        assert parsed.hearings[0].court_hall_number == 4
        assert parsed.hearings[0].item_number == 18
        assert "Arguments heard" in parsed.hearings[0].business_conducted

        # Judgments parsed
        assert len(parsed.judgments) == 1
        assert parsed.judgments[0].judgment_date == datetime.date(2024, 10, 15)
        assert parsed.judgments[0].order_number == "WP-8801-ORD-01"
        assert parsed.judgments[0].document_link.startswith("https://")

    def test_scenario_b_missing_optional_fields_parsing(self):
        """Scenario B: Parse payload with missing optional fields safely without crashing."""
        parsed = CourtDataParser.parse_case_payload(SCENARIO_B_MISSING_FIELDS_PAYLOAD)

        assert parsed.case_type == "WP"
        assert parsed.case_number == "8801"
        assert parsed.filing_year == 2024
        assert parsed.petitioner_advocate == ""
        assert parsed.respondent_advocate == ""
        assert parsed.bench == ""
        assert parsed.court_hall_number is None
        assert parsed.next_hearing_date is None
        assert parsed.item_number is None
        assert parsed.token_number is None
        assert parsed.source_status == "NOT_LISTED"
        assert parsed.hearings == []
        assert parsed.judgments == []

    def test_scenario_c1_unexpected_structure_raises(self):
        """Scenario C1: Unexpected JSON dictionary missing case identity keys raises InvalidCourtDataError."""
        with pytest.raises(InvalidCourtDataError) as exc_info:
            CourtDataParser.parse_case_payload(SCENARIO_C1_UNEXPECTED_STRUCTURE)
        assert "missing required case identity fields" in str(exc_info.value).lower()

    def test_scenario_c2_invalid_field_types_raises(self):
        """Scenario C2: Malformed identity field types (e.g. non-numeric filing year) raises InvalidCourtDataError."""
        with pytest.raises(InvalidCourtDataError) as exc_info:
            CourtDataParser.parse_case_payload(SCENARIO_C2_INVALID_TYPES)
        assert "invalid" in str(exc_info.value).lower()

    def test_scenario_c3_malformed_dates_handled_safely(self):
        """Scenario C3: Malformed dates are ignored/nulled safely without aborting valid fields."""
        parsed = CourtDataParser.parse_case_payload(SCENARIO_C3_MALFORMED_DATES)

        assert parsed.case_type == "WP"
        assert parsed.case_number == "8801"
        assert parsed.filing_year == 2024
        # Malformed next_hearing_date "99-99-9999" falls back to None safely
        assert parsed.next_hearing_date is None
        # Malformed hearing dates are excluded or set to None safely
        assert all(h.hearing_date is not None for h in parsed.hearings)
        # Malformed judgments with unparseable dates are skipped
        assert len(parsed.judgments) == 0

    def test_scenario_c4_html_error_page_raises(self):
        """Scenario C4: HTML response string instead of JSON dictionary raises InvalidCourtDataError."""
        with pytest.raises(InvalidCourtDataError) as exc_info:
            CourtDataParser.parse_case_payload(SCENARIO_C4_UNEXPECTED_HTML)
        assert "expected json dictionary" in str(exc_info.value).lower()

    def test_scenario_c5_empty_payload_raises(self):
        """Scenario C5: Empty response body raises InvalidCourtDataError."""
        with pytest.raises(InvalidCourtDataError):
            CourtDataParser.parse_case_payload(SCENARIO_C5_EMPTY_DICT)

        with pytest.raises(InvalidCourtDataError):
            CourtDataParser.parse_case_payload(SCENARIO_C5_EMPTY_STRING)
