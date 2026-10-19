from django.conf import settings
from django.db import models

from apps.cases.models import Case


class Reminder(models.Model):
    """Scheduled compliance deadline or advocate diary reminder."""

    TYPE_CHOICES = (
        ("HEARING", "Hearing Appearance"),
        ("FILING", "Filing / Counter Affidavit"),
        ("BATTA", "Process Fee / Batta Payment"),
        ("GENERAL", "General Diary Note"),
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
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    reminder_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="GENERAL")
    due_date = models.DateTimeField()
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date"]

    def __str__(self):
        return f"{self.title} - {self.due_date.strftime('%Y-%m-%d %H:%M')}"
