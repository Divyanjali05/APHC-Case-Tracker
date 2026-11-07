from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import AdvocateProfile, OTPVerification
from .serializers import (
    AdvocateRegisterSerializer,
    ChangePasswordSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RequestOTPSerializer,
    UserSerializer,
    VerifyOTPSerializer,
    VerifyRegistrationOTPSerializer,
)
from .services import OTPService, PasswordResetDeliveryService

User = get_user_model()


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Obtain JWT token pair with rate limiting."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class ThrottledTokenRefreshView(TokenRefreshView):
    """Refresh JWT access token with rotation and rate limiting."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "refresh"


class LogoutView(APIView):
    """Revoke and blacklist the advocate's refresh token on sign-out."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"error": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {"detail": "Session logged out and refresh token invalidated successfully."},
                status=status.HTTP_200_OK,
            )
        except TokenError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ============================================================================
# Advocate Registration & OTP Activation Views
# ============================================================================


class AdvocateRegisterView(APIView):
    """
    Register a new High Court Advocate and dispatch a 10-minute single-use OTP.
    Rate-limited to prevent automated spam/enumeration.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        serializer = AdvocateRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        enrollment = data["enrollment_number"]
        email = data["email"]
        password = data["password"]
        first_name = data.get("first_name", "")
        last_name = data.get("last_name", "")
        phone = data.get("phone_number", "")
        chamber = data.get("chamber_address", "")
        role = data.get("role", "ASSOCIATE")
        language = data.get("preferred_language", "en")

        username = enrollment.replace("/", "").strip().upper()

        user = User.objects.filter(username__iexact=username).first()
        if not user:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
                is_active=True,
            )
        else:
            user.set_password(password)
            user.email = email
            user.first_name = first_name
            user.last_name = last_name
            user.save()

        profile, _ = AdvocateProfile.objects.get_or_create(
            user=user,
            defaults={
                "bar_council_enrollment_number": enrollment,
                "phone_number": phone,
                "chamber_address": chamber,
                "role": role,
                "preferred_language": language,
                "is_verified": False,
            },
        )
        if not profile.is_verified:
            profile.phone_number = phone
            profile.chamber_address = chamber
            profile.role = role
            profile.preferred_language = language
            profile.save()

        ip_address = request.META.get("REMOTE_ADDR")
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        _, raw_otp = OTPService.issue_otp(
            identifier=enrollment,
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=user,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        OTPService.deliver_otp(
            target=email,
            raw_otp=raw_otp,
            purpose=OTPVerification.PURPOSE_REGISTRATION,
            user=user,
            channel="email",
        )

        return Response(
            {
                "detail": (
                    "Registration initiated. A 6-digit verification OTP has been sent to your email."
                ),
                "enrollment_number": enrollment,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyRegistrationOTPView(APIView):
    """
    Verify 6-digit OTP for advocate registration, mark profile as verified,
    and return an initial JWT authentication token pair.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        serializer = VerifyRegistrationOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.validated_data["enrollment_number"]
        otp = serializer.validated_data["otp"]

        success, message, record = OTPService.verify_otp(
            identifier=enrollment,
            raw_otp=otp,
            purpose=OTPVerification.PURPOSE_REGISTRATION,
        )

        if not success:
            return Response(
                {"error": message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=enrollment
        ).first()

        if not profile or not profile.user:
            return Response(
                {"error": "Advocate account not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        profile.is_verified = True
        profile.save(update_fields=["is_verified"])
        user = profile.user
        user.is_active = True
        user.save(update_fields=["is_active"])

        # Generate JWT Token Pair
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "detail": "Advocate account verified and activated successfully.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


# ============================================================================
# Generic OTP Views (Password Reset & Login OTP)
# ============================================================================


class RequestOTPView(APIView):
    """
    Request a 6-digit OTP for password reset or login verification.
    Returns a generic success message to prevent account enumeration.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["identifier"]
        purpose = serializer.validated_data["purpose"]
        channel = serializer.validated_data.get("channel", "email")

        # Lookup user by enrollment number, username, or email
        profile = AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=identifier
        ).first()
        user = profile.user if profile else None

        if not user:
            cleaned_username = identifier.replace("/", "").strip()
            user = (
                User.objects.filter(username__iexact=cleaned_username).first()
                or User.objects.filter(email__iexact=identifier).first()
            )

        if user and user.is_active:
            ip_address = request.META.get("REMOTE_ADDR")
            user_agent = request.META.get("HTTP_USER_AGENT", "")
            target_contact = (
                user.email
                if channel == "email"
                else (getattr(user.advocate_profile, "phone_number", None) or user.email)
            )

            if target_contact:
                _, raw_otp = OTPService.issue_otp(
                    identifier=identifier,
                    purpose=purpose,
                    user=user,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                OTPService.deliver_otp(
                    target=target_contact,
                    raw_otp=raw_otp,
                    purpose=purpose,
                    user=user,
                    channel=channel,
                )

        return Response(
            {
                "detail": (
                    "If a matching account was found, a 6-digit verification OTP has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class VerifyOTPView(APIView):
    """
    Verify 6-digit OTP.
    For PASSWORD_RESET purpose: generates a single-use reset token for password reset.
    For LOGIN purpose: generates active JWT tokens.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["identifier"]
        otp = serializer.validated_data["otp"]
        purpose = serializer.validated_data["purpose"]

        success, message, record = OTPService.verify_otp(
            identifier=identifier,
            raw_otp=otp,
            purpose=purpose,
        )

        if not success:
            return Response(
                {"error": message},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = record.user if record else None
        if not user:
            profile = AdvocateProfile.objects.filter(
                bar_council_enrollment_number__iexact=identifier
            ).first()
            if profile:
                user = profile.user

        if purpose == OTPVerification.PURPOSE_PASSWORD_RESET and user:
            # Generate a secure single-use PasswordResetToken for the confirm endpoint
            ip_address = request.META.get("REMOTE_ADDR")
            user_agent = request.META.get("HTTP_USER_AGENT", "")
            _, raw_token = PasswordResetDeliveryService.create_reset_token(
                user=user, ip_address=ip_address, user_agent=user_agent
            )
            return Response(
                {
                    "detail": "OTP verified successfully. You may now reset your password.",
                    "reset_token": raw_token,
                },
                status=status.HTTP_200_OK,
            )

        if purpose == OTPVerification.PURPOSE_LOGIN and user:
            refresh = RefreshToken.for_user(user)
            return Response(
                {
                    "detail": "Login verification successful.",
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {"detail": "OTP verified successfully."},
            status=status.HTTP_200_OK,
        )


# ============================================================================
# Password Management Views
# ============================================================================


class ChangePasswordView(APIView):
    """
    Change password for authenticated advocate.
    Validates existing password, enforces strength requirements,
    and invalidates active refresh token sessions.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "change_password"

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        new_password = serializer.validated_data["new_password"]

        user.set_password(new_password)
        user.save()

        # Invalidate old refresh token sessions
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )

            for outstanding in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=outstanding)
        except Exception:
            pass

        # Issue fresh token pair so current session continues smoothly
        new_refresh = RefreshToken.for_user(user)

        return Response(
            {
                "detail": "Password changed successfully.",
                "access": str(new_refresh.access_token),
                "refresh": str(new_refresh),
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    """Request a single-use password reset token without disclosing account existence."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_request"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        enrollment_raw = serializer.validated_data["enrollment_number"]

        # Find user by profile enrollment number or username
        user = None
        profile = AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=enrollment_raw
        ).first()
        if profile and profile.user:
            user = profile.user
        else:
            cleaned_username = enrollment_raw.replace("/", "").strip()
            user = User.objects.filter(username__iexact=cleaned_username).first()
            if not user:
                user = User.objects.filter(username__iexact=enrollment_raw).first()

        if user and user.is_active:
            ip_address = request.META.get("REMOTE_ADDR")
            user_agent = request.META.get("HTTP_USER_AGENT", "")
            _, raw_token = PasswordResetDeliveryService.create_reset_token(
                user=user, ip_address=ip_address, user_agent=user_agent
            )
            PasswordResetDeliveryService.deliver_reset_token(user, raw_token)

        # Constant generic response to completely prevent account enumeration
        return Response(
            {
                "detail": (
                    "If an account exists with the provided enrollment number, "
                    "password reset instructions have been dispatched."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """Confirm password reset with single-use token and invalidate all active sessions."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        from django.utils import timezone

        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reset_token = serializer.validated_data["reset_token_obj"]
        new_password = serializer.validated_data["new_password"]
        user = reset_token.user

        # Securely update user password
        user.set_password(new_password)
        user.save()

        # Mark single-use token as used
        reset_token.is_used = True
        reset_token.used_at = timezone.now()
        reset_token.save(update_fields=["is_used", "used_at"])

        # Invalidate existing active refresh token sessions for this user
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )

            for outstanding in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=outstanding)
        except Exception:
            pass

        return Response(
            {
                "detail": (
                    "Password has been reset successfully. Please sign in with your new password."
                )
            },
            status=status.HTTP_200_OK,
        )


class ProfileView(APIView):
    """Retrieve or update the authenticated advocate's profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class AccountsStatusView(APIView):
    """Health / readiness probe for accounts app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "app": "accounts",
                "status": "ready",
                "description": "Advocate Identity & Authentication Hardening",
            },
            status=status.HTTP_200_OK,
        )
