from rest_framework import permissions


class IsAdvocateUser(permissions.BasePermission):
    """Allows access only to authenticated users with an advocate role."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsOwnerOrReadOnly(permissions.BasePermission):
    """Object-level permission to allow only owners of an object to edit it."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return hasattr(obj, "advocate") and obj.advocate == request.user


class IsSeniorAdvocate(permissions.BasePermission):
    """Allows access only to Senior Advocates or staff."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return getattr(request.user, "is_senior_advocate", False) or request.user.is_staff
