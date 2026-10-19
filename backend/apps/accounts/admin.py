from django.contrib import admin

from .models import AdvocateProfile


@admin.register(AdvocateProfile)
class AdvocateProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "bar_council_enrollment_number", "role", "is_verified", "created_at")
    search_fields = ("user__username", "user__email", "bar_council_enrollment_number")
    list_filter = ("role", "is_verified", "preferred_language")
