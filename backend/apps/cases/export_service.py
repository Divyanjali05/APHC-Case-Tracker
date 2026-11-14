from __future__ import annotations

import csv
import io
from typing import Any

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def sanitize_csv_cell(value: Any) -> str:
    """Neutralize potential CSV formula injection (CWE-1236).

    Prepends a single quote if a cell starts with dangerous formula prefixes.
    """
    if value is None:
        return ""
    s = str(value).strip()
    if s.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{s}"
    return s


class CaseCsvExportService:
    """Generates sanitized CSV case listings with formula injection mitigation."""

    @classmethod
    def generate_case_list_csv(cls, cases_queryset: Any) -> str:
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        headers = [
            "Case Number",
            "Case Type",
            "Filing Year",
            "Petitioner",
            "Respondent",
            "Petitioner Advocate",
            "Respondent Advocate",
            "Court Hall",
            "Bench",
            "Current Stage",
            "Status",
            "Next Hearing Date",
            "Last Updated",
        ]
        writer.writerow(headers)

        for case in cases_queryset.prefetch_related("hearings", "judgments"):
            status_text = getattr(case, "status", None) or case.current_stage
            hall_text = f"Hall {case.court_hall_number}" if case.court_hall_number else "—"
            next_date = case.next_hearing_date.isoformat() if case.next_hearing_date else "—"
            updated_str = case.updated_at.strftime("%Y-%m-%d %H:%M") if case.updated_at else "—"

            row = [
                sanitize_csv_cell(f"{case.case_type} {case.case_number}/{case.filing_year}"),
                sanitize_csv_cell(case.case_type),
                sanitize_csv_cell(case.filing_year),
                sanitize_csv_cell(case.petitioner),
                sanitize_csv_cell(case.respondent),
                sanitize_csv_cell(case.petitioner_advocate or "—"),
                sanitize_csv_cell(case.respondent_advocate or "—"),
                sanitize_csv_cell(hall_text),
                sanitize_csv_cell(case.bench or "—"),
                sanitize_csv_cell(case.current_stage),
                sanitize_csv_cell(status_text),
                sanitize_csv_cell(next_date),
                sanitize_csv_cell(updated_str),
            ]
            writer.writerow(row)

        return output.getvalue()


class CasePdfExportService:
    """Generates professional legal PDF case summary document using ReportLab."""

    @classmethod
    def generate_case_summary_pdf(cls, case: Any, user: Any) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "LegalTitle",
            parent=styles["Heading1"],
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#0B132B"),
            alignment=1,  # Center
            spaceAfter=4,
        )
        subtitle_style = ParagraphStyle(
            "LegalSubtitle",
            parent=styles["Normal"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#78350F"),  # Gold
            alignment=1,
            spaceAfter=8,
        )
        section_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading2"],
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#1E3A8A"),  # Navy/Blue
            spaceBefore=10,
            spaceAfter=6,
        )
        body_style = ParagraphStyle(
            "BodyDark",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#0F172A"),
        )
        bold_label = ParagraphStyle(
            "BoldLabel",
            parent=body_style,
            fontName="Helvetica-Bold",
        )
        small_muted = ParagraphStyle(
            "SmallMuted",
            parent=body_style,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#64748B"),
        )

        elements = []

        # 1. Header Banner
        elements.append(Paragraph("HIGH COURT OF ANDHRA PRADESH AT AMARAVATI", title_style))
        elements.append(Paragraph("ADVOCATE DOCKET SUMMARY & CASE PROCEEDINGS", subtitle_style))
        elements.append(
            HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#F59E0B"), spaceAfter=10)
        )

        # 2. Case Details Table
        advocate_name = user.get_full_name() or user.username if user else "Advocate"
        status_text = getattr(case, "status", None) or case.current_stage
        hall_str = (
            f"Court Hall {case.court_hall_number}" if case.court_hall_number else "Not assigned"
        )
        next_date_str = (
            case.next_hearing_date.strftime("%d-%b-%Y") if case.next_hearing_date else "Unscheduled"
        )
        now_str = timezone.now().strftime("%d-%b-%Y %I:%M %p")

        docket_data = [
            [
                Paragraph("<b>Case Number:</b>", bold_label),
                Paragraph(
                    f"<b>{case.case_type} {case.case_number}/{case.filing_year}</b>", bold_label
                ),
                Paragraph("<b>Current Status:</b>", bold_label),
                Paragraph(str(status_text), body_style),
            ],
            [
                Paragraph("<b>Petitioner:</b>", bold_label),
                Paragraph(case.petitioner, body_style),
                Paragraph("<b>Petitioner Advocate:</b>", bold_label),
                Paragraph(case.petitioner_advocate or "—", body_style),
            ],
            [
                Paragraph("<b>Respondent:</b>", bold_label),
                Paragraph(case.respondent, body_style),
                Paragraph("<b>Respondent Advocate:</b>", bold_label),
                Paragraph(case.respondent_advocate or "—", body_style),
            ],
            [
                Paragraph("<b>Bench / Judge:</b>", bold_label),
                Paragraph(case.bench or "Regular Bench", body_style),
                Paragraph("<b>Court Hall:</b>", bold_label),
                Paragraph(hall_str, body_style),
            ],
            [
                Paragraph("<b>Next Hearing Date:</b>", bold_label),
                Paragraph(f"<b>{next_date_str}</b>", bold_label),
                Paragraph("<b>Generated By:</b>", bold_label),
                Paragraph(f"{advocate_name} ({now_str})", small_muted),
            ],
        ]

        docket_table = Table(docket_data, colWidths=[110, 160, 110, 140])
        docket_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        elements.append(docket_table)
        elements.append(Spacer(1, 14))

        # 3. Judgment Section (if present)
        latest_judgment = getattr(case, "latest_judgment", None)
        if not latest_judgment and hasattr(case, "judgments"):
            latest_judgment = case.judgments.order_by("-judgment_date", "-created_at").first()

        if latest_judgment:
            elements.append(Paragraph("Judgment & Final Orders", section_style))
            judgment_date_str = (
                latest_judgment.judgment_date.strftime("%d-%b-%Y")
                if latest_judgment.judgment_date
                else "—"
            )
            order_num_str = latest_judgment.order_number or "—"
            summary_txt = latest_judgment.summary or "Judgment delivered and recorded."

            judgment_table = Table(
                [
                    [
                        Paragraph("<b>Judgment Date:</b>", bold_label),
                        Paragraph(judgment_date_str, body_style),
                    ],
                    [
                        Paragraph("<b>Order Number:</b>", bold_label),
                        Paragraph(order_num_str, body_style),
                    ],
                    [Paragraph("<b>Summary:</b>", bold_label), Paragraph(summary_txt, body_style)],
                ],
                colWidths=[120, 400],
            )
            judgment_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#F59E0B")),
                        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#FDE68A")),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            elements.append(judgment_table)
            elements.append(Spacer(1, 14))

        # 4. Hearing Proceedings History
        elements.append(Paragraph("Hearing Proceedings & History", section_style))
        hearings = case.hearings.order_by("-hearing_date", "-id")[:15]
        if hearings:
            hearing_rows = [
                [
                    Paragraph("<b>Date & Time</b>", bold_label),
                    Paragraph("<b>Hall / Item</b>", bold_label),
                    Paragraph("<b>Status</b>", bold_label),
                    Paragraph("<b>Business Conducted / Next Date</b>", bold_label),
                ]
            ]
            for h in hearings:
                date_part = h.hearing_date.strftime("%d-%b-%Y")
                time_part = f" at {h.hearing_time}" if h.hearing_time else ""
                hall_item = f"Hall {h.court_hall_number or '—'} / #{h.item_number or '—'}"
                next_str = f" [Next: {h.next_date.strftime('%d-%b-%Y')}]" if h.next_date else ""
                business_str = (h.business_conducted or "Proceedings conducted.") + next_str

                hearing_rows.append(
                    [
                        Paragraph(f"{date_part}{time_part}", body_style),
                        Paragraph(hall_item, body_style),
                        Paragraph(h.status, body_style),
                        Paragraph(business_str, body_style),
                    ]
                )

            h_table = Table(hearing_rows, colWidths=[110, 90, 80, 240])
            h_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ]
                )
            )
            elements.append(h_table)
        else:
            elements.append(Paragraph("<i>No hearing appearances recorded yet.</i>", small_muted))
        elements.append(Spacer(1, 14))

        # 5. Case Documents Index (Metadata only)
        if hasattr(case, "documents"):
            docs = case.documents.all()[:15]
            if docs:
                elements.append(Paragraph("Case Documents Index", section_style))
                doc_rows = [
                    [
                        Paragraph("<b>Title</b>", bold_label),
                        Paragraph("<b>Category</b>", bold_label),
                        Paragraph("<b>Original File</b>", bold_label),
                        Paragraph("<b>Uploaded Date</b>", bold_label),
                    ]
                ]
                for d in docs:
                    doc_rows.append(
                        [
                            Paragraph(d.title, body_style),
                            Paragraph(d.get_document_type_display(), body_style),
                            Paragraph(d.original_filename, body_style),
                            Paragraph(d.created_at.strftime("%d-%b-%Y"), body_style),
                        ]
                    )
                d_table = Table(doc_rows, colWidths=[140, 120, 160, 100])
                d_table.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ]
                    )
                )
                elements.append(d_table)
                elements.append(Spacer(1, 14))

        # 6. Confidential Advocate Notice
        elements.append(
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#94A3B8"), spaceAfter=6)
        )
        elements.append(
            Paragraph(
                "CONFIDENTIAL ADVOCATE RECORD — GENERATED AUTOMATICALLY VIA APHC CASE TRACKER. "
                "THIS DOCUMENT CONTAINS PRIVILEGED CASE DOCKET INFORMATION.",
                small_muted,
            )
        )

        doc.build(elements)
        return buffer.getvalue()
