from django.urls import path

from .views import (
    AccountsStatusView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
)

app_name = "accounts"

urlpatterns = [
    path("status/", AccountsStatusView.as_view(), name="status"),
    path("token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path(
        "password-reset/request/", PasswordResetRequestView.as_view(), name="password_reset_request"
    ),
    path(
        "password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"
    ),
    path("profile/", ProfileView.as_view(), name="profile"),
]
