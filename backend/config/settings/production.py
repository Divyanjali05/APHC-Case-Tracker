import os

from .base import *  # noqa: F403
from .base import SIMPLE_JWT as BASE_SIMPLE_JWT
from .base import parse_database_url

DEBUG = False

# Strict production secret key enforcement
PROD_SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if (
    not PROD_SECRET_KEY
    or "insecure" in PROD_SECRET_KEY.lower()
    or "placeholder" in PROD_SECRET_KEY.lower()
):
    raise ValueError("A secure DJANGO_SECRET_KEY environment variable must be set in production.")
SECRET_KEY = PROD_SECRET_KEY

# Strict ALLOWED_HOSTS enforcement (no implicit localhost/wildcard fallback)
PROD_ALLOWED_HOSTS = [
    host.strip() for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if host.strip()
]
if not PROD_ALLOWED_HOSTS:
    raise ValueError("DJANGO_ALLOWED_HOSTS environment variable must be set in production.")
if any("*" in host for host in PROD_ALLOWED_HOSTS):
    raise ValueError("Wildcard ALLOWED_HOSTS is not permitted in production.")
ALLOWED_HOSTS = PROD_ALLOWED_HOSTS

# Strict dedicated JWT signing key enforcement
PROD_JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "").strip()
if (
    not PROD_JWT_SECRET_KEY
    or "insecure" in PROD_JWT_SECRET_KEY.lower()
    or "placeholder" in PROD_JWT_SECRET_KEY.lower()
):
    raise ValueError("A dedicated JWT_SECRET_KEY environment variable must be set in production.")
JWT_SECRET_KEY = PROD_JWT_SECRET_KEY
SIMPLE_JWT = {
    **BASE_SIMPLE_JWT,
    "SIGNING_KEY": JWT_SECRET_KEY,
}

# Strict production database configuration via DATABASE_URL
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable must be set in production.")

DATABASES = {
    "default": {
        **parse_database_url(DATABASE_URL, require_ssl=True),
        "CONN_MAX_AGE": 600,
    }
}

# Production CORS
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()
]

# Disable public API schema/Swagger docs by default in production
ENABLE_API_DOCS = os.getenv("ENABLE_API_DOCS", "False").lower() == "true"

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
