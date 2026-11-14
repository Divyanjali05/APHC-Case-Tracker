"""URL configuration for court_data app."""

from __future__ import annotations

from django.urls import path

from .views import (
    CaseCourtListingListView,
    CaseCourtStatusHistoryView,
    CaseCourtStatusSyncView,
    CaseCourtStatusView,
    CourtStatusSyncStatusView,
)

app_name = "court_data"

urlpatterns = [
    path("sync-status/", CourtStatusSyncStatusView.as_view(), name="sync_status"),
    path("cases/<int:case_id>/status/", CaseCourtStatusView.as_view(), name="case_status"),
    path(
        "cases/<int:case_id>/history/",
        CaseCourtStatusHistoryView.as_view(),
        name="case_status_history",
    ),
    path(
        "cases/<int:case_id>/listings/",
        CaseCourtListingListView.as_view(),
        name="case_listings",
    ),
    path(
        "cases/<int:case_id>/sync/",
        CaseCourtStatusSyncView.as_view(),
        name="case_status_sync",
    ),
]
