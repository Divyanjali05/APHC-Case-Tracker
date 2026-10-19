from django.conf import settings
from django.db import models

from apps.cases.models import Case


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
    """Advocate alert subscription for upcoming court hall item proximity."""

    advocate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="token_alerts"
    )
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="token_alerts")
    court_hall = models.ForeignKey(CourtHall, on_delete=models.CASCADE, related_name="token_alerts")
    listed_item_number = models.PositiveIntegerField()
    alert_threshold = models.PositiveIntegerField(
        default=5, help_text="Send alert when active item is within X items"
    )
    is_notified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def calculate_distance(self) -> int:
        """Returns number of items remaining before this matter is called."""
        if hasattr(self.court_hall, "token_status"):
            active_item = self.court_hall.token_status.current_item_number
            return max(0, self.listed_item_number - active_item)
        return self.listed_item_number

    def __str__(self):
        return f"{self.advocate.username} - Hall {self.court_hall.hall_number} Item {self.listed_item_number}"
