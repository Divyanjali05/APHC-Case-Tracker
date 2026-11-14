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
            "device_id",
            "app_version",
            "is_active",
            "failure_count",
            "last_seen_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "failure_count", "last_seen_at", "created_at", "updated_at"]
        extra_kwargs = {
            "expo_push_token": {"validators": []},
        }

    def validate_expo_push_token(self, value: str) -> str:
        clean_token = value.strip() if isinstance(value, str) else ""
        if not is_valid_expo_token(clean_token):
            raise serializers.ValidationError(
                "Invalid Expo push token format. Expected ExponentPushToken[...] or valid UUID/hex."
            )
        return clean_token


class DeviceDeactivationSerializer(serializers.Serializer):
    expo_push_token = serializers.CharField(required=False, allow_blank=True)
    device_id = serializers.CharField(required=False, allow_blank=True)
    all = serializers.BooleanField(default=False)


class NotificationHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationHistory
        fields = [
            "id",
            "title",
            "body",
            "category",
            "data_payload",
            "delivery_status",
            "idempotency_key",
            "is_read",
            "sent_at",
        ]
        read_only_fields = ["id", "delivery_status", "sent_at"]


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
