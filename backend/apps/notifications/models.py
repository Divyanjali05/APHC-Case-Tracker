import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class DeviceRegistration(models.Model):
    """Stores mobile Expo push tokens and metadata for advocates' devices."""

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
    device_id = models.CharField(max_length=120, blank=True, db_index=True)
    app_version = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(default=timezone.now)
    failure_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user.username} ({self.platform}: {self.expo_push_token[:15]}...)"


# Backward and forward compatibility alias
DeviceToken = DeviceRegistration


class NotificationHistory(models.Model):
    """Archived log of dispatched push and in-app notifications."""

    CATEGORY_CHOICES = (
        # Phase 7 categories
        ("HEARING_REMINDER", "Hearing Reminder"),
        ("TOKEN_APPROACHING", "Token Approaching Alert"),
        ("TOKEN_CALLED", "Token Called Alert"),
        ("CASE_UPDATE", "Case Status Update"),
        ("CALENDAR_REMINDER", "Calendar Reminder"),
        ("COMPLIANCE_DEADLINE", "Compliance Deadline"),
        ("VOICE_TRANSCRIPTION_COMPLETED", "Voice Transcription Completed"),
        ("VOICE_TRANSCRIPTION_FAILED", "Voice Transcription Failed"),
        ("SYSTEM_ALERT", "System Alert"),
        # Phase 0-6 legacy categories
        ("CAUSELIST", "Cause List Listing"),
        ("TOKEN_ALERT", "Court Hall Token Alert"),
        ("REMINDER", "Compliance Deadline Reminder"),
        ("JUDGMENT", "Judgment & Orders"),
        ("HEARING_CHANGE", "Hearing Changes"),
        ("GENERAL", "General Announcement"),
    )

    STATUS_CHOICES = (
        ("QUEUED", "Queued"),
        ("ACCEPTED_BY_PROVIDER", "Accepted by Provider"),
        ("DELIVERED", "Delivered"),
        ("FAILED", "Failed"),
        ("PERMANENT_FAILURE", "Permanent Failure"),
        ("NO_ACTIVE_DEVICES", "No Active Devices"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES, default="GENERAL", db_index=True)
    data_payload = models.JSONField(default=dict, blank=True)
    delivery_status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="QUEUED", db_index=True)
    idempotency_key = models.CharField(max_length=150, blank=True, null=True, db_index=True)
    is_read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]
        indexes = [
            models.Index(fields=["user", "-sent_at"]),
            models.Index(fields=["user", "category"]),
            models.Index(fields=["user", "is_read"]),
            models.Index(fields=["idempotency_key"]),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.title}"


# Backward and forward compatibility alias
Notification = NotificationHistory


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
