from rest_framework import permissions

ROLE_ADMIN = "ADMIN"
ROLE_ADVOCATE = "ADVOCATE"


def get_user_role(user) -> str:
    """Resolve canonical application role ('ADMIN' or 'ADVOCATE') from Django auth flags."""
    if not user or not getattr(user, "is_authenticated", False):
        return "ANONYMOUS"
    if not getattr(user, "is_active", False):
        return "INACTIVE"
    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return ROLE_ADMIN
    return ROLE_ADVOCATE


class IsAdvocateUser(permissions.BasePermission):
    """Allows access only to active authenticated users."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "is_active", False)
        )


class IsAdminRole(permissions.BasePermission):
    """Allows access strictly to active users with ADMIN privileges."""

    message = "Administrator privileges are required to perform this action."

    def has_permission(self, request, view):
        return get_user_role(request.user) == ROLE_ADMIN


class IsAdvocateRole(permissions.BasePermission):
    """Allows access strictly to active non-admin Advocate users."""

    def has_permission(self, request, view):
        return get_user_role(request.user) == ROLE_ADVOCATE


class IsOwnerOrReadOnly(permissions.BasePermission):
    """Object-level permission to allow only owners of an object to edit it."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return hasattr(obj, "advocate") and obj.advocate == request.user


class IsSeniorAdvocate(permissions.BasePermission):
    """Allows access only to Senior Advocates or active staff."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated and request.user.is_active):
            return False
        profile = getattr(request.user, "advocate_profile", None)
        is_senior = bool(profile and profile.role == "SENIOR")
        return (
            is_senior or getattr(request.user, "is_senior_advocate", False) or request.user.is_staff
        )
