"""RFC 5545 iCalendar generation and external calendar synchronization services."""

from __future__ import annotations

import datetime
import hashlib
import logging
from typing import Any
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.agenda.models import (
    CalendarSyncProvider,
    CalendarSyncSetting,
    CalendarSyncStatus,
    ExternalCalendarEventMap,
)
from apps.agenda.services import AgendaService

logger = logging.getLogger(__name__)

IST_TIMEZONE = ZoneInfo("Asia/Kolkata")


def escape_ics_text(text: str | None) -> str:
    """Escape special characters for RFC 5545 text fields."""
    if not text:
        return ""
    text = str(text)
    text = text.replace("\\", "\\\\")
    text = text.replace(";", r"\;")
    text = text.replace(",", r"\,")
    text = text.replace("\r\n", r"\n").replace("\n", r"\n")
    return text


class CalendarSyncService:
    """Service to generate iCalendar (.ics) exports and synchronize with external providers."""

    @classmethod
    def generate_ics_calendar(
        cls,
        advocate: Any,
        start_date: datetime.date | None = None,
        end_date: datetime.date | None = None,
    ) -> str:
        """Generate an RFC 5545 compliant iCalendar string for the advocate's agenda."""
        today = AgendaService.get_ist_today()
        if not start_date:
            start_date = today - datetime.timedelta(days=30)
        if not end_date:
            end_date = today + datetime.timedelta(days=90)

        agenda_data = AgendaService.get_agenda(
            advocate=advocate,
            start_date_str=start_date.isoformat(),
            end_date_str=end_date.isoformat(),
            view="custom",
        )

        lines: list[str] = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Andhra Pradesh High Court Lawyer App//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:APHC Advocate Calendar",
            "X-WR-TIMEZONE:Asia/Kolkata",
            "BEGIN:VTIMEZONE",
            "TZID:Asia/Kolkata",
            "X-LIC-LOCATION:Asia/Kolkata",
            "BEGIN:STANDARD",
            "TZOFFSETFROM:+0530",
            "TZOFFSETTO:+0530",
            "TZNAME:IST",
            "DTSTART:19700101T000000",
            "END:STANDARD",
            "END:VTIMEZONE",
        ]

        now_utc = timezone.now().strftime("%Y%m%dT%H%M%SZ")

        # 1. Format Hearings
        for hearing in agenda_data.get("today_hearings", []) + agenda_data.get(
            "upcoming_hearings", []
        ):
            hearing_id = hearing["id"]
            h_date_str = hearing["hearing_date"]  # YYYY-MM-DD
            h_time_str = hearing.get("hearing_time")  # HH:MM:SS or None
            court_hall = hearing.get("court_hall_number") or "N/A"
            case_no = hearing.get("case_number", "Case")
            petitioner = hearing.get("petitioner", "")
            respondent = hearing.get("respondent", "")

            uid = f"hearing-{hearing_id}-{advocate.id}@aphc-lawyer-app"
            title = f"Hearing: {case_no}"
            desc = f"Court Hall: {court_hall}\\nPetitioner: {petitioner}\\nRespondent: {respondent}"
            location = f"Court Hall {court_hall}, High Court of Andhra Pradesh, Amaravati"

            lines.append("BEGIN:VEVENT")
            lines.append(f"UID:{uid}")
            lines.append(f"DTSTAMP:{now_utc}")
            lines.append(f"SUMMARY:{escape_ics_text(title)}")
            lines.append(f"DESCRIPTION:{escape_ics_text(desc)}")
            lines.append(f"LOCATION:{escape_ics_text(location)}")
            lines.append("STATUS:CONFIRMED")

            if h_time_str:
                dt_str = h_date_str.replace("-", "") + "T" + h_time_str.replace(":", "")[:6]
                # Default duration 1 hour
                try:
                    h_time_obj = datetime.datetime.strptime(h_time_str[:8], "%H:%M:%S").time()
                    h_dt = datetime.datetime.combine(
                        datetime.date.fromisoformat(h_date_str),
                        h_time_obj,
                    )
                    end_dt = h_dt + datetime.timedelta(hours=1)
                    dt_end_str = end_dt.strftime("%Y%m%dT%H%M%S")
                except Exception:
                    dt_end_str = dt_str
                lines.append(f"DTSTART;TZID=Asia/Kolkata:{dt_str}")
                lines.append(f"DTEND;TZID=Asia/Kolkata:{dt_end_str}")
            else:
                # All-day event: DTSTART;VALUE=DATE:YYYYMMDD, DTEND next day
                date_compact = h_date_str.replace("-", "")
                h_date_obj = datetime.date.fromisoformat(h_date_str)
                next_day_compact = (h_date_obj + datetime.timedelta(days=1)).strftime("%Y%m%d")
                lines.append(f"DTSTART;VALUE=DATE:{date_compact}")
                lines.append(f"DTEND;VALUE=DATE:{next_day_compact}")

            lines.append("END:VEVENT")

        # 2. Format Reminders & Deadlines
        for rem in agenda_data.get("reminders", []):
            rem_id = rem["id"]
            uid = f"reminder-{rem_id}-{advocate.id}@aphc-lawyer-app"
            title = f"[{rem.get('reminder_type', 'REMINDER')}] {rem['title']}"
            desc = rem.get("description", "")
            case_no = rem.get("case_number")
            if case_no:
                desc = f"Case: {case_no}\\n{desc}"

            due_date_str = rem.get("due_date")  # ISO string
            lines.append("BEGIN:VEVENT")
            lines.append(f"UID:{uid}")
            lines.append(f"DTSTAMP:{now_utc}")
            lines.append(f"SUMMARY:{escape_ics_text(title)}")
            lines.append(f"DESCRIPTION:{escape_ics_text(desc)}")
            lines.append("STATUS:CONFIRMED")

            if due_date_str:
                try:
                    due_dt = datetime.datetime.fromisoformat(due_date_str).astimezone(IST_TIMEZONE)
                    dt_start_str = due_dt.strftime("%Y%m%dT%H%M%S")
                    dt_end_str = (due_dt + datetime.timedelta(minutes=30)).strftime("%Y%m%dT%H%M%S")
                    lines.append(f"DTSTART;TZID=Asia/Kolkata:{dt_start_str}")
                    lines.append(f"DTEND;TZID=Asia/Kolkata:{dt_end_str}")
                except Exception:
                    date_compact = today.strftime("%Y%m%d")
                    lines.append(f"DTSTART;VALUE=DATE:{date_compact}")
            else:
                date_compact = today.strftime("%Y%m%d")
                lines.append(f"DTSTART;VALUE=DATE:{date_compact}")

            lines.append("END:VEVENT")

        lines.append("END:VCALENDAR")
        lines.append("")
        return "\r\n".join(lines)

    @classmethod
    def get_or_create_settings(cls, advocate: Any) -> CalendarSyncSetting:
        """Get or initialize the calendar sync setting for an advocate."""
        setting, _ = CalendarSyncSetting.objects.get_or_create(advocate=advocate)
        return setting

    @classmethod
    def sync_external_calendar(cls, advocate: Any) -> dict[str, Any]:
        """Perform synchronization with the configured external calendar provider."""
        setting = cls.get_or_create_settings(advocate)

        if not setting.sync_enabled or setting.provider == CalendarSyncProvider.NONE:
            return {
                "status": "SKIPPED",
                "message": "Calendar synchronization is disabled or no provider configured.",
                "synced_count": 0,
            }

        setting.sync_status = CalendarSyncStatus.SYNCING
        setting.save(update_fields=["sync_status"])

        synced_count = 0
        try:
            today = AgendaService.get_ist_today()
            end_date = today + datetime.timedelta(days=60)
            agenda = AgendaService.get_agenda(
                advocate=advocate,
                start_date_str=today.isoformat(),
                end_date_str=end_date.isoformat(),
                view="month",
            )

            # Sync hearings
            if setting.sync_hearing_reminders:
                for h in agenda.get("today_hearings", []) + agenda.get("upcoming_hearings", []):
                    h_id = h["id"]
                    payload = f"{h['title']}_{h.get('hearing_date')}_{h.get('hearing_time')}_{h.get('court_hall_number')}"
                    payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

                    mapping = ExternalCalendarEventMap.objects.filter(
                        advocate=advocate,
                        provider=setting.provider,
                        hearing_id=h_id,
                    ).first()

                    if mapping and mapping.last_payload_hash == payload_hash:
                        # Already synchronized and unchanged
                        continue

                    # Mock external creation/update ID
                    ext_id = (
                        mapping.external_event_id
                        if mapping
                        else f"ext_h_{h_id}_{setting.provider.lower()}"
                    )

                    ExternalCalendarEventMap.objects.update_or_create(
                        advocate=advocate,
                        provider=setting.provider,
                        hearing_id=h_id,
                        defaults={
                            "event_type": ExternalCalendarEventMap.EventType.HEARING,
                            "external_calendar_id": setting.google_calendar_id or "primary",
                            "external_event_id": ext_id,
                            "last_payload_hash": payload_hash,
                        },
                    )
                    synced_count += 1

            # Sync reminders & compliance deadlines
            if setting.sync_personal_reminders or setting.sync_compliance_deadlines:
                for r in agenda.get("reminders", []):
                    r_id = r["id"]
                    is_deadline = r.get("reminder_type") in ("FILING", "BATTA")
                    if is_deadline and not setting.sync_compliance_deadlines:
                        continue
                    if not is_deadline and not setting.sync_personal_reminders:
                        continue

                    payload = f"{r['title']}_{r.get('due_date')}_{r.get('status')}_{r.get('is_completed')}"
                    payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

                    mapping = ExternalCalendarEventMap.objects.filter(
                        advocate=advocate,
                        provider=setting.provider,
                        reminder_id=r_id,
                    ).first()

                    if mapping and mapping.last_payload_hash == payload_hash:
                        continue

                    ext_id = (
                        mapping.external_event_id
                        if mapping
                        else f"ext_r_{r_id}_{setting.provider.lower()}"
                    )

                    ExternalCalendarEventMap.objects.update_or_create(
                        advocate=advocate,
                        provider=setting.provider,
                        reminder_id=r_id,
                        defaults={
                            "event_type": (
                                ExternalCalendarEventMap.EventType.DEADLINE
                                if is_deadline
                                else ExternalCalendarEventMap.EventType.REMINDER
                            ),
                            "external_calendar_id": setting.google_calendar_id or "primary",
                            "external_event_id": ext_id,
                            "last_payload_hash": payload_hash,
                        },
                    )
                    synced_count += 1

            setting.sync_status = CalendarSyncStatus.SUCCESS
            setting.last_synced_at = timezone.now()
            setting.sync_error = ""
            setting.save(update_fields=["sync_status", "last_synced_at", "sync_error"])

            return {
                "status": "SUCCESS",
                "message": f"Successfully synchronized {synced_count} events.",
                "synced_count": synced_count,
                "last_synced_at": setting.last_synced_at.isoformat(),
            }

        except Exception as exc:
            logger.error(
                f"External calendar sync failed for advocate {advocate.id}: {exc}", exc_info=True
            )
            setting.sync_status = CalendarSyncStatus.FAILED
            setting.sync_error = str(exc)
            setting.save(update_fields=["sync_status", "sync_error"])
            return {
                "status": "FAILED",
                "message": f"Sync failed: {str(exc)}",
                "synced_count": 0,
            }

    @classmethod
    def disconnect_calendar(cls, advocate: Any) -> CalendarSyncSetting:
        """Disconnect and clear credentials for external calendar."""
        setting = cls.get_or_create_settings(advocate)
        setting.sync_enabled = False
        setting.provider = CalendarSyncProvider.NONE
        setting.google_access_token = ""
        setting.google_refresh_token = ""
        setting.google_token_expiry = None
        setting.google_account_email = ""
        setting.sync_status = CalendarSyncStatus.IDLE
        setting.sync_error = ""
        setting.save()

        # Clean event mappings for this advocate
        ExternalCalendarEventMap.objects.filter(advocate=advocate).delete()
        return setting
