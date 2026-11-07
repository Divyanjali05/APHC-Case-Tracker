from __future__ import annotations

import mimetypes
import os
import uuid
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.utils.text import get_valid_filename


class SecureDocumentStorage(FileSystemStorage):
    """File storage rooted outside public static/media directories.

    Prevents direct web server traversal and public file URL leakage.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("location", getattr(settings, "SECURE_DOCUMENT_ROOT", None))
        super().__init__(*args, **kwargs)

    def url(self, name: str) -> str:
        # Prevent generating public URLs for protected case files
        raise NotImplementedError(
            "Direct public URLs are prohibited for secure case documents. "
            "Use authorized download endpoints."
        )


secure_document_storage = SecureDocumentStorage()


def case_document_upload_path(instance: Any, filename: str) -> str:
    """Generate safe, path-traversal-resistant upload path for case documents."""
    basename = os.path.basename(filename)
    clean_name = get_valid_filename(basename)
    name_root, ext = os.path.splitext(clean_name)
    ext_clean = ext.lower().lstrip(".")
    if not ext_clean:
        ext_clean = "bin"

    # Store with random UUID prefix to prevent filename enumeration
    safe_name = f"{uuid.uuid4().hex}_{clean_name}"
    case_id = getattr(instance, "case_id", None) or "general"
    return os.path.join(f"case_{case_id}", safe_name)


# Signatures for content inspection (magic bytes)
MAGIC_SIGNATURES: dict[str, list[bytes]] = {
    "pdf": [b"%PDF-"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "docx": [b"PK\x03\x04"],  # ZIP container header for DOCX
}

EXECUTABLE_SIGNATURES = [
    b"MZ",  # Windows PE/EXE/DLL
    b"\x7fELF",  # Linux ELF
    b"#!/bin",  # Shell script
    b"#!/usr",  # Shell script
]


def validate_case_document_upload(uploaded_file: Any) -> str:
    """Validate file size, extension, and content magic bytes.

    Returns the canonical MIME type string.
    Raises ValidationError if invalid.
    """
    max_size = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10 * 1024 * 1024)
    if uploaded_file.size > max_size:
        max_mb = max_size / (1024 * 1024)
        raise ValidationError(f"File size exceeds maximum allowed limit of {max_mb:.0f} MB.")

    # Validate file extension
    orig_name = os.path.basename(uploaded_file.name or "")
    _, ext = os.path.splitext(orig_name)
    ext_clean = ext.lower().lstrip(".")
    allowed_exts = getattr(
        settings, "ALLOWED_DOCUMENT_EXTENSIONS", {"pdf", "docx", "jpg", "jpeg", "png"}
    )

    if ext_clean not in allowed_exts:
        raise ValidationError(
            f"Unsupported file format '{ext_clean}'. Supported formats: {', '.join(sorted(allowed_exts))}."
        )

    # Inspect first 2048 bytes of content
    uploaded_file.seek(0)
    header = uploaded_file.read(2048)
    uploaded_file.seek(0)

    # Check for executable code signatures
    for sig in EXECUTABLE_SIGNATURES:
        if header.startswith(sig):
            raise ValidationError("Executable or script files are strictly prohibited.")

    # Match magic bytes
    expected_signatures = MAGIC_SIGNATURES.get(ext_clean)
    if expected_signatures:
        matched = any(header.startswith(sig) for sig in expected_signatures)
        if not matched:
            raise ValidationError(
                f"File content does not match the claimed file extension (.{ext_clean})."
            )

    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(orig_name)
    if not mime_type:
        if ext_clean == "pdf":
            mime_type = "application/pdf"
        elif ext_clean == "docx":
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext_clean in ("jpg", "jpeg"):
            mime_type = "image/jpeg"
        elif ext_clean == "png":
            mime_type = "image/png"
        else:
            mime_type = "application/octet-stream"

    return mime_type
