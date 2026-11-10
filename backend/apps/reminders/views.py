from django.core.cache import cache
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Case, Hearing

from .models import Reminder
from .serializers import ReminderPreferenceSerializer, ReminderSerializer
from .services import ReminderService


class ReminderListCreateView(generics.ListCreateAPIView):
    """List reminders or schedule a new reminder for authenticated advocate."""

    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = Reminder.objects.filter(advocate=user).select_related("case", "hearing")

        reminder_type = self.request.query_params.get("reminder_type")
        if reminder_type:
            queryset = queryset.filter(reminder_type=reminder_type.upper())

        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param.upper())

        case_id = self.request.query_params.get("case_id")
        if case_id:
            try:
                queryset = queryset.filter(case_id=int(case_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"case_id": "case_id must be a valid integer."}) from exc

        is_completed = self.request.query_params.get("is_completed")
        if is_completed is not None:
            if is_completed.lower() in ("true", "1"):
                queryset = queryset.filter(is_completed=True)
            elif is_completed.lower() in ("false", "0"):
                queryset = queryset.filter(is_completed=False)

        return queryset

    def create(self, request, *args, **kwargs):
        idempotency_key = (
            request.headers.get("X-Idempotency-Key")
            or request.headers.get("HTTP_X_IDEMPOTENCY_KEY")
            or request.data.get("idempotency_key")
        )
        if idempotency_key:
            cache_key = f"idem_rem_{request.user.id}_{idempotency_key}"
            cached_data = cache.get(cache_key)
            if cached_data:
                return Response(cached_data, status=status.HTTP_200_OK)

        case_raw = request.data.get("case")
        hearing_raw = request.data.get("hearing")
        parsed_case_id = None
        parsed_hearing_id = None

        if case_raw not in (None, ""):
            try:
                parsed_case_id = int(case_raw)
            except (TypeError, ValueError) as exc:
                raise ValidationError({"case": "Invalid case identifier."}) from exc
            if not Case.objects.filter(id=parsed_case_id, tracked_by=request.user).exists():
                raise ValidationError(
                    {"case": "You can only attach reminders to cases you are tracking."}
                )

        if hearing_raw not in (None, ""):
            try:
                parsed_hearing_id = int(hearing_raw)
            except (TypeError, ValueError) as exc:
                raise ValidationError({"hearing": "Invalid hearing identifier."}) from exc

            hearing_obj = (
                Hearing.objects.filter(id=parsed_hearing_id, case__tracked_by=request.user)
                .select_related("case")
                .first()
            )
            if not hearing_obj:
                raise ValidationError(
                    {
                        "hearing": (
                            "You can only attach reminders to hearings for cases you are tracking."
                        )
                    }
                )
            if parsed_case_id is not None and hearing_obj.case_id != parsed_case_id:
                raise ValidationError(
                    {"hearing": "Selected hearing does not belong to the specified case."}
                )

            # Conflict check: ONLY after ownership is verified, check CANCELLED status
            if hearing_obj.status == "CANCELLED":
                return Response(
                    {
                        "detail": "Conflict: Linked hearing has been cancelled on court server.",
                        "status": "CONFLICT",
                        "hearing_id": parsed_hearing_id,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        # Duplicate check: prevent duplicate manual reminders for same advocate, title & target
        title = str(request.data.get("title", "") or "").strip()
        due_date = request.data.get("due_date")
        reminder_type = request.data.get("reminder_type", "GENERAL")

        if title and due_date:
            existing = Reminder.objects.filter(
                advocate=request.user,
                title=title,
                reminder_type=reminder_type,
                case_id=parsed_case_id,
                hearing_id=parsed_hearing_id,
            ).first()
            if existing:
                serializer = self.get_serializer(existing)
                data = serializer.data
                if idempotency_key:
                    cache.set(f"idem_rem_{request.user.id}_{idempotency_key}", data, timeout=86400)
                return Response(data, status=status.HTTP_200_OK)

        response = super().create(request, *args, **kwargs)
        if idempotency_key and response.status_code == status.HTTP_201_CREATED:
            cache.set(f"idem_rem_{request.user.id}_{idempotency_key}", response.data, timeout=86400)
        return response

    def perform_create(self, serializer):
        serializer.save(advocate=self.request.user, status="PENDING", is_completed=False)


class ReminderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or remove a reminder."""

    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Reminder.objects.filter(advocate=self.request.user).select_related("case", "hearing")


class ReminderDismissView(APIView):
    """Mark a reminder as completed / dismissed."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        reminder = get_object_or_404(Reminder.objects.filter(advocate=request.user), pk=pk)
        reminder.status = "DISMISSED"
        reminder.is_completed = True
        reminder.save(update_fields=["status", "is_completed", "updated_at"])
        return Response(
            {
                "detail": "Reminder marked as completed.",
                "reminder": ReminderSerializer(reminder).data,
            },
            status=status.HTTP_200_OK,
        )


class ReminderPreferenceView(generics.RetrieveUpdateAPIView):
    """Retrieve or update advocate hearing reminder preferences."""

    serializer_class = ReminderPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return ReminderService.get_or_create_preferences(self.request.user)


class RemindersStatusView(APIView):
    """Health / readiness probe for reminders app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "app": "reminders",
                "status": "ready",
                "description": "Compliance & Diary Reminders",
            },
            status=status.HTTP_200_OK,
        )
