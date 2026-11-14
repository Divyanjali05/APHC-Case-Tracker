"""Serializers for Voice Notes and Speech-to-Text operations."""

from __future__ import annotations

import os
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import TranscriptionLanguage, VoiceNote
from .storage import validate_audio_file


class VoiceNoteSerializer(serializers.ModelSerializer):
    """Full detail serializer for Case Voice Note."""

    case_number = serializers.CharField(source="case.case_number", read_only=True)
    advocate_name = serializers.SerializerMethodField()
    audio_file_name = serializers.SerializerMethodField()
    transcription_status_display = serializers.CharField(
        source="get_transcription_status_display", read_only=True
    )
    transcription_language_display = serializers.CharField(
        source="get_transcription_language_display", read_only=True
    )
    audio_stream_url = serializers.SerializerMethodField()

    class Meta:
        model = VoiceNote
        fields = [
            "id",
            "case",
            "case_number",
            "advocate",
            "advocate_name",
            "title",
            "audio_file_name",
            "audio_duration_seconds",
            "audio_file_size_bytes",
            "audio_mime_type",
            "transcription_status",
            "transcription_status_display",
            "transcription_language",
            "transcription_language_display",
            "original_transcript",
            "transcript",
            "transcription_provider",
            "is_mock",
            "transcription_error",
            "transcribed_at",
            "recorded_at",
            "created_at",
            "updated_at",
            "audio_stream_url",
        ]
        read_only_fields = [
            "id",
            "case",
            "case_number",
            "advocate",
            "advocate_name",
            "audio_file_name",
            "audio_file_size_bytes",
            "audio_mime_type",
            "transcription_status",
            "transcription_status_display",
            "transcription_language_display",
            "original_transcript",
            "transcription_provider",
            "is_mock",
            "transcription_error",
            "transcribed_at",
            "created_at",
            "updated_at",
            "audio_stream_url",
        ]

    def get_advocate_name(self, obj: VoiceNote) -> str:
        if obj.advocate:
            return obj.advocate.get_full_name() or obj.advocate.username
        return ""

    def get_audio_file_name(self, obj: VoiceNote) -> str:
        if obj.audio_file and obj.audio_file.name:
            return os.path.basename(obj.audio_file.name)
        return ""

    def get_audio_stream_url(self, obj: VoiceNote) -> str:
        return f"/api/voice/notes/{obj.id}/audio/"


class VoiceNoteCreateSerializer(serializers.Serializer):
    """Multipart serializer for creating an advocate voice recording linked to a case."""

    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    audio_file = serializers.FileField(required=True)
    transcription_language = serializers.ChoiceField(
        choices=TranscriptionLanguage.choices,
        default=TranscriptionLanguage.ENGLISH,
    )
    audio_duration_seconds = serializers.FloatField(required=False, default=0.0)
    recorded_at = serializers.DateTimeField(required=False, allow_null=True)
    auto_transcribe = serializers.BooleanField(required=False, default=True)

    def validate_audio_file(self, value: Any) -> Any:
        try:
            validate_audio_file(value)
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            raise serializers.ValidationError(msg) from exc
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        audio_file = attrs.get("audio_file")
        if not attrs.get("title") and audio_file:
            raw_name = os.path.basename(getattr(audio_file, "name", "recording"))
            root, _ = os.path.splitext(raw_name)
            clean_title = root.replace("_", " ").replace("-", " ").strip().title()
            attrs["title"] = clean_title or "Voice Note"
        return attrs


class VoiceNoteUpdateSerializer(serializers.ModelSerializer):
    """Serializer for editing title, transcription text, or language."""

    class Meta:
        model = VoiceNote
        fields = ["title", "transcript", "transcription_language"]

    def validate_transcription_language(self, value: str) -> str:
        if value not in TranscriptionLanguage.values:
            raise serializers.ValidationError(f"Invalid language '{value}'.")
        return value
