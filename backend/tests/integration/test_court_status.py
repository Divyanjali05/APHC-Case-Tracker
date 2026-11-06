"""Comprehensive integration test suite for Court Token Alerts and Live Status Architecture (Phase 5)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, CaseHistory
from apps.court_data.models import CourtListing, CourtStatusObservation
from apps.court_data.providers import (
    APHCRegistryMockAdapter,
    CourtDataProviderError,
    CourtDataProviderTimeoutError,
    CourtListingObservation,
    set_court_data_provider_override,
)
from apps.court_data.services import CourtStatusSyncService
from apps.court_data.status_mapping import (
    NormalizedCourtStatus,
    is_meaningful_status_transition,
    normalize_source_status,
)
from apps.court_data.tasks import sync_tracked_case_statuses
from apps.notifications.models import NotificationHistory
from apps.notifications.services import NotificationService

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP77772020",
        password="ValidPassword123!",
        first_name="Radha",
        last_name="Krishna",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2020",
        role="SENIOR",
    )
    return user


@pytest.fixture
def other_advocate(db):
    user = User.objects.create_user(
        username="AP66662019",
        password="ValidPassword456!",
        first_name="Harish",
        last_name="Chandra",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/6666/2019",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def advocate_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="8801",
        filing_year=2024,
        petitioner="Coastal Ports Authority",
        respondent="Maritime Workers Union",
        current_stage="HEARING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.fixture
def other_case(db, other_advocate):
    case = Case.objects.create(
        case_type="WA",
        case_number="9901",
        filing_year=2024,
        petitioner="Private Enterprise Ltd",
        respondent="State of AP",
        current_stage="PENDING",
    )
    case.tracked_by.add(other_advocate)
    return case


@pytest.fixture
def auth_client(advocate):
    client = APIClient()
    client.force_authenticate(user=advocate)
    return client


@pytest.fixture
def other_auth_client(other_advocate):
    client = APIClient()
    client.force_authenticate(user=other_advocate)
    return client


@pytest.fixture(autouse=True)
def reset_provider_override():
    """Ensure mock provider override and rate limit caches are clean for each test."""
    from django.core.cache import cache

    cache.clear()
    set_court_data_provider_override(None)
    yield
    cache.clear()
    set_court_data_provider_override(None)


@pytest.mark.django_db
class TestCourtStatusAndTokenAlerts:
    """Verification for Phase 5 Court Token Alerts and Live Status Architecture."""

    def test_mock_provider_returns_valid_structured_data(self):
        """1. Mock provider returns valid structured observation fixture."""
        provider = APHCRegistryMockAdapter()
        obs = provider.fetch_case_status("WP", "8801", 2024)

        assert obs is not None
        assert obs.case_type == "WP"
        assert obs.case_number == "8801"
        assert obs.filing_year == 2024
        assert obs.is_mock is True
        assert obs.provider_name == "APHC_REGISTRY_MOCK"
        assert obs.court_hall == 4
        assert obs.item_number == 18
        assert obs.source_status == "listed"

    def test_court_listing_associated_with_correct_case(self, advocate, advocate_case):
        """2. Court listing is associated with the correct case matter."""
        listing, obs, changed = CourtStatusSyncService.sync_case_status(advocate_case)

        assert listing is not None
        assert listing.case == advocate_case
        assert listing.court_hall == 4
        assert listing.item_number == 18
        assert listing.normalized_status == NormalizedCourtStatus.LISTED
        assert listing.last_synced_at is not None

    def test_status_normalization_known_statuses(self):
        """3. Status normalization maps various recognized court terms to normalized states."""
        assert normalize_source_status("listed") == (NormalizedCourtStatus.LISTED, True)
        assert normalize_source_status("token_allocated") == (
            NormalizedCourtStatus.TOKEN_ALLOCATED,
            True,
        )
        assert normalize_source_status("waiting") == (NormalizedCourtStatus.WAITING, True)
        assert normalize_source_status("called") == (NormalizedCourtStatus.CALLED, True)
        assert normalize_source_status("in_progress") == (NormalizedCourtStatus.IN_PROGRESS, True)
        assert normalize_source_status("completed") == (NormalizedCourtStatus.COMPLETED, True)
        assert normalize_source_status("adjourned") == (NormalizedCourtStatus.ADJOURNED, True)
        assert normalize_source_status("struck_off") == (NormalizedCourtStatus.CANCELLED, True)

    def test_unknown_source_status_preserved_safely(self, advocate_case):
        """4. Unknown source statuses are preserved safely as UNKNOWN without misleading mapping."""
        norm_status, is_known = normalize_source_status("SPECIAL_BENCH_CUSTOM_CODE_88")
        assert norm_status == NormalizedCourtStatus.UNKNOWN
        assert is_known is False

        mock_provider = APHCRegistryMockAdapter()
        mock_provider.set_case_override(
            "WP",
            "8801",
            2024,
            source_status="SPECIAL_BENCH_CUSTOM_CODE_88",
            court_hall=2,
            item_number=9,
        )

        listing, obs, changed = CourtStatusSyncService.sync_case_status(
            advocate_case, provider=mock_provider
        )
        assert listing.normalized_status == NormalizedCourtStatus.UNKNOWN
        assert listing.source_status == "SPECIAL_BENCH_CUSTOM_CODE_88"
        assert obs.safe_metadata["is_recognized_source_status"] is False

    def test_first_observation_creates_expected_records(self, advocate_case):
        """5. First observation creates expected listing and historical observation records."""
        assert CourtListing.objects.filter(case=advocate_case).count() == 0
        assert CourtStatusObservation.objects.filter(case=advocate_case).count() == 0

        listing, obs, changed = CourtStatusSyncService.sync_case_status(advocate_case)

        assert CourtListing.objects.filter(case=advocate_case).count() == 1
        assert CourtStatusObservation.objects.filter(case=advocate_case).count() == 1
        assert obs.court_listing == listing
        assert changed is True

    def test_meaningful_status_transitions_detected(self):
        """6. Meaningful status transitions are detected while noise is filtered."""
        # Meaningful transitions
        assert is_meaningful_status_transition("LISTED", "TOKEN_ALLOCATED") is True
        assert is_meaningful_status_transition("TOKEN_ALLOCATED", "CALLED") is True
        assert is_meaningful_status_transition("CALLED", "IN_PROGRESS") is True
        assert is_meaningful_status_transition("IN_PROGRESS", "COMPLETED") is True
        assert is_meaningful_status_transition("LISTED", "ADJOURNED") is True

        # Non-meaningful transitions
        assert is_meaningful_status_transition("LISTED", "LISTED") is False
        assert is_meaningful_status_transition("NOT_LISTED", "NOT_LISTED") is False
        assert is_meaningful_status_transition("NOT_LISTED", "UNKNOWN") is False

    def test_repeated_unchanged_observations_do_not_create_duplicate_alerts(
        self, advocate, advocate_case
    ):
        """7. Repeated identical observations record history but do NOT create duplicate alerts."""
        mock_provider = APHCRegistryMockAdapter()
        set_court_data_provider_override(mock_provider)

        # Run 1: Initial observation (meaningful change)
        _, _, changed_1 = CourtStatusSyncService.sync_case_status(advocate_case)
        assert changed_1 is True
        assert (
            NotificationHistory.objects.filter(user=advocate, category="TOKEN_ALERT").count() == 1
        )

        # Run 2: Exact same observation (no change)
        _, _, changed_2 = CourtStatusSyncService.sync_case_status(advocate_case)
        assert changed_2 is False

        # Observations count increases to 2 (history preserved), but NO new alert is created
        assert CourtStatusObservation.objects.filter(case=advocate_case).count() == 2
        assert (
            NotificationHistory.objects.filter(user=advocate, category="TOKEN_ALERT").count() == 1
        )

    def test_status_history_is_preserved_chronologically(self, advocate_case):
        """8. Status history is preserved chronologically across transitions."""
        mock_provider = APHCRegistryMockAdapter()

        # Step 1: Listed
        mock_provider.set_case_override(
            "WP", "8801", 2024, source_status="listed", court_hall=3, item_number=10
        )
        CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)

        # Step 2: Token Allocated
        mock_provider.set_case_override(
            "WP",
            "8801",
            2024,
            source_status="token_allocated",
            court_hall=3,
            item_number=10,
            token_number="TKN-8801-01",
        )
        CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)

        # Step 3: Called
        mock_provider.set_case_override(
            "WP",
            "8801",
            2024,
            source_status="called",
            court_hall=3,
            item_number=10,
            token_number="TKN-8801-01",
        )
        CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)

        history = CourtStatusObservation.objects.filter(case=advocate_case).order_by("created_at")
        assert history.count() == 3
        statuses = [h.normalized_status for h in history]
        assert statuses == [
            NormalizedCourtStatus.LISTED,
            NormalizedCourtStatus.TOKEN_ALLOCATED,
            NormalizedCourtStatus.CALLED,
        ]

    def test_case_history_audit_trail_records_transitions(self, advocate_case):
        """9. CaseHistory records COURT_STATUS_CHANGED audit entries."""
        mock_provider = APHCRegistryMockAdapter()

        # Initial sync
        mock_provider.set_case_override(
            "WP", "8801", 2024, source_status="listed", court_hall=2, item_number=5
        )
        CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)

        # Transition to CALLED
        mock_provider.set_case_override(
            "WP", "8801", 2024, source_status="called", court_hall=2, item_number=5
        )
        CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)

        entries = CaseHistory.objects.filter(case=advocate_case, event_type="COURT_STATUS_CHANGED")
        assert entries.count() == 2
        last_entry = entries.order_by("-created_at").first()
        assert "CALLED" in last_entry.new_value
        assert "Court Hall 2" in last_entry.description

    def test_notifications_created_for_relevant_status_changes(self, advocate, advocate_case):
        """10. Push/in-app notifications are dispatched when a case is CALLED."""
        mock_provider = APHCRegistryMockAdapter()
        mock_provider.set_case_override(
            "WP",
            "8801",
            2024,
            source_status="called",
            court_hall=5,
            item_number=12,
            token_number="TKN-8801-99",
        )

        with patch.object(
            NotificationService, "dispatch_push_to_devices", return_value=1
        ) as mock_dispatch:
            CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)

        assert mock_dispatch.called
        notification = NotificationHistory.objects.filter(
            user=advocate, category="TOKEN_ALERT"
        ).first()
        assert notification is not None
        assert "MATTER CALLED" in notification.title
        assert "Court Hall 5" in notification.body
        assert "Item #12" in notification.body

    def test_notification_dispatch_idempotent_on_retry(self, advocate, advocate_case):
        """11. Notification dispatch logic reuses existing NotificationHistory on retry."""
        mock_provider = APHCRegistryMockAdapter()
        mock_provider.set_case_override(
            "WP", "8801", 2024, source_status="called", court_hall=4, item_number=7
        )

        # First dispatch
        _, obs, _ = CourtStatusSyncService.sync_case_status(advocate_case, provider=mock_provider)
        assert (
            NotificationHistory.objects.filter(user=advocate, category="TOKEN_ALERT").count() == 1
        )

        # Simulate re-triggering notification dispatch on the same observation
        CourtStatusSyncService.dispatch_status_change_notifications(
            case=advocate_case,
            observation=obs,
            old_status="LISTED",
            new_status="CALLED",
        )

        # Still exactly 1 notification history record
        assert (
            NotificationHistory.objects.filter(user=advocate, category="TOKEN_ALERT").count() == 1
        )

    def test_cross_advocate_status_access_rejected(self, other_auth_client, advocate_case):
        """12. Advocate cannot access another advocate's case court status (404)."""
        url = reverse("cases:court_status", kwargs={"case_id": advocate_case.id})
        response = other_auth_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

        sync_url = reverse("cases:court_status_sync", kwargs={"case_id": advocate_case.id})
        sync_response = other_auth_client.post(sync_url)
        assert sync_response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_requests_rejected(self, advocate_case):
        """13. Unauthenticated requests are rejected with 401 Unauthorized."""
        anon_client = APIClient()

        url = reverse("cases:court_status", kwargs={"case_id": advocate_case.id})
        assert anon_client.get(url).status_code == status.HTTP_401_UNAUTHORIZED

        sync_url = reverse("cases:court_status_sync", kwargs={"case_id": advocate_case.id})
        assert anon_client.post(sync_url).status_code == status.HTTP_401_UNAUTHORIZED

    def test_manual_sync_authorization_and_data_return(self, auth_client, advocate_case):
        """14. Authorized advocate can manually request court status sync."""
        url = reverse("cases:court_status_sync", kwargs={"case_id": advocate_case.id})
        response = auth_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "success"
        assert response.data["case_id"] == advocate_case.id
        assert response.data["listing"] is not None
        assert response.data["listing"]["court_hall"] == 4
        assert response.data["listing"]["item_number"] == 18

    def test_manual_sync_rate_limiting_throttling(self, auth_client, advocate_case):
        """15. Rapid consecutive manual sync requests are rate-limited with 429 Throttled."""
        url = reverse("cases:court_status_sync", kwargs={"case_id": advocate_case.id})

        # First request succeeds
        res1 = auth_client.post(url)
        assert res1.status_code == status.HTTP_200_OK

        # Immediate second request must be throttled
        res2 = auth_client.post(url)
        assert res2.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "wait before requesting" in str(res2.data)

    def test_provider_timeout_handling(self, advocate_case):
        """16. Provider timeout raises CourtDataProviderTimeoutError without breaking state."""
        timeout_provider = APHCRegistryMockAdapter(simulate_timeout=True)

        with pytest.raises(CourtDataProviderTimeoutError):
            CourtStatusSyncService.sync_case_status(advocate_case, provider=timeout_provider)

    def test_provider_error_does_not_overwrite_last_successful_status(self, advocate_case):
        """17. Provider failures never overwrite existing valid listing status with empty data."""
        # 1. Establish successful listing
        listing, _, _ = CourtStatusSyncService.sync_case_status(advocate_case)
        assert listing.normalized_status == NormalizedCourtStatus.LISTED
        assert listing.item_number == 18

        # 2. Provider encounters network error
        error_provider = APHCRegistryMockAdapter(simulate_error=True)
        with pytest.raises(CourtDataProviderError):
            CourtStatusSyncService.sync_case_status(advocate_case, provider=error_provider)

        # 3. Listing remains intact and valid
        listing.refresh_from_db()
        assert listing.normalized_status == NormalizedCourtStatus.LISTED
        assert listing.item_number == 18

    def test_one_case_failure_does_not_abort_batch_sync(
        self, advocate, other_advocate, advocate_case, other_case
    ):
        """18. Individual case failure in batch sync does not abort processing for other cases."""
        mock_provider = APHCRegistryMockAdapter()
        orig_fetch = mock_provider.fetch_case_status

        # Set WP 8801 to fail with error, while WA 9901 succeeds
        def patched_fetch(case_type, case_number, filing_year):
            if case_number == "8801":
                raise CourtDataProviderError("Gateway connection dropped for item 8801")
            return orig_fetch(case_type, case_number, filing_year)

        with patch.object(mock_provider, "fetch_case_status", side_effect=patched_fetch):
            results = CourtStatusSyncService.sync_all_tracked_cases(provider=mock_provider)

        assert results["total_cases"] == 2
        assert results["synced_count"] == 1
        assert results["error_count"] == 1
        # WA 9901 was successfully synced despite WP 8801 error
        assert CourtListing.objects.filter(case=other_case).count() == 1

    def test_repeated_celery_task_execution_is_idempotent(self, advocate_case):
        """19. Repeated Celery periodic task execution is idempotent."""
        # First Celery run
        res1 = sync_tracked_case_statuses()
        assert res1["synced_count"] >= 1
        assert res1["changed_count"] >= 1

        # Second Celery run with same data
        res2 = sync_tracked_case_statuses()
        assert res2["synced_count"] >= 1
        assert res2["changed_count"] == 0  # No new transitions detected

    def test_concurrent_sync_execution_preserves_single_listing(self, advocate_case):
        """20. Multiple consecutive syncs do not duplicate active CourtListing records."""
        provider = APHCRegistryMockAdapter()
        for _ in range(3):
            CourtStatusSyncService.sync_case_status(advocate_case, provider=provider)

        # Exactly 1 active CourtListing record exists for the case
        assert CourtListing.objects.filter(case=advocate_case).count() == 1
        # Observations recorded accurately
        assert CourtStatusObservation.objects.filter(case=advocate_case).count() == 3

    def test_celery_task_overlap_prevention_skips_concurrent_run(self, advocate_case):
        """21. Celery task skips execution if a previous batch sync is already running."""
        from apps.court_data.tasks import TASK_LOCK_KEY

        # Simulate lock held by another worker
        cache.set(TASK_LOCK_KEY, True, timeout=290)

        result = sync_tracked_case_statuses()
        assert result.get("skipped_due_to_overlap") == 1
        assert result["synced_count"] == 0

        # Clean up lock
        cache.delete(TASK_LOCK_KEY)

        # Runs normally when lock is released
        result2 = sync_tracked_case_statuses()
        assert result2.get("skipped_due_to_overlap") is None
        assert result2["synced_count"] >= 1

    def test_multiple_court_listings_across_distinct_dates_supported(self, advocate_case):
        """22. ForeignKey relation allows storing multiple historical listings for distinct dates."""
        import datetime

        obs_date1 = CourtListingObservation(
            case_type=advocate_case.case_type,
            case_number=advocate_case.case_number,
            filing_year=advocate_case.filing_year,
            court_name="High Court of Andhra Pradesh",
            court_hall=4,
            listing_date=datetime.date(2026, 11, 3),
            item_number=14,
            token_number="CH4-014",
            source_status="listed",
        )
        obs_date2 = CourtListingObservation(
            case_type=advocate_case.case_type,
            case_number=advocate_case.case_number,
            filing_year=advocate_case.filing_year,
            court_name="High Court of Andhra Pradesh",
            court_hall=5,
            listing_date=datetime.date(2026, 11, 20),
            item_number=8,
            token_number="CH5-008",
            source_status="listed",
        )

        listing1, _, _ = CourtStatusSyncService.record_and_process_observation(
            advocate_case, obs_date1
        )
        listing2, _, _ = CourtStatusSyncService.record_and_process_observation(
            advocate_case, obs_date2
        )

        assert listing1.id != listing2.id
        assert CourtListing.objects.filter(case=advocate_case).count() >= 2
        assert advocate_case.court_listings.count() >= 2
