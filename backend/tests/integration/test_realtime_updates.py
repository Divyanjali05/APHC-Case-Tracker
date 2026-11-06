import json
from datetime import date, time, timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.db import transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing, Judgment
from apps.court_data.models import CourtStatusObservation
from apps.notifications.models import NotificationHistory, RealtimeEvent
from apps.notifications.realtime import RealtimeService

User = get_user_model()


@pytest.fixture
def advocate_one(db):
    user = User.objects.create_user(
        username="AP11112022",
        password="ValidPassword111!",
        first_name="Srinivas",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/1111/2022",
        role="ADVOCATE",
    )
    return user


@pytest.fixture
def advocate_two(db):
    user = User.objects.create_user(
        username="AP22222022",
        password="ValidPassword222!",
        first_name="Ananya",
        last_name="Reddy",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/2222/2022",
        role="SENIOR",
    )
    return user


@pytest.fixture
def auth_client_one(advocate_one):
    client = APIClient()
    refresh = RefreshToken.for_user(advocate_one)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def auth_client_two(advocate_two):
    client = APIClient()
    refresh = RefreshToken.for_user(advocate_two)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def tracked_case_one(db, advocate_one):
    case = Case.objects.create(
        case_type="WP",
        case_number="7890",
        filing_year=2024,
        petitioner="Tech Infra Ltd",
        respondent="State of AP",
        current_stage="PENDING",
    )
    case.tracked_by.add(advocate_one)
    return case


@pytest.mark.django_db
class TestRealtimeModelAndService:
    def test_realtime_event_creation_and_fields(self, advocate_one):
        event = RealtimeService.publish_event(
            user=advocate_one,
            event_type="COURT_TOKEN_UPDATED",
            payload={"token_number": 15, "case_id": 99},
        )

        assert event.id is not None
        assert event.event_uuid is not None
        assert event.user == advocate_one
        assert event.event_type == "COURT_TOKEN_UPDATED"
        assert event.payload["token_number"] == 15
        assert event.created_at is not None

    def test_monotonic_cursor_retrieval(self, advocate_one):
        ev1 = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "1"})
        ev2 = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "2"})
        ev3 = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "3"})

        # Query all events since 0
        all_events = RealtimeService.get_events_since(advocate_one, since_id=0)
        assert len(all_events) == 3
        assert [e.id for e in all_events] == [ev1.id, ev2.id, ev3.id]

        # Query events strictly after ev1.id
        missed = RealtimeService.get_events_since(advocate_one, since_id=ev1.id)
        assert len(missed) == 2
        assert [e.id for e in missed] == [ev2.id, ev3.id]

        # Latest event ID
        assert RealtimeService.get_latest_event_id(advocate_one) == ev3.id

    def test_sse_wire_formatting(self, advocate_one):
        event = RealtimeService.publish_event(
            advocate_one, "NOTIFICATION_CREATED", {"title": "New Notice"}
        )
        frame = RealtimeService.format_sse_frame(event)

        assert f"id: {event.id}\n" in frame
        assert "event: NOTIFICATION_CREATED\n" in frame
        assert f'"event_uuid": "{str(event.event_uuid)}"' in frame
        assert frame.endswith("\n\n")

        ping_frame = RealtimeService.format_sse_ping()
        assert "event: ping\n" in ping_frame
        assert ping_frame.endswith("\n\n")


@pytest.mark.django_db
class TestRealtimeIsolationAndEndpoints:
    def test_unauthenticated_requests_are_rejected(self, api_client):
        events_url = reverse("notifications:realtime_events")
        status_url = reverse("notifications:realtime_status")
        stream_url = reverse("notifications:realtime_stream")

        assert api_client.get(events_url).status_code == status.HTTP_401_UNAUTHORIZED
        assert api_client.get(status_url).status_code == status.HTTP_401_UNAUTHORIZED
        assert api_client.get(stream_url).status_code == status.HTTP_401_UNAUTHORIZED

    def test_advocate_data_isolation(
        self, auth_client_one, auth_client_two, advocate_one, advocate_two
    ):
        # Create events for advocate 1
        RealtimeService.publish_event(
            advocate_one, "COURT_TOKEN_UPDATED", {"secret": "advocate_1_data"}
        )
        RealtimeService.publish_event(
            advocate_one, "HEARING_RESCHEDULED", {"secret": "advocate_1_hearing"}
        )

        # Create event for advocate 2
        RealtimeService.publish_event(
            advocate_two, "COURT_TOKEN_UPDATED", {"secret": "advocate_2_data"}
        )

        events_url = reverse("notifications:realtime_events")

        # Advocate 1 queries events
        res1 = auth_client_one.get(events_url)
        assert res1.status_code == status.HTTP_200_OK
        data1 = res1.json()["data"] if "data" in res1.json() else res1.json()
        assert data1["count"] == 2
        for ev in data1["events"]:
            assert "advocate_1" in json.dumps(ev["payload"])
            assert "advocate_2" not in json.dumps(ev["payload"])

        # Advocate 2 queries events
        res2 = auth_client_two.get(events_url)
        assert res2.status_code == status.HTTP_200_OK
        data2 = res2.json()["data"] if "data" in res2.json() else res2.json()
        assert data2["count"] == 1
        assert "advocate_2_data" in data2["events"][0]["payload"]["secret"]
        assert "advocate_1" not in json.dumps(data2["events"][0]["payload"])

    def test_cursor_pagination_and_has_more(self, auth_client_one, advocate_one):
        for i in range(5):
            RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"index": i})

        events_url = reverse("notifications:realtime_events")

        # Page 1: limit=2
        res1 = auth_client_one.get(f"{events_url}?since_id=0&limit=2")
        data1 = res1.json()["data"] if "data" in res1.json() else res1.json()
        assert data1["count"] == 2
        assert data1["has_more"] is True
        last_id = data1["events"][-1]["id"]

        # Page 2: since_id=last_id
        res2 = auth_client_one.get(f"{events_url}?since_id={last_id}&limit=2")
        data2 = res2.json()["data"] if "data" in res2.json() else res2.json()
        assert data2["count"] == 2
        assert data2["has_more"] is True
        last_id_2 = data2["events"][-1]["id"]

        # Page 3: final item
        res3 = auth_client_one.get(f"{events_url}?since_id={last_id_2}&limit=2")
        data3 = res3.json()["data"] if "data" in res3.json() else res3.json()
        assert data3["count"] == 1
        assert data3["has_more"] is False

    def test_realtime_status_endpoint(self, auth_client_one, advocate_one):
        RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "ready"})
        status_url = reverse("notifications:realtime_status")

        response = auth_client_one.get(status_url)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"] if "data" in response.json() else response.json()
        assert data["status"] == "ready"
        assert data["streaming_supported"] is True
        assert data["latest_event_id"] > 0


@pytest.mark.django_db
class TestRealtimeStreamingView:
    def test_sse_stream_authentication_header(self, auth_client_one, advocate_one):
        RealtimeService.publish_event(advocate_one, "NOTIFICATION_CREATED", {"ping": "hello"})
        stream_url = reverse("notifications:realtime_stream")

        response = auth_client_one.get(f"{stream_url}?max_duration=0")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"].startswith("text/event-stream")
        assert response["Cache-Control"] == "no-cache"

        # Read initial streamed content
        chunks = b"".join(list(response.streaming_content)).decode("utf-8")
        assert "event: NOTIFICATION_CREATED" in chunks
        assert "event: ping" in chunks

    def test_sse_stream_single_use_ticket_authentication(
        self, auth_client_one, api_client, advocate_one
    ):
        ticket_url = reverse("notifications:realtime_ticket")
        res = auth_client_one.post(ticket_url)
        assert res.status_code == status.HTTP_201_CREATED
        ticket_data = res.json()["data"] if "data" in res.json() else res.json()
        ticket = ticket_data["ticket"]
        assert len(ticket) >= 32

        stream_url = reverse("notifications:realtime_stream")

        # 1. First consumption succeeds
        response = api_client.get(f"{stream_url}?ticket={ticket}&max_duration=0")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"].startswith("text/event-stream")

        # 2. Re-use of the same ticket fails (single-use guarantee)
        reused_response = api_client.get(f"{stream_url}?ticket={ticket}&max_duration=0")
        assert reused_response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_invalid_or_expired_ticket_rejected(self, api_client):
        stream_url = reverse("notifications:realtime_stream")
        response = api_client.get(
            f"{stream_url}?ticket=invalid_ticket_xyz_12345678901234567890&max_duration=0"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_raw_jwt_in_query_param_rejected(self, api_client, advocate_one):
        refresh = RefreshToken.for_user(advocate_one)
        token_str = str(refresh.access_token)
        stream_url = reverse("notifications:realtime_stream")

        # Query param ?token= is rejected to prevent access token exposure in logs
        response = api_client.get(f"{stream_url}?token={token_str}&max_duration=0")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_sse_stream_respects_since_id_cursor(self, auth_client_one, advocate_one):
        ev1 = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"id": 1})
        ev2 = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"id": 2})

        stream_url = reverse("notifications:realtime_stream")
        response = auth_client_one.get(f"{stream_url}?since_id={ev1.id}&max_duration=0")
        chunks = b"".join(list(response.streaming_content)).decode("utf-8")

        assert f"id: {ev2.id}" in chunks
        assert f"id: {ev1.id}" not in chunks


@pytest.mark.django_db
class TestDomainEventPublishers:
    def test_publish_court_token_update_to_tracking_advocates(
        self, tracked_case_one, advocate_one, advocate_two
    ):
        observation = CourtStatusObservation.objects.create(
            case=tracked_case_one,
            source_status="IN_PROGRESS",
            normalized_status="HEARING",
            provider_name="APHC_REGISTRY_MOCK",
            observed_at=timezone.now(),
            court_hall=3,
            token_number="18",
            safe_metadata={"stage": "Arguments", "is_bench_sitting": True},
        )

        events = RealtimeService.publish_court_token_update(tracked_case_one, observation)
        assert len(events) == 1
        assert events[0].user == advocate_one
        assert events[0].event_type == "COURT_TOKEN_UPDATED"
        assert events[0].payload["court_hall_number"] == 3
        assert events[0].payload["token_number"] == "18"

        # Advocate 2 did not track the case, so received 0 events
        advocate_two_events = RealtimeService.get_events_since(advocate_two, since_id=0)
        assert len(advocate_two_events) == 0

    def test_publish_judgment_event(self, tracked_case_one, advocate_one):
        judgment = Judgment.objects.create(
            case=tracked_case_one,
            judgment_date=date(2025, 4, 15),
            judgment_type="FINAL_JUDGMENT",
            order_number="ORD/789/2025",
            document_link="https://aphc.gov.in/orders/789.pdf",
        )

        # Pronounced
        events = RealtimeService.publish_judgment_event(
            judgment, is_new=True, document_uploaded=False
        )
        assert len(events) == 1
        assert events[0].event_type == "JUDGMENT_PRONOUNCED"
        assert events[0].payload["order_number"] == "ORD/789/2025"
        assert events[0].payload["has_document"] is True

        # Document uploaded
        doc_events = RealtimeService.publish_judgment_event(
            judgment, is_new=False, document_uploaded=True
        )
        assert len(doc_events) == 1
        assert doc_events[0].event_type == "JUDGMENT_DOCUMENT_UPLOADED"

    def test_publish_hearing_change_rescheduled(self, tracked_case_one, advocate_one):
        hearing = Hearing.objects.create(
            case=tracked_case_one,
            hearing_date=date(2025, 5, 20),
            hearing_time=time(10, 30),
            court_hall_number=2,
            item_number=14,
            status="RESCHEDULED",
        )

        events = RealtimeService.publish_hearing_change(
            hearing,
            change_type="RESCHEDULED",
            details={"previous_date": "2025-05-10"},
        )
        assert len(events) == 1
        assert events[0].event_type == "HEARING_RESCHEDULED"
        assert events[0].payload["hearing_id"] == hearing.id
        assert events[0].payload["details"]["previous_date"] == "2025-05-10"

    def test_notification_read_event_emission(self, auth_client_one, advocate_one):
        notif = NotificationHistory.objects.create(
            user=advocate_one,
            title="Hearing Notice",
            body="Hearing scheduled tomorrow",
            category="HEARING_CHANGE",
            is_read=False,
        )

        read_url = reverse("notifications:notification_mark_read", kwargs={"pk": notif.id})
        res = auth_client_one.post(read_url)
        assert res.status_code == status.HTTP_200_OK

        events = RealtimeService.get_events_since(advocate_one, since_id=0)
        read_events = [e for e in events if e.event_type == "NOTIFICATION_READ"]
        assert len(read_events) == 1
        assert read_events[0].payload["read_notification_ids"] == [notif.id]
        assert read_events[0].payload["unread_count"] == 0


@pytest.mark.django_db
class TestCursorReliabilityAndRetention:
    def test_cursor_expired_signals_full_sync(self, auth_client_one, advocate_one):
        ev1 = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"idx": 1})
        RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"idx": 2})

        # Simulate retention pruning of ev1
        RealtimeEvent.objects.filter(id=ev1.id).delete()

        events_url = reverse("notifications:realtime_events")
        # Client requests since_id=1, but oldest available is 2
        res = auth_client_one.get(f"{events_url}?since_id={ev1.id}")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()["data"] if "data" in res.json() else res.json()
        assert data["cursor_expired"] is True
        assert data["requires_full_sync"] is True

    def test_malformed_negative_and_future_cursors(self, auth_client_one, advocate_one):
        RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "present"})
        events_url = reverse("notifications:realtime_events")

        # Negative cursor -> handled as 0
        res_neg = auth_client_one.get(f"{events_url}?since_id=-99")
        assert res_neg.status_code == status.HTTP_200_OK
        data_neg = res_neg.json()["data"] if "data" in res_neg.json() else res_neg.json()
        assert data_neg["since_id"] == 0
        assert data_neg["count"] >= 1

        # Malformed non-integer cursor -> handled as 0
        res_mal = auth_client_one.get(f"{events_url}?since_id=not_an_int")
        assert res_mal.status_code == status.HTTP_200_OK
        data_mal = res_mal.json()["data"] if "data" in res_mal.json() else res_mal.json()
        assert data_mal["since_id"] == 0

        # Future cursor -> empty list and has_more is False
        res_fut = auth_client_one.get(f"{events_url}?since_id=9999999")
        assert res_fut.status_code == status.HTTP_200_OK
        data_fut = res_fut.json()["data"] if "data" in res_fut.json() else res_fut.json()
        assert data_fut["count"] == 0
        assert data_fut["has_more"] is False

    def test_prune_expired_events_retention(self, advocate_one):
        # Create an event and backdate created_at to 35 days ago
        old_event = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "old"})
        RealtimeEvent.objects.filter(id=old_event.id).update(
            created_at=timezone.now() - timedelta(days=35)
        )

        # Create a fresh event
        fresh_event = RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"msg": "fresh"})

        deleted = RealtimeService.prune_expired_events(days=30)
        assert deleted == 1

        remaining = RealtimeEvent.objects.filter(user=advocate_one)
        assert remaining.count() == 1
        assert remaining.first().id == fresh_event.id


@pytest.mark.django_db(transaction=True)
class TestTransactionalAndFallbackReliability:
    def test_transaction_rollback_prevents_redis_broadcast(self, advocate_one):
        mock_redis = MagicMock()
        with patch.object(RealtimeService, "get_redis_client", return_value=mock_redis):
            try:
                with transaction.atomic():
                    RealtimeService.publish_event(advocate_one, "REMINDER_DUE", {"tx": "fail"})
                    raise ValueError("Simulated Rollback")
            except ValueError:
                pass

        # Since transaction rolled back, on_commit did not run and DB row was rolled back
        assert RealtimeEvent.objects.filter(user=advocate_one).count() == 0
        mock_redis.publish.assert_not_called()

    def test_redis_pubsub_disconnection_switches_to_db_fallback(
        self, auth_client_one, advocate_one
    ):
        mock_redis = MagicMock()
        mock_pubsub = MagicMock()
        mock_pubsub.get_message.side_effect = Exception("Redis connection lost")
        mock_redis.pubsub.return_value = mock_pubsub

        with patch.object(RealtimeService, "get_redis_client", return_value=mock_redis):
            stream_url = reverse("notifications:realtime_stream")
            # Connect to stream
            response = auth_client_one.get(f"{stream_url}?max_duration=0")
            assert response.status_code == status.HTTP_200_OK
            chunks = b"".join(list(response.streaming_content)).decode("utf-8")
            assert "event: ping" in chunks
