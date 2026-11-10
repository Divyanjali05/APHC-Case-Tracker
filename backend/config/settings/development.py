from decouple import config

from .base import *  # noqa: F403
from .base import BASE_DIR, build_postgresql_params_config, parse_postgresql_url

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Database Configuration:
# Connects to PostgreSQL if DATABASE_URL or DB_NAME is provided;
# otherwise falls back to SQLite for local development and rapid testing.
DATABASE_URL = (config("DATABASE_URL", default="") or "").strip() or None
DB_NAME = (config("DB_NAME", default="") or "").strip() or None
DB_USER = config("DB_USER", default="postgres")
DB_PASSWORD = config("DB_PASSWORD", default="")
DB_HOST = config("DB_HOST", default="localhost")
DB_PORT = config("DB_PORT", default=5432, cast=int)
DB_SSLMODE = (config("DB_SSLMODE", default="") or "").strip() or None

if DATABASE_URL:
    DATABASES = {
        "default": parse_postgresql_url(DATABASE_URL),
    }
elif DB_NAME and DB_NAME.lower() not in ("sqlite", "sqlite3"):
    DATABASES = {
        "default": build_postgresql_params_config(
            name=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            sslmode=DB_SSLMODE,
        ),
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# Development CORS configuration
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Console email backend for development
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Execute Celery tasks synchronously in development and automated testing
CELERY_TASK_ALWAYS_EAGER = True

# Development cache: local in-memory cache for single-process development and automated testing
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "aphc-development-cache",
    }
}
