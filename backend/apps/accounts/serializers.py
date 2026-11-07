from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from common.validators import validate_bar_council_number

from .models import AdvocateProfile, OTPVerification

User = get_user_model()


class AdvocateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvocateProfile
        fields = [
            "id",
            "bar_council_enrollment_number",
            "phone_number",
            "chamber_address",
            "role",
            "preferred_language",
            "is_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_verified", "created_at", "updated_at"]


class UserSerializer(serializers.ModelSerializer):
    profile = AdvocateProfileSerializer(source="advocate_profile", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "profile",
        ]
        read_only_fields = ["id"]


# ============================================================================
# Registration & Verification Serializers
# ============================================================================


class AdvocateRegisterSerializer(serializers.Serializer):
    """Validates registration data for a new High Court Advocate."""

    enrollment_number = serializers.CharField(
        max_length=30, validators=[validate_bar_council_number]
    )
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, min_length=8, required=True)
    confirm_password = serializers.CharField(write_only=True, min_length=8, required=True)
    first_name = serializers.CharField(max_length=150, required=False, default="")
    last_name = serializers.CharField(max_length=150, required=False, default="")
    phone_number = serializers.CharField(max_length=20, required=False, default="")
    chamber_address = serializers.CharField(required=False, default="")
    role = serializers.ChoiceField(choices=AdvocateProfile.ROLE_CHOICES, default="ASSOCIATE")
    preferred_language = serializers.ChoiceField(
        choices=AdvocateProfile.LANGUAGE_CHOICES, default="en"
    )

    def validate_enrollment_number(self, value):
        cleaned = value.strip().upper()
        # Check if an already verified advocate exists with this enrollment number
        if AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=cleaned, is_verified=True
        ).exists():
            raise serializers.ValidationError(
                "An active advocate account already exists with this Bar Council enrollment number."
            )
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip().lower()
        if (
            User.objects.filter(email__iexact=cleaned)
            .filter(advocate_profile__is_verified=True)
            .exists()
        ):
            raise serializers.ValidationError("An account with this email address already exists.")
        return cleaned

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            validate_password(attrs["password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        return attrs


class VerifyRegistrationOTPSerializer(serializers.Serializer):
    """Validates OTP submitted to activate advocate registration."""

    enrollment_number = serializers.CharField(required=True)
    otp = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_enrollment_number(self, value):
        return value.strip().upper()

    def validate_otp(self, value):
        cleaned = value.strip()
        if not cleaned.isdigit() or len(cleaned) != 6:
            raise serializers.ValidationError("OTP must be a 6-digit numeric code.")
        return cleaned


# ============================================================================
# Generic OTP Serializers
# ============================================================================


class RequestOTPSerializer(serializers.Serializer):
    """Requests a 6-digit OTP for a specific purpose."""

    identifier = serializers.CharField(max_length=255, required=True)
    purpose = serializers.ChoiceField(
        choices=OTPVerification.PURPOSE_CHOICES,
        default=OTPVerification.PURPOSE_PASSWORD_RESET,
    )
    channel = serializers.ChoiceField(choices=[("email", "Email"), ("sms", "SMS")], default="email")

    def validate_identifier(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Identifier is required.")
        return cleaned


class VerifyOTPSerializer(serializers.Serializer):
    """Verifies a 6-digit OTP for a given purpose."""

    identifier = serializers.CharField(max_length=255, required=True)
    otp = serializers.CharField(min_length=6, max_length=6, required=True)
    purpose = serializers.ChoiceField(choices=OTPVerification.PURPOSE_CHOICES)

    def validate_identifier(self, value):
        return value.strip()

    def validate_otp(self, value):
        cleaned = value.strip()
        if not cleaned.isdigit() or len(cleaned) != 6:
            raise serializers.ValidationError("OTP must be a 6-digit numeric code.")
        return cleaned


# ============================================================================
# Password Management Serializers
# ============================================================================


class ChangePasswordSerializer(serializers.Serializer):
    """Validates authenticated password change request."""

    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)
    confirm_password = serializers.CharField(required=True, write_only=True, min_length=8)

    def validate(self, attrs):
        user = self.context.get("request").user
        if not user.check_password(attrs["old_password"]):
            raise serializers.ValidationError({"old_password": "Current password is incorrect."})

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc

        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    """Validates the advocate enrollment number for password reset request."""

    enrollment_number = serializers.CharField(max_length=50, required=True)

    def validate_enrollment_number(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Enrollment number is required.")
        return cleaned


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Validates reset token, checks expiration and single-use, and enforces password strength."""

    token = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)
    confirm_password = serializers.CharField(required=True, write_only=True, min_length=8)

    def validate(self, attrs):
        from django.utils import timezone

        from .models import PasswordResetToken

        token_str = attrs.get("token", "").strip()
        new_password = attrs.get("new_password")
        confirm_password = attrs.get("confirm_password")

        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        token_hash = PasswordResetToken.hash_token(token_str)
        reset_token = PasswordResetToken.objects.filter(token_hash=token_hash).first()

        if not reset_token:
            raise serializers.ValidationError({"token": "Invalid or expired reset token."})

        if reset_token.is_used:
            raise serializers.ValidationError({"token": "This reset token has already been used."})

        if timezone.now() >= reset_token.expires_at:
            raise serializers.ValidationError({"token": "This reset token has expired."})

        # Validate password strength against configured Django validators
        try:
            validate_password(new_password, user=reset_token.user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": list(exc.messages)}) from exc

        attrs["reset_token_obj"] = reset_token
        return attrs
