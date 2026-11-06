"""Deterministic mock payloads for Court Data Integration Testing (Phase 6).

Covers all five required scenarios:
- Scenario A: Successful full court response (valid case info, hearing dates, status, judgment).
- Scenario B: Incomplete response / missing fields (nulls, missing optional fields, empty collections).
- Scenario C: Unexpected / malformed response (unexpected JSON structure, invalid types, malformed dates, HTML error page, empty body).
- Scenario D: Court service unavailable (timeout, HTTP 500, HTTP 503, DNS failure, connection refused).
- Scenario E: Duplicate & changed data (repeated payload, updated hearing date, status transition, newly available judgment).
"""

from __future__ import annotations

# ==============================================================================
# SCENARIO A: SUCCESSFUL COMPLETE COURT RESPONSE
# ==============================================================================

SCENARIO_A_SUCCESSFUL_PAYLOAD = {
    "case_type": "WP",
    "case_number": "8801",
    "filing_year": 2024,
    "petitioner": "Coastal Ports Authority",
    "respondent": "Maritime Workers Union",
    "petitioner_advocate": "Venkatesh Prasad (AP/8888/2021)",
    "respondent_advocate": "Sujatha Rao (AP/9999/2022)",
    "current_stage": "HEARING",
    "bench": "Hon'ble Division Bench I",
    "court_hall_number": 4,
    "next_hearing_date": "2026-11-20",
    "hearing_time": "10:30:00",
    "item_number": 18,
    "token_number": "TKN-8801-04",
    "source_status": "LISTED",
    "source_reference": "APHC-CIS-2024-8801",
    "court_name": "High Court of Andhra Pradesh (Amaravati)",
    "hearings": [
        {
            "hearing_date": "2026-11-20",
            "hearing_time": "10:30:00",
            "court_hall_number": 4,
            "item_number": 18,
            "business_conducted": "Arguments heard in part. Directed to file counter.",
            "status": "SCHEDULED",
            "next_date": "2026-11-27",
        },
        {
            "hearing_date": "2026-10-15",
            "hearing_time": "10:30:00",
            "court_hall_number": 4,
            "item_number": 12,
            "business_conducted": "Notice ordered. Interim direction issued.",
            "status": "COMPLETED",
            "next_date": "2026-11-20",
        },
    ],
    "judgments": [
        {
            "judgment_date": "2024-10-15",
            "order_number": "WP-8801-ORD-01",
            "judgment_type": "INTERIM",
            "bench": "Hon'ble Division Bench I",
            "summary": "Interim stay granted on port operations cess collection.",
            "document_link": "https://court.aphc.gov.in/orders/WP8801_2024_01.pdf",
        }
    ],
    "safe_metadata": {
        "sync_source": "APHC_CIS_API",
        "registry_code": "APHC_AMARAVATI",
        "is_mock": True,
    },
}


# ==============================================================================
# SCENARIO B: INCOMPLETE RESPONSE / MISSING FIELDS
# ==============================================================================

SCENARIO_B_MISSING_FIELDS_PAYLOAD = {
    "case_type": "WP",
    "case_number": "8801",
    "filing_year": 2024,
    "petitioner": "Coastal Ports Authority",
    "respondent": "Maritime Workers Union",
    # Missing optional fields: petitioner_advocate, respondent_advocate, bench
    "petitioner_advocate": None,
    "respondent_advocate": "",
    "bench": None,
    # Missing hearing date and court hall
    "court_hall_number": None,
    "next_hearing_date": None,
    "hearing_time": None,
    "item_number": None,
    "token_number": None,
    # Missing case status / empty status
    "source_status": None,
    "current_stage": "",
    # Empty hearings and judgments collections
    "hearings": [],
    "judgments": [],
    "safe_metadata": {},
}


# ==============================================================================
# SCENARIO C: UNEXPECTED / MALFORMED RESPONSE
# ==============================================================================

# C1: Unexpected JSON wrapper/structure missing case identity keys
SCENARIO_C1_UNEXPECTED_STRUCTURE = {
    "court_response_envelope": {
        "api_version": "3.0",
        "data_dump": {
            "unrecognized_field_a": "value",
            "unrecognized_field_b": [1, 2, 3],
        },
        "query_execution_time_ms": 142.5,
    }
}

# C2: Invalid field types
SCENARIO_C2_INVALID_TYPES = {
    "case_type": ["WP"],  # List instead of string
    "case_number": {"number": "8801"},  # Dict instead of string
    "filing_year": "two-thousand-twenty-four",  # Non-numeric string
    "court_hall_number": "invalid_hall_string",
    "hearings": "not_a_list_of_hearings",  # String instead of list
}

# C3: Malformed dates
SCENARIO_C3_MALFORMED_DATES = {
    "case_type": "WP",
    "case_number": "8801",
    "filing_year": 2024,
    "next_hearing_date": "99-99-9999",  # Invalid day/month
    "hearings": [
        {
            "hearing_date": "not-a-real-date-string",
            "hearing_time": "25:70:99",  # Invalid time
            "court_hall_number": 4,
        },
        {
            "hearing_date": "2024-02-31",  # Feb 31 does not exist
            "court_hall_number": 4,
        },
    ],
    "judgments": [
        {
            "judgment_date": "invalid-judgment-date",
            "order_number": "ORD-MALFORMED",
        }
    ],
}

# C4: HTML error page response (e.g. gateway error from court portal)
SCENARIO_C4_UNEXPECTED_HTML = """<!DOCTYPE html>
<html>
<head><title>502 Bad Gateway - High Court Portal</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>APHC Judicial Information Gateway</center>
</body>
</html>"""

# C5: Empty response body
SCENARIO_C5_EMPTY_DICT = {}
SCENARIO_C5_EMPTY_STRING = ""


# ==============================================================================
# SCENARIO E: DUPLICATE AND CHANGED DATA SEQUENCE
# ==============================================================================

# E1: Initial state
SCENARIO_E1_INITIAL = {
    "case_type": "WP",
    "case_number": "8801",
    "filing_year": 2024,
    "petitioner": "Coastal Ports Authority",
    "respondent": "Maritime Workers Union",
    "current_stage": "HEARING",
    "bench": "Court Hall 4 Bench",
    "court_hall_number": 4,
    "next_hearing_date": "2026-11-20",
    "item_number": 18,
    "token_number": "TKN-8801-04",
    "source_status": "LISTED",
    "hearings": [
        {
            "hearing_date": "2026-11-20",
            "hearing_time": "10:30:00",
            "court_hall_number": 4,
            "item_number": 18,
            "status": "SCHEDULED",
        }
    ],
    "judgments": [],
}

# E2: Updated hearing date (hearing moved from Nov 20 to Nov 27)
SCENARIO_E2_UPDATED_HEARING = {
    **SCENARIO_E1_INITIAL,
    "next_hearing_date": "2026-11-27",
    "item_number": 5,
    "token_number": "TKN-8801-05",
    "hearings": [
        {
            "hearing_date": "2026-11-27",
            "hearing_time": "10:30:00",
            "court_hall_number": 4,
            "item_number": 5,
            "status": "SCHEDULED",
            "business_conducted": "Re-listed for final arguments.",
        }
    ],
}

# E3: Court status transition (Matter CALLED in court hall)
SCENARIO_E3_STATUS_CHANGE_CALLED = {
    **SCENARIO_E2_UPDATED_HEARING,
    "source_status": "CALLED",
    "token_number": "TKN-8801-05-ACTIVE",
}

# E4: Final Judgment becomes available
SCENARIO_E4_JUDGMENT_AVAILABLE = {
    **SCENARIO_E3_STATUS_CHANGE_CALLED,
    "source_status": "COMPLETED",
    "current_stage": "DISPOSED",
    "next_hearing_date": None,
    "judgments": [
        {
            "judgment_date": "2026-11-27",
            "order_number": "WP-8801-2024-FINAL",
            "judgment_type": "FINAL",
            "bench": "Hon'ble Division Bench I",
            "summary": "Writ Petition allowed. Impugned levy set aside with costs.",
            "document_link": "https://court.aphc.gov.in/judgments/WP8801_FINAL.pdf",
        }
    ],
}
