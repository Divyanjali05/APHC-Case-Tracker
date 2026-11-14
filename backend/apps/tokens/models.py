import datetime

from django.conf import settings
from django.db import models

from apps.cases.models import Case


class TokenStatus(models.TextChoices):
    REGISTERED = "REGISTERED", "Registered"
    WAITING = "WAITING", "Waiting"
    APPROACHING = "APPROACHING", "Approaching"
    CALLED = "CALLED", "Called"
    COMPLETED = "COMPLETED", "Completed"
    ADJOURNED = "ADJOURNED", "Adjourned"
    CANCELLED = "CANCELLED", "Cancelled"
    UNKNOWN = "UNKNOWN", "Unknown"


class CourtHall(models.Model):
    """Court Hall representation at Andhra Pradesh High Court."""

    hall_number = models.PositiveIntegerField(unique=True)
    bench_name = models.CharField(max_length=150)
    presiding_judges = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["hall_number"]

    def __str__(self):
        return f"Court Hall {self.hall_number}: {self.bench_name}"


class CourtTokenStatus(models.Model):
    """Live active item number and status for a court hall display board."""

    court_hall = models.OneToOneField(
        CourtHall, on_delete=models.CASCADE, related_name="token_status"
    )
    current_item_number = models.PositiveIntegerField(default=0)
    current_stage = models.CharField(max_length=100, default="NOT_STARTED")
    last_polled_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Hall {self.court_hall.hall_number} -> Item {self.current_item_number}"


class TokenAlertRule(models.Model):
    """Advocate alert subscription for upcoming court hall token/item proximity."""

    advocate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="token_alerts"
    )
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="token_alerts")
    court_hall = models.ForeignKey(CourtHall, on_delete=models.CASCADE, related_name="token_alerts")
    court_name = models.CharField(max_length=150, default="High Court of Andhra Pradesh")
    hearing_date = models.DateField(default=datetime.date.today)
    token_number = models.CharField(max_length=50, default="")
    listed_item_number = models.PositiveIntegerField()
    bench_name = models.CharField(max_length=150, blank=True)

    alert_threshold = models.PositiveIntegerField(
        default=5, help_text="Send alert when active item is within X items"
    )
    alert_on_approach = models.BooleanField(
        default=True, help_text="Notify when current item approaches within alert_threshold"
    )
    alert_on_called = models.BooleanField(default=True, help_text="Notify when token is called")

    status = models.CharField(
        max_length=30,
        choices=TokenStatus.choices,
        default=TokenStatus.REGISTERED,
    )
    current_called_token = models.CharField(max_length=50, blank=True, default="")
    items_remaining = models.IntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_stale = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    sync_source = models.CharField(max_length=100, default="APHC_DEMO_PROVIDER")
    is_mock = models.BooleanField(default=True)

    approaching_alert_sent = models.BooleanField(default=False)
    called_alert_sent = models.BooleanField(default=False)
    is_notified = models.BooleanField(default=False)  # Legacy compatibility

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["advocate", "court_hall", "token_number", "hearing_date"],
                condition=models.Q(is_active=True),
                name="unique_active_advocate_token_alert",
            )
        ]

    def calculate_distance(self) -> int:
        """Returns number of items remaining before this matter is called."""
        if self.items_remaining is not None:
            return max(0, self.items_remaining)
        if self.current_called_token and self.current_called_token.isdigit():
            return max(0, self.listed_item_number - int(self.current_called_token))
        if hasattr(self.court_hall, "token_status"):
            active_item = self.court_hall.token_status.current_item_number
            return max(0, self.listed_item_number - active_item)
        return self.listed_item_number

    def mark_cancelled(self) -> None:
        """Cancels this alert subscription idempotently."""
        self.is_active = False
        self.status = TokenStatus.CANCELLED
        self.save(update_fields=["is_active", "status", "updated_at"])

    def __str__(self):
        return f"{self.advocate.username} - Hall {self.court_hall.hall_number} Token {self.token_number} (Item {self.listed_item_number})"
