import datetime
from urllib.parse import urlparse

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
                "admin_portal": request.build_absolute_uri("/api/admin/"),
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
    caches = getattr(settings, "CACHES", {}) or {}
    cache_backend = caches.get("default", {}).get("BACKEND", "")
    uses_redis_cache = "redis" in cache_backend.lower()
    is_eager_celery = bool(getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False))
    redis_required = uses_redis_cache or not is_eager_celery

    redis_url = (
        getattr(settings, "REDIS_URL", None)
        or getattr(settings, "REDIS_CACHE_URL", None)
        or getattr(settings, "CELERY_BROKER_URL", None)
    )

    fallback_parts = ["RedisCache" if uses_redis_cache else "LocMemCache"]
    if is_eager_celery:
        fallback_parts.append("eager Celery")
    fallback_summary = ", ".join(fallback_parts)

    if not redis_url:
        redis_status = (
            f"disabled (fallback: {fallback_summary})"
            if not redis_required
            else "unavailable: Redis URL is not configured"
        )
    else:
        parsed_host = (urlparse(redis_url).hostname or "").strip("[]").lower()
        is_local_redis = parsed_host in {"localhost", "127.0.0.1", "::1"}
        connect_timeout = 0.1 if (is_local_redis and not redis_required) else 1
        read_timeout = 0.2 if (is_local_redis and not redis_required) else 1
        try:
            r = redis.from_url(
                redis_url,
                socket_connect_timeout=connect_timeout,
                socket_timeout=read_timeout,
            )
            r.ping()
            redis_status = "healthy"
        except Exception as exc:
            if not redis_required:
                reason = "not running locally" if is_local_redis else f"unreachable: {exc!s}"
                redis_status = f"optional ({reason}; fallback: {fallback_summary})"
            else:
                redis_status = f"unavailable: {exc!s}"

    # Overall Status:
    # In production, Redis being down marks the service as 'degraded'.
    # In development/testing (DEBUG or non-required eager/LocMem fallback), 'ok' is returned as long as DB is healthy.
    if db_status != "healthy":
        overall_status = "unhealthy"
        status_code = 503
    elif redis_status != "healthy" and redis_required and not getattr(settings, "DEBUG", False):
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
    path("api/admin/", include("apps.accounts.admin_urls")),
    path("api/cases/", include("apps.cases.urls")),
    path("api/reminders/", include("apps.reminders.urls")),
    path("api/tokens/", include("apps.tokens.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/court-status/", include("apps.court_data.urls")),
    path("api/voice/", include("apps.voice.urls")),
    path("api/calendar/", include("apps.agenda.urls")),
]
