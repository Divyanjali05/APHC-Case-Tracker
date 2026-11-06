from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing, Judgment
from apps.cases.services import CaseStatusService

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP77772021",
        password="ValidPassword123!",
        first_name="Kalyan",
        last_name="Chakravarthy",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2021",
        role="SENIOR",
    )
    return user


@pytest.fixture
def other_advocate(db):
    user = User.objects.create_user(
        username="AP88882021",
        password="ValidPassword456!",
        first_name="Sunita",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/8888/2021",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def advocate_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="4501",
        filing_year=2024,
        petitioner="State Employee Union",
        respondent="Government of AP",
        current_stage="PENDING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.fixture
def other_advocate_case(db, other_advocate):
    case = Case.objects.create(
        case_type="WA",
        case_number="9902",
        filing_year=2024,
        petitioner="Private Enterprise Ltd",
        respondent="Commercial Tax Dept",
        current_stage="PENDING",
    )
    case.tracked_by.add(other_advocate)
    return case


@pytest.fixture
def sample_judgment(db, advocate_case):
    return Judgment.objects.create(
        case=advocate_case,
        judgment_date=date(2024, 10, 15),
        judgment_type="FINAL",
        order_number="WP-4501-2024-ORD-01",
        bench="Hon'ble Chief Justice Bench",
        summary="Writ petition allowed with directions to implement pay commission revisions.",
        document_link="https://court-documents.example.com/judgments/WP4501_2024.pdf",
    )


@pytest.mark.django_db
class TestJudgmentModelAndServices:
    """Unit and service-level tests for Judgment model and status derivation."""

    def test_judgment_model_creation(self, advocate_case):
        """1. Judgment model creation with all attributes and representation."""
        judgment = Judgment.objects.create(
            case=advocate_case,
            judgment_date=date(2024, 9, 20),
            judgment_type="FINAL",
            order_number="ORD-789",
            bench="Court Hall 3",
            summary="Petition disposed on merits.",
            document_link="https://aphc.gov.in/orders/789.pdf",
        )
        assert judgment.id is not None
        assert judgment.case == advocate_case
        assert str(judgment) == f"Judgment: {advocate_case} (2024-09-20)"
        assert judgment.document_link.startswith("https://")

    def test_adjourned_case_status_calculation(self, advocate_case):
        """8. Adjourned case status calculation with next hearing date."""
        next_dt = date.today() + timedelta(days=14)
        Hearing.objects.create(
            case=advocate_case,
            hearing_date=date.today() - timedelta(days=2),
            business_conducted="Arguments heard in part. Matter adjourned to next date.",
            next_date=next_dt,
        )
        result = CaseStatusService.calculate_status(advocate_case)
        assert result["status"] == CaseStatusService.STATUS_ADJOURNED
        assert result["next_hearing_date"] == next_dt
        assert result["judgment_date"] is None
        assert result["has_judgment"] is False

    def test_next_hearing_date_calculation(self, advocate_case):
        """9. Next hearing date calculation for upcoming matters."""
        future_dt = date.today() + timedelta(days=7)
        advocate_case.next_hearing_date = future_dt
        advocate_case.current_stage = "FOR ADMISSION"
        advocate_case.save()

        result = CaseStatusService.calculate_status(advocate_case)
        assert result["status"] == CaseStatusService.STATUS_UPCOMING
        assert result["next_hearing_date"] == future_dt

    def test_judgment_date_display(self, advocate_case, sample_judgment):
        """10. Case with judgment displays 'Judgment Available' and judgment_date."""
        result = CaseStatusService.calculate_status(advocate_case)
        assert result["status"] == CaseStatusService.STATUS_JUDGMENT_AVAILABLE
        assert result["judgment_date"] == date(2024, 10, 15)
        assert result["has_judgment"] is True

    def test_missing_hearing_information(self, advocate_case):
        """11. Case with no hearings or judgments defaults to meaningful fallback status."""
        result = CaseStatusService.calculate_status(advocate_case)
        assert result["status"] == CaseStatusService.STATUS_PENDING
        assert result["has_judgment"] is False
        assert result["has_hearings"] is False


@pytest.mark.django_db
class TestJudgmentAPIEndpoints:
    """API endpoint tests for Judgment operations and security."""

    def test_api_authentication_enforcement(self, api_client, advocate_case, sample_judgment):
        """13. API authentication enforcement for judgment endpoints."""
        list_url = reverse("cases:judgment_list_create", kwargs={"case_id": advocate_case.id})
        detail_url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )
        doc_url = reverse(
            "cases:judgment_document",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )

        assert api_client.get(list_url).status_code == status.HTTP_401_UNAUTHORIZED
        assert api_client.get(detail_url).status_code == status.HTTP_401_UNAUTHORIZED
        assert api_client.get(doc_url).status_code == status.HTTP_401_UNAUTHORIZED

    def test_judgment_retrieval(self, api_client, advocate, advocate_case, sample_judgment):
        """2. Judgment retrieval by authorized advocate."""
        api_client.force_authenticate(user=advocate)
        url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == sample_judgment.id
        assert data["order_number"] == sample_judgment.order_number
        assert data["summary"] == sample_judgment.summary
        assert data["document_link"] == sample_judgment.document_link

    def test_judgment_update(self, api_client, advocate, advocate_case, sample_judgment):
        """3. Judgment update by authorized advocate."""
        api_client.force_authenticate(user=advocate)
        url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )
        payload = {
            "summary": "Updated judgment summary: Relief granted with cost modifications.",
            "order_number": "WP-4501-REV-02",
        }
        response = api_client.patch(url, payload)

        assert response.status_code == status.HTTP_200_OK
        sample_judgment.refresh_from_db()
        assert sample_judgment.summary == payload["summary"]
        assert sample_judgment.order_number == payload["order_number"]

    def test_missing_judgment_handling(self, api_client, advocate, advocate_case):
        """4. Missing judgment returns 404 Not Found gracefully."""
        api_client.force_authenticate(user=advocate)
        url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": advocate_case.id, "pk": 99999},
        )
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_case_ownership_validation(self, api_client, advocate, other_advocate_case):
        """5. Case ownership validation prevents accessing judgments of untracked cases."""
        api_client.force_authenticate(user=advocate)
        url = reverse(
            "cases:judgment_list_create",
            kwargs={"case_id": other_advocate_case.id},
        )
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_cross_advocate_judgment_access_prevented(
        self, api_client, other_advocate, advocate_case, sample_judgment
    ):
        """6. Cross-advocate judgment access prevention returns 404."""
        api_client.force_authenticate(user=other_advocate)
        detail_url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )
        response = api_client.get(detail_url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

        doc_url = reverse(
            "cases:judgment_document",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )
        doc_response = api_client.get(doc_url)
        assert doc_response.status_code == status.HTTP_404_NOT_FOUND

    def test_case_list_includes_judgment_information(
        self, api_client, advocate, advocate_case, sample_judgment
    ):
        """7. Case list includes judgment information and derived status."""
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        case_entry = next((c for c in results if c["id"] == advocate_case.id), None)

        assert case_entry is not None
        assert case_entry["status"] == "Judgment Available"
        assert case_entry["judgment_date"] == "2024-10-15"
        assert len(case_entry["judgments"]) >= 1
        assert case_entry["latest_judgment"]["id"] == sample_judgment.id

    def test_invalid_judgment_data_rejection(self, api_client, advocate, advocate_case):
        """12. Invalid judgment data rejected with 400 Bad Request."""
        api_client.force_authenticate(user=advocate)
        url = reverse(
            "cases:judgment_list_create",
            kwargs={"case_id": advocate_case.id},
        )
        # Missing required judgment_date
        response = api_client.post(url, {"summary": "No date provided"})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

        # Invalid document URL
        response_bad_url = api_client.post(
            url,
            {
                "judgment_date": "2024-10-01",
                "document_link": "not-a-valid-http-url",
            },
        )
        assert response_bad_url.status_code == status.HTTP_400_BAD_REQUEST

    def test_judgment_document_reference_retrieval(
        self, api_client, advocate, advocate_case, sample_judgment
    ):
        """Retrieve judgment document reference securely."""
        api_client.force_authenticate(user=advocate)
        doc_url = reverse(
            "cases:judgment_document",
            kwargs={"case_id": advocate_case.id, "pk": sample_judgment.id},
        )
        response = api_client.get(doc_url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["has_document"] is True
        assert data["document_link"] == sample_judgment.document_link
        assert data["case_id"] == advocate_case.id
