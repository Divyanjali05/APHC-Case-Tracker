"""Optional staging-only cleanup command for synthetic seed data.

Safety guarantees:
- Strictly verifies target PostgreSQL is 127.0.0.1:5433 / aphc_case_tracker_staging / aphc_staging_app.
- Requires explicit `--confirm-delete-staging-seed` flag; defaults to dry-run preview.
- Deletes ONLY records created by `seed_staging_test_data`.
- Never modifies or deletes pre-existing users, registrations, or unrelated cases.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from apps.cases.management.commands.seed_staging_test_data import (
    ALPHA_USERNAME,
    BETA_USERNAME,
    EXPECTED_DB_HOST,
    EXPECTED_DB_NAME,
    EXPECTED_DB_PORT,
    EXPECTED_DB_USER,
    EXPECTED_GIT_BRANCH,
    SEED_NOTIFICATION_PREFIX,
    SEED_SOURCE_TAG,
)
from apps.cases.models import Case, CaseDocument
from apps.court_data.models import CourtListing
from apps.notifications.models import NotificationHistory
from apps.tokens.models import CourtHall, TokenAlertRule

User = get_user_model()

SEEDED_CASE_NUMBERS = [f"{n}" for n in range(90001, 90027)] + [f"{n}" for n in range(91001, 91006)]


class Command(BaseCommand):
    help = (
        "Safely remove ONLY synthetic staging records created by seed_staging_test_data. "
        "Requires --confirm-delete-staging-seed to execute deletion."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm-delete-staging-seed",
            action="store_true",
            default=False,
            help="Explicit confirmation required to delete ONLY seeded synthetic test records.",
        )

    def _verify_safety(self) -> None:
        repo_root = Path(settings.BASE_DIR).parent
        try:
            branch = subprocess.check_output(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(repo_root),
                text=True,
                stderr=subprocess.STDOUT,
            ).strip()
        except Exception as exc:
            raise CommandError(f"Unable to verify active Git branch: {exc}") from exc

        if branch != EXPECTED_GIT_BRANCH:
            raise CommandError(
                f"SAFETY ABORT: Expected Git branch '{EXPECTED_GIT_BRANCH}', got '{branch}'."
            )

        db_cfg = settings.DATABASES["default"]
        if (
            str(db_cfg.get("HOST", "")) != EXPECTED_DB_HOST
            or int(db_cfg.get("PORT") or 0) != EXPECTED_DB_PORT
            or str(db_cfg.get("NAME", "")) != EXPECTED_DB_NAME
            or str(db_cfg.get("USER", "")) != EXPECTED_DB_USER
        ):
            raise CommandError("SAFETY ABORT: Database configuration does not match local staging.")

        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user, inet_server_port();")
            live_db, live_user, live_port = cursor.fetchone()

        if (
            live_db != EXPECTED_DB_NAME
            or live_user != EXPECTED_DB_USER
            or int(live_port) != EXPECTED_DB_PORT
        ):
            raise CommandError(
                "SAFETY ABORT: Live PostgreSQL identity does not match local staging."
            )

    def handle(self, *args, **options):
        self._verify_safety()

        seeded_users_qs = User.objects.filter(username__in=[ALPHA_USERNAME, BETA_USERNAME])
        seeded_cases_qs = Case.objects.filter(case_number__in=SEEDED_CASE_NUMBERS)
        seeded_docs_qs = CaseDocument.objects.filter(case__in=seeded_cases_qs)
        seeded_notifs_qs = NotificationHistory.objects.filter(
            idempotency_key__startswith=SEED_NOTIFICATION_PREFIX
        )
        seeded_tokens_qs = TokenAlertRule.objects.filter(sync_source=SEED_SOURCE_TAG)
        seeded_listings_qs = CourtListing.objects.filter(provider_name=SEED_SOURCE_TAG)
        seeded_halls_qs = CourtHall.objects.filter(bench_name__icontains="(TEST DATA)")

        summary = {
            "seeded_advocates": seeded_users_qs.count(),
            "seeded_cases": seeded_cases_qs.count(),
            "seeded_documents": seeded_docs_qs.count(),
            "seeded_notifications": seeded_notifs_qs.count(),
            "seeded_token_alerts": seeded_tokens_qs.count(),
            "seeded_court_listings": seeded_listings_qs.count(),
            "seeded_court_halls": seeded_halls_qs.count(),
        }

        if not options["confirm_delete_staging_seed"]:
            self.stdout.write(
                self.style.WARNING(
                    "DRY RUN ONLY (no records deleted). "
                    "Re-run with --confirm-delete-staging-seed to remove these seeded records:"
                )
            )
            self.stdout.write(str(summary))
            return

        with transaction.atomic():
            # Clean up stored synthetic document files on disk first
            for doc in seeded_docs_qs:
                if doc.file:
                    try:
                        doc.file.delete(save=False)
                    except Exception:
                        pass

            seeded_tokens_qs.delete()
            seeded_listings_qs.delete()
            seeded_notifs_qs.delete()
            # Deleting seeded cases cascades hearings, judgments, history, documents, notes, case reminders
            seeded_cases_qs.delete()
            # Deleting seeded users cascades profiles, reminder preferences, user reminders, calendar settings
            seeded_users_qs.delete()
            # Remove test-tagged court halls only if no remaining alerts reference them
            for hall in seeded_halls_qs:
                if not hall.token_alerts.exists():
                    hall.delete()

        self.stdout.write(
            self.style.SUCCESS("CLEANUP COMPLETE — deleted ONLY seeded test records:")
        )
        self.stdout.write(str(summary))
