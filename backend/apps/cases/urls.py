from django.urls import path

from apps.court_data.views import (
    CaseCourtListingListView,
    CaseCourtStatusHistoryView,
    CaseCourtStatusSyncView,
    CaseCourtStatusView,
)

from .views import (
    CaseDetailView,
    CaseDocumentDetailView,
    CaseDocumentDownloadView,
    CaseDocumentListCreateView,
    CaseHearingDetailView,
    CaseHearingListCreateView,
    CaseHistoryListView,
    CaseJudgmentListCreateView,
    CaseListCreateView,
    CaseListCsvExportView,
    CaseNoteDetailView,
    CaseNoteListCreateView,
    CasesStatusView,
    CaseSummaryPdfExportView,
    DashboardView,
    HearingRescheduleView,
    JudgmentDetailView,
    JudgmentDocumentView,
    UpcomingHearingsListView,
    VoiceQueryNormalizeView,
)

app_name = "cases"

urlpatterns = [
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("status/", CasesStatusView.as_view(), name="status"),
    path(
        "voice-search/normalize/", VoiceQueryNormalizeView.as_view(), name="voice_search_normalize"
    ),
    path("hearings/upcoming/", UpcomingHearingsListView.as_view(), name="upcoming_hearings_list"),
    path("export/csv/", CaseListCsvExportView.as_view(), name="export_cases_csv"),
    path("", CaseListCreateView.as_view(), name="case_list_create"),
    path("<int:pk>/", CaseDetailView.as_view(), name="case_detail"),
    path("<int:case_id>/export/pdf/", CaseSummaryPdfExportView.as_view(), name="export_case_pdf"),
    path(
        "<int:case_id>/documents/",
        CaseDocumentListCreateView.as_view(),
        name="case_document_list_create",
    ),
    path(
        "<int:case_id>/documents/<int:pk>/",
        CaseDocumentDetailView.as_view(),
        name="case_document_detail",
    ),
    path(
        "<int:case_id>/documents/<int:pk>/download/",
        CaseDocumentDownloadView.as_view(),
        name="case_document_download",
    ),
    path(
        "<int:case_id>/notes/",
        CaseNoteListCreateView.as_view(),
        name="case_note_list_create",
    ),
    path(
        "<int:case_id>/notes/<int:pk>/",
        CaseNoteDetailView.as_view(),
        name="case_note_detail",
    ),
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
