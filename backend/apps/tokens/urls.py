from django.urls import path

from .views import CourtHallListView, TokenAlertRuleListCreateView, TokensStatusView

app_name = "tokens"

urlpatterns = [
    path("status/", TokensStatusView.as_view(), name="status"),
    path("halls/", CourtHallListView.as_view(), name="court_halls"),
    path("alerts/", TokenAlertRuleListCreateView.as_view(), name="token_alerts"),
]
