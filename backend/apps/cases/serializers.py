from rest_framework import serializers

from .models import Case, CaseHistory, Hearing, Judgment
from .services import CaseStatusService


class HearingSerializer(serializers.ModelSerializer):
    case_details = serializers.SerializerMethodField()
    is_rescheduled = serializers.BooleanField(read_only=True)

    class Meta:
        model = Hearing
        fields = [
            "id",
            "case",
            "case_details",
            "hearing_date",
            "hearing_time",
            "status",
            "court_hall_number",
            "item_number",
            "business_conducted",
            "next_date",
            "previous_hearing_date",
            "previous_hearing_time",
            "rescheduled_reason",
            "is_rescheduled",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "case",
            "previous_hearing_date",
            "previous_hearing_time",
            "is_rescheduled",
            "created_at",
            "updated_at",
        ]

    def get_case_details(self, obj) -> dict:
        case = obj.case
        return {
            "id": case.id,
            "case_type": case.case_type,
            "case_number": case.case_number,
            "filing_year": case.filing_year,
            "petitioner": case.petitioner,
            "respondent": case.respondent,
            "formatted_case_number": f"{case.case_type} {case.case_number}/{case.filing_year}",
        }


class HearingRescheduleSerializer(serializers.Serializer):
    new_hearing_date = serializers.DateField(required=True)
    new_hearing_time = serializers.TimeField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    court_hall_number = serializers.IntegerField(required=False, allow_null=True)
    item_number = serializers.IntegerField(required=False, allow_null=True)

    def validate_new_hearing_date(self, value):
        from django.utils import timezone

        if value < timezone.now().date():
            raise serializers.ValidationError("New hearing date cannot be scheduled in the past.")
        return value


class JudgmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Judgment
        fields = [
            "id",
            "case",
            "judgment_date",
            "judgment_type",
            "order_number",
            "bench",
            "summary",
            "document_link",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "case", "created_at", "updated_at"]

    def validate_judgment_date(self, value):
        if not value:
            raise serializers.ValidationError("Judgment date is required.")
        return value


class CaseSerializer(serializers.ModelSerializer):
    hearings = HearingSerializer(many=True, read_only=True)
    judgments = JudgmentSerializer(many=True, read_only=True)
    latest_judgment = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    status_details = serializers.SerializerMethodField()
    effective_next_hearing_date = serializers.SerializerMethodField()
    judgment_date = serializers.SerializerMethodField()

    class Meta:
        model = Case
        fields = [
            "id",
            "case_type",
            "case_number",
            "filing_year",
            "petitioner",
            "respondent",
            "petitioner_advocate",
            "respondent_advocate",
            "current_stage",
            "status",
            "status_details",
            "bench",
            "court_hall_number",
            "next_hearing_date",
            "effective_next_hearing_date",
            "judgment_date",
            "latest_judgment",
            "judgments",
            "hearings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_status_details(self, obj):
        return CaseStatusService.calculate_status(obj)

    def get_status(self, obj):
        return CaseStatusService.calculate_status(obj)["status"]

    def get_effective_next_hearing_date(self, obj):
        return CaseStatusService.calculate_status(obj)["next_hearing_date"]

    def get_judgment_date(self, obj):
        return CaseStatusService.calculate_status(obj)["judgment_date"]

    def get_latest_judgment(self, obj):
        latest = CaseStatusService.get_latest_judgment(obj)
        if latest:
            return JudgmentSerializer(latest).data
        return None


class CaseHistorySerializer(serializers.ModelSerializer):
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = CaseHistory
        fields = [
            "id",
            "case",
            "event_type",
            "field_name",
            "old_value",
            "new_value",
            "description",
            "source",
            "changed_by",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_changed_by(self, obj):
        if obj.changed_by:
            full_name = obj.changed_by.get_full_name() or obj.changed_by.username
            return {
                "id": obj.changed_by.id,
                "username": obj.changed_by.username,
                "full_name": full_name,
            }
        return None
