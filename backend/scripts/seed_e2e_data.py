import os
import sys
from datetime import date, time, timedelta

import django

# Set up Django environment
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402

from apps.accounts.models import AdvocateProfile  # noqa: E402
from apps.cases.models import Case, Hearing, Judgment  # noqa: E402
from apps.reminders.models import ReminderPreference  # noqa: E402

User = get_user_model()


def seed():
    # 1. Create or get test user
    username = "AP/8888/2021"
    password = "ValidPassword123!"
    user, created = User.objects.get_or_create(username=username)
    user.set_password(password)
    user.is_active = True
    user.save()
    print(f"User {username} {'created' if created else 'updated'}.")

    # Advocate Profile
    profile, p_created = AdvocateProfile.objects.get_or_create(
        user=user,
        defaults={
            "bar_council_enrollment_number": username,
            "role": "SENIOR",
            "preferred_language": "en",
            "is_verified": True,
        },
    )
    if not p_created:
        profile.bar_council_enrollment_number = username
        profile.is_verified = True
        profile.save()
    print("AdvocateProfile ready.")

    # 2. Reminder preferences
    pref, _ = ReminderPreference.objects.get_or_create(
        advocate=user,
        defaults={
            "remind_24h_before": True,
            "remind_1h_before": True,
            "email_notifications": False,
        },
    )
    print("ReminderPreferences ready.")

    # 3. Create Cases
    # Case 1: Upcoming Hearing
    case1, _ = Case.objects.get_or_create(
        case_type="WP",
        case_number="1001",
        filing_year=2024,
        defaults={
            "petitioner": "Ramesh Kumar & Ors.",
            "respondent": "State of Andhra Pradesh & Others",
            "petitioner_advocate": "Advocate AP/8888/2021",
            "current_stage": "HEARING",
            "next_hearing_date": date.today() + timedelta(days=5),
            "bench": "Court Hall 04 - Single Bench",
            "court_hall_number": 4,
        },
    )
    case1.tracked_by.add(user)

    Hearing.objects.get_or_create(
        case=case1,
        hearing_date=date.today() + timedelta(days=5),
        defaults={
            "hearing_time": time(10, 30),
            "status": "SCHEDULED",
            "court_hall_number": 4,
            "item_number": 12,
            "business_conducted": "For Preliminary Hearing",
        },
    )

    # Case 2: Disposed with Judgment
    case2, _ = Case.objects.get_or_create(
        case_type="WP",
        case_number="2002",
        filing_year=2024,
        defaults={
            "petitioner": "Sita Devi",
            "respondent": "Tirupati Municipal Corporation",
            "petitioner_advocate": "Advocate AP/8888/2021",
            "current_stage": "DISPOSED",
            "bench": "Court Hall 02 - Division Bench",
            "court_hall_number": 2,
        },
    )
    case2.tracked_by.add(user)

    Judgment.objects.get_or_create(
        case=case2,
        defaults={
            "judgment_date": date.today() - timedelta(days=10),
            "judgment_type": "FINAL",
            "order_number": "ORD-2024-2002",
            "bench": "Hon'ble Sri Justice K. Sharma",
            "summary": "Municipal assessment quashed for lack of statutory notice under AP Municipalities Act.",
            "document_link": "",
        },
    )

    # Case 3: Adjourned
    case3, _ = Case.objects.get_or_create(
        case_type="WA",
        case_number="3003",
        filing_year=2023,
        defaults={
            "petitioner": "Naveen Reddy",
            "respondent": "APSPDCL & Others",
            "petitioner_advocate": "Advocate AP/8888/2021",
            "current_stage": "ADJOURNED",
            "bench": "Court Hall 01 - Chief Justice Bench",
            "court_hall_number": 1,
        },
    )
    case3.tracked_by.add(user)

    print("Seed cases, hearings, and judgments created successfully.")


if __name__ == "__main__":
    seed()
