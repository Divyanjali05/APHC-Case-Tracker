from rest_framework import serializers

from .models import Reminder


class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = [
            "id",
            "advocate",
            "case",
            "title",
            "description",
            "reminder_type",
            "due_date",
            "is_completed",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "advocate", "created_at", "updated_at"]
