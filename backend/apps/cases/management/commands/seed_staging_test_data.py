"""Idempotent staging-only management command to seed synthetic test data.

Safety guarantees:
- Strictly verifies target PostgreSQL is 127.0.0.1:5433 / aphc_case_tracker_staging / aphc_staging_app.
- Strictly verifies active Git branch is phase-4-7-backup.
- Never resets, truncates, drops, flushes, or overwrites existing records.
- Never sends emails, OTPs, or external push notifications.
- Safe to run multiple times without creating duplicate records.
"""

from __future__ import annotations

import csv
import datetime
import io
import os
import subprocess
import zipfile
from pathlib import Path
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.accounts.models import AdvocateProfile
from apps.agenda.models import CalendarSyncProvider, CalendarSyncSetting, CalendarSyncStatus
from apps.cases.models import (
    Case,
    CaseDocument,
    CaseHistory,
    CaseNote,
    Hearing,
    Judgment,
)
from apps.court_data.models import CourtListing
from apps.notifications.models import NotificationHistory
from apps.reminders.models import Reminder, ReminderPreference
from apps.tokens.models import CourtHall, CourtTokenStatus, TokenAlertRule, TokenStatus

User = get_user_model()

# Strict staging-only target constants
EXPECTED_DB_HOST = "127.0.0.1"
EXPECTED_DB_PORT = 5433
EXPECTED_DB_NAME = "aphc_case_tracker_staging"
EXPECTED_DB_USER = "aphc_staging_app"
EXPECTED_GIT_BRANCH = "phase-4-7-backup"

# Deterministic synthetic seed markers (used for idempotency & targeted cleanup)
SEED_TAG = "[TEST DATA]"
SEED_SOURCE_TAG = "APHC_STAGING_TEST_SEED"
SEED_NOTIFICATION_PREFIX = "SEED_STAGING_NOTIF_"

ALPHA_ENROLLMENT = "AP/9001/2025"
ALPHA_USERNAME = "AP90012025"
ALPHA_EMAIL = "test.advocate.alpha@example.test"
ALPHA_PASSWORD = "AlphaTest#2026!"

BETA_ENROLLMENT = "AP/9002/2025"
BETA_USERNAME = "AP90022025"
BETA_EMAIL = "test.advocate.beta@example.test"
BETA_PASSWORD = "BetaTest#2026!"


def _build_minimal_pdf(lines: list[str], title: str = "Synthetic Test Legal Filing") -> bytes:
    """Build a valid minimal PDF 1.4 with extractable text stream (no external deps)."""

    def _pdf_escape(text: str) -> str:
        safe = text.encode("latin-1", errors="ignore").decode("latin-1")
        return safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    stream_cmds = ["BT", "/F1 11 Tf", "50 760 Td", "16 TL"]
    for idx, line in enumerate(lines):
        escaped = _pdf_escape(line)
        if idx == 0:
            stream_cmds.append(f"({escaped}) Tj")
        else:
            stream_cmds.append(f"T* ({escaped}) Tj")
    stream_cmds.append("ET")
    stream_bytes = ("\n".join(stream_cmds) + "\n").encode("latin-1")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        ),
        (
            f"4 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin-1")
            + stream_bytes
            + b"endstream\nendobj\n"
        ),
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        (
            f"6 0 obj\n<< /Title ({_pdf_escape(title)}) "
            f"/Author (APHC Staging Seed Generator - TEST DATA) >>\nendobj\n"
        ).encode("latin-1"),
    ]

    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n")
    offsets: list[int] = [0]
    for obj in objects:
        offsets.append(buf.tell())
        buf.write(obj)

    xref_pos = buf.tell()
    buf.write(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    buf.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        buf.write(f"{off:010d} 00000 n \n".encode("latin-1"))
    buf.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 6 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode("latin-1")
    )
    return buf.getvalue()


def _build_minimal_docx(paragraphs: list[str]) -> bytes:
    """Build a valid OOXML .docx archive using Python stdlib zipfile."""

    def _xml_escape(text: str) -> str:
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    para_xml = "".join(f"<w:p><w:r><w:t>{_xml_escape(p)}</w:t></w:r></w:p>" for p in paragraphs)
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{para_xml}</w:body></w:document>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("word/document.xml", document_xml)
    return buf.getvalue()


def _build_minimal_xlsx(rows: list[list[str]]) -> bytes:
    """Build a valid OOXML .xlsx spreadsheet using Python stdlib zipfile."""

    def _xml_escape(text: str) -> str:
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    shared_strings: list[str] = []
    str_to_idx: dict[str, int] = {}

    def _get_ss_idx(val: str) -> int:
        if val not in str_to_idx:
            str_to_idx[val] = len(shared_strings)
            shared_strings.append(val)
        return str_to_idx[val]

    col_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    sheet_rows_xml: list[str] = []
    for r_idx, row in enumerate(rows, start=1):
        cells_xml: list[str] = []
        for c_idx, cell in enumerate(row):
            ref = f"{col_letters[c_idx]}{r_idx}"
            s_idx = _get_ss_idx(str(cell))
            cells_xml.append(f'<c r="{ref}" t="s"><v>{s_idx}</v></c>')
        sheet_rows_xml.append(f'<row r="{r_idx}">{"".join(cells_xml)}</row>')

    shared_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{len(shared_strings)}" uniqueCount="{len(shared_strings)}">'
        + "".join(f"<si><t>{_xml_escape(s)}</t></si>" for s in shared_strings)
        + "</sst>"
    )
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows_xml)}</sheetData></worksheet>'
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="SyntheticCases" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    wb_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" '
        'Target="sharedStrings.xml"/>'
        "</Relationships>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>"
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", wb_rels_xml)
        zf.writestr("xl/sharedStrings.xml", shared_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buf.getvalue()


def _build_sample_png() -> bytes:
    """Create a valid PNG notice image with synthetic case text using Pillow."""
    img = Image.new("RGB", (760, 360), color=(248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.rectangle([(16, 16), (744, 344)], outline=(15, 41, 66), width=3)
    draw.rectangle([(16, 16), (744, 72)], fill=(15, 41, 66))
    draw.text(
        (36, 36),
        "APHC CASE TRACKER - SYNTHETIC TEST NOTICE IMAGE (NOT A COURT RECORD)",
        fill=(255, 255, 255),
    )
    lines = [
        "[TEST DATA] Synthetic Cause List Attachment Sample",
        "Case Number: WP 92009/2026",
        "Petitioner: Synthetic Notice Petitioner Test",
        "Respondent: Synthetic Notice Authority Test",
        "Court Hall: 4 | Bench: High Court of Andhra Pradesh - Writ Bench III",
        "Scheduled Hearing Date: 2026-12-05",
        "Note: Valid PNG for attachment & metadata verification (OCR not configured).",
    ]
    y = 100
    for line in lines:
        draw.text((36, y), line, fill=(17, 24, 39))
        y += 32

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _generate_sample_import_files(repo_root: Path) -> list[Path]:
    """Generate valid small synthetic import sample files in test_data/sample_imports/."""
    out_dir = repo_root / "test_data" / "sample_imports"
    out_dir.mkdir(parents=True, exist_ok=True)
    created_files: list[Path] = []

    # 1. TXT
    txt_path = out_dir / "sample_case_import.txt"
    txt_path.write_text(
        "\n".join(
            [
                "[TEST DATA] APHC Case Tracker - Synthetic Import Sample (TXT)",
                "NOT A GENUINE COURT RECORD - FOR LOCAL STAGING TESTING ONLY",
                "",
                "Case Number: WP 92001/2026",
                "Petitioner: Synthetic Alpha Petitioner TXT",
                "Respondent: Synthetic Municipal Board TXT",
                "Petitioner Advocate: Test Advocate Alpha",
                "Court Hall: 4",
                "Bench: High Court of Andhra Pradesh - Writ Bench III",
                "Stage: PENDING",
                "Next Hearing Date: 2026-12-02",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    created_files.append(txt_path)

    # 2. CSV (with English & Telugu UTF-8 text)
    csv_path = out_dir / "sample_case_import.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "Case Type",
                "Case Number",
                "Filing Year",
                "Petitioner",
                "Respondent",
                "Stage",
                "Bench",
                "Court Hall",
                "Next Hearing Date",
            ]
        )
        writer.writerow(
            [
                "WP",
                "92002",
                "2026",
                "[TEST DATA] Srinivas Synthetic (శ్రీనివాస్ టెస్ట్)",
                "Synthetic Revenue Office Test",
                "PENDING",
                "High Court of Andhra Pradesh - Writ Bench III",
                "4",
                "2026-12-04",
            ]
        )
        writer.writerow(
            [
                "WA",
                "92003",
                "2025",
                "[TEST DATA] Lakshmi Synthetic (లక్ష్మి టెస్ట్)",
                "Synthetic State Corporation Test",
                "ADJOURNED",
                "High Court of Andhra Pradesh - Division Bench I",
                "1",
                "2026-12-09",
            ]
        )
        writer.writerow(
            [
                "CRP",
                "92004",
                "2024",
                "[TEST DATA] Ramesh Civil Test",
                "Synthetic Land Records Board",
                "UPCOMING",
                "High Court of Andhra Pradesh - Single Bench IV",
                "6",
                "2026-12-11",
            ]
        )
    created_files.append(csv_path)

    # 3. PDF
    pdf_path = out_dir / "sample_case_import.pdf"
    pdf_bytes = _build_minimal_pdf(
        [
            "[TEST DATA] APHC Case Tracker - Synthetic Import Sample (PDF)",
            "NOT A GENUINE COURT RECORD - STAGING TEST ONLY",
            "Case Number: CRLP 92005/2026",
            "Petitioner: Synthetic Criminal Petitioner PDF",
            "Respondent: Synthetic Prosecution Unit Test",
            "Bench: High Court of Andhra Pradesh - Criminal Bench II",
            "Court Hall: 2",
            "Stage: PENDING",
            "Next Hearing Date: 2026-12-08",
        ],
        title="[TEST DATA] CRLP 92005/2026 Synthetic Filing",
    )
    pdf_path.write_bytes(pdf_bytes)
    created_files.append(pdf_path)

    # 4. DOCX
    docx_path = out_dir / "sample_case_import.docx"
    docx_bytes = _build_minimal_docx(
        [
            "[TEST DATA] APHC Case Tracker - Synthetic Import Sample (DOCX)",
            "NOT A GENUINE COURT RECORD - STAGING TEST ONLY",
            "Case Number: MACMA 92006/2025",
            "Petitioner: Synthetic Claim Appellant DOCX",
            "Respondent: Synthetic Transport Insurer Test",
            "Bench: High Court of Andhra Pradesh - Single Bench IV",
            "Court Hall: 9",
            "Stage: UPCOMING",
            "Next Hearing Date: 2026-12-14",
        ]
    )
    docx_path.write_bytes(docx_bytes)
    created_files.append(docx_path)

    # 5. XLSX
    xlsx_path = out_dir / "sample_case_import.xlsx"
    xlsx_bytes = _build_minimal_xlsx(
        [
            [
                "Case Type",
                "Case Number",
                "Filing Year",
                "Petitioner",
                "Respondent",
                "Stage",
                "Court Hall",
                "Next Hearing Date",
            ],
            [
                "CC",
                "92007",
                "2025",
                "[TEST DATA] Synthetic Contempt Petitioner XLSX",
                "Synthetic Compliance Officer Test",
                "PENDING",
                "1",
                "2026-12-15",
            ],
            [
                "EP",
                "92008",
                "2024",
                "[TEST DATA] Synthetic Election Petitioner XLSX",
                "Synthetic Returning Officer Test",
                "ADJOURNED",
                "2",
                "2026-12-18",
            ],
        ]
    )
    xlsx_path.write_bytes(xlsx_bytes)
    created_files.append(xlsx_path)

    # 6. PNG
    png_path = out_dir / "sample_case_notice.png"
    png_path.write_bytes(_build_sample_png())
    created_files.append(png_path)

    return created_files


def _alpha_case_definitions(today: datetime.date) -> list[dict[str, Any]]:
    """26 varied synthetic cases for Test Advocate Alpha (pagination: 3 pages of 10)."""
    benches = [
        "High Court of Andhra Pradesh - Division Bench I",
        "High Court of Andhra Pradesh - Criminal Bench II",
        "High Court of Andhra Pradesh - Writ Bench III",
        "High Court of Andhra Pradesh - Single Bench IV",
    ]
    return [
        # --- Writ Petitions (WP: 8) ---
        {
            "case_type": "WP",
            "case_number": "90001",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Srinivas Rao (శ్రీనివాస్ రావు)",
            "respondent": "Synthetic Municipal Dept AP",
            "current_stage": "UPCOMING",
            "bench": benches[2],
            "court_hall_number": 4,
            "next_hearing_date": today,
            "created_days_ago": 15,
            "updated_days_ago": 0,
            "has_judgment": False,
        },
        {
            "case_type": "WP",
            "case_number": "90002",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Anitha Devi (అనిత దేవి)",
            "respondent": "Synthetic Revenue Board Test",
            "current_stage": "PENDING",
            "bench": benches[2],
            "court_hall_number": 4,
            "next_hearing_date": today + datetime.timedelta(days=2),
            "created_days_ago": 24,
            "updated_days_ago": 1,
            "has_judgment": False,
        },
        {
            "case_type": "WP",
            "case_number": "90003",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Kiran Kumar Synthetic",
            "respondent": "Synthetic Power Utility Corp",
            "current_stage": "ADJOURNED",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": today + datetime.timedelta(days=6),
            "created_days_ago": 140,
            "updated_days_ago": 2,
            "has_judgment": False,
            "adjourned": True,
        },
        {
            "case_type": "WP",
            "case_number": "90004",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Padmavathi Synthetic",
            "respondent": "Synthetic Urban Authority",
            "current_stage": "DISPOSED",
            "bench": benches[2],
            "court_hall_number": 4,
            "next_hearing_date": None,
            "created_days_ago": 210,
            "updated_days_ago": 5,
            "has_judgment": True,
            "judgment_days_ago": 10,
        },
        {
            "case_type": "WP",
            "case_number": "90005",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Venkata Subbaiah Test",
            "respondent": "Synthetic Irrigation Agency",
            "current_stage": "DISPOSED",
            "bench": benches[3],
            "court_hall_number": 6,
            "next_hearing_date": None,
            "created_days_ago": 420,
            "updated_days_ago": 12,
            "has_judgment": False,  # Disposed, judgment copy pending
        },
        {
            "case_type": "WP",
            "case_number": "90006",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Madhavi Latha Test",
            "respondent": "Synthetic Education Council",
            "current_stage": "PENDING",
            "bench": benches[2],
            "court_hall_number": None,
            "next_hearing_date": None,  # Pending without hearing date
            "created_days_ago": 390,
            "updated_days_ago": 18,
            "has_judgment": False,
        },
        {
            "case_type": "WP",
            "case_number": "90007",
            "filing_year": 2023,
            "petitioner": "[TEST DATA] Harish Chandra Test",
            "respondent": "Synthetic Commercial Tax Unit",
            "current_stage": "DISPOSED",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": None,
            "created_days_ago": 760,
            "updated_days_ago": 25,
            "has_judgment": True,
            "judgment_days_ago": 45,
        },
        {
            "case_type": "WP",
            "case_number": "90008",
            "filing_year": 2022,
            "petitioner": "[TEST DATA] Sailaja Synthetic",
            "respondent": "Synthetic Forest Dept Test",
            "current_stage": "PENDING",
            "bench": benches[3],
            "court_hall_number": 9,
            "next_hearing_date": today + datetime.timedelta(days=14),
            "created_days_ago": 1050,
            "updated_days_ago": 3,
            "has_judgment": False,
        },
        # --- Writ Appeals (WA: 4) ---
        {
            "case_type": "WA",
            "case_number": "90009",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Rajeshwar Rao Test",
            "respondent": "Synthetic Infrastructure Board",
            "current_stage": "UPCOMING",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": today + datetime.timedelta(days=1),
            "created_days_ago": 30,
            "updated_days_ago": 1,
            "has_judgment": False,
        },
        {
            "case_type": "WA",
            "case_number": "90010",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Bhavani Shankar Test",
            "respondent": "Synthetic Port Trust Test",
            "current_stage": "ADJOURNED",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": today + datetime.timedelta(days=9),
            "created_days_ago": 180,
            "updated_days_ago": 4,
            "has_judgment": False,
            "adjourned": True,
        },
        {
            "case_type": "WA",
            "case_number": "90011",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Narasimha Murthy Test",
            "respondent": "Synthetic Housing Board Test",
            "current_stage": "DISPOSED",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": None,
            "created_days_ago": 510,
            "updated_days_ago": 20,
            "has_judgment": True,
            "judgment_days_ago": 30,
        },
        {
            "case_type": "WA",
            "case_number": "90012",
            "filing_year": 2023,
            "petitioner": "[TEST DATA] Kavitha Synthetic",
            "respondent": "Synthetic Civil Supplies Dept",
            "current_stage": "PENDING",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": None,
            "created_days_ago": 820,
            "updated_days_ago": 32,
            "has_judgment": False,
        },
        # --- Civil Revision Petitions (CRP: 4) ---
        {
            "case_type": "CRP",
            "case_number": "90013",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Prasad Reddy Test",
            "respondent": "Synthetic Estate Developers",
            "current_stage": "UPCOMING",
            "bench": benches[3],
            "court_hall_number": 6,
            "next_hearing_date": today + datetime.timedelta(days=3),
            "created_days_ago": 18,
            "updated_days_ago": 2,
            "has_judgment": False,
        },
        {
            "case_type": "CRP",
            "case_number": "90014",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Sunitha Kumari Test",
            "respondent": "Synthetic Land Holdings Test",
            "current_stage": "ADJOURNED",
            "bench": benches[3],
            "court_hall_number": 6,
            "next_hearing_date": today + datetime.timedelta(days=11),
            "created_days_ago": 165,
            "updated_days_ago": 6,
            "has_judgment": False,
            "adjourned": True,
        },
        {
            "case_type": "CRP",
            "case_number": "90015",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Mohan Krishna Test",
            "respondent": "Synthetic Cooperative Bank",
            "current_stage": "DISPOSED",
            "bench": benches[3],
            "court_hall_number": 6,
            "next_hearing_date": None,
            "created_days_ago": 480,
            "updated_days_ago": 14,
            "has_judgment": True,
            "judgment_days_ago": 22,
        },
        {
            "case_type": "CRP",
            "case_number": "90016",
            "filing_year": 2021,
            "petitioner": "[TEST DATA] Gayathri Synthetic",
            "respondent": "Synthetic Textile Mills Test",
            "current_stage": "PENDING",
            "bench": benches[3],
            "court_hall_number": 9,
            "next_hearing_date": today - datetime.timedelta(days=12),  # Past hearing
            "created_days_ago": 1350,
            "updated_days_ago": 40,
            "has_judgment": False,
        },
        # --- Criminal Petitions (CRLP: 4) ---
        {
            "case_type": "CRLP",
            "case_number": "90017",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Vikram Aditya Test",
            "respondent": "Synthetic State Prosecution",
            "current_stage": "UPCOMING",
            "bench": benches[1],
            "court_hall_number": 2,
            "next_hearing_date": today + datetime.timedelta(days=4),
            "created_days_ago": 10,
            "updated_days_ago": 1,
            "has_judgment": False,
        },
        {
            "case_type": "CRLP",
            "case_number": "90018",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Deepika Synthetic",
            "respondent": "Synthetic Investigation Unit",
            "current_stage": "ADJOURNED",
            "bench": benches[1],
            "court_hall_number": 2,
            "next_hearing_date": today + datetime.timedelta(days=16),
            "created_days_ago": 115,
            "updated_days_ago": 7,
            "has_judgment": False,
            "adjourned": True,
        },
        {
            "case_type": "CRLP",
            "case_number": "90019",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Suresh Babu Test",
            "respondent": "Synthetic Vigilance Dept",
            "current_stage": "DISPOSED",
            "bench": benches[1],
            "court_hall_number": 2,
            "next_hearing_date": None,
            "created_days_ago": 450,
            "updated_days_ago": 19,
            "has_judgment": True,
            "judgment_days_ago": 60,
        },
        {
            "case_type": "CRLP",
            "case_number": "90020",
            "filing_year": 2023,
            "petitioner": "[TEST DATA] Rameshwar Synthetic",
            "respondent": "Synthetic Cyber Cell Test",
            "current_stage": "PENDING",
            "bench": benches[1],
            "court_hall_number": None,
            "next_hearing_date": None,
            "created_days_ago": 710,
            "updated_days_ago": 28,
            "has_judgment": False,
        },
        # --- MACMA (2) ---
        {
            "case_type": "MACMA",
            "case_number": "90021",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Aruna Kumari Test",
            "respondent": "Synthetic Motor Insurer Co",
            "current_stage": "PENDING",
            "bench": benches[3],
            "court_hall_number": 12,
            "next_hearing_date": today + datetime.timedelta(days=20),
            "created_days_ago": 200,
            "updated_days_ago": 9,
            "has_judgment": False,
        },
        {
            "case_type": "MACMA",
            "case_number": "90022",
            "filing_year": 2022,
            "petitioner": "[TEST DATA] Gopal Rao Test",
            "respondent": "Synthetic Roadways Corp",
            "current_stage": "DISPOSED",
            "bench": benches[3],
            "court_hall_number": 12,
            "next_hearing_date": None,
            "created_days_ago": 1120,
            "updated_days_ago": 50,
            "has_judgment": True,
            "judgment_days_ago": 95,
        },
        # --- Contempt Cases (CC: 2) ---
        {
            "case_type": "CC",
            "case_number": "90023",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Satyanarayana Test",
            "respondent": "Synthetic District Official",
            "current_stage": "UPCOMING",
            "bench": benches[2],
            "court_hall_number": 4,
            "next_hearing_date": today + datetime.timedelta(days=5),
            "created_days_ago": 22,
            "updated_days_ago": 2,
            "has_judgment": False,
        },
        {
            "case_type": "CC",
            "case_number": "90024",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Swathi Priya Test",
            "respondent": "Synthetic Registry Officer",
            "current_stage": "DISPOSED",
            "bench": benches[2],
            "court_hall_number": 4,
            "next_hearing_date": None,
            "created_days_ago": 540,
            "updated_days_ago": 35,
            "has_judgment": False,  # Disposed without judgment uploaded
        },
        # --- Election Petition (EP: 1) ---
        {
            "case_type": "EP",
            "case_number": "90025",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Chandra Sekhar Test",
            "respondent": "Synthetic Electoral Board",
            "current_stage": "ADJOURNED",
            "bench": benches[0],
            "court_hall_number": 1,
            "next_hearing_date": today + datetime.timedelta(days=25),
            "created_days_ago": 490,
            "updated_days_ago": 8,
            "has_judgment": False,
            "adjourned": True,
        },
        # --- OTHER (1) ---
        {
            "case_type": "OTHER",
            "case_number": "90026",
            "filing_year": 2020,
            "petitioner": "[TEST DATA] Vasudeva Synthetic",
            "respondent": "Synthetic Arbitration Panel",
            "current_stage": "DISPOSED",
            "bench": benches[3],
            "court_hall_number": 9,
            "next_hearing_date": None,
            "created_days_ago": 1700,
            "updated_days_ago": 65,
            "has_judgment": True,
            "judgment_days_ago": 150,
        },
    ]


def _beta_case_definitions(today: datetime.date) -> list[dict[str, Any]]:
    """5 isolated synthetic cases tracked ONLY by Test Advocate Beta."""
    return [
        {
            "case_type": "WP",
            "case_number": "91001",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Beta Isolated Petitioner 1",
            "respondent": "Synthetic Beta Dept A",
            "current_stage": "UPCOMING",
            "bench": "High Court of Andhra Pradesh - Writ Bench III",
            "court_hall_number": 4,
            "next_hearing_date": today + datetime.timedelta(days=3),
            "created_days_ago": 12,
            "updated_days_ago": 1,
            "has_judgment": False,
        },
        {
            "case_type": "CRLP",
            "case_number": "91002",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Beta Isolated Petitioner 2",
            "respondent": "Synthetic Beta Prosecution",
            "current_stage": "ADJOURNED",
            "bench": "High Court of Andhra Pradesh - Criminal Bench II",
            "court_hall_number": 2,
            "next_hearing_date": today + datetime.timedelta(days=10),
            "created_days_ago": 95,
            "updated_days_ago": 4,
            "has_judgment": False,
            "adjourned": True,
        },
        {
            "case_type": "WA",
            "case_number": "91003",
            "filing_year": 2024,
            "petitioner": "[TEST DATA] Beta Isolated Petitioner 3",
            "respondent": "Synthetic Beta Authority",
            "current_stage": "DISPOSED",
            "bench": "High Court of Andhra Pradesh - Division Bench I",
            "court_hall_number": 1,
            "next_hearing_date": None,
            "created_days_ago": 410,
            "updated_days_ago": 15,
            "has_judgment": True,
            "judgment_days_ago": 28,
        },
        {
            "case_type": "CRP",
            "case_number": "91004",
            "filing_year": 2025,
            "petitioner": "[TEST DATA] Beta Isolated Petitioner 4",
            "respondent": "Synthetic Beta Estates",
            "current_stage": "PENDING",
            "bench": "High Court of Andhra Pradesh - Single Bench IV",
            "court_hall_number": 6,
            "next_hearing_date": None,
            "created_days_ago": 160,
            "updated_days_ago": 21,
            "has_judgment": False,
        },
        {
            "case_type": "CC",
            "case_number": "91005",
            "filing_year": 2026,
            "petitioner": "[TEST DATA] Beta Isolated Petitioner 5",
            "respondent": "Synthetic Beta Compliance Unit",
            "current_stage": "PENDING",
            "bench": "High Court of Andhra Pradesh - Writ Bench III",
            "court_hall_number": 4,
            "next_hearing_date": today + datetime.timedelta(days=8),
            "created_days_ago": 28,
            "updated_days_ago": 2,
            "has_judgment": False,
        },
    ]


class Command(BaseCommand):
    help = (
        "Idempotently seed synthetic test data into the LOCAL PostgreSQL staging database "
        "(127.0.0.1:5433 / aphc_case_tracker_staging) and generate sample import files."
    )

    def _verify_safety(self) -> tuple[str, str, str, int, str]:
        """Fail closed unless every safety condition matches the exact staging target."""
        # 1. Verify Git branch
        repo_root = Path(settings.BASE_DIR).parent
        try:
            branch = subprocess.check_output(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(repo_root),
                text=True,
                stderr=subprocess.STDOUT,
            ).strip()
        except Exception as exc:
            raise CommandError(f"Unable to verify active Git branch: {exc}") from exc

        if branch != EXPECTED_GIT_BRANCH:
            raise CommandError(
                f"SAFETY ABORT: Expected Git branch '{EXPECTED_GIT_BRANCH}', got '{branch}'."
            )

        # 2. Verify Django settings DB config
        db_cfg = settings.DATABASES["default"]
        engine = str(db_cfg.get("ENGINE", ""))
        host = str(db_cfg.get("HOST", ""))
        port = int(db_cfg.get("PORT") or 0)
        name = str(db_cfg.get("NAME", ""))
        user = str(db_cfg.get("USER", ""))

        if "postgresql" not in engine:
            raise CommandError(f"SAFETY ABORT: Expected PostgreSQL engine, got '{engine}'.")
        if host != EXPECTED_DB_HOST or port != EXPECTED_DB_PORT:
            raise CommandError(
                f"SAFETY ABORT: Expected {EXPECTED_DB_HOST}:{EXPECTED_DB_PORT}, got {host}:{port}."
            )
        if name != EXPECTED_DB_NAME or user != EXPECTED_DB_USER:
            raise CommandError(
                f"SAFETY ABORT: Expected db={EXPECTED_DB_NAME} user={EXPECTED_DB_USER}, "
                f"got db={name} user={user}."
            )

        # 3. Verify live PostgreSQL identity
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT version(), current_database(), current_user, inet_server_port();"
            )
            live_ver, live_db, live_user, live_port = cursor.fetchone()

        if (
            live_db != EXPECTED_DB_NAME
            or live_user != EXPECTED_DB_USER
            or int(live_port) != EXPECTED_DB_PORT
        ):
            raise CommandError(
                f"SAFETY ABORT: Live DB mismatch: db={live_db} user={live_user} port={live_port}."
            )

        return branch, live_ver, live_db, int(live_port), live_user

    def _ensure_advocate(
        self,
        *,
        username: str,
        enrollment: str,
        email: str,
        first_name: str,
        last_name: str,
        password: str,
        role: str,
        preferred_language: str,
        phone_number: str,
        chamber_address: str,
    ) -> tuple[Any, bool]:
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "is_active": True,
                "is_staff": False,
                "is_superuser": False,
            },
        )
        if created:
            user.set_password(password)
            user.save(update_fields=["password"])
        else:
            # Ensure active and password usable without overwriting unrelated accounts
            updated = False
            if not user.is_active:
                user.is_active = True
                updated = True
            if not user.check_password(password):
                user.set_password(password)
                updated = True
            if updated:
                user.save()

        profile, _ = AdvocateProfile.objects.get_or_create(
            user=user,
            defaults={
                "bar_council_enrollment_number": enrollment,
                "phone_number": phone_number,
                "chamber_address": chamber_address,
                "role": role,
                "preferred_language": preferred_language,
                "is_verified": True,
            },
        )
        if not profile.is_verified:
            profile.is_verified = True
            profile.save(update_fields=["is_verified"])

        ReminderPreference.objects.get_or_create(
            advocate=user,
            defaults={
                "remind_24h_before": True,
                "remind_1h_before": True,
                "email_notifications": False,
                "push_notifications": True,
                "judgment_push_notifications": True,
                "hearing_change_push_notifications": True,
            },
        )

        CalendarSyncSetting.objects.get_or_create(
            advocate=user,
            defaults={
                "sync_enabled": False,
                "provider": CalendarSyncProvider.NONE,
                "sync_status": CalendarSyncStatus.IDLE,
                "sync_hearing_reminders": True,
                "sync_compliance_deadlines": True,
                "sync_personal_reminders": True,
            },
        )

        return user, created

    def _seed_cases_for_advocate(
        self,
        *,
        advocate: Any,
        advocate_label: str,
        defs: list[dict[str, Any]],
        today: datetime.date,
        now: datetime.datetime,
        counts: dict[str, int],
    ) -> list[Case]:
        seeded_cases: list[Case] = []

        for idx, spec in enumerate(defs):
            case, created = Case.objects.get_or_create(
                case_type=spec["case_type"],
                case_number=spec["case_number"],
                filing_year=spec["filing_year"],
                defaults={
                    "petitioner": spec["petitioner"],
                    "respondent": spec["respondent"],
                    "petitioner_advocate": advocate_label,
                    "respondent_advocate": "Synthetic Govt Pleader (TEST DATA)",
                    "current_stage": spec["current_stage"],
                    "bench": spec["bench"],
                    "court_hall_number": spec["court_hall_number"],
                    "next_hearing_date": spec["next_hearing_date"],
                },
            )
            case.tracked_by.add(advocate)

            if created:
                # Apply realistic staggered created_at / updated_at for Filing & Last Updated sorting
                created_ts = now - datetime.timedelta(days=spec["created_days_ago"])
                updated_ts = now - datetime.timedelta(days=spec["updated_days_ago"], hours=idx % 12)
                Case.objects.filter(pk=case.pk).update(
                    created_at=created_ts,
                    updated_at=updated_ts,
                )
                case.refresh_from_db()
                counts["cases_created"] += 1

            seeded_cases.append(case)

            # 1. Case Creation History Entry
            _, ch_created = CaseHistory.objects.get_or_create(
                case=case,
                event_type="CASE_CREATED",
                description=f"{SEED_TAG} Case {case} added to {advocate_label}'s test docket.",
                defaults={
                    "source": "SYSTEM",
                    "changed_by": advocate,
                },
            )
            if ch_created:
                counts["case_history_created"] += 1

            # 2. Hearings (Upcoming, Completed, Adjourned/Rescheduled)
            if spec["next_hearing_date"] is not None:
                is_adjourned = bool(spec.get("adjourned"))
                hearing_status = (
                    "RESCHEDULED"
                    if is_adjourned
                    else ("COMPLETED" if spec["next_hearing_date"] < today else "SCHEDULED")
                )
                prev_date = (
                    spec["next_hearing_date"] - datetime.timedelta(days=14)
                    if is_adjourned
                    else None
                )
                hearing, h_created = Hearing.objects.get_or_create(
                    case=case,
                    hearing_date=spec["next_hearing_date"],
                    defaults={
                        "hearing_time": datetime.time(10, 30),
                        "status": hearing_status,
                        "court_hall_number": spec["court_hall_number"],
                        "item_number": 10 + idx,
                        "business_conducted": (
                            f"{SEED_TAG} Adjourned at request of counsel for counter affidavit."
                            if is_adjourned
                            else f"{SEED_TAG} Listed for regular hearing arguments."
                        ),
                        "previous_hearing_date": prev_date,
                        "previous_hearing_time": datetime.time(10, 30) if is_adjourned else None,
                        "rescheduled_reason": (
                            f"{SEED_TAG} Administrative adjournment for counter filing."
                            if is_adjourned
                            else ""
                        ),
                    },
                )
                if h_created:
                    counts["hearings_created"] += 1

                # Add a completed prior hearing for adjournment / history depth
                if is_adjourned or idx < 8:
                    prior_date = today - datetime.timedelta(days=20 + idx)
                    _, ph_created = Hearing.objects.get_or_create(
                        case=case,
                        hearing_date=prior_date,
                        defaults={
                            "hearing_time": datetime.time(11, 0),
                            "status": "COMPLETED",
                            "court_hall_number": spec["court_hall_number"],
                            "item_number": 5 + idx,
                            "business_conducted": (
                                f"{SEED_TAG} Notice ordered; adjourned for counter affidavit."
                                if is_adjourned
                                else f"{SEED_TAG} Admission heard; interim direction noted."
                            ),
                            "next_date": spec["next_hearing_date"],
                        },
                    )
                    if ph_created:
                        counts["hearings_created"] += 1

                if is_adjourned:
                    _, adj_hist_created = CaseHistory.objects.get_or_create(
                        case=case,
                        event_type="HEARING_RESCHEDULED",
                        field_name="next_hearing_date",
                        defaults={
                            "old_value": prev_date.isoformat() if prev_date else "",
                            "new_value": spec["next_hearing_date"].isoformat(),
                            "description": (
                                f"{SEED_TAG} Hearing adjourned and rescheduled to "
                                f"{spec['next_hearing_date'].isoformat()}."
                            ),
                            "source": "MANUAL",
                            "changed_by": advocate,
                        },
                    )
                    if adj_hist_created:
                        counts["case_history_created"] += 1

            # 3. Synthetic Judgments (explicitly marked synthetic test data)
            if spec.get("has_judgment"):
                j_date = today - datetime.timedelta(days=spec.get("judgment_days_ago", 15))
                _, j_created = Judgment.objects.get_or_create(
                    case=case,
                    judgment_date=j_date,
                    defaults={
                        "judgment_type": "FINAL",
                        "order_number": f"TEST-ORD-{case.filing_year}-{case.case_number}",
                        "bench": spec["bench"],
                        "summary": (
                            f"{SEED_TAG} Synthetic disposal order summary for {case}. "
                            "Not a genuine court order or judicial pronouncement."
                        ),
                        "document_link": "",
                    },
                )
                if j_created:
                    counts["judgments_created"] += 1

                _, jh_created = CaseHistory.objects.get_or_create(
                    case=case,
                    event_type="JUDGMENT_ENTERED",
                    defaults={
                        "field_name": "judgment_date",
                        "new_value": j_date.isoformat(),
                        "description": f"{SEED_TAG} Synthetic judgment entry recorded for {case}.",
                        "source": "SYSTEM",
                        "changed_by": advocate,
                    },
                )
                if jh_created:
                    counts["case_history_created"] += 1

        return seeded_cases

    def handle(self, *args, **options):
        branch, live_ver, live_db, live_port, live_user = self._verify_safety()

        # Snapshot existing users before inserting anything
        pre_existing_users = list(
            User.objects.exclude(username__in=[ALPHA_USERNAME, BETA_USERNAME]).values_list(
                "id", "username"
            )
        )
        pre_existing_case_count = (
            Case.objects.exclude(case_number__startswith="900")
            .exclude(case_number__startswith="910")
            .count()
        )

        now = timezone.now()
        today = timezone.localdate()

        counts: dict[str, int] = {
            "advocates_created": 0,
            "cases_created": 0,
            "hearings_created": 0,
            "judgments_created": 0,
            "case_history_created": 0,
            "case_notes_created": 0,
            "case_documents_created": 0,
            "reminders_created": 0,
            "notifications_created": 0,
            "court_halls_created": 0,
            "token_alerts_created": 0,
            "court_listings_created": 0,
        }

        with transaction.atomic():
            # 1. Seed Test Advocate Alpha & Beta
            alpha_user, alpha_created = self._ensure_advocate(
                username=ALPHA_USERNAME,
                enrollment=ALPHA_ENROLLMENT,
                email=ALPHA_EMAIL,
                first_name="Test Advocate",
                last_name="Alpha",
                password=ALPHA_PASSWORD,
                role="SENIOR",
                preferred_language="en",
                phone_number="+919000009001",
                chamber_address=f"{SEED_TAG} Chamber 101, Synthetic Legal Block, Amaravati",
            )
            if alpha_created:
                counts["advocates_created"] += 1

            beta_user, beta_created = self._ensure_advocate(
                username=BETA_USERNAME,
                enrollment=BETA_ENROLLMENT,
                email=BETA_EMAIL,
                first_name="Test Advocate",
                last_name="Beta",
                password=BETA_PASSWORD,
                role="ASSOCIATE",
                preferred_language="te",
                phone_number="+919000009002",
                chamber_address=f"{SEED_TAG} Chamber 202, Synthetic Legal Block, Amaravati",
            )
            if beta_created:
                counts["advocates_created"] += 1

            # 2. Seed Cases, Hearings, Adjournments, Judgments, History
            alpha_cases = self._seed_cases_for_advocate(
                advocate=alpha_user,
                advocate_label="Test Advocate Alpha",
                defs=_alpha_case_definitions(today),
                today=today,
                now=now,
                counts=counts,
            )
            beta_cases = self._seed_cases_for_advocate(
                advocate=beta_user,
                advocate_label="Test Advocate Beta",
                defs=_beta_case_definitions(today),
                today=today,
                now=now,
                counts=counts,
            )

            # 3. Seed Private Case Notes (Alpha + Beta isolation)
            alpha_note_specs = [
                (
                    alpha_cases[0],
                    f"{SEED_TAG} Writ Admission Argument Points",
                    "Synthetic prep notes: cite jurisdiction clause and annexure A-1. "
                    "తెలుగు గమనిక: ప్రాథమిక వాదన అంశాలు.",
                    True,
                ),
                (
                    alpha_cases[1],
                    f"{SEED_TAG} Counter Affidavit Checklist",
                    "Verify synthetic revenue survey numbers before next appearance.",
                    True,
                ),
                (
                    alpha_cases[2],
                    f"{SEED_TAG} Adjournment Follow-up Memo",
                    "Check whether synthetic respondent filed counter within granted 2 weeks.",
                    False,
                ),
                (
                    alpha_cases[3],
                    f"{SEED_TAG} Disposal Summary Note",
                    "Synthetic final order received; share summary with synthetic client.",
                    False,
                ),
                (
                    alpha_cases[8],
                    f"{SEED_TAG} Division Bench Appeal Brief",
                    "Prepare synthetic chronology of events for Writ Appeal admission.",
                    False,
                ),
                (
                    alpha_cases[16],
                    f"{SEED_TAG} Criminal Petition Bail Grounds",
                    "Synthetic grounds outline for hearing in Court Hall 2.",
                    False,
                ),
            ]
            for case_obj, title, content, is_pinned in alpha_note_specs:
                _, n_created = CaseNote.objects.get_or_create(
                    case=case_obj,
                    advocate=alpha_user,
                    title=title,
                    defaults={"content": content, "is_pinned": is_pinned},
                )
                if n_created:
                    counts["case_notes_created"] += 1

            _, beta_n_created = CaseNote.objects.get_or_create(
                case=beta_cases[0],
                advocate=beta_user,
                title=f"{SEED_TAG} Beta Private Confidential Note",
                defaults={
                    "content": "Strictly isolated synthetic note belonging only to Test Advocate Beta.",
                    "is_pinned": True,
                },
            )
            if beta_n_created:
                counts["case_notes_created"] += 1

            # 4. Seed Secure Case Documents (valid PDF & TXT files for download testing)
            doc_specs = [
                (
                    alpha_cases[0],
                    alpha_user,
                    f"{SEED_TAG} Synthetic Writ Petition Affidavit",
                    "PETITION",
                    "synthetic_wp_90001_affidavit.pdf",
                    "application/pdf",
                    _build_minimal_pdf(
                        [
                            "[TEST DATA] Synthetic Writ Petition Affidavit",
                            "Case: WP 90001/2026 | Petitioner: Srinivas Rao (TEST)",
                            "Not a genuine court filing - local staging test document.",
                        ],
                        title="[TEST DATA] WP 90001/2026 Affidavit",
                    ),
                ),
                (
                    alpha_cases[1],
                    alpha_user,
                    f"{SEED_TAG} Synthetic Counter Affidavit Draft",
                    "COUNTER_AFFIDAVIT",
                    "synthetic_wp_90002_counter.txt",
                    "text/plain",
                    (
                        b"[TEST DATA] Synthetic Counter Affidavit Notes for WP 90002/2026.\n"
                        b"Not a genuine legal filing. Created solely for staging download testing.\n"
                    ),
                ),
                (
                    alpha_cases[3],
                    alpha_user,
                    f"{SEED_TAG} Synthetic Disposal Order Copy",
                    "JUDGMENT",
                    "synthetic_wp_90004_order.pdf",
                    "application/pdf",
                    _build_minimal_pdf(
                        [
                            "[TEST DATA] Synthetic Disposal Order Sample",
                            "Case: WP 90004/2025 | Order Ref: TEST-ORD-2025-90004",
                            "Synthetic test file only - not a real court judgment.",
                        ],
                        title="[TEST DATA] WP 90004/2025 Synthetic Order",
                    ),
                ),
                (
                    alpha_cases[8],
                    alpha_user,
                    f"{SEED_TAG} Synthetic Written Submissions",
                    "WRITTEN_SUBMISSIONS",
                    "synthetic_wa_90009_submissions.txt",
                    "text/plain",
                    (
                        b"[TEST DATA] Synthetic Written Submissions for WA 90009/2026.\n"
                        b"Prepared for manual document preview/download verification.\n"
                    ),
                ),
                (
                    beta_cases[0],
                    beta_user,
                    f"{SEED_TAG} Beta Isolated Petition PDF",
                    "PETITION",
                    "synthetic_beta_wp_91001.pdf",
                    "application/pdf",
                    _build_minimal_pdf(
                        [
                            "[TEST DATA] Isolated Synthetic Document for Test Advocate Beta",
                            "Case: WP 91001/2026",
                        ],
                        title="[TEST DATA] Beta Isolated Document",
                    ),
                ),
            ]
            for case_obj, owner, title, doc_type, fname, mime, payload_bytes in doc_specs:
                if not CaseDocument.objects.filter(case=case_obj, title=title).exists():
                    doc = CaseDocument(
                        case=case_obj,
                        uploaded_by=owner,
                        title=title,
                        document_type=doc_type,
                        description=f"{SEED_TAG} Synthetic test attachment for manual download check.",
                        original_filename=fname,
                        file_size=len(payload_bytes),
                        mime_type=mime,
                    )
                    doc.file.save(fname, ContentFile(payload_bytes), save=False)
                    doc.save()
                    counts["case_documents_created"] += 1

            # 5. Seed Reminders & Calendar Compliance Deadlines
            reminder_specs = [
                (
                    alpha_user,
                    alpha_cases[0],
                    f"{SEED_TAG} Today Hearing Appearance - WP 90001/2026",
                    "HEARING",
                    "PENDING",
                    now + datetime.timedelta(hours=2),
                    False,
                ),
                (
                    alpha_user,
                    alpha_cases[8],
                    f"{SEED_TAG} Prepare Appeal Paper Book - WA 90009/2026",
                    "FILING",
                    "PENDING",
                    now + datetime.timedelta(days=1, hours=1),
                    False,
                ),
                (
                    alpha_user,
                    alpha_cases[1],
                    f"{SEED_TAG} Pay Process Fee / Batta - WP 90002/2026",
                    "BATTA",
                    "PENDING",
                    now + datetime.timedelta(days=2),
                    False,
                ),
                (
                    alpha_user,
                    alpha_cases[12],
                    f"{SEED_TAG} File Memo of Appearance - CRP 90013/2026",
                    "FILING",
                    "PENDING",
                    now + datetime.timedelta(days=4),
                    False,
                ),
                (
                    alpha_user,
                    alpha_cases[2],
                    f"{SEED_TAG} Follow up Counter Affidavit - WP 90003/2025",
                    "GENERAL",
                    "PENDING",
                    now + datetime.timedelta(days=7),
                    False,
                ),
                (
                    alpha_user,
                    alpha_cases[3],
                    f"{SEED_TAG} Completed Compliance Check - WP 90004/2025",
                    "GENERAL",
                    "SENT",
                    now - datetime.timedelta(days=5),
                    True,
                ),
                (
                    alpha_user,
                    None,
                    f"{SEED_TAG} Monthly Chamber Docket Audit",
                    "GENERAL",
                    "DISMISSED",
                    now - datetime.timedelta(days=2),
                    True,
                ),
                (
                    beta_user,
                    beta_cases[0],
                    f"{SEED_TAG} Beta Hearing Reminder - WP 91001/2026",
                    "HEARING",
                    "PENDING",
                    now + datetime.timedelta(days=3),
                    False,
                ),
            ]
            for adv, case_obj, title, r_type, r_status, due_dt, completed in reminder_specs:
                _, rem_created = Reminder.objects.get_or_create(
                    advocate=adv,
                    title=title,
                    defaults={
                        "case": case_obj,
                        "description": f"{SEED_TAG} Synthetic reminder for Calendar & Reminders testing.",
                        "reminder_type": r_type,
                        "status": r_status,
                        "due_date": due_dt,
                        "is_completed": completed,
                        "notification_sent_at": due_dt if r_status == "SENT" else None,
                    },
                )
                if rem_created:
                    counts["reminders_created"] += 1

            # 6. Seed In-App Notifications (deduplicated via idempotency_key)
            notif_specs = [
                (
                    alpha_user,
                    f"{SEED_NOTIFICATION_PREFIX}ALPHA_1",
                    f"{SEED_TAG} Hearing Today: WP 90001/2026",
                    "Synthetic reminder: WP 90001/2026 listed in Court Hall 4 (Item #10).",
                    "HEARING_REMINDER",
                    False,
                    {"case_id": alpha_cases[0].id, "seed": True},
                ),
                (
                    alpha_user,
                    f"{SEED_NOTIFICATION_PREFIX}ALPHA_2",
                    f"{SEED_TAG} Hearing Adjourned: WP 90003/2025",
                    "Synthetic update: WP 90003/2025 rescheduled for counter affidavit.",
                    "HEARING_CHANGE",
                    False,
                    {"case_id": alpha_cases[2].id, "seed": True},
                ),
                (
                    alpha_user,
                    f"{SEED_NOTIFICATION_PREFIX}ALPHA_3",
                    f"{SEED_TAG} Synthetic Judgment Entry: WP 90004/2025",
                    "Synthetic disposal order summary posted for test verification.",
                    "JUDGMENT",
                    False,
                    {"case_id": alpha_cases[3].id, "seed": True},
                ),
                (
                    alpha_user,
                    f"{SEED_NOTIFICATION_PREFIX}ALPHA_4",
                    f"{SEED_TAG} Token Approaching: Court Hall 4",
                    "Synthetic display board alert: 3 items remaining before WP 90001/2026.",
                    "TOKEN_APPROACHING",
                    True,
                    {"case_id": alpha_cases[0].id, "hall": 4, "seed": True},
                ),
                (
                    alpha_user,
                    f"{SEED_NOTIFICATION_PREFIX}ALPHA_5",
                    f"{SEED_TAG} Compliance Deadline Tomorrow",
                    "Prepare synthetic paper book for WA 90009/2026.",
                    "COMPLIANCE_DEADLINE",
                    True,
                    {"case_id": alpha_cases[8].id, "seed": True},
                ),
                (
                    beta_user,
                    f"{SEED_NOTIFICATION_PREFIX}BETA_1",
                    f"{SEED_TAG} Beta Hearing Notice: WP 91001/2026",
                    "Isolated synthetic notification for Test Advocate Beta only.",
                    "HEARING_REMINDER",
                    False,
                    {"case_id": beta_cases[0].id, "seed": True},
                ),
            ]
            for usr, idem_key, title, body, category, is_read, payload in notif_specs:
                _, n_created = NotificationHistory.objects.get_or_create(
                    idempotency_key=idem_key,
                    defaults={
                        "user": usr,
                        "title": title,
                        "body": body,
                        "category": category,
                        "data_payload": payload,
                        "delivery_status": "DELIVERED",
                        "is_read": is_read,
                    },
                )
                if n_created:
                    counts["notifications_created"] += 1

            # 7. Seed Court Halls, Demo Token Status, Token Alerts & Court Listings
            hall_specs = [
                (1, "Division Bench I (TEST DATA)", "Synthetic Bench Panel I", 8),
                (2, "Criminal Bench II (TEST DATA)", "Synthetic Bench Panel II", 12),
                (4, "Writ Bench III (TEST DATA)", "Synthetic Bench Panel III", 7),
                (6, "Single Bench IV (TEST DATA)", "Synthetic Bench Panel IV", 5),
            ]
            halls_by_num: dict[int, CourtHall] = {}
            for hall_no, bench_name, judges, current_item in hall_specs:
                hall, h_created = CourtHall.objects.get_or_create(
                    hall_number=hall_no,
                    defaults={
                        "bench_name": bench_name,
                        "presiding_judges": judges,
                        "is_active": True,
                    },
                )
                if h_created:
                    counts["court_halls_created"] += 1
                halls_by_num[hall_no] = hall

                CourtTokenStatus.objects.get_or_create(
                    court_hall=hall,
                    defaults={
                        "current_item_number": current_item,
                        "current_stage": "HEARING_IN_PROGRESS",
                    },
                )

            token_specs = [
                (
                    alpha_user,
                    alpha_cases[0],
                    halls_by_num[4],
                    today,
                    "TEST-TKN-90001",
                    10,
                    3,
                    TokenStatus.APPROACHING,
                ),
                (
                    alpha_user,
                    alpha_cases[8],
                    halls_by_num[1],
                    today + datetime.timedelta(days=1),
                    "TEST-TKN-90009",
                    14,
                    6,
                    TokenStatus.WAITING,
                ),
                (
                    beta_user,
                    beta_cases[0],
                    halls_by_num[4],
                    today + datetime.timedelta(days=3),
                    "TEST-TKN-91001",
                    19,
                    12,
                    TokenStatus.REGISTERED,
                ),
            ]
            for adv, case_obj, hall_obj, h_date, tkn, item_no, rem, t_status in token_specs:
                _, t_created = TokenAlertRule.objects.get_or_create(
                    advocate=adv,
                    court_hall=hall_obj,
                    token_number=tkn,
                    hearing_date=h_date,
                    defaults={
                        "case": case_obj,
                        "court_name": "High Court of Andhra Pradesh",
                        "listed_item_number": item_no,
                        "bench_name": hall_obj.bench_name,
                        "alert_threshold": 5,
                        "status": t_status,
                        "current_called_token": str(max(1, item_no - rem)),
                        "items_remaining": rem,
                        "is_active": True,
                        "sync_source": SEED_SOURCE_TAG,
                        "is_mock": True,
                        "last_synced_at": now,
                    },
                )
                if t_created:
                    counts["token_alerts_created"] += 1

            for case_obj in [alpha_cases[0], alpha_cases[1], alpha_cases[8], beta_cases[0]]:
                _, cl_created = CourtListing.objects.get_or_create(
                    case=case_obj,
                    provider_name=SEED_SOURCE_TAG,
                    defaults={
                        "court_name": "High Court of Andhra Pradesh",
                        "bench": case_obj.bench,
                        "court_hall": case_obj.court_hall_number,
                        "listing_date": case_obj.next_hearing_date,
                        "session": "Morning Session (10:30 AM)",
                        "item_number": 10,
                        "token_number": f"TEST-LST-{case_obj.case_number}",
                        "source_status": "LISTED",
                        "normalized_status": "LISTED",
                        "last_synced_at": now,
                        "is_mock": True,
                    },
                )
                if cl_created:
                    counts["court_listings_created"] += 1

        # 8. Generate Synthetic Sample Import Files (outside DB transaction)
        repo_root = Path(settings.BASE_DIR).parent
        sample_files = _generate_sample_import_files(repo_root)

        # Verify existing users were preserved
        post_existing_users = list(
            User.objects.exclude(username__in=[ALPHA_USERNAME, BETA_USERNAME]).values_list(
                "id", "username"
            )
        )
        post_existing_case_count = (
            Case.objects.exclude(case_number__startswith="900")
            .exclude(case_number__startswith="910")
            .count()
        )

        if (
            pre_existing_users != post_existing_users
            or pre_existing_case_count != post_existing_case_count
        ):
            raise CommandError("Unexpected change to pre-existing records detected!")

        self.stdout.write(self.style.SUCCESS("=== STAGING SEED COMPLETE ==="))
        self.stdout.write(f"GIT_BRANCH: {branch}")
        self.stdout.write(f"DB_LIVE: {live_db} @ {EXPECTED_DB_HOST}:{live_port} (user={live_user})")
        self.stdout.write(f"DB_VERSION: {live_ver}")
        self.stdout.write(
            f"PRE_EXISTING_USERS_PRESERVED: {len(pre_existing_users)} -> {len(post_existing_users)}"
        )
        self.stdout.write(f"NEW_RECORDS_THIS_RUN: {counts}")
        self.stdout.write(
            "TOTAL_SEEDED_IN_DB: "
            f"alpha_cases={Case.objects.filter(tracked_by=alpha_user).count()}, "
            f"beta_cases={Case.objects.filter(tracked_by=beta_user).count()}, "
            f"hearings={Hearing.objects.filter(case__in=alpha_cases + beta_cases).count()}, "
            f"judgments={Judgment.objects.filter(case__in=alpha_cases + beta_cases).count()}, "
            f"case_history={CaseHistory.objects.filter(case__in=alpha_cases + beta_cases).count()}, "
            f"case_notes={CaseNote.objects.filter(advocate__in=[alpha_user, beta_user]).count()}, "
            f"case_documents={CaseDocument.objects.filter(uploaded_by__in=[alpha_user, beta_user]).count()}, "
            f"reminders={Reminder.objects.filter(advocate__in=[alpha_user, beta_user]).count()}, "
            f"notifications={NotificationHistory.objects.filter(idempotency_key__startswith=SEED_NOTIFICATION_PREFIX).count()}, "
            f"token_alerts={TokenAlertRule.objects.filter(sync_source=SEED_SOURCE_TAG).count()}, "
            f"court_listings={CourtListing.objects.filter(provider_name=SEED_SOURCE_TAG).count()}"
        )
        for sf in sample_files:
            self.stdout.write(f"SAMPLE_IMPORT_FILE: {sf} ({os.path.getsize(sf)} bytes)")
