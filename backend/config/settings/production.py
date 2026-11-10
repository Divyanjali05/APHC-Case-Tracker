from decouple import Csv, config

from .base import *  # noqa: F403
from .base import build_postgresql_params_config, parse_postgresql_url

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
DATABASE_URL = (config("DATABASE_URL", default="") or "").strip() or None
DB_NAME = (config("DB_NAME", default="") or "").strip() or None
DB_USER = config("DB_USER", default="postgres")
DB_PASSWORD = config("DB_PASSWORD", default="")
DB_HOST = config("DB_HOST", default="localhost")
DB_PORT = config("DB_PORT", default=5432, cast=int)
DB_SSLMODE = (config("DB_SSLMODE", default="") or "").strip() or None

if DATABASE_URL:
    DATABASES = {
        "default": parse_postgresql_url(DATABASE_URL, conn_max_age=600),
    }
elif DB_NAME:
    DATABASES = {
        "default": build_postgresql_params_config(
            name=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
            sslmode=DB_SSLMODE,
            conn_max_age=600,
        ),
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

# Reverse Proxy & SSL Configuration
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# Security hardening
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Sentry Error Tracking (Optional based on SENTRY_DSN presence)
SENTRY_DSN = config("SENTRY_DSN", default="")
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.django import DjangoIntegration
        from sentry_sdk.integrations.redis import RedisIntegration

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[DjangoIntegration(), CeleryIntegration(), RedisIntegration()],
            traces_sample_rate=config("SENTRY_TRACES_SAMPLE_RATE", default=0.2, cast=float),
            send_default_pii=False,
            environment=config("ENVIRONMENT", default="production"),
        )
    except ImportError:
        pass
