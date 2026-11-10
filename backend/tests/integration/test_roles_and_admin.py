import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status

from apps.accounts.models import AdminAuditLog, AdvocateProfile, OTPVerification
from apps.cases.models import Case, CaseAssignmentHistory, CaseDocument, CaseNote
from apps.voice.models import VoiceNote

User = get_user_model()


@pytest.fixture
def super_admin(db):
    user = User.objects.create_superuser(
        username="superadmin",
        email="superadmin@aphc.in",
        password="AdminPassword123!",
        first_name="Chief",
        last_name="Administrator",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/0001/2015",
        role="SENIOR",
        is_verified=True,
    )
    return user


@pytest.fixture
def staff_admin(db):
    user = User.objects.create_user(
        username="staffadmin",
        email="staffadmin@aphc.in",
        password="StaffPassword123!",
        first_name="Registry",
        last_name="Officer",
        is_staff=True,
        is_superuser=False,
        is_active=True,
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/0002/2018",
        role="SENIOR",
        is_verified=True,
    )
    return user


@pytest.fixture
def advocate_one(db):
    user = User.objects.create_user(
        username="AP77772022",
        email="advocate1@aphc.in",
        password="AdvocatePassword123!",
        first_name="Lakshmi",
        last_name="Prasad",
        is_active=True,
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2022",
        phone_number="+919848011111",
        chamber_address="Chamber 10, High Court",
        role="ADVOCATE",
        is_verified=True,
    )
    return user


@pytest.fixture
def advocate_two(db):
    user = User.objects.create_user(
        username="AP88882023",
        email="advocate2@aphc.in",
        password="AdvocatePassword123!",
        first_name="Kiran",
        last_name="Kumar",
        is_active=True,
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/8888/2023",
        role="ASSOCIATE",
        is_verified=True,
    )
    return user


@pytest.fixture
def inactive_advocate(db):
    user = User.objects.create_user(
        username="AP99992023",
        email="inactive@aphc.in",
        password="AdvocatePassword123!",
        first_name="Inactive",
        last_name="Advocate",
        is_active=False,
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/9999/2023",
        role="ASSOCIATE",
        is_verified=False,
    )
    return user


@pytest.mark.django_db
class TestRoleAuthenticationAndProfile:
    """Verify real Django JWT role claims, multi-identifier login, and safe profile updates."""

    def test_jwt_login_with_username_and_enrollment_returns_real_role(
        self, api_client, super_admin, advocate_one
    ):
        token_url = reverse("accounts:token_obtain_pair")

        # Super Admin login via username
        res_admin = api_client.post(
            token_url,
            {"username": "superadmin", "password": "AdminPassword123!"},
        )
        assert res_admin.status_code == status.HTTP_200_OK
        assert res_admin.data["user"]["role"] == "ADMIN"
        assert res_admin.data["user"]["is_admin"] is True
        assert res_admin.data["user"]["is_superuser"] is True

        # Advocate login via Bar Council Enrollment ID (case-insensitive)
        res_adv = api_client.post(
            token_url,
            {"username": "ap/7777/2022", "password": "AdvocatePassword123!"},
        )
        assert res_adv.status_code == status.HTTP_200_OK
        assert res_adv.data["user"]["role"] == "ADVOCATE"
        assert res_adv.data["user"]["is_admin"] is False
        assert res_adv.data["user"]["profile"]["bar_council_enrollment_number"] == "AP/7777/2022"

    def test_profile_get_and_safe_patch_blocks_privilege_escalation(self, api_client, advocate_one):
        profile_url = reverse("accounts:profile")
        api_client.force_authenticate(user=advocate_one)

        res_get = api_client.get(profile_url)
        assert res_get.status_code == status.HTTP_200_OK
        assert res_get.data["role"] == "ADVOCATE"

        # Allowed fields update cleanly
        res_patch = api_client.patch(
            profile_url,
            {
                "first_name": "Lakshmi Narayana",
                "chamber_address": "Chamber 14, Amaravati",
                "preferred_language": "te",
            },
        )
        assert res_patch.status_code == status.HTTP_200_OK
        assert res_patch.data["first_name"] == "Lakshmi Narayana"
        assert res_patch.data["profile"]["chamber_address"] == "Chamber 14, Amaravati"
        assert res_patch.data["profile"]["preferred_language"] == "te"

        # Forbidden privilege/identifier fields must be rejected
        for forbidden_payload in [
            {"is_staff": True},
            {"is_superuser": True},
            {"role": "ADMIN"},
            {"is_active": False},
            {"is_verified": False},
            {"username": "hacked"},
            {"bar_council_enrollment_number": "AP/0000/1999"},
        ]:
            res_bad = api_client.patch(profile_url, forbidden_payload)
            assert res_bad.status_code == status.HTTP_400_BAD_REQUEST

        advocate_one.refresh_from_db()
        assert advocate_one.is_staff is False
        assert advocate_one.is_superuser is False


@pytest.mark.django_db
class TestPublicRegistrationHardening:
    """Verify public registration never grants Admin roles and requires OTP verification."""

    def test_public_register_rejects_admin_escalation_flags(self, api_client):
        reg_url = reverse("accounts:register")
        base_payload = {
            "enrollment_number": "AP/3210/2025",
            "email": "new.advocate@aphc.in",
            "password": "StrongPassword987!",
            "confirm_password": "StrongPassword987!",
            "first_name": "New",
            "last_name": "Advocate",
        }

        for escalation in [
            {"account_role": "ADMIN"},
            {"is_staff": True},
            {"is_superuser": True},
        ]:
            res = api_client.post(reg_url, {**base_payload, **escalation})
            assert res.status_code == status.HTTP_400_BAD_REQUEST

        assert not User.objects.filter(email="new.advocate@aphc.in").exists()

    def test_public_register_creates_inactive_advocate_until_otp_verified(self, api_client):
        reg_url = reverse("accounts:register")
        res = api_client.post(
            reg_url,
            {
                "enrollment_number": "AP/3211/2025",
                "email": "pending.adv@aphc.in",
                "password": "StrongPassword987!",
                "confirm_password": "StrongPassword987!",
                "first_name": "Pending",
                "last_name": "Adv",
            },
        )
        assert res.status_code == status.HTTP_201_CREATED
        created = User.objects.get(email="pending.adv@aphc.in")
        assert created.is_active is False
        assert created.is_staff is False
        assert created.is_superuser is False
        assert created.advocate_profile.is_verified is False

        assert OTPVerification.objects.filter(
            identifier__iexact="AP/3211/2025", purpose=OTPVerification.PURPOSE_REGISTRATION
        ).exists()


@pytest.mark.django_db
class TestAdminAuthorizationAndUserManagement:
    """Verify backend RBAC, superuser-only admin promotion, self-protection, and audit logging."""

    def test_admin_endpoints_reject_anonymous_and_advocate_users(self, api_client, advocate_one):
        urls = [
            reverse("admin_api:dashboard"),
            reverse("admin_api:user_list_create"),
            reverse("admin_api:case_list"),
            reverse("admin_api:assignment_history"),
            reverse("admin_api:audit_logs"),
        ]
        for url in urls:
            anon_res = api_client.get(url)
            assert anon_res.status_code == status.HTTP_401_UNAUTHORIZED

        api_client.force_authenticate(user=advocate_one)
        for url in urls:
            adv_res = api_client.get(url)
            assert adv_res.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_dashboard_returns_accurate_stats_and_health(
        self, api_client, super_admin, advocate_one, inactive_advocate
    ):
        case_assigned = Case.objects.create(
            case_type="WP",
            case_number="4101",
            filing_year=2026,
            petitioner="A",
            respondent="B",
        )
        case_assigned.tracked_by.add(advocate_one)
        Case.objects.create(
            case_type="WA",
            case_number="4102",
            filing_year=2026,
            petitioner="C",
            respondent="D",
        )

        api_client.force_authenticate(user=super_admin)
        res = api_client.get(reverse("admin_api:dashboard"))
        assert res.status_code == status.HTTP_200_OK
        stats = res.data["stats"]
        assert stats["total_advocates"] == 2
        assert stats["active_advocates"] == 1
        assert stats["inactive_advocates"] == 1
        assert stats["pending_approvals"] == 1
        assert stats["total_admins"] == 1
        assert stats["total_cases"] == 2
        assert stats["assigned_cases"] == 1
        assert stats["unassigned_cases"] == 1
        assert res.data["system_overview"]["database_status"] == "healthy"

    def test_staff_admin_cannot_create_or_promote_admin_but_can_manage_advocates(
        self, api_client, staff_admin, super_admin, advocate_one
    ):
        users_url = reverse("admin_api:user_list_create")
        api_client.force_authenticate(user=staff_admin)

        # Staff admin can create an ADVOCATE
        res_create_adv = api_client.post(
            users_url,
            {
                "enrollment_number": "AP/4444/2025",
                "email": "managed.adv@aphc.in",
                "password": "StrongPassword987!",
                "first_name": "Managed",
                "last_name": "Counsel",
                "account_role": "ADVOCATE",
            },
        )
        assert res_create_adv.status_code == status.HTTP_201_CREATED
        assert res_create_adv.data["role"] == "ADVOCATE"

        # Staff admin cannot create an ADMIN
        res_create_admin = api_client.post(
            users_url,
            {
                "enrollment_number": "AP/4445/2025",
                "email": "rogue.admin@aphc.in",
                "password": "StrongPassword987!",
                "account_role": "ADMIN",
            },
        )
        assert res_create_admin.status_code == status.HTTP_403_FORBIDDEN

        # Staff admin cannot promote advocate_one to ADMIN or deactivate super_admin
        adv_detail_url = reverse("admin_api:user_detail", kwargs={"pk": advocate_one.pk})
        res_promote = api_client.patch(adv_detail_url, {"account_role": "ADMIN"})
        assert res_promote.status_code == status.HTTP_403_FORBIDDEN

        super_detail_url = reverse("admin_api:user_detail", kwargs={"pk": super_admin.pk})
        res_touch_admin = api_client.patch(super_detail_url, {"is_active": False})
        assert res_touch_admin.status_code == status.HTTP_403_FORBIDDEN

    def test_superuser_admin_lifecycle_self_protection_and_audit_redaction(
        self, api_client, super_admin, advocate_one
    ):
        api_client.force_authenticate(user=super_admin)

        # Cannot self-deactivate or self-demote
        self_url = reverse("admin_api:user_detail", kwargs={"pk": super_admin.pk})
        res_self_deact = api_client.patch(self_url, {"is_active": False})
        assert res_self_deact.status_code == status.HTTP_400_BAD_REQUEST
        res_self_demote = api_client.patch(self_url, {"account_role": "ADVOCATE"})
        assert res_self_demote.status_code == status.HTTP_400_BAD_REQUEST

        # Promote advocate_one to ADMIN, edit profile, deactivate, then reactivate
        adv_url = reverse("admin_api:user_detail", kwargs={"pk": advocate_one.pk})
        res_promote = api_client.patch(adv_url, {"account_role": "ADMIN"})
        assert res_promote.status_code == status.HTTP_200_OK
        assert res_promote.data["role"] == "ADMIN"

        res_deact = api_client.patch(adv_url, {"is_active": False})
        assert res_deact.status_code == status.HTTP_200_OK
        assert res_deact.data["is_active"] is False

        # Audit logs recorded without secrets
        logs = AdminAuditLog.objects.filter(target_user=advocate_one)
        assert logs.filter(action=AdminAuditLog.ACTION_ADMIN_PROMOTED).exists()
        assert logs.filter(action=AdminAuditLog.ACTION_USER_DEACTIVATED).exists()
        for entry in logs:
            serialized = str(entry.metadata).lower()
            assert "password" not in serialized
            assert "token" not in serialized


@pytest.mark.django_db
class TestAdminPrivacyBoundaryAndCaseAssignment:
    """Verify Admin permissions manage assignment only and NEVER bypass legal case data privacy."""

    def test_admin_case_list_exposes_metadata_only_and_blocks_private_case_endpoints(
        self, api_client, super_admin, advocate_one
    ):
        case = Case.objects.create(
            case_type="WP",
            case_number="5501",
            filing_year=2026,
            petitioner="Confidential Client",
            respondent="State",
        )
        case.tracked_by.add(advocate_one)

        CaseNote.objects.create(
            case=case,
            advocate=advocate_one,
            title="Top Secret Defense",
            content="Privileged attorney-client communication",
        )
        CaseDocument.objects.create(
            case=case,
            uploaded_by=advocate_one,
            title="Private Evidence",
            document_type="PETITION",
            original_filename="secret.pdf",
            file_size=128,
            mime_type="application/pdf",
            file=SimpleUploadedFile(
                "secret.pdf", b"%PDF-1.4\nSecret", content_type="application/pdf"
            ),
        )
        VoiceNote.objects.create(
            case=case,
            advocate=advocate_one,
            title="Private Voice Memo",
            audio_duration_seconds=12,
            audio_file_size_bytes=200,
            transcript="Confidential audio transcript",
        )

        api_client.force_authenticate(user=super_admin)

        # Admin case metadata endpoint works but omits private content
        res_admin_cases = api_client.get(reverse("admin_api:case_list"))
        assert res_admin_cases.status_code == status.HTTP_200_OK
        payload_str = str(res_admin_cases.data)
        assert "Privileged attorney-client" not in payload_str
        assert "Private Evidence" not in payload_str
        assert "Confidential audio transcript" not in payload_str

        # Untracked Admin must NOT access private advocate legal endpoints
        assert (
            api_client.get(reverse("cases:case_detail", kwargs={"pk": case.pk})).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(
                reverse("cases:case_note_list_create", kwargs={"case_id": case.pk})
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(
                reverse("cases:case_document_list_create", kwargs={"case_id": case.pk})
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(
                reverse("voice:case-voice-notes", kwargs={"case_id": case.pk})
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(
                reverse("cases:export_case_pdf", kwargs={"case_id": case.pk})
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_case_assignment_reassignment_unassignment_and_inactive_block(
        self, api_client, super_admin, advocate_one, advocate_two, inactive_advocate
    ):
        case = Case.objects.create(
            case_type="CRP",
            case_number="6100",
            filing_year=2026,
            petitioner="Petitioner P",
            respondent="Respondent R",
        )
        assign_url = reverse("admin_api:case_assign", kwargs={"case_id": case.pk})
        api_client.force_authenticate(user=super_admin)

        # Block assigning to inactive advocate
        res_inactive = api_client.post(
            assign_url, {"advocate_id": inactive_advocate.id, "action": "assign"}
        )
        assert res_inactive.status_code == status.HTTP_400_BAD_REQUEST
        assert not case.tracked_by.filter(pk=inactive_advocate.id).exists()

        # Assign to advocate_one
        res_assign = api_client.post(
            assign_url,
            {"advocate_id": advocate_one.id, "action": "assign", "notes": "Primary counsel"},
        )
        assert res_assign.status_code == status.HTTP_200_OK
        assert case.tracked_by.filter(pk=advocate_one.id).exists()

        # Reassign from advocate_one to advocate_two
        res_reassign = api_client.post(
            assign_url,
            {
                "advocate_id": advocate_two.id,
                "replace_advocate_id": advocate_one.id,
                "action": "assign",
                "notes": "Senior transfer",
            },
        )
        assert res_reassign.status_code == status.HTTP_200_OK
        assert not case.tracked_by.filter(pk=advocate_one.id).exists()
        assert case.tracked_by.filter(pk=advocate_two.id).exists()

        # Unassign advocate_two
        res_unassign = api_client.post(
            assign_url,
            {"advocate_id": advocate_two.id, "action": "unassign", "notes": "Closed mandate"},
        )
        assert res_unassign.status_code == status.HTTP_200_OK
        assert not case.tracked_by.filter(pk=advocate_two.id).exists()

        history = CaseAssignmentHistory.objects.filter(case=case)
        assert history.filter(advocate=advocate_one, action="ASSIGNED").exists()
        assert history.filter(advocate=advocate_one, action="UNASSIGNED").exists()
        assert history.filter(advocate=advocate_two, action="ASSIGNED").exists()
        assert history.filter(advocate=advocate_two, action="UNASSIGNED").exists()
