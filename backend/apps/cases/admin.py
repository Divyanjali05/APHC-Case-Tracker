from django.contrib import admin

from .models import Case, CaseHistory, Hearing, Judgment


class HearingInline(admin.TabularInline):
    model = Hearing
    extra = 1


class JudgmentInline(admin.StackedInline):
    model = Judgment
    extra = 0


class CaseHistoryInline(admin.TabularInline):
    model = CaseHistory
    extra = 0
    readonly_fields = (
        "event_type",
        "field_name",
        "old_value",
        "new_value",
        "source",
        "changed_by",
        "created_at",
    )
    can_delete = False


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = (
        "__str__",
        "petitioner",
        "respondent",
        "current_stage",
        "court_hall_number",
        "next_hearing_date",
    )
    search_fields = ("case_number", "petitioner", "respondent", "petitioner_advocate")
    list_filter = ("case_type", "filing_year", "court_hall_number", "current_stage")
    inlines = [HearingInline, JudgmentInline, CaseHistoryInline]


@admin.register(Hearing)
class HearingAdmin(admin.ModelAdmin):
    list_display = (
        "case",
        "hearing_date",
        "hearing_time",
        "status",
        "court_hall_number",
        "item_number",
        "next_date",
        "previous_hearing_date",
    )
    list_filter = ("status", "hearing_date", "court_hall_number")


@admin.register(Judgment)
class JudgmentAdmin(admin.ModelAdmin):
    list_display = ("case", "judgment_date", "judgment_type", "order_number", "created_at")
    list_filter = ("judgment_date", "judgment_type")
    search_fields = ("case__case_number", "summary", "order_number")


@admin.register(CaseHistory)
class CaseHistoryAdmin(admin.ModelAdmin):
    list_display = ("case", "event_type", "field_name", "source", "changed_by", "created_at")
    list_filter = ("event_type", "source", "created_at")
    search_fields = ("case__case_number", "description", "field_name")
    readonly_fields = (
        "case",
        "event_type",
        "field_name",
        "old_value",
        "new_value",
        "description",
        "source",
        "changed_by",
        "created_at",
    )
