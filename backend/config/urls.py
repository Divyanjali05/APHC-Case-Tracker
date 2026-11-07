import datetime

import redis
from django.conf import settings
from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def api_root(request):
    """API root endpoint providing service status and top-level endpoint directory."""
    return JsonResponse(
        {
            "service": "APHC Case Tracker API",
            "version": "0.1.0",
            "status": "online",
            "documentation": request.build_absolute_uri("/api/docs/"),
            "schema": request.build_absolute_uri("/api/schema/"),
            "endpoints": {
                "health": request.build_absolute_uri("/api/health/"),
                "auth": request.build_absolute_uri("/api/auth/"),
                "cases": request.build_absolute_uri("/api/cases/"),
                "reminders": request.build_absolute_uri("/api/reminders/"),
                "tokens": request.build_absolute_uri("/api/tokens/"),
                "notifications": request.build_absolute_uri("/api/notifications/"),
                "court_status": request.build_absolute_uri("/api/court-status/"),
                "voice": request.build_absolute_uri("/api/voice/"),
                "calendar": request.build_absolute_uri("/api/calendar/"),
            },
        }
    )


def health_check(request):
    """
    Health check endpoint reporting API, database, and Redis connectivity status.
    """
    # 1. Database Connectivity Check
    db_status = "healthy"
    try:
        connection.ensure_connection()
    except Exception as exc:
        db_status = f"unhealthy: {exc!s}"

    # 2. Redis Connectivity Check
    redis_status = "healthy"
    redis_url = getattr(settings, "REDIS_URL", None) or getattr(
        settings, "CELERY_BROKER_URL", "redis://localhost:6379/0"
    )
    try:
        r = redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        r.ping()
    except Exception as exc:
        redis_status = f"unavailable: {exc!s}"

    # Overall Status:
    # In production, Redis being down marks the service as 'degraded'.
    # In development/testing (CELERY_TASK_ALWAYS_EAGER or DEBUG), 'ok' is returned as long as DB is healthy.
    if db_status != "healthy":
        overall_status = "unhealthy"
        status_code = 503
    elif (
        redis_status != "healthy"
        and not getattr(settings, "DEBUG", False)
        and not getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False)
    ):
        overall_status = "degraded"
        status_code = 200
    else:
        overall_status = "ok"
        status_code = 200

    return JsonResponse(
        {
            "status": overall_status,
            "service": "aphc-case-tracker-api",
            "version": "0.1.0",
            "database": db_status,
            "redis": redis_status,
            "engine": connection.settings_dict.get("ENGINE", "").split(".")[-1],
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "checks": {
                "database": {
                    "status": db_status,
                    "engine": connection.settings_dict.get("ENGINE", "").split(".")[-1],
                    "name": str(connection.settings_dict.get("NAME", "")),
                },
                "redis": {
                    "status": redis_status,
                },
            },
        },
        status=status_code,
    )


urlpatterns = [
    path("", api_root, name="api-root"),
    path("api/", api_root, name="api-directory"),
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    # OpenAPI Schema & Interactive Documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # Core Application API Routers
    path("api/auth/", include("apps.accounts.urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/reminders/", include("apps.reminders.urls")),
    path("api/tokens/", include("apps.tokens.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/court-status/", include("apps.court_data.urls")),
    path("api/voice/", include("apps.voice.urls")),
    path("api/calendar/", include("apps.agenda.urls")),
]
