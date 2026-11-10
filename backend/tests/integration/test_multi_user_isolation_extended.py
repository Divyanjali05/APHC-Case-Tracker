import datetime

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, CaseDocument, CaseHistory, CaseNote, Hearing
from apps.court_data.models import CourtListing
from apps.tokens.models import CourtHall, TokenAlertRule
from apps.voice.models import VoiceNote

User = get_user_model()


@pytest.fixture
def advocate_a(db):
    user = User.objects.create_user(
        username="AP11112025",
        email="a@aphc.in",
        password="StrongPassword123!",
        first_name="Advocate",
        last_name="Alpha",
    )
    AdvocateProfile.objects.create(
        user=user, bar_council_enrollment_number="AP/1111/2025", is_verified=True
    )
    return user


@pytest.fixture
def advocate_b(db):
    user = User.objects.create_user(
        username="AP22222025",
        email="b@aphc.in",
        password="StrongPassword123!",
        first_name="Advocate",
        last_name="Beta",
    )
    AdvocateProfile.objects.create(
        user=user, bar_council_enrollment_number="AP/2222/2025", is_verified=True
    )
    return user


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username="isolation_admin",
        email="iso_admin@aphc.in",
        password="StrongPassword123!",
    )


@pytest.mark.django_db
class TestMultiUserIsolationHardening:
    """Verify strict multi-user isolation across Reminders, Voice, Tokens, Documents, Court Data & Exports."""

    def test_reminder_idor_and_cancelled_hearing_state_oracle_blocked(
        self, api_client, advocate_a, advocate_b
    ):
        case_a = Case.objects.create(
            case_type="WP",
            case_number="9001",
            filing_year=2026,
            petitioner="P1",
            respondent="R1",
        )
        case_a.tracked_by.add(advocate_a)
        cancelled_hearing_a = Hearing.objects.create(
            case=case_a,
            hearing_date=timezone.now().date() + datetime.timedelta(days=4),
            status="CANCELLED",
        )

        case_b = Case.objects.create(
            case_type="WA",
            case_number="9002",
            filing_year=2026,
            petitioner="P2",
            respondent="R2",
        )
        case_b.tracked_by.add(advocate_b)

        api_client.force_authenticate(user=advocate_b)
        rem_url = reverse("reminders:reminder_list_create")
        due_dt = (timezone.now() + datetime.timedelta(days=2)).isoformat()

        # Advocate B referencing Advocate A's cancelled hearing must get 400 (NOT 409 oracle)
        res_hearing_idor = api_client.post(
            rem_url,
            {
                "hearing": cancelled_hearing_a.id,
                "title": "Probe Cancelled",
                "due_date": due_dt,
            },
        )
        assert res_hearing_idor.status_code == status.HTTP_400_BAD_REQUEST

        # Advocate B referencing Advocate A's case must get 400
        res_case_idor = api_client.post(
            rem_url,
            {"case": case_a.id, "title": "Probe Case", "due_date": due_dt},
        )
        assert res_case_idor.status_code == status.HTTP_400_BAD_REQUEST

        # Mismatched (case_b, hearing_a) must fail with 400
        res_mismatch = api_client.post(
            rem_url,
            {
                "case": case_b.id,
                "hearing": cancelled_hearing_a.id,
                "title": "Mismatch",
                "due_date": due_dt,
            },
        )
        assert res_mismatch.status_code == status.HTTP_400_BAD_REQUEST

        # Invalid query parameter ?case_id=abc returns 400 cleanly
        res_bad_param = api_client.get(f"{rem_url}?case_id=invalid_int")
        assert res_bad_param.status_code == status.HTTP_400_BAD_REQUEST

    def test_unassignment_revokes_previously_shared_case_access_immediately(
        self, api_client, admin_user, advocate_a, advocate_b
    ):
        case = Case.objects.create(
            case_type="CRP",
            case_number="9100",
            filing_year=2026,
            petitioner="Shared Client",
            respondent="State",
        )
        case.tracked_by.add(advocate_a, advocate_b)

        hall = CourtHall.objects.create(hall_number=9, bench_name="Division Bench", is_active=True)
        alert_b = TokenAlertRule.objects.create(
            advocate=advocate_b,
            case=case,
            court_hall=hall,
            hearing_date=timezone.now().date(),
            token_number="15",
            listed_item_number=15,
            alert_threshold=5,
        )

        # Admin unassigns advocate_b
        api_client.force_authenticate(user=admin_user)
        assign_url = reverse("admin_api:case_assign", kwargs={"case_id": case.pk})
        assert (
            api_client.post(
                assign_url, {"advocate_id": advocate_b.id, "action": "unassign"}
            ).status_code
            == status.HTTP_200_OK
        )

        # Advocate B loses access to case detail and token alerts for that case
        api_client.force_authenticate(user=advocate_b)
        assert (
            api_client.get(reverse("cases:case_detail", kwargs={"pk": case.pk})).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(
                reverse("tokens:token_alert_detail", kwargs={"pk": alert_b.pk})
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )

        # Invalid token alert query filters return 400
        assert (
            api_client.get(f"{reverse('tokens:token_alerts')}?case_id=bad").status_code
            == status.HTTP_400_BAD_REQUEST
        )
        assert (
            api_client.get(f"{reverse('tokens:token_alerts')}?court_hall_id=bad").status_code
            == status.HTTP_400_BAD_REQUEST
        )

    def test_shared_case_protects_uploader_documents_and_private_voice_note_titles(
        self, api_client, advocate_a, advocate_b
    ):
        shared_case = Case.objects.create(
            case_type="WP",
            case_number="9200",
            filing_year=2026,
            petitioner="Joint Pet",
            respondent="Joint Resp",
        )
        shared_case.tracked_by.add(advocate_a, advocate_b)

        doc_a = CaseDocument.objects.create(
            case=shared_case,
            uploaded_by=advocate_a,
            title="A Uploaded Brief",
            document_type="WRITTEN_SUBMISSIONS",
            original_filename="brief.pdf",
            file_size=64,
            mime_type="application/pdf",
            file=SimpleUploadedFile(
                "brief.pdf", b"%PDF-1.4\nContent", content_type="application/pdf"
            ),
        )

        # Advocate A creates and updates a voice note with a confidential title
        api_client.force_authenticate(user=advocate_a)
        vn = VoiceNote.objects.create(
            case=shared_case,
            advocate=advocate_a,
            title="CONFIDENTIAL WITNESS DISCLOSURE",
            audio_duration_seconds=10,
            audio_file_size_bytes=120,
        )
        api_client.patch(
            reverse("voice:voice-note-detail", kwargs={"pk": vn.pk}),
            {"title": "SECOND SECRET TITLE"},
        )

        # Advocate B can read shared document, but CANNOT patch or delete A's upload
        api_client.force_authenticate(user=advocate_b)
        doc_detail = reverse(
            "cases:case_document_detail",
            kwargs={"case_id": shared_case.pk, "pk": doc_a.pk},
        )
        assert api_client.get(doc_detail).status_code == status.HTTP_200_OK
        assert (
            api_client.patch(doc_detail, {"title": "Hijacked"}).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert api_client.delete(doc_detail).status_code == status.HTTP_404_NOT_FOUND

        # Shared case history must not expose private voice note titles or another advocate's note events
        hist_res = api_client.get(
            reverse("cases:case_history_list", kwargs={"case_id": shared_case.pk})
        )
        assert hist_res.status_code == status.HTTP_200_OK
        assert "CONFIDENTIAL WITNESS DISCLOSURE" not in str(hist_res.data)
        assert "SECOND SECRET TITLE" not in str(hist_res.data)
        assert "NOTE_UPDATED" not in str(hist_res.data)
        assert CaseHistory.objects.filter(case=shared_case, event_type="NOTE_UPDATED").exists()

        # Dashboard recent_activity for Advocate B also omits Advocate A's private voice note activity
        dash_b = api_client.get(reverse("cases:dashboard"))
        assert dash_b.status_code == status.HTTP_200_OK
        assert "NOTE_UPDATED" not in str(dash_b.data["recent_activity"])
        assert "CONFIDENTIAL WITNESS DISCLOSURE" not in str(dash_b.data["recent_activity"])

    def test_court_sync_status_scoped_and_sse_duration_bounds_validated(
        self, api_client, advocate_a, advocate_b
    ):
        case_a = Case.objects.create(
            case_type="WP", case_number="9301", filing_year=2026, petitioner="A", respondent="B"
        )
        case_a.tracked_by.add(advocate_a)
        CourtListing.objects.create(
            case=case_a,
            source_status="Listed",
            normalized_status="LISTED",
            last_synced_at=timezone.now(),
        )

        # Advocate B has 0 listings
        api_client.force_authenticate(user=advocate_b)
        sync_res = api_client.get(reverse("court_data:sync_status"))
        assert sync_res.status_code == status.HTTP_200_OK
        assert sync_res.data["total_active_listings"] == 0
        assert sync_res.data["last_sync_timestamp"] is None

        # Realtime stream validates max_duration safely
        stream_url = reverse("notifications:realtime_stream")
        assert (
            api_client.get(f"{stream_url}?max_duration=bad").status_code
            == status.HTTP_400_BAD_REQUEST
        )
        assert (
            api_client.get(f"{stream_url}?max_duration=-5").status_code
            == status.HTTP_400_BAD_REQUEST
        )
        assert api_client.get(f"{stream_url}?max_duration=0").status_code == status.HTTP_200_OK

    def test_pdf_export_escapes_xml_special_characters(self, api_client, advocate_a):
        case = Case.objects.create(
            case_type="WP",
            case_number="9401",
            filing_year=2026,
            petitioner="M/s Alpha & Beta <Special> \"Quoted\" 'Single'",
            respondent="State & Ors",
        )
        case.tracked_by.add(advocate_a)
        CaseNote.objects.create(
            case=case,
            advocate=advocate_a,
            title="Note <A> & B",
            content="Amount < 5000 & > 1000",
        )

        api_client.force_authenticate(user=advocate_a)
        res = api_client.get(reverse("cases:export_case_pdf", kwargs={"case_id": case.pk}))
        assert res.status_code == status.HTTP_200_OK
        assert res.content.startswith(b"%PDF-")
