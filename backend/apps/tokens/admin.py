from django.contrib import admin

from .models import CourtHall, CourtTokenStatus, TokenAlertRule


class CourtTokenStatusInline(admin.StackedInline):
    model = CourtTokenStatus
    can_delete = False


@admin.register(CourtHall)
class CourtHallAdmin(admin.ModelAdmin):
    list_display = ("hall_number", "bench_name", "is_active", "updated_at")
    inlines = [CourtTokenStatusInline]


@admin.register(TokenAlertRule)
class TokenAlertRuleAdmin(admin.ModelAdmin):
    list_display = (
        "advocate",
        "case",
        "court_hall",
        "listed_item_number",
        "alert_threshold",
        "is_notified",
    )
    list_filter = ("court_hall", "is_notified")
