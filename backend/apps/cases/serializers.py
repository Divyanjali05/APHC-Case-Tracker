from rest_framework import serializers

from .models import Case, Hearing


class HearingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hearing
        fields = [
            "id",
            "case",
            "hearing_date",
            "court_hall_number",
            "item_number",
            "business_conducted",
            "next_date",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class CaseSerializer(serializers.ModelSerializer):
    hearings = HearingSerializer(many=True, read_only=True)

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
            "bench",
            "court_hall_number",
            "next_hearing_date",
            "hearings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
