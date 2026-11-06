from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import AdvocateProfile

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
        fields = ["id", "username", "email", "first_name", "last_name", "profile"]
        read_only_fields = ["id"]


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
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
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
