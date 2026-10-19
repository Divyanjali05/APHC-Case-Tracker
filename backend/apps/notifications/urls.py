from django.urls import path

from .views import DeviceRegistrationView, NotificationHistoryListView, NotificationsStatusView

app_name = "notifications"

urlpatterns = [
    path("status/", NotificationsStatusView.as_view(), name="status"),
    path("devices/", DeviceRegistrationView.as_view(), name="device_registration"),
    path("history/", NotificationHistoryListView.as_view(), name="notification_history"),
]
