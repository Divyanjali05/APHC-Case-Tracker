from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Case
from .serializers import CaseSerializer


class CaseListCreateView(generics.ListCreateAPIView):
    """List tracked cases or register a new case for tracking."""

    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return Case.objects.filter(tracked_by=self.request.user)
        return Case.objects.all()

    def perform_create(self, serializer):
        case = serializer.save()
        if self.request.user.is_authenticated:
            case.tracked_by.add(self.request.user)


class CaseDetailView(generics.RetrieveUpdateAPIView):
    """Retrieve or update case details and hearing history."""

    queryset = Case.objects.all()
    serializer_class = CaseSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]


class CasesStatusView(APIView):
    """Health / readiness probe for cases app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {"app": "cases", "status": "ready", "description": "Case Dockets & Hearings"},
            status=status.HTTP_200_OK,
        )
