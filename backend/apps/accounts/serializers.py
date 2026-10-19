from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import AdvocateProfile

User = get_user_model()


class AdvocateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvocateProfile
        fields = [
            "id",
            "bar_council_enrollment_number",
            "phone_number",
            "chamber_address",
            "role",
            "preferred_language",
            "is_verified",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_verified", "created_at", "updated_at"]


class UserSerializer(serializers.ModelSerializer):
    profile = AdvocateProfileSerializer(source="advocate_profile", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "profile"]
        read_only_fields = ["id"]
