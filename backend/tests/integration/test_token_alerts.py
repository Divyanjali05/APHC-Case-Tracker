"""Comprehensive integration test suite for Court Token Alert Engine (Phase 4).

Validates:
- Registration, validation, duplicate prevention
- Multi-tenant advocate isolation (Advocate A vs Advocate B)
- Proximity calculation and status lifecycle (REGISTERED -> WAITING -> APPROACHING -> CALLED)
- Idempotent alert dispatch (approaching and called notifications dispatched exactly once)
- Stale data flagging and graceful provider timeout/error handling
- Distributed locking and Celery task execution
- Compliance: explicit DEMO / MOCK status transparency
"""

from __future__ import annotations

import datetime
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case
from apps.notifications.models import NotificationHistory
from apps.tokens.models import CourtHall, CourtTokenStatus, TokenAlertRule, TokenStatus
from apps.tokens.providers import (
    CourtTokenObservation,
    CourtTokenProvider,
    CourtTokenProviderTimeoutError,
    set_court_token_provider_override,
)
from apps.tokens.services import TokenAlertSyncService
from apps.tokens.tasks import sync_active_token_alerts

User = get_user_model()


@pytest.fixture
def advocate_a(db):
    user = User.objects.create_user(
        username="AP11112020",
        password="ValidPassword123!",
        first_name="Suresh",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/1111/2020",
        role="SENIOR",
    )
    return user


@pytest.fixture
def advocate_b(db):
    user = User.objects.create_user(
        username="AP22222020",
        password="ValidPassword123!",
        first_name="Ramesh",
        last_name="Kumar",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/2222/2020",
        role="JUNIOR",
    )
    return user


@pytest.fixture
def court_hall_1(db):
    hall = CourtHall.objects.create(
        hall_number=1,
        bench_name="Hon'ble Chief Justice Bench",
        presiding_judges="Chief Justice Dhiraj Singh Thakur",
        is_active=True,
    )
    CourtTokenStatus.objects.create(
        court_hall=hall,
        current_item_number=5,
        current_stage="REGULAR_MOTION",
    )
    return hall


@pytest.fixture
def case_a(db, advocate_a):
    case = Case.objects.create(
        case_type="WP",
        case_number="1001",
        filing_year=2026,
        petitioner="ABC Constructions Ltd",
        respondent="State of Andhra Pradesh",
    )
    case.tracked_by.add(advocate_a)
    return case


@pytest.fixture
def case_b(db, advocate_b):
    case = Case.objects.create(
        case_type="WA",
        case_number="2002",
        filing_year=2026,
        petitioner="XYZ Energy Ltd",
        respondent="APEPDCL",
    )
    case.tracked_by.add(advocate_b)
    return case


@pytest.fixture(autouse=True)
def reset_provider_override():
    set_court_token_provider_override(None)
    yield
    set_court_token_provider_override(None)


@pytest.mark.django_db
class TestCourtHallsAPI:
    def test_list_court_halls(self, court_hall_1):
        client = APIClient()
        response = client.get(reverse("tokens:court_halls"))
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        results = data.get("results", data) if isinstance(data, dict) else data
        assert len(results) >= 1
        hall_data = next(h for h in results if h["hall_number"] == 1)
        assert hall_data["bench_name"] == "Hon'ble Chief Justice Bench"
        assert hall_data["status"]["current_item_number"] == 5

    def test_tokens_status_probe(self):
        client = APIClient()
        response = client.get(reverse("tokens:status"))
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ready"
        assert "provider" in data
        assert data["provider"]["is_mock"] is True


@pytest.mark.django_db
class TestTokenAlertRegistration:
    def test_register_token_alert_success(self, advocate_a, case_a, court_hall_1):
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        payload = {
            "case": case_a.id,
            "court_hall": court_hall_1.id,
            "token_number": "CH1-15",
            "listed_item_number": 15,
            "hearing_date": str(datetime.date.today()),
            "alert_threshold": 5,
            "alert_on_approach": True,
            "alert_on_called": True,
        }
        response = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["token_number"] == "CH1-15"
        assert data["listed_item_number"] == 15
        assert data["court_name"] == "High Court of Andhra Pradesh"
        assert data["is_active"] is True
        assert data["is_mock"] is True
        # Immediate sync should have populated current_called_token and distance
        assert data["current_called_token"] == "5"
        assert data["distance"] == 10
        assert data["status"] == TokenStatus.WAITING

    def test_register_token_alert_past_date_rejected(self, advocate_a, case_a, court_hall_1):
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        payload = {
            "case": case_a.id,
            "court_hall": court_hall_1.id,
            "token_number": "CH1-20",
            "listed_item_number": 20,
            "hearing_date": str(yesterday),
        }
        response = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        errors = data.get("error", {}).get("message", data)
        assert "hearing_date" in errors

    def test_register_token_alert_invalid_threshold(self, advocate_a, case_a, court_hall_1):
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        payload = {
            "case": case_a.id,
            "court_hall": court_hall_1.id,
            "token_number": "CH1-20",
            "listed_item_number": 20,
            "hearing_date": str(datetime.date.today()),
            "alert_threshold": 25,  # Exceeds max 20
        }
        response = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        errors = data.get("error", {}).get("message", data)
        assert "alert_threshold" in errors

    def test_register_token_alert_blank_token_rejected(self, advocate_a, case_a, court_hall_1):
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        payload = {
            "case": case_a.id,
            "court_hall": court_hall_1.id,
            "token_number": "   ",
            "listed_item_number": 20,
            "hearing_date": str(datetime.date.today()),
        }
        response = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        errors = data.get("error", {}).get("message", data)
        assert "token_number" in errors

    def test_register_token_alert_unauthorized_case_rejected(
        self, advocate_a, case_b, court_hall_1
    ):
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        # Advocate A tries to register alert for Advocate B's case
        payload = {
            "case": case_b.id,
            "court_hall": court_hall_1.id,
            "token_number": "CH1-25",
            "listed_item_number": 25,
            "hearing_date": str(datetime.date.today()),
        }
        response = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        errors = data.get("error", {}).get("message", data)
        assert "case" in errors

    def test_duplicate_active_registration_prevented(self, advocate_a, case_a, court_hall_1):
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        payload = {
            "case": case_a.id,
            "court_hall": court_hall_1.id,
            "token_number": "CH1-30",
            "listed_item_number": 30,
            "hearing_date": str(datetime.date.today()),
        }
        res1 = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert res1.status_code == status.HTTP_201_CREATED

        # Duplicate attempt with same hall, token, date for same advocate
        res2 = client.post(reverse("tokens:token_alerts"), payload, format="json")
        assert res2.status_code == status.HTTP_400_BAD_REQUEST
        data2 = res2.json()
        errors2 = data2.get("error", {}).get("message", data2)
        assert "non_field_errors" in errors2


@pytest.mark.django_db
class TestAdvocateIsolationAndCRUD:
    def test_advocate_isolation(self, advocate_a, advocate_b, case_a, case_b, court_hall_1):
        # Create alert for Advocate A
        alert_a = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-A1",
            listed_item_number=10,
            hearing_date=datetime.date.today(),
        )

        client_b = APIClient()
        client_b.force_authenticate(user=advocate_b)

        # Advocate B lists alerts -> should not see alert_a
        res_list = client_b.get(reverse("tokens:token_alerts"))
        assert res_list.status_code == status.HTTP_200_OK
        data_b = res_list.json()
        results_b = data_b.get("results", data_b) if isinstance(data_b, dict) else data_b
        ids = [item["id"] for item in results_b]
        assert alert_a.id not in ids

        # Advocate B tries to retrieve alert_a -> 404
        res_detail = client_b.get(reverse("tokens:token_alert_detail", kwargs={"pk": alert_a.id}))
        assert res_detail.status_code == status.HTTP_404_NOT_FOUND

        # Advocate B tries to cancel alert_a -> 404
        res_cancel = client_b.post(reverse("tokens:token_alert_cancel", kwargs={"pk": alert_a.id}))
        assert res_cancel.status_code == status.HTTP_404_NOT_FOUND

        # Advocate B tries to manual sync alert_a -> 404
        res_sync = client_b.post(reverse("tokens:token_alert_sync", kwargs={"pk": alert_a.id}))
        assert res_sync.status_code == status.HTTP_404_NOT_FOUND

    def test_update_alert_rule(self, advocate_a, case_a, court_hall_1):
        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-40",
            listed_item_number=40,
            alert_threshold=5,
            hearing_date=datetime.date.today(),
        )
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        patch_res = client.patch(
            reverse("tokens:token_alert_detail", kwargs={"pk": alert.id}),
            {"alert_threshold": 8, "alert_on_approach": False},
            format="json",
        )
        assert patch_res.status_code == status.HTTP_200_OK
        alert.refresh_from_db()
        assert alert.alert_threshold == 8
        assert alert.alert_on_approach is False

    def test_cancel_alert_rule(self, advocate_a, case_a, court_hall_1):
        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-50",
            listed_item_number=50,
            hearing_date=datetime.date.today(),
        )
        client = APIClient()
        client.force_authenticate(user=advocate_a)

        cancel_res = client.post(reverse("tokens:token_alert_cancel", kwargs={"pk": alert.id}))
        assert cancel_res.status_code == status.HTTP_200_OK
        alert.refresh_from_db()
        assert alert.is_active is False
        assert alert.status == TokenStatus.CANCELLED


@pytest.mark.django_db
class TestAlertSyncAndNotificationEngine:
    def test_approaching_alert_dispatched_once(self, advocate_a, case_a, court_hall_1):
        # Set hall item to 7; Alert listed item is 10; Threshold is 5.
        # items_remaining = 10 - 7 = 3 <= 5 -> triggers APPROACHING
        court_hall_1.token_status.current_item_number = 7
        court_hall_1.token_status.save()

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-10",
            listed_item_number=10,
            alert_threshold=5,
            hearing_date=datetime.date.today(),
        )

        service = TokenAlertSyncService()
        synced = service.sync_alert_rule(alert)

        assert synced.status == TokenStatus.APPROACHING
        assert synced.approaching_alert_sent is True
        assert synced.items_remaining == 3

        # Verify notification record created
        notifs = NotificationHistory.objects.filter(user=advocate_a, category="TOKEN_ALERT")
        assert notifs.count() == 1
        notif = notifs.first()
        assert "Approaching" in notif.title
        assert notif.data_payload["status"] == TokenStatus.APPROACHING
        assert notif.data_payload["items_remaining"] == 3

        # Run sync again -> Should be idempotent (no duplicate notification)
        synced_again = service.sync_alert_rule(alert)
        assert synced_again.approaching_alert_sent is True
        assert (
            NotificationHistory.objects.filter(user=advocate_a, category="TOKEN_ALERT").count() == 1
        )

    def test_called_alert_dispatched_once(self, advocate_a, case_a, court_hall_1):
        # Set hall item to 10; Alert listed item is 10 -> triggers CALLED
        court_hall_1.token_status.current_item_number = 10
        court_hall_1.token_status.save()

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-10",
            listed_item_number=10,
            alert_threshold=5,
            hearing_date=datetime.date.today(),
            approaching_alert_sent=True,  # Was previously alerted for approach
        )

        service = TokenAlertSyncService()
        synced = service.sync_alert_rule(alert)

        assert synced.status == TokenStatus.CALLED
        assert synced.called_alert_sent is True

        notifs = NotificationHistory.objects.filter(user=advocate_a, category="TOKEN_ALERT")
        assert notifs.count() == 1
        notif = notifs.first()
        assert "CALLED" in notif.title
        assert notif.data_payload["status"] == TokenStatus.CALLED

        # Run sync again -> idempotent, still 1 notification
        service.sync_alert_rule(alert)
        assert (
            NotificationHistory.objects.filter(user=advocate_a, category="TOKEN_ALERT").count() == 1
        )

    def test_staleness_flagging(self, advocate_a, case_a, court_hall_1):
        class StaleMockProvider(CourtTokenProvider):
            @property
            def provider_name(self) -> str:
                return "STALE_MOCK_PROVIDER"

            @property
            def is_live_provider(self) -> bool:
                return False

            def fetch_hall_token_status(self, hall_number: int) -> CourtTokenObservation:
                return CourtTokenObservation(
                    court_hall_number=hall_number,
                    current_item_number=5,
                    observed_at=timezone.now() - datetime.timedelta(seconds=400),  # > 300s
                    is_mock=True,
                    provider_name=self.provider_name,
                )

            def fetch_all_halls_status(self):
                return []

            def check_health(self):
                return {}

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-12",
            listed_item_number=12,
            hearing_date=datetime.date.today(),
        )

        service = TokenAlertSyncService(provider=StaleMockProvider())
        synced = service.sync_alert_rule(alert)
        assert synced.is_stale is True

    def test_provider_error_handling_graceful(self, advocate_a, case_a, court_hall_1):
        class FailingMockProvider(CourtTokenProvider):
            @property
            def provider_name(self) -> str:
                return "FAILING_PROVIDER"

            @property
            def is_live_provider(self) -> bool:
                return False

            def fetch_hall_token_status(self, hall_number: int) -> CourtTokenObservation:
                raise CourtTokenProviderTimeoutError("Gateway timeout connecting to board")

            def fetch_all_halls_status(self):
                return []

            def check_health(self):
                return {}

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-14",
            listed_item_number=14,
            hearing_date=datetime.date.today(),
        )

        service = TokenAlertSyncService(provider=FailingMockProvider())
        synced = service.sync_alert_rule(alert)
        assert synced.is_stale is True
        # State is not corrupted
        assert synced.token_number == "CH1-14"

    def test_manual_sync_endpoint(self, advocate_a, case_a, court_hall_1):
        court_hall_1.token_status.current_item_number = 8
        court_hall_1.token_status.save()

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-18",
            listed_item_number=18,
            hearing_date=datetime.date.today(),
        )

        client = APIClient()
        client.force_authenticate(user=advocate_a)

        res = client.post(reverse("tokens:token_alert_sync", kwargs={"pk": alert.id}))
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["current_called_token"] == "8"
        assert data["distance"] == 10


@pytest.mark.django_db
class TestCeleryTaskAndLocking:
    def test_sync_active_token_alerts_task_execution(self, advocate_a, case_a, court_hall_1):
        court_hall_1.token_status.current_item_number = 9
        court_hall_1.token_status.save()

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=case_a,
            court_hall=court_hall_1,
            token_number="CH1-10",
            listed_item_number=10,
            alert_threshold=3,
            hearing_date=datetime.date.today(),
        )

        result = sync_active_token_alerts()
        assert result["total_synced"] >= 1
        assert result["errors"] == 0

        alert.refresh_from_db()
        assert alert.status == TokenStatus.APPROACHING
        assert alert.approaching_alert_sent is True

    def test_sync_active_token_alerts_lock_overlap_protection(self):
        with patch("apps.tokens.tasks.DistributedLock") as mock_lock_cls:
            mock_lock = MagicMock()
            mock_lock.__enter__.side_effect = TimeoutError("Could not acquire lock")
            mock_lock_cls.return_value = mock_lock

            result = sync_active_token_alerts()
            assert result.get("skipped_due_to_overlap") == 1
