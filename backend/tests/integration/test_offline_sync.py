from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing
from apps.reminders.models import Reminder

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP77772023",
        password="ValidPassword123!",
        first_name="Radha",
        last_name="Krishna",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2023",
        role="SENIOR",
    )
    return user


@pytest.fixture
def other_advocate(db):
    user = User.objects.create_user(
        username="AP88882024",
        password="ValidPassword456!",
        first_name="Kavitha",
        last_name="Reddy",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/8888/2024",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def auth_client(advocate):
    client = APIClient()
    client.force_authenticate(user=advocate)
    return client


@pytest.fixture
def court_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="7701",
        filing_year=2024,
        petitioner="Andhra Farmers Welfare Trust",
        respondent="State of Andhra Pradesh",
        current_stage="PENDING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.fixture
def court_hearing(db, court_case):
    future_date = (timezone.now() + timedelta(days=7)).date()
    return Hearing.objects.create(
        case=court_case,
        hearing_date=future_date,
        status="SCHEDULED",
        court_hall_number=3,
        item_number=15,
    )


@pytest.mark.django_db
class TestOfflineSyncBackendIdempotency:
    """Verifies backend idempotency, duplicate prevention, and conflict detection."""

    def test_idempotent_reminder_creation_with_header(self, auth_client, advocate):
        """Posting with the same X-Idempotency-Key returns cached response without duplicate creation."""
        cache.clear()
        url = reverse("reminders:reminder_list_create")
        due_date = (timezone.now() + timedelta(days=5)).isoformat()
        payload = {
            "title": "File Counter Affidavit",
            "description": "Counter affidavit for offline sync test",
            "due_date": due_date,
            "reminder_type": "FILING",
        }
        headers = {"HTTP_X_IDEMPOTENCY_KEY": "idem-uuid-001"}

        # First submission
        res1 = auth_client.post(url, payload, format="json", **headers)
        assert res1.status_code in (status.HTTP_201_CREATED, status.HTTP_200_OK)
        created_id = res1.data["id"]

        # Duplicate submission with same idempotency key
        res2 = auth_client.post(url, payload, format="json", **headers)
        assert res2.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        assert res2.data["id"] == created_id

        # Database must have exactly 1 record
        assert (
            Reminder.objects.filter(advocate=advocate, title="File Counter Affidavit").count() == 1
        )

    def test_duplicate_reminder_prevention_same_data(self, auth_client, advocate):
        """Posting identical reminder details returns existing reminder without creating duplicates."""
        url = reverse("reminders:reminder_list_create")
        due_date = (timezone.now() + timedelta(days=6)).replace(microsecond=0).isoformat()
        payload = {
            "title": "Batta Payment Deadline",
            "description": "Process fee for respondents",
            "due_date": due_date,
            "reminder_type": "BATTA",
        }

        res1 = auth_client.post(url, payload, format="json")
        assert res1.status_code in (status.HTTP_201_CREATED, status.HTTP_200_OK)
        first_id = res1.data["id"]

        # Retry with identical fields
        res2 = auth_client.post(url, payload, format="json")
        assert res2.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        assert res2.data["id"] == first_id

        assert (
            Reminder.objects.filter(advocate=advocate, title="Batta Payment Deadline").count() == 1
        )

    def test_idempotent_reminder_dismissal(self, auth_client, advocate):
        """Marking an already dismissed reminder completed is idempotent and returns 200 OK."""
        due_date = timezone.now() + timedelta(days=2)
        reminder = Reminder.objects.create(
            advocate=advocate,
            title="Review Cause List",
            due_date=due_date,
            status="PENDING",
        )
        url = reverse("reminders:reminder_dismiss", kwargs={"pk": reminder.pk})

        res1 = auth_client.post(url)
        assert res1.status_code == status.HTTP_200_OK
        reminder.refresh_from_db()
        assert reminder.status == "DISMISSED"
        assert reminder.is_completed is True

        # Second dismissal call must succeed idempotently
        res2 = auth_client.post(url)
        assert res2.status_code == status.HTTP_200_OK
        assert res2.data["reminder"]["status"] == "DISMISSED"

    def test_conflict_detection_cancelled_hearing(
        self, auth_client, advocate, court_case, court_hearing
    ):
        """Attempting to create a reminder linked to a cancelled hearing returns 409 Conflict."""
        court_hearing.status = "CANCELLED"
        court_hearing.save(update_fields=["status"])

        url = reverse("reminders:reminder_list_create")
        due_date = (timezone.now() + timedelta(days=1)).isoformat()
        payload = {
            "title": "Cancelled Hearing Appearance",
            "due_date": due_date,
            "reminder_type": "HEARING",
            "case": court_case.id,
            "hearing": court_hearing.id,
        }

        response = auth_client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_409_CONFLICT
        assert (
            "conflict" in response.data.get("detail", "").lower()
            or "cancelled" in response.data.get("detail", "").lower()
        )

    def test_user_isolation_between_advocates(self, auth_client, advocate, other_advocate):
        """Advocates cannot access or modify each other's reminders."""
        other_client = APIClient()
        other_client.force_authenticate(user=other_advocate)

        reminder = Reminder.objects.create(
            advocate=advocate,
            title="Private Advocate Note",
            due_date=timezone.now() + timedelta(days=3),
            status="PENDING",
        )

        dismiss_url = reverse("reminders:reminder_dismiss", kwargs={"pk": reminder.pk})
        # Other advocate attempts to dismiss
        res = other_client.post(dismiss_url)
        assert res.status_code == status.HTTP_404_NOT_FOUND
