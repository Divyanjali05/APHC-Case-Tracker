from django.urls import path

from .views import TokensStatusView

app_name = "tokens"

urlpatterns = [
    path("status/", TokensStatusView.as_view(), name="status"),
]
