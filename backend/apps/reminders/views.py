from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Reminder
from .serializers import ReminderSerializer


class ReminderListCreateView(generics.ListCreateAPIView):
    """List reminders or schedule a new reminder for authenticated advocate."""

    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Reminder.objects.filter(advocate=self.request.user)

    def perform_create(self, serializer):
        serializer.save(advocate=self.request.user)


class ReminderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or remove a reminder."""

    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Reminder.objects.filter(advocate=self.request.user)


class RemindersStatusView(APIView):
    """Health / readiness probe for reminders app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {"app": "reminders", "status": "ready", "description": "Compliance & Diary Reminders"},
            status=status.HTTP_200_OK,
        )
