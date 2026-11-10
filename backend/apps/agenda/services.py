"""Service layer for Advocate Daily Agenda, Calendar views, and Event Aggregation."""

from __future__ import annotations

import datetime
import logging
from typing import Any
from zoneinfo import ZoneInfo

from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.cases.models import Hearing
from apps.reminders.models import Reminder
from apps.tokens.models import TokenAlertRule

logger = logging.getLogger(__name__)

IST_TIMEZONE = ZoneInfo("Asia/Kolkata")


class AgendaService:
    """Consolidated calendar and agenda service for Andhra Pradesh High Court advocates."""

    @classmethod
    def get_ist_now(cls) -> datetime.datetime:
        """Return current timezone-aware timestamp in Asia/Kolkata."""
        return timezone.now().astimezone(IST_TIMEZONE)

    @classmethod
    def get_ist_today(cls) -> datetime.date:
        """Return current date in Asia/Kolkata."""
        return cls.get_ist_now().date()

    @classmethod
    def resolve_date_range(
        cls,
        date_str: str | None = None,
        start_date_str: str | None = None,
        end_date_str: str | None = None,
        view: str = "day",
    ) -> tuple[datetime.date, datetime.date, datetime.date]:
        """Resolve start_date, end_date and selected_date respecting IST timezone boundaries."""
        today = cls.get_ist_today()
        selected_date = parse_date(date_str) if date_str else today
        if not selected_date:
            selected_date = today

        view_lower = (view or "day").lower().strip()

        if start_date_str and end_date_str:
            parsed_start = parse_date(start_date_str)
            parsed_end = parse_date(end_date_str)
            if parsed_start and parsed_end:
                return selected_date, parsed_start, parsed_end

        if view_lower == "week":
            # Monday (0) to Sunday (6)
            start_date = selected_date - datetime.timedelta(days=selected_date.weekday())
            end_date = start_date + datetime.timedelta(days=6)
        elif view_lower == "month":
            # 1st of month to last day of month
            start_date = selected_date.replace(day=1)
            next_month = (start_date.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
            end_date = next_month - datetime.timedelta(days=1)
        else:
            # Day view
            start_date = selected_date
            end_date = selected_date

        return selected_date, start_date, end_date

    @classmethod
    def get_agenda(
        cls,
        advocate: Any,
        date_str: str | None = None,
        start_date_str: str | None = None,
        end_date_str: str | None = None,
        view: str = "day",
    ) -> dict[str, Any]:
        """Generate comprehensive, aggregated agenda for the authenticated advocate."""
        selected_date, start_date, end_date = cls.resolve_date_range(
            date_str, start_date_str, end_date_str, view
        )
        today = cls.get_ist_today()

        # Build start and end datetime in IST
        start_dt = datetime.datetime.combine(start_date, datetime.time.min, tzinfo=IST_TIMEZONE)
        end_dt = datetime.datetime.combine(end_date, datetime.time.max, tzinfo=IST_TIMEZONE)

        # 1. Fetch Hearings in date range
        hearings_qs = (
            Hearing.objects.filter(
                case__tracked_by=advocate,
                hearing_date__range=[start_date, end_date],
            )
            .select_related("case")
            .order_by("hearing_date", "hearing_time", "court_hall_number", "item_number")
        )

        formatted_hearings = []
        events_by_date: dict[str, list[dict[str, Any]]] = {}

        for h in hearings_qs:
            case = h.case
            case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"
            d_str = h.hearing_date.isoformat()
            if d_str not in events_by_date:
                events_by_date[d_str] = []

            h_dict = {
                "id": h.id,
                "event_type": "HEARING",
                "title": f"Hearing: {case_ref}",
                "case_id": case.id,
                "case_number": case_ref,
                "case_type": case.case_type,
                "petitioner": case.petitioner,
                "respondent": case.respondent,
                "court_name": "High Court of Andhra Pradesh",
                "court_hall_number": h.court_hall_number or case.court_hall_number,
                "item_number": h.item_number,
                "bench": case.bench or "",
                "hearing_date": h.hearing_date.isoformat(),
                "hearing_time": h.hearing_time.isoformat() if h.hearing_time else None,
                "is_all_day": not bool(h.hearing_time),
                "status": h.status,
                "business_conducted": h.business_conducted or "",
            }
            formatted_hearings.append(h_dict)
            events_by_date[d_str].append(h_dict)

        # 2. Fetch Reminders in range
        reminders_qs = (
            Reminder.objects.filter(
                advocate=advocate,
                due_date__range=[start_dt, end_dt],
            )
            .exclude(status="CANCELLED")
            .select_related("case")
            .order_by("due_date")
        )

        formatted_reminders = []
        compliance_deadlines = []

        for r in reminders_qs:
            due_ist = r.due_date.astimezone(IST_TIMEZONE)
            d_str = due_ist.date().isoformat()
            if d_str not in events_by_date:
                events_by_date[d_str] = []

            case_ref = (
                f"{r.case.case_type} {r.case.case_number}/{r.case.filing_year}" if r.case else None
            )

            r_dict = {
                "id": r.id,
                "event_type": "REMINDER",
                "title": r.title,
                "description": r.description or "",
                "case_id": r.case_id,
                "case_number": case_ref,
                "due_date": due_ist.isoformat(),
                "date": d_str,
                "time": due_ist.strftime("%H:%M:%S"),
                "reminder_type": r.reminder_type,
                "status": r.status,
                "is_completed": r.is_completed,
            }
            formatted_reminders.append(r_dict)
            events_by_date[d_str].append(r_dict)

            if r.reminder_type in ("FILING", "BATTA") or "deadline" in r.title.lower():
                compliance_deadlines.append(r_dict)

        # 3. Fetch Token Events in range
        token_rules_qs = (
            TokenAlertRule.objects.filter(
                advocate=advocate,
                hearing_date__range=[start_date, end_date],
            )
            .select_related("court_hall", "case")
            .order_by("hearing_date")
        )

        formatted_tokens = []
        for tr in token_rules_qs:
            d_str = tr.hearing_date.isoformat()
            if d_str not in events_by_date:
                events_by_date[d_str] = []

            t_dict = {
                "id": tr.id,
                "event_type": "TOKEN",
                "title": f"Token Alert: #{tr.token_number} (Hall {tr.court_hall.hall_number})",
                "token_number": tr.token_number,
                "item_number": getattr(tr, "listed_item_number", getattr(tr, "item_number", None)),
                "court_hall_number": tr.court_hall.hall_number,
                "court_name": getattr(
                    tr,
                    "court_name",
                    getattr(tr.court_hall, "bench_name", f"Court Hall {tr.court_hall.hall_number}"),
                ),
                "hearing_date": tr.hearing_date.isoformat(),
                "status": tr.status,
                "last_observed_token": getattr(
                    tr, "current_called_token", getattr(tr, "last_observed_token", "")
                ),
                "last_observed_at": (
                    tr.last_synced_at.astimezone(IST_TIMEZONE).isoformat()
                    if getattr(tr, "last_synced_at", None)
                    else (
                        tr.last_observed_at.astimezone(IST_TIMEZONE).isoformat()
                        if getattr(tr, "last_observed_at", None)
                        else None
                    )
                ),
                "case_id": tr.case_id,
            }
            formatted_tokens.append(t_dict)
            events_by_date[d_str].append(t_dict)

        # 4. Filter Today's Hearings (on selected date)
        today_hearings = [
            h for h in formatted_hearings if h["hearing_date"] == selected_date.isoformat()
        ]

        # 5. Fetch Next Upcoming Hearings (chronological from today)
        upcoming_hearings_qs = (
            Hearing.objects.filter(
                case__tracked_by=advocate,
                hearing_date__gte=today,
            )
            .exclude(status__in=["COMPLETED", "CANCELLED"])
            .select_related("case")
            .order_by("hearing_date", "hearing_time")[:10]
        )
        upcoming_hearings = []
        for uh in upcoming_hearings_qs:
            ucase = uh.case
            upcoming_hearings.append(
                {
                    "id": uh.id,
                    "event_type": "HEARING",
                    "title": f"Hearing: {ucase.case_type} {ucase.case_number}/{ucase.filing_year}",
                    "case_id": ucase.id,
                    "case_number": f"{ucase.case_type} {ucase.case_number}/{ucase.filing_year}",
                    "court_hall_number": uh.court_hall_number or ucase.court_hall_number,
                    "hearing_date": uh.hearing_date.isoformat(),
                    "hearing_time": uh.hearing_time.isoformat() if uh.hearing_time else None,
                    "status": uh.status,
                }
            )

        # 6. Compute Aggregated Summary
        pending_reminders_count = sum(
            1 for r in formatted_reminders if r["status"] in ("PENDING", "PROCESSING")
        )
        completed_events_count = sum(
            1 for h in formatted_hearings if h["status"] in ("COMPLETED", "ADJOURNED")
        ) + sum(1 for r in formatted_reminders if r["is_completed"])

        total_events = len(formatted_hearings) + len(formatted_reminders) + len(formatted_tokens)

        return {
            "view": view,
            "selected_date": selected_date.isoformat(),
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "timezone": "Asia/Kolkata",
            "summary": {
                "total_events": total_events,
                "today_hearings": len(today_hearings),
                "upcoming_hearings": len(upcoming_hearings),
                "pending_reminders": pending_reminders_count,
                "completed_events": completed_events_count,
            },
            "today_hearings": today_hearings,
            "upcoming_hearings": upcoming_hearings,
            "reminders": formatted_reminders,
            "compliance_deadlines": compliance_deadlines,
            "token_events": formatted_tokens,
            "events_by_date": events_by_date,
        }

    @classmethod
    def create_personal_reminder(
        cls,
        advocate: Any,
        title: str,
        due_date: datetime.datetime,
        description: str = "",
        case_id: int | None = None,
        reminder_type: str = "GENERAL",
    ) -> Reminder:
        """Create a personal reminder or compliance deadline for the advocate."""
        from apps.cases.models import Case

        case_obj = None
        if case_id:
            try:
                case_obj = Case.objects.get(id=case_id, tracked_by=advocate)
            except Case.DoesNotExist as err:
                raise ValueError("Associated case not found or not tracked by advocate.") from err

        # Ensure due_date is timezone-aware in IST
        if timezone.is_naive(due_date):
            due_date = timezone.make_aware(due_date, IST_TIMEZONE)

        # Prevent exact duplicate active reminder
        existing = Reminder.objects.filter(
            advocate=advocate,
            title__iexact=title.strip(),
            due_date=due_date,
            status__in=["PENDING", "PROCESSING"],
        ).first()
        if existing:
            return existing

        return Reminder.objects.create(
            advocate=advocate,
            case=case_obj,
            title=title.strip(),
            description=description.strip(),
            due_date=due_date,
            reminder_type=reminder_type,
            status="PENDING",
            is_completed=False,
        )

    @classmethod
    def update_reminder(
        cls,
        advocate: Any,
        reminder_id: int,
        title: str | None = None,
        description: str | None = None,
        due_date: datetime.datetime | None = None,
        is_completed: bool | None = None,
    ) -> Reminder:
        """Update an advocate reminder."""
        reminder = Reminder.objects.get(id=reminder_id, advocate=advocate)
        update_fields = ["updated_at"]

        if title is not None:
            reminder.title = title.strip()
            update_fields.append("title")

        if description is not None:
            reminder.description = description.strip()
            update_fields.append("description")

        if due_date is not None:
            if timezone.is_naive(due_date):
                due_date = timezone.make_aware(due_date, IST_TIMEZONE)
            reminder.due_date = due_date
            update_fields.append("due_date")

        if is_completed is not None:
            reminder.is_completed = is_completed
            if is_completed:
                reminder.status = "DISMISSED"
            update_fields.extend(["is_completed", "status"])

        reminder.save(update_fields=update_fields)
        return reminder

    @classmethod
    def delete_reminder(cls, advocate: Any, reminder_id: int) -> None:
        """Delete an advocate reminder."""
        reminder = Reminder.objects.get(id=reminder_id, advocate=advocate)
        reminder.delete()
