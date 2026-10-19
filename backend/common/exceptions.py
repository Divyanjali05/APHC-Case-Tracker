from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler


class APHCBaseException(APIException):
    """Base exception class for APHC application errors."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "A case tracking exception occurred."
    default_code = "aphc_error"


class CourtDataUnavailableException(APHCBaseException):
    """Raised when external court records or display boards are temporarily unreachable."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "High Court data portal is currently unavailable. Please retry shortly."
    default_code = "court_data_unavailable"


class InvalidCaseNumberException(APHCBaseException):
    """Raised when case type, number, or year format fails court schema rules."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "Invalid High Court case number or filing format."
    default_code = "invalid_case_format"


def custom_exception_handler(exc, context):
    """Custom exception handler standardizing JSON error formats across DRF."""
    response = exception_handler(exc, context)

    if response is not None:
        custom_data = {
            "success": False,
            "error": {
                "code": getattr(exc, "default_code", "api_error"),
                "message": response.data,
                "status_code": response.status_code,
            },
        }
        response.data = custom_data
    elif isinstance(exc, APHCBaseException):
        response = Response(
            {
                "success": False,
                "error": {
                    "code": exc.default_code,
                    "message": str(exc.detail),
                    "status_code": exc.status_code,
                },
            },
            status=exc.status_code,
        )

    return response
