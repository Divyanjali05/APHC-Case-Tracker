from django.urls import path

from .views import (
    CourtHallListView,
    TokenAlertRuleCancelView,
    TokenAlertRuleDetailView,
    TokenAlertRuleListCreateView,
    TokenAlertRuleSyncView,
    TokensStatusView,
)

app_name = "tokens"

urlpatterns = [
    path("status/", TokensStatusView.as_view(), name="status"),
    path("halls/", CourtHallListView.as_view(), name="court_halls"),
    path("alerts/", TokenAlertRuleListCreateView.as_view(), name="token_alerts"),
    path("alerts/<int:pk>/", TokenAlertRuleDetailView.as_view(), name="token_alert_detail"),
    path("alerts/<int:pk>/cancel/", TokenAlertRuleCancelView.as_view(), name="token_alert_cancel"),
    path("alerts/<int:pk>/sync/", TokenAlertRuleSyncView.as_view(), name="token_alert_sync"),
]
