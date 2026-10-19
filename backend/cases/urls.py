from django.urls import path

from .views import CasesStatusView

app_name = "cases"

urlpatterns = [
    path("status/", CasesStatusView.as_view(), name="status"),
]
