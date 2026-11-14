"""Integration and unit tests for Daily Agenda, Calendar View, ICS Export, and Synchronization."""

from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.agenda.models import (
    CalendarSyncProvider,
    CalendarSyncSetting,
    CalendarSyncStatus,
    ExternalCalendarEventMap,
)
from apps.agenda.services import AgendaService
from apps.agenda.sync_service import CalendarSyncService
from apps.agenda.tasks import sync_external_calendars
from apps.cases.models import Case, Hearing
from apps.reminders.models import Reminder
from apps.tokens.models import CourtHall, TokenAlertRule

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")


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
def court_hall_1(db):
    return CourtHall.objects.create(
        hall_number=4,
        bench_name="Court Hall 04, Single Bench",
        presiding_judges="Hon'ble Justice Rao",
        is_active=True,
    )


@pytest.fixture
def case_a(db, advocate_a):
    c = Case.objects.create(
        case_type="WP",
        case_number="1234",
        filing_year=2024,
        petitioner="K. Srinivas",
        respondent="State of Andhra Pradesh",
        court_hall_number=4,
        bench="Court Hall 04, Single Bench",
        current_stage="Hearing",
    )
    c.tracked_by.add(advocate_a)
    return c


@pytest.fixture
def case_b(db, advocate_b):
    c = Case.objects.create(
        case_type="WA",
        case_number="5678",
        filing_year=2024,
        petitioner="G. Lakshmi",
        respondent="Union of India",
        court_hall_number=2,
        current_stage="Hearing",
    )
    c.tracked_by.add(advocate_b)
    return c


@pytest.mark.django_db
class TestDailyAgendaAndCalendar:
    """Test suite covering daily agenda aggregation, views, filtering, and isolation."""

    def test_unauthenticated_calendar_access_rejected(self, api_client):
        response = api_client.get("/api/calendar/agenda/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_daily_agenda_success(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            item_number=5,
            status="SCHEDULED",
        )

        response = api_client.get("/api/calendar/agenda/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert data["view"] == "day"
        assert data["timezone"] == "Asia/Kolkata"
        assert data["selected_date"] == today.isoformat()
        assert "summary" in data
        assert data["summary"]["today_hearings"] == 1
        assert len(data["today_hearings"]) == 1
        assert data["today_hearings"][0]["case_id"] == case_a.id
        assert data["today_hearings"][0]["hearing_time"] == "10:30:00"
        assert data["today_hearings"][0]["is_all_day"] is False

    def test_day_view_filtering(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()
        tomorrow = today + datetime.timedelta(days=1)

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(11, 0),
            court_hall_number=4,
            item_number=10,
        )
        Hearing.objects.create(
            case=case_a,
            hearing_date=tomorrow,
            hearing_time=datetime.time(14, 0),
            court_hall_number=4,
            item_number=20,
        )

        # Day view for today
        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}&view=day")
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["start_date"] == today.isoformat()
        assert data["end_date"] == today.isoformat()
        assert len(data["today_hearings"]) == 1
        assert data["today_hearings"][0]["hearing_date"] == today.isoformat()

    def test_week_view_filtering(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            item_number=1,
        )

        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}&view=week")
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Week view spans 7 days (Monday to Sunday)
        start = datetime.date.fromisoformat(data["start_date"])
        end = datetime.date.fromisoformat(data["end_date"])
        assert (end - start).days == 6
        assert "events_by_date" in data
        assert today.isoformat() in data["events_by_date"]

    def test_month_view_filtering(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}&view=month")
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        start = datetime.date.fromisoformat(data["start_date"])
        end = datetime.date.fromisoformat(data["end_date"])
        assert start.day == 1
        assert end.month == start.month

    def test_custom_date_range_filtering(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()
        d_start = today
        d_end = today + datetime.timedelta(days=10)

        response = api_client.get(
            f"/api/calendar/agenda/?start_date={d_start.isoformat()}&end_date={d_end.isoformat()}&view=custom"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["start_date"] == d_start.isoformat()
        assert data["end_date"] == d_end.isoformat()

    def test_hearing_chronological_ordering(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        # Create out of order
        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(14, 30),
            court_hall_number=4,
            item_number=25,
        )
        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            item_number=2,
        )

        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}")
        assert response.status_code == status.HTTP_200_OK
        hearings = response.data["today_hearings"]
        assert len(hearings) == 2
        assert hearings[0]["hearing_time"] == "10:30:00"
        assert hearings[1]["hearing_time"] == "14:30:00"

    def test_all_day_hearings_flag(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=None,  # No time specified
            court_hall_number=4,
            item_number=12,
        )

        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}")
        assert response.status_code == status.HTTP_200_OK
        h = response.data["today_hearings"][0]
        assert h["hearing_time"] is None
        assert h["is_all_day"] is True

    def test_reminders_and_compliance_deadlines_categorization(
        self, api_client, advocate_a, case_a
    ):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()
        dt1 = datetime.datetime.combine(today, datetime.time(11, 0), tzinfo=IST)
        dt2 = datetime.datetime.combine(today, datetime.time(15, 0), tzinfo=IST)

        # Regular reminder
        Reminder.objects.create(
            advocate=advocate_a,
            case=case_a,
            title="Prepare Arguments Note",
            due_date=dt1,
            reminder_type="GENERAL",
        )
        # Compliance deadline
        Reminder.objects.create(
            advocate=advocate_a,
            case=case_a,
            title="File Counter Affidavit",
            due_date=dt2,
            reminder_type="FILING",
        )

        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}")
        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert len(data["reminders"]) == 2
        assert len(data["compliance_deadlines"]) == 1
        assert data["compliance_deadlines"][0]["title"] == "File Counter Affidavit"

    def test_token_events_aggregated(
        self, api_client, advocate_a, case_a, court_hall_1
    ):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        TokenAlertRule.objects.create(
            advocate=advocate_a,
            court_hall=court_hall_1,
            case=case_a,
            hearing_date=today,
            token_number="45",
            listed_item_number=12,
            alert_threshold=3,
        )

        response = api_client.get(f"/api/calendar/agenda/?date={today.isoformat()}")
        assert response.status_code == status.HTTP_200_OK
        tokens = response.data["token_events"]
        assert len(tokens) == 1
        assert tokens[0]["token_number"] == "45"
        assert tokens[0]["court_hall_number"] == 4


@pytest.mark.django_db
class TestPersonalRemindersAPI:
    """Test suite covering advocate personal reminders CRUD and duplicate prevention."""

    def test_personal_reminder_create(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        due = AgendaService.get_ist_now() + datetime.timedelta(days=2)

        payload = {
            "title": "Pay Batta for Notice",
            "due_date": due.isoformat(),
            "description": "Notice to R2 and R3",
            "case_id": case_a.id,
            "reminder_type": "BATTA",
        }

        response = api_client.post("/api/calendar/reminders/", data=payload)
        assert response.status_code == status.HTTP_201_CREATED
        data = response.data
        assert data["title"] == "Pay Batta for Notice"
        assert data["reminder_type"] == "BATTA"
        assert data["case_id"] == case_a.id

    def test_duplicate_reminder_creation_prevented(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        due = AgendaService.get_ist_now().replace(microsecond=0) + datetime.timedelta(days=3)

        payload = {
            "title": "Submit Written Submissions",
            "due_date": due.isoformat(),
            "case_id": case_a.id,
        }

        res1 = api_client.post("/api/calendar/reminders/", data=payload)
        assert res1.status_code == status.HTTP_201_CREATED

        res2 = api_client.post("/api/calendar/reminders/", data=payload)
        assert res2.status_code == status.HTTP_201_CREATED
        assert res2.data["id"] == res1.data["id"]
        assert Reminder.objects.filter(advocate=advocate_a, title="Submit Written Submissions").count() == 1

    def test_personal_reminder_update(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        rem = Reminder.objects.create(
            advocate=advocate_a,
            case=case_a,
            title="Draft Interim Application",
            due_date=AgendaService.get_ist_now(),
        )

        update_payload = {
            "title": "Draft Interim Application (Urgent)",
            "is_completed": True,
        }
        response = api_client.patch(f"/api/calendar/reminders/{rem.id}/", data=update_payload)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["title"] == "Draft Interim Application (Urgent)"
        assert response.data["is_completed"] is True
        assert response.data["status"] == "DISMISSED"

    def test_personal_reminder_delete(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        rem = Reminder.objects.create(
            advocate=advocate_a,
            case=case_a,
            title="Call Client for Signatures",
            due_date=AgendaService.get_ist_now(),
        )

        del_resp = api_client.delete(f"/api/calendar/reminders/{rem.id}/")
        assert del_resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Reminder.objects.filter(id=rem.id).exists()

        get_resp = api_client.get(f"/api/calendar/reminders/{rem.id}/")
        assert get_resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestCalendarIcsExport:
    """Test suite covering RFC 5545 iCalendar generation and formatting."""

    def test_calendar_ics_export_headers_and_structure(
        self, api_client, advocate_a, case_a
    ):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(11, 30),
            court_hall_number=4,
            item_number=8,
        )

        response = api_client.get("/api/calendar/export/ics/")
        assert response.status_code == status.HTTP_200_OK
        assert "text/calendar" in response["Content-Type"]
        assert 'attachment; filename="aphc_agenda_' in response["Content-Disposition"]

        content = response.content.decode("utf-8")
        assert content.startswith("BEGIN:VCALENDAR")
        assert "VERSION:2.0" in content
        assert "PRODID:-//Andhra Pradesh High Court Lawyer App//EN" in content
        assert "END:VCALENDAR" in content

    def test_calendar_ics_vtimezone_and_vevent(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            item_number=14,
        )

        content = CalendarSyncService.generate_ics_calendar(advocate=advocate_a)
        assert "BEGIN:VTIMEZONE" in content
        assert "TZID:Asia/Kolkata" in content
        assert "TZOFFSETTO:+0530" in content
        assert "BEGIN:VEVENT" in content
        assert "UID:hearing-" in content
        assert "SUMMARY:Hearing: WP 1234/2024" in content
        assert "LOCATION:Court Hall 4\\, High Court of Andhra Pradesh\\, Amaravati" in content


@pytest.mark.django_db
class TestCalendarSynchronization:
    """Test suite covering external calendar sync, status, triggering, and disconnect."""

    def test_calendar_sync_status_default(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        response = api_client.get("/api/calendar/sync/status/")
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["sync_enabled"] is False
        assert data["provider"] == CalendarSyncProvider.NONE
        assert data["sync_status"] == CalendarSyncStatus.IDLE

    def test_calendar_sync_connect_and_trigger(self, api_client, advocate_a, case_a):
        api_client.force_authenticate(user=advocate_a)
        today = AgendaService.get_ist_today()

        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            court_hall_number=4,
            item_number=5,
        )

        # Connect
        connect_payload = {
            "provider": "GOOGLE",
            "sync_enabled": True,
            "google_account_email": "advocate.ap@gmail.com",
            "google_access_token": "mock_access_token_12345",
        }
        conn_res = api_client.post("/api/calendar/sync/connect/", data=connect_payload)
        assert conn_res.status_code == status.HTTP_200_OK
        assert conn_res.data["provider"] == "GOOGLE"
        assert conn_res.data["google_account_email"] == "advocate.ap@gmail.com"

        # Trigger Sync
        sync_res = api_client.post("/api/calendar/sync/trigger/")
        assert sync_res.status_code == status.HTTP_200_OK
        assert sync_res.data["status"] == "SUCCESS"
        assert sync_res.data["synced_count"] >= 1

        # Check mapping created
        mapping = ExternalCalendarEventMap.objects.filter(
            advocate=advocate_a, provider="GOOGLE"
        ).first()
        assert mapping is not None

    def test_calendar_sync_disconnect(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)

        # Set up active setting
        setting = CalendarSyncSetting.objects.create(
            advocate=advocate_a,
            sync_enabled=True,
            provider=CalendarSyncProvider.GOOGLE,
            google_account_email="advocate@gmail.com",
            google_access_token="token_abc",
        )
        ExternalCalendarEventMap.objects.create(
            advocate=advocate_a,
            event_type="HEARING",
            provider="GOOGLE",
            external_event_id="ext_event_1",
        )

        response = api_client.post("/api/calendar/sync/disconnect/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "DISCONNECTED"

        setting.refresh_from_db()
        assert setting.sync_enabled is False
        assert setting.provider == CalendarSyncProvider.NONE
        assert setting.google_access_token == ""
        assert not ExternalCalendarEventMap.objects.filter(advocate=advocate_a).exists()

    def test_celery_sync_task_execution(self, advocate_a, case_a):
        CalendarSyncSetting.objects.create(
            advocate=advocate_a,
            sync_enabled=True,
            provider=CalendarSyncProvider.GOOGLE,
            google_account_email="advocate@example.com",
        )
        result = sync_external_calendars(advocate_id=advocate_a.id)
        assert result["advocate_id"] == advocate_a.id
        assert result["result"]["status"] == "SUCCESS"


@pytest.mark.django_db
class TestAdvocateMultiTenantIsolation:
    """Ensure strict multi-tenant advocate isolation for calendar, reminders, and sync."""

    def test_advocate_multi_tenant_isolation(
        self, api_client, advocate_a, advocate_b, case_a, case_b
    ):
        today = AgendaService.get_ist_today()

        # Advocate A hearing & reminder
        Hearing.objects.create(
            case=case_a,
            hearing_date=today,
            court_hall_number=4,
            item_number=1,
        )
        Reminder.objects.create(
            advocate=advocate_a,
            case=case_a,
            title="Advocate A Secret Note",
            due_date=AgendaService.get_ist_now(),
        )

        # Advocate B hearing & reminder
        Hearing.objects.create(
            case=case_b,
            hearing_date=today,
            court_hall_number=2,
            item_number=3,
        )
        rem_b = Reminder.objects.create(
            advocate=advocate_b,
            case=case_b,
            title="Advocate B Secret Note",
            due_date=AgendaService.get_ist_now(),
        )

        # 1. Advocate A checks agenda
        api_client.force_authenticate(user=advocate_a)
        res_a = api_client.get("/api/calendar/agenda/")
        assert res_a.status_code == status.HTTP_200_OK
        titles_a = [h["case_id"] for h in res_a.data["today_hearings"]]
        assert case_a.id in titles_a
        assert case_b.id not in titles_a

        rem_titles_a = [r["title"] for r in res_a.data["reminders"]]
        assert "Advocate A Secret Note" in rem_titles_a
        assert "Advocate B Secret Note" not in rem_titles_a

        # 2. Advocate A cannot access or modify Advocate B's reminder
        get_b = api_client.get(f"/api/calendar/reminders/{rem_b.id}/")
        assert get_b.status_code == status.HTTP_404_NOT_FOUND

        patch_b = api_client.patch(
            f"/api/calendar/reminders/{rem_b.id}/",
            data={"title": "Hacked Title"},
        )
        assert patch_b.status_code == status.HTTP_404_NOT_FOUND

        del_b = api_client.delete(f"/api/calendar/reminders/{rem_b.id}/")
        assert del_b.status_code == status.HTTP_404_NOT_FOUND
        assert Reminder.objects.filter(id=rem_b.id).exists()
