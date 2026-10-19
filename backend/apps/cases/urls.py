from django.urls import path

from .views import CaseDetailView, CaseListCreateView, CasesStatusView

app_name = "cases"

urlpatterns = [
    path("status/", CasesStatusView.as_view(), name="status"),
    path("", CaseListCreateView.as_view(), name="case_list_create"),
    path("<int:pk>/", CaseDetailView.as_view(), name="case_detail"),
]
