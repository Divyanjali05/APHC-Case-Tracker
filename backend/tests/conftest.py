import os

import pytest
from rest_framework.test import APIClient

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


@pytest.fixture
def api_client():
    """Provides a DRF APIClient fixture."""
    return APIClient()
