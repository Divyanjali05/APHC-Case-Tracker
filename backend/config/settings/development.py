import os
from urllib.parse import urlparse

from .base import *  # noqa: F403
from .base import BASE_DIR

DEBUG = True

# Database: PostgreSQL if DATABASE_URL provided, else local SQLite
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    parsed_db = urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed_db.path.lstrip("/"),
            "USER": parsed_db.username or "postgres",
            "PASSWORD": parsed_db.password or "",
            "HOST": parsed_db.hostname or "localhost",
            "PORT": parsed_db.port or 5432,
        }
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
