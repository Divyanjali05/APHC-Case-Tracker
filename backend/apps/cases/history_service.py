import logging
from typing import Any

from django.db import transaction

from .models import Case, CaseHistory, Hearing, Judgment

logger = logging.getLogger(__name__)


class CaseHistoryService:
    """Centralized audit service recording chronological case modifications."""

    @classmethod
    @transaction.atomic
    def record_event(
        cls,
        case: Case,
        event_type: str,
        description: str,
        field_name: str = "",
        old_value: Any = "",
        new_value: Any = "",
        source: str = "MANUAL",
        changed_by: Any | None = None,
    ) -> CaseHistory | None:
        """
        Record a case history event if valid.
        Skips if both old_value and new_value are provided and identical.
        """
        str_old = str(old_value) if old_value is not None else ""
        str_new = str(new_value) if new_value is not None else ""

        # If tracking a specific field change, ensure the value actually changed
        if field_name and str_old and str_new and str_old == str_new:
            return None

        history_entry = CaseHistory.objects.create(
            case=case,
            event_type=event_type,
            field_name=field_name,
            old_value=str_old,
            new_value=str_new,
            description=description,
            source=source,
            changed_by=changed_by if getattr(changed_by, "is_authenticated", False) else None,
        )
        return history_entry

    @classmethod
    def record_case_creation(
        cls, case: Case, changed_by: Any | None = None, source: str = "MANUAL"
    ) -> CaseHistory:
        """Audit record when a new court matter is registered for tracking."""
        desc = (
            f"Case matter {case.case_type} {case.case_number}/{case.filing_year} "
            f"({case.petitioner} vs {case.respondent}) registered for tracking."
        )
        return cls.record_event(
            case=case,
            event_type="CASE_CREATED",
            description=desc,
            field_name="case",
            new_value=f"{case.case_type} {case.case_number}/{case.filing_year}",
            source=source,
            changed_by=changed_by,
        )

    @classmethod
    def record_case_update(
        cls,
        case: Case,
        old_data: dict,
        new_data: dict,
        changed_by: Any | None = None,
        source: str = "MANUAL",
    ) -> list[CaseHistory]:
        """Audit record when case fields are modified."""
        recorded = []

        # Stage change
        if "current_stage" in new_data:
            old_stage = old_data.get("current_stage", "")
            new_stage = new_data.get("current_stage", "")
            if old_stage != new_stage:
                entry = cls.record_event(
                    case=case,
                    event_type="STAGE_CHANGED",
                    field_name="current_stage",
                    old_value=old_stage,
                    new_value=new_stage,
                    description=f"Docket stage transitioned from '{old_stage}' to '{new_stage}'.",
                    source=source,
                    changed_by=changed_by,
                )
                if entry:
                    recorded.append(entry)

        # Next hearing date updated on case
        if "next_hearing_date" in new_data:
            old_dt = old_data.get("next_hearing_date")
            new_dt = new_data.get("next_hearing_date")
            if str(old_dt) != str(new_dt):
                entry = cls.record_event(
                    case=case,
                    event_type="HEARING_RESCHEDULED",
                    field_name="next_hearing_date",
                    old_value=str(old_dt) if old_dt else "None",
                    new_value=str(new_dt) if new_dt else "None",
                    description=f"Next hearing date scheduled to {new_dt} (was {old_dt}).",
                    source=source,
                    changed_by=changed_by,
                )
                if entry:
                    recorded.append(entry)

        # Bench assignment
        if "bench" in new_data and old_data.get("bench") != new_data.get("bench"):
            entry = cls.record_event(
                case=case,
                event_type="CASE_UPDATED",
                field_name="bench",
                old_value=old_data.get("bench", ""),
                new_value=new_data.get("bench", ""),
                description=f"Bench allocation updated to '{new_data.get('bench')}'.",
                source=source,
                changed_by=changed_by,
            )
            if entry:
                recorded.append(entry)

        # Court hall assignment
        if "court_hall_number" in new_data and old_data.get("court_hall_number") != new_data.get(
            "court_hall_number"
        ):
            entry = cls.record_event(
                case=case,
                event_type="CASE_UPDATED",
                field_name="court_hall_number",
                old_value=old_data.get("court_hall_number", ""),
                new_value=new_data.get("court_hall_number", ""),
                description=f"Court hall assigned to Court Hall {new_data.get('court_hall_number')}.",
                source=source,
                changed_by=changed_by,
            )
            if entry:
                recorded.append(entry)

        return recorded

    @classmethod
    def record_hearing_event(
        cls,
        hearing: Hearing,
        is_created: bool = False,
        old_data: dict | None = None,
        changed_by: Any | None = None,
        source: str = "MANUAL",
    ) -> CaseHistory | None:
        """Audit record for hearing proceedings and rescheduling."""
        case = hearing.case

        if is_created:
            desc = (
                f"Hearing appearance listed on {hearing.hearing_date}"
                f"{f' in Court Hall {hearing.court_hall_number}' if hearing.court_hall_number else ''}"
                f"{f' (Item #{hearing.item_number})' if hearing.item_number else ''}."
            )
            return cls.record_event(
                case=case,
                event_type="HEARING_SCHEDULED",
                field_name="hearing_date",
                new_value=str(hearing.hearing_date),
                description=desc,
                source=source,
                changed_by=changed_by,
            )

        if old_data:
            old_date = old_data.get("hearing_date")
            new_date = hearing.hearing_date
            old_next = old_data.get("next_date")
            new_next = hearing.next_date

            # Rescheduled hearing date
            if str(old_date) != str(new_date):
                return cls.record_event(
                    case=case,
                    event_type="HEARING_RESCHEDULED",
                    field_name="hearing_date",
                    old_value=str(old_date),
                    new_value=str(new_date),
                    description=f"Hearing appearance rescheduled from {old_date} to {new_date}.",
                    source=source,
                    changed_by=changed_by,
                )

            # Next date assigned on adjournment
            if str(old_next) != str(new_next) and new_next:
                return cls.record_event(
                    case=case,
                    event_type="HEARING_RESCHEDULED",
                    field_name="next_date",
                    old_value=str(old_next) if old_next else "None",
                    new_value=str(new_next),
                    description=f"Matter adjourned; next date posted to {new_next}.",
                    source=source,
                    changed_by=changed_by,
                )

            # Business conducted updated
            if hearing.business_conducted and hearing.business_conducted != old_data.get(
                "business_conducted"
            ):
                return cls.record_event(
                    case=case,
                    event_type="HEARING_PROCEEDINGS",
                    field_name="business_conducted",
                    old_value=old_data.get("business_conducted", ""),
                    new_value=hearing.business_conducted,
                    description=f"Court proceedings entered: '{hearing.business_conducted}'.",
                    source=source,
                    changed_by=changed_by,
                )

        return None

    @classmethod
    def record_judgment_event(
        cls,
        judgment: Judgment,
        is_created: bool = False,
        old_data: dict | None = None,
        changed_by: Any | None = None,
        source: str = "MANUAL",
    ) -> CaseHistory | None:
        """Audit record for judgment pronunciation and updates."""
        case = judgment.case

        if is_created:
            desc = (
                f"Judgment pronounced on {judgment.judgment_date} "
                f"by {judgment.bench or 'Bench'}"
                f"{f' (Order #{judgment.order_number})' if judgment.order_number else ''}."
            )
            return cls.record_event(
                case=case,
                event_type="JUDGMENT_ENTERED",
                field_name="judgment_date",
                new_value=str(judgment.judgment_date),
                description=desc,
                source=source,
                changed_by=changed_by,
            )

        if old_data:
            # Document reference updated
            if judgment.document_link and judgment.document_link != old_data.get("document_link"):
                return cls.record_event(
                    case=case,
                    event_type="DOCUMENT_UPDATED",
                    field_name="document_link",
                    old_value=old_data.get("document_link", ""),
                    new_value=judgment.document_link,
                    description="Official certified judgment document reference attached.",
                    source=source,
                    changed_by=changed_by,
                )

            # Summary or order number updated
            if (
                judgment.summary != old_data.get("summary")
                or judgment.order_number != old_data.get("order_number")
                or str(judgment.judgment_date) != str(old_data.get("judgment_date"))
            ):
                return cls.record_event(
                    case=case,
                    event_type="JUDGMENT_UPDATED",
                    field_name="summary",
                    old_value=old_data.get("summary", ""),
                    new_value=judgment.summary,
                    description=f"Judgment record updated for {judgment.judgment_date}.",
                    source=source,
                    changed_by=changed_by,
                )

        return None

    @classmethod
    def record_court_status_change(
        cls,
        case: Case,
        old_status: str | None,
        new_status: str,
        court_hall: int | None = None,
        item_number: int | None = None,
        token_number: str | None = None,
        source: str = "SYNC",
        provider_name: str = "APHC_REGISTRY_MOCK",
    ) -> CaseHistory | None:
        """Audit record for meaningful court listing and token status transitions."""
        hall_text = f" in Court Hall {court_hall}" if court_hall else ""
        item_text = f" (Item #{item_number})" if item_number else ""
        token_text = f" [Token: {token_number}]" if token_number else ""

        old_desc = old_status or "None"
        desc = (
            f"Court status transitioned from {old_desc} to {new_status}"
            f"{hall_text}{item_text}{token_text} via {provider_name}."
        )

        event_type = (
            "TOKEN_ALLOCATED" if new_status == "TOKEN_ALLOCATED" else "COURT_STATUS_CHANGED"
        )

        return cls.record_event(
            case=case,
            event_type=event_type,
            field_name="court_status",
            old_value=old_desc,
            new_value=new_status,
            description=desc,
            source=source,
        )
