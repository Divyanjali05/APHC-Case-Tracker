from django.contrib import admin

from .models import DeviceRegistration, NotificationHistory


@admin.register(DeviceRegistration)
class DeviceRegistrationAdmin(admin.ModelAdmin):
    list_display = ("user", "platform", "device_name", "is_active", "updated_at")
    list_filter = ("platform", "is_active")
    search_fields = ("user__username", "expo_push_token")


@admin.register(NotificationHistory)
class NotificationHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "title", "category", "is_read", "sent_at")
    list_filter = ("category", "is_read", "sent_at")
    search_fields = ("user__username", "title", "body")
