"""Role-protected Administrative APIs for User Management, Case Assignment, and System Overview."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.cases.models import Case, CaseAssignmentHistory
from common.permissions import ROLE_ADMIN, ROLE_ADVOCATE, IsAdminRole, get_user_role

from .models import AdminAuditLog, AdvocateProfile
from .serializers import (
    AdminAuditLogSerializer,
    AdminUserCreateSerializer,
    AdminUserUpdateSerializer,
    AdvocateProfileSerializer,
)

User = get_user_model()


def _get_client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class AdminUserSerializer(serializers.ModelSerializer):
    profile = AdvocateProfileSerializer(source="advocate_profile", read_only=True)
    role = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    assigned_cases_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "is_admin",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "assigned_cases_count",
            "profile",
        ]
        read_only_fields = fields

    def get_role(self, obj) -> str:
        return get_user_role(obj)

    def get_is_admin(self, obj) -> bool:
        return get_user_role(obj) == ROLE_ADMIN

    def get_full_name(self, obj) -> str:
        return obj.get_full_name().strip() or obj.username

    def get_assigned_cases_count(self, obj) -> int:
        if hasattr(obj, "assigned_cases_count_ann"):
            return obj.assigned_cases_count_ann
        return obj.tracked_cases.count()


class AdminCaseMetadataSerializer(serializers.ModelSerializer):
    """Strict administrative case metadata ONLY — never exposes private notes, docs, or voice notes."""

    formatted_case_number = serializers.SerializerMethodField()
    assigned_advocates = serializers.SerializerMethodField()
    is_assigned = serializers.SerializerMethodField()

    class Meta:
        model = Case
        fields = [
            "id",
            "case_type",
            "case_number",
            "filing_year",
            "formatted_case_number",
            "petitioner",
            "respondent",
            "current_stage",
            "bench",
            "court_hall_number",
            "next_hearing_date",
            "is_assigned",
            "assigned_advocates",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_formatted_case_number(self, obj) -> str:
        return f"{obj.case_type} {obj.case_number}/{obj.filing_year}"

    def get_is_assigned(self, obj) -> bool:
        return len(list(obj.tracked_by.all())) > 0

    def get_assigned_advocates(self, obj) -> list[dict]:
        advocates = []
        for u in obj.tracked_by.all():
            profile = getattr(u, "advocate_profile", None)
            advocates.append(
                {
                    "id": u.id,
                    "username": u.username,
                    "full_name": u.get_full_name().strip() or u.username,
                    "enrollment_number": (
                        profile.bar_council_enrollment_number if profile else None
                    ),
                    "is_active": u.is_active,
                    "role": get_user_role(u),
                }
            )
        return advocates


class CaseAssignmentHistorySerializer(serializers.ModelSerializer):
    case_number = serializers.SerializerMethodField()
    advocate_name = serializers.SerializerMethodField()
    advocate_enrollment = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CaseAssignmentHistory
        fields = [
            "id",
            "case",
            "case_number",
            "advocate",
            "advocate_name",
            "advocate_enrollment",
            "assigned_by",
            "assigned_by_name",
            "action",
            "notes",
            "created_at",
        ]
        read_only_fields = fields

    def get_case_number(self, obj) -> str:
        return f"{obj.case.case_type} {obj.case.case_number}/{obj.case.filing_year}"

    def get_advocate_name(self, obj) -> str:
        return obj.advocate.get_full_name().strip() or obj.advocate.username

    def get_advocate_enrollment(self, obj) -> str | None:
        profile = getattr(obj.advocate, "advocate_profile", None)
        return profile.bar_council_enrollment_number if profile else None

    def get_assigned_by_name(self, obj) -> str:
        if not obj.assigned_by:
            return "System"
        return obj.assigned_by.get_full_name().strip() or obj.assigned_by.username


class AdminDashboardView(APIView):
    """Administrative home metrics, system health overview, and recent audit activity."""

    permission_classes = [IsAdminRole]

    def get(self, request):
        advocate_qs = User.objects.filter(is_staff=False, is_superuser=False)
        total_advocates = advocate_qs.count()
        active_advocates = advocate_qs.filter(is_active=True).count()
        inactive_advocates = advocate_qs.filter(is_active=False).count()
        pending_approvals = AdvocateProfile.objects.filter(
            user__is_staff=False,
            user__is_superuser=False,
            is_verified=False,
        ).count()
        total_admins = User.objects.filter(
            Q(is_staff=True) | Q(is_superuser=True), is_active=True
        ).count()

        total_cases = Case.objects.count()
        assigned_cases = Case.objects.filter(tracked_by__isnull=False).distinct().count()
        unassigned_cases = total_cases - assigned_cases

        db_status = "healthy"
        try:
            connection.ensure_connection()
        except Exception as exc:
            db_status = f"unhealthy: {exc.__class__.__name__}"

        recent_logs = AdminAuditLog.objects.select_related("actor", "target_user", "target_case")[
            :15
        ]
        recent_cutoff = timezone.now() - timedelta(days=7)

        return Response(
            {
                "stats": {
                    "total_advocates": total_advocates,
                    "active_advocates": active_advocates,
                    "inactive_advocates": inactive_advocates,
                    "pending_approvals": pending_approvals,
                    "total_admins": total_admins,
                    "total_cases": total_cases,
                    "assigned_cases": assigned_cases,
                    "unassigned_cases": unassigned_cases,
                },
                "recent_activity": AdminAuditLogSerializer(recent_logs, many=True).data,
                "system_overview": {
                    "database_status": db_status,
                    "database_engine": connection.settings_dict.get("ENGINE", "").split(".")[-1],
                    "debug_mode": bool(getattr(settings, "DEBUG", False)),
                    "total_assignments": CaseAssignmentHistory.objects.count(),
                    "audit_log_count": AdminAuditLog.objects.count(),
                    "recent_registrations_7d": advocate_qs.filter(
                        date_joined__gte=recent_cutoff
                    ).count(),
                },
            },
            status=status.HTTP_200_OK,
        )


class AdminUserListCreateView(generics.ListCreateAPIView):
    """List/search users or create a new Advocate/Admin account."""

    permission_classes = [IsAdminRole]
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        qs = (
            User.objects.select_related("advocate_profile")
            .annotate(assigned_cases_count_ann=Count("tracked_cases", distinct=True))
            .order_by("-date_joined", "id")
        )

        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(advocate_profile__bar_council_enrollment_number__icontains=search)
            )

        role_filter = self.request.query_params.get("role", "").strip().upper()
        if role_filter == ROLE_ADMIN:
            qs = qs.filter(Q(is_staff=True) | Q(is_superuser=True))
        elif role_filter == ROLE_ADVOCATE:
            qs = qs.filter(is_staff=False, is_superuser=False)

        status_filter = self.request.query_params.get("status", "").strip().lower()
        if status_filter == "active":
            qs = qs.filter(is_active=True)
        elif status_filter == "inactive":
            qs = qs.filter(is_active=False)
        elif status_filter == "pending":
            qs = qs.filter(advocate_profile__is_verified=False)

        verified_param = self.request.query_params.get("verified", "").strip().lower()
        if verified_param in ("true", "1"):
            qs = qs.filter(advocate_profile__is_verified=True)
        elif verified_param in ("false", "0"):
            qs = qs.filter(advocate_profile__is_verified=False)

        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_account_role = data.get("account_role", ROLE_ADVOCATE)
        if target_account_role == ROLE_ADMIN and not request.user.is_superuser:
            raise PermissionDenied("Only a superuser Administrator may create Admin accounts.")

        is_admin_target = target_account_role == ROLE_ADMIN
        new_user = User.objects.create_user(
            username=data["resolved_username"],
            email=data.get("email", ""),
            password=data["password"],
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            is_active=data.get("is_active", True),
            is_staff=is_admin_target,
            is_superuser=False,
        )

        AdvocateProfile.objects.create(
            user=new_user,
            bar_council_enrollment_number=data["enrollment_number"],
            phone_number=data.get("phone_number", ""),
            chamber_address=data.get("chamber_address", ""),
            role=data.get("designation", "ASSOCIATE"),
            preferred_language=data.get("preferred_language", "en"),
            is_verified=data.get("is_verified", True),
        )

        action_type = (
            AdminAuditLog.ACTION_ADMIN_CREATED
            if is_admin_target
            else AdminAuditLog.ACTION_USER_CREATED
        )
        AdminAuditLog.log_action(
            actor=request.user,
            action=action_type,
            target_user=new_user,
            summary=(
                f"Created {target_account_role} account {new_user.username} "
                f"({data['enrollment_number']})."
            ),
            metadata={
                "account_role": target_account_role,
                "designation": data.get("designation", "ASSOCIATE"),
                "is_active": new_user.is_active,
                "is_verified": data.get("is_verified", True),
            },
            ip_address=_get_client_ip(request),
        )

        return Response(
            AdminUserSerializer(new_user).data,
            status=status.HTTP_201_CREATED,
        )


class AdminUserDetailView(APIView):
    """Retrieve administrative user details or update status, profile, and role safely."""

    permission_classes = [IsAdminRole]

    def _get_target_user(self, pk: int):
        return get_object_or_404(User.objects.select_related("advocate_profile"), pk=pk)

    def get(self, request, pk: int):
        target_user = self._get_target_user(pk)
        user_data = AdminUserSerializer(target_user).data
        assigned_cases = target_user.tracked_cases.all().order_by("-updated_at")[:50]
        user_data["assigned_cases"] = [
            {
                "id": c.id,
                "formatted_case_number": f"{c.case_type} {c.case_number}/{c.filing_year}",
                "petitioner": c.petitioner,
                "respondent": c.respondent,
                "current_stage": c.current_stage,
                "court_hall_number": c.court_hall_number,
                "next_hearing_date": c.next_hearing_date,
            }
            for c in assigned_cases
        ]
        return Response(user_data, status=status.HTTP_200_OK)

    @transaction.atomic
    def patch(self, request, pk: int):
        target_user = self._get_target_user(pk)
        serializer = AdminUserUpdateSerializer(
            data=request.data,
            partial=True,
            context={"target_user": target_user},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        current_role = get_user_role(target_user)
        target_was_admin = bool(target_user.is_staff or target_user.is_superuser)
        requested_role = data.get("account_role")
        requested_active = data.get("is_active")

        # Enforce superuser requirement for promoting/demoting or managing Admin accounts
        if requested_role is not None and requested_role != (
            ROLE_ADMIN if target_was_admin else ROLE_ADVOCATE
        ):
            if not request.user.is_superuser:
                raise PermissionDenied(
                    "Only a superuser Administrator may grant or revoke Admin roles."
                )

        if target_was_admin and requested_active is not None and not request.user.is_superuser:
            raise PermissionDenied(
                "Only a superuser Administrator may modify an Admin account's status."
            )

        # Prevent self-deactivation or self-demotion
        if target_user.pk == request.user.pk:
            if requested_active is False:
                raise ValidationError({"is_active": "You cannot deactivate your own account."})
            if requested_role == ROLE_ADVOCATE:
                raise ValidationError({"account_role": "You cannot demote your own Admin role."})

        # Prevent removing or deactivating the last active superuser / admin
        active_admins_count = User.objects.filter(
            Q(is_staff=True) | Q(is_superuser=True), is_active=True
        ).count()
        if target_was_admin and target_user.is_active:
            if (requested_active is False or requested_role == ROLE_ADVOCATE) and (
                active_admins_count <= 1
                or (
                    target_user.is_superuser
                    and User.objects.filter(is_superuser=True, is_active=True).count() <= 1
                )
            ):
                raise ValidationError(
                    {"detail": "Cannot deactivate or demote the last active Administrator."}
                )

        changes: dict[str, object] = {}
        user_fields: list[str] = []

        for field in ("first_name", "last_name", "email"):
            if field in data and getattr(target_user, field) != data[field]:
                setattr(target_user, field, data[field])
                user_fields.append(field)
                changes[field] = data[field]

        old_active = target_user.is_active
        if "is_active" in data and data["is_active"] != old_active:
            target_user.is_active = data["is_active"]
            user_fields.append("is_active")
            changes["is_active"] = {"from": old_active, "to": target_user.is_active}

        role_action = None
        if requested_role is not None:
            want_admin = requested_role == ROLE_ADMIN
            if want_admin != target_was_admin:
                target_user.is_staff = want_admin
                if not want_admin:
                    target_user.is_superuser = False
                    user_fields.append("is_superuser")
                user_fields.append("is_staff")
                changes["account_role"] = {
                    "from": ROLE_ADMIN if target_was_admin else ROLE_ADVOCATE,
                    "to": requested_role,
                }
                role_action = (
                    AdminAuditLog.ACTION_ADMIN_PROMOTED
                    if want_admin
                    else AdminAuditLog.ACTION_ROLE_CHANGED
                )

        if user_fields:
            target_user.save(update_fields=list(dict.fromkeys(user_fields)))

        profile = getattr(target_user, "advocate_profile", None)
        if profile:
            profile_fields: list[str] = []
            field_map = {
                "phone_number": "phone_number",
                "chamber_address": "chamber_address",
                "designation": "role",
                "preferred_language": "preferred_language",
                "is_verified": "is_verified",
            }
            for input_key, model_field in field_map.items():
                if input_key in data and getattr(profile, model_field) != data[input_key]:
                    setattr(profile, model_field, data[input_key])
                    profile_fields.append(model_field)
                    changes[input_key] = data[input_key]
            if profile_fields:
                profile.save(update_fields=[*profile_fields, "updated_at"])

        # Audit logging without secrets
        ip_addr = _get_client_ip(request)
        if role_action:
            AdminAuditLog.log_action(
                actor=request.user,
                action=role_action,
                target_user=target_user,
                summary=f"Changed role for {target_user.username} ({current_role} -> {requested_role}).",
                metadata=changes,
                ip_address=ip_addr,
            )
        if "is_active" in changes:
            act = (
                AdminAuditLog.ACTION_USER_ACTIVATED
                if target_user.is_active
                else AdminAuditLog.ACTION_USER_DEACTIVATED
            )
            verb = "Activated" if target_user.is_active else "Deactivated"
            AdminAuditLog.log_action(
                actor=request.user,
                action=act,
                target_user=target_user,
                summary=f"{verb} account {target_user.username}.",
                metadata=changes,
                ip_address=ip_addr,
            )
        if changes and not role_action and "is_active" not in changes:
            AdminAuditLog.log_action(
                actor=request.user,
                action=AdminAuditLog.ACTION_USER_UPDATED,
                target_user=target_user,
                summary=f"Updated user profile for {target_user.username}.",
                metadata=changes,
                ip_address=ip_addr,
            )

        target_user.refresh_from_db()
        return Response(AdminUserSerializer(target_user).data, status=status.HTTP_200_OK)


class AdminCaseListView(generics.ListAPIView):
    """List cases for assignment oversight — strictly administrative metadata only."""

    permission_classes = [IsAdminRole]
    serializer_class = AdminCaseMetadataSerializer

    def get_queryset(self):
        qs = Case.objects.prefetch_related("tracked_by", "tracked_by__advocate_profile").order_by(
            "-updated_at", "id"
        )

        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(case_number__icontains=search)
                | Q(case_type__icontains=search)
                | Q(petitioner__icontains=search)
                | Q(respondent__icontains=search)
            )

        assignment = self.request.query_params.get("assignment", "").strip().lower()
        if assignment == "unassigned":
            qs = qs.filter(tracked_by__isnull=True)
        elif assignment == "assigned":
            qs = qs.filter(tracked_by__isnull=False).distinct()

        return qs


class AdminCaseAssignView(APIView):
    """Assign, reassign, or unassign a case to an authorized active advocate."""

    permission_classes = [IsAdminRole]

    @transaction.atomic
    def post(self, request, case_id: int):
        case = get_object_or_404(Case, pk=case_id)
        advocate_id = request.data.get("advocate_id")
        action = str(request.data.get("action", "assign")).strip().lower()
        notes = str(request.data.get("notes", "") or "").strip()
        replace_advocate_id = request.data.get("replace_advocate_id")

        if action not in ("assign", "unassign"):
            raise ValidationError({"action": "Action must be either 'assign' or 'unassign'."})

        if not advocate_id:
            raise ValidationError({"advocate_id": "A valid advocate_id is required."})

        try:
            advocate = User.objects.select_related("advocate_profile").get(pk=int(advocate_id))
        except (ValueError, TypeError, User.DoesNotExist) as exc:
            raise ValidationError(
                {"advocate_id": "Specified user account does not exist."}
            ) from exc

        ip_addr = _get_client_ip(request)
        case_ref = f"{case.case_type} {case.case_number}/{case.filing_year}"

        if action == "assign":
            if not advocate.is_active:
                raise ValidationError(
                    {"advocate_id": "Cannot assign a case to an inactive account."}
                )

            replaced_user = None
            if replace_advocate_id is not None:
                try:
                    replaced_id_int = int(replace_advocate_id)
                except (ValueError, TypeError) as exc:
                    raise ValidationError(
                        {"replace_advocate_id": "Invalid replace_advocate_id."}
                    ) from exc

                if replaced_id_int != advocate.id:
                    replaced_user = case.tracked_by.filter(pk=replaced_id_int).first()
                    if replaced_user:
                        case.tracked_by.remove(replaced_user)
                        CaseAssignmentHistory.objects.create(
                            case=case,
                            advocate=replaced_user,
                            assigned_by=request.user,
                            action=CaseAssignmentHistory.ACTION_UNASSIGNED,
                            notes=notes or f"Reassigned to {advocate.username}",
                        )
                        AdminAuditLog.log_action(
                            actor=request.user,
                            action=AdminAuditLog.ACTION_CASE_UNASSIGNED,
                            target_user=replaced_user,
                            target_case=case,
                            summary=f"Unassigned {case_ref} from {replaced_user.username} during reassignment.",
                            metadata={"case_ref": case_ref, "replaced_by": advocate.id},
                            ip_address=ip_addr,
                        )

            already_assigned = case.tracked_by.filter(pk=advocate.id).exists()
            if not already_assigned:
                case.tracked_by.add(advocate)
                CaseAssignmentHistory.objects.create(
                    case=case,
                    advocate=advocate,
                    assigned_by=request.user,
                    action=CaseAssignmentHistory.ACTION_ASSIGNED,
                    notes=notes,
                )
                AdminAuditLog.log_action(
                    actor=request.user,
                    action=AdminAuditLog.ACTION_CASE_ASSIGNED,
                    target_user=advocate,
                    target_case=case,
                    summary=f"Assigned case {case_ref} to {advocate.username}.",
                    metadata={"case_ref": case_ref, "notes": notes},
                    ip_address=ip_addr,
                )

            detail_msg = (
                f"Case {case_ref} assigned to {advocate.get_full_name() or advocate.username}."
            )
        else:
            was_assigned = case.tracked_by.filter(pk=advocate.id).exists()
            if not was_assigned:
                raise ValidationError(
                    {"advocate_id": "This user is not currently assigned to the case."}
                )

            case.tracked_by.remove(advocate)
            CaseAssignmentHistory.objects.create(
                case=case,
                advocate=advocate,
                assigned_by=request.user,
                action=CaseAssignmentHistory.ACTION_UNASSIGNED,
                notes=notes,
            )
            AdminAuditLog.log_action(
                actor=request.user,
                action=AdminAuditLog.ACTION_CASE_UNASSIGNED,
                target_user=advocate,
                target_case=case,
                summary=f"Unassigned case {case_ref} from {advocate.username}.",
                metadata={"case_ref": case_ref, "notes": notes},
                ip_address=ip_addr,
            )
            detail_msg = (
                f"Case {case_ref} unassigned from {advocate.get_full_name() or advocate.username}."
            )

        case.refresh_from_db()
        return Response(
            {
                "detail": detail_msg,
                "case": AdminCaseMetadataSerializer(case).data,
            },
            status=status.HTTP_200_OK,
        )


class AdminCaseAssignmentHistoryView(generics.ListAPIView):
    """Retrieve assignment history globally or for a specific case."""

    permission_classes = [IsAdminRole]
    serializer_class = CaseAssignmentHistorySerializer

    def get_queryset(self):
        qs = CaseAssignmentHistory.objects.select_related(
            "case", "advocate", "advocate__advocate_profile", "assigned_by"
        )
        case_id = self.kwargs.get("case_id") or self.request.query_params.get("case_id")
        if case_id:
            qs = qs.filter(case_id=case_id)
        return qs


class AdminAuditLogListView(generics.ListAPIView):
    """Retrieve paginated administrative audit logs."""

    permission_classes = [IsAdminRole]
    serializer_class = AdminAuditLogSerializer

    def get_queryset(self):
        qs = AdminAuditLog.objects.select_related("actor", "target_user", "target_case")
        action = self.request.query_params.get("action", "").strip().upper()
        if action:
            qs = qs.filter(action=action)
        return qs
