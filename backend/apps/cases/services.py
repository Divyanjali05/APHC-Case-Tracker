from datetime import date, timedelta
from typing import Any

from django.db.models import Q
from django.utils import timezone


class CaseStatusService:
    """Service to compute derived court status, canonical lifecycle buckets, and judgment metadata."""

    STATUS_ADJOURNED = "Adjourned"
    STATUS_DISPOSED = "Disposed"
    STATUS_JUDGMENT_AVAILABLE = "Judgment Available"
    STATUS_UPCOMING = "Upcoming"
    STATUS_PENDING = "Pending Hearing"

    CANONICAL_PENDING = "PENDING"
    CANONICAL_DISPOSED = "DISPOSED"
    CANONICAL_ADJOURNED = "ADJOURNED"

    DISPOSED_STAGES = ("DISPOSED", "CLOSED", "COMPLETED", "DECIDED")

    ADJOURNMENT_KEYWORDS = (
        "adjourn",
        "adjourned",
        "adjournment",
        "post to",
        "posted to",
        "stand over",
        "re-notified",
        "call on",
    )

    @classmethod
    def disposed_q(cls) -> Q:
        """Canonical queryset filter for DISPOSED cases (disposed stage OR judgment attached)."""
        stage_q = Q()
        for stage in cls.DISPOSED_STAGES:
            stage_q |= Q(current_stage__iexact=stage)
        return stage_q | Q(judgments__isnull=False)

    @classmethod
    def adjourned_q(cls) -> Q:
        """Canonical queryset filter for active ADJOURNED cases (strictly non-disposed)."""
        return ~cls.disposed_q() & (
            Q(current_stage__iexact="ADJOURNED")
            | Q(hearings__business_conducted__icontains="adjourn")
        )

    @classmethod
    def pending_q(cls) -> Q:
        """Canonical queryset filter for active PENDING cases (non-disposed and non-adjourned)."""
        return ~cls.disposed_q() & ~cls.adjourned_q()

    @classmethod
    def get_latest_judgment(cls, case):
        """Retrieve the latest judgment record for the case."""
        if hasattr(case, "judgments"):
            return case.judgments.all().order_by("-judgment_date", "-created_at").first()
        return None

    @classmethod
    def get_latest_hearing(cls, case):
        """Retrieve the latest hearing record for the case."""
        if hasattr(case, "hearings"):
            return case.hearings.all().order_by("-hearing_date", "-id").first()
        return None

    @classmethod
    def calculate_status(cls, case) -> dict[str, Any]:
        """
        Derive display status, canonical bucket ('PENDING' | 'DISPOSED' | 'ADJOURNED'),
        effective next hearing date, and judgment metadata.

        Canonical buckets are mutually exclusive and exhaustive:
          Total = Pending + Disposed + Adjourned
        """
        today = timezone.localdate() if hasattr(timezone, "localdate") else date.today()
        stage_upper = (case.current_stage or "").strip().upper()
        latest_judgment = cls.get_latest_judgment(case)
        latest_hearing = cls.get_latest_hearing(case)

        # 1A. Disposed with certified judgment
        if latest_judgment is not None:
            return {
                "status": cls.STATUS_JUDGMENT_AVAILABLE,
                "canonical_status": cls.CANONICAL_DISPOSED,
                "is_disposed": True,
                "next_hearing_date": None,
                "judgment_date": latest_judgment.judgment_date,
                "has_judgment": True,
                "has_hearings": latest_hearing is not None,
                "judgment_id": latest_judgment.id,
            }

        # 1B. Disposed / Closed without judgment uploaded yet
        if stage_upper in cls.DISPOSED_STAGES:
            return {
                "status": cls.STATUS_DISPOSED,
                "canonical_status": cls.CANONICAL_DISPOSED,
                "is_disposed": True,
                "next_hearing_date": None,
                "judgment_date": None,
                "has_judgment": False,
                "has_hearings": latest_hearing is not None,
                "judgment_id": None,
            }

        # 2. Adjourned (explicit stage or latest hearing proceedings indicate adjournment)
        business = (latest_hearing.business_conducted or "").lower() if latest_hearing else ""
        is_adjourned_text = any(keyword in business for keyword in cls.ADJOURNMENT_KEYWORDS)
        stage_is_adjourned = stage_upper == "ADJOURNED"

        if stage_is_adjourned or is_adjourned_text:
            effective_next_date = (
                latest_hearing.next_date if latest_hearing else None
            ) or case.next_hearing_date
            return {
                "status": cls.STATUS_ADJOURNED,
                "canonical_status": cls.CANONICAL_ADJOURNED,
                "is_disposed": False,
                "next_hearing_date": effective_next_date,
                "judgment_date": None,
                "has_judgment": False,
                "has_hearings": latest_hearing is not None,
                "judgment_id": None,
            }

        # 3A. Pending with upcoming hearing scheduled
        candidate_upcoming_date = None
        if case.next_hearing_date and case.next_hearing_date >= today:
            candidate_upcoming_date = case.next_hearing_date
        elif latest_hearing and latest_hearing.next_date and latest_hearing.next_date >= today:
            candidate_upcoming_date = latest_hearing.next_date
        elif (
            latest_hearing and latest_hearing.hearing_date and latest_hearing.hearing_date >= today
        ):
            candidate_upcoming_date = latest_hearing.hearing_date
        elif stage_upper in (
            "UPCOMING",
            "LISTED",
            "FOR ADMISSION",
            "FOR HEARING",
        ):
            candidate_upcoming_date = case.next_hearing_date

        if candidate_upcoming_date is not None or stage_upper in (
            "UPCOMING",
            "LISTED",
        ):
            return {
                "status": cls.STATUS_UPCOMING,
                "canonical_status": cls.CANONICAL_PENDING,
                "is_disposed": False,
                "next_hearing_date": candidate_upcoming_date or case.next_hearing_date,
                "judgment_date": None,
                "has_judgment": False,
                "has_hearings": latest_hearing is not None,
                "judgment_id": None,
            }

        # 3B. Pending without upcoming hearing scheduled
        return {
            "status": cls.STATUS_PENDING,
            "canonical_status": cls.CANONICAL_PENDING,
            "is_disposed": False,
            "next_hearing_date": case.next_hearing_date
            or (latest_hearing.next_date if latest_hearing else None),
            "judgment_date": None,
            "has_judgment": False,
            "has_hearings": latest_hearing is not None,
            "judgment_id": None,
        }


class DashboardService:
    """Service to aggregate advocate dashboard statistics, hearings, reminders, and alerts."""

    @classmethod
    def get_dashboard_data(cls, user) -> dict[str, Any]:
        from apps.cases.models import Case, CaseHistory, Hearing
        from apps.court_data.models import CourtListing
        from apps.notifications.models import NotificationHistory
        from apps.reminders.models import Reminder

        today = timezone.localdate() if hasattr(timezone, "localdate") else timezone.now().date()

        # 1. Summary Statistics - Strictly isolated to user's tracked cases and aligned with
        #    CaseStatusService's mutually exclusive canonical buckets:
        #    Total = Pending + Disposed + Adjourned
        user_cases = Case.objects.filter(tracked_by=user)
        total_cases = user_cases.count()
        disposed_cases = user_cases.filter(CaseStatusService.disposed_q()).distinct().count()
        adjourned_cases = user_cases.filter(CaseStatusService.adjourned_q()).distinct().count()
        pending_cases = user_cases.filter(CaseStatusService.pending_q()).distinct().count()

        # 2. Today's Hearings
        today_hearings_qs = (
            Hearing.objects.filter(
                case__tracked_by=user,
                hearing_date=today,
            )
            .exclude(status="CANCELLED")
            .select_related("case")
            .order_by("hearing_time", "item_number")
        )
        today_hearings = []
        for h in today_hearings_qs:
            today_hearings.append(
                {
                    "id": h.id,
                    "case_id": h.case.id,
                    "case_number": f"{h.case.case_type} {h.case.case_number}/{h.case.filing_year}",
                    "petitioner": h.case.petitioner,
                    "respondent": h.case.respondent,
                    "court_hall": h.court_hall_number or h.case.court_hall_number,
                    "item_number": h.item_number,
                    "judge": h.case.bench or "",
                    "hearing_date": h.hearing_date,
                    "hearing_time": h.hearing_time,
                    "status": h.status,
                }
            )

        # 3. Upcoming Hearings (next 5)
        upcoming_hearings_qs = (
            Hearing.objects.filter(
                case__tracked_by=user,
                hearing_date__gt=today,
            )
            .exclude(status__in=["COMPLETED", "CANCELLED"])
            .select_related("case")
            .order_by("hearing_date", "hearing_time")[:5]
        )
        upcoming_hearings = []
        for h in upcoming_hearings_qs:
            upcoming_hearings.append(
                {
                    "id": h.id,
                    "case_id": h.case.id,
                    "case_number": f"{h.case.case_type} {h.case.case_number}/{h.case.filing_year}",
                    "petitioner": h.case.petitioner,
                    "respondent": h.case.respondent,
                    "court_hall": h.court_hall_number or h.case.court_hall_number,
                    "item_number": h.item_number,
                    "judge": h.case.bench or "",
                    "hearing_date": h.hearing_date,
                    "hearing_time": h.hearing_time,
                    "status": h.status,
                }
            )

        # 4. Upcoming Reminders (next 5 pending)
        upcoming_reminders_qs = (
            Reminder.objects.filter(
                advocate=user,
                status__in=["PENDING", "PROCESSING"],
            )
            .select_related("case")
            .order_by("due_date")[:5]
        )
        upcoming_reminders = []
        for r in upcoming_reminders_qs:
            case_num = (
                f"{r.case.case_type} {r.case.case_number}/{r.case.filing_year}" if r.case else None
            )
            upcoming_reminders.append(
                {
                    "id": r.id,
                    "case_id": r.case.id if r.case else None,
                    "case_number": case_num,
                    "title": r.title,
                    "reminder_type": r.reminder_type,
                    "due_date": r.due_date,
                    "status": r.status,
                }
            )

        # 5. Recent Notifications (last 5)
        notifications_qs = NotificationHistory.objects.filter(user=user).order_by("-sent_at")[:5]
        recent_notifications = []
        for n in notifications_qs:
            cid = None
            if isinstance(n.data_payload, dict):
                cid = n.data_payload.get("case_id")
            recent_notifications.append(
                {
                    "id": n.id,
                    "title": n.title,
                    "body": n.body,
                    "category": n.category,
                    "is_read": n.is_read,
                    "sent_at": n.sent_at,
                    "case_id": cid,
                }
            )

        # 5b. Recent Case Activity (last 5 non-confidential events across tracked cases)
        private_note_events = ["NOTE_ADDED", "NOTE_UPDATED", "NOTE_DELETED"]
        activity_qs = (
            CaseHistory.objects.filter(case__tracked_by=user)
            .exclude(Q(event_type__in=private_note_events) & ~Q(changed_by=user))
            .select_related("case")
            .order_by("-created_at")[:5]
        )
        recent_activity = []
        for entry in activity_qs:
            recent_activity.append(
                {
                    "id": entry.id,
                    "case_id": entry.case_id,
                    "case_number": f"{entry.case.case_type} {entry.case.case_number}/{entry.case.filing_year}",
                    "event_type": entry.event_type,
                    "description": entry.description,
                    "source": entry.source,
                    "created_at": entry.created_at,
                }
            )

        # 6. Court Data Sync Status
        latest_listing = (
            CourtListing.objects.filter(case__tracked_by=user, last_synced_at__isnull=False)
            .order_by("-last_synced_at")
            .first()
        )
        last_synced_at = latest_listing.last_synced_at if latest_listing else None

        is_fresh = False
        sync_state = "NEVER_SYNCED"
        if last_synced_at:
            time_diff = timezone.now() - last_synced_at
            is_fresh = time_diff < timedelta(hours=24)
            sync_state = "FRESH" if is_fresh else "STALE"

        return {
            "summary": {
                "total_cases": total_cases,
                "pending_cases": pending_cases,
                "disposed_cases": disposed_cases,
                "adjourned_cases": adjourned_cases,
            },
            "today_hearings": today_hearings,
            "upcoming_hearings": upcoming_hearings,
            "upcoming_reminders": upcoming_reminders,
            "recent_notifications": recent_notifications,
            "recent_activity": recent_activity,
            "sync_status": {
                "last_synced_at": last_synced_at,
                "is_fresh": is_fresh,
                "status": sync_state,
            },
        }
