from __future__ import annotations

from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CourtHall, TokenAlertRule
from .providers import get_court_token_provider
from .serializers import (
    CourtHallSerializer,
    TokenAlertRuleCreateSerializer,
    TokenAlertRuleSerializer,
    TokenAlertRuleUpdateSerializer,
)
from .services import TokenAlertSyncService


class CourtHallListView(generics.ListAPIView):
    """List all court halls with their active token numbers."""

    queryset = CourtHall.objects.filter(is_active=True).select_related("token_status")
    serializer_class = CourtHallSerializer
    permission_classes = [permissions.AllowAny]


class TokenAlertRuleListCreateView(generics.ListCreateAPIView):
    """List or subscribe to token proximity alerts for upcoming matters."""

    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TokenAlertRuleCreateSerializer
        return TokenAlertRuleSerializer

    def get_queryset(self):
        qs = TokenAlertRule.objects.filter(
            advocate=self.request.user,
            case__tracked_by=self.request.user,
        ).select_related("court_hall", "case")
        # Optional filters
        case_id = self.request.query_params.get("case_id")
        if case_id:
            try:
                qs = qs.filter(case_id=int(case_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError({"case_id": "case_id must be a valid integer."}) from exc

        court_hall_id = self.request.query_params.get("court_hall_id")
        if court_hall_id:
            try:
                qs = qs.filter(court_hall_id=int(court_hall_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    {"court_hall_id": "court_hall_id must be a valid integer."}
                ) from exc

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            active_bool = is_active.lower() in ("true", "1")
            qs = qs.filter(is_active=active_bool)

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param.upper())

        return qs

    def perform_create(self, serializer):
        alert = serializer.save(advocate=self.request.user)
        # Run immediate sync against active provider so initial status and distance are populated
        try:
            sync_service = TokenAlertSyncService()
            sync_service.sync_alert_rule(alert)
        except Exception:
            pass

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return full representation
        response_serializer = TokenAlertRuleSerializer(serializer.instance)
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class TokenAlertRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or cancel a token alert rule."""

    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return TokenAlertRuleUpdateSerializer
        return TokenAlertRuleSerializer

    def get_queryset(self):
        return TokenAlertRule.objects.filter(
            advocate=self.request.user,
            case__tracked_by=self.request.user,
        ).select_related("court_hall", "case")

    def perform_destroy(self, instance):
        # Soft-cancel rather than hard delete to preserve history
        instance.mark_cancelled()


class TokenAlertRuleCancelView(APIView):
    """Explicitly cancel an active token alert rule."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        try:
            alert = TokenAlertRule.objects.get(
                pk=pk,
                advocate=request.user,
                case__tracked_by=request.user,
            )
        except TokenAlertRule.DoesNotExist:
            return Response({"detail": "Token alert not found."}, status=status.HTTP_404_NOT_FOUND)

        alert.mark_cancelled()
        return Response(TokenAlertRuleSerializer(alert).data, status=status.HTTP_200_OK)


class TokenAlertRuleSyncView(APIView):
    """Trigger manual on-demand synchronization for a specific token alert rule."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int):
        try:
            alert = TokenAlertRule.objects.get(
                pk=pk,
                advocate=request.user,
                case__tracked_by=request.user,
            )
        except TokenAlertRule.DoesNotExist:
            return Response({"detail": "Token alert not found."}, status=status.HTTP_404_NOT_FOUND)

        sync_service = TokenAlertSyncService()
        synced_alert = sync_service.sync_alert_rule(alert)
        return Response(TokenAlertRuleSerializer(synced_alert).data, status=status.HTTP_200_OK)


class TokensStatusView(APIView):
    """Health / readiness probe for tokens app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        provider = get_court_token_provider()
        provider_health = provider.check_health()

        return Response(
            {
                "app": "tokens",
                "status": "ready",
                "description": "Court Hall Display Board & Tokens",
                "provider": provider_health,
            },
            status=status.HTTP_200_OK,
        )
