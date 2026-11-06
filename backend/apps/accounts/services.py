import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import PasswordResetToken


class PasswordResetDeliveryService:
    """Service handling secure generation, hashing, and dispatch of password reset tokens."""

    TOKEN_EXPIRATION_MINUTES = getattr(settings, "PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES", 15)

    @classmethod
    def create_reset_token(
        cls,
        user,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> tuple[PasswordResetToken, str]:
        """Generate a cryptographically secure token, store only its hash, and invalidate prior tokens."""
        # Invalidate existing unused reset tokens for this user
        PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)

        raw_token = secrets.token_urlsafe(32)
        token_hash = PasswordResetToken.hash_token(raw_token)
        expires_at = timezone.now() + timedelta(minutes=cls.TOKEN_EXPIRATION_MINUTES)

        token_record = PasswordResetToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent[:255] if user_agent else "",
        )

        return token_record, raw_token

    @classmethod
    def deliver_reset_token(cls, user, raw_token: str) -> bool:
        """Deliver the reset token via configured email / SMS channels without leaking secrets."""
        subject = "APHC Case Tracker – Password Reset Request"
        recipient_email = user.email

        # If user email is not set, use a fallback notification target or log notice
        if not recipient_email and hasattr(user, "advocate_profile"):
            recipient_email = f"{user.username}@barcouncil.ap.gov.in"

        message = (
            f"Dear Advocate {user.get_full_name() or user.username},\n\n"
            f"A password reset request was received for your APHC Case Tracker account.\n"
            f"Your single-use password reset token is:\n\n"
            f"  {raw_token}\n\n"
            f"This token will expire in {cls.TOKEN_EXPIRATION_MINUTES} minutes.\n"
            f"If you did not request this, please disregard this notice and notify your bar association.\n\n"
            f"High Court of Andhra Pradesh Case Tracking System"
        )

        try:
            from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@aphc-casetracker.gov.in")
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[recipient_email] if recipient_email else [],
                fail_silently=True,
            )
            return True
        except Exception:
            return False
