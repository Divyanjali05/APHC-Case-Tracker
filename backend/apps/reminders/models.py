from django.conf import settings
from django.db import models

from apps.cases.models import Case, Hearing


class Reminder(models.Model):
    """Scheduled compliance deadline or advocate diary reminder."""

    TYPE_CHOICES = (
        ("HEARING", "Hearing Appearance"),
        ("FILING", "Filing / Counter Affidavit"),
        ("BATTA", "Process Fee / Batta Payment"),
        ("GENERAL", "General Diary Note"),
    )

    STATUS_CHOICES = (
        ("PENDING", "Pending"),
        ("PROCESSING", "Processing Delivery"),
        ("SENT", "Notification Dispatched"),
        ("FAILED", "Delivery Failed"),
        ("CANCELLED", "Cancelled / Obsolete"),
        ("DISMISSED", "Dismissed by Advocate"),
    )

    advocate = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reminders",
    )
    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="reminders",
    )
    hearing = models.ForeignKey(
        Hearing,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="reminders",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    reminder_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="GENERAL")
    reminder_interval_hours = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Configured interval in hours before the hearing event (e.g., 24 or 1).",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="PENDING", db_index=True
    )
    due_date = models.DateTimeField(db_index=True)
    is_completed = models.BooleanField(default=False)
    retry_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of attempted delivery retries.",
    )
    notification_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date"]
        indexes = [
            models.Index(fields=["advocate", "status", "due_date"]),
            models.Index(fields=["hearing", "reminder_interval_hours"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["advocate", "hearing", "reminder_interval_hours"],
                condition=models.Q(status__in=["PENDING", "PROCESSING"]),
                name="unique_active_hearing_reminder_interval",
            )
        ]

    def __str__(self):
        return f"{self.title} - {self.due_date.strftime('%Y-%m-%d %H:%M')} ({self.status})"


class ReminderPreference(models.Model):
    """Advocate preferences for hearing reminder schedules and notification channels."""

    advocate = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reminder_preferences",
    )
    remind_24h_before = models.BooleanField(
        default=True,
        help_text="Receive an automated reminder 24 hours prior to scheduled hearing.",
    )
    remind_1h_before = models.BooleanField(
        default=True,
        help_text="Receive an automated reminder 1 hour prior to scheduled hearing.",
    )
    email_notifications = models.BooleanField(default=False)
    push_notifications = models.BooleanField(default=True)
    judgment_push_notifications = models.BooleanField(
        default=True,
        help_text="Receive push notification when a judgment or order is pronounced/uploaded.",
    )
    hearing_change_push_notifications = models.BooleanField(
        default=True,
        help_text="Receive push notification when a hearing appearance is rescheduled, adjourned, or cancelled.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences: {self.advocate.username} (24h={self.remind_24h_before}, 1h={self.remind_1h_before})"
