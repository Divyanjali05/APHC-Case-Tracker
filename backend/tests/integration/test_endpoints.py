import pytest
from django.urls import reverse


@pytest.mark.parametrize(
    "url_name,expected_app",
    [
        ("accounts:status", "accounts"),
        ("cases:status", "cases"),
        ("reminders:status", "reminders"),
        ("tokens:status", "tokens"),
        ("notifications:status", "notifications"),
    ],
)
def test_app_status_probes(client, url_name, expected_app):
    """Verify that all core apps are routed and return 200 OK."""
    url = reverse(url_name)
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == expected_app
    assert data["status"] == "ready"


def test_swagger_schema_endpoint(client):
    """Verify that the OpenAPI schema endpoint responds successfully."""
    url = reverse("schema")
    response = client.get(url)
    assert response.status_code == 200
