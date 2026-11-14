from datetime import date, time, timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing, Judgment
from apps.notifications.models import DeviceRegistration, NotificationHistory
from apps.notifications.services import (
    NotificationService,
    PermanentPushDeliveryError,
    TemporaryPushDeliveryError,
)
from apps.notifications.tasks import retry_failed_push_notifications
from apps.reminders.models import Reminder, ReminderPreference
from apps.reminders.services import ReminderService

User = get_user_model()


@pytest.fixture
def advocate(db):
    user = User.objects.create_user(
        username="AP77772021",
        password="ValidPassword123!",
        first_name="Kalyan",
        last_name="Chakravarthy",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7777/2021",
        role="SENIOR",
    )
    ReminderPreference.objects.create(
        advocate=user,
        push_notifications=True,
        judgment_push_notifications=True,
        hearing_change_push_notifications=True,
    )
    DeviceRegistration.objects.create(
        user=user,
        expo_push_token="ExponentPushToken[advocate_kalyan_token]",
        platform="android",
        device_name="Pixel 8 Pro",
    )
    return user


@pytest.fixture
def second_tracking_advocate(db):
    user = User.objects.create_user(
        username="AP66662021",
        password="ValidPassword666!",
        first_name="Radha",
        last_name="Krishna",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/6666/2021",
        role="ASSOCIATE",
    )
    ReminderPreference.objects.create(
        advocate=user,
        push_notifications=True,
        judgment_push_notifications=True,
        hearing_change_push_notifications=True,
    )
    DeviceRegistration.objects.create(
        user=user,
        expo_push_token="ExponentPushToken[second_advocate_token]",
        platform="ios",
        device_name="iPhone 15",
    )
    return user


@pytest.fixture
def non_tracking_advocate(db):
    user = User.objects.create_user(
        username="AP99992021",
        password="ValidPassword999!",
        first_name="Sunita",
        last_name="Rao",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/9999/2021",
        role="ASSOCIATE",
    )
    ReminderPreference.objects.create(
        advocate=user,
        push_notifications=True,
        judgment_push_notifications=True,
        hearing_change_push_notifications=True,
    )
    DeviceRegistration.objects.create(
        user=user,
        expo_push_token="ExponentPushToken[non_tracking_token]",
        platform="android",
    )
    return user


@pytest.fixture
def auth_client(advocate):
    client = APIClient()
    client.force_authenticate(user=advocate)
    return client


@pytest.fixture
def non_tracking_client(non_tracking_advocate):
    client = APIClient()
    client.force_authenticate(user=non_tracking_advocate)
    return client


@pytest.fixture
def tracked_case(db, advocate, second_tracking_advocate):
    case = Case.objects.create(
        case_type="WP",
        case_number="9100",
        filing_year=2024,
        petitioner="Amaravati Farmers Association",
        respondent="CRDA & State of AP",
        current_stage="HEARING",
    )
    case.tracked_by.add(advocate, second_tracking_advocate)
    return case


@pytest.mark.django_db
class TestJudgmentPushNotifications:
    """Test suite for Phase 6 Judgment and Order push notifications."""

    def test_judgment_creation_triggers_push_notification_to_tracking_advocates(
        self, auth_client, advocate, second_tracking_advocate, non_tracking_advocate, tracked_case
    ):
        """1. When a judgment is posted, push notifications are dispatched to all tracking advocates only."""
        url = reverse("cases:judgment_list_create", kwargs={"case_id": tracked_case.id})
        payload = {
            "judgment_date": str(date.today()),
            "judgment_type": "FINAL",
            "order_number": "OR-2024-9100",
            "bench": "Hon'ble CJ & Justice Rao",
            "summary": "Writ petition allowed with directions to the CRDA.",
            "document_link": "https://aphc.gov.in/orders/2024/wp9100_final.pdf",
        }

        response = auth_client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED

        # Verify tracking advocate 1 received notification
        notif1 = NotificationHistory.objects.filter(
            user=advocate,
            category="JUDGMENT",
            data_payload__case_id=tracked_case.id,
        ).first()
        assert notif1 is not None
        assert "Judgment Pronounced" in notif1.title
        assert "WP 9100/2024" in notif1.title
        assert notif1.data_payload["event"] == "PRONOUNCED"
        assert notif1.data_payload["order_number"] == "OR-2024-9100"
        assert notif1.is_read is False

        # Verify tracking advocate 2 received notification
        notif2 = NotificationHistory.objects.filter(
            user=second_tracking_advocate,
            category="JUDGMENT",
            data_payload__case_id=tracked_case.id,
        ).first()
        assert notif2 is not None
        assert "Judgment Pronounced" in notif2.title

        # Verify non-tracking advocate received NO notification
        notif_other = NotificationHistory.objects.filter(
            user=non_tracking_advocate,
            data_payload__case_id=tracked_case.id,
        ).first()
        assert notif_other is None

    def test_judgment_notification_idempotency(self, advocate, tracked_case):
        """2. Retrying judgment notification dispatch does not create duplicate entries."""
        judgment = Judgment.objects.create(
            case=tracked_case,
            judgment_date=date.today(),
            judgment_type="INTERIM",
            order_number="IA-1-2024",
            summary="Interim stay granted.",
        )

        # Dispatch 1
        first_run = NotificationService.send_judgment_notification(judgment, is_new=True)
        assert len(first_run) == 2  # advocate and second_tracking_advocate

        initial_count = NotificationHistory.objects.filter(
            category="JUDGMENT",
            data_payload__judgment_id=judgment.id,
        ).count()
        assert initial_count == 2

        # Dispatch 2 (retry)
        second_run = NotificationService.send_judgment_notification(judgment, is_new=True)
        assert len(second_run) == 2

        after_count = NotificationHistory.objects.filter(
            category="JUDGMENT",
            data_payload__judgment_id=judgment.id,
        ).count()
        assert after_count == 2  # Idempotent: no duplicate notifications created

    def test_order_document_upload_triggers_push_notification(
        self, auth_client, advocate, tracked_case
    ):
        """3. Uploading certified order document triggers specific document-ready push alert."""
        judgment = Judgment.objects.create(
            case=tracked_case,
            judgment_date=date.today(),
            judgment_type="FINAL",
            order_number="OR-999",
            summary="Directions issued.",
            document_link="",
        )

        url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": tracked_case.id, "pk": judgment.id},
        )
        doc_url = "https://aphc.gov.in/orders/2024/certified_copy_999.pdf"
        response = auth_client.patch(url, {"document_link": doc_url}, format="json")
        assert response.status_code == status.HTTP_200_OK

        doc_notif = NotificationHistory.objects.filter(
            user=advocate,
            category="JUDGMENT",
            data_payload__judgment_id=judgment.id,
            data_payload__event="DOCUMENT_UPLOADED",
        ).first()
        assert doc_notif is not None
        assert "Order Document Available" in doc_notif.title
        assert doc_notif.data_payload["document_link"] == doc_url
        assert doc_notif.data_payload["has_document"] is True

    def test_judgment_preference_suppression(self, auth_client, advocate, tracked_case):
        """4. Disabling judgment_push_notifications suppresses judgment pushes."""
        pref = advocate.reminder_preferences
        pref.judgment_push_notifications = False
        pref.save()

        url = reverse("cases:judgment_list_create", kwargs={"case_id": tracked_case.id})
        response = auth_client.post(
            url,
            {
                "judgment_date": str(date.today()),
                "judgment_type": "FINAL",
                "summary": "Writ dismissed.",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="JUDGMENT",
            data_payload__case_id=tracked_case.id,
        ).first()
        assert notif is None  # Suppressed by preference


@pytest.mark.django_db
class TestHearingChangePushNotifications:
    """Test suite for Phase 6 Hearing Change push notifications."""

    def test_hearing_rescheduled_via_detail_view_triggers_push_and_reschedules_reminders(
        self, auth_client, advocate, second_tracking_advocate, tracked_case
    ):
        """5. Direct update to hearing date triggers RESCHEDULED notification and updates reminders."""
        today = timezone.now().date()
        orig_date = today + timedelta(days=2)
        new_date = today + timedelta(days=7)

        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=orig_date,
            hearing_time=time(10, 30),
            court_hall_number=3,
            item_number=5,
            status="SCHEDULED",
        )
        ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)
        assert Reminder.objects.filter(hearing=hearing, status="PENDING").count() == 2

        url = reverse(
            "cases:case_hearing_detail",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.patch(
            url,
            {
                "hearing_date": str(new_date),
                "hearing_time": "14:15:00",
                "rescheduled_reason": "Bench unavailable in morning session",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        # Verify notification created
        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="HEARING_CHANGE",
            data_payload__hearing_id=hearing.id,
            data_payload__change_type="RESCHEDULED",
        ).first()
        assert notif is not None
        assert "Hearing Rescheduled" in notif.title
        assert str(new_date) in notif.body
        assert notif.data_payload["new_date"] == str(new_date)

        # Verify old reminders cancelled and fresh reminders scheduled for advocate
        cancelled = Reminder.objects.filter(
            hearing=hearing, advocate=advocate, status="CANCELLED"
        ).count()
        assert cancelled == 2
        fresh = Reminder.objects.filter(
            hearing=hearing, advocate=advocate, status="PENDING"
        ).count()
        assert fresh == 2

    def test_hearing_cancelled_triggers_push_and_cancels_reminders(
        self, auth_client, advocate, tracked_case
    ):
        """6. Updating status to CANCELLED triggers CANCELLED push and invalidates reminders."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=today + timedelta(days=3),
            hearing_time=time(10, 30),
            status="SCHEDULED",
        )
        ReminderService.schedule_hearing_reminders(hearing, advocate=advocate)

        url = reverse(
            "cases:case_hearing_detail",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.patch(url, {"status": "CANCELLED"}, format="json")
        assert response.status_code == status.HTTP_200_OK

        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="HEARING_CHANGE",
            data_payload__hearing_id=hearing.id,
            data_payload__change_type="CANCELLED",
        ).first()
        assert notif is not None
        assert "Hearing Cancelled" in notif.title

        cancelled = Reminder.objects.filter(hearing=hearing, status="CANCELLED").count()
        assert cancelled == 2

    def test_hearing_adjourned_triggers_push_notification(
        self, auth_client, advocate, tracked_case
    ):
        """7. Updating hearing next_date triggers ADJOURNED push."""
        today = timezone.now().date()
        next_d = today + timedelta(days=14)
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=today,
            status="SCHEDULED",
        )

        url = reverse(
            "cases:case_hearing_detail",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.patch(
            url,
            {"next_date": str(next_d), "business_conducted": "Matter adjourned for counter."},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="HEARING_CHANGE",
            data_payload__hearing_id=hearing.id,
            data_payload__change_type="ADJOURNED",
        ).first()
        assert notif is not None
        assert "Matter Adjourned" in notif.title
        assert str(next_d) in notif.body
        assert notif.data_payload["next_date"] == str(next_d)

    def test_hearing_court_hall_relocated_triggers_push(self, auth_client, advocate, tracked_case):
        """8. Relocating court hall or item number triggers COURT_HALL_CHANGED push."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=today + timedelta(days=1),
            court_hall_number=2,
            item_number=4,
            status="SCHEDULED",
        )

        url = reverse(
            "cases:case_hearing_detail",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.patch(
            url,
            {"court_hall_number": 7, "item_number": 19},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="HEARING_CHANGE",
            data_payload__hearing_id=hearing.id,
            data_payload__change_type="COURT_HALL_CHANGED",
        ).first()
        assert notif is not None
        assert "Court Hall Updated" in notif.title
        assert "Court Hall 7" in notif.body
        assert "Item #19" in notif.body

    def test_hearing_proceedings_recorded_triggers_push(self, auth_client, advocate, tracked_case):
        """9. Recording post-appearance business conducted triggers PROCEEDINGS_RECORDED push."""
        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=today,
            status="COMPLETED",
        )

        url = reverse(
            "cases:case_hearing_detail",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.patch(
            url,
            {
                "business_conducted": "Senior Counsel Shri Rao argued for petitioner. Counter directed within 2 weeks."
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="HEARING_CHANGE",
            data_payload__hearing_id=hearing.id,
            data_payload__change_type="PROCEEDINGS_RECORDED",
        ).first()
        assert notif is not None
        assert "Proceedings Recorded" in notif.title
        assert "argued for petitioner" in notif.body

    def test_hearing_change_preference_suppression(self, auth_client, advocate, tracked_case):
        """10. Disabling hearing_change_push_notifications suppresses hearing pushes."""
        pref = advocate.reminder_preferences
        pref.hearing_change_push_notifications = False
        pref.save()

        today = timezone.now().date()
        hearing = Hearing.objects.create(
            case=tracked_case,
            hearing_date=today + timedelta(days=2),
            status="SCHEDULED",
        )

        url = reverse(
            "cases:case_hearing_detail",
            kwargs={"case_id": tracked_case.id, "pk": hearing.id},
        )
        response = auth_client.patch(
            url,
            {"hearing_date": str(today + timedelta(days=5))},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

        notif = NotificationHistory.objects.filter(
            user=advocate,
            category="HEARING_CHANGE",
            data_payload__hearing_id=hearing.id,
        ).first()
        assert notif is None  # Suppressed by preference


@pytest.mark.django_db
class TestNotificationHistoryAndReadEndpoints:
    """Test suite for in-app notification queries, category filtering, and read status management."""

    def test_history_category_and_read_filtering(self, auth_client, advocate, tracked_case):
        """11. NotificationHistoryListView filters by category and is_read status."""
        # Create test notifications
        NotificationHistory.objects.create(
            user=advocate,
            title="Judgment 1",
            body="Final judgment",
            category="JUDGMENT",
            is_read=False,
            data_payload={"case_id": tracked_case.id},
        )
        NotificationHistory.objects.create(
            user=advocate,
            title="Hearing Change 1",
            body="Hearing rescheduled",
            category="HEARING_CHANGE",
            is_read=True,
            data_payload={"case_id": tracked_case.id},
        )
        NotificationHistory.objects.create(
            user=advocate,
            title="Reminder 1",
            body="Hearing tomorrow",
            category="REMINDER",
            is_read=False,
            data_payload={"case_id": 9999},
        )

        url = reverse("notifications:notification_history")

        # A. Filter category=JUDGMENT
        res_cat = auth_client.get(f"{url}?category=JUDGMENT")
        assert res_cat.status_code == status.HTTP_200_OK
        results = (
            res_cat.data if isinstance(res_cat.data, list) else res_cat.data.get("results", [])
        )
        assert len(results) == 1
        assert results[0]["title"] == "Judgment 1"

        # B. Filter category=HEARING_CHANGE
        res_hc = auth_client.get(f"{url}?category=HEARING_CHANGE")
        assert res_hc.status_code == status.HTTP_200_OK
        results_hc = (
            res_hc.data if isinstance(res_hc.data, list) else res_hc.data.get("results", [])
        )
        assert len(results_hc) == 1
        assert results_hc[0]["title"] == "Hearing Change 1"

        # C. Filter is_read=false
        res_unread = auth_client.get(f"{url}?is_read=false")
        assert res_unread.status_code == status.HTTP_200_OK
        results_unread = (
            res_unread.data
            if isinstance(res_unread.data, list)
            else res_unread.data.get("results", [])
        )
        assert len(results_unread) == 2

        # D. Filter is_read=true
        res_read = auth_client.get(f"{url}?is_read=true")
        assert res_read.status_code == status.HTTP_200_OK
        results_read = (
            res_read.data if isinstance(res_read.data, list) else res_read.data.get("results", [])
        )
        assert len(results_read) == 1
        assert results_read[0]["title"] == "Hearing Change 1"

        # E. Filter case_id
        res_case = auth_client.get(f"{url}?case_id={tracked_case.id}")
        assert res_case.status_code == status.HTTP_200_OK
        results_case = (
            res_case.data if isinstance(res_case.data, list) else res_case.data.get("results", [])
        )
        assert len(results_case) == 2

    def test_mark_single_notification_read(
        self, auth_client, advocate, non_tracking_client, non_tracking_advocate
    ):
        """12. POST /api/notifications/<pk>/read/ marks notification as read; enforces ownership."""
        notif = NotificationHistory.objects.create(
            user=advocate,
            title="Unread Judgment",
            body="Body text",
            category="JUDGMENT",
            is_read=False,
        )

        # Other advocate cannot mark as read
        url = reverse("notifications:notification_mark_read", kwargs={"pk": notif.id})
        res_other = non_tracking_client.post(url)
        assert res_other.status_code == status.HTTP_404_NOT_FOUND
        notif.refresh_from_db()
        assert notif.is_read is False

        # Owner marks as read
        res_owner = auth_client.post(url)
        assert res_owner.status_code == status.HTTP_200_OK
        assert res_owner.data["is_read"] is True
        notif.refresh_from_db()
        assert notif.is_read is True

    def test_mark_all_notifications_read(self, auth_client, advocate, non_tracking_advocate):
        """13. POST /api/notifications/mark-all-read/ marks advocate's unread notifications as read."""
        NotificationHistory.objects.create(
            user=advocate,
            title="Notif 1",
            body="Body 1",
            category="JUDGMENT",
            is_read=False,
        )
        NotificationHistory.objects.create(
            user=advocate,
            title="Notif 2",
            body="Body 2",
            category="HEARING_CHANGE",
            is_read=False,
        )
        # Other advocate's unread notification
        other_notif = NotificationHistory.objects.create(
            user=non_tracking_advocate,
            title="Other Notif",
            body="Body Other",
            category="JUDGMENT",
            is_read=False,
        )

        url = reverse("notifications:notification_mark_all_read")
        response = auth_client.post(url, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["marked_read_count"] == 2

        # Verify advocate notifications are read
        assert NotificationHistory.objects.filter(user=advocate, is_read=False).count() == 0

        # Verify other advocate notification remains unread
        other_notif.refresh_from_db()
        assert other_notif.is_read is False

    def test_mark_all_read_scoped_by_category(self, auth_client, advocate):
        """14. POST /api/notifications/mark-all-read/ with category parameter marks only that category."""
        NotificationHistory.objects.create(
            user=advocate,
            title="Judgment Alert",
            body="Final order",
            category="JUDGMENT",
            is_read=False,
        )
        NotificationHistory.objects.create(
            user=advocate,
            title="Hearing Alert",
            body="Rescheduled",
            category="HEARING_CHANGE",
            is_read=False,
        )

        url = reverse("notifications:notification_mark_all_read")
        response = auth_client.post(url, {"category": "JUDGMENT"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["marked_read_count"] == 1

        assert (
            NotificationHistory.objects.filter(
                user=advocate, category="JUDGMENT", is_read=True
            ).count()
            == 1
        )
        assert (
            NotificationHistory.objects.filter(
                user=advocate, category="HEARING_CHANGE", is_read=False
            ).count()
            == 1
        )


@pytest.mark.django_db
@pytest.mark.django_db
class TestNotificationDeliveryReliabilityAndEdgeCases:
    """Rigorous audit tests for push notification delivery reliability, retries, and device handling."""

    def test_expo_temporary_failure_marks_failed_status_and_persists_history(
        self, advocate, tracked_case
    ):
        """1. Temporary Expo gateway timeout records FAILED delivery status and persists history."""
        judgment = Judgment.objects.create(
            case=tracked_case,
            judgment_date=date(2026, 11, 1),
            judgment_type="ORDER",
            order_number="WP-7711/2026",
            summary="Interim stay granted.",
        )

        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("HTTP 504 Gateway Timeout connecting to Expo"),
        ):
            notifications = NotificationService.send_judgment_notification(judgment, is_new=True)

        advocate_notifs = [n for n in notifications if n.user == advocate]
        assert len(advocate_notifs) == 1
        notif = advocate_notifs[0]
        notif.refresh_from_db()

        # Notification history was persisted BEFORE external delivery attempt
        assert notif.pk is not None
        assert notif.category == "JUDGMENT"
        assert notif.data_payload.get("delivery_status") == "FAILED"
        assert notif.data_payload.get("failure_type") == "TEMPORARY"
        assert notif.data_payload.get("retry_count") == 1
        assert "504 Gateway Timeout" in notif.data_payload.get("last_error", "")

    def test_bounded_retries_transition_to_permanent_failure(self, advocate, tracked_case):
        """2. Retries are strictly bounded at MAX_RETRIES (3) before transitioning to PERMANENT_FAILURE."""
        case = Case.objects.create(
            case_type="WP",
            case_number="9112",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 2),
            judgment_type="JUDGMENT",
            order_number="WP-7712/2026",
            summary="Directions issued.",
        )

        # Initial attempt fails -> retry_count = 1
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("Network connection reset"),
        ):
            notifications = NotificationService.send_judgment_notification(judgment, is_new=True)

        assert len(notifications) == 1
        notif = notifications[0]
        notif.refresh_from_db()
        assert notif.data_payload.get("retry_count") == 1
        assert notif.data_payload.get("delivery_status") == "FAILED"

        # 2nd attempt via retry_failed_notifications -> retry_count = 2
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("Network connection reset"),
        ):
            recovered = NotificationService.retry_failed_notifications()

        assert recovered == 0
        notif.refresh_from_db()
        assert notif.data_payload.get("retry_count") == 2
        assert notif.data_payload.get("delivery_status") == "FAILED"

        # 3rd attempt reaches MAX_RETRIES (3) -> transitions to PERMANENT_FAILURE
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("Network connection reset"),
        ):
            recovered = NotificationService.retry_failed_notifications()

        assert recovered == 0
        notif.refresh_from_db()
        assert notif.data_payload.get("retry_count") == 3
        assert notif.data_payload.get("delivery_status") == "PERMANENT_FAILURE"

        # Subsequent retry scan ignores permanently failed notifications
        with patch.object(NotificationService, "dispatch_push_to_devices") as mock_dispatch:
            recovered = NotificationService.retry_failed_notifications()
            assert recovered == 0
            mock_dispatch.assert_not_called()

    def test_successful_retry_via_celery_task_updates_status_without_duplicate_records(
        self, advocate
    ):
        """3. Celery retry task delivers failed push in-place without creating duplicate NotificationHistory."""
        case = Case.objects.create(
            case_type="WP",
            case_number="9113",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 3),
            judgment_type="ORDER",
            order_number="WP-7713/2026",
        )

        # Initial push fails
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("Temporary Expo rate limit 429"),
        ):
            NotificationService.send_judgment_notification(judgment, is_new=True)

        assert NotificationHistory.objects.filter(user=advocate).count() == 1
        notif = NotificationHistory.objects.filter(user=advocate).first()
        assert notif.data_payload.get("delivery_status") == "FAILED"

        # Celery periodic task executes and push now succeeds
        with patch.object(NotificationService, "dispatch_push_to_devices", return_value=1):
            recovered_count = retry_failed_push_notifications()

        assert recovered_count == 1
        notif.refresh_from_db()
        assert notif.data_payload.get("delivery_status") == "DELIVERED"
        assert notif.data_payload.get("dispatched_at") is not None
        # Strict idempotency: no duplicate records
        assert NotificationHistory.objects.filter(user=advocate).count() == 1

    def test_permanent_delivery_failure_deactivates_unregistered_device(self, advocate):
        """4. DeviceNotRegistered error deactivates the device and marks delivery PERMANENT_FAILURE."""
        device = DeviceRegistration.objects.get(user=advocate)
        assert device.is_active is True

        case = Case.objects.create(
            case_type="WP",
            case_number="9114",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 4),
            judgment_type="ORDER",
        )

        # Expo reports token is invalid / unregistered
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=PermanentPushDeliveryError(f"DeviceNotRegistered on device {device.id}"),
        ):
            notifications = NotificationService.send_judgment_notification(judgment, is_new=True)

        assert len(notifications) == 1
        notif = notifications[0]
        notif.refresh_from_db()
        assert notif.data_payload.get("delivery_status") == "PERMANENT_FAILURE"
        assert notif.data_payload.get("failure_type") == "PERMANENT"

    def test_dispatch_deactivates_unregistered_device_in_live_dispatch(self, advocate):
        """5. Live dispatch logic deactivates device when DeviceNotRegistered is thrown."""
        device = DeviceRegistration.objects.get(user=advocate)
        assert device.is_active is True

        with patch("logging.Logger.info", side_effect=Exception("DeviceNotRegistered")):
            with pytest.raises(PermanentPushDeliveryError):
                NotificationService.dispatch_push_to_devices(
                    user=advocate,
                    title="Test Title",
                    body="Test Body",
                )

        device.refresh_from_db()
        assert device.is_active is False

    def test_multiple_devices_delivers_to_valid_and_deactivates_invalid(self, advocate):
        """6. Multiple devices: delivers to valid device while deactivating invalid token device."""
        # Add a second device with an invalid format token
        bad_device = DeviceRegistration.objects.create(
            user=advocate,
            expo_push_token="invalid_token_format_1234",
            platform="ios",
            is_active=True,
        )
        good_device = DeviceRegistration.objects.get(
            user=advocate, expo_push_token="ExponentPushToken[advocate_kalyan_token]"
        )

        dispatched = NotificationService.dispatch_push_to_devices(
            user=advocate,
            title="Appearance Update",
            body="Hearing listing updated.",
        )

        assert dispatched == 1
        bad_device.refresh_from_db()
        good_device.refresh_from_db()
        # Bad device was deactivated
        assert bad_device.is_active is False
        # Good device remains active
        assert good_device.is_active is True

    def test_device_registration_serializer_rejects_malformed_token(self, auth_client):
        """7. POST /api/notifications/devices/ rejects malformed Expo push tokens."""
        url = reverse("notifications:device_registration")

        # Invalid token format
        response = auth_client.post(
            url,
            {"expo_push_token": "not-an-expo-token", "platform": "android"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "expo_push_token" in str(response.data)

        # Valid ExponentPushToken[...] format
        response_valid = auth_client.post(
            url,
            {"expo_push_token": "ExponentPushToken[new_device_token_999]", "platform": "android"},
            format="json",
        )
        assert response_valid.status_code == status.HTTP_201_CREATED

    def test_retriggering_failed_event_retries_without_duplicate_history(self, advocate):
        """8. Re-triggering a judgment event whose push previously failed retries the existing record."""
        case = Case.objects.create(
            case_type="WP",
            case_number="9115",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 5),
            judgment_type="JUDGMENT",
            order_number="WP-7715/2026",
            summary="Allowed with costs.",
        )

        # 1st attempt fails push
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("Gateway connection timeout"),
        ):
            first_run = NotificationService.send_judgment_notification(judgment, is_new=True)

        assert len(first_run) == 1
        first_notif = first_run[0]
        first_notif.refresh_from_db()
        assert first_notif.data_payload.get("delivery_status") == "FAILED"
        assert NotificationHistory.objects.filter(user=advocate).count() == 1

        # 2nd trigger of same event with push service now recovered
        with patch.object(NotificationService, "dispatch_push_to_devices", return_value=1):
            second_run = NotificationService.send_judgment_notification(judgment, is_new=True)

        assert len(second_run) == 1
        assert second_run[0].id == first_notif.id
        first_notif.refresh_from_db()
        assert first_notif.data_payload.get("delivery_status") == "DELIVERED"
        # Total history remains 1
        assert NotificationHistory.objects.filter(user=advocate).count() == 1

    def test_retriggering_delivered_event_does_not_redispatch(self, advocate):
        """9. Re-triggering an already DELIVERED judgment event returns existing without re-dispatch."""
        case = Case.objects.create(
            case_type="WP",
            case_number="9116",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 6),
            judgment_type="ORDER",
        )

        # 1st run succeeds
        NotificationService.send_judgment_notification(judgment, is_new=True)
        notif = NotificationHistory.objects.get(
            user=advocate, data_payload__judgment_id=judgment.id
        )
        assert notif.data_payload.get("delivery_status") == "DELIVERED"

        # 2nd run: dispatch_push_to_devices should NOT be called
        with patch.object(NotificationService, "dispatch_push_to_devices") as mock_dispatch:
            re_run = NotificationService.send_judgment_notification(judgment, is_new=True)
            mock_dispatch.assert_not_called()
            assert len(re_run) == 1
            assert re_run[0].id == notif.id

    def test_unchanged_judgment_update_does_not_send_duplicate_notification(
        self, auth_client, advocate, tracked_case
    ):
        """10. Updating a judgment with identical data does not dispatch redundant notifications."""
        judgment = Judgment.objects.create(
            case=tracked_case,
            judgment_date=date(2026, 11, 7),
            order_number="WP-100/2026",
            summary="Original summary.",
            document_link="https://aphc.gov.in/orders/100.pdf",
        )

        # Notification for initial creation
        NotificationService.send_judgment_notification(judgment, is_new=True)
        initial_count = NotificationHistory.objects.filter(user=advocate).count()
        assert initial_count == 1

        # PUT with exact same data
        url = reverse(
            "cases:judgment_detail",
            kwargs={"case_id": tracked_case.id, "pk": judgment.id},
        )
        payload = {
            "judgment_date": "2026-11-07",
            "order_number": "WP-100/2026",
            "summary": "Original summary.",
            "document_link": "https://aphc.gov.in/orders/100.pdf",
        }
        response = auth_client.put(url, payload, format="json")
        assert response.status_code == status.HTTP_200_OK

        # No duplicate notification generated
        assert NotificationHistory.objects.filter(user=advocate).count() == initial_count

    def test_hearing_change_event_retry_and_idempotency(self, advocate):
        """11. Hearing change push failure retries and updates DELIVERED status without duplicating history."""
        case = Case.objects.create(
            case_type="WP",
            case_number="9117",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        hearing = Hearing.objects.create(
            case=case,
            hearing_date=date(2026, 11, 10),
            hearing_time=time(10, 30),
            court_hall_number=5,
            item_number="12",
            status="SCHEDULED",
        )

        # Hearing adjourned, push fails
        with patch.object(
            NotificationService,
            "dispatch_push_to_devices",
            side_effect=TemporaryPushDeliveryError("Expo HTTP 500 Internal Server Error"),
        ):
            notifications = NotificationService.send_hearing_change_notification(
                hearing=hearing,
                change_type="ADJOURNED",
                details={"next_date": "2026-11-20"},
            )

        assert len(notifications) == 1
        notif = notifications[0]
        notif.refresh_from_db()
        assert notif.data_payload.get("delivery_status") == "FAILED"
        assert NotificationHistory.objects.filter(user=advocate).count() == 1

        # Celery retry task succeeds
        with patch.object(NotificationService, "dispatch_push_to_devices", return_value=1):
            recovered = retry_failed_push_notifications()

        assert recovered == 1
        notif.refresh_from_db()
        assert notif.data_payload.get("delivery_status") == "DELIVERED"
        assert NotificationHistory.objects.filter(user=advocate).count() == 1

    def test_no_active_devices_records_no_active_devices_status(self, advocate):
        """12. Advocate without active devices records NO_ACTIVE_DEVICES, not DELIVERED."""
        DeviceRegistration.objects.filter(user=advocate).update(is_active=False)

        case = Case.objects.create(
            case_type="WP",
            case_number="9118",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 15),
            judgment_type="ORDER",
        )

        notifications = NotificationService.send_judgment_notification(judgment, is_new=True)
        assert len(notifications) == 1
        notif = notifications[0]
        notif.refresh_from_db()
        # Explicit status: NOT DELIVERED
        assert notif.data_payload.get("delivery_status") == "NO_ACTIVE_DEVICES"
        assert notif.data_payload.get("delivery_status") != "DELIVERED"

    def test_master_and_category_notification_preference_interaction(self, advocate):
        """13. Master push toggle and category-specific toggles interact correctly."""
        pref = ReminderPreference.objects.get(advocate=advocate)
        case = Case.objects.create(
            case_type="WP",
            case_number="9119",
            filing_year=2024,
            petitioner="Petitioner",
            respondent="Respondent",
        )
        case.tracked_by.add(advocate)

        judgment = Judgment.objects.create(
            case=case,
            judgment_date=date(2026, 11, 16),
            judgment_type="ORDER",
        )
        hearing = Hearing.objects.create(
            case=case,
            hearing_date=date(2026, 11, 17),
            status="SCHEDULED",
        )

        # Case A: Master push disabled -> suppresses both judgment and hearing change
        pref.push_notifications = False
        pref.judgment_push_notifications = True
        pref.hearing_change_push_notifications = True
        pref.save()

        notifs_j = NotificationService.send_judgment_notification(judgment, is_new=True)
        notifs_h = NotificationService.send_hearing_change_notification(
            hearing, change_type="CANCELLED"
        )
        assert len(notifs_j) == 0
        assert len(notifs_h) == 0

        # Case B: Master enabled, judgment disabled, hearing change enabled
        pref.push_notifications = True
        pref.judgment_push_notifications = False
        pref.hearing_change_push_notifications = True
        pref.save()

        notifs_j2 = NotificationService.send_judgment_notification(judgment, is_new=True)
        notifs_h2 = NotificationService.send_hearing_change_notification(
            hearing, change_type="CANCELLED"
        )
        assert len(notifs_j2) == 0
        assert len(notifs_h2) == 1
