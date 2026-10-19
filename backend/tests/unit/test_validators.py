import pytest
from django.core.exceptions import ValidationError

from common.validators import validate_bar_council_number, validate_case_year


def test_valid_bar_council_number():
    """Valid enrollment number formats should pass validation."""
    validate_bar_council_number("AP/1234/2020")
    validate_bar_council_number("ts/567/2018")


def test_invalid_bar_council_number():
    """Malformed enrollment numbers should raise ValidationError."""
    with pytest.raises(ValidationError):
        validate_bar_council_number("INVALID_FORMAT")

    with pytest.raises(ValidationError):
        validate_bar_council_number("")


def test_valid_case_year():
    """Valid case filing years should pass validation."""
    validate_case_year(2024)
    validate_case_year(1995)


def test_invalid_case_year():
    """Out-of-range case filing years should raise ValidationError."""
    with pytest.raises(ValidationError):
        validate_case_year(1900)

    with pytest.raises(ValidationError):
        validate_case_year(2099)
