"""Tests for Phase 4 Friday Hearing Reminder System (TDD).

Business Rules:
- If a hearing is scheduled for Monday, send a reminder on the Friday immediately before that Monday.
- Time: Exactly 72 hours before the scheduled hearing (matching hearing time on Friday).
- Standard 24-hour and 1-hour reminders must continue to function.
- Rescheduled hearings invalidate old pending reminders and schedule new ones.
- Cancelled hearings invalidate pending reminders.
- Duplicate prevention via unique constraint and service idempotency.
- Concurrency and repeated background task safety.
"""

from __future__ import annotations

import concurrent.futures
import datetime
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing
from apps.notifications.models import NotificationHistory
from apps.reminders.models import Reminder
from apps.reminders.services import ReminderService
from apps.reminders.tasks import check_and_send_due_reminders

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP77772023",
        password="SecurePassword123!",
        first_name="Radha",
        last_name="Krishna",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2023",
        role="ADVOCATE",
    )
    return user


@pytest.fixture
def test_case(db, advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="7701",
        filing_year=2026,
        petitioner="State Transport Corp",
        respondent="Employees Federation",
        current_stage="HEARING",
    )
    case.tracked_by.add(advocate)
    return case


@pytest.mark.django_db
class TestFridayHearingReminderSystem:
    """Complete 14 test cases covering Friday hearing reminder business rules."""

    def test_monday_hearing_creates_friday_reminder(self, advocate, test_case):
        """1. Monday hearing creates a Friday reminder (72 hours prior) along with 24h and 1h reminders."""
        # Monday, 9 November 2026 at 10:30 AM
        hearing_date = datetime.date(2026, 11, 9)
        assert hearing_date.weekday() == 0  # 0 = Monday

        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=hearing_date,
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            item_number=12,
            status="SCHEDULED",
        )

        # Freeze time to well before the Friday reminder (e.g. Wednesday, 4 Nov 2026)
        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 4, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        # Verify reminders created
        # Expected: 72h (Friday), 24h (Sunday), 1h (Monday)
        intervals = [r.reminder_interval_hours for r in reminders]
        assert 72 in intervals
        assert 24 in intervals
        assert 1 in intervals

        friday_reminder = next(r for r in reminders if r.reminder_interval_hours == 72)
        assert friday_reminder.status == "PENDING"
        # Due date should be Friday, 6 November 2026 at 10:30 AM
        expected_friday_due = timezone.make_aware(
            datetime.datetime(2026, 11, 6, 10, 30),
            timezone.get_current_timezone(),
        )
        assert friday_reminder.due_date == expected_friday_due
        assert "Friday" in friday_reminder.title or "72 Hours" in friday_reminder.title

    def test_friday_calculation_crosses_month_boundaries(self, advocate, test_case):
        """2. Friday calculation correctly crosses month boundaries."""
        # Monday, 2 November 2026 -> Friday, 30 October 2026
        monday_nov_2 = datetime.date(2026, 11, 2)
        assert monday_nov_2.weekday() == 0

        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=monday_nov_2,
            hearing_time=datetime.time(11, 0),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 10, 20, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        friday_reminder = next(r for r in reminders if r.reminder_interval_hours == 72)
        expected_due = timezone.make_aware(
            datetime.datetime(2026, 10, 30, 11, 0),
            timezone.get_current_timezone(),
        )
        assert friday_reminder.due_date == expected_due
        assert friday_reminder.due_date.date() == datetime.date(2026, 10, 30)

    def test_friday_calculation_crosses_year_boundaries(self, advocate, test_case):
        """3. Friday calculation correctly crosses year boundaries."""
        # Monday, 4 January 2027 -> Friday, 1 January 2027
        monday_jan_4 = datetime.date(2027, 1, 4)
        assert monday_jan_4.weekday() == 0

        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=monday_jan_4,
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 12, 25, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        friday_reminder = next(r for r in reminders if r.reminder_interval_hours == 72)
        expected_due = timezone.make_aware(
            datetime.datetime(2027, 1, 1, 10, 30),
            timezone.get_current_timezone(),
        )
        assert friday_reminder.due_date == expected_due
        assert friday_reminder.due_date.date() == datetime.date(2027, 1, 1)

    def test_rescheduled_monday_hearing_invalidates_old_pending_reminder(self, advocate, test_case):
        """4. Rescheduled Monday hearing invalidates the old pending Friday reminder."""
        # Original: Monday, 9 November 2026
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            ReminderService.schedule_hearing_reminders(hearing)

        old_friday_reminder = Reminder.objects.get(
            hearing=hearing,
            reminder_interval_hours=72,
            status="PENDING",
        )
        assert old_friday_reminder.due_date.date() == datetime.date(2026, 11, 6)

        # Reschedule to Monday, 16 November 2026
        with patch.object(timezone, "now", return_value=freeze_dt):
            ReminderService.reschedule_hearing(
                hearing=hearing,
                new_date=datetime.date(2026, 11, 16),
                new_time=datetime.time(10, 30),
                reason="Bench reconstitution",
            )

        old_friday_reminder.refresh_from_db()
        assert old_friday_reminder.status == "CANCELLED"
        assert "rescheduled" in old_friday_reminder.description.lower()

    def test_rescheduled_hearing_creates_new_friday_reminder(self, advocate, test_case):
        """5. Rescheduled hearing creates a new Friday reminder matching the new Monday date."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            ReminderService.schedule_hearing_reminders(hearing)
            ReminderService.reschedule_hearing(
                hearing=hearing,
                new_date=datetime.date(2026, 11, 16),
                new_time=datetime.time(10, 30),
                reason="Bench reconstitution",
            )

        # Active pending Friday reminder should now be for Friday, 13 November 2026
        new_friday_reminder = Reminder.objects.get(
            hearing=hearing,
            reminder_interval_hours=72,
            status="PENDING",
        )
        expected_new_due = timezone.make_aware(
            datetime.datetime(2026, 11, 13, 10, 30),
            timezone.get_current_timezone(),
        )
        assert new_friday_reminder.due_date == expected_new_due

    def test_cancelled_hearing_invalidates_pending_reminders(self, advocate, test_case):
        """6. Cancelled hearing invalidates all pending reminders and prevents dispatch."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            ReminderService.schedule_hearing_reminders(hearing)

        assert Reminder.objects.filter(hearing=hearing, status="PENDING").count() == 3

        # Cancel hearing
        hearing.status = "CANCELLED"
        hearing.save(update_fields=["status"])
        ReminderService.cancel_pending_hearing_reminders(hearing, reason="Matter disposed")

        assert Reminder.objects.filter(hearing=hearing, status="PENDING").count() == 0
        assert Reminder.objects.filter(hearing=hearing, status="CANCELLED").count() == 3

        # If a reminder is somehow processed while hearing is CANCELLED, it must not dispatch
        due_time = timezone.make_aware(
            datetime.datetime(2026, 11, 6, 11, 0),
            timezone.get_current_timezone(),
        )
        # Even if a cancelled reminder had due_date passed:
        with patch.object(timezone, "now", return_value=due_time):
            processed = ReminderService.process_due_reminders()
        assert processed == 0
        assert NotificationHistory.objects.count() == 0

    def test_duplicate_reminders_are_prevented(self, advocate, test_case):
        """7. Duplicate Friday reminders are prevented on repeated scheduling calls."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            first_run = ReminderService.schedule_hearing_reminders(hearing)
            second_run = ReminderService.schedule_hearing_reminders(hearing)
            third_run = ReminderService.schedule_hearing_reminders(hearing)

        assert len(first_run) == 3
        assert len(second_run) == 0
        assert len(third_run) == 0

        # Exactly 1 active Friday reminder exists
        assert (
            Reminder.objects.filter(
                advocate=advocate,
                hearing=hearing,
                reminder_interval_hours=72,
                status="PENDING",
            ).count()
            == 1
        )

    def test_repeated_background_jobs_do_not_duplicate_notifications(self, advocate, test_case):
        """8. Repeated background jobs do not duplicate notifications for the same Friday reminder."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_schedule = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_schedule):
            ReminderService.schedule_hearing_reminders(hearing)

        # Advance time to Friday, 6 November 2026 at 10:35 AM (past due time)
        freeze_friday = timezone.make_aware(
            datetime.datetime(2026, 11, 6, 10, 35),
            timezone.get_current_timezone(),
        )

        with patch.object(timezone, "now", return_value=freeze_friday):
            # First background job dispatch
            processed_first = check_and_send_due_reminders()
            # Repeated background job dispatch (15 minutes later)
            processed_second = check_and_send_due_reminders()

        # Only the Friday reminder was due at this time (24h and 1h are due on Sunday and Monday)
        assert processed_first == 1
        assert processed_second == 0

        # Ensure exactly 1 NotificationHistory was created
        notifs = NotificationHistory.objects.filter(user=advocate, category="REMINDER")
        assert notifs.count() == 1

        # Check reminder marked SENT
        friday_rem = Reminder.objects.get(hearing=hearing, reminder_interval_hours=72)
        assert friday_rem.status == "SENT"
        assert friday_rem.notification_sent_at is not None

    def test_past_hearings_do_not_generate_inappropriate_reminders(self, advocate, test_case):
        """9. Past hearings or hearings where the Friday date has already elapsed do not generate reminders."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        # Current time is Saturday, 7 Nov 2026 (Friday due time has passed, but 24h & 1h are future)
        freeze_saturday = timezone.make_aware(
            datetime.datetime(2026, 11, 7, 12, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_saturday):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        intervals = [r.reminder_interval_hours for r in reminders]
        assert 72 not in intervals  # Friday reminder omitted because due_date <= now
        assert 24 in intervals  # 24h still in future (Sunday Nov 8 10:30 AM)
        assert 1 in intervals  # 1h still in future (Monday Nov 9 09:30 AM)

    def test_existing_24_hour_reminders_continue_working(self, advocate, test_case):
        """10. Existing 24-hour reminders continue working for Monday and non-Monday hearings."""
        # Non-Monday hearing: Wednesday, 11 November 2026
        wednesday = datetime.date(2026, 11, 11)
        assert wednesday.weekday() == 2  # Wednesday

        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=wednesday,
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 5, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        intervals = [r.reminder_interval_hours for r in reminders]
        assert 24 in intervals
        assert 72 not in intervals  # Wednesday does not get Friday-before reminder

        rem_24 = next(r for r in reminders if r.reminder_interval_hours == 24)
        expected_24 = timezone.make_aware(
            datetime.datetime(2026, 11, 10, 10, 30),
            timezone.get_current_timezone(),
        )
        assert rem_24.due_date == expected_24

    def test_existing_1_hour_reminders_continue_working(self, advocate, test_case):
        """11. Existing 1-hour reminders continue working for Monday and non-Monday hearings."""
        thursday = datetime.date(2026, 11, 12)
        assert thursday.weekday() == 3  # Thursday

        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=thursday,
            hearing_time=datetime.time(14, 0),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 5, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        intervals = [r.reminder_interval_hours for r in reminders]
        assert 1 in intervals
        assert 72 not in intervals

        rem_1 = next(r for r in reminders if r.reminder_interval_hours == 1)
        expected_1 = timezone.make_aware(
            datetime.datetime(2026, 11, 12, 13, 0),
            timezone.get_current_timezone(),
        )
        assert rem_1.due_date == expected_1

    def test_timezone_and_date_boundary_behavior_is_correct(self, advocate, test_case):
        """12. Timezone behavior is consistent with Asia/Kolkata (IST)."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=freeze_dt):
            reminders = ReminderService.schedule_hearing_reminders(hearing)

        friday_rem = next(r for r in reminders if r.reminder_interval_hours == 72)

        # In Asia/Kolkata (+05:30), 10:30 AM is 05:00 UTC
        ist_tz = timezone.get_current_timezone()
        local_due = friday_rem.due_date.astimezone(ist_tz)
        assert local_due.hour == 10
        assert local_due.minute == 30
        assert local_due.strftime("%A") == "Friday"
        assert local_due.date() == datetime.date(2026, 11, 6)

    @pytest.mark.django_db(transaction=True)
    def test_concurrent_scheduling_does_not_create_duplicate_records(self, advocate, test_case):
        """13. Concurrent scheduling execution across multiple threads preserves single record."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        freeze_dt = timezone.make_aware(
            datetime.datetime(2026, 11, 2, 10, 0),
            timezone.get_current_timezone(),
        )

        def worker_schedule():
            with patch.object(timezone, "now", return_value=freeze_dt):
                return ReminderService.schedule_hearing_reminders(hearing)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(worker_schedule) for _ in range(4)]
            concurrent.futures.wait(futures)

        # Total active Friday reminders must be exactly 1
        active_friday_reminders = Reminder.objects.filter(
            advocate=advocate,
            hearing=hearing,
            reminder_interval_hours=72,
            status="PENDING",
        )
        assert active_friday_reminders.count() == 1

    def test_already_sent_reminders_are_not_sent_again(self, advocate, test_case):
        """14. Already-sent reminders are ignored by process_due_reminders."""
        hearing = Hearing.objects.create(
            case=test_case,
            hearing_date=datetime.date(2026, 11, 9),
            hearing_time=datetime.time(10, 30),
            status="SCHEDULED",
        )

        due_time = timezone.make_aware(
            datetime.datetime(2026, 11, 6, 10, 30),
            timezone.get_current_timezone(),
        )

        # Manually create a reminder that is already SENT
        reminder = Reminder.objects.create(
            advocate=advocate,
            case=test_case,
            hearing=hearing,
            title="Friday Hearing Reminder: WP 7701/2026",
            description="Friday appearance notice",
            reminder_type="HEARING",
            reminder_interval_hours=72,
            due_date=due_time,
            status="SENT",
            notification_sent_at=due_time,
        )

        # Time is now past due date
        now_time = timezone.make_aware(
            datetime.datetime(2026, 11, 6, 11, 0),
            timezone.get_current_timezone(),
        )
        with patch.object(timezone, "now", return_value=now_time):
            processed = ReminderService.process_due_reminders()

        assert processed == 0
        reminder.refresh_from_db()
        assert reminder.status == "SENT"
        assert NotificationHistory.objects.count() == 0
