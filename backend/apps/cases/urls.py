from django.urls import path

from apps.court_data.views import (
    CaseCourtListingListView,
    CaseCourtStatusHistoryView,
    CaseCourtStatusSyncView,
    CaseCourtStatusView,
)

from .views import (
    CaseDetailView,
    CaseHearingDetailView,
    CaseHearingListCreateView,
    CaseHistoryListView,
    CaseJudgmentListCreateView,
    CaseListCreateView,
    CasesStatusView,
    HearingRescheduleView,
    JudgmentDetailView,
    JudgmentDocumentView,
    UpcomingHearingsListView,
    VoiceQueryNormalizeView,
)

app_name = "cases"

urlpatterns = [
    path("status/", CasesStatusView.as_view(), name="status"),
    path(
        "voice-search/normalize/", VoiceQueryNormalizeView.as_view(), name="voice_search_normalize"
    ),
    path("hearings/upcoming/", UpcomingHearingsListView.as_view(), name="upcoming_hearings_list"),
    path("", CaseListCreateView.as_view(), name="case_list_create"),
    path("<int:pk>/", CaseDetailView.as_view(), name="case_detail"),
    path("<int:case_id>/history/", CaseHistoryListView.as_view(), name="case_history_list"),
    path(
        "<int:case_id>/hearings/",
        CaseHearingListCreateView.as_view(),
        name="case_hearing_list_create",
    ),
    path(
        "<int:case_id>/hearings/<int:pk>/",
        CaseHearingDetailView.as_view(),
        name="case_hearing_detail",
    ),
    path(
        "<int:case_id>/hearings/<int:pk>/reschedule/",
        HearingRescheduleView.as_view(),
        name="hearing_reschedule",
    ),
    path(
        "<int:case_id>/judgments/",
        CaseJudgmentListCreateView.as_view(),
        name="judgment_list_create",
    ),
    path("<int:case_id>/judgments/<int:pk>/", JudgmentDetailView.as_view(), name="judgment_detail"),
    path(
        "<int:case_id>/judgments/<int:pk>/document/",
        JudgmentDocumentView.as_view(),
        name="judgment_document",
    ),
    # Court Listing and Token Status Endpoints
    path(
        "<int:case_id>/court-status/",
        CaseCourtStatusView.as_view(),
        name="court_status",
    ),
    path(
        "<int:case_id>/court-status/history/",
        CaseCourtStatusHistoryView.as_view(),
        name="court_status_history",
    ),
    path(
        "<int:case_id>/court-listings/",
        CaseCourtListingListView.as_view(),
        name="court_listings",
    ),
    path(
        "<int:case_id>/court-status/sync/",
        CaseCourtStatusSyncView.as_view(),
        name="court_status_sync",
    ),
]
