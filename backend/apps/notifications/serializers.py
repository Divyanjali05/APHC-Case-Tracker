from rest_framework import serializers

from .models import DeviceRegistration, NotificationHistory, RealtimeEvent
from .services import is_valid_expo_token


class DeviceRegistrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceRegistration
        fields = [
            "id",
            "expo_push_token",
            "device_name",
            "platform",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_expo_push_token(self, value: str) -> str:
        clean_token = value.strip() if isinstance(value, str) else ""
        if not is_valid_expo_token(clean_token):
            raise serializers.ValidationError(
                "Invalid Expo push token format. Expected ExponentPushToken[...] or valid UUID/hex."
            )
        return clean_token


class NotificationHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationHistory
        fields = [
            "id",
            "title",
            "body",
            "category",
            "data_payload",
            "is_read",
            "sent_at",
        ]
        read_only_fields = ["id", "sent_at"]


class RealtimeEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeEvent
        fields = [
            "id",
            "event_uuid",
            "event_type",
            "payload",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "event_uuid",
            "event_type",
            "payload",
            "created_at",
        ]
