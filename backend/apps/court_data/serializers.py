"""Serializers for CourtListing, CourtStatusObservation, and synchronization status."""

from __future__ import annotations

from rest_framework import serializers

from .models import CourtListing, CourtStatusObservation
from .status_mapping import get_status_display_label


class CourtListingSerializer(serializers.ModelSerializer):
    """Serializer representing current court listing and token allocation for a case."""

    normalized_status_display = serializers.SerializerMethodField()

    class Meta:
        model = CourtListing
        fields = [
            "id",
            "case",
            "court_name",
            "bench",
            "court_hall",
            "listing_date",
            "session",
            "item_number",
            "token_number",
            "source_status",
            "normalized_status",
            "normalized_status_display",
            "provider_name",
            "last_synced_at",
            "is_mock",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_normalized_status_display(self, obj: CourtListing) -> str:
        return get_status_display_label(obj.normalized_status)


class CourtStatusObservationSerializer(serializers.ModelSerializer):
    """Serializer representing historical court status observations and transitions."""

    normalized_status_display = serializers.SerializerMethodField()

    class Meta:
        model = CourtStatusObservation
        fields = [
            "id",
            "case",
            "court_listing",
            "source_status",
            "normalized_status",
            "normalized_status_display",
            "provider_name",
            "observed_at",
            "source_reference",
            "court_hall",
            "item_number",
            "token_number",
            "safe_metadata",
            "is_meaningful_change",
            "is_alert_dispatched",
            "created_at",
        ]
        read_only_fields = fields

    def get_normalized_status_display(self, obj: CourtStatusObservation) -> str:
        return get_status_display_label(obj.normalized_status)


class CourtStatusSyncResponseSerializer(serializers.Serializer):
    """Response returned upon manual or scheduled case status synchronization."""

    case_id = serializers.IntegerField()
    status = serializers.CharField()
    is_meaningful_change = serializers.BooleanField()
    listing = CourtListingSerializer(allow_null=True)
    observation = CourtStatusObservationSerializer(allow_null=True)
    synced_at = serializers.DateTimeField()


class SyncHealthStatusSerializer(serializers.Serializer):
    """Synchronization service health and provider availability."""

    status = serializers.CharField()
    provider = serializers.CharField()
    is_live = serializers.BooleanField()
    latency_ms = serializers.FloatField(required=False)
    configured = serializers.BooleanField(required=False)
    notice = serializers.CharField()
    total_active_listings = serializers.IntegerField()
    last_sync_timestamp = serializers.DateTimeField(allow_null=True)
