import os
import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.services import NotificationService
from apps.reminders.services import ReminderService

from .export_service import CaseCsvExportService, CasePdfExportService
from .extractor import DocumentExtractionService, normalize_date_str
from .history_service import CaseHistoryService
from .models import Case, CaseDocument, CaseHistory, CaseNote, Hearing, Judgment
from .query_normalizer import normalize_voice_query_py
from .serializers import (
    CaseDocumentSerializer,
    CaseDocumentUploadSerializer,
    CaseHistorySerializer,
    CaseNoteSerializer,
    CaseSerializer,
    DashboardResponseSerializer,
    HearingRescheduleSerializer,
    HearingSerializer,
    JudgmentSerializer,
)
from .services import DashboardService
from .storage import secure_document_storage, validate_case_document_upload


class CaseListCreateView(generics.ListCreateAPIView):
    """List tracked cases with filtering/search, or register a new case for tracking."""

    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Case.objects.filter(tracked_by=user).prefetch_related("hearings", "judgments")

        # Search parameter: matches case number, petitioner, respondent, or advocate
        # Enhanced with multilingual voice query normalization (Telugu, Hindi, English, Indic numerals)
        search = self.request.query_params.get("search", "").strip()
        if search:
            norm_info = normalize_voice_query_py(search)
            norm_query = norm_info["normalized"]
            case_type = norm_info["case_type"]
            case_num = norm_info["case_number"]
            filing_yr = norm_info["filing_year"]

            search_filter = (
                Q(case_number__icontains=search)
                | Q(petitioner__icontains=search)
                | Q(respondent__icontains=search)
                | Q(petitioner_advocate__icontains=search)
                | Q(respondent_advocate__icontains=search)
                | Q(case_type__icontains=search)
            )

            if norm_query and norm_query != search:
                search_filter |= (
                    Q(case_number__icontains=norm_query)
                    | Q(petitioner__icontains=norm_query)
                    | Q(respondent__icontains=norm_query)
                    | Q(petitioner_advocate__icontains=norm_query)
                    | Q(respondent_advocate__icontains=norm_query)
                    | Q(case_type__icontains=norm_query)
                )

            if case_type and case_num:
                structured_q = Q(case_type__iexact=case_type, case_number__icontains=case_num)
                if filing_yr:
                    structured_q &= Q(filing_year=filing_yr)
                search_filter |= structured_q
            elif case_num:
                search_filter |= Q(case_number__icontains=case_num)

            queryset = queryset.filter(search_filter)

        # Has judgment filter
        has_judgment = self.request.query_params.get("has_judgment")
        if has_judgment is not None:
            if has_judgment.lower() in ("true", "1"):
                queryset = queryset.filter(judgments__isnull=False).distinct()
            elif has_judgment.lower() in ("false", "0"):
                queryset = queryset.filter(judgments__isnull=True)

        # Status filter
        status_param = self.request.query_params.get("status", "").strip().lower()
        if status_param == "adjourned":
            queryset = queryset.filter(
                Q(current_stage__iexact="ADJOURNED")
                | Q(hearings__business_conducted__icontains="adjourn")
            ).distinct()
        elif status_param == "upcoming":
            queryset = queryset.filter(
                Q(next_hearing_date__isnull=False) | Q(current_stage__in=["UPCOMING", "LISTED"])
            ).distinct()
        elif status_param in ("judgment", "judgment available", "disposed"):
            queryset = queryset.filter(judgments__isnull=False).distinct()

        # Ordering
        ordering = self.request.query_params.get("ordering", "-updated_at")
        allowed_orderings = [
            "updated_at",
            "-updated_at",
            "created_at",
            "-created_at",
            "next_hearing_date",
            "-next_hearing_date",
            "case_number",
            "-case_number",
            "filing_year",
            "-filing_year",
            "petitioner",
            "-petitioner",
        ]
        if ordering in allowed_orderings:
            queryset = queryset.order_by(ordering)

        return queryset

    def perform_create(self, serializer):
        case = serializer.save()
        case.tracked_by.add(self.request.user)
        CaseHistoryService.record_case_creation(case, changed_by=self.request.user)


class CaseDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or remove case from advocate's active tracked docket."""

    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Case.objects.filter(tracked_by=self.request.user).prefetch_related(
            "hearings", "judgments"
        )

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = {
            "current_stage": old_instance.current_stage,
            "bench": old_instance.bench,
            "court_hall_number": old_instance.court_hall_number,
            "next_hearing_date": old_instance.next_hearing_date,
        }
        updated_case = serializer.save()
        new_data = {
            "current_stage": updated_case.current_stage,
            "bench": updated_case.bench,
            "court_hall_number": updated_case.court_hall_number,
            "next_hearing_date": updated_case.next_hearing_date,
        }
        CaseHistoryService.record_case_update(
            updated_case, old_data, new_data, changed_by=self.request.user
        )

    def perform_destroy(self, instance):
        instance.tracked_by.remove(self.request.user)


class CaseJudgmentListCreateView(generics.ListCreateAPIView):
    """List or create judgments for an authorized tracked case."""

    serializer_class = JudgmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_case(self):
        return get_object_or_404(
            Case.objects.filter(tracked_by=self.request.user),
            pk=self.kwargs["case_id"],
        )

    def get_queryset(self):
        case = self.get_case()
        return Judgment.objects.filter(case=case)

    def perform_create(self, serializer):
        case = self.get_case()
        judgment = serializer.save(case=case)
        CaseHistoryService.record_judgment_event(
            judgment, is_created=True, changed_by=self.request.user
        )
        NotificationService.send_judgment_notification(
            judgment=judgment, is_new=True, changed_by=self.request.user
        )


class JudgmentDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or update a judgment record for an authorized tracked case."""

    serializer_class = JudgmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_case(self):
        return get_object_or_404(
            Case.objects.filter(tracked_by=self.request.user),
            pk=self.kwargs["case_id"],
        )

    def get_queryset(self):
        case = self.get_case()
        return Judgment.objects.filter(case=case)

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = {
            "judgment_date": old_instance.judgment_date,
            "order_number": old_instance.order_number,
            "summary": old_instance.summary,
            "document_link": old_instance.document_link,
        }
        updated_judgment = serializer.save()
        CaseHistoryService.record_judgment_event(
            updated_judgment, is_created=False, old_data=old_data, changed_by=self.request.user
        )
        document_uploaded = bool(
            updated_judgment.document_link
            and updated_judgment.document_link != old_instance.document_link
        )
        has_substantive_change = (
            document_uploaded
            or updated_judgment.judgment_date != old_data["judgment_date"]
            or (updated_judgment.order_number or "") != (old_data["order_number"] or "")
            or (updated_judgment.summary or "") != (old_data["summary"] or "")
        )
        if has_substantive_change:
            NotificationService.send_judgment_notification(
                judgment=updated_judgment,
                is_new=False,
                document_uploaded=document_uploaded,
                changed_by=self.request.user,
            )


class CaseHistoryListView(generics.ListAPIView):
    """Retrieve chronological audit timeline for an authorized tracked case."""

    serializer_class = CaseHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_case(self):
        return get_object_or_404(
            Case.objects.filter(tracked_by=self.request.user),
            pk=self.kwargs["case_id"],
        )

    def get_queryset(self):
        case = self.get_case()
        queryset = (
            CaseHistory.objects.filter(case=case)
            .exclude(
                Q(event_type__in=["NOTE_ADDED", "NOTE_UPDATED", "NOTE_DELETED"])
                & ~Q(changed_by=self.request.user)
            )
            .select_related("changed_by")
        )
        event_type = self.request.query_params.get("event_type", "").strip()
        if event_type:
            queryset = queryset.filter(event_type__iexact=event_type)
        return queryset


class JudgmentDocumentView(APIView):
    """Securely retrieve document reference for a judgment of an authorized tracked case."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id, pk):
        case = get_object_or_404(
            Case.objects.filter(tracked_by=request.user),
            pk=case_id,
        )
        try:
            judgment = Judgment.objects.get(case=case, pk=pk)
        except Judgment.DoesNotExist as exc:
            raise NotFound("Judgment record not found for this matter.") from exc

        return Response(
            {
                "id": judgment.id,
                "case_id": case.id,
                "case_title": f"{case.case_type} {case.case_number}/{case.filing_year}",
                "judgment_date": judgment.judgment_date,
                "document_link": judgment.document_link if judgment.document_link else None,
                "has_document": bool(judgment.document_link),
            },
            status=status.HTTP_200_OK,
        )


class DashboardView(APIView):
    """Consolidated summary statistics and court activity dashboard for authenticated advocate."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        dashboard_data = DashboardService.get_dashboard_data(request.user)
        serializer = DashboardResponseSerializer(dashboard_data)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CasesStatusView(APIView):
    """Health / readiness probe for cases app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "app": "cases",
                "status": "ready",
                "description": "Case Dockets, Hearings & Judgments",
            },
            status=status.HTTP_200_OK,
        )


class UpcomingHearingsListView(generics.ListAPIView):
    """List all upcoming hearings for cases tracked by the authenticated advocate."""

    serializer_class = HearingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        today = timezone.now().date()
        queryset = (
            Hearing.objects.filter(
                case__tracked_by=user,
                hearing_date__gte=today,
            )
            .exclude(status__in=["COMPLETED", "CANCELLED"])
            .select_related("case")
            .order_by("hearing_date", "hearing_time")
        )

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(case__case_number__icontains=search)
                | Q(case__petitioner__icontains=search)
                | Q(case__respondent__icontains=search)
                | Q(case__case_type__icontains=search)
            )
        return queryset


class CaseHearingListCreateView(generics.ListCreateAPIView):
    """List hearings for a specific case, or schedule a new hearing appearance."""

    serializer_class = HearingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_case(self) -> Case:
        return get_object_or_404(
            Case.objects.filter(tracked_by=self.request.user),
            pk=self.kwargs["case_id"],
        )

    def get_queryset(self):
        case = self.get_case()
        return Hearing.objects.filter(case=case).select_related("case").order_by("-hearing_date")

    def perform_create(self, serializer):
        case = self.get_case()
        hearing = serializer.save(case=case)

        # Audit history recording
        CaseHistoryService.record_hearing_event(
            hearing=hearing,
            is_created=True,
            changed_by=self.request.user,
        )

        # Schedule automated reminders for upcoming appearance
        ReminderService.schedule_hearing_reminders(hearing)

        # If hearing is in future, update case's next hearing date
        if hearing.hearing_date >= timezone.now().date():
            if not case.next_hearing_date or hearing.hearing_date <= case.next_hearing_date:
                case.next_hearing_date = hearing.hearing_date
                case.save(update_fields=["next_hearing_date", "updated_at"])


class CaseHearingDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or update a specific hearing appearance."""

    serializer_class = HearingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        case = get_object_or_404(
            Case.objects.filter(tracked_by=self.request.user),
            pk=self.kwargs["case_id"],
        )
        return Hearing.objects.filter(case=case).select_related("case")

    def perform_update(self, serializer):
        old_hearing = self.get_object()
        old_date = old_hearing.hearing_date
        old_time = old_hearing.hearing_time
        old_hall = old_hearing.court_hall_number
        old_item = old_hearing.item_number
        old_status = old_hearing.status
        old_next_date = old_hearing.next_date
        old_business = old_hearing.business_conducted

        updated_hearing = serializer.save()

        # Audit history recording
        old_data = {
            "hearing_date": old_date,
            "hearing_time": old_time,
            "court_hall_number": old_hall,
            "item_number": old_item,
            "status": old_status,
            "next_date": old_next_date,
            "business_conducted": old_business,
        }
        CaseHistoryService.record_hearing_event(
            hearing=updated_hearing,
            is_created=False,
            old_data=old_data,
            changed_by=self.request.user,
        )

        # Hearing change notifications and automated reminder synchronization
        if updated_hearing.hearing_date != old_date or updated_hearing.hearing_time != old_time:
            ReminderService.cancel_pending_hearing_reminders(
                updated_hearing,
                reason=f"Obsolete: appearance rescheduled to {updated_hearing.hearing_date}",
            )
            ReminderService.schedule_hearing_reminders(updated_hearing)
            NotificationService.send_hearing_change_notification(
                hearing=updated_hearing,
                change_type="RESCHEDULED",
                details={
                    "old_date": str(old_date),
                    "new_date": str(updated_hearing.hearing_date),
                    "old_time": str(old_time) if old_time else None,
                    "new_time": str(updated_hearing.hearing_time)
                    if updated_hearing.hearing_time
                    else None,
                    "reason": updated_hearing.rescheduled_reason,
                },
                changed_by=self.request.user,
            )
        elif updated_hearing.status == "CANCELLED" and old_status != "CANCELLED":
            ReminderService.cancel_pending_hearing_reminders(
                updated_hearing,
                reason="Hearing cancelled",
            )
            NotificationService.send_hearing_change_notification(
                hearing=updated_hearing,
                change_type="CANCELLED",
                details={"hearing_date": str(updated_hearing.hearing_date)},
                changed_by=self.request.user,
            )
        elif (updated_hearing.status == "ADJOURNED" and old_status != "ADJOURNED") or (
            updated_hearing.next_date and updated_hearing.next_date != old_next_date
        ):
            NotificationService.send_hearing_change_notification(
                hearing=updated_hearing,
                change_type="ADJOURNED",
                details={"next_date": str(updated_hearing.next_date or "")},
                changed_by=self.request.user,
            )
        elif (
            updated_hearing.court_hall_number != old_hall or updated_hearing.item_number != old_item
        ):
            NotificationService.send_hearing_change_notification(
                hearing=updated_hearing,
                change_type="COURT_HALL_CHANGED",
                details={
                    "old_hall": old_hall,
                    "new_hall": updated_hearing.court_hall_number,
                    "old_item": old_item,
                    "new_item": updated_hearing.item_number,
                },
                changed_by=self.request.user,
            )
        elif (
            updated_hearing.business_conducted
            and updated_hearing.business_conducted != old_business
        ):
            NotificationService.send_hearing_change_notification(
                hearing=updated_hearing,
                change_type="PROCEEDINGS_RECORDED",
                details={"business_conducted": updated_hearing.business_conducted},
                changed_by=self.request.user,
            )


class HearingRescheduleView(APIView):
    """Reschedule a hearing appearance with automatic reminder updates and audit tracking."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, case_id, pk):
        case = get_object_or_404(
            Case.objects.filter(tracked_by=request.user),
            pk=case_id,
        )
        hearing = get_object_or_404(
            Hearing.objects.filter(case=case),
            pk=pk,
        )

        serializer = HearingRescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_date = serializer.validated_data["new_hearing_date"]
        new_time = serializer.validated_data.get("new_hearing_time")
        reason = serializer.validated_data.get("reason", "")
        court_hall_number = serializer.validated_data.get("court_hall_number")
        item_number = serializer.validated_data.get("item_number")

        updated_hearing = ReminderService.reschedule_hearing(
            hearing=hearing,
            new_date=new_date,
            new_time=new_time,
            reason=reason,
            court_hall_number=court_hall_number,
            item_number=item_number,
            changed_by=request.user,
        )

        return Response(
            {
                "detail": "Hearing appearance rescheduled successfully.",
                "hearing": HearingSerializer(updated_hearing).data,
            },
            status=status.HTTP_200_OK,
        )


class VoiceQueryNormalizeView(APIView):
    """Normalizes spoken multilingual query string (Telugu, Hindi, English)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        result = normalize_voice_query_py(q)
        return Response(result, status=status.HTTP_200_OK)


class CaseDocumentListCreateView(APIView):
    """List documents for a tracked case or securely upload a new document."""

    permission_classes = [permissions.IsAuthenticated]

    def get_case(self, case_id):
        return get_object_or_404(Case, id=case_id, tracked_by=self.request.user)

    def get(self, request, case_id):
        case = self.get_case(case_id)
        docs = CaseDocument.objects.filter(case=case).select_related("uploaded_by")
        category = request.query_params.get("category", "").strip().upper()
        if category:
            docs = docs.filter(document_type=category)
        serializer = CaseDocumentSerializer(docs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, case_id):
        case = self.get_case(case_id)
        serializer = CaseDocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uploaded_file = serializer.validated_data["file"]
        title = serializer.validated_data.get("title") or os.path.basename(uploaded_file.name)
        document_type = serializer.validated_data.get("document_type", "OTHER")
        description = serializer.validated_data.get("description", "")
        mime_type = getattr(uploaded_file, "detected_mime_type", "application/octet-stream")

        doc = CaseDocument.objects.create(
            case=case,
            uploaded_by=request.user,
            title=title,
            document_type=document_type,
            description=description,
            original_filename=os.path.basename(uploaded_file.name or "document"),
            file_size=uploaded_file.size,
            mime_type=mime_type,
            file=uploaded_file,
        )

        CaseHistoryService.record_event(
            case=case,
            event_type="DOCUMENT_UPDATED",
            description=f"Document uploaded: {doc.title} ({doc.get_document_type_display()})",
            changed_by=request.user,
            source="MANUAL",
        )

        return Response(CaseDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class CaseDocumentDetailView(APIView):
    """Retrieve metadata, update metadata, or delete a case document."""

    permission_classes = [permissions.IsAuthenticated]

    def get_document(self, case_id, pk, *, require_uploader: bool = False):
        qs = CaseDocument.objects.select_related("case", "uploaded_by").filter(
            id=pk,
            case_id=case_id,
            case__tracked_by=self.request.user,
        )
        if require_uploader:
            qs = qs.filter(uploaded_by=self.request.user)
        return get_object_or_404(qs)

    def get(self, request, case_id, pk):
        doc = self.get_document(case_id, pk)
        return Response(CaseDocumentSerializer(doc).data, status=status.HTTP_200_OK)

    def patch(self, request, case_id, pk):
        doc = self.get_document(case_id, pk, require_uploader=True)
        serializer = CaseDocumentSerializer(doc, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_doc = serializer.save()

        CaseHistoryService.record_event(
            case=doc.case,
            event_type="DOCUMENT_UPDATED",
            description=f"Document metadata updated: {updated_doc.title}",
            changed_by=request.user,
            source="MANUAL",
        )

        return Response(CaseDocumentSerializer(updated_doc).data, status=status.HTTP_200_OK)

    def delete(self, request, case_id, pk):
        doc = self.get_document(case_id, pk, require_uploader=True)
        case = doc.case
        title = doc.title
        if doc.file:
            doc.file.delete(save=False)
        doc.delete()

        CaseHistoryService.record_event(
            case=case,
            event_type="DOCUMENT_UPDATED",
            description=f"Document deleted: {title}",
            changed_by=request.user,
            source="MANUAL",
        )

        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseDocumentDownloadView(APIView):
    """Authorized file download streaming endpoint with strict access control."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id, pk):
        doc = get_object_or_404(
            CaseDocument.objects.select_related("case"),
            id=pk,
            case_id=case_id,
            case__tracked_by=request.user,
        )

        if not doc.file:
            return Response(
                {"detail": "File not found on storage."}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            file_handle = doc.file.open("rb")
        except (FileNotFoundError, OSError):
            return Response(
                {"detail": "File missing on storage."}, status=status.HTTP_404_NOT_FOUND
            )

        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=doc.original_filename,
            content_type=doc.mime_type or "application/octet-stream",
        )
        response["Content-Length"] = doc.file_size
        return response


class CaseNoteListCreateView(APIView):
    """List advocate's private notes for a case or create a new private note."""

    permission_classes = [permissions.IsAuthenticated]

    def get_case(self, case_id):
        return get_object_or_404(Case, id=case_id, tracked_by=self.request.user)

    def get(self, request, case_id):
        case = self.get_case(case_id)
        notes = CaseNote.objects.filter(case=case, advocate=request.user)

        search = request.query_params.get("search", "").strip()
        if search:
            notes = notes.filter(Q(title__icontains=search) | Q(content__icontains=search))

        notes = notes.order_by("-is_pinned", "-updated_at")
        serializer = CaseNoteSerializer(notes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, case_id):
        case = self.get_case(case_id)
        serializer = CaseNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.save(case=case, advocate=request.user)
        return Response(CaseNoteSerializer(note).data, status=status.HTTP_201_CREATED)


class CaseNoteDetailView(APIView):
    """Retrieve, update, or delete a private case note. Strictly owner-isolated."""

    permission_classes = [permissions.IsAuthenticated]

    def get_note(self, case_id, pk):
        return get_object_or_404(
            CaseNote,
            id=pk,
            case_id=case_id,
            advocate=self.request.user,
            case__tracked_by=self.request.user,
        )

    def get(self, request, case_id, pk):
        note = self.get_note(case_id, pk)
        return Response(CaseNoteSerializer(note).data, status=status.HTTP_200_OK)

    def patch(self, request, case_id, pk):
        note = self.get_note(case_id, pk)
        serializer = CaseNoteSerializer(note, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_note = serializer.save()
        return Response(CaseNoteSerializer(updated_note).data, status=status.HTTP_200_OK)

    def put(self, request, case_id, pk):
        note = self.get_note(case_id, pk)
        serializer = CaseNoteSerializer(note, data=request.data)
        serializer.is_valid(raise_exception=True)
        updated_note = serializer.save()
        return Response(CaseNoteSerializer(updated_note).data, status=status.HTTP_200_OK)

    def delete(self, request, case_id, pk):
        note = self.get_note(case_id, pk)
        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseSummaryPdfExportView(APIView):
    """Export comprehensive legal case docket summary as PDF."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, case_id):
        case = get_object_or_404(
            Case.objects.prefetch_related("hearings", "judgments", "documents"),
            id=case_id,
            tracked_by=request.user,
        )
        pdf_bytes = CasePdfExportService.generate_case_summary_pdf(case, user=request.user)
        filename = f"{case.case_type}_{case.case_number}_{case.filing_year}_summary.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = len(pdf_bytes)
        return response


class CaseListCsvExportView(APIView):
    """Export filtered list of tracked cases as sanitized CSV with CWE-1236 mitigation and UTF-8 BOM."""

    permission_classes = []

    def get(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            # Fallback to token query param for browser-initiated downloads
            token = request.query_params.get("token")
            if token:
                try:
                    from rest_framework_simplejwt.authentication import JWTAuthentication

                    jwt_auth = JWTAuthentication()
                    validated_token = jwt_auth.get_validated_token(token)
                    user = jwt_auth.get_user(validated_token)
                except Exception:
                    user = None

        if not user or not user.is_authenticated:
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        list_view = CaseListCreateView()
        list_view.request = request
        list_view.format_kwarg = None
        queryset = Case.objects.filter(tracked_by=user).prefetch_related("hearings", "judgments")

        search = request.query_params.get("search", "").strip()
        if search:
            from .query_normalizer import normalize_voice_query_py

            norm_info = normalize_voice_query_py(search)
            search_filter = (
                Q(case_number__icontains=search)
                | Q(petitioner__icontains=search)
                | Q(respondent__icontains=search)
                | Q(petitioner_advocate__icontains=search)
                | Q(respondent_advocate__icontains=search)
            )
            if norm_info.get("normalized"):
                search_filter |= Q(case_number__icontains=norm_info["normalized"])
            if norm_info.get("case_type"):
                search_filter |= Q(case_type__iexact=norm_info["case_type"])
            if norm_info.get("case_number"):
                search_filter |= Q(case_number__icontains=norm_info["case_number"])
            if norm_info.get("filing_year"):
                search_filter |= Q(filing_year=norm_info["filing_year"])
            queryset = queryset.filter(search_filter)

        status_param = request.query_params.get("status", "").strip().upper()
        if status_param and status_param != "ALL":
            queryset = queryset.filter(
                Q(status__icontains=status_param) | Q(current_stage__icontains=status_param)
            )

        csv_content = CaseCsvExportService.generate_case_list_csv(queryset)
        csv_bytes = ("\ufeff" + csv_content).encode("utf-8")
        date_stamp = timezone.now().strftime("%Y-%m-%d")
        filename = f"APHC_My_Cases_{date_stamp}.csv"

        response = HttpResponse(csv_bytes, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class CaseDocumentExtractView(APIView):
    """Secure document parser for legal case filings and court records.

    Validates uploaded documents against size and content inspection rules,
    extracts legal fields, checks registry duplicates, and returns structured
    candidate records for advocate review before registration.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"error": "No file uploaded. Please select a valid legal document."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Content & format validation (MIME, magic bytes, size, anti-malware)
        try:
            detected_mime = validate_case_document_upload(uploaded_file)
            uploaded_file.detected_mime_type = detected_mime
        except DjangoValidationError as exc:
            msg = exc.message if hasattr(exc, "message") else str(exc)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Extract content, metadata, and case information
        extraction_result = DocumentExtractionService.extract_from_file(uploaded_file)

        # 3. Duplicate detection for each identified case
        for case_info in extraction_result.get("detected_cases", []):
            dup_result = DocumentExtractionService.detect_duplicate(request.user, case_info)
            case_info["duplicate_info"] = dup_result

        # 4. Stage file in private secure storage
        clean_name = os.path.basename(uploaded_file.name or "document")
        token_name = f"staging_{uuid.uuid4().hex}_{clean_name}"
        uploaded_file.seek(0)
        file_bytes = uploaded_file.read()
        uploaded_file.seek(0)

        storage_path = secure_document_storage.save(
            os.path.join("import_staging", token_name), ContentFile(file_bytes)
        )

        extraction_result["document_token"] = storage_path
        extraction_result["file_info"] = {
            "name": clean_name,
            "size": uploaded_file.size,
            "mime_type": detected_mime,
            "token": storage_path,
        }

        return Response(extraction_result, status=status.HTTP_200_OK)


class CaseImportConfirmView(APIView):
    """Confirm and save an advocate-reviewed legal case record into workspace.

    Supports:
    - Registering new case
    - Linking existing court registry case to advocate's workspace
    - Attaching uploaded source document to CaseDocument
    - Recording initial scheduled hearing and audit log
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data
        case_type = (data.get("case_type") or "WP").strip().upper()
        case_number = str(data.get("case_number") or "").strip()
        filing_year = data.get("filing_year")

        if not case_number:
            return Response(
                {"error": "Case number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not filing_year:
            return Response(
                {"error": "Filing year is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            filing_year = int(filing_year)
            if filing_year < 1950 or filing_year > timezone.now().year + 1:
                raise ValueError()
        except ValueError:
            return Response(
                {"error": f"Invalid filing year '{filing_year}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        petitioner = (data.get("petitioner") or "").strip() or "N/A"
        respondent = (data.get("respondent") or "").strip() or "N/A"
        court_hall_number = data.get("court_hall_number")
        if court_hall_number is not None and court_hall_number != "":
            try:
                court_hall_number = int(court_hall_number)
            except (ValueError, TypeError):
                court_hall_number = None
        else:
            court_hall_number = None

        bench = (data.get("bench") or "").strip()
        current_stage = (data.get("status") or "PENDING").strip().upper()
        if current_stage not in ("PENDING", "DISPOSED", "ADJOURNED"):
            current_stage = "PENDING"

        next_hearing_date = normalize_date_str(data.get("next_hearing_date"))
        document_token = data.get("document_token")

        # Check existing case
        existing_case = Case.objects.filter(
            case_type__iexact=case_type,
            case_number=case_number,
            filing_year=filing_year,
        ).first()

        created = False
        if existing_case:
            case = existing_case
            if request.user in case.tracked_by.all():
                # Already tracked - update stage / next hearing if provided
                if next_hearing_date and not case.next_hearing_date:
                    case.next_hearing_date = next_hearing_date
                    case.save(update_fields=["next_hearing_date", "updated_at"])
            else:
                case.tracked_by.add(request.user)
                CaseHistoryService.record_event(
                    case=case,
                    event_type="CASE_TRACKED",
                    description=f"Advocate {request.user.get_full_name() or request.user.username} imported case into workspace.",
                    changed_by=request.user,
                    source="IMPORT",
                )
        else:
            case = Case.objects.create(
                case_type=case_type,
                case_number=case_number,
                filing_year=filing_year,
                petitioner=petitioner,
                respondent=respondent,
                court_hall_number=court_hall_number,
                bench=bench,
                current_stage=current_stage,
                next_hearing_date=next_hearing_date,
            )
            case.tracked_by.add(request.user)
            CaseHistoryService.record_case_creation(case, changed_by=request.user)
            created = True

            # If hearing date provided, record initial hearing
            if next_hearing_date:
                Hearing.objects.create(
                    case=case,
                    hearing_date=next_hearing_date,
                    court_hall_number=court_hall_number,
                    status="SCHEDULED",
                    business_conducted="Initial hearing listing from document import.",
                )

            # If judgment date provided and disposed
            judgment_date = normalize_date_str(data.get("judgment_date"))
            if judgment_date and current_stage == "DISPOSED":
                Judgment.objects.create(
                    case=case,
                    judgment_date=judgment_date,
                    summary=data.get("judgment_summary") or "Disposed by court order.",
                )

        # Attach staged document if token exists
        if document_token and secure_document_storage.exists(document_token):
            try:
                clean_filename = os.path.basename(document_token)
                if "_" in clean_filename:
                    # remove random token prefix
                    clean_filename = clean_filename.split("_", 2)[-1]
                with secure_document_storage.open(document_token, "rb") as f:
                    file_content = f.read()

                doc_type = data.get("document_type") or "OTHER"
                if doc_type not in [c[0] for c in CaseDocument.CATEGORY_CHOICES]:
                    doc_type = "OTHER"

                mime_map = {
                    "pdf": "application/pdf",
                    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "doc": "application/msword",
                    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "xls": "application/vnd.ms-excel",
                    "csv": "text/csv",
                    "txt": "text/plain",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "png": "image/png",
                    "webp": "image/webp",
                }
                _, ext = os.path.splitext(clean_filename)
                ext_clean = ext.lower().lstrip(".")
                mime_type = mime_map.get(ext_clean, "application/octet-stream")

                c_doc = CaseDocument(
                    case=case,
                    uploaded_by=request.user,
                    title=data.get("document_title") or f"Imported: {clean_filename}",
                    document_type=doc_type,
                    description=f"Imported from {clean_filename} via file import workflow.",
                    original_filename=clean_filename,
                    file_size=len(file_content),
                    mime_type=mime_type,
                )
                c_doc.file.save(clean_filename, ContentFile(file_content), save=True)

                CaseHistoryService.record_event(
                    case=case,
                    event_type="DOCUMENT_UPDATED",
                    description=f"Attached source document: {clean_filename}",
                    changed_by=request.user,
                    source="IMPORT",
                )

                # Clean up staging file
                try:
                    secure_document_storage.delete(document_token)
                except Exception:
                    pass
            except Exception as exc:
                import logging

                logging.getLogger(__name__).warning(
                    "Could not attach staged document %s: %s", document_token, exc
                )

        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(CaseSerializer(case).data, status=response_status)
