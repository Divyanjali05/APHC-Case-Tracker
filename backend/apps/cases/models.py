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

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="hearings")
    hearing_date = models.DateField()
    court_hall_number = models.PositiveIntegerField(null=True, blank=True)
    item_number = models.PositiveIntegerField(null=True, blank=True)
    business_conducted = models.TextField(blank=True)
    next_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-hearing_date"]

    def __str__(self):
        return f"{self.case} - {self.hearing_date}"
