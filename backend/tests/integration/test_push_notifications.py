from __future__ import annotations

import datetime
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import AdvocateProfile
from apps.cases.models import Case, Hearing
from apps.notifications.models import DeviceRegistration, NotificationHistory
from apps.notifications.providers import (
    MockPushNotificationProvider,
)
from apps.notifications.services import (
    NotificationService,
)
from apps.reminders.models import Reminder, ReminderPreference
from apps.tokens.models import CourtHall, CourtTokenStatus, TokenAlertRule
from apps.voice.models import TranscriptionStatus, VoiceNote

User = get_user_model()


@pytest.fixture(autouse=True)
def reset_mock_provider():
    """Reset mock provider tracking buffers before every test."""
    MockPushNotificationProvider.reset()
    yield
    MockPushNotificationProvider.reset()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def advocate_a(db):
    user = User.objects.create_user(
        username="advocate_phase7_a",
        email="advocate7a@example.com",
        password="TestPassword@123",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7001/2024",
        phone_number="+919876543210",
        is_verified=True,
    )
    ReminderPreference.objects.create(
        advocate=user,
        push_notifications=True,
        judgment_push_notifications=True,
        hearing_change_push_notifications=True,
    )
    return user


@pytest.fixture
def advocate_b(db):
    user = User.objects.create_user(
        username="advocate_phase7_b",
        email="advocate7b@example.com",
        password="TestPassword@123",
    )
    AdvocateProfile.objects.create(
        user=user,
        bar_council_enrollment_number="AP/7002/2024",
        phone_number="+919876543211",
        is_verified=True,
    )
    ReminderPreference.objects.create(
        advocate=user,
        push_notifications=True,
    )
    return user


@pytest.fixture
def sample_case(db, advocate_a):
    c = Case.objects.create(
        case_type="WP",
        case_number="777",
        filing_year=2024,
        petitioner="A. P. Farmers Welfare Trust",
        respondent="State of Andhra Pradesh & Others",
        current_stage="PENDING",
    )
    c.tracked_by.add(advocate_a)
    return c


@pytest.fixture
def court_hall_7(db):
    hall, _ = CourtHall.objects.get_or_create(
        hall_number=7,
        defaults={"bench_name": "Division Bench VII"},
    )
    CourtTokenStatus.objects.get_or_create(
        court_hall=hall,
        defaults={"current_item_number": 1, "current_stage": "HEARING"},
    )
    return hall


@pytest.mark.django_db
class TestPushNotificationsEngine:
    """Comprehensive test suite covering Phase 7 Push Notifications, FCM/Expo and Devices."""

    # 1. Device Registration Success
    def test_device_token_registration_success(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        payload = {
            "expo_push_token": "ExponentPushToken[Abc123ValidToken_Phase7]",
            "platform": "android",
            "device_name": "Google Pixel 8 Pro",
            "device_id": "device-uuid-111",
            "app_version": "1.0.0",
        }
        res = api_client.post("/api/notifications/devices/", data=payload, format="json")
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["expo_push_token"] == "ExponentPushToken[Abc123ValidToken_Phase7]"
        assert res.data["platform"] == "android"
        assert res.data["device_id"] == "device-uuid-111"
        assert res.data["is_active"] is True

        device = DeviceRegistration.objects.get(expo_push_token="ExponentPushToken[Abc123ValidToken_Phase7]")
        assert device.user == advocate_a
        assert device.failure_count == 0

    # 2. Multiple Devices Per Advocate
    def test_multiple_devices_per_advocate(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        # Register Phone
        api_client.post("/api/notifications/devices/", data={
            "expo_push_token": "ExponentPushToken[PhoneToken_001]",
            "platform": "android",
            "device_name": "OnePlus 12",
            "device_id": "phone-id-01",
        }, format="json")

        # Register Tablet
        api_client.post("/api/notifications/devices/", data={
            "expo_push_token": "ExponentPushToken[TabletToken_002]",
            "platform": "ios",
            "device_name": "iPad Pro 11",
            "device_id": "tablet-id-02",
        }, format="json")

        devices = DeviceRegistration.objects.filter(user=advocate_a, is_active=True)
        assert devices.count() == 2
        platforms = {d.platform for d in devices}
        assert platforms == {"android", "ios"}

    # 3. Token Rotation on Same Device
    def test_token_rotation_same_device(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        # Register initial token
        api_client.post("/api/notifications/devices/", data={
            "expo_push_token": "ExponentPushToken[InitialToken_123]",
            "device_id": "hardware-xyz",
            "platform": "android",
        }, format="json")

        # Rotate token on same device
        api_client.post("/api/notifications/devices/", data={
            "expo_push_token": "ExponentPushToken[RotatedToken_456]",
            "device_id": "hardware-xyz",
            "platform": "android",
        }, format="json")

        old_device = DeviceRegistration.objects.get(expo_push_token="ExponentPushToken[InitialToken_123]")
        new_device = DeviceRegistration.objects.get(expo_push_token="ExponentPushToken[RotatedToken_456]")

        assert old_device.is_active is False
        assert new_device.is_active is True

    # 4. Token Reassignment Between Users
    def test_token_reassigned_when_registered_by_another_user(self, api_client, advocate_a, advocate_b):
        # Advocate A registers token
        NotificationService.register_device(
            user=advocate_a,
            expo_push_token="ExponentPushToken[SharedDeviceToken_999]",
            platform="android",
        )
        assert DeviceRegistration.objects.filter(expo_push_token="ExponentPushToken[SharedDeviceToken_999]", user=advocate_a).exists()

        # Advocate B logs in on same device
        api_client.force_authenticate(user=advocate_b)
        res = api_client.post("/api/notifications/devices/", data={
            "expo_push_token": "ExponentPushToken[SharedDeviceToken_999]",
            "platform": "android",
        }, format="json")
        assert res.status_code == status.HTTP_201_CREATED

        device = DeviceRegistration.objects.get(expo_push_token="ExponentPushToken[SharedDeviceToken_999]")
        assert device.user == advocate_b

    # 5. Invalid Token Format Rejected
    def test_invalid_token_format_rejected(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        res = api_client.post("/api/notifications/devices/", data={
            "expo_push_token": "not-a-valid-token-string",
            "platform": "android",
        }, format="json")
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "expo_push_token" in str(res.data)

    # 6. Single Device Deactivation
    def test_device_deactivation_single_token(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        token = "ExponentPushToken[DeactivateMe_789]"
        NotificationService.register_device(user=advocate_a, expo_push_token=token)

        res = api_client.post("/api/notifications/devices/deactivate/", data={"expo_push_token": token}, format="json")
        assert res.status_code == status.HTTP_200_OK
        assert res.data["deactivated_count"] == 1

        dev = DeviceRegistration.objects.get(expo_push_token=token)
        assert dev.is_active is False

    # 7. Deactivate All Devices on Logout
    def test_device_deactivation_all_devices(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[DevA_111]")
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[DevA_222]")

        res = api_client.post("/api/notifications/devices/deactivate/", data={"all": True}, format="json")
        assert res.status_code == status.HTTP_200_OK
        assert res.data["deactivated_count"] == 2

        assert DeviceRegistration.objects.filter(user=advocate_a, is_active=True).count() == 0

    # 8. Mock Provider Push Dispatch
    def test_mock_provider_dispatch(self, advocate_a):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[MockDispatch_01]")

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Court Cause List Updated",
            body="Your matter is listed at Item 15.",
            category="CAUSELIST",
            data_payload={"item_number": 15},
            is_sensitive=False,
        )

        assert notif.delivery_status == "DELIVERED"
        assert len(MockPushNotificationProvider.sent_notifications) == 1
        sent = MockPushNotificationProvider.sent_notifications[0]
        assert sent["token"] == "ExponentPushToken[MockDispatch_01]"
        assert sent["title"] == "Court Cause List Updated"

    # 9. Provider Token Invalidation Handling (DeviceNotRegistered)
    def test_provider_token_invalidation_handling(self, advocate_a):
        token = "ExponentPushToken[Unregistered_Token_99]"
        device = NotificationService.register_device(user=advocate_a, expo_push_token=token)
        MockPushNotificationProvider.simulate_permanent_error_tokens.add(token)

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Token Check",
            body="Checking token validity",
            category="SYSTEM_ALERT",
        )

        device.refresh_from_db()
        assert device.is_active is False
        assert device.failure_count == 1
        assert notif.delivery_status == "PERMANENT_FAILURE"

    # 10. Temporary Delivery Failure Handling
    def test_temporary_delivery_failure_handling(self, advocate_a):
        token = "ExponentPushToken[FlakyConnection_01]"
        device = NotificationService.register_device(user=advocate_a, expo_push_token=token)
        MockPushNotificationProvider.simulate_temporary_error_tokens.add(token)

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Temporary Alert",
            body="Testing network error",
            category="SYSTEM_ALERT",
        )

        device.refresh_from_db()
        assert device.is_active is True  # Stays active on temporary failure
        assert device.failure_count == 1
        assert notif.delivery_status == "FAILED"
        assert notif.data_payload["retry_count"] == 1

    # 11. Retry Failed Notifications Recovers
    def test_retry_failed_notifications(self, advocate_a):
        token = "ExponentPushToken[RecoveringDevice_01]"
        NotificationService.register_device(user=advocate_a, expo_push_token=token)
        MockPushNotificationProvider.simulate_temporary_error_tokens.add(token)

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Failing First",
            body="Should succeed on retry",
            category="SYSTEM_ALERT",
        )
        assert notif.delivery_status == "FAILED"

        # Clear error simulation so retry succeeds
        MockPushNotificationProvider.simulate_temporary_error_tokens.clear()
        recovered = NotificationService.retry_failed_notifications()

        notif.refresh_from_db()
        assert recovered == 1
        assert notif.delivery_status == "DELIVERED"

    # 12. Max Retries Reached Marks Permanent Failure
    def test_max_retries_marks_permanent_failure(self, advocate_a):
        token = "ExponentPushToken[PersistentFailure_01]"
        NotificationService.register_device(user=advocate_a, expo_push_token=token)
        MockPushNotificationProvider.simulate_temporary_error_tokens.add(token)

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Persistent Fail",
            body="Will reach max retries",
            category="SYSTEM_ALERT",
        )
        # Attempt 1 failed
        assert notif.data_payload["retry_count"] == 1

        # Simulate reaching max retries
        NotificationService.retry_failed_notifications(max_retries=2)
        notif.refresh_from_db()
        assert notif.data_payload["retry_count"] == 2

        # Exceed max retries
        NotificationService.retry_failed_notifications(max_retries=2)
        notif.refresh_from_db()
        assert notif.delivery_status == "PERMANENT_FAILURE"

    # 13. Idempotency Key Prevents Duplicate Notifications
    def test_idempotency_prevents_duplicate_notifications(self, advocate_a):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[IdemDevice_01]")

        key = "hearing-reminder-unique-999"
        n1 = NotificationService.send_push_notification(
            user=advocate_a,
            title="Hearing Alert 1",
            body="Body 1",
            category="HEARING_REMINDER",
            idempotency_key=key,
        )

        n2 = NotificationService.send_push_notification(
            user=advocate_a,
            title="Hearing Alert 2",
            body="Body 2",
            category="HEARING_REMINDER",
            idempotency_key=key,
        )

        assert n1.id == n2.id
        assert NotificationHistory.objects.filter(user=advocate_a, idempotency_key=key).count() == 1

    # 14. Advocate With No Active Devices
    def test_no_active_devices_marked_no_active_devices(self, advocate_a):
        assert DeviceRegistration.objects.filter(user=advocate_a, is_active=True).count() == 0

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Notice",
            body="No active devices test",
            category="SYSTEM_ALERT",
        )

        assert notif.delivery_status == "NO_ACTIVE_DEVICES"
        assert len(MockPushNotificationProvider.sent_notifications) == 0

    # 15. Lock Screen Payload Privacy & Sanitization
    def test_lock_screen_payload_privacy_sanitization(self, advocate_a, sample_case):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[PrivacyDevice_01]")

        confidential_title = f"Urgent Hearing: {sample_case.petitioner} v. {sample_case.respondent}"
        confidential_body = "Confidential dispute strategy listed for urgent stay orders."

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title=confidential_title,
            body=confidential_body,
            category="HEARING_REMINDER",
            is_sensitive=True,
        )

        # Database record retains complete confidential details for authenticated app viewing
        assert notif.title == confidential_title
        assert notif.body == confidential_body

        # Lock-screen push payload dispatched to OS notification center is sanitized
        sent = MockPushNotificationProvider.sent_notifications[0]
        assert "A. P. Farmers" not in sent["body"]
        assert "Confidential" not in sent["body"]
        assert "APHC Hearing Alert" in sent["title"]
        assert "High Court hearing" in sent["body"]

    # 16. Hearing Reminder Notification Trigger
    def test_hearing_reminder_notification_trigger(self, advocate_a, sample_case):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[ReminderDevice_01]")

        hearing = Hearing.objects.create(
            case=sample_case,
            hearing_date=timezone.now().date() + datetime.timedelta(days=1),
            hearing_time=datetime.time(10, 30),
            court_hall_number=4,
            status="SCHEDULED",
        )
        reminder = Reminder.objects.create(
            advocate=advocate_a,
            case=sample_case,
            hearing=hearing,
            due_date=timezone.now() + datetime.timedelta(hours=24),
            reminder_type="HEARING",
        )

        notif = NotificationService.send_reminder_notification(reminder)
        assert notif is not None
        assert notif.category in ("HEARING_REMINDER", "REMINDER")
        assert notif.data_payload.get("delivery_status") == "DELIVERED"
        assert notif.data_payload["reminder_id"] == reminder.id

    # 17. Token Approaching Alert Trigger
    def test_token_approaching_notification_trigger(self, advocate_a, sample_case, court_hall_7):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[TokenDevice_01]")

        from apps.tokens.services import TokenAlertService
        service = TokenAlertService()

        # Set current court hall item to 7
        court_hall_7.token_status.current_item_number = 7
        court_hall_7.token_status.save()

        # Alert rule at item 10, threshold 3 -> (10 - 7 = 3) -> Triggers APPROACHING
        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=sample_case,
            court_hall=court_hall_7,
            hearing_date=timezone.now().date(),
            token_number="100",
            listed_item_number=10,
            alert_threshold=3,
        )

        service.sync_alert_rule(alert)
        alert.refresh_from_db()
        assert alert.approaching_alert_sent is True

        notifs = NotificationHistory.objects.filter(user=advocate_a, category="TOKEN_ALERT")
        assert notifs.count() == 1
        assert notifs.first().delivery_status == "DELIVERED"

    # 18. Token Called Alert Trigger
    def test_token_called_notification_trigger(self, advocate_a, sample_case, court_hall_7):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[TokenDevice_02]")

        from apps.tokens.services import TokenAlertService
        service = TokenAlertService()

        # Item 15 called
        court_hall_7.token_status.current_item_number = 15
        court_hall_7.token_status.save()

        alert = TokenAlertRule.objects.create(
            advocate=advocate_a,
            case=sample_case,
            court_hall=court_hall_7,
            hearing_date=timezone.now().date(),
            token_number="105",
            listed_item_number=15,
            alert_threshold=3,
        )

        service.sync_alert_rule(alert)
        alert.refresh_from_db()
        assert alert.called_alert_sent is True

        notifs = NotificationHistory.objects.filter(user=advocate_a, category="TOKEN_ALERT")
        assert notifs.first().delivery_status == "DELIVERED"
        assert "CALLED" in notifs.first().title

    # 19. Calendar Agenda Reminder Trigger
    def test_calendar_agenda_reminder_trigger(self, advocate_a, sample_case):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[CalendarDev_01]")

        notif = NotificationService.send_push_notification(
            user=advocate_a,
            title="Filing Compliance Deadline",
            body="Rejoinder affidavit filing due tomorrow.",
            category="COMPLIANCE_DEADLINE",
            data_payload={"case_id": sample_case.id, "due_date": "2024-11-20"},
        )

        assert notif.category == "COMPLIANCE_DEADLINE"
        assert notif.delivery_status == "DELIVERED"

    # 20. Voice Transcription Completed Trigger
    def test_voice_transcription_completed_trigger(self, advocate_a, sample_case):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[VoiceDev_01]")

        voice_note = VoiceNote.objects.create(
            advocate=advocate_a,
            case=sample_case,
            audio_file="voice_notes/test.wav",
            transcription_language="te",
            transcription_status=TranscriptionStatus.NOT_STARTED,
        )

        with patch("os.path.exists", return_value=True), \
             patch("apps.voice.services.get_speech_to_text_provider") as mock_stt:
            class MockSTT:
                def transcribe(self, **kwargs):
                    from apps.voice.providers import SpeechToTextResult
                    return SpeechToTextResult(
                        transcript="సాక్ష్యం నమోదు చేయబడింది",
                        language="te",
                        confidence=0.98,
                        provider="MOCK",
                        is_mock=True,
                    )

            mock_stt.return_value = MockSTT()
            from apps.voice.services import VoiceTranscriptionService
            VoiceTranscriptionService.process_transcription(voice_note.id)

        notif = NotificationHistory.objects.filter(
            user=advocate_a,
            category="VOICE_TRANSCRIPTION_COMPLETED",
        ).first()
        assert notif is not None
        assert notif.delivery_status == "DELIVERED"
        assert notif.data_payload["voice_note_id"] == voice_note.id

    # 21. Voice Transcription Failed Trigger
    def test_voice_transcription_failed_trigger(self, advocate_a, sample_case):
        NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[VoiceDev_02]")

        voice_note = VoiceNote.objects.create(
            advocate=advocate_a,
            case=sample_case,
            audio_file="voice_notes/corrupt.wav",
            transcription_language="en",
            transcription_status=TranscriptionStatus.NOT_STARTED,
        )

        with patch("os.path.exists", return_value=True), \
             patch("apps.voice.services.get_speech_to_text_provider") as mock_stt:
            class MockFailSTT:
                def transcribe(self, **kwargs):
                    raise RuntimeError("Audio codec corruption error")

            mock_stt.return_value = MockFailSTT()
            from apps.voice.services import VoiceTranscriptionService
            VoiceTranscriptionService.process_transcription(voice_note.id)

        notif = NotificationHistory.objects.filter(
            user=advocate_a,
            category="VOICE_TRANSCRIPTION_FAILED",
        ).first()
        assert notif is not None
        assert notif.delivery_status == "DELIVERED"
        assert "Audio codec corruption" in notif.data_payload["error"]

    # 22. Multi-Tenant Device Isolation
    def test_multi_tenant_device_isolation(self, api_client, advocate_a, advocate_b):
        # Advocate A registers device
        dev_a = NotificationService.register_device(user=advocate_a, expo_push_token="ExponentPushToken[DevAdvocateA_01]")

        # Advocate B lists devices
        api_client.force_authenticate(user=advocate_b)
        res = api_client.get("/api/notifications/devices/")
        assert res.status_code == status.HTTP_200_OK
        device_items = res.data.get("results", res.data) if isinstance(res.data, dict) else res.data
        returned_tokens = [d["expo_push_token"] for d in device_items]
        assert "ExponentPushToken[DevAdvocateA_01]" not in returned_tokens

        # Advocate B cannot deactivate Advocate A's device
        deact_res = api_client.post(
            "/api/notifications/devices/deactivate/",
            data={"expo_push_token": "ExponentPushToken[DevAdvocateA_01]"},
            format="json",
        )
        assert deact_res.data["deactivated_count"] == 0
        dev_a.refresh_from_db()
        assert dev_a.is_active is True

    # 23. Multi-Tenant Notification History Isolation
    def test_multi_tenant_notification_history_isolation(self, api_client, advocate_a, advocate_b):
        notif_a = NotificationHistory.objects.create(
            user=advocate_a,
            title="Advocate A Secret Matter",
            body="Confidential to A",
            category="GENERAL",
        )

        # Advocate B requests history
        api_client.force_authenticate(user=advocate_b)
        res = api_client.get("/api/notifications/history/")
        assert res.status_code == status.HTTP_200_OK
        history_items = res.data.get("results", res.data) if isinstance(res.data, dict) else res.data
        ids = [n["id"] for n in history_items]
        assert notif_a.id not in ids

        # Advocate B cannot mark A's notification as read
        read_res = api_client.post(f"/api/notifications/{notif_a.id}/read/")
        assert read_res.status_code == status.HTTP_404_NOT_FOUND
        notif_a.refresh_from_db()
        assert notif_a.is_read is False

    # 24. Unread Count and Mark All Read
    def test_unread_count_and_mark_all_read(self, api_client, advocate_a):
        api_client.force_authenticate(user=advocate_a)

        NotificationHistory.objects.create(user=advocate_a, title="N1", body="B1", is_read=False)
        NotificationHistory.objects.create(user=advocate_a, title="N2", body="B2", is_read=False)
        NotificationHistory.objects.create(user=advocate_a, title="N3", body="B3", is_read=True)

        res = api_client.get("/api/notifications/unread-count/")
        assert res.status_code == status.HTTP_200_OK
        assert res.data["unread_count"] == 2

        # Mark all as read
        mark_res = api_client.post("/api/notifications/mark-all-read/")
        assert mark_res.status_code == status.HTTP_200_OK
        assert mark_res.data["marked_read_count"] == 2

        count_after = api_client.get("/api/notifications/unread-count/")
        assert count_after.data["unread_count"] == 0

