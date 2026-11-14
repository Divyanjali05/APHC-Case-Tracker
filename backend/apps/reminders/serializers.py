from rest_framework import serializers

from .models import Reminder, ReminderPreference


class ReminderSerializer(serializers.ModelSerializer):
    case_details = serializers.SerializerMethodField()

    class Meta:
        model = Reminder
        fields = [
            "id",
            "advocate",
            "case",
            "case_details",
            "hearing",
            "title",
            "description",
            "reminder_type",
            "reminder_interval_hours",
            "status",
            "due_date",
            "is_completed",
            "retry_count",
            "notification_sent_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "advocate",
            "retry_count",
            "notification_sent_at",
            "created_at",
            "updated_at",
        ]

    def validate_case(self, case):
        if case is None:
            return None
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            raise serializers.ValidationError("Authentication required to link a case.")
        if not (user.is_staff or user.is_superuser) and not case.tracked_by.filter(
            pk=user.pk
        ).exists():
            raise serializers.ValidationError(
                "You can only attach reminders to cases you track."
            )
        return case

    def get_case_details(self, obj) -> dict | None:
        if not obj.case:
            return None
        c = obj.case
        return {
            "id": c.id,
            "case_type": c.case_type,
            "case_number": c.case_number,
            "filing_year": c.filing_year,
            "petitioner": c.petitioner,
            "respondent": c.respondent,
            "formatted_case_number": f"{c.case_type} {c.case_number}/{c.filing_year}",
        }


class ReminderPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderPreference
        fields = [
            "id",
            "remind_24h_before",
            "remind_1h_before",
            "email_notifications",
            "push_notifications",
            "judgment_push_notifications",
            "hearing_change_push_notifications",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
