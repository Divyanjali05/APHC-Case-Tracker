import os
from urllib.parse import urlparse

from .base import *  # noqa: F403

DEBUG = False

# Strict production database configuration via DATABASE_URL
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable must be set in production.")

# Strict production secret key enforcement
PROD_SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
INSECURE_DEV_KEY = "django-insecure-aphc-dev-key-change-in-production"

if (
    not PROD_SECRET_KEY
    or PROD_SECRET_KEY == INSECURE_DEV_KEY
    or "insecure" in PROD_SECRET_KEY.lower()
):
    raise ValueError("A secure DJANGO_SECRET_KEY environment variable must be set in production.")

SECRET_KEY = PROD_SECRET_KEY

# Strict production ALLOWED_HOSTS enforcement
PROD_ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS")
if not PROD_ALLOWED_HOSTS:
    raise ValueError("DJANGO_ALLOWED_HOSTS environment variable must be set in production.")

ALLOWED_HOSTS = [host.strip() for host in PROD_ALLOWED_HOSTS.split(",") if host.strip()]
if "*" in ALLOWED_HOSTS or any("*" in host for host in ALLOWED_HOSTS):
    raise ValueError("Wildcard ALLOWED_HOSTS is not permitted in production.")

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

# Production distributed cache configuration for shared Celery worker locking
REDIS_CACHE_URL = os.environ.get("REDIS_CACHE_URL") or os.environ.get("CELERY_BROKER_URL")
if not REDIS_CACHE_URL:
    raise ValueError(
        "REDIS_CACHE_URL or CELERY_BROKER_URL environment variable must be set in production for distributed locking."
    )

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_CACHE_URL,
    }
}

# Production CORS
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()
]

# Security hardening
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "True").lower() == "true"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
