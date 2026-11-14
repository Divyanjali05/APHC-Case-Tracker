import json
import logging
import time

from django.http import StreamingHttpResponse
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import DeviceRegistration, NotificationHistory
from .realtime import RealtimeService
from .serializers import (
    DeviceDeactivationSerializer,
    DeviceRegistrationSerializer,
    NotificationHistorySerializer,
    RealtimeEventSerializer,
)
from .services import NotificationService

logger = logging.getLogger(__name__)


class DeviceRegistrationView(generics.ListCreateAPIView):
    """Register or rotate mobile push notification token, or list active devices."""

    serializer_class = DeviceRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return DeviceRegistration.objects.filter(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["expo_push_token"]
        existing = DeviceRegistration.objects.filter(expo_push_token=token).first()
        if existing is not None and existing.user_id != request.user.id:
            raise PermissionDenied("This device push token is already registered to another user.")

        device = NotificationService.register_device(
            user=request.user,
            expo_push_token=token,
            platform=serializer.validated_data.get("platform", "android"),
            device_id=serializer.validated_data.get("device_id", ""),
            app_version=serializer.validated_data.get("app_version", ""),
            device_name=serializer.validated_data.get("device_name", ""),
        )
        return Response(
            DeviceRegistrationSerializer(device).data,
            status=status.HTTP_200_OK if existing is not None else status.HTTP_201_CREATED,
        )


class DeviceDeactivationView(APIView):
    """Deactivate one or all registered push devices upon logout."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DeviceDeactivationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        count = NotificationService.deactivate_device(
            user=request.user,
            expo_push_token=serializer.validated_data.get("expo_push_token"),
            device_id=serializer.validated_data.get("device_id"),
            all_devices=serializer.validated_data.get("all", False),
        )
        return Response({"deactivated_count": count}, status=status.HTTP_200_OK)


class NotificationHistoryListView(generics.ListAPIView):
    """List notification history for authenticated advocate with category and read status filtering."""

    serializer_class = NotificationHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = NotificationHistory.objects.filter(user=self.request.user)

        category = self.request.query_params.get("category", "").strip()
        if category:
            queryset = queryset.filter(category__iexact=category)

        is_read_param = self.request.query_params.get("is_read")
        if is_read_param is not None:
            if is_read_param.lower() in ("true", "1"):
                queryset = queryset.filter(is_read=True)
            elif is_read_param.lower() in ("false", "0"):
                queryset = queryset.filter(is_read=False)

        case_id = self.request.query_params.get("case_id")
        if case_id:
            try:
                queryset = queryset.filter(data_payload__case_id=int(case_id))
            except (ValueError, TypeError):
                pass

        return queryset


class NotificationUnreadCountView(APIView):
    """Return count of unread notifications for the authenticated advocate."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        unread_count = NotificationHistory.objects.filter(
            user=request.user,
            is_read=False,
        ).count()
        return Response({"unread_count": unread_count}, status=status.HTTP_200_OK)


class NotificationMarkReadView(APIView):
    """Mark a specific notification as read for the authenticated advocate."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            notification = NotificationHistory.objects.get(pk=pk, user=request.user)
        except NotificationHistory.DoesNotExist:
            return Response(
                {"detail": "Notification not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
            unread_count = NotificationHistory.objects.filter(
                user=request.user, is_read=False
            ).count()
            RealtimeService.publish_notification_read(request.user, [notification.id], unread_count)

        serializer = NotificationHistorySerializer(notification)
        return Response(serializer.data, status=status.HTTP_200_OK)


class NotificationMarkAllReadView(APIView):
    """Mark all unread notifications as read for the authenticated advocate."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        category = request.data.get("category") or request.query_params.get("category", "").strip()
        queryset = NotificationHistory.objects.filter(user=request.user, is_read=False)
        if category:
            queryset = queryset.filter(category__iexact=category)

        read_ids = list(queryset.values_list("id", flat=True))
        count = queryset.update(is_read=True)
        unread_count = NotificationHistory.objects.filter(user=request.user, is_read=False).count()
        RealtimeService.publish_notification_read(request.user, read_ids, unread_count)
        return Response({"marked_read_count": count}, status=status.HTTP_200_OK)


class RealtimeTicketView(APIView):
    """Issue a short-lived, single-use stream ticket for establishing an SSE connection."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ticket = RealtimeService.generate_stream_ticket(request.user)
        return Response(
            {
                "ticket": ticket,
                "expires_in": RealtimeService.STREAM_TICKET_TTL_SECONDS,
            },
            status=status.HTTP_201_CREATED,
        )


class RealtimeEventsView(APIView):
    """Delta sync endpoint for recovering missed real-time events."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        since_id = 0
        try:
            since_id = max(0, int(request.query_params.get("since_id", 0)))
        except (ValueError, TypeError):
            pass

        limit = 50
        try:
            limit = min(200, max(1, int(request.query_params.get("limit", 50))))
        except (ValueError, TypeError):
            pass

        oldest_id = RealtimeService.get_oldest_event_id(request.user)
        cursor_expired = bool(since_id > 0 and oldest_id and since_id < oldest_id)

        events = RealtimeService.get_events_since(
            user=request.user,
            since_id=since_id,
            limit=limit,
        )
        latest_id = RealtimeService.get_latest_event_id(request.user)

        serializer = RealtimeEventSerializer(events, many=True)
        return Response(
            {
                "events": serializer.data,
                "latest_event_id": latest_id,
                "count": len(events),
                "since_id": since_id,
                "has_more": latest_id > (events[-1].id if events else since_id),
                "cursor_expired": cursor_expired,
                "requires_full_sync": cursor_expired,
            },
            status=status.HTTP_200_OK,
        )


class RealtimeStreamView(APIView):
    """Server-Sent Events (SSE) streaming endpoint for authenticated advocates."""

    permission_classes = [permissions.AllowAny]

    def get_user_from_request(self, request):
        if request.user and request.user.is_authenticated:
            return request.user

        header_auth = JWTAuthentication()
        try:
            header = header_auth.get_header(request)
            if header is not None:
                raw_token = header_auth.get_raw_token(header)
                if raw_token is not None:
                    validated_token = header_auth.get_validated_token(raw_token)
                    return header_auth.get_user(validated_token)
        except Exception:
            pass

        ticket = request.query_params.get("ticket")
        if ticket:
            user = RealtimeService.consume_stream_ticket(ticket)
            if user and user.is_authenticated:
                return user

        return None

    def get(self, request):
        user = self.get_user_from_request(request)
        if not user or not user.is_authenticated:
            return Response(
                {"detail": "Authentication credentials were not provided or invalid."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        since_id_header = request.headers.get("Last-Event-ID") or request.META.get(
            "HTTP_LAST_EVENT_ID"
        )
        since_id_param = request.query_params.get("since_id")
        since_id = 0
        if since_id_param:
            try:
                since_id = max(0, int(since_id_param))
            except ValueError:
                pass
        elif since_id_header:
            try:
                since_id = max(0, int(since_id_header))
            except ValueError:
                pass

        max_duration = int(request.query_params.get("max_duration", 60))

        def event_stream():
            cursor = since_id
            initial_events = RealtimeService.get_events_since(user=user, since_id=cursor, limit=100)
            for ev in initial_events:
                cursor = max(cursor, ev.id)
                yield RealtimeService.format_sse_frame(ev)

            yield RealtimeService.format_sse_ping()

            start_time = time.time()
            redis_client = RealtimeService.get_redis_client()
            pubsub = None
            if redis_client:
                try:
                    pubsub = redis_client.pubsub()
                    pubsub.subscribe(f"realtime:user:{user.id}")
                except Exception as exc:
                    logger.debug("Redis pubsub subscription failed: %s", exc)
                    pubsub = None

            last_ping = time.time()
            last_recovery_check = time.time()
            try:
                while time.time() - start_time < max_duration:
                    if pubsub:
                        try:
                            msg = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                            if msg and msg.get("type") == "message":
                                raw_data = msg.get("data")
                                if isinstance(raw_data, bytes):
                                    raw_data = raw_data.decode("utf-8")
                                parsed = json.loads(raw_data)
                                cursor = max(cursor, parsed.get("id", cursor))
                                yield (
                                    f"id: {parsed.get('id')}\n"
                                    f"event: {parsed.get('event_type')}\n"
                                    f"data: {raw_data}\n\n"
                                )
                        except Exception as exc:
                            logger.warning(
                                "Redis pubsub disconnected during SSE stream: %s. Falling back to DB polling.",
                                exc,
                            )
                            try:
                                pubsub.close()
                            except Exception:
                                pass
                            pubsub = None
                    else:
                        new_events = RealtimeService.get_events_since(
                            user=user, since_id=cursor, limit=20
                        )
                        for ev in new_events:
                            cursor = max(cursor, ev.id)
                            yield RealtimeService.format_sse_frame(ev)
                        time.sleep(1.0)

                        now = time.time()
                        if now - last_recovery_check >= 15.0:
                            last_recovery_check = now
                            RealtimeService._redis_is_available = False
                            RealtimeService._redis_last_check = 0.0
                            recovered_client = RealtimeService.get_redis_client()
                            if recovered_client:
                                try:
                                    new_pubsub = recovered_client.pubsub()
                                    new_pubsub.subscribe(f"realtime:user:{user.id}")
                                    catchup = RealtimeService.get_events_since(
                                        user=user, since_id=cursor, limit=50
                                    )
                                    for ev in catchup:
                                        cursor = max(cursor, ev.id)
                                        yield RealtimeService.format_sse_frame(ev)
                                    pubsub = new_pubsub
                                    logger.info(
                                        "Redis pubsub recovered and resubscribed for user %s",
                                        user.id,
                                    )
                                except Exception as resub_exc:
                                    logger.debug("Redis resubscribe attempt failed: %s", resub_exc)
                                    pubsub = None

                    now = time.time()
                    if now - last_ping >= 15.0:
                        yield RealtimeService.format_sse_ping()
                        last_ping = now
            finally:
                if pubsub:
                    try:
                        pubsub.unsubscribe()
                        pubsub.close()
                    except Exception:
                        pass

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class RealtimeStatusView(APIView):
    """Health check and readiness status for real-time streaming."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        redis_client = RealtimeService.get_redis_client()
        redis_connected = False
        if redis_client:
            try:
                redis_connected = bool(redis_client.ping())
            except Exception:
                redis_connected = False

        latest_id = RealtimeService.get_latest_event_id(request.user)
        return Response(
            {
                "status": "ready",
                "redis_connected": redis_connected,
                "latest_event_id": latest_id,
                "streaming_supported": True,
            },
            status=status.HTTP_200_OK,
        )


class NotificationsStatusView(APIView):
    """Health / readiness probe for notifications app."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "app": "notifications",
                "status": "ready",
                "description": "Push Notifications, Real-Time Sync & Devices",
            },
            status=status.HTTP_200_OK,
        )
