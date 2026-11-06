from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import AdvocateProfile
from apps.cases.history_service import CaseHistoryService
from apps.cases.models import Case, CaseHistory, Hearing

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP66662022",
        password="ValidPassword123!",
        first_name="Madhav",
        last_name="Reddy",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/6666/2022",
        role="SENIOR",
    )
    return user


@pytest.fixture
def other_advocate(db):
    user = User.objects.create_user(
        username="AP77772023",
        password="ValidPassword456!",
        first_name="Lavanya",
        last_name="Devi",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2023",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def advocate_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="5501",
        filing_year=2024,
        petitioner="Citizen Welfare Trust",
        respondent="AP Municipal Corp",
        current_stage="PENDING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.mark.django_db
class TestCaseHistoryModelAndService:
    """Unit and service-level verification for audit trail recording."""

    def test_case_history_model_creation(self, advocate_case, advocate):
        """1. Model attributes, string representation, and relationships."""
        entry = CaseHistory.objects.create(
            case=advocate_case,
            event_type="STAGE_CHANGED",
            field_name="current_stage",
            old_value="PENDING",
            new_value="FOR ADMISSION",
            description="Docket stage transitioned from 'PENDING' to 'FOR ADMISSION'.",
            source="MANUAL",
            changed_by=advocate,
        )
        assert entry.id is not None
        assert entry.case == advocate_case
        assert entry.changed_by == advocate
        assert "STAGE_CHANGED" in str(entry)
        assert entry.created_at is not None

    def test_identical_values_do_not_record_duplicate_history(self, advocate_case, advocate):
        """2. Service skips recording when previous and new values are identical."""
        initial_count = CaseHistory.objects.filter(case=advocate_case).count()
        result = CaseHistoryService.record_event(
            case=advocate_case,
            event_type="STAGE_CHANGED",
            field_name="current_stage",
            old_value="PENDING",
            new_value="PENDING",
            description="No real change",
            changed_by=advocate,
        )
        assert result is None
        assert CaseHistory.objects.filter(case=advocate_case).count() == initial_count

    def test_hearing_events_recorded_by_service(self, advocate_case, advocate):
        """3. Hearing scheduled and rescheduled audit records."""
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=date(2024, 11, 10),
            court_hall_number=2,
            item_number=14,
            business_conducted="Notice issued.",
        )
        entry1 = CaseHistoryService.record_hearing_event(
            hearing, is_created=True, changed_by=advocate
        )
        assert entry1 is not None
        assert entry1.event_type == "HEARING_SCHEDULED"
        assert "Court Hall 2" in entry1.description

        # Reschedule hearing
        old_data = {"hearing_date": date(2024, 11, 10), "next_date": None}
        hearing.hearing_date = date(2024, 11, 17)
        hearing.save()
        entry2 = CaseHistoryService.record_hearing_event(
            hearing, is_created=False, old_data=old_data, changed_by=advocate
        )
        assert entry2 is not None
        assert entry2.event_type == "HEARING_RESCHEDULED"
        assert entry2.old_value == "2024-11-10"
        assert entry2.new_value == "2024-11-17"


@pytest.mark.django_db
class TestCaseHistoryAPIIntegration:
    """API-driven verification of automatic audit recording and endpoint access."""

    def test_case_creation_via_api_records_history(self, api_client, advocate):
        """4. Case created via API automatically generates CASE_CREATED history record."""
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")
        payload = {
            "case_type": "WP",
            "case_number": "7701",
            "filing_year": 2024,
            "petitioner": "Primary School Teachers Association",
            "respondent": "State of Andhra Pradesh",
            "current_stage": "PENDING",
        }
        res = api_client.post(url, payload)
        assert res.status_code == status.HTTP_201_CREATED
        case_id = res.json()["id"]

        history_qs = CaseHistory.objects.filter(case_id=case_id)
        assert history_qs.count() == 1
        entry = history_qs.first()
        assert entry.event_type == "CASE_CREATED"
        assert entry.changed_by == advocate

    def test_case_stage_update_records_history(self, api_client, advocate, advocate_case):
        """5. Updating case details records STAGE_CHANGED and HEARING_RESCHEDULED."""
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_detail", kwargs={"pk": advocate_case.id})
        future_dt = date.today() + timedelta(days=10)
        payload = {
            "current_stage": "FOR HEARING",
            "next_hearing_date": future_dt.isoformat(),
        }
        res = api_client.patch(url, payload)
        assert res.status_code == status.HTTP_200_OK

        history = CaseHistory.objects.filter(case=advocate_case)
        event_types = [h.event_type for h in history]
        assert "STAGE_CHANGED" in event_types
        assert "HEARING_RESCHEDULED" in event_types

        stage_entry = history.get(event_type="STAGE_CHANGED")
        assert stage_entry.old_value == "PENDING"
        assert stage_entry.new_value == "FOR HEARING"
        assert stage_entry.changed_by == advocate

    def test_judgment_creation_and_update_records_history(
        self, api_client, advocate, advocate_case
    ):
        """6. Judgment creation and modification automatically generate audit logs."""
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:judgment_list_create", kwargs={"case_id": advocate_case.id})
        payload = {
            "judgment_date": "2024-10-25",
            "judgment_type": "FINAL",
            "order_number": "ORD-5501",
            "summary": "Writ petition allowed with directions.",
        }
        create_res = api_client.post(url, payload)
        assert create_res.status_code == status.HTTP_201_CREATED
        judgment_id = create_res.json()["id"]

        j_history = CaseHistory.objects.filter(case=advocate_case, event_type="JUDGMENT_ENTERED")
        assert j_history.exists()
        assert j_history.first().changed_by == advocate

        # Update judgment summary & add document link
        detail_url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": advocate_case.id, "pk": judgment_id},
        )
        update_res = api_client.patch(
            detail_url,
            {
                "summary": "Modified summary with detailed directions.",
                "document_link": "https://aphc.gov.in/docs/5501.pdf",
            },
        )
        assert update_res.status_code == status.HTTP_200_OK

        doc_history = CaseHistory.objects.filter(case=advocate_case, event_type="DOCUMENT_UPDATED")
        assert doc_history.exists()

    def test_case_history_list_endpoint(self, api_client, advocate, advocate_case):
        """7. GET /api/cases/<case_id>/history/ returns chronological events."""
        CaseHistory.objects.create(
            case=advocate_case,
            event_type="CASE_CREATED",
            description="Initial creation",
            source="MANUAL",
            changed_by=advocate,
        )
        CaseHistory.objects.create(
            case=advocate_case,
            event_type="STAGE_CHANGED",
            field_name="current_stage",
            old_value="PENDING",
            new_value="LISTED",
            description="Stage updated",
            source="MANUAL",
            changed_by=advocate,
        )

        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_history_list", kwargs={"case_id": advocate_case.id})
        res = api_client.get(url)

        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        results = data.get("results", data)
        assert len(results) == 2
        # Chronological descending
        assert results[0]["event_type"] == "STAGE_CHANGED"
        assert results[1]["event_type"] == "CASE_CREATED"
        assert results[0]["changed_by"]["username"] == advocate.username

    def test_case_history_filtering_by_event_type(self, api_client, advocate, advocate_case):
        """8. Query param ?event_type= filters history entries."""
        CaseHistory.objects.create(
            case=advocate_case,
            event_type="CASE_CREATED",
            description="Initial creation",
        )
        CaseHistory.objects.create(
            case=advocate_case,
            event_type="STAGE_CHANGED",
            description="Stage updated",
        )

        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_history_list", kwargs={"case_id": advocate_case.id})
        res = api_client.get(f"{url}?event_type=STAGE_CHANGED")

        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["event_type"] == "STAGE_CHANGED"

    def test_cross_advocate_history_access_prevented(
        self, api_client, other_advocate, advocate_case
    ):
        """9. Another advocate cannot view history for untracked cases (404 Not Found)."""
        api_client.force_authenticate(user=other_advocate)
        url = reverse("cases:case_history_list", kwargs={"case_id": advocate_case.id})
        res = api_client.get(url)
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_history_access_rejected(self, api_client, advocate_case):
        """10. Unauthenticated access returns 401 Unauthorized."""
        url = reverse("cases:case_history_list", kwargs={"case_id": advocate_case.id})
        res = api_client.get(url)
        assert res.status_code == status.HTTP_401_UNAUTHORIZED
