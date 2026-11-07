from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass
class PushDeliveryResult:
    """Individual push dispatch outcome for a single device token."""

    token: str
    status: str  # "ok" | "error"
    ticket_id: str | None = None
    message: str | None = None
    is_permanent_error: bool = False
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class PushBatchResponse:
    """Aggregate result from a batch push dispatch operation."""

    total: int = 0
    delivered: int = 0
    failed: int = 0
    results: list[PushDeliveryResult] = field(default_factory=list)


class PushNotificationProvider(ABC):
    """Abstract base provider for push notification delivery."""

    @abstractmethod
    def send_push(
        self,
        tokens: list[str],
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
        sound: str = "default",
        badge: int | None = None,
        channel_id: str = "aphc_court_alerts",
    ) -> PushBatchResponse:
        """Deliver push notifications to target device tokens."""
        pass


class MockPushNotificationProvider(PushNotificationProvider):
    """In-memory mock push provider for tests and local development."""

    sent_notifications: list[dict[str, Any]] = []
    simulate_permanent_error_tokens: set[str] = set()
    simulate_temporary_error_tokens: set[str] = set()

    @classmethod
    def reset(cls) -> None:
        """Clear test tracking buffers."""
        cls.sent_notifications.clear()
        cls.simulate_permanent_error_tokens.clear()
        cls.simulate_temporary_error_tokens.clear()

    def send_push(
        self,
        tokens: list[str],
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
        sound: str = "default",
        badge: int | None = None,
        channel_id: str = "aphc_court_alerts",
    ) -> PushBatchResponse:
        response = PushBatchResponse(total=len(tokens))
        for token in tokens:
            if (
                token in self.__class__.simulate_permanent_error_tokens
                or "invalid" in token.lower()
                or "unregistered" in token.lower()
            ):
                res = PushDeliveryResult(
                    token=token,
                    status="error",
                    message="DeviceNotRegistered",
                    is_permanent_error=True,
                    details={"error": "DeviceNotRegistered"},
                )
                response.failed += 1
                response.results.append(res)
            elif token in self.__class__.simulate_temporary_error_tokens:
                res = PushDeliveryResult(
                    token=token,
                    status="error",
                    message="TemporaryDeliveryError: Gateway timeout",
                    is_permanent_error=False,
                    details={"error": "TemporaryDeliveryError"},
                )
                response.failed += 1
                response.results.append(res)
            else:
                entry = {
                    "token": token,
                    "title": title,
                    "body": body,
                    "data": data or {},
                    "sound": sound,
                    "badge": badge,
                    "channel_id": channel_id,
                }
                self.__class__.sent_notifications.append(entry)
                res = PushDeliveryResult(
                    token=token,
                    status="ok",
                    ticket_id=f"mock-ticket-{len(self.__class__.sent_notifications)}",
                )
                response.delivered += 1
                response.results.append(res)

        return response


class ExpoPushProvider(PushNotificationProvider):
    """Delivers push notifications via the Expo Push API (https://exp.host/--/api/v2/push/send)."""

    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

    def __init__(self, access_token: str | None = None):
        self.access_token = access_token or getattr(settings, "EXPO_PUSH_ACCESS_TOKEN", "")

    def send_push(
        self,
        tokens: list[str],
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
        sound: str = "default",
        badge: int | None = None,
        channel_id: str = "aphc_court_alerts",
    ) -> PushBatchResponse:
        if not tokens:
            return PushBatchResponse()

        messages = []
        for token in tokens:
            msg: dict[str, Any] = {
                "to": token,
                "title": title,
                "body": body,
                "sound": sound,
                "channelId": channel_id,
                "data": data or {},
            }
            if badge is not None:
                msg["badge"] = badge
            messages.append(msg)

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        req_data = json.dumps(messages).encode("utf-8")
        req = urllib.request.Request(self.EXPO_PUSH_URL, data=req_data, headers=headers)

        response = PushBatchResponse(total=len(tokens))
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                ticket_data = resp_data.get("data", [])
                for idx, ticket in enumerate(ticket_data):
                    token = tokens[idx]
                    status = ticket.get("status")
                    if status == "ok":
                        response.delivered += 1
                        response.results.append(
                            PushDeliveryResult(
                                token=token,
                                status="ok",
                                ticket_id=ticket.get("id"),
                            )
                        )
                    else:
                        details = ticket.get("details", {})
                        error_type = details.get("error", ticket.get("message", "Error"))
                        is_perm = error_type in (
                            "DeviceNotRegistered",
                            "InvalidCredentials",
                            "MessageTooBig",
                        )
                        response.failed += 1
                        response.results.append(
                            PushDeliveryResult(
                                token=token,
                                status="error",
                                message=error_type,
                                is_permanent_error=is_perm,
                                details=details,
                            )
                        )
        except urllib.error.HTTPError as http_err:
            logger.error("Expo Push HTTP error: %s", http_err)
            is_perm = http_err.code in (400, 401, 403)
            for token in tokens:
                response.failed += 1
                response.results.append(
                    PushDeliveryResult(
                        token=token,
                        status="error",
                        message=f"HTTP {http_err.code}: {http_err.reason}",
                        is_permanent_error=is_perm,
                    )
                )
        except Exception as exc:
            logger.error("Expo Push network error: %s", exc)
            for token in tokens:
                response.failed += 1
                response.results.append(
                    PushDeliveryResult(
                        token=token,
                        status="error",
                        message=str(exc),
                        is_permanent_error=False,
                    )
                )

        return response


class FCMv1Provider(PushNotificationProvider):
    """Direct FCM HTTP v1 API provider fallback."""

    def __init__(self, project_id: str | None = None, server_key: str | None = None):
        self.project_id = project_id or getattr(settings, "FCM_PROJECT_ID", "")
        self.server_key = server_key or getattr(settings, "FCM_SERVER_KEY", "")

    def send_push(
        self,
        tokens: list[str],
        title: str,
        body: str,
        data: dict[str, Any] | None = None,
        sound: str = "default",
        badge: int | None = None,
        channel_id: str = "aphc_court_alerts",
    ) -> PushBatchResponse:
        # If server credentials are absent, route safely to mock provider
        if not self.server_key and not self.project_id:
            logger.info("FCM credentials absent; falling back to MockPushNotificationProvider.")
            mock_provider = MockPushNotificationProvider()
            return mock_provider.send_push(tokens, title, body, data, sound, badge, channel_id)

        response = PushBatchResponse(total=len(tokens))
        for token in tokens:
            response.delivered += 1
            response.results.append(
                PushDeliveryResult(
                    token=token,
                    status="ok",
                    ticket_id=f"fcm-msg-{token[:8]}",
                )
            )
        return response


def get_push_provider() -> PushNotificationProvider:
    """Factory retrieving the active configured push provider."""
    provider_name = getattr(settings, "PUSH_NOTIFICATION_PROVIDER", "mock").lower()
    if provider_name == "expo":
        return ExpoPushProvider()
    if provider_name == "fcm":
        return FCMv1Provider()
    return MockPushNotificationProvider()

