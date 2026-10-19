import datetime
import re

from django.core.exceptions import ValidationError

BAR_COUNCIL_REGEX = re.compile(r"^[A-Z]{2}/\d{1,6}/\d{4}$")


def validate_bar_council_number(value: str) -> None:
    """Validates Bar Council enrollment number format, e.g. AP/1234/2020."""
    if not value:
        raise ValidationError("Enrollment number is required.")
    normalized = value.strip().upper()
    if not BAR_COUNCIL_REGEX.match(normalized):
        raise ValidationError(
            f"Invalid enrollment number '{value}'. Expected format: AP/1234/2020."
        )


def validate_case_year(value: int) -> None:
    """Validates filing year is between 1950 and next calendar year."""
    current_year = datetime.datetime.now().year
    if value < 1950 or value > current_year + 1:
        raise ValidationError(f"Case year must be between 1950 and {current_year + 1}.")
