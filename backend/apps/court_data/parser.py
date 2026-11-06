"""Robust parser and sanitizer for external court registry payloads."""

from __future__ import annotations

import datetime
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from .providers.base import CourtDataProviderError

logger = logging.getLogger(__name__)


class InvalidCourtDataError(CourtDataProviderError):
    """Raised when court payload is malformed, unrecognized, or invalid."""


@dataclass(frozen=True)
class ParsedHearingData:
    """Normalized hearing representation parsed from court feed."""

    hearing_date: datetime.date
    hearing_time: datetime.time | None = None
    court_hall_number: int | None = None
    item_number: int | None = None
    business_conducted: str = ""
    status: str = "SCHEDULED"
    next_date: datetime.date | None = None


@dataclass(frozen=True)
class ParsedJudgmentData:
    """Normalized judgment representation parsed from court feed."""

    judgment_date: datetime.date
    order_number: str = ""
    judgment_type: str = "FINAL"
    bench: str = ""
    summary: str = ""
    document_link: str = ""


@dataclass(frozen=True)
class ParsedCourtCasePayload:
    """Strongly-typed, sanitized court response representation."""

    case_type: str
    case_number: str
    filing_year: int
    petitioner: str = ""
    respondent: str = ""
    petitioner_advocate: str = ""
    respondent_advocate: str = ""
    current_stage: str = ""
    bench: str = ""
    court_hall_number: int | None = None
    next_hearing_date: datetime.date | None = None
    hearing_time: datetime.time | None = None
    item_number: int | None = None
    token_number: str | None = None
    source_status: str = "NOT_LISTED"
    session: str | None = None
    source_reference: str | None = None
    court_name: str = "High Court of Andhra Pradesh"
    hearings: list[ParsedHearingData] = field(default_factory=list)
    judgments: list[ParsedJudgmentData] = field(default_factory=list)
    safe_metadata: dict[str, Any] = field(default_factory=dict)


class CourtDataParser:
    """Sanitizes, validates, and transforms raw court responses into structured dataclasses."""

    _SCRIPT_STYLE_REGEX = re.compile(r"<(script|style)[^>]*>[\s\S]*?</\1>", re.IGNORECASE)
    _HTML_TAG_REGEX = re.compile(r"<[^>]+>")
    _DIGITS_REGEX = re.compile(r"\d+")

    @classmethod
    def parse_str_safe(cls, val: Any, max_length: int = 255) -> str:
        """Strip script/style blocks, HTML tags, clean whitespace, and truncate to max_length."""
        if val is None:
            return ""
        s = str(val).strip()
        without_scripts = cls._SCRIPT_STYLE_REGEX.sub("", s)
        cleaned = cls._HTML_TAG_REGEX.sub("", without_scripts).strip()
        return cleaned[:max_length]

    @classmethod
    def parse_int_safe(cls, val: Any) -> int | None:
        """Safely parse an integer from various forms (e.g. 4, '4', 'Court Hall 4', 'Item #18')."""
        if val is None:
            return None
        if isinstance(val, bool):
            return None
        if isinstance(val, int | float):
            try:
                num = int(val)
                return num if num >= 0 else None
            except (ValueError, OverflowError):
                return None
        if isinstance(val, str):
            match = cls._DIGITS_REGEX.search(val)
            if match:
                try:
                    num = int(match.group(0))
                    return num if num >= 0 else None
                except ValueError:
                    return None
        return None

    @classmethod
    def parse_date_safe(cls, val: Any) -> datetime.date | None:
        """Safely parse a date from ISO format or Indian judicial format (DD-MM-YYYY or DD/MM/YYYY).

        Returns None without raising on malformed strings or impossible calendar dates.
        """
        if val is None:
            return None
        if isinstance(val, datetime.date) and not isinstance(val, datetime.datetime):
            return val
        if isinstance(val, datetime.datetime):
            return val.date()
        if not isinstance(val, str):
            return None

        val_str = val.strip()
        if not val_str:
            return None

        # Truncate ISO datetime strings to date part
        if "T" in val_str:
            val_str = val_str.split("T")[0]

        # 1. Try ISO YYYY-MM-DD
        try:
            return datetime.date.fromisoformat(val_str)
        except ValueError:
            pass

        # 2. Try DD-MM-YYYY
        for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.datetime.strptime(val_str, fmt).date()
            except ValueError:
                continue

        logger.warning("Unparseable court date format encountered: %s", val_str)
        return None

    @classmethod
    def parse_time_safe(cls, val: Any) -> datetime.time | None:
        """Safely parse a time string (e.g. '10:30', '10:30:00', '10:30 AM')."""
        if val is None:
            return None
        if isinstance(val, datetime.time):
            return val
        if not isinstance(val, str):
            return None

        val_str = val.strip()
        if not val_str:
            return None

        for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M:%S %p"):
            try:
                return datetime.datetime.strptime(val_str, fmt).time()
            except ValueError:
                continue

        return None

    @classmethod
    def parse_case_payload(cls, raw: Any) -> ParsedCourtCasePayload:
        """Parse raw court payload into ParsedCourtCasePayload.

        Raises InvalidCourtDataError on unexpected non-dict structure, HTML responses, or empty body.
        """
        if raw is None or raw == "":
            raise InvalidCourtDataError("Expected JSON dictionary, received empty response.")

        if isinstance(raw, str):
            if "<html" in raw.lower() or "<!doctype" in raw.lower():
                raise InvalidCourtDataError("Expected JSON dictionary, received HTML response.")
            raise InvalidCourtDataError("Expected JSON dictionary, received string response.")

        if not isinstance(raw, dict):
            raise InvalidCourtDataError(
                f"Expected JSON dictionary, received unexpected type {type(raw).__name__}."
            )

        if not raw:
            raise InvalidCourtDataError("Expected JSON dictionary, received empty dictionary.")

        # Validate required identity fields
        case_type_raw = raw.get("case_type")
        case_number_raw = raw.get("case_number")
        filing_year_raw = raw.get("filing_year")

        if case_type_raw is None or case_number_raw is None or filing_year_raw is None:
            raise InvalidCourtDataError(
                "Missing required case identity fields (case_type, case_number, filing_year)."
            )

        if isinstance(case_type_raw, list | dict) or isinstance(case_number_raw, list | dict):
            raise InvalidCourtDataError(
                "Invalid case identity field types: expected string or number."
            )

        case_type = cls.parse_str_safe(case_type_raw, max_length=20).upper()
        case_number = cls.parse_str_safe(case_number_raw, max_length=30)

        try:
            filing_year = int(filing_year_raw)
            if filing_year < 1950 or filing_year > 2100:
                raise ValueError(f"Filing year out of valid range: {filing_year}")
        except (ValueError, TypeError) as exc:
            raise InvalidCourtDataError(f"Invalid filing_year: {filing_year_raw}") from exc

        if not case_type or not case_number:
            raise InvalidCourtDataError("Case type and case number must not be empty.")

        # Parse hearings list
        parsed_hearings: list[ParsedHearingData] = []
        raw_hearings = raw.get("hearings")
        if isinstance(raw_hearings, list):
            for h in raw_hearings:
                if not isinstance(h, dict):
                    continue
                h_date = cls.parse_date_safe(h.get("hearing_date"))
                if h_date is None:
                    continue  # Malformed date is safely skipped
                parsed_hearings.append(
                    ParsedHearingData(
                        hearing_date=h_date,
                        hearing_time=cls.parse_time_safe(h.get("hearing_time")),
                        court_hall_number=cls.parse_int_safe(h.get("court_hall_number")),
                        item_number=cls.parse_int_safe(h.get("item_number")),
                        business_conducted=cls.parse_str_safe(
                            h.get("business_conducted"), max_length=1000
                        ),
                        status=cls.parse_str_safe(h.get("status", "SCHEDULED"), max_length=20)
                        or "SCHEDULED",
                        next_date=cls.parse_date_safe(h.get("next_date")),
                    )
                )

        # Parse judgments list
        parsed_judgments: list[ParsedJudgmentData] = []
        raw_judgments = raw.get("judgments")
        if isinstance(raw_judgments, list):
            for j in raw_judgments:
                if not isinstance(j, dict):
                    continue
                j_date = cls.parse_date_safe(j.get("judgment_date"))
                if j_date is None:
                    continue  # Malformed date is safely skipped
                parsed_judgments.append(
                    ParsedJudgmentData(
                        judgment_date=j_date,
                        order_number=cls.parse_str_safe(j.get("order_number"), max_length=100),
                        judgment_type=cls.parse_str_safe(
                            j.get("judgment_type", "FINAL"), max_length=50
                        )
                        or "FINAL",
                        bench=cls.parse_str_safe(j.get("bench"), max_length=150),
                        summary=cls.parse_str_safe(j.get("summary"), max_length=2000),
                        document_link=cls.parse_str_safe(j.get("document_link"), max_length=500),
                    )
                )

        source_status = cls.parse_str_safe(raw.get("source_status"), max_length=100)
        if not source_status:
            source_status = "NOT_LISTED"

        return ParsedCourtCasePayload(
            case_type=case_type,
            case_number=case_number,
            filing_year=filing_year,
            petitioner=cls.parse_str_safe(raw.get("petitioner")),
            respondent=cls.parse_str_safe(raw.get("respondent")),
            petitioner_advocate=cls.parse_str_safe(raw.get("petitioner_advocate")),
            respondent_advocate=cls.parse_str_safe(raw.get("respondent_advocate")),
            current_stage=cls.parse_str_safe(raw.get("current_stage")),
            bench=cls.parse_str_safe(raw.get("bench"), max_length=150),
            court_hall_number=cls.parse_int_safe(raw.get("court_hall_number")),
            next_hearing_date=cls.parse_date_safe(raw.get("next_hearing_date")),
            hearing_time=cls.parse_time_safe(raw.get("hearing_time")),
            item_number=cls.parse_int_safe(raw.get("item_number")),
            token_number=cls.parse_str_safe(raw.get("token_number"), max_length=100) or None,
            source_status=source_status,
            session=cls.parse_str_safe(raw.get("session"), max_length=100) or None,
            source_reference=cls.parse_str_safe(raw.get("source_reference"), max_length=200)
            or None,
            court_name=cls.parse_str_safe(
                raw.get("court_name", "High Court of Andhra Pradesh"), max_length=200
            ),
            hearings=parsed_hearings,
            judgments=parsed_judgments,
            safe_metadata=raw.get("safe_metadata")
            if isinstance(raw.get("safe_metadata"), dict)
            else {},
        )
