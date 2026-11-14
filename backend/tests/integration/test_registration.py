import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import AdvocateProfile
from tests.conftest import assert_isolated_test_database

User = get_user_model()


@pytest.mark.django_db
class TestAdvocateRegistrationAPI:
    """Integration tests for POST /api/auth/register/ on an isolated test DB."""

    register_url = reverse("accounts:register")
    token_url = reverse("accounts:token_obtain_pair")
    refresh_url = reverse("accounts:token_refresh")
    profile_url = reverse("accounts:profile")

    @pytest.fixture(autouse=True)
    def verify_non_neon_db(self, settings):
        assert_isolated_test_database(settings)

    def _valid_payload(self, **overrides):
        payload = {
            "enrollment_number": "ap/5555/2023",
            "email": "Rama.Krishna@Example.COM",
            "first_name": "Rama",
            "last_name": "Krishna",
            "password": "Advocate#Strong2026!",
            "confirm_password": "Advocate#Strong2026!",
        }
        payload.update(overrides)
        return payload

    def test_valid_advocate_registration_creates_hashed_user_and_profile(self, api_client):
        response = api_client.post(self.register_url, self._valid_payload(), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["enrollment_number"] == "AP/5555/2023"
        assert data["user"]["username"] == "AP/5555/2023"
        assert data["user"]["email"] == "rama.krishna@example.com"
        assert data["user"]["profile"]["role"] == "ASSOCIATE"
        assert "password" not in data["user"]

        user = User.objects.get(username="AP/5555/2023")
        assert user.is_active is True
        assert user.is_staff is False
        assert user.is_superuser is False
        assert user.password != "Advocate#Strong2026!"
        assert user.password.startswith("pbkdf2_")
        assert user.check_password("Advocate#Strong2026!") is True

        profile = AdvocateProfile.objects.get(user=user)
        assert profile.bar_council_enrollment_number == "AP/5555/2023"
        assert profile.role == "ASSOCIATE"

    def test_registration_optional_names_can_be_omitted(self, api_client):
        payload = self._valid_payload(enrollment_number="AP/5556/2023", email="opt@example.com")
        payload.pop("first_name")
        payload.pop("last_name")

        response = api_client.post(self.register_url, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["user"]["profile"]["role"] == "ASSOCIATE"

    def test_duplicate_enrollment_number_rejected(self, api_client):
        first = api_client.post(self.register_url, self._valid_payload(), format="json")
        assert first.status_code == status.HTTP_201_CREATED

        dup = api_client.post(
            self.register_url,
            self._valid_payload(enrollment_number="AP/5555/2023", email="other@example.com"),
            format="json",
        )
        assert dup.status_code == status.HTTP_400_BAD_REQUEST
        errors = dup.json()["error"]["message"]
        assert "enrollment_number" in errors

    def test_duplicate_email_rejected_case_insensitively(self, api_client):
        first = api_client.post(self.register_url, self._valid_payload(), format="json")
        assert first.status_code == status.HTTP_201_CREATED

        dup = api_client.post(
            self.register_url,
            self._valid_payload(
                enrollment_number="AP/6666/2023",
                email="rama.krishna@example.com",
            ),
            format="json",
        )
        assert dup.status_code == status.HTTP_400_BAD_REQUEST
        errors = dup.json()["error"]["message"]
        assert "email" in errors

    @pytest.mark.parametrize(
        "bad_email",
        ["not-an-email", "missing-domain@", "@nodomain.com", ""],
    )
    def test_invalid_email_rejected(self, api_client, bad_email):
        response = api_client.post(
            self.register_url,
            self._valid_payload(email=bad_email),
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in response.json()["error"]["message"]

    @pytest.mark.parametrize(
        "bad_enrollment",
        ["INVALID", "1234/2020", "A/1234/2020", ""],
    )
    def test_invalid_enrollment_format_rejected(self, api_client, bad_enrollment):
        response = api_client.post(
            self.register_url,
            self._valid_payload(enrollment_number=bad_enrollment),
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "enrollment_number" in response.json()["error"]["message"]

    @pytest.mark.parametrize(
        "weak_password",
        ["short1", "password123", "12345678", "Krishna123"],
    )
    def test_weak_password_rejected(self, api_client, weak_password):
        response = api_client.post(
            self.register_url,
            self._valid_payload(password=weak_password, confirm_password=weak_password),
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "password" in response.json()["error"]["message"]

    def test_mismatched_passwords_rejected(self, api_client):
        response = api_client.post(
            self.register_url,
            self._valid_payload(confirm_password="Different#Password1"),
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "confirm_password" in response.json()["error"]["message"]

    @pytest.mark.parametrize(
        "missing_field",
        ["enrollment_number", "email", "password", "confirm_password"],
    )
    def test_missing_required_fields_rejected(self, api_client, missing_field):
        payload = self._valid_payload()
        payload.pop(missing_field)
        response = api_client.post(self.register_url, payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert missing_field in response.json()["error"]["message"]

    def test_created_account_works_with_jwt_login_refresh_and_profile(self, api_client):
        reg_res = api_client.post(self.register_url, self._valid_payload(), format="json")
        assert reg_res.status_code == status.HTTP_201_CREATED

        login_res = api_client.post(
            self.token_url,
            {"username": "AP/5555/2023", "password": "Advocate#Strong2026!"},
            format="json",
        )
        assert login_res.status_code == status.HTTP_200_OK
        tokens = login_res.json()
        assert "access" in tokens
        assert "refresh" in tokens

        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        profile_res = api_client.get(self.profile_url)
        assert profile_res.status_code == status.HTTP_200_OK
        assert profile_res.json()["username"] == "AP/5555/2023"
        assert profile_res.json()["profile"]["role"] == "ASSOCIATE"

        refresh_res = api_client.post(
            self.refresh_url,
            {"refresh": tokens["refresh"]},
            format="json",
        )
        assert refresh_res.status_code == status.HTTP_200_OK
        assert "access" in refresh_res.json()

    def test_existing_advocate_login_continues_working(self, api_client):
        existing = User.objects.create_user(
            username="AP/8888/2021",
            email="existing@example.com",
            password="Existing#Password123",
        )
        AdvocateProfile.objects.create(
            user=existing,
            bar_council_enrollment_number="AP/8888/2021",
            role="SENIOR",
            is_verified=True,
        )

        # Register another user to prove no side-effects on existing accounts
        reg_res = api_client.post(self.register_url, self._valid_payload(), format="json")
        assert reg_res.status_code == status.HTTP_201_CREATED

        login_res = api_client.post(
            self.token_url,
            {"username": "AP/8888/2021", "password": "Existing#Password123"},
            format="json",
        )
        assert login_res.status_code == status.HTTP_200_OK
        assert "access" in login_res.json()

    def test_direct_registration_requires_no_otp_or_email_verification(self, api_client, mailoutbox):
        response = api_client.post(self.register_url, self._valid_payload(), format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "otp" not in str(response.json()).lower()
        assert len(mailoutbox) == 0

        user = User.objects.get(username="AP/5555/2023")
        assert user.is_active is True

    def test_safety_guard_aborts_if_neon_database_targeted(self):
        class FakeSettings:
            DATABASES = {
                "default": {
                    "ENGINE": "django.db.backends.postgresql",
                    "HOST": "ep-ancient-rice.ap-southeast-1.aws.neon.tech",
                    "NAME": "neondb",
                }
            }

        with pytest.raises(RuntimeError, match="ABORTED"):
            assert_isolated_test_database(FakeSettings())

    def test_registration_rate_limiting_returns_429(self, api_client, monkeypatch):
        from rest_framework.throttling import ScopedRateThrottle

        monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "register", "2/minute")
        r1 = api_client.post(
            self.register_url,
            self._valid_payload(enrollment_number="AP/1001/2024", email="a1@example.com"),
            format="json",
        )
        r2 = api_client.post(
            self.register_url,
            self._valid_payload(enrollment_number="AP/1002/2024", email="a2@example.com"),
            format="json",
        )
        r3 = api_client.post(
            self.register_url,
            self._valid_payload(enrollment_number="AP/1003/2024", email="a3@example.com"),
            format="json",
        )
        assert r1.status_code == status.HTTP_201_CREATED
        assert r2.status_code == status.HTTP_201_CREATED
        assert r3.status_code == status.HTTP_429_TOO_MANY_REQUESTS
