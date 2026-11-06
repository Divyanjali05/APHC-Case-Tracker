from datetime import date
from typing import Any

from django.utils import timezone


class CaseStatusService:
    """Service to compute derived court status, next hearing dates, and judgment metadata."""

    STATUS_ADJOURNED = "Adjourned"
    STATUS_JUDGMENT_AVAILABLE = "Judgment Available"
    STATUS_UPCOMING = "Upcoming"
    STATUS_PENDING = "Pending Hearing"

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
        Derive case status, effective next hearing date, and judgment info.

        Returns dict with:
          - status: str ('Judgment Available', 'Adjourned', 'Upcoming', 'Pending Hearing')
          - next_hearing_date: Optional[date]
          - judgment_date: Optional[date]
          - has_judgment: bool
          - has_hearings: bool
          - judgment_id: Optional[int]
        """
        today = timezone.localdate() if hasattr(timezone, "localdate") else date.today()
        latest_judgment = cls.get_latest_judgment(case)
        latest_hearing = cls.get_latest_hearing(case)

        # Scenario B - Judgment entered
        if latest_judgment is not None:
            return {
                "status": cls.STATUS_JUDGMENT_AVAILABLE,
                "next_hearing_date": None,
                "judgment_date": latest_judgment.judgment_date,
                "has_judgment": True,
                "has_hearings": latest_hearing is not None,
                "judgment_id": latest_judgment.id,
            }

        # Scenario A - Adjourned: latest hearing indicates an adjournment
        if latest_hearing is not None:
            business = (latest_hearing.business_conducted or "").lower()
            is_adjourned_text = any(keyword in business for keyword in cls.ADJOURNMENT_KEYWORDS)
            stage_is_adjourned = (case.current_stage or "").upper() == "ADJOURNED"

            if is_adjourned_text or stage_is_adjourned:
                effective_next_date = latest_hearing.next_date or case.next_hearing_date
                return {
                    "status": cls.STATUS_ADJOURNED,
                    "next_hearing_date": effective_next_date,
                    "judgment_date": None,
                    "has_judgment": False,
                    "has_hearings": True,
                    "judgment_id": None,
                }

        # Scenario C - Upcoming hearing
        candidate_upcoming_date = None
        if case.next_hearing_date and case.next_hearing_date >= today:
            candidate_upcoming_date = case.next_hearing_date
        elif latest_hearing and latest_hearing.next_date and latest_hearing.next_date >= today:
            candidate_upcoming_date = latest_hearing.next_date
        elif (
            latest_hearing and latest_hearing.hearing_date and latest_hearing.hearing_date >= today
        ):
            candidate_upcoming_date = latest_hearing.hearing_date
        elif (case.current_stage or "").upper() in (
            "UPCOMING",
            "LISTED",
            "FOR ADMISSION",
            "FOR HEARING",
        ):
            candidate_upcoming_date = case.next_hearing_date

        if candidate_upcoming_date is not None or (case.current_stage or "").upper() in (
            "UPCOMING",
            "LISTED",
        ):
            return {
                "status": cls.STATUS_UPCOMING,
                "next_hearing_date": candidate_upcoming_date or case.next_hearing_date,
                "judgment_date": None,
                "has_judgment": False,
                "has_hearings": latest_hearing is not None,
                "judgment_id": None,
            }

        # Scenario D - No judgment or hearing information
        return {
            "status": cls.STATUS_PENDING,
            "next_hearing_date": case.next_hearing_date
            or (latest_hearing.next_date if latest_hearing else None),
            "judgment_date": None,
            "has_judgment": False,
            "has_hearings": latest_hearing is not None,
            "judgment_id": None,
        }
