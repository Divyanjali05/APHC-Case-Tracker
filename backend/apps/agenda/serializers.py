"""Serializers for Calendar Agenda, Reminders, and Calendar Synchronization."""

from __future__ import annotations

from rest_framework import serializers

from apps.agenda.models import (
    CalendarSyncProvider,
    CalendarSyncSetting,
)
from apps.reminders.models import Reminder


class AgendaQuerySerializer(serializers.Serializer):
    """Validation for agenda retrieval query parameters."""

    date = serializers.DateField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    view = serializers.ChoiceField(
        choices=["day", "week", "month", "custom"],
        default="day",
        required=False,
    )


class PersonalReminderCreateSerializer(serializers.Serializer):
    """Create a new advocate personal reminder or compliance deadline."""

    title = serializers.CharField(max_length=255, required=True)
    due_date = serializers.DateTimeField(required=True)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    case_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    reminder_type = serializers.ChoiceField(
        choices=Reminder.TYPE_CHOICES,
        default="GENERAL",
        required=False,
    )


class PersonalReminderUpdateSerializer(serializers.Serializer):
    """Update an existing advocate reminder."""

    title = serializers.CharField(max_length=255, required=False)
    due_date = serializers.DateTimeField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    is_completed = serializers.BooleanField(required=False)


class CalendarSyncSettingSerializer(serializers.ModelSerializer):
    """Advocate external calendar synchronization status and configuration."""

    class Meta:
        model = CalendarSyncSetting
        fields = [
            "sync_enabled",
            "provider",
            "google_account_email",
            "sync_hearing_reminders",
            "sync_compliance_deadlines",
            "sync_personal_reminders",
            "sync_status",
            "last_synced_at",
            "sync_error",
            "updated_at",
        ]
        read_only_fields = [
            "sync_status",
            "last_synced_at",
            "sync_error",
            "updated_at",
        ]


class CalendarSyncConnectSerializer(serializers.Serializer):
    """Input payload to connect or update an external calendar provider."""

    provider = serializers.ChoiceField(choices=CalendarSyncProvider.choices)
    sync_enabled = serializers.BooleanField(default=True, required=False)
    google_access_token = serializers.CharField(required=False, allow_blank=True, default="")
    google_refresh_token = serializers.CharField(required=False, allow_blank=True, default="")
    google_account_email = serializers.EmailField(required=False, allow_blank=True, default="")
    sync_hearing_reminders = serializers.BooleanField(default=True, required=False)
    sync_compliance_deadlines = serializers.BooleanField(default=True, required=False)
    sync_personal_reminders = serializers.BooleanField(default=True, required=False)
