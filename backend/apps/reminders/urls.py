from django.urls import path

from .views import ReminderDetailView, ReminderListCreateView, RemindersStatusView

app_name = "reminders"

urlpatterns = [
    path("status/", RemindersStatusView.as_view(), name="status"),
    path("", ReminderListCreateView.as_view(), name="reminder_list_create"),
    path("<int:pk>/", ReminderDetailView.as_view(), name="reminder_detail"),
]
