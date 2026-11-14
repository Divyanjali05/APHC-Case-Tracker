import datetime

from django.conf import settings
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import permissions


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
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),  # noqa: UP017
        }
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    # Core API Routers
    path("api/auth/", include("apps.accounts.urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/reminders/", include("apps.reminders.urls")),
    path("api/tokens/", include("apps.tokens.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/court-status/", include("apps.court_data.urls")),
    path("api/voice/", include("apps.voice.urls")),
    path("api/calendar/", include("apps.agenda.urls")),
]

if getattr(settings, "DEBUG", False) or getattr(settings, "ENABLE_API_DOCS", False):
    urlpatterns += [
        path(
            "api/schema/",
            SpectacularAPIView.as_view(permission_classes=[permissions.IsAdminUser]),
            name="schema",
        ),
        path(
            "api/docs/",
            SpectacularSwaggerView.as_view(
                url_name="schema", permission_classes=[permissions.IsAdminUser]
            ),
            name="swagger-ui",
        ),
    ]
