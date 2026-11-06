from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import UserSerializer


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


class PasswordResetRequestView(APIView):
    """Request a single-use password reset token without disclosing account existence."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_request"

    def post(self, request):
        from django.contrib.auth import get_user_model

        from .models import AdvocateProfile
        from .serializers import PasswordResetRequestSerializer
        from .services import PasswordResetDeliveryService

        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        enrollment_raw = serializer.validated_data["enrollment_number"]
        User = get_user_model()

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

        from .serializers import PasswordResetConfirmSerializer

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
            {"app": "accounts", "status": "ready", "description": "Advocate Identity & Profiles"},
            status=status.HTTP_200_OK,
        )
