from django.urls import path

from .views import AccountsStatusView

app_name = "accounts"

urlpatterns = [
    path("status/", AccountsStatusView.as_view(), name="status"),
]
