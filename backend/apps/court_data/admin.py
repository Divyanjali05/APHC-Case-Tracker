"""Django admin configuration for court_data app."""

from __future__ import annotations

from django.contrib import admin

from .models import CourtListing, CourtStatusObservation


@admin.register(CourtListing)
class CourtListingAdmin(admin.ModelAdmin):
    list_display = (
        "case",
        "normalized_status",
        "listing_date",
        "court_hall",
        "item_number",
        "token_number",
        "provider_name",
        "last_synced_at",
        "is_mock",
    )
    list_filter = ("normalized_status", "court_hall", "provider_name", "is_mock")
    search_fields = ("case__case_number", "case__petitioner", "case__respondent", "token_number")
    readonly_fields = ("created_at", "updated_at")


@admin.register(CourtStatusObservation)
class CourtStatusObservationAdmin(admin.ModelAdmin):
    list_display = (
        "case",
        "normalized_status",
        "source_status",
        "observed_at",
        "court_hall",
        "item_number",
        "token_number",
        "is_meaningful_change",
        "is_alert_dispatched",
        "provider_name",
    )
    list_filter = (
        "normalized_status",
        "is_meaningful_change",
        "is_alert_dispatched",
        "provider_name",
    )
    search_fields = ("case__case_number", "token_number", "source_reference")
    readonly_fields = ("created_at",)
