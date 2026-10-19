from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import UserSerializer


class ProfileView(APIView):
    """Retrieve or update the authenticated advocate's profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class AccountsStatusView(APIView):
    """Health / readiness probe for accounts app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {"app": "accounts", "status": "ready", "description": "Advocate Identity & Profiles"},
            status=status.HTTP_200_OK,
        )
