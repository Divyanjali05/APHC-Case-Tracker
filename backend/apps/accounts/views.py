from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
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
)
from .services import OTPService, PasswordResetDeliveryService

User = get_user_model()


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Obtain JWT token pair with dedicated login rate limiting."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class ThrottledTokenRefreshView(TokenRefreshView):
    """Refresh JWT access token with rotation, blacklisting, and rate limiting."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "refresh"


class LogoutView(APIView):
    """Revoke and blacklist the advocate's refresh token on sign-out."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token or not isinstance(refresh_token, str):
            return Response(
                {"error": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {"detail": "Logged out and refresh token revoked successfully."},
                status=status.HTTP_200_OK,
            )
        except TokenError:
            return Response(
                {"error": "Invalid or already blacklisted refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class AdvocateRegisterView(APIView):
    """Direct advocate registration (no OTP) creating User and AdvocateProfile immediately."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        serializer = AdvocateRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "detail": (
                    "Advocate account registered successfully. "
                    "You can now log in with your Bar Council enrollment number."
                ),
                "enrollment_number": user.advocate_profile.bar_council_enrollment_number,
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class RequestOTPView(APIView):
    """Request a 6-digit OTP for password reset or login verification."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["identifier"]
        purpose = serializer.validated_data["purpose"]
        channel = serializer.validated_data.get("channel", "email")

        profile = AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=identifier
        ).first()
        user = profile.user if profile else None

        if not user:
            cleaned_username = identifier.replace("/", "").strip()
            user = (
                User.objects.filter(username__iexact=identifier.strip()).first()
                or User.objects.filter(username__iexact=cleaned_username).first()
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
    """Verify 6-digit OTP for password reset or login verification."""

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
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        user = record.user if record else None
        if not user:
            profile = AdvocateProfile.objects.filter(
                bar_council_enrollment_number__iexact=identifier
            ).first()
            if profile:
                user = profile.user

        if purpose == OTPVerification.PURPOSE_PASSWORD_RESET and user:
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

        return Response({"detail": "OTP verified successfully."}, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    """Change password for authenticated advocate and invalidate prior refresh sessions."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "change_password"

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )

            for outstanding in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=outstanding)
        except Exception:
            pass

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

        user = None
        profile = AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=enrollment_raw
        ).first()
        if profile and profile.user:
            user = profile.user
        else:
            cleaned_username = enrollment_raw.replace("/", "").strip()
            user = (
                User.objects.filter(username__iexact=enrollment_raw.strip()).first()
                or User.objects.filter(username__iexact=cleaned_username).first()
            )

        if user and user.is_active:
            ip_address = request.META.get("REMOTE_ADDR")
            user_agent = request.META.get("HTTP_USER_AGENT", "")
            _, raw_token = PasswordResetDeliveryService.create_reset_token(
                user=user, ip_address=ip_address, user_agent=user_agent
            )
            PasswordResetDeliveryService.deliver_reset_token(user, raw_token)

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
        user = reset_token.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()

        reset_token.is_used = True
        reset_token.used_at = timezone.now()
        reset_token.save(update_fields=["is_used", "used_at"])

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
                "description": "Advocate Identity & Direct Registration",
            },
            status=status.HTTP_200_OK,
        )
