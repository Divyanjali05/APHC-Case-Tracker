import datetime

from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health_check(request):
    """Health check endpoint reporting API and database status."""
    db_status = "healthy"
    try:
        connection.ensure_connection()
    except Exception as exc:
        db_status = f"unhealthy: {exc!s}"

    return JsonResponse(
        {
            "status": "ok",
            "service": "aphc-case-tracker-api",
            "version": "0.1.0",
            "database": db_status,
            "engine": connection.settings_dict.get("ENGINE", "").split(".")[-1],
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        }
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    # OpenAPI Schema & Documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # Core API Routers
    path("api/auth/", include("apps.accounts.urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/reminders/", include("apps.reminders.urls")),
    path("api/tokens/", include("apps.tokens.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
]
