from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import AdvocateProfile, PasswordResetToken
from apps.accounts.services import PasswordResetDeliveryService

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP99992022",
        password="OriginalPassword123!",
        first_name="Venkat",
        last_name="Rao",
        email="venkat.rao@example.com",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/9999/2022",
        role="SENIOR",
    )
    return user


@pytest.mark.django_db
class TestPasswordResetRequest:
    """Tests for POST /api/auth/password-reset/request/."""

    def test_valid_request_generates_token_and_sends_notification(self, api_client, advocate):
        url = reverse("accounts:password_reset_request")
        response = api_client.post(url, {"enrollment_number": "AP/9999/2022"})

        assert response.status_code == status.HTTP_200_OK
        assert "password reset instructions have been dispatched" in response.json()["detail"]

        token_record = PasswordResetToken.objects.filter(user=advocate).first()
        assert token_record is not None
        assert token_record.is_valid()
        assert len(mail.outbox) == 1
        assert "Password Reset Request" in mail.outbox[0].subject

    def test_nonexistent_enrollment_returns_same_generic_response(self, api_client):
        url = reverse("accounts:password_reset_request")
        response = api_client.post(url, {"enrollment_number": "AP/0000/1900"})

        assert response.status_code == status.HTTP_200_OK
        assert "password reset instructions have been dispatched" in response.json()["detail"]
        assert PasswordResetToken.objects.count() == 0
        assert len(mail.outbox) == 0

    def test_empty_enrollment_rejected(self, api_client):
        url = reverse("accounts:password_reset_request")
        response = api_client.post(url, {"enrollment_number": ""})

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_request_rate_limiting(self, api_client, advocate):
        url = reverse("accounts:password_reset_request")
        responses = [api_client.post(url, {"enrollment_number": "AP/9999/2022"}) for _ in range(6)]

        # The first 5 requests are accepted, the 6th is throttled
        for res in responses[:5]:
            assert res.status_code == status.HTTP_200_OK
        assert responses[5].status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestPasswordResetConfirm:
    """Tests for POST /api/auth/password-reset/confirm/."""

    def test_successful_password_update(self, api_client, advocate):
        _, raw_token = PasswordResetDeliveryService.create_reset_token(advocate)
        url = reverse("accounts:password_reset_confirm")

        response = api_client.post(
            url,
            {
                "token": raw_token,
                "new_password": "BrandNewSecurePassword123!",
                "confirm_password": "BrandNewSecurePassword123!",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert "Password has been reset successfully" in response.json()["detail"]

        token_record = PasswordResetToken.objects.get(user=advocate)
        assert token_record.is_used is True
        assert token_record.used_at is not None

        # Verify old password cannot log in
        login_url = reverse("accounts:token_obtain_pair")
        old_login = api_client.post(
            login_url,
            {"username": advocate.username, "password": "OriginalPassword123!"},
        )
        assert old_login.status_code == status.HTTP_401_UNAUTHORIZED

        # Verify new password logs in successfully
        new_login = api_client.post(
            login_url,
            {"username": advocate.username, "password": "BrandNewSecurePassword123!"},
        )
        assert new_login.status_code == status.HTTP_200_OK

    def test_used_token_cannot_be_reused(self, api_client, advocate):
        _, raw_token = PasswordResetDeliveryService.create_reset_token(advocate)
        url = reverse("accounts:password_reset_confirm")

        # First use
        res1 = api_client.post(
            url,
            {
                "token": raw_token,
                "new_password": "NewValidPassword123!",
                "confirm_password": "NewValidPassword123!",
            },
        )
        assert res1.status_code == status.HTTP_200_OK

        # Second use (must fail)
        res2 = api_client.post(
            url,
            {
                "token": raw_token,
                "new_password": "AnotherNewPassword456!",
                "confirm_password": "AnotherNewPassword456!",
            },
        )
        assert res2.status_code == status.HTTP_400_BAD_REQUEST
        assert "already been used" in str(res2.json())

    def test_expired_token_rejected(self, api_client, advocate):
        token_record, raw_token = PasswordResetDeliveryService.create_reset_token(advocate)
        token_record.expires_at = timezone.now() - timedelta(minutes=1)
        token_record.save(update_fields=["expires_at"])

        url = reverse("accounts:password_reset_confirm")
        response = api_client.post(
            url,
            {
                "token": raw_token,
                "new_password": "NewValidPassword123!",
                "confirm_password": "NewValidPassword123!",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "expired" in str(response.json())

    def test_invalid_token_rejected(self, api_client):
        url = reverse("accounts:password_reset_confirm")
        response = api_client.post(
            url,
            {
                "token": "completely_fake_invalid_token_string",
                "new_password": "NewValidPassword123!",
                "confirm_password": "NewValidPassword123!",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Invalid or expired" in str(response.json())

    def test_mismatched_password_confirmation_rejected(self, api_client, advocate):
        _, raw_token = PasswordResetDeliveryService.create_reset_token(advocate)
        url = reverse("accounts:password_reset_confirm")

        response = api_client.post(
            url,
            {
                "token": raw_token,
                "new_password": "NewValidPassword123!",
                "confirm_password": "DifferentPassword456!",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "do not match" in str(response.json())

    def test_weak_password_rejected(self, api_client, advocate):
        _, raw_token = PasswordResetDeliveryService.create_reset_token(advocate)
        url = reverse("accounts:password_reset_confirm")

        response = api_client.post(
            url,
            {
                "token": raw_token,
                "new_password": "123",
                "confirm_password": "123",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_existing_sessions_invalidated_after_reset(self, api_client, advocate):
        # Generate an active session for the advocate
        refresh = RefreshToken.for_user(advocate)
        active_refresh_token = str(refresh)
        refresh_url = reverse("accounts:token_refresh")

        # Verify active refresh token works before reset
        pre_reset = api_client.post(refresh_url, {"refresh": active_refresh_token})
        assert pre_reset.status_code == status.HTTP_200_OK
        rotated_refresh_token = pre_reset.json()["refresh"]

        # Reset password
        _, raw_token = PasswordResetDeliveryService.create_reset_token(advocate)
        confirm_url = reverse("accounts:password_reset_confirm")
        reset_res = api_client.post(
            confirm_url,
            {
                "token": raw_token,
                "new_password": "BrandNewPassword999!",
                "confirm_password": "BrandNewPassword999!",
            },
        )
        assert reset_res.status_code == status.HTTP_200_OK

        # The prior session's refresh token must now be rejected
        post_reset = api_client.post(refresh_url, {"refresh": rotated_refresh_token})
        assert post_reset.status_code == status.HTTP_401_UNAUTHORIZED

    def test_confirm_rate_limiting(self, api_client, advocate):
        url = reverse("accounts:password_reset_confirm")
        payload = {
            "token": "fake_token_123",
            "new_password": "NewValidPassword123!",
            "confirm_password": "NewValidPassword123!",
        }
        responses = [api_client.post(url, payload) for _ in range(6)]

        for res in responses[:5]:
            assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert responses[5].status_code == status.HTTP_429_TOO_MANY_REQUESTS
