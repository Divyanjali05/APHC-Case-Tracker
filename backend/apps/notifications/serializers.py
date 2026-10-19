from rest_framework import serializers

from .models import DeviceRegistration, NotificationHistory


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
