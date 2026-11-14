"""API Views for Daily Agenda, Personal Reminders, ICS Export, and Calendar Sync."""

from __future__ import annotations

import logging
from typing import Any

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.agenda.serializers import (
    AgendaQuerySerializer,
    CalendarSyncConnectSerializer,
    CalendarSyncSettingSerializer,
    PersonalReminderCreateSerializer,
    PersonalReminderUpdateSerializer,
)
from apps.agenda.services import AgendaService
from apps.agenda.sync_service import CalendarSyncService
from apps.reminders.models import Reminder

logger = logging.getLogger(__name__)


class DailyAgendaAPIView(APIView):
    """Retrieve consolidated daily, weekly, or monthly agenda for the advocate."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = AgendaQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        date_str = data["date"].isoformat() if data.get("date") else None
        start_date_str = data["start_date"].isoformat() if data.get("start_date") else None
        end_date_str = data["end_date"].isoformat() if data.get("end_date") else None
        view = data.get("view", "day")

        agenda = AgendaService.get_agenda(
            advocate=request.user,
            date_str=date_str,
            start_date_str=start_date_str,
            end_date_str=end_date_str,
            view=view,
        )
        return Response(agenda, status=status.HTTP_200_OK)


class PersonalReminderListCreateAPIView(APIView):
    """List or create personal advocate reminders and compliance deadlines."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        reminders = (
            Reminder.objects.filter(advocate=request.user)
            .exclude(status="CANCELLED")
            .select_related("case")
            .order_by("due_date")
        )

        results = []
        for r in reminders:
            due_ist = r.due_date.astimezone(AgendaService.get_ist_now().tzinfo)
            results.append(
                {
                    "id": r.id,
                    "title": r.title,
                    "description": r.description or "",
                    "due_date": due_ist.isoformat(),
                    "reminder_type": r.reminder_type,
                    "status": r.status,
                    "is_completed": r.is_completed,
                    "case_id": r.case_id,
                    "case_number": (
                        f"{r.case.case_type} {r.case.case_number}/{r.case.filing_year}"
                        if r.case
                        else None
                    ),
                    "created_at": r.created_at.isoformat(),
                }
            )

        return Response({"count": len(results), "results": results}, status=status.HTTP_200_OK)

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = PersonalReminderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            reminder = AgendaService.create_personal_reminder(
                advocate=request.user,
                title=validated["title"],
                due_date=validated["due_date"],
                description=validated.get("description", ""),
                case_id=validated.get("case_id"),
                reminder_type=validated.get("reminder_type", "GENERAL"),
            )
        except ValueError as err:
            return Response({"detail": str(err)}, status=status.HTTP_400_BAD_REQUEST)

        due_ist = reminder.due_date.astimezone(AgendaService.get_ist_now().tzinfo)
        return Response(
            {
                "id": reminder.id,
                "title": reminder.title,
                "description": reminder.description,
                "due_date": due_ist.isoformat(),
                "reminder_type": reminder.reminder_type,
                "status": reminder.status,
                "is_completed": reminder.is_completed,
                "case_id": reminder.case_id,
                "created_at": reminder.created_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class PersonalReminderDetailAPIView(APIView):
    """Retrieve, update or delete a specific advocate reminder."""

    permission_classes = [permissions.IsAuthenticated]

    def _get_reminder(self, request: Request, pk: int) -> Reminder:
        try:
            return Reminder.objects.get(id=pk, advocate=request.user)
        except Reminder.DoesNotExist:
            raise

    def get(self, request: Request, pk: int, *args: Any, **kwargs: Any) -> Response:
        try:
            reminder = self._get_reminder(request, pk)
        except Reminder.DoesNotExist:
            return Response({"detail": "Reminder not found."}, status=status.HTTP_404_NOT_FOUND)

        due_ist = reminder.due_date.astimezone(AgendaService.get_ist_now().tzinfo)
        return Response(
            {
                "id": reminder.id,
                "title": reminder.title,
                "description": reminder.description,
                "due_date": due_ist.isoformat(),
                "reminder_type": reminder.reminder_type,
                "status": reminder.status,
                "is_completed": reminder.is_completed,
                "case_id": reminder.case_id,
                "case_number": (
                    f"{reminder.case.case_type} {reminder.case.case_number}/{reminder.case.filing_year}"
                    if reminder.case
                    else None
                ),
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request, pk: int, *args: Any, **kwargs: Any) -> Response:
        try:
            self._get_reminder(request, pk)
        except Reminder.DoesNotExist:
            return Response({"detail": "Reminder not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = PersonalReminderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        reminder = AgendaService.update_reminder(
            advocate=request.user,
            reminder_id=pk,
            title=validated.get("title"),
            description=validated.get("description"),
            due_date=validated.get("due_date"),
            is_completed=validated.get("is_completed"),
        )

        due_ist = reminder.due_date.astimezone(AgendaService.get_ist_now().tzinfo)
        return Response(
            {
                "id": reminder.id,
                "title": reminder.title,
                "description": reminder.description,
                "due_date": due_ist.isoformat(),
                "reminder_type": reminder.reminder_type,
                "status": reminder.status,
                "is_completed": reminder.is_completed,
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request: Request, pk: int, *args: Any, **kwargs: Any) -> Response:
        try:
            self._get_reminder(request, pk)
        except Reminder.DoesNotExist:
            return Response({"detail": "Reminder not found."}, status=status.HTTP_404_NOT_FOUND)

        AgendaService.delete_reminder(advocate=request.user, reminder_id=pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CalendarIcsExportAPIView(APIView):
    """Stream RFC 5545 compliant iCalendar file for the advocate."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> HttpResponse:
        today = AgendaService.get_ist_today()
        ics_content = CalendarSyncService.generate_ics_calendar(advocate=request.user)

        filename = f"aphc_agenda_{today.isoformat()}.ics"
        response = HttpResponse(ics_content, content_type="text/calendar; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class CalendarSyncStatusAPIView(APIView):
    """Retrieve external calendar sync preferences and latest status."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        setting = CalendarSyncService.get_or_create_settings(request.user)
        serializer = CalendarSyncSettingSerializer(setting)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CalendarSyncConnectAPIView(APIView):
    """Connect or update external calendar sync preferences."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        serializer = CalendarSyncConnectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        setting = CalendarSyncService.get_or_create_settings(request.user)
        setting.provider = data["provider"]
        setting.sync_enabled = data.get("sync_enabled", True)
        if data.get("google_account_email"):
            setting.google_account_email = data["google_account_email"]
        if data.get("google_access_token"):
            setting.google_access_token = data["google_access_token"]
        if data.get("google_refresh_token"):
            setting.google_refresh_token = data["google_refresh_token"]

        if "sync_hearing_reminders" in data:
            setting.sync_hearing_reminders = data["sync_hearing_reminders"]
        if "sync_compliance_deadlines" in data:
            setting.sync_compliance_deadlines = data["sync_compliance_deadlines"]
        if "sync_personal_reminders" in data:
            setting.sync_personal_reminders = data["sync_personal_reminders"]

        setting.save()
        return Response(CalendarSyncSettingSerializer(setting).data, status=status.HTTP_200_OK)


class CalendarSyncTriggerAPIView(APIView):
    """Trigger an immediate calendar synchronization cycle."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        result = CalendarSyncService.sync_external_calendar(request.user)
        http_status = (
            status.HTTP_200_OK
            if result.get("status") in ("SUCCESS", "SKIPPED")
            else status.HTTP_400_BAD_REQUEST
        )
        return Response(result, status=http_status)


class CalendarSyncDisconnectAPIView(APIView):
    """Disconnect external calendar and remove event mappings."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        setting = CalendarSyncService.disconnect_calendar(request.user)
        return Response(
            {
                "status": "DISCONNECTED",
                "message": "Calendar synchronization disconnected successfully.",
                "settings": CalendarSyncSettingSerializer(setting).data,
            },
            status=status.HTTP_200_OK,
        )
