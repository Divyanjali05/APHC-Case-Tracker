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
