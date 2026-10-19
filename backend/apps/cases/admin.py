from django.contrib import admin

from .models import Case, Hearing


class HearingInline(admin.TabularInline):
    model = Hearing
    extra = 1


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
    inlines = [HearingInline]


@admin.register(Hearing)
class HearingAdmin(admin.ModelAdmin):
    list_display = ("case", "hearing_date", "court_hall_number", "item_number", "next_date")
    list_filter = ("hearing_date", "court_hall_number")
