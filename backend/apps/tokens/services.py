"""Business logic and alert synchronization engine for Court Tokens."""

from __future__ import annotations

import logging
from typing import Any

from django.utils import timezone

from apps.notifications.models import NotificationHistory
from apps.notifications.services import NotificationService
from apps.tokens.models import TokenAlertRule, TokenStatus
from apps.tokens.providers import CourtTokenProvider, get_court_token_provider

logger = logging.getLogger(__name__)


class TokenAlertSyncService:
    """Synchronizes active court token alerts against provider observations and dispatches alerts."""

    STALENESS_THRESHOLD_SECONDS = 300  # 5 minutes

    def __init__(self, provider: CourtTokenProvider | None = None):
        self.provider = provider or get_court_token_provider()

    def sync_alert_rule(self, alert: TokenAlertRule) -> TokenAlertRule:
        """Evaluate an individual token alert rule against the latest provider observation.

        Idempotent: Approaching and called alerts are fired at most once per rule.
        Transitions state safely without duplicates.
        """
        try:
            obs = self.provider.fetch_hall_token_status(alert.court_hall.hall_number)
        except Exception as exc:
            logger.warning(
                "Error querying provider for Hall %s: %s",
                alert.court_hall.hall_number,
                exc,
            )
            alert.is_stale = True
            alert.last_synced_at = timezone.now()
            alert.save(update_fields=["is_stale", "last_synced_at", "updated_at"])
            return alert

        if not obs.is_available:
            alert.is_stale = True
            alert.last_synced_at = timezone.now()
            alert.save(update_fields=["is_stale", "last_synced_at", "updated_at"])
            return alert

        # Staleness calculation
        age = (timezone.now() - obs.observed_at).total_seconds()
        is_stale = age > self.STALENESS_THRESHOLD_SECONDS

        alert.is_stale = is_stale
        alert.sync_source = obs.provider_name
        alert.is_mock = obs.is_mock
        alert.last_synced_at = timezone.now()

        current_item = obs.current_item_number
        alert.current_called_token = str(current_item)

        items_remaining = alert.listed_item_number - current_item
        alert.items_remaining = items_remaining

        # Proximity and Call evaluation
        if current_item > 0 and current_item >= alert.listed_item_number:
            alert.status = TokenStatus.CALLED
            if alert.alert_on_called and not alert.called_alert_sent:
                self._dispatch_called_notification(alert, current_item)
                alert.called_alert_sent = True
                alert.is_notified = True
        elif current_item > 0 and 0 <= items_remaining <= alert.alert_threshold:
            alert.status = TokenStatus.APPROACHING
            if alert.alert_on_approach and not alert.approaching_alert_sent:
                self._dispatch_approaching_notification(alert, current_item, items_remaining)
                alert.approaching_alert_sent = True
                alert.is_notified = True
        elif items_remaining > alert.alert_threshold:
            alert.status = TokenStatus.WAITING
        elif current_item == 0:
            if alert.status not in (TokenStatus.CANCELLED, TokenStatus.COMPLETED):
                alert.status = TokenStatus.REGISTERED

        alert.save()
        return alert

    def _dispatch_approaching_notification(
        self, alert: TokenAlertRule, current_item: int, items_remaining: int
    ) -> None:
        title = f"Token {alert.token_number} Approaching: {items_remaining} items remaining"
        body = (
            f"Your item #{alert.listed_item_number} in Court Hall {alert.court_hall.hall_number} "
            f"is approaching. Current item is #{current_item} ({items_remaining} items remaining)."
        )
        payload = {
            "alert_id": alert.id,
            "case_id": alert.case_id,
            "token_number": alert.token_number,
            "hall_number": alert.court_hall.hall_number,
            "status": TokenStatus.APPROACHING,
            "items_remaining": items_remaining,
            "current_called_token": str(current_item),
            "is_mock": alert.is_mock,
        }
        notif = NotificationHistory.objects.create(
            user=alert.advocate,
            title=title,
            body=body,
            category="TOKEN_ALERT",
            data_payload=payload,
        )
        NotificationService.dispatch_notification_to_devices(notif, raise_on_error=False)

    def _dispatch_called_notification(self, alert: TokenAlertRule, current_item: int) -> None:
        title = f"Token {alert.token_number} CALLED in Court Hall {alert.court_hall.hall_number}"
        body = (
            f"Your matter (Item #{alert.listed_item_number}) in Court Hall "
            f"{alert.court_hall.hall_number} has been called."
        )
        payload = {
            "alert_id": alert.id,
            "case_id": alert.case_id,
            "token_number": alert.token_number,
            "hall_number": alert.court_hall.hall_number,
            "status": TokenStatus.CALLED,
            "current_called_token": str(current_item),
            "is_mock": alert.is_mock,
        }
        notif = NotificationHistory.objects.create(
            user=alert.advocate,
            title=title,
            body=body,
            category="TOKEN_ALERT",
            data_payload=payload,
        )
        NotificationService.dispatch_notification_to_devices(notif, raise_on_error=False)

    def sync_all_active_alerts(self) -> dict[str, Any]:
        """Scan and synchronize all active token alert rules across all advocates."""
        active_alerts = list(
            TokenAlertRule.objects.filter(is_active=True)
            .exclude(
                status__in=[TokenStatus.COMPLETED, TokenStatus.CANCELLED, TokenStatus.ADJOURNED]
            )
            .select_related("court_hall", "advocate", "case")
        )

        approaching_count = 0
        called_count = 0
        stale_count = 0
        error_count = 0

        for alert in active_alerts:
            prev_approaching = alert.approaching_alert_sent
            prev_called = alert.called_alert_sent
            try:
                self.sync_alert_rule(alert)
                if not prev_approaching and alert.approaching_alert_sent:
                    approaching_count += 1
                if not prev_called and alert.called_alert_sent:
                    called_count += 1
                if alert.is_stale:
                    stale_count += 1
            except Exception as exc:
                logger.error("Failed to sync alert %s: %s", alert.id, exc)
                error_count += 1

        return {
            "total_synced": len(active_alerts),
            "approaching_alerts_dispatched": approaching_count,
            "called_alerts_dispatched": called_count,
            "stale_count": stale_count,
            "errors": error_count,
        }


# Alias for backward and forward service compatibility
TokenAlertService = TokenAlertSyncService
