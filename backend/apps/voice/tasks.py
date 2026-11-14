"""Celery background tasks for voice processing and asynchronous STT."""

from __future__ import annotations

import logging
from typing import Any

from celery import shared_task

from .services import VoiceTranscriptionService

logger = logging.getLogger(__name__)


@shared_task(name="voice.transcribe_voice_note", bind=True, max_retries=3, default_retry_delay=10)
def transcribe_voice_note(self: Any, voice_note_id: int) -> dict[str, Any]:
    """Background worker task to transcribe an advocate voice recording.

    Prevents HTTP request blocking while audio transcription runs.
    """
    logger.info("Starting background transcription for VoiceNote ID=%s", voice_note_id)
    try:
        voice_note = VoiceTranscriptionService.process_transcription(voice_note_id)
        return {
            "voice_note_id": voice_note.id,
            "status": voice_note.transcription_status,
            "provider": voice_note.transcription_provider,
            "is_mock": voice_note.is_mock,
            "has_transcript": bool(voice_note.transcript),
        }
    except Exception as exc:
        logger.exception("Error during transcription of VoiceNote %s: %s", voice_note_id, exc)
        raise self.retry(exc=exc) from exc
