"""Secure, private audio file storage for Voice Notes.

Enforces:
- Storage outside public static/media roots
- Elimination of direct URL leakage
- Path traversal prevention
- Filename randomization with UUIDs
- Audio content verification (magic byte inspection)
- Rejection of executable binaries and scripts
"""

from __future__ import annotations

import os
import uuid
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.utils.text import get_valid_filename


class SecureVoiceStorage(FileSystemStorage):
    """File storage rooted outside public web roots.

    Prevents direct web server access and public audio file leakage.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("location", getattr(settings, "SECURE_VOICE_ROOT", None))
        super().__init__(*args, **kwargs)

    def url(self, name: str) -> str:
        raise NotImplementedError(
            "Direct public URLs are prohibited for confidential voice notes. "
            "Use authenticated streaming/download endpoints."
        )


secure_voice_storage = SecureVoiceStorage()


def voice_note_upload_path(instance: Any, filename: str) -> str:
    """Generate safe, path-traversal-resistant upload path for voice notes."""
    basename = os.path.basename(filename)
    clean_name = get_valid_filename(basename)
    name_root, ext = os.path.splitext(clean_name)
    ext_clean = ext.lower().lstrip(".")
    if not ext_clean:
        ext_clean = "m4a"

    safe_name = f"{uuid.uuid4().hex}_{name_root}.{ext_clean}"
    case_id = getattr(instance, "case_id", None) or "general"
    return os.path.join(f"case_{case_id}", safe_name)


# Audio signatures for content inspection (magic bytes)
AUDIO_MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    "mp3": [b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"],
    "wav": [b"RIFF"],
    "ogg": [b"OggS"],
    "flac": [b"fLaC"],
    "m4a": [b"ftyp", b"\x00\x00\x00"],
    "aac": [b"\xff\xf1", b"\xff\xf9"],
    "webm": [b"\x1a\x45\xdf\xa3"],
}

EXECUTABLE_SIGNATURES = [
    b"MZ",  # Windows PE / EXE / DLL
    b"\x7fELF",  # Linux ELF
    b"<!DOCTYPE",  # HTML / Script injection
    b"<html",
    b"<?php",
    b"#!/bin/",
]


def validate_audio_file(uploaded_file: Any) -> None:
    """Inspect and validate an uploaded audio file for extension, size, and magic bytes."""
    name = getattr(uploaded_file, "name", "")
    size = getattr(uploaded_file, "size", 0)

    # 1. Size Check
    max_size = getattr(settings, "MAX_VOICE_UPLOAD_SIZE_BYTES", 25 * 1024 * 1024)
    if size > max_size:
        raise ValidationError(
            f"Audio file exceeds maximum allowable size of {max_size // (1024 * 1024)} MB."
        )
    if size == 0:
        raise ValidationError("Audio file is empty.")

    # 2. Extension Check
    ext = os.path.splitext(name)[1].lower().lstrip(".")
    allowed_exts = getattr(
        settings, "ALLOWED_VOICE_EXTENSIONS", {"m4a", "mp3", "wav", "aac", "ogg", "webm", "flac"}
    )
    if ext not in allowed_exts:
        raise ValidationError(
            f"Unsupported audio format '{ext}'. Allowed formats: {', '.join(sorted(allowed_exts))}."
        )

    # 3. Content Inspection (Magic Bytes)
    pos = uploaded_file.tell() if hasattr(uploaded_file, "tell") else 0
    header = uploaded_file.read(64)
    if hasattr(uploaded_file, "seek"):
        uploaded_file.seek(pos)

    # Check for executable signatures
    for bad_sig in EXECUTABLE_SIGNATURES:
        if header.startswith(bad_sig):
            raise ValidationError("File content appears to be executable or script binary.")

    # Check audio magic signature where known
    expected_sigs = AUDIO_MAGIC_SIGNATURES.get(ext)
    if expected_sigs:
        matched = False
        for sig in expected_sigs:
            if sig in header[:16] or header.startswith(sig):
                matched = True
                break
        if not matched and ext not in ("m4a", "aac"):
            raise ValidationError(
                f"File content does not match genuine {ext.upper()} audio signature."
            )

