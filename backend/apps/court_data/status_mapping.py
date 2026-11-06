"""Status mapping and normalization engine for court listings and live token alerts.

Ensures safe normalization of source court registry statuses to standardized internal states
without loss of original source data or silent misclassification.
"""

from __future__ import annotations


class NormalizedCourtStatus:
    NOT_LISTED = "NOT_LISTED"
    LISTED = "LISTED"
    TOKEN_ALLOCATED = "TOKEN_ALLOCATED"
    WAITING = "WAITING"
    IN_PROGRESS = "IN_PROGRESS"
    CALLED = "CALLED"
    COMPLETED = "COMPLETED"
    ADJOURNED = "ADJOURNED"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"

    CHOICES = (
        (NOT_LISTED, "Not Listed"),
        (LISTED, "Listed on Cause List"),
        (TOKEN_ALLOCATED, "Token Allocated"),
        (WAITING, "Waiting in Hall Queue"),
        (IN_PROGRESS, "Proceedings In Progress"),
        (CALLED, "Matter Called by Court"),
        (COMPLETED, "Hearing Completed"),
        (ADJOURNED, "Adjourned to Next Date"),
        (CANCELLED, "Listing Cancelled / Struck Off"),
        (UNKNOWN, "Unknown Source Status"),
    )

    ALL_STATUSES = {
        NOT_LISTED,
        LISTED,
        TOKEN_ALLOCATED,
        WAITING,
        IN_PROGRESS,
        CALLED,
        COMPLETED,
        ADJOURNED,
        CANCELLED,
        UNKNOWN,
    }


# Normalized dictionary mapping known source terminology (case-insensitive) to normalized statuses
SOURCE_STATUS_MAPPINGS: dict[str, str] = {
    # Not listed variations
    "not_listed": NormalizedCourtStatus.NOT_LISTED,
    "unlisted": NormalizedCourtStatus.NOT_LISTED,
    "not listed": NormalizedCourtStatus.NOT_LISTED,
    "not in cause list": NormalizedCourtStatus.NOT_LISTED,
    "none": NormalizedCourtStatus.NOT_LISTED,
    # Listed variations
    "listed": NormalizedCourtStatus.LISTED,
    "cause_list": NormalizedCourtStatus.LISTED,
    "cause list": NormalizedCourtStatus.LISTED,
    "scheduled": NormalizedCourtStatus.LISTED,
    "daily_list": NormalizedCourtStatus.LISTED,
    "motion_hearing": NormalizedCourtStatus.LISTED,
    "admission": NormalizedCourtStatus.LISTED,
    "regular_hearing": NormalizedCourtStatus.LISTED,
    # Token allocated variations
    "token_allocated": NormalizedCourtStatus.TOKEN_ALLOCATED,
    "token allocated": NormalizedCourtStatus.TOKEN_ALLOCATED,
    "item_allocated": NormalizedCourtStatus.TOKEN_ALLOCATED,
    "token_issued": NormalizedCourtStatus.TOKEN_ALLOCATED,
    "allocated": NormalizedCourtStatus.TOKEN_ALLOCATED,
    # Waiting in queue
    "waiting": NormalizedCourtStatus.WAITING,
    "in_queue": NormalizedCourtStatus.WAITING,
    "pending_call": NormalizedCourtStatus.WAITING,
    "queue": NormalizedCourtStatus.WAITING,
    # Matter called
    "called": NormalizedCourtStatus.CALLED,
    "matter_called": NormalizedCourtStatus.CALLED,
    "called_on": NormalizedCourtStatus.CALLED,
    "active_call": NormalizedCourtStatus.CALLED,
    # In progress / hearing currently underway
    "in_progress": NormalizedCourtStatus.IN_PROGRESS,
    "in progress": NormalizedCourtStatus.IN_PROGRESS,
    "hearing": NormalizedCourtStatus.IN_PROGRESS,
    "under_hearing": NormalizedCourtStatus.IN_PROGRESS,
    "arguments_underway": NormalizedCourtStatus.IN_PROGRESS,
    "ongoing": NormalizedCourtStatus.IN_PROGRESS,
    # Completed
    "completed": NormalizedCourtStatus.COMPLETED,
    "disposed": NormalizedCourtStatus.COMPLETED,
    "passed": NormalizedCourtStatus.COMPLETED,
    "heard": NormalizedCourtStatus.COMPLETED,
    "concluded": NormalizedCourtStatus.COMPLETED,
    # Adjourned
    "adjourned": NormalizedCourtStatus.ADJOURNED,
    "posted": NormalizedCourtStatus.ADJOURNED,
    "deferred": NormalizedCourtStatus.ADJOURNED,
    "pass_over": NormalizedCourtStatus.ADJOURNED,
    "passed_over": NormalizedCourtStatus.ADJOURNED,
    # Cancelled
    "cancelled": NormalizedCourtStatus.CANCELLED,
    "deleted": NormalizedCourtStatus.CANCELLED,
    "struck_off": NormalizedCourtStatus.CANCELLED,
    "withdrawn": NormalizedCourtStatus.CANCELLED,
}


def normalize_source_status(source_status: str | None) -> tuple[str, bool]:
    """Normalize a raw source status string from a court registry provider.

    Returns:
        tuple[str, bool]: (normalized_status, is_recognized)
        - If recognized, returns corresponding normalized status and True.
        - If unknown or empty, returns NormalizedCourtStatus.UNKNOWN and False.
          Never silently maps an unknown status to an incorrect state.
    """
    if not source_status or not source_status.strip():
        return NormalizedCourtStatus.UNKNOWN, False

    cleaned = source_status.strip().lower()

    # Direct match in mapping
    if cleaned in SOURCE_STATUS_MAPPINGS:
        return SOURCE_STATUS_MAPPINGS[cleaned], True

    # If the string directly matches a normalized status name (case-insensitive)
    upper_cleaned = cleaned.upper().replace(" ", "_")
    if upper_cleaned in NormalizedCourtStatus.ALL_STATUSES:
        return upper_cleaned, True

    # Unknown source status: preserve safely, flag as unrecognized
    return NormalizedCourtStatus.UNKNOWN, False


def is_meaningful_status_transition(
    old_status: str | None,
    new_status: str,
) -> bool:
    """Determine if a status change represents a meaningful legal or operational transition.

    Examples of meaningful transitions:
    - Initial observation (old_status is None and new_status is not NOT_LISTED/UNKNOWN)
    - NOT_LISTED -> LISTED
    - LISTED -> TOKEN_ALLOCATED / WAITING / CALLED / ADJOURNED
    - WAITING -> CALLED / IN_PROGRESS / ADJOURNED
    - CALLED -> IN_PROGRESS
    - IN_PROGRESS -> COMPLETED / ADJOURNED
    - Any active status -> ADJOURNED / CANCELLED

    Identical statuses (old == new) or transitions between NOT_LISTED and UNKNOWN
    are not meaningful and do not warrant advocate alerts.
    """
    if old_status == new_status:
        return False

    # First observation is meaningful if the case is active or listed
    if old_status is None:
        return new_status not in (
            NormalizedCourtStatus.NOT_LISTED,
            NormalizedCourtStatus.UNKNOWN,
        )

    # Transitions between empty/unknown/not listed states are administrative noise
    noise_statuses = {NormalizedCourtStatus.NOT_LISTED, NormalizedCourtStatus.UNKNOWN}
    if old_status in noise_statuses and new_status in noise_statuses:
        return False

    return True


def get_status_display_label(status: str) -> str:
    """Return human-readable display string for normalized status."""
    for code, label in NormalizedCourtStatus.CHOICES:
        if code == status:
            return label
    return "Unknown Status"
