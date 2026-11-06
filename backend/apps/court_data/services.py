"""Centralized status synchronization and change detection engine for court data."""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.cases.history_service import CaseHistoryService
from apps.cases.models import Case, Hearing, Judgment
from apps.notifications.models import NotificationHistory
from apps.notifications.services import NotificationService
from apps.reminders.services import ReminderService

from .models import CourtListing, CourtStatusObservation
from .parser import CourtDataParser, InvalidCourtDataError, ParsedCourtCasePayload
from .providers import CourtDataProvider, CourtListingObservation, get_court_data_provider
from .retry import RetryConfig, execute_with_retry
from .status_mapping import (
    NormalizedCourtStatus,
    get_status_display_label,
    is_meaningful_status_transition,
    normalize_source_status,
)

logger = logging.getLogger(__name__)


class CourtStatusSyncService:
    """Orchestrates court data ingestion, status normalization, audit logging, and alert dispatch."""

    @classmethod
    def get_latest_listing_for_case(cls, case: Case) -> CourtListing | None:
        """Fetch the most recent active CourtListing for a case."""
        return (
            CourtListing.objects.filter(case=case).order_by("-listing_date", "-updated_at").first()
        )

    @classmethod
    @transaction.atomic
    def record_and_process_observation(
        cls,
        case: Case,
        obs: CourtListingObservation,
    ) -> tuple[CourtListing, CourtStatusObservation, bool]:
        """Atomically normalize observation, update listing, check transitions, and dispatch alerts.

        Returns:
            tuple[CourtListing, CourtStatusObservation, bool]: (listing, observation, is_meaningful_change)
        """
        normalized_status, is_recognized = normalize_source_status(obs.source_status)
        now = timezone.now()

        # Find or initialize CourtListing record for this date or case
        listing = None
        if obs.listing_date:
            listing = (
                CourtListing.objects.filter(case=case, listing_date=obs.listing_date).first()
                or CourtListing.objects.filter(case=case, listing_date__isnull=True).first()
            )
        else:
            listing = CourtListing.objects.filter(case=case).first()
        old_status = listing.normalized_status if listing else None
        old_item = listing.item_number if listing else None
        old_token = listing.token_number if listing else ""
        old_hall = listing.court_hall if listing else None

        # Determine if a meaningful status or listing parameter change occurred
        status_changed = is_meaningful_status_transition(old_status, normalized_status)
        item_changed = obs.item_number is not None and obs.item_number != old_item
        token_changed = bool(obs.token_number) and obs.token_number != old_token
        hall_changed = obs.court_hall is not None and obs.court_hall != old_hall

        is_meaningful = status_changed or item_changed or token_changed or hall_changed

        # Update or create the CourtListing state
        if listing is None:
            listing = CourtListing.objects.create(
                case=case,
                court_name=obs.court_name,
                bench=obs.bench or "",
                court_hall=obs.court_hall,
                listing_date=obs.listing_date,
                session=obs.session or "",
                item_number=obs.item_number,
                token_number=obs.token_number or "",
                source_status=obs.source_status,
                normalized_status=normalized_status,
                provider_name=obs.provider_name,
                last_synced_at=now,
                is_mock=obs.is_mock,
            )
        else:
            listing.court_name = obs.court_name
            if obs.bench:
                listing.bench = obs.bench
            if obs.court_hall is not None:
                listing.court_hall = obs.court_hall
            if obs.listing_date is not None:
                listing.listing_date = obs.listing_date
            if obs.session:
                listing.session = obs.session
            if obs.item_number is not None:
                listing.item_number = obs.item_number
            if obs.token_number:
                listing.token_number = obs.token_number
            listing.source_status = obs.source_status
            listing.normalized_status = normalized_status
            listing.provider_name = obs.provider_name
            listing.last_synced_at = now
            listing.is_mock = obs.is_mock
            listing.save()

        # Create historical CourtStatusObservation
        observation = CourtStatusObservation.objects.create(
            case=case,
            court_listing=listing,
            source_status=obs.source_status,
            normalized_status=normalized_status,
            provider_name=obs.provider_name,
            observed_at=obs.observed_at,
            source_reference=obs.source_reference or "",
            court_hall=obs.court_hall,
            item_number=obs.item_number,
            token_number=obs.token_number or "",
            safe_metadata={
                **obs.safe_metadata,
                "is_recognized_source_status": is_recognized,
            },
            is_meaningful_change=is_meaningful,
            is_alert_dispatched=False,
        )

        # If meaningful, record in CaseHistory and dispatch advocate push/in-app notifications
        if is_meaningful:
            CaseHistoryService.record_court_status_change(
                case=case,
                old_status=old_status,
                new_status=normalized_status,
                court_hall=obs.court_hall,
                item_number=obs.item_number,
                token_number=obs.token_number,
                source="SYNC",
                provider_name=obs.provider_name,
            )

            cls.dispatch_status_change_notifications(
                case=case,
                observation=observation,
                old_status=old_status,
                new_status=normalized_status,
            )
            observation.is_alert_dispatched = True
            observation.save(update_fields=["is_alert_dispatched"])

        return listing, observation, is_meaningful

    @classmethod
    def sync_case_status(
        cls,
        case: Case,
        provider: CourtDataProvider | None = None,
        retry_config: RetryConfig | None = None,
        on_retry: Any | None = None,
    ) -> tuple[CourtListing | None, CourtStatusObservation | None, bool]:
        """Synchronize an individual case matter with the active court data provider.

        Features controlled exponential backoff retry for transient network errors.
        Never overwrites previous successful statuses if the provider fails.
        """
        active_provider = provider or get_court_data_provider()

        def _fetch():
            return active_provider.fetch_case_status(
                case_type=case.case_type,
                case_number=case.case_number,
                filing_year=case.filing_year,
            )

        obs = execute_with_retry(
            _fetch,
            config=retry_config,
            on_retry=on_retry,
            operation_name=f"Court status sync for {case.case_type} {case.case_number}/{case.filing_year}",
        )

        if obs is None:
            # Fallback observation when case is unlisted
            obs = CourtListingObservation(
                case_type=case.case_type,
                case_number=case.case_number,
                filing_year=case.filing_year,
                court_name="High Court of Andhra Pradesh",
                source_status="NOT_LISTED",
                provider_name=active_provider.provider_name,
                is_mock=not active_provider.is_live_provider,
            )

        listing, observation, is_meaningful = cls.record_and_process_observation(case, obs)
        return listing, observation, is_meaningful

    @classmethod
    def sync_all_tracked_cases(
        cls,
        provider: CourtDataProvider | None = None,
        heartbeat_callback: Any | None = None,
    ) -> dict[str, int]:
        """Scheduled batch synchronization task for all cases actively tracked by advocates.

        Resilient: failures for one case do not abort processing for subsequent cases.
        Optionally accepts a heartbeat_callback to renew distributed lock leases during long batches.
        """
        active_provider = provider or get_court_data_provider()
        tracked_cases = Case.objects.filter(tracked_by__isnull=False).distinct()

        results = {
            "total_cases": tracked_cases.count(),
            "synced_count": 0,
            "changed_count": 0,
            "error_count": 0,
        }

        for case in tracked_cases:
            try:
                _, _, changed = cls.sync_case_status(case, provider=active_provider)
                results["synced_count"] += 1
                if changed:
                    results["changed_count"] += 1
            except Exception as exc:
                results["error_count"] += 1
                logger.error(
                    "Error synchronizing court status for case %s (%s): %s",
                    case.id,
                    case,
                    exc,
                )
            finally:
                if heartbeat_callback is not None:
                    try:
                        heartbeat_callback()
                    except Exception as hb_exc:
                        logger.warning("Heartbeat callback failed during batch sync: %s", hb_exc)

        return results

    @classmethod
    def dispatch_status_change_notifications(
        cls,
        case: Case,
        observation: CourtStatusObservation,
        old_status: str | None,
        new_status: str,
    ) -> int:
        """Deliver advocate-isolated notifications for meaningful status transitions.

        Idempotent: prevents duplicate alerts for the same observation.
        """
        advocates = list(case.tracked_by.all())
        if not advocates:
            return 0

        case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"
        status_label = get_status_display_label(new_status)

        # Contextual title and message based on status
        if new_status == NormalizedCourtStatus.CALLED:
            title = f"MATTER CALLED: {case_ref}"
            body = (
                f"Matter {case_ref} is now CALLED in Court Hall {observation.court_hall or 'Unassigned'}, "
                f"Item #{observation.item_number or '—'}."
            )
        elif new_status == NormalizedCourtStatus.TOKEN_ALLOCATED:
            token_info = (
                f"Token #{observation.token_number}"
                if observation.token_number
                else "Token Allocated"
            )
            title = f"Court Token Alert: {case_ref}"
            body = f"{token_info} for {case_ref} in Court Hall {observation.court_hall or '—'}."
        elif new_status == NormalizedCourtStatus.IN_PROGRESS:
            title = f"Proceedings In Progress: {case_ref}"
            body = f"Hearing underway in Court Hall {observation.court_hall or '—'} for {case_ref}."
        elif new_status == NormalizedCourtStatus.ADJOURNED:
            title = f"Matter Adjourned: {case_ref}"
            body = f"Listing for {case_ref} has been adjourned."
        elif new_status == NormalizedCourtStatus.COMPLETED:
            title = f"Hearing Completed: {case_ref}"
            body = f"Proceedings concluded for {case_ref}."
        else:
            title = f"Court Status Update: {case_ref}"
            body = f"Status updated to {status_label} for {case_ref}."

        dispatched_count = 0
        for advocate in advocates:
            # Idempotency check: reuse existing notification record if already created for this observation
            existing = NotificationHistory.objects.filter(
                user=advocate,
                category="TOKEN_ALERT",
                data_payload__observation_id=observation.id,
            ).first()

            if existing:
                notification = existing
            else:
                notification = NotificationHistory.objects.create(
                    user=advocate,
                    title=title,
                    body=body,
                    category="TOKEN_ALERT",
                    data_payload={
                        "case_id": case.id,
                        "observation_id": observation.id,
                        "old_status": old_status,
                        "new_status": new_status,
                        "court_hall": observation.court_hall,
                        "item_number": observation.item_number,
                        "token_number": observation.token_number,
                        "observed_at": observation.observed_at.isoformat(),
                    },
                )

            try:
                NotificationService.dispatch_push_to_devices(
                    advocate, title, body, notification.data_payload
                )
                dispatched_count += 1
            except Exception as exc:
                logger.warning(
                    "Push notification dispatch failed for advocate %s on case %s: %s",
                    advocate.username,
                    case.id,
                    exc,
                )

            try:
                from apps.notifications.realtime import RealtimeService

                RealtimeService.publish_notification_event(notification)
                RealtimeService.publish_court_token_update(case, observation)
            except Exception as exc:
                logger.warning("Failed to emit court token realtime event: %s", exc)

        return dispatched_count


class CourtDataIngestionService:
    """Service responsible for parsing and synchronizing full court case dockets,

    hearings, judgments, and court listings into internal models while ensuring strict data safety:
    1. Never overwrites existing valid case data with empty or malformed fields.
    2. Prevents duplicate Case, Hearing, and Judgment records.
    3. Triggers automated hearing reminder scheduling when upcoming appearances change.
    4. Records comprehensive audit history for all synchronizations.
    """

    @classmethod
    @transaction.atomic
    def ingest_court_payload(
        cls,
        case: Case,
        payload: ParsedCourtCasePayload | dict[str, Any],
        changed_by: Any | None = None,
    ) -> dict[str, Any]:
        """Ingest a parsed or raw court response for a case."""
        if isinstance(payload, dict):
            parsed = CourtDataParser.parse_case_payload(payload)
        elif isinstance(payload, ParsedCourtCasePayload):
            parsed = payload
        else:
            raise InvalidCourtDataError(f"Unsupported payload type: {type(payload).__name__}")

        now = timezone.now()
        case_updated = False
        update_fields: list[str] = []

        # 1. Update case fields only if new valid values exist (Never overwrite with empty/None)
        if parsed.petitioner and parsed.petitioner != case.petitioner:
            case.petitioner = parsed.petitioner
            case_updated = True
            update_fields.append("petitioner")

        if parsed.respondent and parsed.respondent != case.respondent:
            case.respondent = parsed.respondent
            case_updated = True
            update_fields.append("respondent")

        if parsed.petitioner_advocate and parsed.petitioner_advocate != case.petitioner_advocate:
            case.petitioner_advocate = parsed.petitioner_advocate
            case_updated = True
            update_fields.append("petitioner_advocate")

        if parsed.respondent_advocate and parsed.respondent_advocate != case.respondent_advocate:
            case.respondent_advocate = parsed.respondent_advocate
            case_updated = True
            update_fields.append("respondent_advocate")

        if parsed.bench and parsed.bench != case.bench:
            case.bench = parsed.bench
            case_updated = True
            update_fields.append("bench")

        if (
            parsed.court_hall_number is not None
            and parsed.court_hall_number != case.court_hall_number
        ):
            case.court_hall_number = parsed.court_hall_number
            case_updated = True
            update_fields.append("court_hall_number")

        if parsed.current_stage and parsed.current_stage != case.current_stage:
            case.current_stage = parsed.current_stage
            case_updated = True
            update_fields.append("current_stage")

        old_hearing_date = case.next_hearing_date
        hearing_date_changed = False
        if (
            parsed.next_hearing_date is not None
            and parsed.next_hearing_date != case.next_hearing_date
        ):
            case.next_hearing_date = parsed.next_hearing_date
            hearing_date_changed = True
            case_updated = True
            update_fields.append("next_hearing_date")

        if case_updated:
            update_fields.append("updated_at")
            case.save(update_fields=update_fields)

        # 2. Ingest Hearings with deduplication by (case, hearing_date)
        hearings_synced = 0
        for h_data in parsed.hearings:
            hearing = Hearing.objects.filter(case=case, hearing_date=h_data.hearing_date).first()
            if hearing is None:
                hearing = Hearing.objects.create(
                    case=case,
                    hearing_date=h_data.hearing_date,
                    hearing_time=h_data.hearing_time,
                    court_hall_number=h_data.court_hall_number,
                    item_number=h_data.item_number,
                    business_conducted=h_data.business_conducted,
                    status=h_data.status,
                    next_date=h_data.next_date,
                )
                ReminderService.schedule_hearing_reminders(hearing)
            else:
                # Update existing hearing without creating duplicates
                h_update_fields: list[str] = []
                if h_data.hearing_time is not None and h_data.hearing_time != hearing.hearing_time:
                    hearing.hearing_time = h_data.hearing_time
                    h_update_fields.append("hearing_time")
                if (
                    h_data.court_hall_number is not None
                    and h_data.court_hall_number != hearing.court_hall_number
                ):
                    hearing.court_hall_number = h_data.court_hall_number
                    h_update_fields.append("court_hall_number")
                if h_data.item_number is not None and h_data.item_number != hearing.item_number:
                    hearing.item_number = h_data.item_number
                    h_update_fields.append("item_number")
                if (
                    h_data.business_conducted
                    and h_data.business_conducted != hearing.business_conducted
                ):
                    hearing.business_conducted = h_data.business_conducted
                    h_update_fields.append("business_conducted")
                if h_data.status and h_data.status != hearing.status:
                    hearing.status = h_data.status
                    h_update_fields.append("status")
                if h_data.next_date is not None and h_data.next_date != hearing.next_date:
                    hearing.next_date = h_data.next_date
                    h_update_fields.append("next_date")
                if h_update_fields:
                    h_update_fields.append("updated_at")
                    hearing.save(update_fields=h_update_fields)
            hearings_synced += 1

        # 3. Ingest Judgments with deduplication by (case, order_number) or (case, judgment_date)
        judgments_synced = 0
        for j_data in parsed.judgments:
            judgment = None
            if j_data.order_number:
                judgment = Judgment.objects.filter(
                    case=case, order_number=j_data.order_number
                ).first()
            if judgment is None:
                judgment = Judgment.objects.filter(
                    case=case, judgment_date=j_data.judgment_date
                ).first()

            if judgment is None:
                judgment = Judgment.objects.create(
                    case=case,
                    judgment_date=j_data.judgment_date,
                    order_number=j_data.order_number,
                    judgment_type=j_data.judgment_type,
                    bench=j_data.bench,
                    summary=j_data.summary,
                    document_link=j_data.document_link,
                )
                NotificationService.send_judgment_notification(
                    judgment=judgment,
                    is_new=True,
                    document_uploaded=bool(j_data.document_link),
                    changed_by=changed_by,
                )
            else:
                j_update_fields: list[str] = []
                if j_data.summary and j_data.summary != judgment.summary:
                    judgment.summary = j_data.summary
                    j_update_fields.append("summary")
                if j_data.document_link and j_data.document_link != judgment.document_link:
                    judgment.document_link = j_data.document_link
                    j_update_fields.append("document_link")
                if j_data.bench and j_data.bench != judgment.bench:
                    judgment.bench = j_data.bench
                    j_update_fields.append("bench")
                if j_update_fields:
                    j_update_fields.append("updated_at")
                    judgment.save(update_fields=j_update_fields)
            judgments_synced += 1

        # 4. Court Listing & Token status
        listing = None
        obs = None
        meaningful_change = False
        if parsed.source_status:
            court_obs = CourtListingObservation(
                case_type=case.case_type,
                case_number=case.case_number,
                filing_year=case.filing_year,
                court_name=parsed.court_name,
                bench=parsed.bench,
                court_hall=parsed.court_hall_number,
                listing_date=parsed.next_hearing_date,
                session=parsed.session,
                item_number=parsed.item_number,
                token_number=parsed.token_number,
                source_status=parsed.source_status,
                source_reference=parsed.source_reference,
                provider_name="APHC_INGESTION_PIPELINE",
                safe_metadata=parsed.safe_metadata,
            )
            listing, obs, meaningful_change = CourtStatusSyncService.record_and_process_observation(
                case, court_obs
            )

        # 5. Audit trail
        CaseHistoryService.record_court_status_change(
            case=case,
            old_status=str(old_hearing_date) if hearing_date_changed else "SYNC",
            new_status=str(case.next_hearing_date) if hearing_date_changed else "SYNCHRONIZED",
            court_hall=case.court_hall_number,
            item_number=parsed.item_number,
            token_number=parsed.token_number,
            source="SYNC",
            provider_name="APHC_DATA_INGESTION",
        )

        return {
            "status": "success",
            "case_id": case.id,
            "case_updated": case_updated,
            "hearings_synced": hearings_synced,
            "judgments_synced": judgments_synced,
            "listing_updated": listing is not None,
            "is_meaningful_change": meaningful_change,
            "synced_at": now.isoformat(),
        }
