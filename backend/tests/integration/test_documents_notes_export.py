import os

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.cases.models import Case, CaseDocument, CaseHistory, CaseNote, Hearing, Judgment

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
        case_number="1001",
        filing_year=2026,
        petitioner="Ramesh Kumar",
        respondent="State of Andhra Pradesh",
        petitioner_advocate="Advocate A",
        current_stage="HEARING",
        court_hall_number=3,
        bench="Hon'ble Justice Rao",
    )
    case.tracked_by.add(advocate_a)
    return case


@pytest.fixture
def case_b(db, advocate_b):
    case = Case.objects.create(
        case_type="WA",
        case_number="2002",
        filing_year=2026,
        petitioner="Suresh Babu",
        respondent="Collector, Guntur",
        petitioner_advocate="Advocate B",
        current_stage="ADMISSION",
        court_hall_number=5,
        bench="Hon'ble Justice Reddy",
    )
    case.tracked_by.add(advocate_b)
    return case


# Helpers for creating test files with valid magic bytes
def create_valid_pdf_file(filename="test_petition.pdf", content=b"Minimal PDF content"):
    header = b"%PDF-1.4\n" + content
    return SimpleUploadedFile(filename, header, content_type="application/pdf")


def create_valid_png_file(filename="evidence.png"):
    header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    return SimpleUploadedFile(filename, header, content_type="image/png")


def create_valid_jpg_file(filename="photo.jpg"):
    header = b"\xff\xd8\xff\xe0" + b"\x00" * 20
    return SimpleUploadedFile(filename, header, content_type="image/jpeg")


def create_valid_docx_file(filename="submissions.docx"):
    header = b"PK\x03\x04" + b"\x00" * 20
    return SimpleUploadedFile(
        filename,
        header,
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@pytest.mark.django_db
class TestCaseDocumentManagement:
    """Integration test suite for secure case document management."""

    def test_anonymous_access_rejected(self, api_client, case_a):
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_upload_valid_pdf_document(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})

        pdf_file = create_valid_pdf_file("writ_petition.pdf", b"Original Writ Petition Content")
        data = {
            "title": "Writ Petition Affidavit",
            "document_type": "PETITION",
            "description": "Main writ petition filed in AP High Court",
            "file": pdf_file,
        }

        response = api_client.post(url, data, format="multipart")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Writ Petition Affidavit"
        assert response.data["document_type"] == "PETITION"
        assert response.data["document_type_display"] == "Petition"
        assert response.data["original_filename"] == "writ_petition.pdf"
        assert response.data["mime_type"] == "application/pdf"
        assert response.data["uploaded_by"] == advocate_a.id
        assert "download_url" in response.data

        # Verify DB entry
        doc = CaseDocument.objects.get(id=response.data["id"])
        assert doc.case == case_a
        assert doc.uploaded_by == advocate_a
        assert doc.file.size > 0

        # Verify case history audit log
        history = CaseHistory.objects.filter(case=case_a, event_type="DOCUMENT_UPDATED")
        assert history.exists()
        assert "Writ Petition Affidavit" in history.first().description

    def test_upload_valid_image_and_docx_formats(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})

        # PNG
        png_file = create_valid_png_file("court_notice.png")
        res_png = api_client.post(
            url,
            {"title": "Court Notice", "document_type": "COURT_ORDER", "file": png_file},
            format="multipart",
        )
        assert res_png.status_code == status.HTTP_201_CREATED
        assert res_png.data["mime_type"] == "image/png"

        # DOCX
        docx_file = create_valid_docx_file("written_arguments.docx")
        res_docx = api_client.post(
            url,
            {
                "title": "Written Arguments",
                "document_type": "WRITTEN_SUBMISSIONS",
                "file": docx_file,
            },
            format="multipart",
        )
        assert res_docx.status_code == status.HTTP_201_CREATED
        assert "officedocument" in res_docx.data["mime_type"]

    def test_upload_rejects_disallowed_extension(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})

        bad_file = SimpleUploadedFile(
            "malware.exe", b"MZ\x90\x00\x03\x00\x00\x00", content_type="application/octet-stream"
        )
        response = api_client.post(url, {"title": "Malware", "file": bad_file}, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "file" in str(response.data)

    def test_upload_rejects_executable_signature_disguised_as_pdf(
        self, api_client, advocate_a, case_a
    ):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})

        # Disguised executable header with .pdf extension
        fake_pdf = SimpleUploadedFile(
            "fake.pdf", b"MZ\x90\x00executable binary data", content_type="application/pdf"
        )
        response = api_client.post(
            url, {"title": "Spoofed PDF", "file": fake_pdf}, format="multipart"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Executable" in str(response.data)

    def test_upload_rejects_oversized_file(self, api_client, advocate_a, case_a, settings):
        settings.MAX_UPLOAD_SIZE_BYTES = 1024  # 1 KB limit for testing
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})

        large_file = SimpleUploadedFile(
            "large.pdf",
            b"%PDF-1.4\n" + b"X" * 2048,
            content_type="application/pdf",
        )
        response = api_client.post(
            url, {"title": "Large File", "file": large_file}, format="multipart"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceeds maximum allowed limit" in str(response.data)

    def test_list_and_filter_documents(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})

        # Create 2 documents of different types
        CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="Petition Copy",
            document_type="PETITION",
            original_filename="petition.pdf",
            file_size=1024,
            mime_type="application/pdf",
            file=create_valid_pdf_file(),
        )
        CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="Interim Order",
            document_type="COURT_ORDER",
            original_filename="order.pdf",
            file_size=2048,
            mime_type="application/pdf",
            file=create_valid_pdf_file(),
        )

        # List all
        res_all = api_client.get(url)
        assert res_all.status_code == status.HTTP_200_OK
        assert len(res_all.data) == 2

        # Filter by category
        res_filter = api_client.get(f"{url}?category=PETITION")
        assert res_filter.status_code == status.HTTP_200_OK
        assert len(res_filter.data) == 1
        assert res_filter.data[0]["title"] == "Petition Copy"

    def test_document_metadata_update(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        doc = CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="Draft Submission",
            document_type="OTHER",
            original_filename="draft.pdf",
            file_size=512,
            mime_type="application/pdf",
            file=create_valid_pdf_file(),
        )

        detail_url = reverse(
            "cases:case_document_detail",
            kwargs={"case_id": case_a.id, "pk": doc.id},
        )
        response = api_client.patch(
            detail_url,
            {"title": "Final Written Submission", "document_type": "WRITTEN_SUBMISSIONS"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Final Written Submission"
        assert response.data["document_type"] == "WRITTEN_SUBMISSIONS"

    def test_document_download(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        content = b"%PDF-1.4\nAuthentic Case Order Data"
        doc = CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="Court Order",
            document_type="COURT_ORDER",
            original_filename="court_order_2026.pdf",
            file_size=len(content),
            mime_type="application/pdf",
            file=SimpleUploadedFile(
                "court_order_2026.pdf", content, content_type="application/pdf"
            ),
        )

        download_url = reverse(
            "cases:case_document_download",
            kwargs={"case_id": case_a.id, "pk": doc.id},
        )
        response = api_client.get(download_url)
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"
        assert 'attachment; filename="court_order_2026.pdf"' in response["Content-Disposition"]

        # Consume streaming content
        downloaded_bytes = b"".join(response.streaming_content)
        assert downloaded_bytes == content

    def test_document_delete(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        doc = CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="To Be Deleted",
            document_type="OTHER",
            original_filename="delete_me.pdf",
            file_size=128,
            mime_type="application/pdf",
            file=create_valid_pdf_file(),
        )
        storage_path = doc.file.path if hasattr(doc.file, "path") else None

        detail_url = reverse(
            "cases:case_document_detail",
            kwargs={"case_id": case_a.id, "pk": doc.id},
        )
        response = api_client.delete(detail_url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not CaseDocument.objects.filter(id=doc.id).exists()

        # If on local filesystem, file must be removed
        if storage_path and os.path.exists(storage_path):
            assert not os.path.exists(storage_path)

    def test_cross_lawyer_document_isolation(self, api_client, advocate_a, advocate_b, case_a):
        """Advocate B must not be able to list, download, update, or delete Advocate A's documents."""
        doc = CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="Private Petition",
            document_type="PETITION",
            original_filename="private.pdf",
            file_size=512,
            mime_type="application/pdf",
            file=create_valid_pdf_file(),
        )

        api_client.force_authenticate(user=advocate_b)

        # Listing Advocate A's documents
        list_url = reverse("cases:case_document_list_create", kwargs={"case_id": case_a.id})
        res_list = api_client.get(list_url)
        assert res_list.status_code == status.HTTP_404_NOT_FOUND

        # Downloading Advocate A's document
        dl_url = reverse(
            "cases:case_document_download", kwargs={"case_id": case_a.id, "pk": doc.id}
        )
        res_dl = api_client.get(dl_url)
        assert res_dl.status_code == status.HTTP_404_NOT_FOUND

        # Deleting Advocate A's document
        del_url = reverse("cases:case_document_detail", kwargs={"case_id": case_a.id, "pk": doc.id})
        res_del = api_client.delete(del_url)
        assert res_del.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestCaseNotesManagement:
    """Integration test suite for private case preparation notes."""

    def test_anonymous_access_rejected(self, api_client, case_a):
        url = reverse("cases:case_note_list_create", kwargs={"case_id": case_a.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_case_note(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_note_list_create", kwargs={"case_id": case_a.id})

        data = {
            "title": "Cross Examination Points",
            "content": "Verify date of initial revenue notice against petitioner testimony.",
            "is_pinned": True,
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Cross Examination Points"
        assert response.data["is_pinned"] is True
        assert response.data["advocate"] == advocate_a.id

        # Verify DB
        note = CaseNote.objects.get(id=response.data["id"])
        assert note.advocate == advocate_a
        assert note.case == case_a

    def test_notes_ordering_pinned_first(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_note_list_create", kwargs={"case_id": case_a.id})

        note_unpinned = CaseNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Regular note",
            content="Some details",
            is_pinned=False,
        )
        note_pinned = CaseNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Important pinned note",
            content="Critical bench argument",
            is_pinned=True,
        )

        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        # Pinned must be first
        assert response.data[0]["id"] == note_pinned.id
        assert response.data[1]["id"] == note_unpinned.id

    def test_notes_search(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:case_note_list_create", kwargs={"case_id": case_a.id})

        CaseNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Revenue Board Precedent",
            content="Refer AIR 2021 SC 1045",
        )
        CaseNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Client Contact Memo",
            content="Meeting scheduled with instructing counsel",
        )

        # Search for precedent
        res_search = api_client.get(f"{url}?search=Precedent")
        assert res_search.status_code == status.HTTP_200_OK
        assert len(res_search.data) == 1
        assert res_search.data[0]["title"] == "Revenue Board Precedent"

    def test_note_update_and_delete(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        note = CaseNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Initial Title",
            content="Initial Content",
        )

        detail_url = reverse(
            "cases:case_note_detail",
            kwargs={"case_id": case_a.id, "pk": note.id},
        )

        # Update
        patch_res = api_client.patch(detail_url, {"title": "Updated Title", "is_pinned": True})
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.data["title"] == "Updated Title"
        assert patch_res.data["is_pinned"] is True

        # Delete
        del_res = api_client.delete(detail_url)
        assert del_res.status_code == status.HTTP_204_NO_CONTENT
        assert not CaseNote.objects.filter(id=note.id).exists()

    def test_notes_strict_multi_tenant_isolation(self, api_client, advocate_a, advocate_b, case_a):
        """Even if Advocate B tracks the same case, they cannot see or modify Advocate A's private notes."""
        case_a.tracked_by.add(advocate_b)  # Both track case_a

        note_a = CaseNote.objects.create(
            case=case_a,
            advocate=advocate_a,
            title="Advocate A Secret Strategy",
            content="Privileged strategy notes",
        )

        api_client.force_authenticate(user=advocate_b)
        url = reverse("cases:case_note_list_create", kwargs={"case_id": case_a.id})
        res_list = api_client.get(url)
        assert res_list.status_code == status.HTTP_200_OK
        # Advocate B should see 0 notes
        assert len(res_list.data) == 0

        # Advocate B cannot access note_a detail
        detail_url = reverse(
            "cases:case_note_detail", kwargs={"case_id": case_a.id, "pk": note_a.id}
        )
        res_detail = api_client.get(detail_url)
        assert res_detail.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestCaseSummaryPdfExport:
    """Integration test suite for PDF case summary export."""

    def test_pdf_export_requires_authentication(self, api_client, case_a):
        url = reverse("cases:export_case_pdf", kwargs={"case_id": case_a.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pdf_export_success(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)

        # Add a hearing, judgment, and document
        Hearing.objects.create(
            case=case_a,
            hearing_date="2026-11-10",
            court_hall_number=3,
            business_conducted="Interim order granted",
        )
        Judgment.objects.create(
            case=case_a,
            judgment_date="2026-11-12",
            judgment_type="FINAL",
            summary="Petition allowed with costs",
        )
        CaseDocument.objects.create(
            case=case_a,
            uploaded_by=advocate_a,
            title="Affidavit",
            document_type="PETITION",
            original_filename="affidavit.pdf",
            file_size=1024,
            mime_type="application/pdf",
            file=create_valid_pdf_file(),
        )

        url = reverse("cases:export_case_pdf", kwargs={"case_id": case_a.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "application/pdf"
        assert "attachment; filename=" in response["Content-Disposition"]

        # Validate PDF header (%PDF-)
        content = response.content
        assert content.startswith(b"%PDF-")
        assert len(content) > 1000

    def test_pdf_export_isolation(self, api_client, advocate_b, case_a):
        """Advocate B cannot export PDF for case_a which they do not track."""
        api_client.force_authenticate(user=advocate_b)
        url = reverse("cases:export_case_pdf", kwargs={"case_id": case_a.id})
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestCaseListCsvExport:
    """Integration test suite for CSV case export and formula injection mitigation."""

    def test_csv_export_requires_authentication(self, api_client):
        url = reverse("cases:export_cases_csv")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_csv_export_mitigates_formula_injection_and_isolates_user(
        self, api_client, advocate_a, advocate_b, case_a, case_b
    ):
        """Verify formula characters (=, +, -, @) are sanitized and only tracked cases are exported."""
        # Add a malicious formula injection string to case_a
        case_a.petitioner = "=cmd|' /C calc'!A0"
        case_a.respondent = "+SUM(1+1)*cmd"
        case_a.petitioner_advocate = "@special_advocate"
        case_a.save()

        api_client.force_authenticate(user=advocate_a)
        url = reverse("cases:export_cases_csv")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert "text/csv" in response["Content-Type"]
        assert "attachment; filename=" in response["Content-Disposition"]

        csv_text = response.content.decode("utf-8")
        lines = (
            csv_text.strip().split("\r\n") if "\r\n" in csv_text else csv_text.strip().split("\n")
        )

        # Header + 1 row for advocate_a (case_a), NOT case_b
        assert len(lines) >= 2
        header = lines[0]
        assert "Case Number" in header
        assert "Petitioner" in header

        # Verify formula neutralization: prepended with single quote '
        data_rows = "\n".join(lines[1:])
        assert "'=cmd|' /C calc'!A0" in data_rows
        assert "'+SUM(1+1)*cmd" in data_rows
        assert "'@special_advocate" in data_rows

        # Verify advocate_b's case is NOT present in advocate_a's export
        assert "Suresh Babu" not in data_rows
        assert "WA 2002/2026" not in data_rows
