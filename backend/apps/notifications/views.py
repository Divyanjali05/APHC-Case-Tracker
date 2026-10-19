from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeviceRegistration, NotificationHistory
from .serializers import DeviceRegistrationSerializer, NotificationHistorySerializer


class DeviceRegistrationView(generics.CreateAPIView):
    """Register or refresh mobile Expo push notification token."""

    serializer_class = DeviceRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        token = serializer.validated_data.get("expo_push_token")
        DeviceRegistration.objects.update_or_create(
            expo_push_token=token,
            defaults={
                "user": self.request.user,
                "device_name": serializer.validated_data.get("device_name", ""),
                "platform": serializer.validated_data.get("platform", "android"),
                "is_active": True,
            },
        )


class NotificationHistoryListView(generics.ListAPIView):
    """List notification history for the authenticated advocate."""

    serializer_class = NotificationHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return NotificationHistory.objects.filter(user=self.request.user)


class NotificationsStatusView(APIView):
    """Health / readiness probe for notifications app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "app": "notifications",
                "status": "ready",
                "description": "Push Notifications & Devices",
            },
            status=status.HTTP_200_OK,
        )
