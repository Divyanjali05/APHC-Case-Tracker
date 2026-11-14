from datetime import time, timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, CaseHistory, Hearing
from apps.notifications.models import NotificationHistory
from apps.notifications.services import NotificationService, PushDeliveryError
from apps.reminders.models import Reminder, ReminderPreference
from apps.reminders.services import ReminderService
from apps.reminders.tasks import check_and_send_due_reminders

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP88882021",
        password="ValidPassword123!",
        first_name="Venkatesh",
        last_name="Prasad",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/8888/2021",
        role="SENIOR",
    )
    return user


@pytest.fixture
def other_advocate(db):
    user = User.objects.create_user(
        username="AP99992022",
        password="ValidPassword456!",
        first_name="Sujatha",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/9999/2022",
        role="ASSOCIATE",
    )
    return user


@pytest.fixture
def advocate_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="8801",
        filing_year=2024,
        petitioner="Coastal Ports Authority",
        respondent="Maritime Workers Union",
        current_stage="HEARING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.fixture
def other_case(db, other_advocate):
    case = Case.objects.create(
        case_type="WA",
        case_number="9901",
        filing_year=2024,
        petitioner="Private Enterprise Ltd",
        respondent="State of AP",
        current_stage="PENDING",
    )
    case.tracked_by.add(other_advocate)
    return case


@pytest.fixture
def auth_client(advocate):
    client = APIClient()
    client.force_authenticate(user=advocate)
    return client


@pytest.fixture
def other_auth_client(other_advocate):
    client = APIClient()
    client.force_authenticate(user=other_advocate)
    return client


@pytest.mark.django_db
class TestHearingRemindersAndRescheduling:
    """Comprehensive verification for Phase 4 hearing reminders and rescheduling."""

    def test_upcoming_hearings_retrieval(self, auth_client, advocate_case):
        """1. Retrieve upcoming hearings excluding completed or past listings."""
        today = timezone.now().date()
        future_date = today + timedelta(days=5)
        past_date = today - timedelta(days=5)

        # Create upcoming hearing
        upcoming_hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=future_date,
            hearing_time=time(10, 45),
            court_hall_number=3,
            item_number=14,
            status="SCHEDULED",
        )
        # Create past hearing
        Hearing.objects.create(
            case=advocate_case,
            hearing_date=past_date,
            hearing_time=time(10, 30),
            court_hall_number=3,
            item_number=5,
            status="COMPLETED",
        )

        url = reverse("cases:upcoming_hearings_list")
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        data = response.data.get("results", response.data)
        assert len(data) == 1
        assert data[0]["id"] == upcoming_hearing.id
        assert data[0]["hearing_date"] == str(future_date)
        assert data[0]["court_hall_number"] == 3
        assert data[0]["case_details"]["formatted_case_number"] == "WP 8801/2024"

    def test_reminder_scheduling_intervals(self, advocate, advocate_case):
        """2. Automatic reminder creation with 24h and 1h intervals."""
        today = timezone.now().date()
        hearing_date = today + timedelta(days=4)
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=hearing_date,
            hearing_time=time(11, 0),
            court_hall_number=4,
            item_number=20,
            status="SCHEDULED",
        )

        reminders = ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)
        interval_reminders = [
            r for r in reminders if r.reminder_interval_hours in (24, 1)
        ]
        assert len(interval_reminders) == 2

        intervals = [r.reminder_interval_hours for r in interval_reminders]
        assert 24 in intervals
        assert 1 in intervals

        for r in reminders:
            assert r.status == "PENDING"
            assert r.case == advocate_case
            assert r.hearing == hearing
            assert r.advocate == advocate

    def test_duplicate_reminder_prevention(self, advocate, advocate_case):
        """3. Idempotent scheduling prevents duplicate reminders for same hearing/interval."""
        today = timezone.now().date()
        hearing_date = today + timedelta(days=3)
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=hearing_date,
            hearing_time=time(10, 30),
            status="SCHEDULED",
        )

        # First run
        reminders_run1 = ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)
        assert len(reminders_run1) == 2

        # Second run (should be idempotent)
        reminders_run2 = ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)
        assert len(reminders_run2) == 0

        total_reminders = Reminder.objects.filter(hearing=hearing, advocate=advocate).count()
        assert total_reminders == 2

    def test_reminder_preference_intervals(self, advocate, advocate_case):
        """4. Respect advocate reminder preferences (e.g. only 24h enabled)."""
        pref = ReminderService.get_or_create_preferences(advocate)
        pref.remind_1h_before = False
        pref.save()

        today = timezone.now().date()
        hearing_date = today + timedelta(days=3)
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=hearing_date,
            hearing_time=time(10, 30),
            status="SCHEDULED",
        )

        reminders = ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)
        assert len(reminders) == 1
        assert reminders[0].reminder_interval_hours == 24

    def test_hearing_rescheduling_workflow(self, auth_client, advocate, advocate_case):
        """5. Reschedule hearing: preserves prior values, updates case, cancels old reminders, records audit history."""
        today = timezone.now().date()
        orig_date = today + timedelta(days=2)
        new_date = today + timedelta(days=6)

        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=orig_date,
            hearing_time=time(10, 30),
            court_hall_number=2,
            item_number=8,
            status="SCHEDULED",
        )
        ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)

        # Verify initial pending reminders
        assert Reminder.objects.filter(hearing=hearing, status="PENDING").count() == 2

        url = reverse(
            "cases:hearing_reschedule", kwargs={"case_id": advocate_case.id, "pk": hearing.id}
        )
        payload = {
            "new_hearing_date": str(new_date),
            "new_hearing_time": "11:30:00",
            "reason": "Bench reconstituted for special matters",
            "court_hall_number": 5,
            "item_number": 12,
        }
        response = auth_client.post(url, payload, format="json")

        assert response.status_code == status.HTTP_200_OK
        hearing.refresh_from_db()

        # A. Hearing model checks
        assert hearing.hearing_date == new_date
        assert hearing.hearing_time == time(11, 30)
        assert hearing.court_hall_number == 5
        assert hearing.status == "RESCHEDULED"
        assert hearing.previous_hearing_date == orig_date
        assert hearing.previous_hearing_time == time(10, 30)
        assert hearing.is_rescheduled is True

        # B. Case next_hearing_date updated
        advocate_case.refresh_from_db()
        assert advocate_case.next_hearing_date == new_date

        # C. Obsolete reminders cancelled
        cancelled_reminders = Reminder.objects.filter(hearing=hearing, status="CANCELLED")
        assert cancelled_reminders.count() == 2

        # D. Fresh pending reminders scheduled for updated date
        new_pending_reminders = Reminder.objects.filter(hearing=hearing, status="PENDING")
        assert new_pending_reminders.count() == 2

        # E. Case History audit event created
        history_entry = CaseHistory.objects.filter(
            case=advocate_case, event_type="HEARING_RESCHEDULED"
        ).first()
        assert history_entry is not None
        assert str(orig_date) in history_entry.old_value
        assert str(new_date) in history_entry.new_value
        assert "Bench reconstituted" in history_entry.description
        assert history_entry.changed_by == advocate

        # F. Notification dispatched
        notification = NotificationHistory.objects.filter(
            user=advocate, category="REMINDER"
        ).first()
        assert notification is not None
        assert "Hearing Rescheduled" in notification.title
        assert str(new_date) in notification.body

    def test_cross_advocate_access_prevention(self, other_auth_client, advocate_case):
        """6. Other advocate cannot access or reschedule another advocate's hearings."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=3),
            status="SCHEDULED",
        )

        reschedule_url = reverse(
            "cases:hearing_reschedule", kwargs={"case_id": advocate_case.id, "pk": hearing.id}
        )
        response = other_auth_client.post(
            reschedule_url,
            {"new_hearing_date": str(today + timedelta(days=7))},
            format="json",
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unauthenticated_access_prevention(self, advocate_case):
        """7. Unauthenticated requests are rejected with 401."""
        client = APIClient()
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=3),
            status="SCHEDULED",
        )

        upcoming_url = reverse("cases:upcoming_hearings_list")
        assert client.get(upcoming_url).status_code == status.HTTP_401_UNAUTHORIZED

        reschedule_url = reverse(
            "cases:hearing_reschedule", kwargs={"case_id": advocate_case.id, "pk": hearing.id}
        )
        assert client.post(reschedule_url, {}).status_code == status.HTTP_401_UNAUTHORIZED

    def test_completed_and_cancelled_hearings_do_not_generate_reminders(
        self, advocate, advocate_case
    ):
        """8. Completed and cancelled hearings do not create reminders."""
        today = timezone.now().date()
        hearing_completed = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=3),
            status="COMPLETED",
        )
        hearing_cancelled = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=4),
            status="CANCELLED",
        )

        assert (
            ReminderService.schedule_hearing_reminders(hearing_completed, advocate=advocate) == []
        )
        assert (
            ReminderService.schedule_hearing_reminders(hearing_cancelled, advocate=advocate) == []
        )

    def test_reschedule_to_past_date_rejected(self, auth_client, advocate_case):
        """9. Rescheduling to a date in the past returns 400 Bad Request."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=2),
            status="SCHEDULED",
        )

        url = reverse(
            "cases:hearing_reschedule", kwargs={"case_id": advocate_case.id, "pk": hearing.id}
        )
        past_date = today - timedelta(days=1)
        response = auth_client.post(url, {"new_hearing_date": str(past_date)}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "new_hearing_date" in str(response.data)

    def test_reminder_dismiss_action(self, auth_client, advocate, advocate_case):
        """10. Mark reminder as dismissed / completed."""
        reminder = Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            title="Submit Vakalatnama",
            due_date=timezone.now() + timedelta(days=1),
            reminder_type="FILING",
            status="PENDING",
            is_completed=False,
        )

        url = reverse("reminders:reminder_dismiss", kwargs={"pk": reminder.id})
        response = auth_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        reminder.refresh_from_db()
        assert reminder.is_completed is True
        assert reminder.status == "DISMISSED"

    def test_celery_task_process_due_reminders_idempotency(self, advocate, advocate_case):
        """11. Celery task dispatches due reminders idempotently without duplicate notifications."""
        # Create a reminder whose due_date is in the past (due now)
        past_due = timezone.now() - timedelta(minutes=5)
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=1),
            hearing_time=time(10, 30),
            status="SCHEDULED",
        )
        reminder = Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 24 Hours",
            due_date=past_due,
            reminder_type="HEARING",
            reminder_interval_hours=24,
            status="PENDING",
        )

        # Run Celery task first time
        processed = check_and_send_due_reminders()
        assert processed == 1

        reminder.refresh_from_db()
        assert reminder.status == "SENT"
        assert reminder.notification_sent_at is not None

        notifications_count = NotificationHistory.objects.filter(
            user=advocate, category="REMINDER"
        ).count()
        assert notifications_count == 1

        # Run Celery task second time (idempotent - should not reprocess or duplicate notification)
        processed_again = check_and_send_due_reminders()
        assert processed_again == 0
        assert NotificationHistory.objects.filter(user=advocate, category="REMINDER").count() == 1

    def test_reminder_preference_api(self, auth_client, advocate):
        """12. Retrieve and update advocate reminder preferences via API."""
        url = reverse("reminders:reminder_preferences")

        # GET preferences
        get_res = auth_client.get(url)
        assert get_res.status_code == status.HTTP_200_OK
        assert get_res.data["remind_24h_before"] is True
        assert get_res.data["remind_1h_before"] is True

        # PATCH preferences
        patch_res = auth_client.patch(url, {"remind_1h_before": False}, format="json")
        assert patch_res.status_code == status.HTTP_200_OK
        assert patch_res.data["remind_1h_before"] is False

        pref = ReminderPreference.objects.get(advocate=advocate)
        assert pref.remind_1h_before is False

    def test_push_delivery_failure_transitions_to_failed_with_retry_counter(
        self, advocate, advocate_case
    ):
        """13. Network/push error transitions reminder to FAILED and increments retry count without losing records."""
        past_due = timezone.now() - timedelta(minutes=5)
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=2),
            status="SCHEDULED",
        )
        reminder = Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 24 Hours",
            due_date=past_due,
            reminder_type="HEARING",
            reminder_interval_hours=24,
            status="PENDING",
        )

        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=PushDeliveryError("Gateway connection timed out"),
        ):
            processed = ReminderService.process_due_reminders()

        assert processed == 0
        reminder.refresh_from_db()
        assert reminder.status == "FAILED"
        assert reminder.retry_count == 1
        assert reminder.notification_sent_at is None

        # Notification history record was preserved in database
        notification = NotificationHistory.objects.filter(
            user=advocate, category="REMINDER", data_payload__reminder_id=reminder.id
        ).first()
        assert notification is not None

    def test_failed_reminder_retry_succeeds_idempotently(self, advocate, advocate_case):
        """14. Retrying a FAILED reminder succeeds and reuses existing notification record without duplication."""
        past_due = timezone.now() - timedelta(minutes=10)
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=2),
            status="SCHEDULED",
        )
        reminder = Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 24 Hours",
            due_date=past_due,
            reminder_type="HEARING",
            reminder_interval_hours=24,
            status="FAILED",
            retry_count=1,
        )

        # Pre-existing notification from first failed attempt
        NotificationHistory.objects.create(
            user=advocate,
            title="Upcoming Hearing Reminder",
            body="Existing notification",
            category="REMINDER",
            data_payload={"reminder_id": reminder.id},
        )
        assert (
            NotificationHistory.objects.filter(
                user=advocate, data_payload__reminder_id=reminder.id
            ).count()
            == 1
        )

        # Retry attempt succeeds
        processed = ReminderService.process_due_reminders()
        assert processed == 1

        reminder.refresh_from_db()
        assert reminder.status == "SENT"
        assert reminder.notification_sent_at is not None

        # Notification history was reused, no duplicates created
        assert (
            NotificationHistory.objects.filter(
                user=advocate, data_payload__reminder_id=reminder.id
            ).count()
            == 1
        )

    def test_reminder_max_retries_exhaustion(self, advocate, advocate_case):
        """15. Reminders exceeding MAX_RETRIES are abandoned and not continuously processed."""
        past_due = timezone.now() - timedelta(minutes=10)
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=2),
            status="SCHEDULED",
        )
        reminder = Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 24 Hours",
            due_date=past_due,
            reminder_type="HEARING",
            reminder_interval_hours=24,
            status="FAILED",
            retry_count=3,  # Reached MAX_RETRIES
        )

        processed = ReminderService.process_due_reminders()
        assert processed == 0

        reminder.refresh_from_db()
        assert reminder.status == "FAILED"
        assert reminder.retry_count == 3

    def test_database_level_duplicate_reminder_prevention(self, advocate, advocate_case):
        """16. Database UniqueConstraint strictly forbids duplicate active reminders for same hearing/interval."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=3),
            status="SCHEDULED",
        )

        Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 24 Hours",
            due_date=timezone.now() + timedelta(days=2),
            reminder_type="HEARING",
            reminder_interval_hours=24,
            status="PENDING",
        )

        # Direct database insert of duplicate must raise IntegrityError
        with pytest.raises(IntegrityError):
            Reminder.objects.create(
                advocate=advocate,
                case=advocate_case,
                hearing=hearing,
                title="Duplicate 24h",
                due_date=timezone.now() + timedelta(days=2),
                reminder_type="HEARING",
                reminder_interval_hours=24,
                status="PENDING",
            )

    def test_hearing_scheduled_short_notice_skips_past_intervals(self, advocate, advocate_case):
        """17. Short-notice hearings: <24h skips 24h interval, <1h skips both intervals."""
        now = timezone.now()
        # Case A: Hearing in 12 hours (tomorrow morning)
        hearing_time_12h = (now + timedelta(hours=12)).time()
        hearing_date_12h = (now + timedelta(hours=12)).date()

        hearing_12h = Hearing.objects.create(
            case=advocate_case,
            hearing_date=hearing_date_12h,
            hearing_time=hearing_time_12h,
            status="SCHEDULED",
        )
        reminders_12h = ReminderService.schedule_hearing_reminders(hearing_12h, advocate=advocate)
        assert len(reminders_12h) == 1
        assert reminders_12h[0].reminder_interval_hours == 1

        # Case B: Hearing in 30 minutes (urgent listing)
        hearing_time_30m = (now + timedelta(minutes=30)).time()
        hearing_date_30m = (now + timedelta(minutes=30)).date()

        hearing_30m = Hearing.objects.create(
            case=advocate_case,
            hearing_date=hearing_date_30m,
            hearing_time=hearing_time_30m,
            status="SCHEDULED",
        )
        reminders_30m = ReminderService.schedule_hearing_reminders(hearing_30m, advocate=advocate)
        assert len(reminders_30m) == 0

    def test_reschedule_hearing_with_previously_sent_reminder(
        self, auth_client, advocate, advocate_case
    ):
        """18. Hearing with previously SENT reminder schedules fresh reminders for the new hearing date."""
        today = timezone.now().date()
        orig_date = today + timedelta(days=1)
        new_date = today + timedelta(days=7)

        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=orig_date,
            hearing_time=time(10, 30),
            status="SCHEDULED",
        )

        # Simulate 24h reminder was already sent yesterday
        Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 24 Hours",
            due_date=timezone.now() - timedelta(hours=1),
            reminder_type="HEARING",
            reminder_interval_hours=24,
            status="SENT",
            notification_sent_at=timezone.now() - timedelta(hours=1),
        )

        # Reschedule appearance to new_date
        url = reverse(
            "cases:hearing_reschedule", kwargs={"case_id": advocate_case.id, "pk": hearing.id}
        )
        res = auth_client.post(
            url,
            {"new_hearing_date": str(new_date), "reason": "Adjourned on request of respondent"},
            format="json",
        )
        assert res.status_code == status.HTTP_200_OK

        # Verify previous sent reminder is preserved as SENT
        sent_reminders = Reminder.objects.filter(
            hearing=hearing, reminder_interval_hours=24, status="SENT"
        )
        assert sent_reminders.count() == 1

        # Verify a new pending 24h reminder was scheduled for the new date
        new_24h_reminders = Reminder.objects.filter(
            hearing=hearing, reminder_interval_hours=24, status="PENDING"
        )
        assert new_24h_reminders.count() == 1
        assert new_24h_reminders.first().due_date.date() == new_date - timedelta(days=1)

    def test_duplicate_processing_status_forbidden_by_database_constraint(
        self, advocate, advocate_case
    ):
        """19. Database constraint forbids inserting active duplicate while another is in PROCESSING state."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=advocate_case,
            hearing_date=today + timedelta(days=4),
            status="SCHEDULED",
        )

        Reminder.objects.create(
            advocate=advocate,
            case=advocate_case,
            hearing=hearing,
            title="Hearing in 1 Hour",
            due_date=timezone.now() + timedelta(days=3),
            reminder_type="HEARING",
            reminder_interval_hours=1,
            status="PROCESSING",
        )

        # Attempting to insert a duplicate active PENDING reminder must raise IntegrityError
        with pytest.raises(IntegrityError):
            Reminder.objects.create(
                advocate=advocate,
                case=advocate_case,
                hearing=hearing,
                title="Duplicate 1h",
                due_date=timezone.now() + timedelta(days=3),
                reminder_type="HEARING",
                reminder_interval_hours=1,
                status="PENDING",
            )
