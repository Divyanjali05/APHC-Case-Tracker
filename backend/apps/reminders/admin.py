from django.contrib import admin

from .models import Reminder, ReminderPreference


@admin.register(Reminder)
class ReminderAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "advocate",
        "case",
        "reminder_type",
        "reminder_interval_hours",
        "status",
        "due_date",
        "is_completed",
    )
    search_fields = ("title", "description", "advocate__username")
    list_filter = ("reminder_type", "status", "is_completed", "due_date")


@admin.register(ReminderPreference)
class ReminderPreferenceAdmin(admin.ModelAdmin):
    list_display = (
        "advocate",
        "remind_24h_before",
        "remind_1h_before",
        "email_notifications",
        "push_notifications",
        "updated_at",
    )
    search_fields = ("advocate__username", "advocate__email")
    list_filter = ("remind_24h_before", "remind_1h_before", "push_notifications")
