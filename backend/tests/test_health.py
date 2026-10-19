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
    assert "timestamp" in data
