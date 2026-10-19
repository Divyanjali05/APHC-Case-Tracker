from rest_framework import serializers

from .models import CourtHall, CourtTokenStatus, TokenAlertRule


class CourtTokenStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourtTokenStatus
        fields = ["current_item_number", "current_stage", "last_polled_at"]


class CourtHallSerializer(serializers.ModelSerializer):
    status = CourtTokenStatusSerializer(source="token_status", read_only=True)

    class Meta:
        model = CourtHall
        fields = [
            "id",
            "hall_number",
            "bench_name",
            "presiding_judges",
            "is_active",
            "status",
            "updated_at",
        ]


class TokenAlertRuleSerializer(serializers.ModelSerializer):
    distance = serializers.SerializerMethodField()

    class Meta:
        model = TokenAlertRule
        fields = [
            "id",
            "advocate",
            "case",
            "court_hall",
            "listed_item_number",
            "alert_threshold",
            "distance",
            "is_notified",
            "created_at",
        ]
        read_only_fields = ["id", "advocate", "is_notified", "created_at"]

    def get_distance(self, obj) -> int:
        return obj.calculate_distance()
