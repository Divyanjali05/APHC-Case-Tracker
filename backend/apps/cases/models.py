from django.conf import settings
from django.db import models

from common.validators import validate_case_year


class Case(models.Model):
    """Core Case model for tracking matters at the Andhra Pradesh High Court."""

    CASE_TYPE_CHOICES = (
        ("WP", "Writ Petition"),
        ("WA", "Writ Appeal"),
        ("CRLP", "Criminal Petition"),
        ("CRP", "Civil Revision Petition"),
        ("MACMA", "Motor Accident Civil Misc Appeal"),
        ("CC", "Contempt Case"),
        ("EP", "Election Petition"),
        ("OTHER", "Other"),
    )

    case_type = models.CharField(max_length=20, choices=CASE_TYPE_CHOICES, default="WP")
    case_number = models.CharField(max_length=30)
    filing_year = models.PositiveIntegerField(validators=[validate_case_year])

    petitioner = models.CharField(max_length=255)
    respondent = models.CharField(max_length=255)
    petitioner_advocate = models.CharField(max_length=255, blank=True)
    respondent_advocate = models.CharField(max_length=255, blank=True)

    current_stage = models.CharField(max_length=100, default="PENDING")
    bench = models.CharField(max_length=150, blank=True)
    court_hall_number = models.PositiveIntegerField(null=True, blank=True)
    next_hearing_date = models.DateField(null=True, blank=True)

    tracked_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="tracked_cases", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("case_type", "case_number", "filing_year")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.case_type} {self.case_number}/{self.filing_year}"


class Hearing(models.Model):
    """Hearing proceedings and history for a case."""

    STATUS_CHOICES = (
        ("SCHEDULED", "Scheduled"),
        ("RESCHEDULED", "Rescheduled"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    )

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="hearings")
    hearing_date = models.DateField(db_index=True)
    hearing_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Hearing appearance time (defaults to 10:30 AM court session if not set)",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="SCHEDULED",
        db_index=True,
    )
    court_hall_number = models.PositiveIntegerField(null=True, blank=True)
    item_number = models.PositiveIntegerField(null=True, blank=True)
    business_conducted = models.TextField(blank=True)
    next_date = models.DateField(null=True, blank=True)
    previous_hearing_date = models.DateField(null=True, blank=True)
    previous_hearing_time = models.TimeField(null=True, blank=True)
    rescheduled_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-hearing_date"]
        indexes = [
            models.Index(fields=["case", "-hearing_date"]),
            models.Index(fields=["status", "hearing_date"]),
        ]

    def __str__(self):
        time_part = f" at {self.hearing_time}" if self.hearing_time else ""
        return f"{self.case} - {self.hearing_date}{time_part} ({self.status})"

    @property
    def is_rescheduled(self) -> bool:
        return bool(self.previous_hearing_date or self.status == "RESCHEDULED")


class Judgment(models.Model):
    """Court judgment or final disposal order for a case."""

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="judgments")
    judgment_date = models.DateField(db_index=True)
    judgment_type = models.CharField(max_length=50, default="FINAL", blank=True)
    order_number = models.CharField(max_length=100, blank=True)
    bench = models.CharField(max_length=150, blank=True)
    summary = models.TextField(blank=True)
    document_link = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-judgment_date", "-created_at"]
        indexes = [
            models.Index(fields=["case", "-judgment_date"]),
        ]

    def __str__(self):
        return f"Judgment: {self.case} ({self.judgment_date})"


class CaseHistory(models.Model):
    """Audit trail and historical event timeline for tracked cases."""

    SOURCE_CHOICES = (
        ("MANUAL", "Manual Entry"),
        ("SYSTEM", "System Generated"),
        ("SYNC", "APHC Registry Sync"),
    )

    EVENT_TYPE_CHOICES = (
        ("CASE_CREATED", "Case Created"),
        ("CASE_UPDATED", "Case Details Updated"),
        ("STAGE_CHANGED", "Stage Changed"),
        ("HEARING_SCHEDULED", "Hearing Scheduled"),
        ("HEARING_RESCHEDULED", "Hearing Rescheduled"),
        ("HEARING_COMPLETED", "Hearing Completed"),
        ("HEARING_PROCEEDINGS", "Hearing Proceedings Recorded"),
        ("JUDGMENT_ENTERED", "Judgment Pronounced"),
        ("JUDGMENT_UPDATED", "Judgment Updated"),
        ("DOCUMENT_UPDATED", "Document Reference Updated"),
        ("SYNC_UPDATED", "Court Registry Synced"),
        ("COURT_STATUS_CHANGED", "Court Status Changed"),
        ("TOKEN_ALLOCATED", "Court Token Allocated"),
    )

    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        related_name="history_entries",
    )
    event_type = models.CharField(max_length=50, choices=EVENT_TYPE_CHOICES, db_index=True)
    field_name = models.CharField(max_length=100, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    description = models.TextField()
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="MANUAL")
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="case_history_changes",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["case", "-created_at"]),
            models.Index(fields=["event_type"]),
        ]

    def __str__(self):
        return f"{self.case} - {self.event_type} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"
