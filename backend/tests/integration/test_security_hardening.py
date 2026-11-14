import datetime
import os
import subprocess
import sys
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case
from apps.notifications.models import DeviceRegistration
from apps.reminders.models import Reminder
from apps.tokens.models import CourtHall, TokenAlertRule

User = get_user_model()
BACKEND_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def advocate_a(db):
    user = User.objects.create_user(
        username="AP/1111/2023",
        email="advocate.a@example.com",
        password="Strong#PasswordA1",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/1111/2023",
        role="ASSOCIATE",
        is_verified=False,
    )
    return user


@pytest.fixture
def advocate_b(db):
    user = User.objects.create_user(
        username="AP/2222/2023",
        email="advocate.b@example.com",
        password="Strong#PasswordB2",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/2222/2023",
        role="ASSOCIATE",
        is_verified=False,
    )
    return user


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="adminuser",
        email="admin@example.com",
        password="Strong#AdminPassword1",
        is_staff=True,
    )


@pytest.mark.django_db
class TestCaseAPISecurity:
    """Phase 1: Enforce authentication & strict per-advocate case isolation."""

    list_url = reverse("cases:case_list_create")

    def _create_case(self, owner, case_number="101", **extra):
        case = Case.objects.create(
            case_type="WP",
            case_number=case_number,
            filing_year=2025,
            petitioner=f"Petitioner {case_number}",
            respondent=f"Respondent {case_number}",
            **extra,
        )
        case.tracked_by.add(owner)
        return case

    def test_anonymous_cannot_list_or_create_cases(self, api_client, advocate_a):
        self._create_case(advocate_a, "101")
        assert api_client.get(self.list_url).status_code == status.HTTP_401_UNAUTHORIZED

        res = api_client.post(
            self.list_url,
            {
                "case_type": "WP",
                "case_number": "102",
                "filing_year": 2025,
                "petitioner": "Anon P",
                "respondent": "Anon R",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_anonymous_cannot_retrieve_case_detail(self, api_client, advocate_a):
        case = self._create_case(advocate_a, "103")
        detail_url = reverse("cases:case_detail", kwargs={"pk": case.pk})
        assert api_client.get(detail_url).status_code == status.HTTP_401_UNAUTHORIZED

    def test_advocate_creates_case_and_tracked_by_uses_request_user(
        self, api_client, advocate_a, advocate_b
    ):
        api_client.force_authenticate(user=advocate_a)
        res = api_client.post(
            self.list_url,
            {
                "case_type": "WP",
                "case_number": "104",
                "filing_year": 2025,
                "petitioner": "Alice P",
                "respondent": "State of AP",
                "tracked_by": [advocate_b.id],  # untrusted field must be ignored
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED
        case = Case.objects.get(pk=res.json()["id"])
        assert case.tracked_by.filter(pk=advocate_a.pk).exists()
        assert not case.tracked_by.filter(pk=advocate_b.pk).exists()

    def test_advocate_can_retrieve_own_case_only(self, api_client, advocate_a, advocate_b):
        case_a = self._create_case(advocate_a, "201")
        case_b = self._create_case(advocate_b, "202")

        api_client.force_authenticate(user=advocate_a)
        list_res = api_client.get(self.list_url)
        assert list_res.status_code == status.HTTP_200_OK
        returned_ids = [item["id"] for item in list_res.json()["results"]]
        assert case_a.id in returned_ids
        assert case_b.id not in returned_ids

        own_detail = reverse("cases:case_detail", kwargs={"pk": case_a.pk})
        assert api_client.get(own_detail).status_code == status.HTTP_200_OK

    def test_advocate_cannot_retrieve_or_update_other_advocates_case(
        self, api_client, advocate_a, advocate_b
    ):
        case_b = self._create_case(advocate_b, "301", current_stage="PENDING")
        detail_url = reverse("cases:case_detail", kwargs={"pk": case_b.pk})

        api_client.force_authenticate(user=advocate_a)
        assert api_client.get(detail_url).status_code == status.HTTP_404_NOT_FOUND
        assert (
            api_client.patch(detail_url, {"current_stage": "DISPOSED"}, format="json").status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.put(
                detail_url,
                {
                    "case_type": "WP",
                    "case_number": "301",
                    "filing_year": 2025,
                    "petitioner": "Tampered",
                    "respondent": "Tampered",
                },
                format="json",
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        case_b.refresh_from_db()
        assert case_b.current_stage == "PENDING"

    def test_authorized_staff_admin_can_access_all_cases(
        self, api_client, advocate_a, advocate_b, admin_user
    ):
        case_a = self._create_case(advocate_a, "401")
        case_b = self._create_case(advocate_b, "402")

        api_client.force_authenticate(user=admin_user)
        list_res = api_client.get(self.list_url)
        assert list_res.status_code == status.HTTP_200_OK
        returned_ids = [item["id"] for item in list_res.json()["results"]]
        assert {case_a.id, case_b.id}.issubset(returned_ids)

        detail_url = reverse("cases:case_detail", kwargs={"pk": case_b.pk})
        patch_res = api_client.patch(detail_url, {"current_stage": "ADJOURNED"}, format="json")
        assert patch_res.status_code == status.HTTP_200_OK
        case_b.refresh_from_db()
        assert case_b.current_stage == "ADJOURNED"


@pytest.mark.django_db
class TestCrossResourceOwnership:
    """Phase 2: Prevent associating reminders/alerts/devices with another user's resources."""

    def test_cannot_attach_reminder_to_untracked_case(self, api_client, advocate_a, advocate_b):
        case_a = Case.objects.create(
            case_type="WP",
            case_number="501",
            filing_year=2025,
            petitioner="PA",
            respondent="RA",
        )
        case_a.tracked_by.add(advocate_a)
        case_b = Case.objects.create(
            case_type="WP",
            case_number="502",
            filing_year=2025,
            petitioner="PB",
            respondent="RB",
        )
        case_b.tracked_by.add(advocate_b)

        api_client.force_authenticate(user=advocate_a)
        reminders_url = reverse("reminders:reminder_list_create")
        due_iso = (timezone.now() + datetime.timedelta(days=1)).isoformat()

        # Rejected when linking Advocate B's case
        bad_res = api_client.post(
            reminders_url,
            {
                "case": case_b.id,
                "title": "Sneaky reminder",
                "due_date": due_iso,
            },
            format="json",
        )
        assert bad_res.status_code == status.HTTP_400_BAD_REQUEST
        assert "case" in bad_res.json()["error"]["message"]
        assert Reminder.objects.filter(advocate=advocate_a).count() == 0

        # Permitted for Advocate A's tracked case
        ok_res = api_client.post(
            reminders_url,
            {
                "case": case_a.id,
                "title": "Own case reminder",
                "due_date": due_iso,
            },
            format="json",
        )
        assert ok_res.status_code == status.HTTP_201_CREATED

        # Rejected when patching existing reminder to Advocate B's case
        rem_id = ok_res.json()["id"]
        patch_res = api_client.patch(
            reverse("reminders:reminder_detail", kwargs={"pk": rem_id}),
            {"case": case_b.id},
            format="json",
        )
        assert patch_res.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_create_token_alert_for_untracked_case(self, api_client, advocate_a, advocate_b):
        hall = CourtHall.objects.create(hall_number=1, bench_name="Division Bench I")
        case_a = Case.objects.create(
            case_type="WP",
            case_number="601",
            filing_year=2025,
            petitioner="PA",
            respondent="RA",
        )
        case_a.tracked_by.add(advocate_a)
        case_b = Case.objects.create(
            case_type="WP",
            case_number="602",
            filing_year=2025,
            petitioner="PB",
            respondent="RB",
        )
        case_b.tracked_by.add(advocate_b)

        api_client.force_authenticate(user=advocate_a)
        alerts_url = reverse("tokens:token_alerts")
        today_str = datetime.date.today().isoformat()

        bad_res = api_client.post(
            alerts_url,
            {
                "case": case_b.id,
                "court_hall": hall.id,
                "hearing_date": today_str,
                "token_number": "12",
                "listed_item_number": 12,
                "alert_threshold": 3,
            },
            format="json",
        )
        assert bad_res.status_code == status.HTTP_400_BAD_REQUEST
        assert "case" in bad_res.json()["error"]["message"]
        assert TokenAlertRule.objects.count() == 0

        ok_res = api_client.post(
            alerts_url,
            {
                "case": case_a.id,
                "court_hall": hall.id,
                "hearing_date": today_str,
                "token_number": "12",
                "listed_item_number": 12,
                "alert_threshold": 3,
            },
            format="json",
        )
        assert ok_res.status_code == status.HTTP_201_CREATED

    def test_cannot_hijack_other_users_device_token(self, api_client, advocate_a, advocate_b):
        devices_url = reverse("notifications:device_registration")
        token_value = "ExponentPushToken[shared-token-test-123]"

        # Advocate A registers device token
        api_client.force_authenticate(user=advocate_a)
        r1 = api_client.post(
            devices_url,
            {
                "expo_push_token": token_value,
                "device_name": "Advocate A Phone",
                "platform": "android",
            },
            format="json",
        )
        assert r1.status_code == status.HTTP_201_CREATED

        # Same user refreshing their own token succeeds (200 OK)
        r2 = api_client.post(
            devices_url,
            {
                "expo_push_token": token_value,
                "device_name": "Advocate A Phone v2",
                "platform": "android",
            },
            format="json",
        )
        assert r2.status_code == status.HTTP_200_OK

        # Advocate B attempting to register Advocate A's token is rejected (403 Forbidden)
        api_client.force_authenticate(user=advocate_b)
        hijack = api_client.post(
            devices_url,
            {
                "expo_push_token": token_value,
                "device_name": "Attacker Phone",
                "platform": "ios",
            },
            format="json",
        )
        assert hijack.status_code == status.HTTP_403_FORBIDDEN

        device = DeviceRegistration.objects.get(expo_push_token=token_value)
        assert device.user_id == advocate_a.id
        assert device.device_name == "Advocate A Phone v2"


class TestProductionConfiguration:
    """Phase 4: Verify deployment entrypoints and strict production config guards."""

    def test_wsgi_and_asgi_default_to_production_and_manage_to_development(self):
        wsgi_text = (BACKEND_ROOT / "config" / "wsgi.py").read_text(encoding="utf-8")
        asgi_text = (BACKEND_ROOT / "config" / "asgi.py").read_text(encoding="utf-8")
        manage_text = (BACKEND_ROOT / "manage.py").read_text(encoding="utf-8")

        assert '"config.settings.production"' in wsgi_text
        assert '"config.settings.production"' in asgi_text
        assert '"config.settings.development"' in manage_text

    def _import_production_with_env(self, env_overrides):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings.production",
            "DJANGO_SECRET_KEY": "prod-super-random-key-value-998877",
            "JWT_SECRET_KEY": "jwt-super-random-key-value-112233",
            "DJANGO_ALLOWED_HOSTS": "api.aphc-tracker.gov.in",
            "DATABASE_URL": "postgres://u:p@ep-test.ap-southeast-1.aws.neon.tech/neondb",
            "CORS_ALLOWED_ORIGINS": "https://app.aphc-tracker.gov.in",
        }
        for key, value in env_overrides.items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = value

        # Prevent base.py load_dotenv from refilling cleared vars by writing no temp files:
        # pass python code that clears os.environ after dotenv OR checks explicit keys.
        return subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "import django; django.setup(); "
                    "from django.conf import settings; "
                    "print(settings.DEBUG, settings.ALLOWED_HOSTS, settings.CORS_ALLOW_ALL_ORIGINS, "
                    "settings.ENABLE_API_DOCS, settings.DATABASES['default']['OPTIONS'].get('sslmode'))"
                ),
            ],
            cwd=str(BACKEND_ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    @pytest.mark.parametrize(
        "bad_env",
        [
            {"DJANGO_SECRET_KEY": "django-insecure-test"},
            {"JWT_SECRET_KEY": "placeholder_jwt_secret_key"},
            {"DJANGO_ALLOWED_HOSTS": "*"},
            {"DJANGO_ALLOWED_HOSTS": " "},
            {"DATABASE_URL": ""},
        ],
    )
    def test_production_settings_fail_fast_on_unsafe_config(self, bad_env):
        proc = self._import_production_with_env(bad_env)
        assert proc.returncode != 0
        assert "ValueError" in proc.stderr

    def test_production_settings_load_cleanly_with_valid_config(self):
        proc = self._import_production_with_env({})
        assert proc.returncode == 0, proc.stderr
        assert "False ['api.aphc-tracker.gov.in'] False False require" in proc.stdout


@pytest.mark.django_db
class TestJWTHardeningAndLogout:
    """Phase 5: Login throttling, refresh rotation blacklisting, and logout revocation."""

    token_url = reverse("accounts:token_obtain_pair")
    refresh_url = reverse("accounts:token_refresh")
    logout_url = reverse("accounts:logout")

    def test_login_rate_limiting_returns_429(self, api_client, advocate_a, monkeypatch):
        monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "auth", "2/minute")

        for _ in range(2):
            res = api_client.post(
                self.token_url,
                {"username": "AP/1111/2023", "password": "wrong"},
                format="json",
            )
            assert res.status_code == status.HTTP_401_UNAUTHORIZED

        blocked = api_client.post(
            self.token_url,
            {"username": "AP/1111/2023", "password": "Strong#PasswordA1"},
            format="json",
        )
        assert blocked.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_refresh_rotation_blacklists_previous_refresh_token(self, api_client, advocate_a):
        login_res = api_client.post(
            self.token_url,
            {"username": "AP/1111/2023", "password": "Strong#PasswordA1"},
            format="json",
        )
        assert login_res.status_code == status.HTTP_200_OK
        first_refresh = login_res.json()["refresh"]

        rotate_res = api_client.post(self.refresh_url, {"refresh": first_refresh}, format="json")
        assert rotate_res.status_code == status.HTTP_200_OK
        assert "access" in rotate_res.json()

        # Replaying rotated refresh token must fail once blacklisted
        replay_res = api_client.post(self.refresh_url, {"refresh": first_refresh}, format="json")
        assert replay_res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_logout_blacklists_refresh_token(self, api_client, advocate_a):
        login_res = api_client.post(
            self.token_url,
            {"username": "AP/1111/2023", "password": "Strong#PasswordA1"},
            format="json",
        )
        refresh_token = login_res.json()["refresh"]

        logout_res = api_client.post(self.logout_url, {"refresh": refresh_token}, format="json")
        assert logout_res.status_code == status.HTTP_200_OK

        # Blacklisted token cannot be refreshed or logged out twice
        refresh_res = api_client.post(self.refresh_url, {"refresh": refresh_token}, format="json")
        assert refresh_res.status_code == status.HTTP_401_UNAUTHORIZED

        logout_again = api_client.post(self.logout_url, {"refresh": refresh_token}, format="json")
        assert logout_again.status_code == status.HTTP_400_BAD_REQUEST

        missing = api_client.post(self.logout_url, {}, format="json")
        assert missing.status_code == status.HTTP_400_BAD_REQUEST
