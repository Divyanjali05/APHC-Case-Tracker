from django.urls import path

from .views import (
    AccountsStatusView,
    AdvocateRegisterView,
    ChangePasswordView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    RequestOTPView,
    ThrottledTokenObtainPairView,
    ThrottledTokenRefreshView,
    VerifyOTPView,
)

app_name = "accounts"

urlpatterns = [
    path("status/", AccountsStatusView.as_view(), name="status"),
    path("register/", AdvocateRegisterView.as_view(), name="register"),
    path("token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("otp/request/", RequestOTPView.as_view(), name="otp_request"),
    path("otp/verify/", VerifyOTPView.as_view(), name="otp_verify"),
    path("change-password/", ChangePasswordView.as_view(), name="change_password"),
    path(
        "password-reset/request/",
        PasswordResetRequestView.as_view(),
        name="password_reset_request",
    ),
    path(
        "password-reset/verify-otp/",
        VerifyOTPView.as_view(),
        name="password_reset_verify_otp",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    path("profile/", ProfileView.as_view(), name="profile"),
]
