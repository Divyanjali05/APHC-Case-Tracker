"""API views for Voice Notes, Audio Streaming, and Speech-to-Text operations."""

from __future__ import annotations

import logging
import mimetypes
import os

from django.conf import settings
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.history_service import CaseHistoryService
from apps.cases.models import Case

from .models import TranscriptionLanguage, TranscriptionStatus, VoiceNote
from .providers import get_speech_to_text_provider
from .serializers import (
    VoiceNoteCreateSerializer,
    VoiceNoteSerializer,
    VoiceNoteUpdateSerializer,
)
from .services import VoiceTranscriptionService
from .tasks import transcribe_voice_note

logger = logging.getLogger(__name__)


class CaseVoiceNoteListCreateView(APIView):
    """List voice notes for a case or record/upload a new voice note."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_case(self, case_id: int) -> Case:
        return get_object_or_404(Case, id=case_id, tracked_by=self.request.user)

    def get(self, request, case_id: int):
        case = self.get_case(case_id)
        notes = VoiceNote.objects.filter(case=case, advocate=request.user)

        search = request.query_params.get("search", "").strip()
        if search:
            notes = notes.filter(
                Q(title__icontains=search)
                | Q(transcript__icontains=search)
                | Q(original_transcript__icontains=search)
            )

        language = request.query_params.get("language", "").strip()
        if language:
            notes = notes.filter(transcription_language=language)

        transcription_status = request.query_params.get("status", "").strip()
        if transcription_status:
            notes = notes.filter(transcription_status=transcription_status)

        notes = notes.order_by("-recorded_at", "-created_at")
        serializer = VoiceNoteSerializer(notes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, case_id: int):
        case = self.get_case(case_id)
        serializer = VoiceNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        audio_file = serializer.validated_data["audio_file"]
        title = serializer.validated_data.get("title", "")
        language = serializer.validated_data.get(
            "transcription_language", TranscriptionLanguage.ENGLISH
        )
        duration = serializer.validated_data.get("audio_duration_seconds", 0.0)
        recorded_at = serializer.validated_data.get("recorded_at") or timezone.now()
        auto_transcribe = serializer.validated_data.get("auto_transcribe", True)

        ext = os.path.splitext(getattr(audio_file, "name", ""))[1].lower()
        mime_type = mimetypes.types_map.get(ext, "audio/m4a")
        if ext == ".m4a":
            mime_type = "audio/m4a"

        voice_note = VoiceNote.objects.create(
            case=case,
            advocate=request.user,
            title=title,
            audio_file=audio_file,
            audio_duration_seconds=duration,
            audio_file_size_bytes=audio_file.size,
            audio_mime_type=mime_type,
            transcription_language=language,
            recorded_at=recorded_at,
        )

        CaseHistoryService.record_event(
            case=case,
            event_type="NOTE_ADDED",
            description="Voice note recorded.",
            changed_by=request.user,
            source="MANUAL",
        )

        if auto_transcribe:
            # Check if sync requested or testing
            is_sync = request.query_params.get("sync", "").lower() in ("true", "1")
            always_eager = getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False)

            if is_sync or always_eager:
                VoiceTranscriptionService.process_transcription(voice_note.id)
                voice_note.refresh_from_db()
            else:
                try:
                    transcribe_voice_note.delay(voice_note.id)
                except Exception as exc:
                    logger.warning(
                        "Failed to queue transcription task asynchronously: %s; running inline", exc
                    )
                    VoiceTranscriptionService.process_transcription(voice_note.id)
                    voice_note.refresh_from_db()

        return Response(
            VoiceNoteSerializer(voice_note).data,
            status=status.HTTP_201_CREATED,
        )


class VoiceNoteDetailView(APIView):
    """Retrieve metadata, edit transcript/title, or delete a voice note."""

    permission_classes = [permissions.IsAuthenticated]

    def get_voice_note(self, pk: int) -> VoiceNote:
        return get_object_or_404(
            VoiceNote.objects.select_related("case", "advocate"),
            id=pk,
            advocate=self.request.user,
            case__tracked_by=self.request.user,
        )

    def get(self, request, pk: int):
        voice_note = self.get_voice_note(pk)
        return Response(VoiceNoteSerializer(voice_note).data, status=status.HTTP_200_OK)

    def patch(self, request, pk: int):
        voice_note = self.get_voice_note(pk)
        serializer = VoiceNoteUpdateSerializer(voice_note, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()

        CaseHistoryService.record_event(
            case=voice_note.case,
            event_type="NOTE_UPDATED",
            description="Voice note updated.",
            changed_by=request.user,
            source="MANUAL",
        )

        return Response(VoiceNoteSerializer(updated).data, status=status.HTTP_200_OK)

    def delete(self, request, pk: int):
        voice_note = self.get_voice_note(pk)
        case = voice_note.case
        voice_note.delete()

        CaseHistoryService.record_event(
            case=case,
            event_type="NOTE_DELETED",
            description="Voice note deleted.",
            changed_by=request.user,
            source="MANUAL",
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


class VoiceNoteTranscribeView(APIView):
    """Trigger or re-trigger speech-to-text transcription on an existing voice note."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        voice_note = get_object_or_404(
            VoiceNote,
            id=pk,
            advocate=request.user,
            case__tracked_by=request.user,
        )

        language = request.data.get("transcription_language")
        if language and language in TranscriptionLanguage.values:
            voice_note.transcription_language = language
            voice_note.save(update_fields=["transcription_language"])

        is_sync = request.query_params.get("sync", "").lower() in ("true", "1")
        always_eager = getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False)

        if is_sync or always_eager:
            voice_note = VoiceTranscriptionService.process_transcription(voice_note.id)
        else:
            voice_note.transcription_status = TranscriptionStatus.PROCESSING
            voice_note.transcription_error = ""
            voice_note.save(update_fields=["transcription_status", "transcription_error"])
            try:
                transcribe_voice_note.delay(voice_note.id)
            except Exception as exc:
                logger.warning("Failed to queue transcription task: %s; running inline", exc)
                voice_note = VoiceTranscriptionService.process_transcription(voice_note.id)

        return Response(VoiceNoteSerializer(voice_note).data, status=status.HTTP_200_OK)


class VoiceNoteAudioStreamView(APIView):
    """Authenticated endpoint for streaming/playing audio files with Range header support."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int):
        voice_note = get_object_or_404(
            VoiceNote.objects.select_related("case", "advocate"),
            id=pk,
            advocate=request.user,
            case__tracked_by=request.user,
        )

        if not voice_note.audio_file:
            raise Http404("Audio file does not exist for this voice note.")

        try:
            file_handle = voice_note.audio_file.open("rb")
        except (FileNotFoundError, OSError) as exc:
            raise Http404("Audio file is missing from storage.") from exc

        filename = os.path.basename(voice_note.audio_file.name)
        response = FileResponse(
            file_handle,
            content_type=voice_note.audio_mime_type or "audio/m4a",
            filename=filename,
        )
        response["Content-Length"] = voice_note.audio_file_size_bytes
        response["Accept-Ranges"] = "bytes"
        return response


class VoiceStatusView(APIView):
    """Check voice subsystem health and current STT provider."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        provider = get_speech_to_text_provider()
        return Response(
            {
                "status": "ready",
                "active_stt_provider": getattr(provider, "provider", provider.__class__.__name__),
                "is_mock": getattr(provider, "is_mock", True),
                "supported_languages": [
                    {"code": TranscriptionLanguage.ENGLISH, "name": "English"},
                    {"code": TranscriptionLanguage.TELUGU, "name": "Telugu (తెలుగు)"},
                    {"code": TranscriptionLanguage.HINDI, "name": "Hindi (हिन्दी)"},
                ],
                "max_upload_size_bytes": getattr(
                    settings, "MAX_VOICE_UPLOAD_SIZE_BYTES", 25 * 1024 * 1024
                ),
                "max_duration_seconds": getattr(settings, "MAX_VOICE_DURATION_SECONDS", 600),
            },
            status=status.HTTP_200_OK,
        )
