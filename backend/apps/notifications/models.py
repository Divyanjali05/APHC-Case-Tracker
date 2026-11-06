import uuid

from django.conf import settings
from django.db import models


class DeviceRegistration(models.Model):
    """Stores mobile Expo push tokens for advocates' devices."""

    PLATFORM_CHOICES = (
        ("android", "Android"),
        ("ios", "iOS"),
        ("web", "Web"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="devices",
    )
    expo_push_token = models.CharField(max_length=255, unique=True)
    device_name = models.CharField(max_length=150, blank=True)
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default="android")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.platform}: {self.expo_push_token[:15]}...)"


class NotificationHistory(models.Model):
    """Archived log of dispatched push notifications."""

    CATEGORY_CHOICES = (
        ("CAUSELIST", "Cause List Listing"),
        ("TOKEN_ALERT", "Court Hall Token Alert"),
        ("REMINDER", "Compliance Deadline Reminder"),
        ("JUDGMENT", "Judgment & Orders"),
        ("HEARING_CHANGE", "Hearing Changes"),
        ("GENERAL", "General Announcement"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="GENERAL")
    data_payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.user.username} - {self.title}"


class RealtimeEvent(models.Model):
    """Authoritative event log for in-app real-time synchronization.

    Provides monotonic cursor-based event replay for missed events, reconnects,
    and offline client catch-up with strict advocate data isolation.
    """

    EVENT_TYPES = (
        ("COURT_TOKEN_UPDATED", "Court Token Updated"),
        ("HEARING_RESCHEDULED", "Hearing Rescheduled"),
        ("HEARING_CHANGED", "Hearing Changed"),
        ("JUDGMENT_PRONOUNCED", "Judgment Pronounced"),
        ("JUDGMENT_DOCUMENT_UPLOADED", "Judgment Document Uploaded"),
        ("REMINDER_DUE", "Hearing Reminder Due"),
        ("NOTIFICATION_CREATED", "New Notification Archived"),
        ("NOTIFICATION_READ", "Notification Marked Read"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="realtime_events",
        db_index=True,
    )
    event_type = models.CharField(max_length=50, choices=EVENT_TYPES, db_index=True)
    event_uuid = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["user", "id"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"[{self.id}] {self.user.username} - {self.event_type} ({self.created_at})"
