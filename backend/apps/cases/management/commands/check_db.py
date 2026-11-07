import sys

from django.core.management.base import BaseCommand
from django.db import connection
from django.db.utils import OperationalError


class Command(BaseCommand):
    help = "Validates active database connection and reports engine and status."

    def handle(self, *args, **options):
        self.stdout.write("Checking database connection...")
        try:
            connection.ensure_connection()
            engine = connection.settings_dict.get("ENGINE", "unknown").split(".")[-1]
            name = connection.settings_dict.get("NAME", "unknown")
            host = connection.settings_dict.get("HOST", "localhost") or "localhost"
            port = connection.settings_dict.get("PORT", "5432") or "default"

            self.stdout.write(
                self.style.SUCCESS(
                    f"Database connection SUCCESSFUL!\n"
                    f"  Engine: {engine}\n"
                    f"  Database Name: {name}\n"
                    f"  Host: {host}:{port}"
                )
            )
        except OperationalError as exc:
            self.stderr.write(self.style.ERROR(f"Database connection FAILED: {exc}"))
            sys.exit(1)
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"Unexpected database error: {exc}"))
            sys.exit(1)
