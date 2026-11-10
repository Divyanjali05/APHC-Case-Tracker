"""Integration and unit tests for Case Voice Notes, Speech-to-Text, and Audio Streaming."""

from __future__ import annotations

import os

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.cases.models import Case, CaseHistory
from apps.voice.models import (
    TranscriptionStatus,
    VoiceNote,
)
from apps.voice.providers import (
    MockSpeechToTextProvider,
    set_speech_to_text_provider_override,
)
from apps.voice.tasks import transcribe_voice_note

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def advocate_a(db):
    return User.objects.create_user(
        username="advocate_a",
        email="advocate_a@example.com",
        password="ValidPassword123!",
    )


@pytest.fixture
def advocate_b(db):
    return User.objects.create_user(
        username="advocate_b",
        email="advocate_b@example.com",
        password="ValidPassword123!",
    )


@pytest.fixture
def case_a(db, advocate_a):
    case = Case.objects.create(
        case_type="WP",
        case_number="4512",
        filing_year=2026,
        petitioner="A. P. Landholders Association",
        respondent="State of Andhra Pradesh & Others",
        petitioner_advocate="Advocate A",
        current_stage="ADMISSION",
        court_hall_number=2,
        bench="Court Hall 2 - Hon'ble Justice Krishna",
    )
    case.tracked_by.add(advocate_a)
    return case


@pytest.fixture
def case_b(db, advocate_b):
    case = Case.objects.create(
        case_type="CRL_P",
        case_number="8831",
        filing_year=2026,
        petitioner="K. Venkata Rao",
        respondent="Inspector of Police, CID AP",
        petitioner_advocate="Advocate B",
        current_stage="HEARING",
        court_hall_number=5,
        bench="Court Hall 5 - Criminal Division",
    )
    case.tracked_by.add(advocate_b)
    return case


def create_sample_audio_file(
    name: str = "dictation.m4a", content: bytes | None = None
) -> SimpleUploadedFile:
    """Generate valid sample audio file with genuine magic bytes."""
    if content is None:
        if name.endswith(".mp3"):
            content = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\x00" * 256
        elif name.endswith(".wav"):
            content = (
                b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00" + b"\x00" * 128
            )
        else:
            # m4a default
            content = b"\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00M4A mp42isom" + b"\x00" * 256

    return SimpleUploadedFile(name, content, content_type="audio/m4a")


@pytest.mark.django_db
class TestVoiceNotesAPI:
    """Test suite verifying Case Voice Notes API, STT, and Security controls."""

    def teardown_method(self):
        # Reset any test STT provider override
        set_speech_to_text_provider_override(None)

    def test_record_voice_note_success(self, api_client, advocate_a, case_a):
        """Advocate records voice note against tracked case (valid upload & DB persistence)."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("stay_arguments.m4a")

        url = f"/api/voice/cases/{case_a.id}/notes/?sync=true"
        data = {
            "title": "Interim Stay Preparation",
            "audio_file": audio,
            "transcription_language": "en",
            "audio_duration_seconds": 45.5,
        }

        response = api_client.post(url, data, format="multipart")
        assert response.status_code == status.HTTP_201_CREATED
        res_data = response.json()

        assert res_data["title"] == "Interim Stay Preparation"
        assert res_data["case"] == case_a.id
        assert res_data["advocate"] == advocate_a.id
        assert res_data["transcription_status"] == TranscriptionStatus.COMPLETED
        assert res_data["transcription_language"] == "en"
        assert res_data["is_mock"] is True
        assert "May it please your Lordship" in res_data["transcript"]
        assert res_data["original_transcript"] == res_data["transcript"]
        assert res_data["audio_duration_seconds"] == 45.5
        assert res_data["audio_stream_url"].endswith(f"/api/voice/notes/{res_data['id']}/audio/")

        # Verify DB record
        note = VoiceNote.objects.get(id=res_data["id"])
        assert note.audio_file is not None
        assert os.path.exists(note.audio_file.path)

        # Clean up
        note.delete()

    def test_record_voice_note_multilingual(self, api_client, advocate_a, case_a):
        """Advocate records voice notes in Telugu and Hindi."""
        api_client.force_authenticate(user=advocate_a)

        # 1. Telugu Recording
        audio_te = create_sample_audio_file("telugu_note.m4a")
        resp_te = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/?sync=true",
            {"title": "స్టే దరఖాస్తు నోట్స్", "audio_file": audio_te, "transcription_language": "te"},
            format="multipart",
        )
        assert resp_te.status_code == status.HTTP_201_CREATED
        data_te = resp_te.json()
        assert data_te["transcription_language"] == "te"
        assert "న్యాయమూర్తి" in data_te["transcript"]

        # 2. Hindi Recording
        audio_hi = create_sample_audio_file("hindi_note.m4a")
        resp_hi = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/?sync=true",
            {"title": "स्थगन आवेदन तर्क", "audio_file": audio_hi, "transcription_language": "hi"},
            format="multipart",
        )
        assert resp_hi.status_code == status.HTTP_201_CREATED
        data_hi = resp_hi.json()
        assert data_hi["transcription_language"] == "hi"
        assert "माननीय उच्च न्यायालय" in data_hi["transcript"]

        # Clean up
        VoiceNote.objects.filter(id__in=[data_te["id"], data_hi["id"]]).delete()

    def test_magic_byte_validation_rejection(self, api_client, advocate_a, case_a):
        """Rejects files disguised as audio (PE executable, scripts, HTML)."""
        api_client.force_authenticate(user=advocate_a)

        # 1. Disguised Windows PE/EXE
        fake_exe = create_sample_audio_file(
            "exploit.m4a", content=b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 100
        )
        resp1 = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/",
            {"title": "Attack", "audio_file": fake_exe},
            format="multipart",
        )
        assert resp1.status_code == status.HTTP_400_BAD_REQUEST

        # 2. Disguised HTML/PHP script
        fake_script = create_sample_audio_file(
            "script.m4a", content=b"<?php echo 'shell'; ?>" + b"\x00" * 100
        )
        resp2 = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/",
            {"title": "Script Attack", "audio_file": fake_script},
            format="multipart",
        )
        assert resp2.status_code == status.HTTP_400_BAD_REQUEST

    def test_exceeding_max_file_size_rejected(self, api_client, advocate_a, case_a):
        """Rejects audio exceeding 25MB max size."""
        api_client.force_authenticate(user=advocate_a)

        with override_settings(MAX_VOICE_UPLOAD_SIZE_BYTES=500):
            large_audio = create_sample_audio_file(
                "too_large.m4a",
                content=b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 1000,
            )
            response = api_client.post(
                f"/api/voice/cases/{case_a.id}/notes/",
                {"title": "Too Large", "audio_file": large_audio},
                format="multipart",
            )
            assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_audio_direct_url_prohibited(self, advocate_a, case_a):
        """Secure voice storage refuses public URL generation to prevent direct leakage."""
        audio = create_sample_audio_file("private.m4a")
        note = VoiceNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Confidential",
            audio_file=audio,
        )
        with pytest.raises(NotImplementedError):
            _ = note.audio_file.url

        note.delete()

    def test_authenticated_audio_stream_endpoint(self, api_client, advocate_a, case_a):
        """Owner can stream audio via authenticated endpoint with Range header support."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("stream_test.m4a")

        create_resp = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/",
            {"title": "Stream Test", "audio_file": audio},
            format="multipart",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        note_id = create_resp.json()["id"]

        # Stream audio
        stream_resp = api_client.get(f"/api/voice/notes/{note_id}/audio/")
        assert stream_resp.status_code == status.HTTP_200_OK
        assert "audio/" in stream_resp["Content-Type"]
        assert stream_resp["Accept-Ranges"] == "bytes"
        stream_resp.close()

        # Clean up
        VoiceNote.objects.get(id=note_id).delete()

    def test_unauthenticated_audio_stream_returns_401(self, api_client, advocate_a, case_a):
        """Unauthenticated request to stream audio returns 401 Unauthorized."""
        audio = create_sample_audio_file("auth_check.m4a")
        note = VoiceNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Auth Check",
            audio_file=audio,
        )

        response = api_client.get(f"/api/voice/notes/{note.id}/audio/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

        note.delete()

    def test_cross_advocate_isolation(self, api_client, advocate_a, advocate_b, case_a, case_b):
        """Advocate B cannot access, list, stream, edit, or delete Advocate A's voice notes."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("a_note.m4a")
        resp_a = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/?sync=true",
            {"title": "Advocate A Secret Note", "audio_file": audio},
            format="multipart",
        )
        note_a_id = resp_a.json()["id"]

        # Switch to Advocate B
        api_client.force_authenticate(user=advocate_b)

        # 1. Cannot list case A voice notes (Advocate B doesn't track case A)
        list_resp = api_client.get(f"/api/voice/cases/{case_a.id}/notes/")
        assert list_resp.status_code == status.HTTP_404_NOT_FOUND

        # 2. Cannot retrieve note A detail
        detail_resp = api_client.get(f"/api/voice/notes/{note_a_id}/")
        assert detail_resp.status_code == status.HTTP_404_NOT_FOUND

        # 3. Cannot stream note A audio
        stream_resp = api_client.get(f"/api/voice/notes/{note_a_id}/audio/")
        assert stream_resp.status_code == status.HTTP_404_NOT_FOUND

        # 4. Cannot edit note A
        patch_resp = api_client.patch(
            f"/api/voice/notes/{note_a_id}/",
            {"title": "Hacked Title"},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_404_NOT_FOUND

        # 5. Cannot delete note A
        del_resp = api_client.delete(f"/api/voice/notes/{note_a_id}/")
        assert del_resp.status_code == status.HTTP_404_NOT_FOUND

        # Clean up
        VoiceNote.objects.get(id=note_a_id).delete()

    def test_edit_transcript_preserves_original(self, api_client, advocate_a, case_a):
        """Advocate edits transcript: original_transcript remains intact; editable transcript updates."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("transcript_edit.m4a")

        create_resp = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/?sync=true",
            {"title": "Original Note", "audio_file": audio},
            format="multipart",
        )
        note_id = create_resp.json()["id"]
        original_stt = create_resp.json()["original_transcript"]

        # Advocate edits transcript
        edited_text = "Customized advocate argument: Cited AIR 2024 SC 1234 regarding jurisdiction."
        patch_resp = api_client.patch(
            f"/api/voice/notes/{note_id}/",
            {"transcript": edited_text, "title": "Updated Argument Note"},
            format="json",
        )
        assert patch_resp.status_code == status.HTTP_200_OK
        data = patch_resp.json()

        assert data["title"] == "Updated Argument Note"
        assert data["transcript"] == edited_text
        assert data["original_transcript"] == original_stt

        # Re-fetch from DB
        note = VoiceNote.objects.get(id=note_id)
        assert note.transcript == edited_text
        assert note.original_transcript == original_stt

        note.delete()

    def test_retry_transcription_endpoint(self, api_client, advocate_a, case_a):
        """Advocate can retry or re-trigger transcription with a different language."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("retry_test.m4a")

        create_resp = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/?sync=true",
            {"title": "Retry Note", "audio_file": audio, "transcription_language": "en"},
            format="multipart",
        )
        note_id = create_resp.json()["id"]

        # Retry in Telugu
        retry_resp = api_client.post(
            f"/api/voice/notes/{note_id}/transcribe/?sync=true",
            {"transcription_language": "te"},
            format="json",
        )
        assert retry_resp.status_code == status.HTTP_200_OK
        retry_data = retry_resp.json()
        assert retry_data["transcription_language"] == "te"
        assert "న్యాయమూర్తి" in retry_data["original_transcript"]

        VoiceNote.objects.get(id=note_id).delete()

    def test_transcription_failure_handling(self, api_client, advocate_a, case_a):
        """Gracefully handles STT provider failure and records error."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("fail_test.m4a")

        # Inject failing mock provider
        set_speech_to_text_provider_override(
            MockSpeechToTextProvider(
                should_fail=True, failure_reason="Temporary STT API quota exceeded"
            )
        )

        create_resp = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/?sync=true",
            {"title": "Failing Note", "audio_file": audio},
            format="multipart",
        )
        assert create_resp.status_code == status.HTTP_201_CREATED
        note_data = create_resp.json()

        assert note_data["transcription_status"] == TranscriptionStatus.FAILED
        assert "quota exceeded" in note_data["transcription_error"]

        VoiceNote.objects.get(id=note_data["id"]).delete()

    def test_delete_removes_physical_file(self, api_client, advocate_a, case_a):
        """Deleting a voice note removes database record and deletes physical audio file from disk."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("to_delete.m4a")

        create_resp = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/",
            {"title": "To Delete", "audio_file": audio},
            format="multipart",
        )
        note_id = create_resp.json()["id"]
        note = VoiceNote.objects.get(id=note_id)
        file_path = note.audio_file.path
        assert os.path.exists(file_path)

        del_resp = api_client.delete(f"/api/voice/notes/{note_id}/")
        assert del_resp.status_code == status.HTTP_204_NO_CONTENT
        assert not VoiceNote.objects.filter(id=note_id).exists()
        assert not os.path.exists(file_path)

    def test_case_history_audit_logging(self, api_client, advocate_a, case_a):
        """Case history audit records created for voice note recording, update, deletion."""
        api_client.force_authenticate(user=advocate_a)
        audio = create_sample_audio_file("audit_test.m4a")

        # 1. Create
        create_resp = api_client.post(
            f"/api/voice/cases/{case_a.id}/notes/",
            {"title": "Audit Log Note", "audio_file": audio},
            format="multipart",
        )
        note_id = create_resp.json()["id"]
        assert CaseHistory.objects.filter(case=case_a, event_type="NOTE_ADDED").exists()

        # 2. Update
        api_client.patch(
            f"/api/voice/notes/{note_id}/", {"title": "Updated Audit Note"}, format="json"
        )
        assert CaseHistory.objects.filter(case=case_a, event_type="NOTE_UPDATED").exists()

        # 3. Delete
        api_client.delete(f"/api/voice/notes/{note_id}/")
        assert CaseHistory.objects.filter(case=case_a, event_type="NOTE_DELETED").exists()

    def test_voice_status_endpoint(self, api_client, advocate_a):
        """Voice status endpoint reports active STT provider and supported languages."""
        api_client.force_authenticate(user=advocate_a)
        resp = api_client.get("/api/voice/status/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert data["status"] == "ready"
        assert data["is_mock"] is True
        assert len(data["supported_languages"]) == 3
        lang_codes = [lang["code"] for lang in data["supported_languages"]]
        assert "en" in lang_codes
        assert "te" in lang_codes
        assert "hi" in lang_codes

    def test_celery_transcribe_task_execution(self, advocate_a, case_a):
        """Celery background worker task executes successfully."""
        audio = create_sample_audio_file("celery_test.m4a")
        note = VoiceNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Celery Worker Note",
            audio_file=audio,
            transcription_language="en",
        )

        result = transcribe_voice_note(note.id)
        assert result["status"] == TranscriptionStatus.COMPLETED
        assert result["has_transcript"] is True

        note.refresh_from_db()
        assert note.transcription_status == TranscriptionStatus.COMPLETED
        assert "May it please your Lordship" in note.transcript

        note.delete()
