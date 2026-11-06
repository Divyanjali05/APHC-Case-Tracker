from django.urls import path

from .views import (
    DeviceRegistrationView,
    NotificationHistoryListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationsStatusView,
    RealtimeEventsView,
    RealtimeStatusView,
    RealtimeStreamView,
    RealtimeTicketView,
)

app_name = "notifications"

urlpatterns = [
    path("status/", NotificationsStatusView.as_view(), name="status"),
    path("devices/", DeviceRegistrationView.as_view(), name="device_registration"),
    path("history/", NotificationHistoryListView.as_view(), name="notification_history"),
    path("<int:pk>/read/", NotificationMarkReadView.as_view(), name="notification_mark_read"),
    path(
        "mark-all-read/", NotificationMarkAllReadView.as_view(), name="notification_mark_all_read"
    ),
    path("realtime/ticket/", RealtimeTicketView.as_view(), name="realtime_ticket"),
    path("realtime/events/", RealtimeEventsView.as_view(), name="realtime_events"),
    path("realtime/stream/", RealtimeStreamView.as_view(), name="realtime_stream"),
    path("realtime/status/", RealtimeStatusView.as_view(), name="realtime_status"),
]
