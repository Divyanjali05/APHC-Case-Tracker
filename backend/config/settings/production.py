from urllib.parse import urlparse

from decouple import Csv, config

from .base import *  # noqa: F403

DEBUG = False

# Strict production secret key enforcement
PROD_SECRET_KEY = config("DJANGO_SECRET_KEY", default="")
INSECURE_DEV_KEY = "django-insecure-aphc-dev-key-change-in-production"

if (
    not PROD_SECRET_KEY
    or PROD_SECRET_KEY == INSECURE_DEV_KEY
    or "insecure" in PROD_SECRET_KEY.lower()
):
    raise ValueError("A secure DJANGO_SECRET_KEY environment variable must be set in production.")

SECRET_KEY = PROD_SECRET_KEY

# Strict production ALLOWED_HOSTS enforcement
PROD_ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="", cast=Csv())
if not PROD_ALLOWED_HOSTS or PROD_ALLOWED_HOSTS == [""]:
    raise ValueError("DJANGO_ALLOWED_HOSTS environment variable must be set in production.")

ALLOWED_HOSTS = [host.strip() for host in PROD_ALLOWED_HOSTS if host.strip()]
if "*" in ALLOWED_HOSTS or any("*" in host for host in ALLOWED_HOSTS):
    raise ValueError("Wildcard ALLOWED_HOSTS is not permitted in production.")

# Production PostgreSQL Database Configuration
DATABASE_URL = config("DATABASE_URL", default=None)
DB_NAME = config("DB_NAME", default=None)
DB_USER = config("DB_USER", default="postgres")
DB_PASSWORD = config("DB_PASSWORD", default="")
DB_HOST = config("DB_HOST", default="localhost")
DB_PORT = config("DB_PORT", default=5432, cast=int)

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
            "CONN_MAX_AGE": 600,
        }
    }
elif DB_NAME:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": DB_NAME,
            "USER": DB_USER,
            "PASSWORD": DB_PASSWORD,
            "HOST": DB_HOST,
            "PORT": DB_PORT,
            "CONN_MAX_AGE": 600,
        }
    }
else:
    raise ValueError(
        "PostgreSQL configuration (DATABASE_URL or DB_NAME/DB_USER/DB_PASSWORD) must be set in production."
    )

# Production distributed cache configuration for Celery worker locking & rate limits
REDIS_CACHE_URL = config(
    "REDIS_CACHE_URL",
    default=config(
        "REDIS_URL",
        default=config("CELERY_BROKER_URL", default=""),
    ),
)
if not REDIS_CACHE_URL:
    raise ValueError(
        "REDIS_URL, REDIS_CACHE_URL, or CELERY_BROKER_URL must be configured in production for distributed locking."
    )

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_CACHE_URL,
    }
}

# Production CORS
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())

# Security hardening
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
