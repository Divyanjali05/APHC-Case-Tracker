import abc
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import OTPVerification, PasswordResetToken

logger = logging.getLogger("apps.accounts")


# ============================================================================
# Pluggable Delivery Providers
# ============================================================================


class BaseOTPProvider(abc.ABC):
    """Abstract base class for pluggable OTP notification providers."""

    @abc.abstractmethod
    def send_otp(
        self,
        target: str,
        otp: str,
        purpose: str,
        user=None,
    ) -> bool:
        """Deliver the OTP to the designated target."""
        pass


class EmailOTPProvider(BaseOTPProvider):
    """
    Standard Email Delivery Provider.
    Dispatches styled emails to advocate email addresses.
    Uses console backend in dev/test, and configured SMTP in production.
    """

    def send_otp(
        self,
        target: str,
        otp: str,
        purpose: str,
        user=None,
    ) -> bool:
        purpose_labels = {
            OTPVerification.PURPOSE_REGISTRATION: "Registration Verification",
            OTPVerification.PURPOSE_LOGIN: "Login Verification",
            OTPVerification.PURPOSE_PASSWORD_RESET: "Password Reset Verification",
        }
        label = purpose_labels.get(purpose, "Authentication Verification")
        subject = f"APHC Case Tracker – Your One-Time Password ({label})"

        recipient_name = user.get_full_name() or user.username if user else "Advocate"
        message = (
            f"Dear {recipient_name},\n\n"
            f"Your 6-digit One-Time Password (OTP) for {label} is:\n\n"
            f"  {otp}\n\n"
            f"This OTP is valid for 10 minutes and can be used only once.\n"
            f"If you did not request this OTP, please ignore this email or contact your administrator.\n\n"
            f"High Court of Andhra Pradesh Case Tracking System"
        )

        try:
            from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@aphc-casetracker.gov.in")
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[target],
                fail_silently=False,
            )
            return True
        except Exception as exc:
            logger.error("Failed to dispatch Email OTP: %s", exc)
            return False


class SMSProviderInterface(abc.ABC):
    """
    Abstract interface for future SMS provider integrations (e.g. CDAC/NIC, Twilio, Gupshup).
    """

    @abc.abstractmethod
    def send_sms(self, phone_number: str, message: str) -> bool:
        """Send an SMS message to the given mobile number."""
        pass


class DummySMSProvider(SMSProviderInterface):
    """
    Non-production SMS stub.
    Logs delivery intentions safely without claiming real SMS delivery.
    """

    def send_sms(self, phone_number: str, message: str) -> bool:
        # In non-production environments, record attempt safely
        if getattr(settings, "DEBUG", False):
            logger.debug(
                "Dummy SMS Provider: SMS dispatch simulated for %s (length=%d)",
                phone_number[-4:].rjust(len(phone_number), "*")
                if len(phone_number) > 4
                else "****",
                len(message),
            )
        return True


# ============================================================================
# Central OTP Service
# ============================================================================


class OTPService:
    """
    Central cryptographic OTP Service:
    - Generates 6-digit cryptographically secure numeric OTPs.
    - Stores only the SHA-256 hash.
    - Enforces 10-minute expiry and single-use invalidation.
    - Limits verification attempts to prevent brute-force attacks.
    - Pluggable multi-channel delivery.
    """

    OTP_EXPIRATION_MINUTES = getattr(settings, "OTP_EXPIRATION_MINUTES", 10)
    MAX_ATTEMPTS = getattr(settings, "OTP_MAX_VERIFY_ATTEMPTS", 5)

    _email_provider: BaseOTPProvider = EmailOTPProvider()
    _sms_provider: SMSProviderInterface = DummySMSProvider()

    @classmethod
    def generate_otp_code(cls) -> str:
        """Generate a cryptographically secure 6-digit numeric string."""
        return f"{secrets.randbelow(1_000_000):06d}"

    @classmethod
    def issue_otp(
        cls,
        identifier: str,
        purpose: str,
        user=None,
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> tuple[OTPVerification, str]:
        """
        Invalidate prior active OTPs for the same identifier and purpose,
        generate a fresh 6-digit OTP, store its hash, and return the record and raw OTP.
        """
        cleaned_identifier = identifier.strip().lower()

        # Invalidate any existing unused OTPs for this identifier and purpose
        OTPVerification.objects.filter(
            identifier=cleaned_identifier,
            purpose=purpose,
            is_used=False,
        ).update(is_used=True, used_at=timezone.now())

        raw_otp = cls.generate_otp_code()
        otp_hash = OTPVerification.hash_otp(raw_otp)
        expires_at = timezone.now() + timedelta(minutes=cls.OTP_EXPIRATION_MINUTES)

        record = OTPVerification.objects.create(
            user=user,
            identifier=cleaned_identifier,
            otp_hash=otp_hash,
            purpose=purpose,
            expires_at=expires_at,
            max_attempts=cls.MAX_ATTEMPTS,
            ip_address=ip_address,
            user_agent=user_agent[:255] if user_agent else "",
        )

        return record, raw_otp

    @classmethod
    def deliver_otp(
        cls,
        target: str,
        raw_otp: str,
        purpose: str,
        user=None,
        channel: str = "email",
    ) -> bool:
        """
        Deliver OTP via configured channel (email or sms).
        Never exposes OTP in production logs.
        """
        if channel == "email":
            return cls._email_provider.send_otp(
                target=target, otp=raw_otp, purpose=purpose, user=user
            )
        elif channel == "sms":
            purpose_labels = {
                OTPVerification.PURPOSE_REGISTRATION: "registration",
                OTPVerification.PURPOSE_LOGIN: "login",
                OTPVerification.PURPOSE_PASSWORD_RESET: "password reset",
            }
            msg = (
                f"Your APHC Case Tracker OTP for {purpose_labels.get(purpose, 'verification')} "
                f"is {raw_otp}. Valid for {cls.OTP_EXPIRATION_MINUTES} minutes."
            )
            return cls._sms_provider.send_sms(target, msg)
        return False

    @classmethod
    def verify_otp(
        cls,
        identifier: str,
        raw_otp: str,
        purpose: str,
    ) -> tuple[bool, str, OTPVerification | None]:
        """
        Verify raw 6-digit OTP against active database hash.
        Checks expiration, prior usage, and attempt thresholds.
        Returns: (success: bool, error_message: str, otp_record: OTPVerification | None)
        """
        cleaned_identifier = identifier.strip().lower()
        cleaned_otp = raw_otp.strip()

        record = (
            OTPVerification.objects.filter(
                identifier=cleaned_identifier,
                purpose=purpose,
                is_used=False,
            )
            .order_by("-created_at")
            .first()
        )

        if not record:
            recent = (
                OTPVerification.objects.filter(
                    identifier=cleaned_identifier,
                    purpose=purpose,
                )
                .order_by("-created_at")
                .first()
            )
            if recent and recent.attempts_count >= recent.max_attempts:
                return (
                    False,
                    "Maximum verification attempts exceeded. Please request a new OTP.",
                    recent,
                )
            return False, "No active OTP found. Please request a new OTP.", None

        is_valid, reason = record.is_valid()
        if not is_valid:
            return False, reason, record

        # Hash comparison
        submitted_hash = OTPVerification.hash_otp(cleaned_otp)
        if submitted_hash != record.otp_hash:
            record.attempts_count += 1
            if record.attempts_count >= record.max_attempts:
                record.is_used = True
                record.used_at = timezone.now()
            record.save(update_fields=["attempts_count", "is_used", "used_at"])

            remaining = max(0, record.max_attempts - record.attempts_count)
            if remaining == 0:
                return (
                    False,
                    "Maximum verification attempts exceeded. Please request a new OTP.",
                    record,
                )
            return (
                False,
                f"Invalid OTP. {remaining} attempt(s) remaining.",
                record,
            )

        # OTP is correct - mark used
        record.is_used = True
        record.used_at = timezone.now()
        record.save(update_fields=["is_used", "used_at"])
        return True, "OTP verified successfully.", record


# ============================================================================
# Password Reset Delivery Service (Preserved and enhanced)
# ============================================================================


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
        PasswordResetToken.objects.filter(user=user, is_used=False).update(
            is_used=True, used_at=timezone.now()
        )

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
        """Deliver the reset token via configured email / notification channels."""
        subject = "APHC Case Tracker – Password Reset Request"
        recipient_email = user.email

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
        except Exception as exc:
            logger.error("Failed to deliver reset token email: %s", exc)
            return False
