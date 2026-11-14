import os

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


class CaseListCreateView(generics.ListCreateAPIView):
    """List tracked cases with filtering/search, or register a new case for tracking."""

    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base_qs = (
            Case.objects.all()
            if (user.is_staff or user.is_superuser)
            else Case.objects.filter(tracked_by=user)
        )
        queryset = base_qs.prefetch_related("hearings", "judgments")

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


class CaseDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or update case details, hearing history, and judgments."""

    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base_qs = (
            Case.objects.all()
            if (user.is_staff or user.is_superuser)
            else Case.objects.filter(tracked_by=user)
        )
        return base_qs.prefetch_related("hearings", "judgments")

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
        queryset = CaseHistory.objects.filter(case=case).select_related("changed_by")
        event_type = self.request.query_params.get("event_type", "").strip()
        if event_type:
            queryset = queryset.filter(event_type__iexact=event_type)
        return queryset.order_by("-created_at", "-id")


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

    def get_document(self, case_id, pk):
        return get_object_or_404(
            CaseDocument.objects.select_related("case", "uploaded_by"),
            id=pk,
            case_id=case_id,
            case__tracked_by=self.request.user,
        )

    def get(self, request, case_id, pk):
        doc = self.get_document(case_id, pk)
        return Response(CaseDocumentSerializer(doc).data, status=status.HTTP_200_OK)

    def patch(self, request, case_id, pk):
        doc = self.get_document(case_id, pk)
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
        doc = self.get_document(case_id, pk)
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
        return get_object_or_404(CaseNote, id=pk, case_id=case_id, advocate=self.request.user)

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
            Case.objects.prefetch_related("hearings", "judgments", "documents", "notes"),
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
    """Export filtered list of tracked cases as sanitized CSV with CWE-1236 mitigation."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        list_view = CaseListCreateView()
        list_view.request = request
        list_view.format_kwarg = None
        queryset = list_view.get_queryset()

        csv_content = CaseCsvExportService.generate_case_list_csv(queryset)
        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        filename = f"aphc_cases_export_{timestamp}.csv"

        response = HttpResponse(csv_content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
