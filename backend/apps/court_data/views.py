"""API endpoints for Court Listing, Live Status Observations, and Synchronization."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Case

from .models import CourtListing, CourtStatusObservation
from .providers import get_court_data_provider
from .serializers import (
    CourtListingSerializer,
    CourtStatusObservationSerializer,
    SyncHealthStatusSerializer,
)
from .services import CourtStatusSyncService


class CaseCourtStatusView(APIView):
    """Retrieve the current court listing and token status for a tracked case."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id: int):
        case = get_object_or_404(Case, id=case_id, tracked_by=request.user)
        listing = CourtStatusSyncService.get_latest_listing_for_case(case)

        if not listing:
            return Response(
                {
                    "case_id": case.id,
                    "case_reference": f"{case.case_type} {case.case_number}/{case.filing_year}",
                    "normalized_status": "NOT_LISTED",
                    "normalized_status_display": "Not Listed",
                    "listing": None,
                    "has_active_listing": False,
                },
                status=status.HTTP_200_OK,
            )

        serializer = CourtListingSerializer(listing)
        return Response(
            {
                "case_id": case.id,
                "case_reference": f"{case.case_type} {case.case_number}/{case.filing_year}",
                "normalized_status": listing.normalized_status,
                "normalized_status_display": listing.get_normalized_status_display(),
                "listing": serializer.data,
                "has_active_listing": True,
            },
            status=status.HTTP_200_OK,
        )


class CaseCourtStatusHistoryView(generics.ListAPIView):
    """Chronological timeline of court status observations and transitions for a case."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CourtStatusObservationSerializer

    def get_queryset(self):
        case = get_object_or_404(Case, id=self.kwargs["case_id"], tracked_by=self.request.user)
        qs = CourtStatusObservation.objects.filter(case=case).order_by("-observed_at")

        # Optional filter for meaningful transitions only
        meaningful_param = self.request.query_params.get("meaningful_only", "").lower()
        if meaningful_param in ("1", "true", "yes"):
            qs = qs.filter(is_meaningful_change=True)

        return qs


class CaseCourtListingListView(generics.ListAPIView):
    """Retrieve historical court listings for a tracked case."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CourtListingSerializer

    def get_queryset(self):
        case = get_object_or_404(Case, id=self.kwargs["case_id"], tracked_by=self.request.user)
        return CourtListing.objects.filter(case=case).order_by("-listing_date", "-updated_at")


class CaseCourtStatusSyncView(APIView):
    """Manual sync request for an advocate's tracked case."""

    permission_classes = [permissions.IsAuthenticated]

    # Minimum cooldown seconds between manual sync requests per case to prevent server load
    MANUAL_SYNC_COOLDOWN_SECONDS = 5

    def post(self, request, case_id: int):
        case = get_object_or_404(Case, id=case_id, tracked_by=request.user)

        # Atomic rate limiting check per advocate + case
        cooldown = getattr(
            settings, "COURT_STATUS_MANUAL_SYNC_COOLDOWN", self.MANUAL_SYNC_COOLDOWN_SECONDS
        )
        cache_key = f"manual_sync_throttle:{request.user.id}:{case.id}"
        if not cache.add(cache_key, True, timeout=cooldown):
            raise Throttled(detail="Please wait before requesting another court status sync.")

        provider = get_court_data_provider()
        listing, observation, is_meaningful = CourtStatusSyncService.sync_case_status(
            case, provider=provider
        )

        response_data = {
            "case_id": case.id,
            "status": "success",
            "is_meaningful_change": is_meaningful,
            "listing": CourtListingSerializer(listing).data if listing else None,
            "observation": (
                CourtStatusObservationSerializer(observation).data if observation else None
            ),
            "synced_at": timezone.now().isoformat(),
        }

        return Response(response_data, status=status.HTTP_200_OK)


class CourtStatusSyncStatusView(APIView):
    """Overall status and health of the court data provider and synchronization engine."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        provider = get_court_data_provider()
        health_info = provider.check_health()

        user_listings = CourtListing.objects.filter(case__tracked_by=request.user)
        latest_listing = user_listings.order_by("-last_synced_at").first()
        total_listings = user_listings.count()

        payload = {
            "status": health_info.get("status", "unknown"),
            "provider": provider.provider_name,
            "is_live": provider.is_live_provider,
            "latency_ms": health_info.get("latency_ms", 0.0),
            "configured": health_info.get("configured", True),
            "notice": health_info.get("notice", ""),
            "total_active_listings": total_listings,
            "last_sync_timestamp": latest_listing.last_synced_at if latest_listing else None,
        }

        serializer = SyncHealthStatusSerializer(payload)
        return Response(serializer.data, status=status.HTTP_200_OK)
