from rest_framework.response import Response
from rest_framework.views import APIView


class TokensStatusView(APIView):
    """Phase 0 status check for tokens module."""

    def get(self, request):
        return Response({"module": "tokens", "status": "ready"})
