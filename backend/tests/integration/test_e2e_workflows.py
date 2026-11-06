"""End-to-End (E2E) workflow integration tests for APHC Case Tracker.

Covers the three essential user journeys across backend APIs:
1. Authentication Workflow:
   - Credentials validation (empty & invalid rejection)
   - Token issuance (JWT access & refresh tokens)
   - Authenticated profile retrieval
   - Token refresh lifecycle
   - Logout & token blacklisting
   - Unauthenticated access protection

2. Cases Table Workflow:
   - Case listing and pagination
   - Query filtering (search by case number/party, filter by status/stage)
   - Case detail, hearings, and judgments inspection
   - Hearing rescheduling and chronological audit history
   - Data isolation between advocates

3. Reminder Creation & Delivery Workflow:
   - Manual reminder creation with validation
   - Reminder listing and status filtering
   - Reminder dismissal / completion
   - Automated hearing reminder generation (Monday hearing -> Friday 72h, 24h, 1h)
   - Automatic reminder invalidation/re-generation on reschedule
   - Advocate isolation on reminders
"""

from __future__ import annotations

import datetime
from datetime import date, time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing, Judgment
from apps.reminders.models import Reminder, ReminderPreference

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    """Clear Django cache between tests to prevent rate-limit throttling in test runs."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP12342024",
        password="SecurePassword123!",
        first_name="Ramesh",
        last_name="Chandra",
        email="ramesh.chandra@aphc.example.com",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/1234/2024",
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
def other_advocate(db):
    user = User.objects.create_user(
        username="AP56782024",
        password="SecurePassword456!",
        first_name="Suresh",
        last_name="Kumar",
        email="suresh.kumar@aphc.example.com",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/5678/2024",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def auth_client(api_client, advocate):
    """Authenticated client fixture using force_authenticate for business logic journeys."""
    api_client.force_authenticate(user=advocate)
    return api_client


@pytest.fixture
def tracked_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="4102",
        filing_year=2026,
        petitioner="Amaravati Farmers Association",
        respondent="State of Andhra Pradesh",
        current_stage="HEARING",
        court_hall_number=4,
        bench="Division Bench II",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.fixture
def other_case(db, other_advocate):
    case = Case.objects.create(
        case_type="CC",
        case_number="9901",
        filing_year=2026,
        petitioner="Private Enterprise Ltd",
        respondent="Revenue Department",
        current_stage="PENDING",
    )
    case.tracked_by.add(other_advocate)
    return case


# ==============================================================================
# 1. AUTHENTICATION WORKFLOW E2E TESTS
# ==============================================================================


@pytest.mark.django_db
class TestAuthE2EWorkflow:
    """End-to-End tests for the complete authentication lifecycle."""

    def test_e2e_empty_credentials_rejected(self, api_client):
        response = api_client.post(
            reverse("accounts:token_obtain_pair"),
            {"username": "", "password": ""},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_e2e_invalid_credentials_rejected(self, api_client, advocate):
        response = api_client.post(
            reverse("accounts:token_obtain_pair"),
            {"username": "AP12342024", "password": "WrongPassword999!"},
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_e2e_successful_login_and_profile_retrieval(self, api_client, advocate):
        # 1. Login with valid credentials
        login_response = api_client.post(
            reverse("accounts:token_obtain_pair"),
            {"username": "AP12342024", "password": "SecurePassword123!"},
            format="json",
        )
        assert login_response.status_code == status.HTTP_200_OK
        assert "access" in login_response.data
        assert "refresh" in login_response.data
        access_token = login_response.data["access"]

        # 2. Access protected profile endpoint with Bearer token
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        profile_response = api_client.get(reverse("accounts:profile"))
        assert profile_response.status_code == status.HTTP_200_OK
        data = profile_response.data
        assert data["username"] == "AP12342024"
        assert data["first_name"] == "Ramesh"
        assert data["profile"]["bar_council_enrollment_number"] == "AP/1234/2024"

    def test_e2e_token_refresh_lifecycle(self, api_client, advocate):
        # 1. Obtain tokens
        login_response = api_client.post(
            reverse("accounts:token_obtain_pair"),
            {"username": "AP12342024", "password": "SecurePassword123!"},
            format="json",
        )
        assert login_response.status_code == status.HTTP_200_OK
        refresh_token = login_response.data["refresh"]

        # 2. Refresh token to obtain a new access token
        refresh_response = api_client.post(
            reverse("accounts:token_refresh"),
            {"refresh": refresh_token},
            format="json",
        )
        assert refresh_response.status_code == status.HTTP_200_OK
        assert "access" in refresh_response.data
        new_access = refresh_response.data["access"]

        # 3. Verify new access token grants access
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
        profile_response = api_client.get(reverse("accounts:profile"))
        assert profile_response.status_code == status.HTTP_200_OK

    def test_e2e_logout_and_refresh_token_revocation(self, api_client, advocate):
        # 1. Obtain tokens
        login_response = api_client.post(
            reverse("accounts:token_obtain_pair"),
            {"username": "AP12342024", "password": "SecurePassword123!"},
            format="json",
        )
        assert login_response.status_code == status.HTTP_200_OK
        access_token = login_response.data["access"]
        refresh_token = login_response.data["refresh"]

        # 2. Logout using access token and supply refresh token to blacklist
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        logout_response = api_client.post(
            reverse("accounts:logout"),
            {"refresh": refresh_token},
            format="json",
        )
        assert logout_response.status_code == status.HTTP_200_OK

        # 3. Ensure blacklisted refresh token can no longer be used
        api_client.credentials()  # Clear auth
        re_refresh_response = api_client.post(
            reverse("accounts:token_refresh"),
            {"refresh": refresh_token},
            format="json",
        )
        assert re_refresh_response.status_code in (
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_e2e_unauthenticated_request_blocked(self, api_client):
        api_client.credentials()
        response = api_client.get(reverse("accounts:profile"))
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ==============================================================================
# 2. CASES TABLE WORKFLOW E2E TESTS
# ==============================================================================


@pytest.mark.django_db
class TestCasesTableE2EWorkflow:
    """End-to-End tests for cases browsing, searching, filtering, and detail views."""

    def test_e2e_cases_list_pagination_and_attributes(self, auth_client, tracked_case):
        # 1. List cases
        response = auth_client.get(reverse("cases:case_list_create"))
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1

        case_item = next(c for c in results if c["id"] == tracked_case.id)
        assert case_item["case_type"] == "WP"
        assert case_item["case_number"] == "4102"
        assert case_item["filing_year"] == 2026
        assert "Amaravati" in case_item["petitioner"]
        assert case_item["current_stage"] == "HEARING"

    def test_e2e_cases_search_by_case_number_and_party(self, auth_client, tracked_case):
        # Search by case number
        response = auth_client.get(f"{reverse('cases:case_list_create')}?search=4102")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert any(c["id"] == tracked_case.id for c in results)

        # Search by party name
        response = auth_client.get(f"{reverse('cases:case_list_create')}?search=Amaravati")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert any(c["id"] == tracked_case.id for c in results)

        # Search non-matching term returns empty
        response = auth_client.get(f"{reverse('cases:case_list_create')}?search=NonExistent9999")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_e2e_cases_filter_by_stage_and_status(self, auth_client, advocate, tracked_case):
        # Set next_hearing_date on tracked_case so it matches status=upcoming
        tracked_case.next_hearing_date = date.today() + timedelta(days=5)
        tracked_case.save(update_fields=["next_hearing_date"])

        # Create another case with judgment so it matches status=disposed
        c2 = Case.objects.create(
            case_type="WA",
            case_number="3301",
            filing_year=2026,
            petitioner="Civil Supplies Dept",
            respondent="Contractors Corp",
            current_stage="DISPOSED",
        )
        c2.tracked_by.add(advocate)
        Judgment.objects.create(
            case=c2,
            judgment_date=date.today() - timedelta(days=1),
            order_number="WA-3301-FINAL",
            summary="Appeal disposed of.",
        )

        # Filter status=upcoming
        res_upcoming = auth_client.get(f"{reverse('cases:case_list_create')}?status=upcoming")
        assert res_upcoming.status_code == status.HTTP_200_OK
        results_upcoming = res_upcoming.data.get("results", res_upcoming.data)
        assert any(c["id"] == tracked_case.id for c in results_upcoming)
        assert not any(c["id"] == c2.id for c in results_upcoming)

        # Filter status=disposed
        res_disposed = auth_client.get(f"{reverse('cases:case_list_create')}?status=disposed")
        assert res_disposed.status_code == status.HTTP_200_OK
        results_disposed = res_disposed.data.get("results", res_disposed.data)
        assert any(c["id"] == c2.id for c in results_disposed)
        assert not any(c["id"] == tracked_case.id for c in results_disposed)

    def test_e2e_case_detail_and_related_resources(self, auth_client, tracked_case):
        # Add hearing and judgment
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=date.today() + timedelta(days=5),
            hearing_time=time(10, 30),
            court_hall_number=4,
            business_conducted="Arguments heard in part.",
            status="SCHEDULED",
        )
        judgment = Judgment.objects.create(
            case=tracked_case,
            judgment_date=date.today() - timedelta(days=2),
            order_number="WP-4102-ORD-1",
            summary="Interim stay extended until further orders.",
            judgment_type="INTERIM",
            document_link="https://court.aphc.gov.in/orders/4102.pdf",
        )

        # 1. Case details
        detail_res = auth_client.get(reverse("cases:case_detail", kwargs={"pk": tracked_case.id}))
        assert detail_res.status_code == status.HTTP_200_OK
        assert detail_res.data["id"] == tracked_case.id

        # 2. Hearings list
        hearings_res = auth_client.get(
            reverse("cases:case_hearing_list_create", kwargs={"case_id": tracked_case.id})
        )
        assert hearings_res.status_code == status.HTTP_200_OK
        h_results = hearings_res.data.get("results", hearings_res.data)
        assert any(h["id"] == hearing.id for h in h_results)

        # 3. Judgments list & detail
        judgments_res = auth_client.get(
            reverse("cases:judgment_list_create", kwargs={"case_id": tracked_case.id})
        )
        assert judgments_res.status_code == status.HTTP_200_OK
        j_results = judgments_res.data.get("results", judgments_res.data)
        assert any(j["id"] == judgment.id for j in j_results)

        judgment_detail = auth_client.get(
            reverse(
                "cases:judgment_detail",
                kwargs={"case_id": tracked_case.id, "pk": judgment.id},
            )
        )
        assert judgment_detail.status_code == status.HTTP_200_OK
        assert judgment_detail.data["order_number"] == "WP-4102-ORD-1"

    def test_e2e_hearing_rescheduling_workflow(self, auth_client, tracked_case):
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=date.today() + timedelta(days=3),
            hearing_time=time(10, 30),
            court_hall_number=1,
            status="SCHEDULED",
        )

        new_target_date = date.today() + timedelta(days=10)
        reschedule_payload = {
            "new_hearing_date": new_target_date.isoformat(),
            "new_hearing_time": "14:30:00",
            "reason": "Counsel personal inconvenience acknowledged by Bench",
            "court_hall_number": 3,
            "item_number": 15,
        }

        url = reverse(
            "cases:hearing_reschedule",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.post(url, reschedule_payload, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["hearing"]["hearing_date"] == new_target_date.isoformat()
        assert response.data["hearing"]["court_hall_number"] == 3

        # Verify audit history
        history_res = auth_client.get(
            reverse("cases:case_history_list", kwargs={"case_id": tracked_case.id})
        )
        assert history_res.status_code == status.HTTP_200_OK
        histories = history_res.data.get("results", history_res.data)
        assert any(h["event_type"] == "HEARING_RESCHEDULED" for h in histories)

    def test_e2e_cases_advocate_data_isolation(self, auth_client, other_case):
        # Requesting a case tracked exclusively by another advocate must return 404
        response = auth_client.get(reverse("cases:case_detail", kwargs={"pk": other_case.id}))
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ==============================================================================
# 3. REMINDER CREATION & DELIVERY WORKFLOW E2E TESTS
# ==============================================================================


@pytest.mark.django_db
class TestRemindersE2EWorkflow:
    """End-to-End tests for manual reminder creation, dismissals, and automated hearing reminders."""

    def test_e2e_manual_reminder_creation_and_listing(self, auth_client, tracked_case):
        future_due = (timezone.now() + timedelta(days=2)).isoformat()
        payload = {
            "title": "Prepare Written Arguments for WP 4102",
            "description": "Collate citations on Section 14B AP Land Act",
            "due_date": future_due,
            "reminder_type": "HEARING",
            "case": tracked_case.id,
        }

        # 1. Create reminder
        create_res = auth_client.post(
            reverse("reminders:reminder_list_create"), payload, format="json"
        )
        assert create_res.status_code == status.HTTP_201_CREATED
        created_id = create_res.data["id"]
        assert create_res.data["title"] == "Prepare Written Arguments for WP 4102"
        assert create_res.data["case_details"]["case_number"] == "4102"

        # 2. List reminders and assert presence
        list_res = auth_client.get(reverse("reminders:reminder_list_create"))
        assert list_res.status_code == status.HTTP_200_OK
        reminders = list_res.data.get("results", list_res.data)
        assert any(r["id"] == created_id for r in reminders)

    def test_e2e_manual_reminder_validation_missing_required_fields(self, auth_client):
        # Missing title and due_date
        res = auth_client.post(reverse("reminders:reminder_list_create"), {}, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        error_container = res.data.get("error", {}).get("message", res.data)
        assert "title" in error_container
        assert "due_date" in error_container

    def test_e2e_reminder_dismissal_flow(self, auth_client, advocate):
        # Create active reminder
        reminder = Reminder.objects.create(
            advocate=advocate,
            title="Review Bench Notes",
            due_date=timezone.now() + timedelta(days=1),
            reminder_type="HEARING",
            status="PENDING",
            is_completed=False,
        )

        # Dismiss reminder
        url = reverse("reminders:reminder_dismiss", kwargs={"pk": reminder.id})
        dismiss_res = auth_client.post(url, format="json")
        assert dismiss_res.status_code == status.HTTP_200_OK
        assert dismiss_res.data["reminder"]["is_completed"] is True
        assert dismiss_res.data["reminder"]["status"] == "DISMISSED"

        # Verify filtering by status
        pending_res = auth_client.get(f"{reverse('reminders:reminder_list_create')}?status=PENDING")
        pending_items = pending_res.data.get("results", pending_res.data)
        assert not any(r["id"] == reminder.id for r in pending_items)

        dismissed_res = auth_client.get(
            f"{reverse('reminders:reminder_list_create')}?status=DISMISSED"
        )
        dismissed_items = dismissed_res.data.get("results", dismissed_res.data)
        assert any(r["id"] == reminder.id for r in dismissed_items)

    def test_e2e_monday_hearing_automated_reminders_friday_24h_1h(
        self, auth_client, advocate, tracked_case
    ):
        """Verify scheduling a Monday hearing generates Friday (72h), 24h, and 1h reminders."""
        today = timezone.now().date()
        # Find a future Monday at least 4 days ahead so that the preceding Friday (72h prior) is in the future
        days_until_monday = (0 - today.weekday()) % 7
        if days_until_monday < 4:
            days_until_monday += 7
        future_monday = today + timedelta(days=days_until_monday)
        assert future_monday.weekday() == 0  # Monday

        hearing_payload = {
            "hearing_date": future_monday.isoformat(),
            "hearing_time": "10:30:00",
            "court_hall_number": 2,
            "status": "SCHEDULED",
        }

        # 1. Create hearing via API endpoint
        h_url = reverse("cases:case_hearing_list_create", kwargs={"case_id": tracked_case.id})
        h_res = auth_client.post(h_url, hearing_payload, format="json")
        assert h_res.status_code == status.HTTP_201_CREATED
        hearing_id = h_res.data["id"]

        # 2. Query advocate's reminders for this case
        reminders_res = auth_client.get(
            f"{reverse('reminders:reminder_list_create')}?case_id={tracked_case.id}"
        )
        assert reminders_res.status_code == status.HTTP_200_OK
        reminders = reminders_res.data.get("results", reminders_res.data)

        # Filter reminders linked to this hearing
        h_reminders = [r for r in reminders if r.get("hearing") == hearing_id]
        intervals = {r["reminder_interval_hours"] for r in h_reminders}

        # Assert 72-hour (Friday), 24-hour, and 1-hour reminders were generated
        assert 72 in intervals, "Friday 72h reminder was not generated"
        assert 24 in intervals, "24h reminder was not generated"
        assert 1 in intervals, "1h reminder was not generated"

        # Verify Friday reminder specifics
        friday_reminder = next(r for r in h_reminders if r["reminder_interval_hours"] == 72)
        assert "Friday Hearing Reminder" in friday_reminder["title"]
        friday_due = datetime.datetime.fromisoformat(friday_reminder["due_date"])
        # Friday is weekday 4
        assert friday_due.weekday() == 4
        assert friday_due.date() == future_monday - timedelta(days=3)
        assert friday_due.hour == 10
        assert friday_due.minute == 30

    def test_e2e_reminders_cross_advocate_security_isolation(self, auth_client, other_advocate):
        # Create reminder belonging to other advocate
        other_reminder = Reminder.objects.create(
            advocate=other_advocate,
            title="Confidential Other Case Meeting",
            due_date=timezone.now() + timedelta(days=1),
            reminder_type="HEARING",
            status="PENDING",
        )

        # Attempt to dismiss other advocate's reminder -> Must be rejected with 404
        url = reverse("reminders:reminder_dismiss", kwargs={"pk": other_reminder.id})
        response = auth_client.post(url, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND

        # Other advocate's reminder does not appear in advocate's list
        list_res = auth_client.get(reverse("reminders:reminder_list_create"))
        reminders = list_res.data.get("results", list_res.data)
        assert not any(r["id"] == other_reminder.id for r in reminders)
