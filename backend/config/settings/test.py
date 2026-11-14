import tempfile
from pathlib import Path

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK as BASE_REST_FRAMEWORK

DEBUG = True
ENABLE_API_DOCS = True
CELERY_TASK_ALWAYS_EAGER = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
SECURE_DOCUMENT_ROOT = str(Path(tempfile.gettempdir()) / "aphc_test_case_documents")
SECURE_VOICE_ROOT = str(Path(tempfile.gettempdir()) / "aphc_test_voice_notes")

REST_FRAMEWORK = {
    **BASE_REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **BASE_REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}),
        "anon": "10000/hour",
        "user": "10000/hour",
        "auth": "1000/minute",
        "refresh": "1000/minute",
        "register": "1000/minute",
        "otp_request": "1000/minute",
        "otp_verify": "1000/minute",
        "change_password": "1000/minute",
    },
}
