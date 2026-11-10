from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from common.permissions import ROLE_ADMIN, ROLE_ADVOCATE, get_user_role
from common.validators import validate_bar_council_number

from .models import AdminAuditLog, AdvocateProfile, OTPVerification

User = get_user_model()


def issue_tokens_for_user(user) -> dict[str, str]:
    """Generate JWT access/refresh pair with canonical role claim."""
    refresh = RefreshToken.for_user(user)
    role = get_user_role(user)
    refresh["role"] = role
    access = refresh.access_token
    access["role"] = role
    return {"access": str(access), "refresh": str(refresh)}


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
    role = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "is_admin",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "profile",
        ]
        read_only_fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "is_admin",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "profile",
        ]

    def get_role(self, obj) -> str:
        return get_user_role(obj)

    def get_is_admin(self, obj) -> bool:
        return get_user_role(obj) == ROLE_ADMIN

    def get_full_name(self, obj) -> str:
        return obj.get_full_name().strip() or obj.username


class UserProfileUpdateSerializer(serializers.Serializer):
    """Allows authenticated users to update ONLY safe self-profile fields."""

    _FORBIDDEN_FIELDS = {
        "role",
        "is_admin",
        "is_staff",
        "is_superuser",
        "is_active",
        "is_verified",
        "username",
        "bar_council_enrollment_number",
    }

    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    chamber_address = serializers.CharField(required=False, allow_blank=True)
    preferred_language = serializers.ChoiceField(
        choices=AdvocateProfile.LANGUAGE_CHOICES, required=False
    )

    def validate(self, attrs):
        if hasattr(self, "initial_data") and isinstance(self.initial_data, dict):
            forbidden = sorted(self._FORBIDDEN_FIELDS.intersection(self.initial_data.keys()))
            if forbidden:
                raise serializers.ValidationError(
                    dict.fromkeys(forbidden, "This field cannot be modified from your profile.")
                )
        return attrs

    def validate_email(self, value):
        cleaned = value.strip().lower()
        user = self.context.get("user")
        if (
            cleaned
            and User.objects.filter(email__iexact=cleaned)
            .exclude(pk=getattr(user, "pk", None))
            .exists()
        ):
            raise serializers.ValidationError("An account with this email address already exists.")
        return cleaned


class APHCJwtTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Authenticate using username OR Bar Council enrollment ID and return user role details."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = get_user_role(user)
        return token

    def validate(self, attrs):
        raw_identifier = str(attrs.get(self.username_field, "") or "").strip()
        if raw_identifier and not User.objects.filter(username=raw_identifier).exists():
            profile = (
                AdvocateProfile.objects.filter(bar_council_enrollment_number__iexact=raw_identifier)
                .select_related("user")
                .first()
            )
            if profile and profile.user:
                attrs[self.username_field] = profile.user.username

        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


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
        compact_username = cleaned.replace("/", "")
        if AdvocateProfile.objects.filter(
            bar_council_enrollment_number__iexact=cleaned, is_verified=True
        ).exists():
            raise serializers.ValidationError(
                "An active advocate account already exists with this Bar Council enrollment number."
            )
        if (
            User.objects.filter(username__iexact=compact_username)
            .filter(advocate_profile__is_verified=True)
            .exists()
        ):
            raise serializers.ValidationError(
                "An active account already exists with this identifier."
            )
        if (
            User.objects.filter(username__iexact=compact_username).filter(is_staff=True).exists()
            or User.objects.filter(username__iexact=compact_username)
            .filter(is_superuser=True)
            .exists()
        ):
            raise serializers.ValidationError("This identifier cannot be registered publicly.")
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip().lower()
        if (
            User.objects.filter(email__iexact=cleaned)
            .filter(advocate_profile__is_verified=True)
            .exists()
            or User.objects.filter(email__iexact=cleaned, is_staff=True).exists()
            or User.objects.filter(email__iexact=cleaned, is_superuser=True).exists()
        ):
            raise serializers.ValidationError("An account with this email address already exists.")
        return cleaned

    def validate(self, attrs):
        if isinstance(getattr(self, "initial_data", None), dict):
            if self.initial_data.get("is_staff") or self.initial_data.get("is_superuser"):
                raise serializers.ValidationError(
                    {"non_field_errors": ["Public registration cannot grant admin privileges."]}
                )
            raw_acc_role = str(self.initial_data.get("account_role", "")).strip().upper()
            if raw_acc_role == ROLE_ADMIN:
                raise serializers.ValidationError(
                    {"account_role": ["Public registration cannot create Admin accounts."]}
                )

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


# ============================================================================
# Administrative Serializers
# ============================================================================


class AdminUserCreateSerializer(serializers.Serializer):
    """Serializer for Admin-initiated Advocate or Admin account creation."""

    enrollment_number = serializers.CharField(
        max_length=30, validators=[validate_bar_council_number]
    )
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True, min_length=8, required=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone_number = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )
    chamber_address = serializers.CharField(required=False, allow_blank=True, default="")
    designation = serializers.ChoiceField(
        choices=AdvocateProfile.ROLE_CHOICES, default="ASSOCIATE", required=False
    )
    preferred_language = serializers.ChoiceField(
        choices=AdvocateProfile.LANGUAGE_CHOICES, default="en", required=False
    )
    account_role = serializers.ChoiceField(
        choices=[(ROLE_ADVOCATE, "Advocate"), (ROLE_ADMIN, "Administrator")],
        default=ROLE_ADVOCATE,
        required=False,
    )
    is_active = serializers.BooleanField(default=True, required=False)
    is_verified = serializers.BooleanField(default=True, required=False)

    def validate_enrollment_number(self, value):
        cleaned = value.strip().upper()
        if AdvocateProfile.objects.filter(bar_council_enrollment_number__iexact=cleaned).exists():
            raise serializers.ValidationError(
                "An account with this Bar Council enrollment number already exists."
            )
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip().lower()
        if cleaned and User.objects.filter(email__iexact=cleaned).exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return cleaned

    def validate(self, attrs):
        enrollment = attrs["enrollment_number"]
        raw_username = (attrs.get("username") or "").strip() or enrollment
        if User.objects.filter(username__iexact=raw_username).exists():
            raise serializers.ValidationError(
                {"username": "An account with this username already exists."}
            )
        attrs["resolved_username"] = raw_username

        try:
            validate_password(attrs["password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        return attrs


class AdminUserUpdateSerializer(serializers.Serializer):
    """Serializer for Admin updates to user status, role, and profile metadata."""

    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    chamber_address = serializers.CharField(required=False, allow_blank=True)
    designation = serializers.ChoiceField(choices=AdvocateProfile.ROLE_CHOICES, required=False)
    preferred_language = serializers.ChoiceField(
        choices=AdvocateProfile.LANGUAGE_CHOICES, required=False
    )
    is_active = serializers.BooleanField(required=False)
    is_verified = serializers.BooleanField(required=False)
    account_role = serializers.ChoiceField(
        choices=[(ROLE_ADVOCATE, "Advocate"), (ROLE_ADMIN, "Administrator")],
        required=False,
    )

    def validate_email(self, value):
        cleaned = value.strip().lower()
        target_user = self.context.get("target_user")
        if (
            cleaned
            and User.objects.filter(email__iexact=cleaned)
            .exclude(pk=getattr(target_user, "pk", None))
            .exists()
        ):
            raise serializers.ValidationError("Another account already uses this email address.")
        return cleaned


class AdminAuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()
    target_username = serializers.SerializerMethodField()
    target_case_number = serializers.SerializerMethodField()

    class Meta:
        model = AdminAuditLog
        fields = [
            "id",
            "action",
            "actor",
            "actor_username",
            "actor_name",
            "target_user",
            "target_username",
            "target_case",
            "target_case_number",
            "summary",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_username(self, obj) -> str | None:
        return obj.actor.username if obj.actor else None

    def get_actor_name(self, obj) -> str:
        if not obj.actor:
            return "System"
        return obj.actor.get_full_name().strip() or obj.actor.username

    def get_target_username(self, obj) -> str | None:
        return obj.target_user.username if obj.target_user else None

    def get_target_case_number(self, obj) -> str | None:
        if not obj.target_case:
            return None
        c = obj.target_case
        return f"{c.case_type} {c.case_number}/{c.filing_year}"
