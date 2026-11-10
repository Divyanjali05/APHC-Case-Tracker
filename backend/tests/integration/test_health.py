from unittest.mock import MagicMock, patch

import pytest
from django.urls import reverse

from apps.notifications.realtime import RealtimeService


@pytest.mark.django_db
def test_health_check_endpoint(client):
    """Verify that the health check endpoint returns 200 OK with valid schema."""
    url = reverse("health-check")
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "aphc-case-tracker-api"
    assert data["version"] == "0.1.0"
    assert "database" in data
    assert "redis" in data
    assert "checks" in data
    assert "database" in data["checks"]
    assert "redis" in data["checks"]
    assert "timestamp" in data


@pytest.mark.django_db
def test_health_check_dev_fallback_when_local_redis_unavailable(client):
    """Verify dev/eager mode reports optional fallback cleanly when local Redis is not running."""
    with patch(
        "config.urls.redis.from_url", side_effect=TimeoutError("Timeout connecting to server")
    ) as mock_from_url:
        response = client.get(reverse("health-check"))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["redis"] == "optional (not running locally; fallback: LocMemCache, eager Celery)"
    assert data["checks"]["redis"]["status"] == data["redis"]
    mock_from_url.assert_called_once()
    assert mock_from_url.call_args.kwargs["socket_connect_timeout"] == 0.1


@pytest.mark.django_db
def test_health_check_healthy_when_redis_responds(client):
    """Verify health check reports Redis as healthy when ping succeeds."""
    mock_client = MagicMock()
    mock_client.ping.return_value = True
    with patch("config.urls.redis.from_url", return_value=mock_client):
        response = client.get(reverse("health-check"))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["redis"] == "healthy"
    assert data["checks"]["redis"]["status"] == "healthy"


@pytest.mark.django_db
def test_health_check_production_degraded_when_redis_unavailable(client, settings):
    """Verify production mode still flags unavailable Redis as degraded."""
    settings.DEBUG = False
    settings.CELERY_TASK_ALWAYS_EAGER = False
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": "redis://redis.internal:6379/0",
        }
    }
    settings.REDIS_URL = "redis://redis.internal:6379/0"

    with patch(
        "config.urls.redis.from_url", side_effect=ConnectionError("Connection refused")
    ) as mock_from_url:
        response = client.get(reverse("health-check"))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "degraded"
    assert data["redis"] == "unavailable: Connection refused"
    assert mock_from_url.call_args.kwargs["socket_connect_timeout"] == 1


@pytest.mark.django_db
def test_health_check_disabled_when_redis_url_unset_in_dev(client, settings):
    """Verify dev mode skips network connect when Redis URL is explicitly empty."""
    settings.REDIS_URL = ""
    settings.REDIS_CACHE_URL = ""
    settings.CELERY_BROKER_URL = ""

    with patch("config.urls.redis.from_url") as mock_from_url:
        response = client.get(reverse("health-check"))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["redis"] == "disabled (fallback: LocMemCache, eager Celery)"
    mock_from_url.assert_not_called()


@pytest.mark.django_db
def test_health_check_falls_back_to_celery_broker_url(client, settings):
    """Verify health check falls back to CELERY_BROKER_URL when REDIS_URL is empty."""
    settings.REDIS_URL = ""
    settings.REDIS_CACHE_URL = ""
    settings.CELERY_BROKER_URL = "redis://127.0.0.1:6390/0"

    mock_client = MagicMock()
    mock_client.ping.return_value = True
    with patch("config.urls.redis.from_url", return_value=mock_client) as mock_from_url:
        response = client.get(reverse("health-check"))

    assert response.status_code == 200
    data = response.json()
    assert data["redis"] == "healthy"
    assert mock_from_url.call_args.args[0] == "redis://127.0.0.1:6390/0"


def test_realtime_service_accepts_redis_url_and_rediss_scheme(settings):
    """Verify RealtimeService uses REDIS_URL fallback and supports rediss:// TLS URLs."""
    settings.REDIS_CACHE_URL = ""
    settings.REDIS_URL = "rediss://tls-redis.example.com:6380/0"
    settings.CELERY_BROKER_URL = ""

    RealtimeService._redis_last_check = 0.0
    RealtimeService._redis_is_available = False
    RealtimeService._redis_client = None

    mock_client = MagicMock()
    mock_client.ping.return_value = True
    try:
        with patch("redis.from_url", return_value=mock_client) as mock_from_url:
            client = RealtimeService.get_redis_client()
        assert client is mock_client
        mock_from_url.assert_called_once_with(
            "rediss://tls-redis.example.com:6380/0",
            socket_connect_timeout=0.1,
            socket_timeout=0.1,
        )
    finally:
        RealtimeService._redis_last_check = 0.0
        RealtimeService._redis_is_available = False
        RealtimeService._redis_client = None


def test_api_root_endpoint(client):
    """Verify that the API root endpoint returns top-level routing catalog."""
    url = reverse("api-root")
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "APHC Case Tracker API"
    assert data["version"] == "0.1.0"
    assert data["status"] == "online"
    assert "endpoints" in data
    assert "health" in data["endpoints"]
    assert "cases" in data["endpoints"]
    assert "voice" in data["endpoints"]


def test_api_directory_endpoint(client):
    """Verify that /api/ returns the top-level routing catalog."""
    url = reverse("api-directory")
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "APHC Case Tracker API"
    assert "documentation" in data
