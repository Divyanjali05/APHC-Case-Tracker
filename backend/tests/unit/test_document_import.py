import io
import zipfile
from unittest.mock import MagicMock, patch

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cases.extractor import DocumentExtractionService
from apps.cases.storage import validate_case_document_upload
from apps.cases.views import CaseDocumentExtractView, CaseImportConfirmView


def test_validate_allowed_document_extensions():
    """Verify that supported legal document formats pass storage validation."""
    # PDF
    pdf_file = SimpleUploadedFile(
        "case_brief.pdf", b"%PDF-1.4 sample pdf content", content_type="application/pdf"
    )
    mime = validate_case_document_upload(pdf_file)
    assert mime == "application/pdf"

    # PNG
    img_buf = io.BytesIO()
    img = Image.new("RGB", (50, 50), color="red")
    img.save(img_buf, format="PNG")
    png_file = SimpleUploadedFile("court_order.png", img_buf.getvalue(), content_type="image/png")
    mime = validate_case_document_upload(png_file)
    assert mime == "image/png"

    # CSV
    csv_file = SimpleUploadedFile(
        "causelist.csv", b"Case Number,Year\n1234,2024", content_type="text/csv"
    )
    mime = validate_case_document_upload(csv_file)
    assert mime == "text/csv"

    # TXT
    txt_file = SimpleUploadedFile(
        "notes.txt", b"Hearing notes for bench", content_type="text/plain"
    )
    mime = validate_case_document_upload(txt_file)
    assert mime == "text/plain"


def test_reject_executable_and_unsupported_formats():
    """Verify that executable scripts and unsupported extensions are strictly rejected."""
    # Executable PE header
    exe_file = SimpleUploadedFile(
        "exploit.pdf", b"MZ\x90\x00\x03\x00", content_type="application/pdf"
    )
    with pytest.raises(ValidationError, match="Executable or script files are strictly prohibited"):
        validate_case_document_upload(exe_file)

    # Shell script
    sh_file = SimpleUploadedFile(
        "run.pdf", b"#!/bin/bash\necho hack", content_type="application/pdf"
    )
    with pytest.raises(ValidationError, match="Executable or script files are strictly prohibited"):
        validate_case_document_upload(sh_file)

    # Unsupported format
    bin_file = SimpleUploadedFile(
        "payload.bin", b"some binary data", content_type="application/octet-stream"
    )
    with pytest.raises(ValidationError, match="Unsupported file format 'bin'"):
        validate_case_document_upload(bin_file)


def test_extract_from_docx():
    """Verify text and legal field extraction from DOCX document."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        doc_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>HIGH COURT OF ANDHRA PRADESH AT AMARAVATI</w:t></w:r></w:p>
    <w:p><w:r><w:t>W.P. No. 4589 of 2024</w:t></w:r></w:p>
    <w:p><w:r><w:t>Between: K. Ramakrishna Rao ... Petitioner</w:t></w:r></w:p>
    <w:p><w:r><w:t>AND</w:t></w:r></w:p>
    <w:p><w:r><w:t>State of Andhra Pradesh rep. by Secretary ... Respondent</w:t></w:r></w:p>
    <w:p><w:r><w:t>Next Hearing Date: 25-11-2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>Court Hall No. 4</w:t></w:r></w:p>
  </w:body>
</w:document>"""
        zf.writestr("word/document.xml", doc_xml)

    buf.seek(0)
    docx_file = SimpleUploadedFile(
        "WritPetition_4589_2024.docx",
        buf.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    result = DocumentExtractionService.extract_from_file(docx_file)

    assert result["status"] == "SUCCESS"
    assert result["file_type"] == "DOCX"
    assert len(result["detected_cases"]) >= 1

    case = result["detected_cases"][0]
    assert case["case_type"] == "WP"
    assert case["case_number"] == "4589"
    assert case["filing_year"] == 2024
    assert "Ramakrishna" in case["petitioner"]
    assert "Andhra Pradesh" in case["respondent"]
    assert case["court_hall_number"] == 4
    assert case["next_hearing_date"] == "2026-11-25"
    assert case["status"] == "PENDING"


def test_extract_from_csv():
    """Verify tabular case parsing from CSV cause lists."""
    csv_content = (
        b"Case Type,Case Number,Filing Year,Petitioner,Respondent,Next Hearing,Court Hall,Status\n"
        b"WA,5678,2024,Venkata Ramana,AP Transco,2026-12-05,2,ADJOURNED\n"
        b"CRLP,9101,2023,G. Prasad,State of AP,2026-12-10,3,PENDING\n"
    )

    csv_file = SimpleUploadedFile("cause_list.csv", csv_content, content_type="text/csv")
    result = DocumentExtractionService.extract_from_file(csv_file)

    assert result["status"] == "SUCCESS"
    assert result["file_type"] == "CSV"
    assert len(result["detected_cases"]) == 2

    c1 = result["detected_cases"][0]
    assert c1["case_type"] == "WA"
    assert c1["case_number"] == "5678"
    assert c1["filing_year"] == 2024
    assert c1["petitioner"] == "Venkata Ramana"
    assert c1["next_hearing_date"] == "2026-12-05"
    assert c1["court_hall_number"] == 2
    assert c1["status"] == "ADJOURNED"

    c2 = result["detected_cases"][1]
    assert c2["case_type"] == "CRLP"
    assert c2["case_number"] == "9101"
    assert c2["filing_year"] == 2023
    assert c2["petitioner"] == "G. Prasad"
    assert c2["status"] == "PENDING"


@patch("apps.cases.extractor.Case.objects.filter")
def test_duplicate_detection(mock_filter):
    """Verify duplicate detection for new, existing in registry, and already tracked cases."""
    user = MagicMock()
    new_info = {"case_type": "WP", "case_number": "1001", "filing_year": 2024}

    # 1. New case (not found)
    mock_filter.return_value.first.return_value = None
    res_new = DocumentExtractionService.detect_duplicate(user, new_info)
    assert res_new["is_duplicate"] is False
    assert res_new["duplicate_status"] == "NEW"

    # 2. Existing case in registry (not yet tracked by user)
    existing_case = MagicMock(id=42, case_type="WP", case_number="1001", filing_year=2024)
    existing_case.tracked_by.all.return_value = []
    mock_filter.return_value.first.return_value = existing_case

    res_reg = DocumentExtractionService.detect_duplicate(user, new_info)
    assert res_reg["is_duplicate"] is True
    assert res_reg["duplicate_status"] == "EXISTS_IN_REGISTRY"
    assert res_reg["existing_case_id"] == 42

    # 3. Already tracked by user
    existing_case.tracked_by.all.return_value = [user]
    res_tracked = DocumentExtractionService.detect_duplicate(user, new_info)
    assert res_tracked["is_duplicate"] is True
    assert res_tracked["duplicate_status"] == "ALREADY_TRACKED"


@patch("apps.cases.views.secure_document_storage.save")
@patch("apps.cases.views.secure_document_storage.exists")
@patch("apps.cases.views.secure_document_storage.open")
@patch("apps.cases.views.Case.objects.create")
@patch("apps.cases.views.Case.objects.filter")
@patch("apps.cases.views.Hearing.objects.create")
@patch("apps.cases.views.CaseDocument")
@patch("apps.cases.views.CaseHistoryService.record_case_creation")
@patch("apps.cases.views.CaseSerializer")
def test_import_extract_and_confirm_api(
    mock_serializer,
    mock_record,
    mock_case_doc,
    mock_hearing_create,
    mock_case_filter,
    mock_case_create,
    mock_storage_open,
    mock_storage_exists,
    mock_storage_save,
):
    """Integration flow test: extract document then confirm and register case."""
    factory = APIRequestFactory()
    user = MagicMock(is_authenticated=True, username="advocate_user")
    user.get_full_name.return_value = "Test Advocate"

    mock_storage_save.return_value = "import_staging/test_token.csv"
    mock_storage_exists.return_value = True
    mock_storage_open.return_value.__enter__.return_value.read.return_value = b"sample content"

    # Step 1: Upload & Extract
    csv_bytes = b"Case Type,Case Number,Filing Year,Petitioner,Respondent,Next Hearing\nWP,3344,2024,Rajesh Kumar,AP Transco,2026-11-30"
    upload = SimpleUploadedFile("ap_hearing.csv", csv_bytes, content_type="text/csv")

    req_extract = factory.post("/api/v1/cases/import/extract/", {"file": upload})
    force_authenticate(req_extract, user=user)

    view_extract = CaseDocumentExtractView.as_view()
    resp_extract = view_extract(req_extract)

    assert resp_extract.status_code == 200
    extract_data = resp_extract.data
    assert extract_data["status"] == "SUCCESS"
    assert len(extract_data["detected_cases"]) == 1
    assert "document_token" in extract_data
    assert extract_data["detected_cases"][0]["case_number"] == "3344"

    # Step 2: Confirm & Save Case
    mock_case_filter.return_value.first.return_value = None  # New case
    created_case = MagicMock(id=99, case_type="WP", case_number="3344", filing_year=2024)
    mock_case_create.return_value = created_case
    mock_serializer.return_value.data = {
        "id": 99,
        "case_type": "WP",
        "case_number": "3344",
        "filing_year": 2024,
        "petitioner": "Rajesh Kumar (Edited)",
        "respondent": "AP Transco",
        "status": "PENDING",
    }

    confirm_payload = {
        "case_type": "WP",
        "case_number": "3344",
        "filing_year": 2024,
        "petitioner": "Rajesh Kumar (Edited)",
        "respondent": "AP Transco",
        "status": "PENDING",
        "next_hearing_date": "2026-11-30",
        "document_token": extract_data["document_token"],
        "document_title": "AP Hearing List Evidence",
    }

    req_confirm = factory.post("/api/v1/cases/import/confirm/", confirm_payload, format="json")
    force_authenticate(req_confirm, user=user)

    view_confirm = CaseImportConfirmView.as_view()
    resp_confirm = view_confirm(req_confirm)

    assert resp_confirm.status_code == 201
    assert resp_confirm.data["id"] == 99
    assert mock_case_create.called
    assert mock_hearing_create.called
    assert created_case.tracked_by.add.called
