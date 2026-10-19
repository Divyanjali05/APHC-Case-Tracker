from rest_framework.response import Response
from rest_framework.views import APIView


class AccountsStatusView(APIView):
    """Phase 0 status check for accounts module."""

    def get(self, request):
        return Response({"module": "accounts", "status": "ready"})
