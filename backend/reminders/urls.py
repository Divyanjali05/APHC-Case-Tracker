from django.urls import path

from .views import RemindersStatusView

app_name = "reminders"

urlpatterns = [
    path("status/", RemindersStatusView.as_view(), name="status"),
]
