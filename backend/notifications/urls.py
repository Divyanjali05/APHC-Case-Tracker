from django.urls import path

from .views import NotificationsStatusView

app_name = "notifications"

urlpatterns = [
    path("status/", NotificationsStatusView.as_view(), name="status"),
]
