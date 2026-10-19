from django.contrib import admin

from .models import Reminder


@admin.register(Reminder)
class ReminderAdmin(admin.ModelAdmin):
    list_display = ("title", "advocate", "case", "reminder_type", "due_date", "is_completed")
    search_fields = ("title", "description", "advocate__username")
    list_filter = ("reminder_type", "is_completed", "due_date")
