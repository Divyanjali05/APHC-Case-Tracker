from django.urls import path

from .admin_views import (
    AdminAuditLogListView,
    AdminCaseAssignmentHistoryView,
    AdminCaseAssignView,
    AdminCaseListView,
    AdminDashboardView,
    AdminUserDetailView,
    AdminUserListCreateView,
)

app_name = "admin_api"

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="dashboard"),
    path("users/", AdminUserListCreateView.as_view(), name="user_list_create"),
    path("users/<int:pk>/", AdminUserDetailView.as_view(), name="user_detail"),
    path("cases/", AdminCaseListView.as_view(), name="case_list"),
    path("cases/<int:case_id>/assign/", AdminCaseAssignView.as_view(), name="case_assign"),
    path(
        "cases/<int:case_id>/assignments/",
        AdminCaseAssignmentHistoryView.as_view(),
        name="case_assignments",
    ),
    path("assignments/", AdminCaseAssignmentHistoryView.as_view(), name="assignment_history"),
    path("audit-logs/", AdminAuditLogListView.as_view(), name="audit_logs"),
]
