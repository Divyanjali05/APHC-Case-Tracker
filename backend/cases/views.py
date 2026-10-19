from rest_framework.response import Response
from rest_framework.views import APIView


class CasesStatusView(APIView):
    """Phase 0 status check for cases module."""

    def get(self, request):
        return Response({"module": "cases", "status": "ready"})
