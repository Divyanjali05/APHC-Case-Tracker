"""URL routing for Agenda, Personal Reminders, and Calendar Sync APIs."""

from __future__ import annotations

from django.urls import path

from apps.agenda.views import (
    CalendarIcsExportAPIView,
    CalendarSyncConnectAPIView,
    CalendarSyncDisconnectAPIView,
    CalendarSyncStatusAPIView,
    CalendarSyncTriggerAPIView,
    DailyAgendaAPIView,
    PersonalReminderDetailAPIView,
    PersonalReminderListCreateAPIView,
)

app_name = "agenda"

urlpatterns = [
    path("agenda/", DailyAgendaAPIView.as_view(), name="daily-agenda"),
    path("reminders/", PersonalReminderListCreateAPIView.as_view(), name="personal-reminders-list-create"),
    path("reminders/<int:pk>/", PersonalReminderDetailAPIView.as_view(), name="personal-reminder-detail"),
    path("export/ics/", CalendarIcsExportAPIView.as_view(), name="calendar-ics-export"),
    path("sync/status/", CalendarSyncStatusAPIView.as_view(), name="calendar-sync-status"),
    path("sync/connect/", CalendarSyncConnectAPIView.as_view(), name="calendar-sync-connect"),
    path("sync/trigger/", CalendarSyncTriggerAPIView.as_view(), name="calendar-sync-trigger"),
    path("sync/disconnect/", CalendarSyncDisconnectAPIView.as_view(), name="calendar-sync-disconnect"),
]

