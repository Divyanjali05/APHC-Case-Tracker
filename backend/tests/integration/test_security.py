import importlib
import os
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case

User = get_user_model()


@pytest.fixture
def advocate_user(db):
    user = User.objects.create_user(
        username="AP12342020",
        password="ValidPassword123!",
        first_name="Rama",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/1234/2020",
        role="SENIOR",
    )
    return user


@pytest.fixture
def other_advocate_user(db):
    user = User.objects.create_user(
        username="AP56782021",
        password="ValidPassword456!",
        first_name="Sita",
        last_name="Devi",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/5678/2021",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def advocate_case(db, advocate_user):
    case = Case.objects.create(
        case_type="WP",
        case_number="1001",
        filing_year=2024,
        petitioner="Petitioner A",
        respondent="Respondent B",
    )
    case.tracked_by.add(advocate_user)
    return case


@pytest.fixture
def other_case(db, other_advocate_user):
    case = Case.objects.create(
        case_type="WA",
        case_number="2002",
        filing_year=2024,
        petitioner="Petitioner X",
        respondent="Respondent Y",
    )
    case.tracked_by.add(other_advocate_user)
    return case


@pytest.mark.django_db
class TestCaseAccessSecurity:
    """Verify authorization and data isolation for case endpoints."""

    def test_anonymous_case_list_forbidden(self, api_client):
        url = reverse("cases:case_list_create")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_anonymous_case_detail_forbidden(self, api_client, advocate_case):
        url = reverse("cases:case_detail", kwargs={"pk": advocate_case.pk})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_advocate_sees_only_own_tracked_cases(
        self, api_client, advocate_user, advocate_case, other_case
    ):
        api_client.force_authenticate(user=advocate_user)
        url = reverse("cases:case_list_create")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        results = response.json().get("results", response.json())
        returned_ids = [c["id"] for c in results]

        assert advocate_case.id in returned_ids
        assert other_case.id not in returned_ids

    def test_cross_advocate_case_detail_access_prevented(
        self, api_client, advocate_user, other_case
    ):
        api_client.force_authenticate(user=advocate_user)
        url = reverse("cases:case_detail", kwargs={"pk": other_case.pk})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestAuthenticationAndTokens:
    """Verify JWT rotation, blacklisting, and logout invalidation."""

    def test_login_and_token_refresh_rotation(self, api_client, advocate_user):
        login_url = reverse("accounts:token_obtain_pair")
        refresh_url = reverse("accounts:token_refresh")

        login_res = api_client.post(
            login_url,
            {"username": advocate_user.username, "password": "ValidPassword123!"},
        )
        assert login_res.status_code == status.HTTP_200_OK
        access_token = login_res.json()["access"]
        refresh_token = login_res.json()["refresh"]
        assert access_token and refresh_token

        # Refresh the token
        refresh_res = api_client.post(refresh_url, {"refresh": refresh_token})
        assert refresh_res.status_code == status.HTTP_200_OK
        new_refresh = refresh_res.json().get("refresh")
        assert new_refresh is not None
        assert new_refresh != refresh_token

        # Reusing the old rotated refresh token must fail (blacklisted)
        reuse_res = api_client.post(refresh_url, {"refresh": refresh_token})
        assert reuse_res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_blacklists_refresh_token(self, api_client, advocate_user):
        login_url = reverse("accounts:token_obtain_pair")
        logout_url = reverse("accounts:logout")
        refresh_url = reverse("accounts:token_refresh")

        login_res = api_client.post(
            login_url,
            {"username": advocate_user.username, "password": "ValidPassword123!"},
        )
        refresh_token = login_res.json()["refresh"]

        # Logout by providing the refresh token
        logout_res = api_client.post(logout_url, {"refresh": refresh_token})
        assert logout_res.status_code == status.HTTP_200_OK

        # Trying to use the blacklisted refresh token must now fail
        post_logout_refresh = api_client.post(refresh_url, {"refresh": refresh_token})
        assert post_logout_refresh.status_code == status.HTTP_401_UNAUTHORIZED


class TestProductionHardening:
    """Verify production settings refuse insecure configuration."""

    def test_production_refuses_insecure_secret_key(self):
        env = {
            "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/aphc_db",
            "DJANGO_SECRET_KEY": "django-insecure-aphc-dev-key-change-in-production",
            "DJANGO_ALLOWED_HOSTS": "aphc.example.com",
        }
        with patch.dict(os.environ, env, clear=False):
            with pytest.raises(ValueError, match="secure DJANGO_SECRET_KEY"):
                import config.settings.production as prod_settings

                importlib.reload(prod_settings)

    def test_production_refuses_wildcard_allowed_hosts(self):
        env = {
            "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/aphc_db",
            "DJANGO_SECRET_KEY": "super-secure-production-secret-key-aphc-court-vault-123456",
            "DJANGO_ALLOWED_HOSTS": "*",
        }
        with patch.dict(os.environ, env, clear=False):
            with pytest.raises(ValueError, match="Wildcard ALLOWED_HOSTS is not permitted"):
                import config.settings.production as prod_settings

                importlib.reload(prod_settings)
