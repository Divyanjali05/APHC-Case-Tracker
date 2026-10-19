from rest_framework.response import Response
from rest_framework.views import APIView


class RemindersStatusView(APIView):
    """Phase 0 status check for reminders module."""

    def get(self, request):
        return Response({"module": "reminders", "status": "ready"})
