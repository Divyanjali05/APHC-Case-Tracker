"""Integration tests for Multilingual Voice Search and Case Query Normalization."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP88882024",
        password="TestPassword123!",
        first_name="Srinivasa",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/8888/2024",
        role="SENIOR",
    )
    return user


@pytest.fixture
def tracked_cases(db, advocate):
    c1 = Case.objects.create(
        case_type="WP",
        case_number="101",
        filing_year=2024,
        petitioner="Ramesh Kumar",
        respondent="State of Andhra Pradesh",
        petitioner_advocate="Srinivasa Rao",
        current_stage="UPCOMING",
    )
    c1.tracked_by.add(advocate)

    c2 = Case.objects.create(
        case_type="CRLP",
        case_number="55",
        filing_year=2023,
        petitioner="Suresh Sharma",
        respondent="Inspector of Police",
        petitioner_advocate="Srinivasa Rao",
        current_stage="PENDING",
    )
    c2.tracked_by.add(advocate)

    c3 = Case.objects.create(
        case_type="CRP",
        case_number="99",
        filing_year=2024,
        petitioner="రామయ్య",
        respondent="లక్ష్మణ్",
        petitioner_advocate="Srinivasa Rao",
        current_stage="ADJOURNED",
    )
    c3.tracked_by.add(advocate)

    return [c1, c2, c3]


@pytest.mark.django_db
class TestCaseMultilingualVoiceSearch:
    """Test searching cases via spoken queries in Telugu, Hindi, and English."""

    def test_search_spoken_english_case(self, api_client, advocate, tracked_cases):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        # Spoken "Writ Petition 101/2024"
        response = api_client.get(url, {"search": "Writ Petition 101/2024"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["case_number"] == "101"
        assert results[0]["case_type"] == "WP"

    def test_search_spoken_telugu_query_with_telugu_digits(
        self, api_client, advocate, tracked_cases
    ):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        # Spoken Telugu: "రిట్ పిటిషన్ ౧౦౧/౨౦౨౪" -> WP 101/2024
        response = api_client.get(url, {"search": "రిట్ పిటిషన్ ౧౦౧/౨౦౨౪"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["case_number"] == "101"

    def test_search_spoken_telugu_crlp_with_telugu_digits(
        self, api_client, advocate, tracked_cases
    ):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        # Spoken Telugu: "క్రిమినల్ పిటిషన్ ౫౫" -> CRLP 55
        response = api_client.get(url, {"search": "క్రిమినల్ పిటిషన్ ౫౫"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["case_number"] == "55"
        assert results[0]["case_type"] == "CRLP"

    def test_search_spoken_hindi_query_with_devanagari_digits(
        self, api_client, advocate, tracked_cases
    ):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        # Spoken Hindi: "रिट याचिका १०१/२०२४" -> WP 101/2024
        response = api_client.get(url, {"search": "रिट याचिका १०१/२०२४"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["case_number"] == "101"

    def test_search_spoken_hindi_crlp(self, api_client, advocate, tracked_cases):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        # Spoken Hindi: "आपराधिक याचिका ५५" -> CRLP 55
        response = api_client.get(url, {"search": "आपराधिक याचिका ५५"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["case_number"] == "55"

    def test_search_telugu_party_name(self, api_client, advocate, tracked_cases):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        # Spoken Telugu party name: "రామయ్య"
        response = api_client.get(url, {"search": "రామయ్య"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 1
        assert results[0]["petitioner"] == "రామయ్య"

    def test_empty_search_returns_all_tracked_cases(self, api_client, advocate, tracked_cases):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        response = api_client.get(url, {"search": ""})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 3

    def test_unmatched_search_returns_empty_list(self, api_client, advocate, tracked_cases):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:case_list_create")

        response = api_client.get(url, {"search": "NonExistentParty 99999"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data)
        assert len(results) == 0


@pytest.mark.django_db
class TestVoiceQueryNormalizeEndpoint:
    """Test dedicated /api/cases/voice-search/normalize/ endpoint."""

    def test_normalize_endpoint_success(self, api_client, advocate):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:voice_search_normalize")

        response = api_client.get(url, {"q": "రిట్ పిటిషన్ ౧౦౧/౨౦౨౪"})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["case_type"] == "WP"
        assert data["case_number"] == "101"
        assert data["filing_year"] == 2024
        assert data["has_indic_numerals"] is True
        assert data["detected_language"] == "te"

    def test_normalize_endpoint_empty_query(self, api_client, advocate):
        api_client.force_authenticate(user=advocate)
        url = reverse("cases:voice_search_normalize")

        response = api_client.get(url, {"q": ""})
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["normalized"] == ""
        assert data["case_number"] is None

    def test_normalize_endpoint_requires_auth(self, api_client):
        url = reverse("cases:voice_search_normalize")
        response = api_client.get(url, {"q": "WP 101"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
