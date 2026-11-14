from __future__ import annotations

import datetime

from rest_framework import serializers

from apps.cases.models import Case

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


class CaseSummarySerializer(serializers.ModelSerializer):
    formatted_case_number = serializers.CharField(read_only=True)

    class Meta:
        model = Case
        fields = [
            "id",
            "case_type",
            "case_number",
            "filing_year",
            "petitioner",
            "respondent",
            "formatted_case_number",
        ]


class TokenAlertRuleSerializer(serializers.ModelSerializer):
    distance = serializers.SerializerMethodField()
    case_details = CaseSummarySerializer(source="case", read_only=True)
    court_hall_details = serializers.SerializerMethodField()

    class Meta:
        model = TokenAlertRule
        fields = [
            "id",
            "advocate",
            "case",
            "case_details",
            "court_hall",
            "court_hall_details",
            "court_name",
            "hearing_date",
            "token_number",
            "listed_item_number",
            "bench_name",
            "alert_threshold",
            "alert_on_approach",
            "alert_on_called",
            "status",
            "current_called_token",
            "items_remaining",
            "distance",
            "is_active",
            "is_stale",
            "last_synced_at",
            "sync_source",
            "is_mock",
            "approaching_alert_sent",
            "called_alert_sent",
            "is_notified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "advocate",
            "status",
            "current_called_token",
            "items_remaining",
            "distance",
            "is_stale",
            "last_synced_at",
            "sync_source",
            "is_mock",
            "approaching_alert_sent",
            "called_alert_sent",
            "is_notified",
            "created_at",
            "updated_at",
        ]

    def get_distance(self, obj) -> int:
        return obj.calculate_distance()

    def get_court_hall_details(self, obj) -> dict:
        if obj.court_hall:
            return {
                "id": obj.court_hall.id,
                "hall_number": obj.court_hall.hall_number,
                "bench_name": obj.court_hall.bench_name,
            }
        return {}


class TokenAlertRuleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TokenAlertRule
        fields = [
            "id",
            "case",
            "court_hall",
            "court_name",
            "hearing_date",
            "token_number",
            "listed_item_number",
            "bench_name",
            "alert_threshold",
            "alert_on_approach",
            "alert_on_called",
        ]
        read_only_fields = ["id"]

    def validate_alert_threshold(self, value: int) -> int:
        if value < 1 or value > 20:
            raise serializers.ValidationError("Alert threshold must be between 1 and 20.")
        return value

    def validate_hearing_date(self, value: datetime.date) -> datetime.date:
        today = datetime.date.today()
        if value < today:
            raise serializers.ValidationError("Hearing date cannot be in the past.")
        return value

    def validate_token_number(self, value: str) -> str:
        val = value.strip()
        if not val:
            raise serializers.ValidationError("Token number cannot be blank.")
        return val

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        case = attrs.get("case")

        if user and case and not case.tracked_by.filter(id=user.id).exists():
            raise serializers.ValidationError(
                {"case": "You can only register alerts for cases you are tracking."}
            )

        court_hall = attrs.get("court_hall")
        token_number = attrs.get("token_number", "").strip()
        hearing_date = attrs.get("hearing_date")

        if user and court_hall and token_number and hearing_date:
            exists = TokenAlertRule.objects.filter(
                advocate=user,
                court_hall=court_hall,
                token_number=token_number,
                hearing_date=hearing_date,
                is_active=True,
            ).exists()
            if exists:
                raise serializers.ValidationError(
                    {
                        "non_field_errors": [
                            "An active alert for this token and court hall on this hearing date already exists."
                        ]
                    }
                )

        # Populate bench_name from court_hall if not provided
        if court_hall and not attrs.get("bench_name"):
            attrs["bench_name"] = court_hall.bench_name

        return attrs


class TokenAlertRuleUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TokenAlertRule
        fields = [
            "alert_threshold",
            "alert_on_approach",
            "alert_on_called",
            "is_active",
        ]

    def validate_alert_threshold(self, value: int) -> int:
        if value < 1 or value > 20:
            raise serializers.ValidationError("Alert threshold must be between 1 and 20.")
        return value
