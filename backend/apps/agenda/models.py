"""Database models for Calendar Agenda, External Sync, and Event Mapping."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.cases.models import Hearing
from apps.reminders.models import Reminder


class CalendarSyncProvider(models.TextChoices):
    NONE = "NONE", "None"
    GOOGLE = "GOOGLE", "Google Calendar"
    APPLE_DEVICE = "APPLE_DEVICE", "Apple Device Calendar"
    ICS = "ICS", "iCalendar (ICS) Subscription"


class CalendarSyncStatus(models.TextChoices):
    IDLE = "IDLE", "Idle"
    SYNCING = "SYNCING", "Syncing"
    SUCCESS = "SUCCESS", "Success"
    FAILED = "FAILED", "Failed"


class CalendarSyncSetting(models.Model):
    """Advocate external calendar synchronization preferences and credentials."""

    advocate = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calendar_sync_setting",
    )
    sync_enabled = models.BooleanField(default=False)
    provider = models.CharField(
        max_length=30,
        choices=CalendarSyncProvider.choices,
        default=CalendarSyncProvider.NONE,
    )
    google_calendar_id = models.CharField(max_length=255, blank=True, default="primary")
    google_access_token = models.TextField(
        blank=True, default="", help_text="Google OAuth access token"
    )
    google_refresh_token = models.TextField(
        blank=True, default="", help_text="Google OAuth refresh token"
    )
    google_token_expiry = models.DateTimeField(null=True, blank=True)
    google_account_email = models.EmailField(blank=True, default="")

    sync_hearing_reminders = models.BooleanField(default=True)
    sync_compliance_deadlines = models.BooleanField(default=True)
    sync_personal_reminders = models.BooleanField(default=True)

    sync_status = models.CharField(
        max_length=30,
        choices=CalendarSyncStatus.choices,
        default=CalendarSyncStatus.IDLE,
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    sync_error = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"CalendarSync: {self.advocate.username} ({self.provider}, enabled={self.sync_enabled})"


class ExternalCalendarEventMap(models.Model):
    """Mapping between internal case/reminder events and external calendar event IDs."""

    class EventType(models.TextChoices):
        HEARING = "HEARING", "Hearing Appearance"
        REMINDER = "REMINDER", "Advocate Reminder"
        DEADLINE = "DEADLINE", "Compliance Deadline"

    advocate = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="external_calendar_events",
    )
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    hearing = models.ForeignKey(
        Hearing,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="external_calendar_mappings",
    )
    reminder = models.ForeignKey(
        Reminder,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="external_calendar_mappings",
    )
    provider = models.CharField(
        max_length=30,
        choices=CalendarSyncProvider.choices,
        default=CalendarSyncProvider.GOOGLE,
    )
    external_calendar_id = models.CharField(max_length=255, default="primary")
    external_event_id = models.CharField(max_length=255, db_index=True)
    last_payload_hash = models.CharField(max_length=64, blank=True, default="")
    last_synced_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_synced_at"]
        indexes = [
            models.Index(fields=["advocate", "provider"]),
            models.Index(fields=["hearing"]),
            models.Index(fields=["reminder"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["advocate", "provider", "external_event_id"],
                name="unique_advocate_provider_external_event",
            )
        ]

    def __str__(self) -> str:
        return f"ExtMap: {self.advocate.username} [{self.event_type}] -> {self.external_event_id}"

