class APHCIntegrationError(Exception):
    """Base exception for all APHC external integration failures."""


class APHCPortalTimeout(APHCIntegrationError):
    """Raised when APHC public portal or scraper times out."""


class APHCCaseNotFound(APHCIntegrationError):
    """Raised when query returns zero records on official portal."""
