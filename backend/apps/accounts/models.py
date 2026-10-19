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
