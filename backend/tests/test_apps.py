import pytest
from django.urls import reverse


@pytest.mark.parametrize(
    "url_name,expected_module",
    [
        ("accounts:status", "accounts"),
        ("cases:status", "cases"),
        ("reminders:status", "reminders"),
        ("tokens:status", "tokens"),
        ("notifications:status", "notifications"),
    ],
)
def test_app_status_endpoints(client, url_name, expected_module):
    """Verify that all core apps are wired and respond properly."""
    url = reverse(url_name)
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()
    assert data["module"] == expected_module
    assert data["status"] == "ready"
