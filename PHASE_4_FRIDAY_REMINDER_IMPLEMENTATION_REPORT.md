# APHC CASE TRACKER — PHASE 4: FRIDAY HEARING REMINDER SYSTEM REPORT

**Date:** 2026-11-04
**Project:** Andhra Pradesh High Court (APHC) Case Tracker
**Scope:** Phase 4 Friday Hearing Reminder System (TDD Implementation & Verification)
**Status:** **PASS**

---

## 1. EXISTING REMINDER ARCHITECTURE

Prior to Phase 4, the APHC Case Tracker scheduled two automated reminders for scheduled hearings:

1. **24-Hour Reminder (`reminder_interval_hours=24`):** Dispatched 24 hours prior to the hearing datetime.
2. **1-Hour Reminder (`reminder_interval_hours=1`):** Dispatched 1 hour prior to the hearing appearance.

The core components involved:

- **`Reminder` Model (`backend/apps/reminders/models.py`):** Stores individual scheduled reminder records linked to `advocate`, `case`, and `hearing`. Enforces a database-level `UniqueConstraint(fields=["advocate", "hearing", "reminder_interval_hours"], condition=Q(status__in=["PENDING", "PROCESSING"]))`.
- **`ReminderPreference` Model:** Stores per-advocate settings for reminder intervals and delivery preferences.
- **`ReminderService` (`backend/apps/reminders/services.py`):** Handles `schedule_hearing_reminders`, `cancel_pending_hearing_reminders`, `reschedule_hearing`, and `process_due_reminders`.
- **`NotificationService` (`backend/apps/notifications/services.py`):** Handles idempotent notification generation (`NotificationHistory`), SSE realtime broadcasting (`REMINDER_DUE`), and push notifications.
- **Celery Beat Periodic Task (`reminders.check_and_send_due_reminders`):** Periodically invokes `ReminderService.process_due_reminders()` with concurrency-safe row-level locking (`select_for_update(skip_locked=True)`).

---

## 2. BUSINESS RULES IMPLEMENTED

1. **Monday-Only Rule:** If a court hearing is scheduled on a Monday (`hearing.hearing_date.weekday() == 0`), an automated reminder is scheduled on the immediately preceding Friday (`hearing.hearing_date - timedelta(days=3)`).
2. **Notification Dispatch Time:** Dispatches at the exact scheduled hearing time on Friday (72 hours prior to Monday's session, matching Indian Standard Time `Asia/Kolkata`), per user clarification.
3. **Preservation of Existing Rules:** Both 24-hour and 1-hour reminders are preserved and scheduled concurrently for all qualifying hearings.
4. **Rescheduled Hearings:**
   - Rescheduling a Monday hearing to another date marks the obsolete pending Friday reminder as `CANCELLED`.
   - If rescheduled to another Monday, a new Friday reminder matching the updated Monday is scheduled.
5. **Cancelled Hearings:**
   - Cancelling a hearing sets all associated active reminders to `status="CANCELLED"`.
   - If a background job evaluates a reminder for a cancelled hearing, it transitions to `CANCELLED` without sending notifications.
6. **Delivery Channels:** Uses the existing notification pipeline (`NotificationHistory` in-app log, SSE realtime event `REMINDER_DUE`, and Expo push notification).
7. **Idempotency & Concurrency:** Protected by database unique constraints, existence checks, and `try ... except IntegrityError` concurrency guards.

---

## 3. FILES CREATED & MODIFIED

### Files Created

- [`backend/tests/integration/test_friday_reminders.py`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/backend/tests/integration/test_friday_reminders.py): Dedicated TDD test suite with 14 comprehensive test cases covering the entire Friday reminder lifecycle.

### Files Modified

- [`backend/apps/reminders/services.py`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/backend/apps/reminders/services.py):
  - Added Friday-before-hearing reminder generation (`reminder_interval_hours=72`) for Monday hearings.
  - Added `IntegrityError` import and exception handling around reminder creation to guarantee thread-safe concurrent scheduling.

---

## 4. DATABASE CHANGES

- **Schema Drift:** **None (`No changes detected`)**.
- **Migrations:** Zero migrations required.
- **Schema Compatibility:** The `Reminder` model already includes `reminder_interval_hours = models.PositiveIntegerField(null=True, blank=True)` and a partial unique constraint `unique_active_hearing_reminder_interval` on `["advocate", "hearing", "reminder_interval_hours"]`. The value `72` integrates seamlessly into this existing schema.

---

## 5. SCHEDULING LOGIC

In `ReminderService.schedule_hearing_reminders()`:

```python
# Friday reminder for Monday hearings (72 hours prior)
if hearing.hearing_date.weekday() == 0:
    due_friday = hearing_dt - datetime.timedelta(days=3)
    if due_friday > now:
        exists_friday = Reminder.objects.filter(
            advocate=adv,
            hearing=hearing,
            reminder_interval_hours=72,
            due_date=due_friday,
            status__in=["PENDING", "PROCESSING", "SENT"],
        ).exists()
        if not exists_friday:
            try:
                reminder_friday = Reminder.objects.create(
                    advocate=adv,
                    case=case,
                    hearing=hearing,
                    title=f"Friday Hearing Reminder: {case_ref}",
                    description=(
                        f"Upcoming Monday court appearance for {case_ref} on {hearing.hearing_date} "
                        f"{f'at {hearing.hearing_time}' if hearing.hearing_time else 'at 10:30 AM'} "
                        f"in Court Hall {hearing.court_hall_number or 'Unassigned'}."
                    ),
                    reminder_type="HEARING",
                    reminder_interval_hours=72,
                    due_date=due_friday,
                    status="PENDING",
                )
                created_reminders.append(reminder_friday)
            except IntegrityError:
                logger.info(
                    "Concurrent Friday reminder creation caught for hearing %s", hearing.id
                )
```

---

## 6. DUPLICATE PREVENTION & CONCURRENCY MECHANISM

1. **Existence Verification:** Pre-checks for any active or already-sent reminder (`status__in=["PENDING", "PROCESSING", "SENT"]`) for the same `(advocate, hearing, 72)`.
2. **Database Unique Constraint:** `models.UniqueConstraint(fields=["advocate", "hearing", "reminder_interval_hours"], condition=models.Q(status__in=["PENDING", "PROCESSING"]))` guarantees that database-level concurrency cannot insert two active Friday reminders for the same hearing and advocate.
3. **IntegrityError Handling:** Traps database collisions when concurrent threads or Celery workers invoke scheduling simultaneously.
4. **Row-Level Locking:** Celery worker dispatch utilizes `Reminder.objects.select_for_update(skip_locked=True)` in `process_due_reminders()`, preventing competing workers from picking up the same due reminder.

---

## 7. RESCHEDULING AND CANCELLATION BEHAVIOR

1. **Rescheduling:**
   - In `ReminderService.reschedule_hearing()`:
     1. Prior to applying changes, calls `cancel_pending_hearing_reminders(hearing)` which transitions all active reminders (`PENDING`, `PROCESSING`, `FAILED`) to `CANCELLED` with an audit description.
     2. Updates hearing date/time and records an audit event in `CaseHistory`.
     3. Calls `schedule_hearing_reminders(hearing)`. If the new date is a Monday, a fresh Friday reminder is scheduled.
2. **Cancellation:**
   - When a hearing is cancelled via API (`HearingViewSet`) or service, `cancel_pending_hearing_reminders()` is triggered.
   - Any reminder evaluated by `process_due_reminders()` performs a safety check against `hearing.status in ("COMPLETED", "CANCELLED")` and cancels the reminder without delivering notifications.

---

## 8. TESTS ADDED (TDD SUITE)

Fourteen tests were added in [`backend/tests/integration/test_friday_reminders.py`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/backend/tests/integration/test_friday_reminders.py):

| Test Case                                                          | Description                                                       |   Result   |
| :----------------------------------------------------------------- | :---------------------------------------------------------------- | :--------: |
| `test_monday_hearing_creates_friday_reminder`                      | Monday hearing generates 72h Friday reminder + 24h & 1h reminders | **PASSED** |
| `test_friday_calculation_crosses_month_boundaries`                 | Nov 2 Monday hearing correctly maps to Oct 30 Friday              | **PASSED** |
| `test_friday_calculation_crosses_year_boundaries`                  | Jan 4 2027 Monday hearing correctly maps to Jan 1 2027 Friday     | **PASSED** |
| `test_rescheduled_monday_hearing_invalidates_old_pending_reminder` | Rescheduling cancels previous Friday reminder                     | **PASSED** |
| `test_rescheduled_hearing_creates_new_friday_reminder`             | Rescheduling to new Monday creates fresh Friday reminder          | **PASSED** |
| `test_cancelled_hearing_invalidates_pending_reminders`             | Cancelled hearing invalidates reminders and prevents dispatch     | **PASSED** |
| `test_duplicate_reminders_are_prevented`                           | Repeated scheduling calls produce 0 duplicate records             | **PASSED** |
| `test_repeated_background_jobs_do_not_duplicate_notifications`     | Repeated Celery Beat runs dispatch exactly 1 notification         | **PASSED** |
| `test_past_hearings_do_not_generate_inappropriate_reminders`       | Past hearings/due dates are skipped safely                        | **PASSED** |
| `test_existing_24_hour_reminders_continue_working`                 | 24h reminders function normally for all hearings                  | **PASSED** |
| `test_existing_1_hour_reminders_continue_working`                  | 1h reminders function normally for all hearings                   | **PASSED** |
| `test_timezone_and_date_boundary_behavior_is_correct`              | Datetime calculations strictly observe `Asia/Kolkata` IST         | **PASSED** |
| `test_concurrent_scheduling_does_not_create_duplicate_records`     | Multi-threaded concurrent execution yields exactly 1 record       | **PASSED** |
| `test_already_sent_reminders_are_not_sent_again`                   | Reminders with `SENT` status are ignored by processor             | **PASSED** |

---

## 9. ACTUAL REGRESSION TEST RESULTS

### Backend Verification

- **Full Backend Pytest Suite:** `pytest -rs -q --disable-warnings`
  - **Result:** **206 passed, 1 skipped in 122.98s**
  - **Baseline Comparison:** Phase 2 baseline (192 passed, 1 skipped) + 14 new Friday reminder tests = 206 passed, 1 skipped (0 regressions).
  - **Skipped Test:** `tests/integration/test_distributed_lock.py:521: Real Redis server not reachable on localhost:6379 (requires active Redis instance)` (expected conditional skip in local environment without active Redis server).
- **Django System Check:** `python manage.py check` -> `System check identified no issues (0 silenced).` (Exit code: 0)
- **Migration Consistency:** `python manage.py makemigrations --check --dry-run` -> `No changes detected` (Exit code: 0)
- **Ruff Linter:** `ruff check .` -> `All checks passed!` (Exit code: 0)

### Frontend Verification

- **Full Frontend Jest Suite:** `npm test -- --watchAll=false`
  - **Result:** **14 test suites passed, 155 tests passed in 11.88s** (0 regressions).
- **TypeScript Compiler:** `npx tsc --noEmit` -> 0 errors (Exit code: 0).
- **Frontend Linter:** `npm run lint -- --max-warnings=0` -> 0 errors, 0 warnings (Exit code: 0).

---

## 10. REMAINING LIMITATIONS & UNRESOLVED QUESTIONS

1. **Clarified Rules (Implemented):**
   - **Friday Notification Time:** Set to 72 hours prior (same time as scheduled appearance on Friday, e.g. 10:30 AM IST).
   - **Notification Channels:** In-app `NotificationHistory`, Realtime SSE event (`REMINDER_DUE`), and Expo push notification per advocate preference.
   - **Scope:** Applied strictly to Monday hearings as specified.
2. **Open Considerations for Future Enhancements:**
   - If advocates later request customizable Friday notification hours (e.g. 5:00 PM evening cause-list summary instead of morning appearance time), an explicit field `friday_reminder_time = models.TimeField(...)` can be added to `ReminderPreference`.
   - If court public holidays fall on Friday, should the reminder shift to Thursday? Currently, it strictly calculates the calendar Friday preceding the Monday hearing.

---

## 11. FINAL STATUS

**Final Verdict:** **PASS**

All 14 acceptance criteria tests and all backend and frontend regression suites passed. Phase 4 is complete and ready for review.
