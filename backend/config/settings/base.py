import sys
from datetime import timedelta
from pathlib import Path

from decouple import Csv, config
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Add apps directory to sys.path so app modules can be loaded easily
APPS_DIR = BASE_DIR / "apps"
if str(APPS_DIR) not in sys.path:
    sys.path.insert(0, str(APPS_DIR))
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Load .env file
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = config(
    "DJANGO_SECRET_KEY", default="django-insecure-aphc-dev-key-change-in-production"
)

DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)

ALLOWED_HOSTS = config(
    "DJANGO_ALLOWED_HOSTS",
    default="localhost,127.0.0.1,testserver",
    cast=Csv(),
)

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
    "django_filters",
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

# Protected Case Document Storage (outside public static/media)
SECURE_DOCUMENT_ROOT = config(
    "SECURE_DOCUMENT_ROOT",
    default=str(BASE_DIR / "protected_media" / "case_documents"),
)
SECURE_VOICE_ROOT = config(
    "SECURE_VOICE_ROOT",
    default=str(BASE_DIR / "protected_media" / "voice_notes"),
)
MAX_UPLOAD_SIZE_BYTES = config(
    "MAX_UPLOAD_SIZE_BYTES",
    default=10 * 1024 * 1024,
    cast=int,
)
MAX_VOICE_UPLOAD_SIZE_BYTES = config(
    "MAX_VOICE_UPLOAD_SIZE_BYTES",
    default=25 * 1024 * 1024,  # 25 MB
    cast=int,
)
MAX_VOICE_DURATION_SECONDS = config(
    "MAX_VOICE_DURATION_SECONDS",
    default=600,  # 10 minutes
    cast=int,
)
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
SPEECH_TO_TEXT_PROVIDER = config(
    "SPEECH_TO_TEXT_PROVIDER",
    default="MOCK_STT_PROVIDER",
)
GOOGLE_CLOUD_SPEECH_CREDENTIALS = config(
    "GOOGLE_CLOUD_SPEECH_CREDENTIALS",
    default="",
)
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
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/day",
        "user": "1000/day",
        "auth": "10/minute",
        "refresh": "20/minute",
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
JWT_SECRET_KEY = config("JWT_SECRET_KEY", default=SECRET_KEY)
JWT_ACCESS_MINUTES = config("JWT_ACCESS_MINUTES", default=60, cast=int)
JWT_REFRESH_DAYS = config("JWT_REFRESH_DAYS", default=14, cast=int)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=JWT_ACCESS_MINUTES),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=JWT_REFRESH_DAYS),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "SIGNING_KEY": JWT_SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Celery & Redis Configuration
REDIS_URL = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://localhost:6379/1")
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
PUSH_NOTIFICATION_PROVIDER = config("PUSH_NOTIFICATION_PROVIDER", default="mock")
EXPO_PUSH_ACCESS_TOKEN = config("EXPO_PUSH_ACCESS_TOKEN", default="")
FCM_SERVER_KEY = config("FCM_SERVER_KEY", default="")
FCM_PROJECT_ID = config("FCM_PROJECT_ID", default="")

# Structured Logging Configuration
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {asctime} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": config("DJANGO_LOG_LEVEL", default="INFO"),
            "propagate": False,
        },
        "apps": {
            "handlers": ["console"],
            "level": "DEBUG" if DEBUG else "INFO",
            "propagate": False,
        },
    },
}

# OpenAPI / Spectacular
SPECTACULAR_SETTINGS = {
    "TITLE": "APHC Case Tracker API",
    "DESCRIPTION": "Production API for Andhra Pradesh High Court Advocates Case Tracking",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
