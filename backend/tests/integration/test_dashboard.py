import datetime

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.cases.models import Case, Hearing, Judgment
from apps.court_data.models import CourtListing
from apps.notifications.models import NotificationHistory
from apps.reminders.models import Reminder

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def advocate_a(db):
    return User.objects.create_user(
        username="advocate_a",
        email="advocate_a@example.com",
        password="ValidPassword123!",
    )


@pytest.fixture
def advocate_b(db):
    return User.objects.create_user(
        username="advocate_b",
        email="advocate_b@example.com",
        password="ValidPassword123!",
    )


@pytest.mark.django_db
class TestDashboardEndpoint:
    """Integration test suite for the aggregated Lawyer Dashboard API."""

    def test_dashboard_requires_authentication(self, api_client):
        """Anonymous access must be rejected with 401 Unauthorized."""
        url = reverse("cases:dashboard")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_dashboard_empty_state_for_new_lawyer(self, api_client, advocate_a):
        """A lawyer without cases receives clean zeroed statistics and empty lists."""
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:dashboard")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert data["summary"] == {
            "total_cases": 0,
            "pending_cases": 0,
            "disposed_cases": 0,
            "adjourned_cases": 0,
        }
        assert data["today_hearings"] == []
        assert data["upcoming_hearings"] == []
        assert data["upcoming_reminders"] == []
        assert data["recent_notifications"] == []
        assert data["sync_status"]["last_synced_at"] is None
        assert data["sync_status"]["is_fresh"] is False
        assert data["sync_status"]["status"] == "NEVER_SYNCED"

    def test_dashboard_summary_statistics_calculation(self, api_client, advocate_a):
        """Verify proper aggregation of total, pending, disposed, and adjourned cases."""
        api_client.force_authenticate(user=advocate_a)

        # 1. Active pending case
        c1 = Case.objects.create(
            case_type="WP",
            case_number="101",
            filing_year=2024,
            petitioner="Petitioner One",
            respondent="Respondent One",
            current_stage="PENDING",
        )
        c1.tracked_by.add(advocate_a)

        # 2. Disposed case by stage
        c2 = Case.objects.create(
            case_type="WP",
            case_number="102",
            filing_year=2024,
            petitioner="Petitioner Two",
            respondent="Respondent Two",
            current_stage="DISPOSED",
        )
        c2.tracked_by.add(advocate_a)

        # 3. Adjourned case
        c3 = Case.objects.create(
            case_type="WA",
            case_number="103",
            filing_year=2024,
            petitioner="Petitioner Three",
            respondent="Respondent Three",
            current_stage="ADJOURNED",
        )
        c3.tracked_by.add(advocate_a)

        # 4. Pending stage case but with Judgment -> counts as disposed
        c4 = Case.objects.create(
            case_type="CRLP",
            case_number="104",
            filing_year=2024,
            petitioner="Petitioner Four",
            respondent="Respondent Four",
            current_stage="PENDING",
        )
        c4.tracked_by.add(advocate_a)
        Judgment.objects.create(
            case=c4,
            judgment_date=timezone.now().date(),
            order_number="ORD/104/2024",
            summary="Judgment allowed",
        )

        url = reverse("cases:dashboard")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        summary = response.data["summary"]

        assert summary["total_cases"] == 4
        assert summary["disposed_cases"] == 2  # c2 (DISPOSED stage) + c4 (has Judgment)
        assert summary["adjourned_cases"] == 1  # c3
        assert summary["pending_cases"] == 2  # 4 total - 2 disposed = 2 active pending

    def test_dashboard_today_and_upcoming_hearings_filtering(self, api_client, advocate_a):
        """Today and upcoming hearings are partitioned and ordered correctly."""
        api_client.force_authenticate(user=advocate_a)
        today = timezone.localdate() if hasattr(timezone, "localdate") else timezone.now().date()

        case = Case.objects.create(
            case_type="WP",
            case_number="201",
            filing_year=2024,
            petitioner="Petitioner Alpha",
            respondent="State of AP",
            bench="Court Hall 5 - Hon'ble Justice Reddy",
            court_hall_number=5,
        )
        case.tracked_by.add(advocate_a)

        # Today's hearing
        h_today = Hearing.objects.create(
            case=case,
            hearing_date=today,
            hearing_time=datetime.time(10, 30),
            court_hall_number=5,
            item_number=12,
            status="SCHEDULED",
        )

        # Upcoming hearing tomorrow
        tomorrow = today + datetime.timedelta(days=1)
        h_upcoming = Hearing.objects.create(
            case=case,
            hearing_date=tomorrow,
            hearing_time=datetime.time(11, 0),
            court_hall_number=5,
            item_number=4,
            status="SCHEDULED",
        )

        # Past hearing (should not appear)
        yesterday = today - datetime.timedelta(days=1)
        Hearing.objects.create(
            case=case,
            hearing_date=yesterday,
            hearing_time=datetime.time(10, 30),
            status="COMPLETED",
        )

        # Cancelled hearing today (should not appear)
        Hearing.objects.create(
            case=case,
            hearing_date=today,
            hearing_time=datetime.time(14, 0),
            status="CANCELLED",
        )

        url = reverse("cases:dashboard")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Today's hearings verification
        assert len(data["today_hearings"]) == 1
        today_item = data["today_hearings"][0]
        assert today_item["id"] == h_today.id
        assert today_item["case_number"] == "WP 201/2024"
        assert today_item["item_number"] == 12
        assert today_item["court_hall"] == 5
        assert today_item["judge"] == "Court Hall 5 - Hon'ble Justice Reddy"
        assert today_item["status"] == "SCHEDULED"

        # Upcoming hearings verification
        assert len(data["upcoming_hearings"]) == 1
        upcoming_item = data["upcoming_hearings"][0]
        assert upcoming_item["id"] == h_upcoming.id
        assert upcoming_item["case_number"] == "WP 201/2024"
        assert upcoming_item["hearing_date"] == tomorrow.isoformat()

    def test_dashboard_reminders_and_notifications(self, api_client, advocate_a):
        """Active reminders and recent notifications are properly exposed."""
        api_client.force_authenticate(user=advocate_a)
        now = timezone.now()

        case = Case.objects.create(
            case_type="WP",
            case_number="301",
            filing_year=2024,
            petitioner="Petitioner Gamma",
            respondent="Respondent Gamma",
        )
        case.tracked_by.add(advocate_a)

        # Active pending reminder
        rem = Reminder.objects.create(
            advocate=advocate_a,
            case=case,
            title="File Rejoinder Affidavit",
            reminder_type="FILING",
            status="PENDING",
            due_date=now + datetime.timedelta(days=2),
        )

        # Cancelled reminder (should not appear)
        Reminder.objects.create(
            advocate=advocate_a,
            case=case,
            title="Old Note",
            reminder_type="GENERAL",
            status="CANCELLED",
            due_date=now + datetime.timedelta(days=1),
        )

        # Notification
        notif = NotificationHistory.objects.create(
            user=advocate_a,
            title="Item 12 Called",
            body="Your matter WP 301/2024 is being taken up now in Hall 3",
            category="TOKEN_ALERT",
            is_read=False,
            data_payload={"case_id": case.id},
        )

        # Court listing sync
        CourtListing.objects.create(
            case=case,
            court_name="High Court of Andhra Pradesh",
            court_hall=3,
            listing_date=now.date(),
            last_synced_at=now,
        )

        url = reverse("cases:dashboard")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert len(data["upcoming_reminders"]) == 1
        assert data["upcoming_reminders"][0]["id"] == rem.id
        assert data["upcoming_reminders"][0]["title"] == "File Rejoinder Affidavit"
        assert data["upcoming_reminders"][0]["case_number"] == "WP 301/2024"

        assert len(data["recent_notifications"]) == 1
        assert data["recent_notifications"][0]["id"] == notif.id
        assert data["recent_notifications"][0]["title"] == "Item 12 Called"
        assert data["recent_notifications"][0]["is_read"] is False

        assert data["sync_status"]["is_fresh"] is True
        assert data["sync_status"]["status"] == "FRESH"

    def test_dashboard_strict_advocate_data_isolation(self, api_client, advocate_a, advocate_b):
        """Ensure Advocate A cannot view cases, reminders, or notifications belonging to Advocate B."""
        # Setup Advocate A data
        case_a = Case.objects.create(
            case_type="WP",
            case_number="401",
            filing_year=2024,
            petitioner="Party A",
            respondent="State of AP",
        )
        case_a.tracked_by.add(advocate_a)
        Reminder.objects.create(
            advocate=advocate_a,
            case=case_a,
            title="Advocate A Reminder",
            due_date=timezone.now() + datetime.timedelta(days=1),
            status="PENDING",
        )
        NotificationHistory.objects.create(
            user=advocate_a,
            title="Advocate A Notification",
            body="Notification for A",
            category="GENERAL",
        )

        # Setup Advocate B data
        case_b = Case.objects.create(
            case_type="WP",
            case_number="402",
            filing_year=2024,
            petitioner="Party B",
            respondent="State of AP",
        )
        case_b.tracked_by.add(advocate_b)
        Reminder.objects.create(
            advocate=advocate_b,
            case=case_b,
            title="Advocate B Reminder",
            due_date=timezone.now() + datetime.timedelta(days=1),
            status="PENDING",
        )
        NotificationHistory.objects.create(
            user=advocate_b,
            title="Advocate B Notification",
            body="Notification for B",
            category="GENERAL",
        )

        # Test Advocate A view
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:dashboard")
        res_a = api_client.get(url)
        assert res_a.status_code == status.HTTP_200_OK

        assert res_a.data["summary"]["total_cases"] == 1
        assert len(res_a.data["upcoming_reminders"]) == 1
        assert res_a.data["upcoming_reminders"][0]["title"] == "Advocate A Reminder"
        assert len(res_a.data["recent_notifications"]) == 1
        assert res_a.data["recent_notifications"][0]["title"] == "Advocate A Notification"

        # Test Advocate B view
        api_client.force_authenticate(user=advocate_b)
        res_b = api_client.get(url)
        assert res_b.status_code == status.HTTP_200_OK

        assert res_b.data["summary"]["total_cases"] == 1
        assert len(res_b.data["upcoming_reminders"]) == 1
        assert res_b.data["upcoming_reminders"][0]["title"] == "Advocate B Reminder"
        assert len(res_b.data["recent_notifications"]) == 1
        assert res_b.data["recent_notifications"][0]["title"] == "Advocate B Notification"
