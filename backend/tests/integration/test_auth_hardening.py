from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.accounts.models import AdvocateProfile, OTPVerification
from apps.accounts.services import OTPService

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP12342021",
        password="OriginalPassword123!",
        first_name="Srinivas",
        last_name="Reddy",
        email="srinivas.reddy@example.com",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/1234/2021",
        role="SENIOR",
        is_verified=True,
    )
    return user


# ============================================================================
# 1. Registration & OTP Verification Tests
# ============================================================================


@pytest.mark.django_db
class TestAdvocateRegistrationAndOTP:
    """Tests for POST /api/auth/register/ and /api/auth/register/verify-otp/."""

    def test_registration_creates_pending_advocate_and_dispatches_otp(self, api_client):
        url = reverse("accounts:register")
        payload = {
            "enrollment_number": "AP/5555/2023",
            "email": "advocate5555@example.com",
            "password": "StrongPassword123!",
            "confirm_password": "StrongPassword123!",
            "first_name": "Rama",
            "last_name": "Krishna",
            "phone_number": "9876543210",
            "chamber_address": "High Court Complex, Gate 2",
            "role": "ASSOCIATE",
            "preferred_language": "te",
        }
        response = api_client.post(url, payload)

        assert response.status_code == status.HTTP_201_CREATED
        assert "Registration initiated" in response.json()["detail"]
        assert response.json()["enrollment_number"] == "AP/5555/2023"

        # Verify unverified profile exists
        profile = AdvocateProfile.objects.get(bar_council_enrollment_number="AP/5555/2023")
        assert profile.is_verified is False
        assert profile.preferred_language == "te"

        # Verify OTP record
        otp_record = OTPVerification.objects.filter(
            identifier="ap/5555/2023",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
        ).first()
        assert otp_record is not None
        assert otp_record.is_used is False
        assert len(mail.outbox) == 1
        assert "Registration Verification" in mail.outbox[0].subject

    def test_verify_registration_otp_activates_account_and_returns_jwt(self, api_client):
        # Register advocate
        reg_url = reverse("accounts:register")
        api_client.post(
            reg_url,
            {
                "enrollment_number": "AP/7777/2024",
                "email": "advocate7777@example.com",
                "password": "StrongPassword123!",
                "confirm_password": "StrongPassword123!",
            },
        )

        # Retrieve raw OTP from mock delivery or re-issue
        profile = AdvocateProfile.objects.get(bar_council_enrollment_number="AP/7777/2024")
        _, raw_otp = OTPService.issue_otp(
            identifier="AP/7777/2024",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=profile.user,
        )

        verify_url = reverse("accounts:register_verify_otp")
        verify_res = api_client.post(
            verify_url,
            {
                "enrollment_number": "AP/7777/2024",
                "otp": raw_otp,
            },
        )

        assert verify_res.status_code == status.HTTP_200_OK
        data = verify_res.json()
        assert "access" in data
        assert "refresh" in data
        assert data["user"]["profile"]["bar_council_enrollment_number"] == "AP/7777/2024"

        # Profile is now verified
        profile.refresh_from_db()
        assert profile.is_verified is True

    def test_single_use_otp_cannot_be_reused(self, api_client):
        profile = AdvocateProfile.objects.create(
            user=User.objects.create_user(username="AP88882024", email="adv8888@example.com"),
            bar_council_enrollment_number="AP/8888/2024",
            is_verified=False,
        )
        _, raw_otp = OTPService.issue_otp(
            identifier="AP/8888/2024",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=profile.user,
        )

        verify_url = reverse("accounts:register_verify_otp")
        first_attempt = api_client.post(
            verify_url,
            {
                "enrollment_number": "AP/8888/2024",
                "otp": raw_otp,
            },
        )
        assert first_attempt.status_code == status.HTTP_200_OK

        # Second attempt with same OTP must be rejected
        second_attempt = api_client.post(
            verify_url,
            {
                "enrollment_number": "AP/8888/2024",
                "otp": raw_otp,
            },
        )
        assert second_attempt.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "already been used" in second_attempt.json()["error"]
            or "No active OTP" in second_attempt.json()["error"]
        )

    def test_expired_otp_is_rejected(self, api_client):
        profile = AdvocateProfile.objects.create(
            user=User.objects.create_user(username="AP33332023", email="adv3333@example.com"),
            bar_council_enrollment_number="AP/3333/2023",
            is_verified=False,
        )
        record, raw_otp = OTPService.issue_otp(
            identifier="AP/3333/2023",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=profile.user,
        )

        # Fast-forward record beyond 10-minute expiry
        record.expires_at = timezone.now() - timedelta(minutes=1)
        record.save(update_fields=["expires_at"])

        verify_url = reverse("accounts:register_verify_otp")
        res = api_client.post(
            verify_url,
            {
                "enrollment_number": "AP/3333/2023",
                "otp": raw_otp,
            },
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "expired" in res.json()["error"].lower()

    def test_brute_force_otp_attempts_locked_after_5_failures(self, api_client):
        profile = AdvocateProfile.objects.create(
            user=User.objects.create_user(username="AP44442023", email="adv4444@example.com"),
            bar_council_enrollment_number="AP/4444/2023",
            is_verified=False,
        )
        _, raw_otp = OTPService.issue_otp(
            identifier="AP/4444/2023",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=profile.user,
        )

        verify_url = reverse("accounts:register_verify_otp")
        # Submit 5 incorrect OTPs
        for _ in range(5):
            res = api_client.post(
                verify_url,
                {
                    "enrollment_number": "AP/4444/2023",
                    "otp": "000000",
                },
            )
            assert res.status_code == status.HTTP_400_BAD_REQUEST

        # Even with the correct OTP, verification is now rejected due to attempts exhaustion
        correct_res = api_client.post(
            verify_url,
            {
                "enrollment_number": "AP/4444/2023",
                "otp": raw_otp,
            },
        )
        assert correct_res.status_code == status.HTTP_400_BAD_REQUEST
        assert "maximum" in correct_res.json()["error"].lower()

    def test_issuing_new_otp_invalidates_previous_otp(self, api_client):
        profile = AdvocateProfile.objects.create(
            user=User.objects.create_user(username="AP11112023", email="adv1111@example.com"),
            bar_council_enrollment_number="AP/1111/2023",
            is_verified=False,
        )
        # Issue first OTP
        _, first_otp = OTPService.issue_otp(
            identifier="AP/1111/2023",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=profile.user,
        )

        # Issue second OTP (e.g. user requested resend)
        _, second_otp = OTPService.issue_otp(
            identifier="AP/1111/2023",
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=profile.user,
        )

        verify_url = reverse("accounts:register_verify_otp")
        # First OTP should now be rejected as invalid/used
        res1 = api_client.post(
            verify_url,
            {"enrollment_number": "AP/1111/2023", "otp": first_otp},
        )
        assert res1.status_code == status.HTTP_400_BAD_REQUEST

        # Second OTP succeeds
        res2 = api_client.post(
            verify_url,
            {"enrollment_number": "AP/1111/2023", "otp": second_otp},
        )
        assert res2.status_code == status.HTTP_200_OK


# ============================================================================
# 2. Authenticated Change Password Tests
# ============================================================================


@pytest.mark.django_db
class TestChangePassword:
    """Tests for POST /api/auth/change-password/."""

    def test_authenticated_advocate_can_change_password(self, api_client, advocate):
        api_client.force_authenticate(user=advocate)
        url = reverse("accounts:change_password")

        payload = {
            "old_password": "OriginalPassword123!",
            "new_password": "NewSecurePassword456!",
            "confirm_password": "NewSecurePassword456!",
        }
        response = api_client.post(url, payload)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access" in data
        assert "refresh" in data
        assert "Password changed successfully" in data["detail"]

        # Verify old password no longer works
        api_client.logout()
        login_url = reverse("accounts:token_obtain_pair")
        old_login = api_client.post(
            login_url,
            {"username": advocate.username, "password": "OriginalPassword123!"},
        )
        assert old_login.status_code == status.HTTP_401_UNAUTHORIZED

        # Verify new password works
        new_login = api_client.post(
            login_url,
            {
                "username": advocate.username,
                "password": "NewSecurePassword456!",
            },
        )
        assert new_login.status_code == status.HTTP_200_OK

    def test_incorrect_old_password_rejected(self, api_client, advocate):
        api_client.force_authenticate(user=advocate)
        url = reverse("accounts:change_password")

        payload = {
            "old_password": "WrongPassword999!",
            "new_password": "NewSecurePassword456!",
            "confirm_password": "NewSecurePassword456!",
        }
        response = api_client.post(url, payload)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Current password is incorrect" in str(response.json())

    def test_mismatched_new_password_rejected(self, api_client, advocate):
        api_client.force_authenticate(user=advocate)
        url = reverse("accounts:change_password")

        payload = {
            "old_password": "OriginalPassword123!",
            "new_password": "NewSecurePassword456!",
            "confirm_password": "DifferentPassword789!",
        }
        response = api_client.post(url, payload)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Passwords do not match" in str(response.json())

    def test_unauthenticated_change_password_rejected(self, api_client):
        url = reverse("accounts:change_password")
        response = api_client.post(
            url,
            {
                "old_password": "abc",
                "new_password": "def",
                "confirm_password": "def",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# 3. OTP-Based Password Reset Tests
# ============================================================================


@pytest.mark.django_db
class TestOTPPasswordResetFlow:
    """Tests for OTP-based password reset verification via /api/auth/otp/verify/."""

    def test_password_reset_otp_verification_returns_reset_token(self, api_client, advocate):
        # 1. Request OTP for password reset
        req_url = reverse("accounts:otp_request")
        api_client.post(
            req_url,
            {
                "identifier": advocate.username,
                "purpose": "PASSWORD_RESET",
                "channel": "email",
            },
        )

        # Retrieve active OTP
        otp_record = OTPVerification.objects.filter(
            identifier=advocate.username.lower(),
            purpose="PASSWORD_RESET",
            is_used=False,
        ).first()
        assert otp_record is not None

        # Issue raw OTP for verification test
        _, raw_otp = OTPService.issue_otp(
            identifier=advocate.username,
            purpose=OTPVerification.PURPOSE_PASSWORD_RESET,
            user=advocate,
        )

        # 2. Verify OTP
        verify_url = reverse("accounts:otp_verify")
        verify_res = api_client.post(
            verify_url,
            {
                "identifier": advocate.username,
                "otp": raw_otp,
                "purpose": "PASSWORD_RESET",
            },
        )
        assert verify_res.status_code == status.HTTP_200_OK
        data = verify_res.json()
        assert "reset_token" in data

        # 3. Use returned reset token on existing confirm endpoint
        confirm_url = reverse("accounts:password_reset_confirm")
        confirm_res = api_client.post(
            confirm_url,
            {
                "token": data["reset_token"],
                "new_password": "BrandNewResetPassword999!",
                "confirm_password": "BrandNewResetPassword999!",
            },
        )
        assert confirm_res.status_code == status.HTTP_200_OK
        assert "Password has been reset successfully" in confirm_res.json()["detail"]
