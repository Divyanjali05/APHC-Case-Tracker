"""Database models for Court Listing and Historical Status Observations."""

from __future__ import annotations

from django.db import models

from apps.cases.models import Case

from .status_mapping import NormalizedCourtStatus


class CourtListing(models.Model):
    """Latest known court listing and token status for a tracked case matter."""

    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        related_name="court_listings",
    )
    court_name = models.CharField(
        max_length=200,
        default="High Court of Andhra Pradesh",
    )
    bench = models.CharField(max_length=255, blank=True, default="")
    court_hall = models.PositiveIntegerField(null=True, blank=True)
    listing_date = models.DateField(null=True, blank=True, db_index=True)
    session = models.CharField(max_length=100, blank=True, default="")
    item_number = models.PositiveIntegerField(null=True, blank=True)
    token_number = models.CharField(max_length=100, blank=True, default="")
    source_status = models.CharField(max_length=100, default="NOT_LISTED")
    normalized_status = models.CharField(
        max_length=30,
        choices=NormalizedCourtStatus.CHOICES,
        default=NormalizedCourtStatus.NOT_LISTED,
        db_index=True,
    )
    provider_name = models.CharField(max_length=100, default="APHC_REGISTRY_MOCK")
    last_synced_at = models.DateTimeField(null=True, blank=True)
    is_mock = models.BooleanField(
        default=True,
        help_text="Indicates observation originates from test mock provider.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-listing_date", "-updated_at"]
        indexes = [
            models.Index(fields=["case", "-listing_date"]),
            models.Index(fields=["case", "normalized_status"]),
            models.Index(fields=["listing_date", "court_hall"]),
        ]

    def __str__(self) -> str:
        date_str = self.listing_date.isoformat() if self.listing_date else "Unscheduled"
        hall_str = f" Hall {self.court_hall}" if self.court_hall else ""
        item_str = f" Item #{self.item_number}" if self.item_number else ""
        return f"{self.case}: {self.normalized_status} ({date_str}{hall_str}{item_str})"


class CourtStatusObservation(models.Model):
    """Immutable point-in-time observation record from a court data provider.

    Preserves audit history across sync cycles, recording all changes in listing,
    token numbers, and court board positions.
    """

    case = models.ForeignKey(
        Case,
        on_delete=models.CASCADE,
        related_name="court_status_observations",
    )
    court_listing = models.ForeignKey(
        CourtListing,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="observations",
    )
    source_status = models.CharField(max_length=100)
    normalized_status = models.CharField(
        max_length=30,
        choices=NormalizedCourtStatus.CHOICES,
        db_index=True,
    )
    provider_name = models.CharField(max_length=100)
    observed_at = models.DateTimeField(db_index=True)
    source_reference = models.CharField(max_length=200, blank=True, default="")
    court_hall = models.PositiveIntegerField(null=True, blank=True)
    item_number = models.PositiveIntegerField(null=True, blank=True)
    token_number = models.CharField(max_length=100, blank=True, default="")
    safe_metadata = models.JSONField(default=dict, blank=True)
    is_meaningful_change = models.BooleanField(default=False)
    is_alert_dispatched = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-observed_at", "-created_at"]
        indexes = [
            models.Index(fields=["case", "-observed_at"]),
            models.Index(fields=["court_listing", "-observed_at"]),
            models.Index(fields=["normalized_status", "-observed_at"]),
        ]

    def __str__(self) -> str:
        time_str = self.observed_at.strftime("%Y-%m-%d %H:%M:%S")
        return f"Observation {self.case} [{self.normalized_status}] at {time_str}"
