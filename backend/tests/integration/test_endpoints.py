import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

User = get_user_model()


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


@pytest.mark.django_db
def test_swagger_schema_endpoint_restricted_to_staff_admin(api_client):
    """Schema and docs must reject anonymous/non-staff users and allow admin users."""
    schema_url = reverse("schema")
    docs_url = reverse("swagger-ui")

    # Anonymous rejected
    assert api_client.get(schema_url).status_code == status.HTTP_401_UNAUTHORIZED
    assert api_client.get(docs_url).status_code == status.HTTP_401_UNAUTHORIZED

    # Non-staff advocate rejected
    advocate = User.objects.create_user(username="AP/3001/2024", password="Strong#Password1")
    api_client.force_authenticate(user=advocate)
    assert api_client.get(schema_url).status_code == status.HTTP_403_FORBIDDEN
    assert api_client.get(docs_url).status_code == status.HTTP_403_FORBIDDEN

    # Staff admin permitted in non-production docs-enabled env
    admin = User.objects.create_user(
        username="staffadmin", password="Strong#Password1", is_staff=True
    )
    api_client.force_authenticate(user=admin)
    assert api_client.get(schema_url).status_code == status.HTTP_200_OK
    assert api_client.get(docs_url).status_code == status.HTTP_200_OK
