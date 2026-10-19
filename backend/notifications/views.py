from rest_framework.response import Response
from rest_framework.views import APIView


class NotificationsStatusView(APIView):
    """Phase 0 status check for notifications module."""

    def get(self, request):
        return Response({"module": "notifications", "status": "ready"})
