import os
import sys
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def parse_database_url(database_url: str, *, require_ssl: bool = False) -> dict:
    """Parse a PostgreSQL connection URL into a Django DATABASES config dict."""
    parsed = urlparse(database_url.strip())
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError(f"Unsupported DATABASE_URL scheme: {parsed.scheme or '<empty>'}")

    host = parsed.hostname or "localhost"
    options = {
        key: values[-1]
        for key, values in parse_qs(parsed.query, keep_blank_values=False).items()
        if values
    }
    # Enforce SSL for Neon hosts and production connections unless explicitly overridden.
    if (require_ssl or host.endswith(".neon.tech")) and "sslmode" not in options:
        options["sslmode"] = "require"

    db_config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username) if parsed.username else "postgres",
        "PASSWORD": unquote(parsed.password) if parsed.password is not None else "",
        "HOST": host,
        "PORT": parsed.port or 5432,
    }
    if options:
        db_config["OPTIONS"] = options
    return db_config

# Add apps directory to sys.path so app modules can be loaded easily
APPS_DIR = BASE_DIR / "apps"
if str(APPS_DIR) not in sys.path:
    sys.path.insert(0, str(APPS_DIR))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Load .env file
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-aphc-dev-key-change-in-production")

DEBUG = False

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
    if host.strip()
]

# Application definition
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.accounts.apps.AccountsConfig",
    "apps.cases.apps.CasesConfig",
    "apps.reminders.apps.RemindersConfig",
    "apps.tokens.apps.TokensConfig",
    "apps.notifications.apps.NotificationsConfig",
    "apps.court_data.apps.CourtDataConfig",
    "apps.voice.apps.VoiceConfig",
    "apps.agenda.apps.AgendaConfig",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# Static & Media
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Protected Case Document & Voice Note Storage
SECURE_DOCUMENT_ROOT = os.getenv(
    "SECURE_DOCUMENT_ROOT",
    str(BASE_DIR / "protected_media" / "case_documents"),
)
SECURE_VOICE_ROOT = os.getenv(
    "SECURE_VOICE_ROOT",
    str(BASE_DIR / "protected_media" / "voice_notes"),
)
MAX_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))
MAX_VOICE_UPLOAD_SIZE_BYTES = int(
    os.getenv("MAX_VOICE_UPLOAD_SIZE_BYTES", str(25 * 1024 * 1024))
)
MAX_VOICE_DURATION_SECONDS = int(os.getenv("MAX_VOICE_DURATION_SECONDS", "600"))
ALLOWED_VOICE_EXTENSIONS = {"m4a", "mp3", "wav", "aac", "ogg", "webm", "flac"}
ALLOWED_VOICE_MIME_TYPES = {
    "audio/m4a",
    "audio/mp4",
    "audio/x-m4a",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/aac",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
}
SPEECH_TO_TEXT_PROVIDER = os.getenv("SPEECH_TO_TEXT_PROVIDER", "MOCK_STT_PROVIDER")
GOOGLE_CLOUD_SPEECH_CREDENTIALS = os.getenv("GOOGLE_CLOUD_SPEECH_CREDENTIALS", "")
ALLOWED_DOCUMENT_EXTENSIONS = {"pdf", "docx", "jpg", "jpeg", "png"}
ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "200/hour",
        "user": "2000/hour",
        "auth": "10/minute",
        "refresh": "20/minute",
        "register": "10/minute",
        "otp_request": "5/minute",
        "otp_verify": "10/minute",
        "change_password": "5/minute",
        "password_reset_request": "5/minute",
        "password_reset_confirm": "5/minute",
    },
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
}

# SimpleJWT Settings
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
JWT_ACCESS_MINUTES = int(os.getenv("JWT_ACCESS_MINUTES", "60"))
JWT_REFRESH_DAYS = int(os.getenv("JWT_REFRESH_DAYS", "14"))

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=JWT_ACCESS_MINUTES),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=JWT_REFRESH_DAYS),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "SIGNING_KEY": JWT_SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Celery & Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

CELERY_BEAT_SCHEDULE = {
    "check-due-reminders-every-15-minutes": {
        "task": "reminders.check_and_send_due_reminders",
        "schedule": 900.0,
    },
    "sync-tracked-case-statuses-every-5-minutes": {
        "task": "court_data.sync_tracked_case_statuses",
        "schedule": 300.0,
    },
    "sync-active-token-alerts-every-60-seconds": {
        "task": "tokens.sync_active_token_alerts",
        "schedule": 60.0,
    },
    "retry-failed-push-notifications-every-5-minutes": {
        "task": "notifications.retry_failed_push_notifications",
        "schedule": 300.0,
    },
    "prune-realtime-events-daily": {
        "task": "notifications.prune_realtime_events",
        "schedule": 86400.0,
    },
}

# Push Notification Provider Configuration
PUSH_NOTIFICATION_PROVIDER = os.getenv("PUSH_NOTIFICATION_PROVIDER", "mock")
EXPO_PUSH_ACCESS_TOKEN = os.getenv("EXPO_PUSH_ACCESS_TOKEN", "")
FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")
FCM_PROJECT_ID = os.getenv("FCM_PROJECT_ID", "")

# OpenAPI / Spectacular
SPECTACULAR_SETTINGS = {
    "TITLE": "APHC Case Tracker API",
    "DESCRIPTION": "Production API for Andhra Pradesh High Court Advocates Case Tracking",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
