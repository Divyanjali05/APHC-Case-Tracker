"""Service layer for Voice Notes and Speech-to-Text processing."""

from __future__ import annotations

import logging
import os

from django.utils import timezone

from .models import TranscriptionStatus, VoiceNote
from .providers import get_speech_to_text_provider

logger = logging.getLogger(__name__)


class VoiceTranscriptionService:
    """Orchestrates audio transcription, handling provider invocation and state transitions."""

    @staticmethod
    def process_transcription(voice_note_id: int) -> VoiceNote:
        """Execute transcription for a voice note and update database record."""
        try:
            voice_note = VoiceNote.objects.select_related("case", "advocate").get(id=voice_note_id)
        except VoiceNote.DoesNotExist:
            logger.error("VoiceNote with id %s does not exist", voice_note_id)
            raise

        # Check audio file presence
        if not voice_note.audio_file or not voice_note.audio_file.name:
            voice_note.transcription_status = TranscriptionStatus.FAILED
            voice_note.transcription_error = "No audio file associated with this voice note."
            voice_note.save(update_fields=["transcription_status", "transcription_error", "updated_at"])
            return voice_note

        try:
            audio_path = voice_note.audio_file.path
            if not os.path.exists(audio_path):
                voice_note.transcription_status = TranscriptionStatus.FAILED
                voice_note.transcription_error = "Audio file not found on disk."
                voice_note.save(update_fields=["transcription_status", "transcription_error", "updated_at"])
                return voice_note
        except NotImplementedError:
            # For remote storages without direct .path
            audio_path = voice_note.audio_file.name

        # Mark in progress
        voice_note.transcription_status = TranscriptionStatus.PROCESSING
        voice_note.transcription_error = ""
        voice_note.save(update_fields=["transcription_status", "transcription_error", "updated_at"])

        try:
            provider = get_speech_to_text_provider()
            result = provider.transcribe(
                audio_file_path=audio_path,
                language=voice_note.transcription_language,
            )

            voice_note.original_transcript = result.transcript
            # Only populate editable transcript if it was previously empty
            if not voice_note.transcript.strip():
                voice_note.transcript = result.transcript

            voice_note.transcription_provider = result.provider
            voice_note.is_mock = result.is_mock
            voice_note.transcription_status = TranscriptionStatus.COMPLETED
            voice_note.transcribed_at = timezone.now()
            voice_note.transcription_error = ""
            voice_note.save(
                update_fields=[
                    "original_transcript",
                    "transcript",
                    "transcription_provider",
                    "is_mock",
                    "transcription_status",
                    "transcribed_at",
                    "transcription_error",
                    "updated_at",
                ]
            )
            logger.info("Successfully transcribed VoiceNote %s using %s", voice_note.id, result.provider)
            try:
                from apps.notifications.services import NotificationService

                case_ref = (
                    f"{voice_note.case.case_type} {voice_note.case.case_number}/{voice_note.case.filing_year}"
                    if voice_note.case
                    else "Court Matter"
                )
                NotificationService.send_push_notification(
                    user=voice_note.advocate,
                    title="Voice Note Transcribed",
                    body=f"Audio transcription completed for {case_ref}.",
                    category="VOICE_TRANSCRIPTION_COMPLETED",
                    data_payload={
                        "voice_note_id": voice_note.id,
                        "case_id": voice_note.case_id,
                    },
                    idempotency_key=f"voice-transcription-{voice_note.id}-completed",
                    is_sensitive=True,
                )
            except Exception as notif_exc:
                logger.debug("Failed to dispatch voice transcription notification: %s", notif_exc)

            return voice_note

        except Exception as exc:
            logger.exception("Failed to transcribe VoiceNote %s: %s", voice_note.id, exc)
            voice_note.transcription_status = TranscriptionStatus.FAILED
            voice_note.transcription_error = str(exc)
            voice_note.save(update_fields=["transcription_status", "transcription_error", "updated_at"])
            try:
                from apps.notifications.services import NotificationService

                case_ref = (
                    f"{voice_note.case.case_type} {voice_note.case.case_number}/{voice_note.case.filing_year}"
                    if voice_note.case
                    else "Court Matter"
                )
                NotificationService.send_push_notification(
                    user=voice_note.advocate,
                    title="Voice Transcription Failed",
                    body=f"Audio transcription failed for {case_ref}. Tap to retry.",
                    category="VOICE_TRANSCRIPTION_FAILED",
                    data_payload={
                        "voice_note_id": voice_note.id,
                        "case_id": voice_note.case_id,
                        "error": str(exc),
                    },
                    idempotency_key=f"voice-transcription-{voice_note.id}-failed",
                    is_sensitive=True,
                )
            except Exception as notif_exc:
                logger.debug("Failed to dispatch voice transcription failure notification: %s", notif_exc)

            return voice_note
