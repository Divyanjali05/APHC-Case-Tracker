from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CourtHall, TokenAlertRule
from .serializers import CourtHallSerializer, TokenAlertRuleSerializer


class CourtHallListView(generics.ListAPIView):
    """List all court halls with their active token numbers."""

    queryset = CourtHall.objects.filter(is_active=True)
    serializer_class = CourtHallSerializer
    permission_classes = [permissions.AllowAny]


class TokenAlertRuleListCreateView(generics.ListCreateAPIView):
    """List or subscribe to token proximity alerts for upcoming matters."""

    serializer_class = TokenAlertRuleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return TokenAlertRule.objects.filter(advocate=self.request.user)

    def perform_create(self, serializer):
        serializer.save(advocate=self.request.user)


class TokensStatusView(APIView):
    """Health / readiness probe for tokens app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "app": "tokens",
                "status": "ready",
                "description": "Court Hall Display Board & Tokens",
            },
            status=status.HTTP_200_OK,
        )
