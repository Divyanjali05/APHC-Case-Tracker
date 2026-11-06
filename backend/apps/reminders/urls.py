from django.urls import path

from .views import (
    ReminderDetailView,
    ReminderDismissView,
    ReminderListCreateView,
    ReminderPreferenceView,
    RemindersStatusView,
)

app_name = "reminders"

urlpatterns = [
    path("status/", RemindersStatusView.as_view(), name="status"),
    path("preferences/", ReminderPreferenceView.as_view(), name="reminder_preferences"),
    path("", ReminderListCreateView.as_view(), name="reminder_list_create"),
    path("<int:pk>/", ReminderDetailView.as_view(), name="reminder_detail"),
    path("<int:pk>/dismiss/", ReminderDismissView.as_view(), name="reminder_dismiss"),
]
