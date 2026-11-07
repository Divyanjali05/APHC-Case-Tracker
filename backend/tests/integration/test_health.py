import pytest
from django.urls import reverse


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
