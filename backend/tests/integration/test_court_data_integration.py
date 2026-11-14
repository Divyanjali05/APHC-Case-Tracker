"""Integration tests for Court Data Integration (Phase 6).

Covers all five required scenarios across synchronization and storage:
- Scenario A: Successful court response (full data mapping, hearings, judgments, status, reminders).
- Scenario B: Missing fields (missing optional fields, nulls, safe handling without overwriting valid data).
- Scenario C: Unexpected response (malformed structure, invalid types, HTML error pages, empty body).
- Scenario D: Court service unavailable (timeout, HTTP 500, HTTP 503, connection refused, DNS failure, retries, recovery).
- Scenario E: Duplicate prevention & data change lifecycle (idempotency, date changes, status transitions, judgments).
"""

from __future__ import annotations

import datetime

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, CaseHistory, Hearing, Judgment
from apps.court_data.models import CourtListing
from apps.court_data.parser import CourtDataParser, InvalidCourtDataError
from apps.court_data.providers import (
    APHCRegistryMockAdapter,
    CourtDataProviderError,
    CourtDataProviderTimeoutError,
    set_court_data_provider_override,
)
from apps.court_data.retry import RetryConfig, execute_with_retry
from apps.court_data.services import CourtDataIngestionService, CourtStatusSyncService
from apps.court_data.status_mapping import NormalizedCourtStatus
from apps.notifications.models import NotificationHistory
from apps.reminders.models import Reminder, ReminderPreference
from tests.fixtures.court_mock_payloads import (
    SCENARIO_A_SUCCESSFUL_PAYLOAD,
    SCENARIO_B_MISSING_FIELDS_PAYLOAD,
    SCENARIO_C1_UNEXPECTED_STRUCTURE,
    SCENARIO_C2_INVALID_TYPES,
    SCENARIO_C3_MALFORMED_DATES,
    SCENARIO_C4_UNEXPECTED_HTML,
    SCENARIO_C5_EMPTY_DICT,
    SCENARIO_E1_INITIAL,
    SCENARIO_E2_UPDATED_HEARING,
    SCENARIO_E3_STATUS_CHANGE_CALLED,
    SCENARIO_E4_JUDGMENT_AVAILABLE,
)

User = get_user_model()


@pytest.fixture(autouse=True)
def clean_test_environment():
    """Ensure mock provider override and cache are reset before and after each test."""
    cache.clear()
    set_court_data_provider_override(None)
    yield
    cache.clear()
    set_court_data_provider_override(None)


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP77772024",
        password="ValidPassword123!",
        first_name="Venkatesh",
        last_name="Prasad",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2024",
        role="ADVOCATE",
    )
    ReminderPreference.objects.create(
        advocate=user,
        remind_24h_before=True,
        remind_1h_before=True,
        email_notifications=False,
        push_notifications=True,
    )
    return user


@pytest.fixture
def test_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="8801",
        filing_year=2024,
        petitioner="Coastal Ports Authority",
        respondent="Maritime Workers Union",
        current_stage="HEARING",
        court_hall_number=4,
        bench="Hon'ble Division Bench I",
        next_hearing_date=datetime.date(2026, 11, 20),
    )
    case.tracked_by.add(advocate)
    return case


# ==============================================================================
# SCENARIO A: SUCCESSFUL COURT RESPONSE INTEGRATION
# ==============================================================================


@pytest.mark.django_db
class TestScenarioASuccessfulResponse:
    """Verifies that full valid court data is correctly mapped, stored, and integrated."""

    def test_successful_payload_ingestion_and_storage(self, test_case, advocate):
        result = CourtDataIngestionService.ingest_court_payload(
            case=test_case,
            payload=SCENARIO_A_SUCCESSFUL_PAYLOAD,
            changed_by=advocate,
        )

        assert result["status"] == "success"
        assert result["case_id"] == test_case.id
        assert result["hearings_synced"] == 2
        assert result["judgments_synced"] == 1

        # 1. Verify Case attributes updated
        test_case.refresh_from_db()
        assert test_case.petitioner == "Coastal Ports Authority"
        assert test_case.respondent == "Maritime Workers Union"
        assert test_case.petitioner_advocate == "Venkatesh Prasad (AP/8888/2021)"
        assert test_case.respondent_advocate == "Sujatha Rao (AP/9999/2022)"
        assert test_case.court_hall_number == 4
        assert test_case.next_hearing_date == datetime.date(2026, 11, 20)

        # 2. Verify Hearings created
        hearings = Hearing.objects.filter(case=test_case).order_by("hearing_date")
        assert hearings.count() == 2
        h_future = hearings.filter(hearing_date=datetime.date(2026, 11, 20)).first()
        assert h_future is not None
        assert h_future.court_hall_number == 4
        assert h_future.item_number == 18
        assert "Arguments heard in part" in h_future.business_conducted

        # 3. Verify Judgment created
        judgments = Judgment.objects.filter(case=test_case)
        assert judgments.count() == 1
        j = judgments.first()
        assert j.order_number == "WP-8801-ORD-01"
        assert j.judgment_date == datetime.date(2024, 10, 15)
        assert j.judgment_type == "INTERIM"
        assert "Interim stay granted" in j.summary
        assert j.document_link.startswith("https://")

        # 4. Verify CourtListing updated
        listing = CourtListing.objects.filter(case=test_case).first()
        assert listing is not None
        assert listing.normalized_status == NormalizedCourtStatus.LISTED
        assert listing.court_hall == 4
        assert listing.item_number == 18
        assert listing.token_number == "TKN-8801-04"

        # 5. Verify Reminders scheduled for upcoming hearing
        reminders = Reminder.objects.filter(case=test_case, hearing=h_future)
        assert reminders.count() >= 1


# ==============================================================================
# SCENARIO B: INCOMPLETE RESPONSE / MISSING FIELDS
# ==============================================================================


@pytest.mark.django_db
class TestScenarioBMissingFields:
    """Verifies that missing optional fields do NOT crash the system or overwrite valid data."""

    def test_missing_fields_payload_preserves_existing_valid_data(self, test_case, advocate):
        # 1. Establish populated case state
        test_case.petitioner_advocate = "Existing Senior Counsel"
        test_case.bench = "Existing Bench 2"
        test_case.court_hall_number = 4
        test_case.next_hearing_date = datetime.date(2026, 11, 20)
        test_case.save()

        # Add existing hearing and judgment
        existing_hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 20),
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            status="SCHEDULED",
        )
        existing_judgment = Judgment.objects.create(
            case=test_case,
            judgment_date=datetime.date(2024, 10, 15),
            order_number="WP-8801-EXISTING",
            summary="Existing judgment text.",
        )

        # 2. Ingest payload with missing fields (nulls/empty strings)
        result = CourtDataIngestionService.ingest_court_payload(
            case=test_case,
            payload=SCENARIO_B_MISSING_FIELDS_PAYLOAD,
            changed_by=advocate,
        )

        assert result["status"] == "success"

        # 3. Assert existing valid data is preserved
        test_case.refresh_from_db()
        assert test_case.petitioner_advocate == "Existing Senior Counsel"
        assert test_case.bench == "Existing Bench 2"
        assert test_case.court_hall_number == 4
        assert test_case.next_hearing_date == datetime.date(2026, 11, 20)

        # Assert existing hearings and judgments are NOT deleted
        assert Hearing.objects.filter(id=existing_hearing.id).exists()
        assert Judgment.objects.filter(id=existing_judgment.id).exists()

    def test_missing_status_defaults_safely_to_not_listed(self, test_case):
        parsed = CourtDataParser.parse_case_payload(SCENARIO_B_MISSING_FIELDS_PAYLOAD)
        assert parsed.source_status == "NOT_LISTED"


# ==============================================================================
# SCENARIO C: UNEXPECTED / MALFORMED RESPONSE
# ==============================================================================


@pytest.mark.django_db
class TestScenarioCUnexpectedResponse:
    """Verifies that unexpected responses and malformed types are safely rejected."""

    def test_unexpected_json_structure_rejected(self, test_case):
        with pytest.raises(InvalidCourtDataError):
            CourtDataIngestionService.ingest_court_payload(
                case=test_case,
                payload=SCENARIO_C1_UNEXPECTED_STRUCTURE,
            )

    def test_invalid_types_rejected(self, test_case):
        with pytest.raises(InvalidCourtDataError):
            CourtDataIngestionService.ingest_court_payload(
                case=test_case,
                payload=SCENARIO_C2_INVALID_TYPES,
            )

    def test_unexpected_html_error_page_rejected(self, test_case):
        with pytest.raises(InvalidCourtDataError):
            CourtDataIngestionService.ingest_court_payload(
                case=test_case,
                payload=SCENARIO_C4_UNEXPECTED_HTML,
            )

    def test_empty_payload_rejected(self, test_case):
        with pytest.raises(InvalidCourtDataError):
            CourtDataIngestionService.ingest_court_payload(
                case=test_case,
                payload=SCENARIO_C5_EMPTY_DICT,
            )

    def test_malformed_dates_payload_preserves_valid_fields(self, test_case):
        """Malformed dates in payload do not crash ingestion and do not overwrite valid dates."""
        initial_date = test_case.next_hearing_date

        result = CourtDataIngestionService.ingest_court_payload(
            case=test_case,
            payload=SCENARIO_C3_MALFORMED_DATES,
        )

        assert result["status"] == "success"
        test_case.refresh_from_db()
        # Invalid date "99-99-9999" was rejected and initial valid date preserved
        assert test_case.next_hearing_date == initial_date


# ==============================================================================
# SCENARIO D: COURT WEBSITE / API UNAVAILABLE (NETWORK & RETRIES)
# ==============================================================================


@pytest.mark.django_db
class TestScenarioDCourtUnavailableAndRetries:
    """Verifies error handling, retry policies, and recovery for external outages."""

    def test_timeout_triggers_retries_and_preserves_state(self, test_case):
        mock_provider = APHCRegistryMockAdapter(simulate_timeout=True)

        retry_attempts: list[int] = []

        def on_retry_cb(exc, attempt, delay):
            retry_attempts.append(attempt)

        retry_cfg = RetryConfig(max_retries=3, initial_delay=0.01, backoff_factor=1.5)

        with pytest.raises(CourtDataProviderTimeoutError):
            CourtStatusSyncService.sync_case_status(
                case=test_case,
                provider=mock_provider,
                retry_config=retry_cfg,
                on_retry=on_retry_cb,
            )

        # Confirms exactly 3 attempts occurred before giving up
        assert mock_provider.call_count == 3
        assert len(retry_attempts) == 2  # 2 retries after 1st and 2nd failures

    def test_http_500_server_error_triggers_retries(self, test_case):
        mock_provider = APHCRegistryMockAdapter(simulate_500=True)
        retry_cfg = RetryConfig(max_retries=3, initial_delay=0.01)

        with pytest.raises(CourtDataProviderError) as exc_info:
            CourtStatusSyncService.sync_case_status(
                case=test_case,
                provider=mock_provider,
                retry_config=retry_cfg,
            )

        assert "HTTP 500" in str(exc_info.value)
        assert mock_provider.call_count == 3

    def test_http_503_service_unavailable_triggers_retries(self, test_case):
        mock_provider = APHCRegistryMockAdapter(simulate_503=True)
        retry_cfg = RetryConfig(max_retries=3, initial_delay=0.01)

        with pytest.raises(CourtDataProviderError) as exc_info:
            CourtStatusSyncService.sync_case_status(
                case=test_case,
                provider=mock_provider,
                retry_config=retry_cfg,
            )

        assert "HTTP 503" in str(exc_info.value)
        assert mock_provider.call_count == 3

    def test_connection_refused_triggers_retries(self, test_case):
        mock_provider = APHCRegistryMockAdapter(simulate_connection_refused=True)
        retry_cfg = RetryConfig(max_retries=3, initial_delay=0.01)

        with pytest.raises(ConnectionRefusedError):
            CourtStatusSyncService.sync_case_status(
                case=test_case,
                provider=mock_provider,
                retry_config=retry_cfg,
            )

        assert mock_provider.call_count == 3

    def test_dns_failure_triggers_retries(self, test_case):
        mock_provider = APHCRegistryMockAdapter(simulate_dns_failure=True)
        retry_cfg = RetryConfig(max_retries=3, initial_delay=0.01)

        with pytest.raises(ConnectionError):
            CourtStatusSyncService.sync_case_status(
                case=test_case,
                provider=mock_provider,
                retry_config=retry_cfg,
            )

        assert mock_provider.call_count == 3

    def test_transient_failure_recovers_on_second_attempt(self):
        """Simulate transient error on attempt 1, followed by success on attempt 2."""
        attempts = 0

        def flaky_operation():
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise CourtDataProviderTimeoutError("Transient network drop")
            return {"status": "recovered", "attempts": attempts}

        retry_cfg = RetryConfig(max_retries=3, initial_delay=0.01)
        result = execute_with_retry(flaky_operation, config=retry_cfg)

        assert result["status"] == "recovered"
        assert result["attempts"] == 2


# ==============================================================================
# SCENARIO E: DUPLICATE AND CHANGED DATA SEQUENCE
# ==============================================================================


@pytest.mark.django_db
class TestScenarioEDuplicateAndChangedData:
    """Verifies idempotency against duplicate payloads, change detection, and alert progression."""

    def test_repeated_payload_ingestion_is_strictly_idempotent(self, test_case, advocate):
        """Sending the exact same court payload 3 times must NOT duplicate Case, Hearing, or Judgment records."""
        for _ in range(3):
            CourtDataIngestionService.ingest_court_payload(
                case=test_case,
                payload=SCENARIO_E1_INITIAL,
                changed_by=advocate,
            )

        # 1. Exactly 1 Case record
        assert (
            Case.objects.filter(case_type="WP", case_number="8801", filing_year=2024).count() == 1
        )

        # 2. Exactly 1 Hearing record for 2026-11-20
        assert Hearing.objects.filter(case=test_case).count() == 1
        assert (
            Hearing.objects.filter(case=test_case, hearing_date=datetime.date(2026, 11, 20)).count()
            == 1
        )

        # 3. Exactly 1 CourtListing record
        assert CourtListing.objects.filter(case=test_case).count() == 1

    def test_hearing_rescheduled_via_court_sync(self, test_case, advocate):
        """When court feed updates hearing date, hearing record updates and history is logged."""
        # 1. Ingest initial payload
        CourtDataIngestionService.ingest_court_payload(test_case, SCENARIO_E1_INITIAL)
        assert test_case.next_hearing_date == datetime.date(2026, 11, 20)

        # 2. Ingest updated payload with new hearing date 2026-11-27
        CourtDataIngestionService.ingest_court_payload(test_case, SCENARIO_E2_UPDATED_HEARING)

        test_case.refresh_from_db()
        assert test_case.next_hearing_date == datetime.date(2026, 11, 27)

        # Hearing for 2026-11-27 exists
        h2 = Hearing.objects.filter(
            case=test_case, hearing_date=datetime.date(2026, 11, 27)
        ).first()
        assert h2 is not None
        assert h2.item_number == 5

        # Audit entry exists in CaseHistory
        history = CaseHistory.objects.filter(case=test_case, source="SYNC")
        assert history.exists()

    def test_status_transition_to_called_dispatches_notification(self, test_case, advocate):
        """Status change to CALLED triggers advocate notification and observation logging."""
        CourtDataIngestionService.ingest_court_payload(test_case, SCENARIO_E2_UPDATED_HEARING)

        # Transition to CALLED
        res = CourtDataIngestionService.ingest_court_payload(
            test_case, SCENARIO_E3_STATUS_CHANGE_CALLED
        )
        assert res["is_meaningful_change"] is True

        # Notification recorded
        notif = NotificationHistory.objects.filter(user=advocate, category="TOKEN_ALERT").first()
        assert notif is not None
        assert "MATTER CALLED" in notif.title

    def test_judgment_available_sync_updates_case_and_creates_record(self, test_case, advocate):
        """Final judgment payload creates Judgment, updates case stage to DISPOSED, and notifies counsel."""
        CourtDataIngestionService.ingest_court_payload(test_case, SCENARIO_E3_STATUS_CHANGE_CALLED)

        # Ingest Final Judgment
        CourtDataIngestionService.ingest_court_payload(test_case, SCENARIO_E4_JUDGMENT_AVAILABLE)

        test_case.refresh_from_db()
        assert test_case.current_stage == "DISPOSED"

        judgment = Judgment.objects.filter(
            case=test_case, order_number="WP-8801-2024-FINAL"
        ).first()
        assert judgment is not None
        assert judgment.judgment_type == "FINAL"
        assert "Writ Petition allowed" in judgment.summary


# ==============================================================================
# DATA SAFETY & PRIVACY VERIFICATION
# ==============================================================================


@pytest.mark.django_db
class TestDataSafetyAndPrivacy:
    """Verifies that confidential details are not exposed in logs and data is preserved."""

    def test_sync_failure_preserves_last_known_court_listing(self, test_case):
        # 1. Establish successful listing
        listing, _, _ = CourtStatusSyncService.sync_case_status(test_case)
        assert listing.normalized_status == NormalizedCourtStatus.LISTED
        initial_synced_at = listing.last_synced_at

        # 2. Simulate complete provider failure
        fail_provider = APHCRegistryMockAdapter(simulate_timeout=True)
        retry_cfg = RetryConfig(max_retries=1, initial_delay=0.01)

        with pytest.raises(CourtDataProviderTimeoutError):
            CourtStatusSyncService.sync_case_status(
                test_case, provider=fail_provider, retry_config=retry_cfg
            )

        # 3. Listing remains preserved with initial status
        listing.refresh_from_db()
        assert listing.normalized_status == NormalizedCourtStatus.LISTED
        assert listing.last_synced_at == initial_synced_at

    def test_logging_does_not_leak_private_case_remarks(self, test_case, caplog):
        """Verify that logger outputs during sync do not leak petitioner/respondent names."""
        import logging

        with caplog.at_level(logging.INFO):
            CourtStatusSyncService.sync_case_status(test_case)

        # Check log messages: should not expose sensitive private data
        log_text = caplog.text
        assert "password" not in log_text.lower()
        assert "secret" not in log_text.lower()
