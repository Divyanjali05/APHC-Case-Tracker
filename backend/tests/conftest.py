import os

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")


def assert_isolated_test_database(settings) -> None:
    """Abort test execution immediately if configured DB points to production Neon."""
    default_db = settings.DATABASES.get("default", {})
    engine = str(default_db.get("ENGINE", "")).lower()
    host = str(default_db.get("HOST", "")).lower()
    name = str(default_db.get("NAME", "")).lower()

    if "neon" in host or "neon.tech" in host:
        raise RuntimeError(
            "ABORTED: Registration/integration tests must never run against Neon PostgreSQL."
        )

    is_sqlite = "sqlite3" in engine
    is_local_test_pg = (
        "postgresql" in engine
        and host in {"localhost", "127.0.0.1", ""}
        and name.startswith("test_")
    )
    if not (is_sqlite or is_local_test_pg):
        raise RuntimeError(
            f"ABORTED: Database engine '{engine}' host '{host}' is not an isolated test database."
        )


@pytest.fixture(autouse=True)
def guard_against_production_db(settings):
    """Ensure every test runs strictly against an isolated test database and clean throttle cache."""
    assert_isolated_test_database(settings)
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    """Provides a DRF APIClient fixture."""
    return APIClient()
