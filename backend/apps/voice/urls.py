"""URL routing for Voice Notes, Transcription and Audio Streaming."""

from django.urls import path

from .views import (
    CaseVoiceNoteListCreateView,
    VoiceNoteAudioStreamView,
    VoiceNoteDetailView,
    VoiceNoteTranscribeView,
    VoiceStatusView,
)

app_name = "voice"

urlpatterns = [
    path("", VoiceStatusView.as_view(), name="root"),
    path("status/", VoiceStatusView.as_view(), name="status"),
    path(
        "cases/<int:case_id>/notes/", CaseVoiceNoteListCreateView.as_view(), name="case-voice-notes"
    ),
    path("notes/<int:pk>/", VoiceNoteDetailView.as_view(), name="voice-note-detail"),
    path(
        "notes/<int:pk>/transcribe/",
        VoiceNoteTranscribeView.as_view(),
        name="voice-note-transcribe",
    ),
    path(
        "notes/<int:pk>/audio/", VoiceNoteAudioStreamView.as_view(), name="voice-note-audio-stream"
    ),
]
