import os

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Case, CaseDocument, CaseHistory, CaseNote, Hearing, Judgment
from .services import CaseStatusService
from .storage import validate_case_document_upload


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


class DashboardSummarySerializer(serializers.Serializer):
    total_cases = serializers.IntegerField()
    pending_cases = serializers.IntegerField()
    disposed_cases = serializers.IntegerField()
    adjourned_cases = serializers.IntegerField()


class DashboardHearingItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    case_id = serializers.IntegerField()
    case_number = serializers.CharField()
    petitioner = serializers.CharField()
    respondent = serializers.CharField()
    court_hall = serializers.IntegerField(allow_null=True)
    item_number = serializers.IntegerField(allow_null=True)
    judge = serializers.CharField(allow_blank=True)
    hearing_date = serializers.DateField()
    hearing_time = serializers.TimeField(allow_null=True)
    status = serializers.CharField()


class DashboardReminderItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    case_id = serializers.IntegerField(allow_null=True)
    case_number = serializers.CharField(allow_null=True, allow_blank=True)
    title = serializers.CharField()
    reminder_type = serializers.CharField()
    due_date = serializers.DateTimeField()
    status = serializers.CharField()


class DashboardNotificationItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    body = serializers.CharField()
    category = serializers.CharField()
    is_read = serializers.BooleanField()
    sent_at = serializers.DateTimeField()
    case_id = serializers.IntegerField(allow_null=True)


class DashboardSyncStatusSerializer(serializers.Serializer):
    last_synced_at = serializers.DateTimeField(allow_null=True)
    is_fresh = serializers.BooleanField()
    status = serializers.CharField()


class DashboardResponseSerializer(serializers.Serializer):
    summary = DashboardSummarySerializer()
    today_hearings = DashboardHearingItemSerializer(many=True)
    upcoming_hearings = DashboardHearingItemSerializer(many=True)
    upcoming_reminders = DashboardReminderItemSerializer(many=True)
    recent_notifications = DashboardNotificationItemSerializer(many=True)
    sync_status = DashboardSyncStatusSerializer()


class CaseDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    document_type_display = serializers.CharField(
        source="get_document_type_display", read_only=True
    )
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = CaseDocument
        fields = [
            "id",
            "case",
            "uploaded_by",
            "uploaded_by_name",
            "title",
            "document_type",
            "document_type_display",
            "description",
            "original_filename",
            "file_size",
            "mime_type",
            "download_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "case",
            "uploaded_by",
            "uploaded_by_name",
            "original_filename",
            "file_size",
            "mime_type",
            "download_url",
            "created_at",
            "updated_at",
        ]

    def get_uploaded_by_name(self, obj) -> str:
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return ""

    def get_download_url(self, obj) -> str:
        return f"/api/cases/{obj.case_id}/documents/{obj.id}/download/"


class CaseDocumentUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    document_type = serializers.ChoiceField(choices=CaseDocument.CATEGORY_CHOICES, default="OTHER")
    description = serializers.CharField(required=False, allow_blank=True, default="")
    file = serializers.FileField(required=True)

    def validate_file(self, value):
        try:
            mime_type = validate_case_document_upload(value)
            value.detected_mime_type = mime_type
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            raise serializers.ValidationError(msg) from exc
        return value

    def validate(self, attrs):
        uploaded_file = attrs.get("file")
        if not attrs.get("title") and uploaded_file:
            raw_name = os.path.basename(uploaded_file.name or "document")
            name_root, _ = os.path.splitext(raw_name)
            clean_title = name_root.replace("_", " ").replace("-", " ").strip().title()
            attrs["title"] = clean_title or "Untitled Document"
        return attrs


class CaseNoteSerializer(serializers.ModelSerializer):
    advocate_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseNote
        fields = [
            "id",
            "case",
            "advocate",
            "advocate_name",
            "title",
            "content",
            "is_pinned",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "case",
            "advocate",
            "advocate_name",
            "created_at",
            "updated_at",
        ]

    def get_advocate_name(self, obj) -> str:
        if obj.advocate:
            return obj.advocate.get_full_name() or obj.advocate.username
        return ""
