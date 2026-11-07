from django.conf import settings
from django.db import models

from common.validators import validate_bar_council_number


class AdvocateProfile(models.Model):
    """Profile model storing lawyer information, enrollment, and preferences."""

    ROLE_CHOICES = (
        ("SENIOR", "Senior Advocate"),
        ("ASSOCIATE", "Associate / Junior Advocate"),
        ("CLERK", "Advocate Clerk"),
    )

    LANGUAGE_CHOICES = (
        ("en", "English"),
        ("te", "Telugu"),
        ("hi", "Hindi"),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="advocate_profile",
    )
    bar_council_enrollment_number = models.CharField(
        max_length=30,
        unique=True,
        validators=[validate_bar_council_number],
        help_text="Bar Council enrollment number in AP/XXXX/YYYY format.",
    )
    phone_number = models.CharField(max_length=20, blank=True)
    chamber_address = models.TextField(blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="ASSOCIATE")
    preferred_language = models.CharField(max_length=10, choices=LANGUAGE_CHOICES, default="en")
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.bar_council_enrollment_number})"


class PasswordResetToken(models.Model):
    """Cryptographically secure, single-use password reset tokens."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="SHA-256 hash of the single-use reset token.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    is_used = models.BooleanField(default=False, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Password Reset Token"
        verbose_name_plural = "Password Reset Tokens"

    def __str__(self):
        status = "Used" if self.is_used else "Active"
        return f"Reset Token for {self.user.username} ({status})"

    @staticmethod
    def hash_token(raw_token: str) -> str:
        import hashlib

        return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()

    def is_valid(self) -> bool:
        from django.utils import timezone

        return not self.is_used and timezone.now() < self.expires_at


class OTPVerification(models.Model):
    """
    Cryptographically secure, single-use 6-digit One-Time Password (OTP) model.
    Enforces 10-minute expiry, single-use invalidation, and max failed attempts.
    """

    PURPOSE_REGISTRATION = "REGISTRATION"
    PURPOSE_LOGIN = "LOGIN"
    PURPOSE_PASSWORD_RESET = "PASSWORD_RESET"

    PURPOSE_CHOICES = (
        (PURPOSE_REGISTRATION, "Registration Verification"),
        (PURPOSE_LOGIN, "Login Verification"),
        (PURPOSE_PASSWORD_RESET, "Password Reset Verification"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="otp_verifications",
    )
    identifier = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Target identifier (Bar Council enrollment number, email, or phone).",
    )
    otp_hash = models.CharField(
        max_length=64,
        db_index=True,
        help_text="SHA-256 hash of the 6-digit numeric OTP.",
    )
    purpose = models.CharField(
        max_length=30,
        choices=PURPOSE_CHOICES,
        default=PURPOSE_REGISTRATION,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    is_used = models.BooleanField(default=False, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    attempts_count = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "OTP Verification"
        verbose_name_plural = "OTP Verifications"
        indexes = [
            models.Index(fields=["identifier", "purpose", "is_used"]),
        ]

    def __str__(self):
        status_str = "Used" if self.is_used else ("Expired" if self.is_expired() else "Active")
        return f"OTP for {self.identifier} [{self.purpose}] ({status_str})"

    @staticmethod
    def hash_otp(raw_otp: str) -> str:
        import hashlib

        return hashlib.sha256(raw_otp.strip().encode("utf-8")).hexdigest()

    def is_expired(self) -> bool:
        from django.utils import timezone

        return timezone.now() >= self.expires_at

    def is_valid(self) -> tuple[bool, str]:
        from django.utils import timezone

        if self.is_used:
            return False, "This OTP has already been used."
        if self.attempts_count >= self.max_attempts:
            return False, "Maximum verification attempts exceeded. Please request a new OTP."
        if timezone.now() >= self.expires_at:
            return False, "This OTP has expired. Please request a new OTP."
        return True, "Valid"
