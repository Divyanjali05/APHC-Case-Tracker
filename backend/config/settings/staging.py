"""Staging settings for APHC Case Tracker.

Enforces strict local isolation against any remote database or unexpected database target.
"""

from __future__ import annotations

import os
import socket
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

from .base import *  # noqa: F403
from .base import BASE_DIR, parse_database_url
from .base import REST_FRAMEWORK as BASE_REST_FRAMEWORK

# Override settings from local staging environment file (.env.staging.local)
STAGING_ENV_FILE = BASE_DIR / ".env.staging.local"
if STAGING_ENV_FILE.exists():
    load_dotenv(STAGING_ENV_FILE, override=True)

DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

# ---------------------------------------------------------------------------
# Strict Database Safety Guard
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise ValueError("DATABASE_URL must be explicitly configured for staging in .env.staging.local")

parsed_db = urlparse(DATABASE_URL)
db_host = (parsed_db.hostname or "").lower()
db_name = parsed_db.path.lstrip("/")

# Prohibit any remote database, specifically Neon or non-local hosts
if db_host not in {"127.0.0.1", "localhost"}:
    raise ValueError(
        f"STAGING SAFETY VIOLATION: Database host '{db_host}' is prohibited. "
        "Staging must strictly target local 127.0.0.1 or localhost."
    )

if "neon" in DATABASE_URL.lower():
    raise ValueError("STAGING SAFETY VIOLATION: Neon database target detected and strictly rejected.")

if db_name != "aphc_case_tracker_staging":
    raise ValueError(
        f"STAGING SAFETY VIOLATION: Database name '{db_name}' is not permitted. "
        "Staging must strictly target 'aphc_case_tracker_staging'."
    )

DATABASES = {
    "default": parse_database_url(DATABASE_URL),
}

# ---------------------------------------------------------------------------
# Redis & Cache Configuration (Mandatory for Staging)
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/2")
REDIS_CACHE_URL = os.getenv("REDIS_CACHE_URL", REDIS_URL)
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/3")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/4")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_CACHE_URL,
    }
}

# Strictly verify Redis/Memurai connectivity for staging environment.
# Silently falling back to LocMemCache is strictly prohibited in staging.
_parsed_redis = urlparse(REDIS_CACHE_URL)
_redis_host = _parsed_redis.hostname or "127.0.0.1"
_redis_port = _parsed_redis.port or 6379

try:
    with socket.create_connection((_redis_host, _redis_port), timeout=1.0):
        pass
except (TimeoutError, OSError) as exc:
    raise RuntimeError(
        f"STAGING INFRASTRUCTURE FAILURE: Redis/Memurai is mandatory for staging but unreachable at {_redis_host}:{_redis_port}. "
        "LocMemCache fallback is disabled for staging. Ensure the Memurai service is running before starting the staging environment."
    ) from exc

# ---------------------------------------------------------------------------
# File Upload & Media Storage
# ---------------------------------------------------------------------------
STAGING_DATA_DIR = BASE_DIR / "var" / "staging"
STAGING_DATA_DIR.mkdir(parents=True, exist_ok=True)
SECURE_DOCUMENT_ROOT = str(STAGING_DATA_DIR / "documents")
SECURE_VOICE_ROOT = str(STAGING_DATA_DIR / "voice")
Path(SECURE_DOCUMENT_ROOT).mkdir(parents=True, exist_ok=True)
Path(SECURE_VOICE_ROOT).mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Auth & Security
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
ENABLE_API_DOCS = True
CELERY_TASK_ALWAYS_EAGER = False

REST_FRAMEWORK = {
    **BASE_REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **BASE_REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}),
        "anon": "1000/hour",
        "user": "5000/hour",
        "auth": "100/minute",
        "refresh": "100/minute",
        "register": "100/minute",
        "otp_request": "100/minute",
        "otp_verify": "100/minute",
        "change_password": "100/minute",
        "password_reset_request": "100/minute",
        "password_reset_confirm": "100/minute",
    },
}
