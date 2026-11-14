"""Speech-to-Text provider abstraction and implementations.

Supports:
- Pluggable provider interface (SpeechToTextProvider)
- High-fidelity Mock provider with realistic High Court legal dictations in EN, TE, HI
- Explicit is_mock transparency
- Google Cloud Speech-to-Text client stub / adapter
- Runtime provider override for testing
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass
class SpeechToTextResult:
    """Standardized result returned by all Speech-to-Text providers."""

    transcript: str
    language: str
    confidence: float
    provider: str
    is_mock: bool
    raw_response: dict[str, Any] = field(default_factory=dict)


class SpeechToTextProvider(ABC):
    """Abstract base class for all STT providers."""

    @abstractmethod
    def transcribe(self, audio_file_path: str, language: str = "en") -> SpeechToTextResult:
        """Transcribe an audio file at the given local file path into text."""
        raise NotImplementedError


class MockSpeechToTextProvider(SpeechToTextProvider):
    """Deterministic mock STT provider tailored for Andhra Pradesh High Court proceedings.

    Produces realistic advocate arguments and notes in English, Telugu, and Hindi
    with explicit is_mock=True.
    """

    MOCK_TRANSCRIPTS: dict[str, str] = {
        "en": (
            "May it please your Lordship, I appear on behalf of the petitioner in this matter. "
            "The impugned proceedings issued by the respondent authorities are ex-facie arbitrary, "
            "contrary to the principles of natural justice, and violative of Articles 14 and 21 of the "
            "Constitution of India. We respectfully pray for an ad-interim stay of all further "
            "coercive actions pending disposal of the present writ petition."
        ),
        "te": (
            "ఘనత వహించిన న్యాయమూర్తి గారికి విన్నపం. ఈ కేసులో పిటిషనర్ తరపున నేను హాజరవుతున్నాను. "
            "ప్రతివాదులు ఎటువంటి చట్టబద్ధమైన నోటీసు ఇవ్వకుండా చేపట్టిన చర్యలు సహజ న్యాయ సూత్రాలకు "
            "మరియు రాజ్యాంగంలోని 14, 21 అధికరణలకు విరుద్ధం. కావున తదుపరి చర్యలన్నింటినీ నిలిపివేస్తూ "
            "మధ్యంతర స్టే ఉత్తర్వులు జారీ చేయవలసిందిగా ప్రార్థిస్తున్నాము."
        ),
        "hi": (
            "माननीय उच्च न्यायालय के समक्ष निवेदन है। याचिकाकर्ता की ओर से उपस्थित होकर निवेदन करता हूं "
            "कि प्रतिवादी प्राधिकारियों द्वारा पारित आक्षेपित आदेश प्राकृतिक न्याय के सिद्धांतों के पूर्णतः "
            "विपरीत और मनमाना है। अतः इस याचिका के अंतिम निस्तारण तक अंतरिम स्थगन आदेश प्रदान करने की कृपा करें।"
        ),
    }

    def __init__(self, should_fail: bool = False, failure_reason: str = "Mock STT failure simulation") -> None:
        self.should_fail = should_fail
        self.failure_reason = failure_reason

    def transcribe(self, audio_file_path: str, language: str = "en") -> SpeechToTextResult:
        if self.should_fail:
            raise RuntimeError(self.failure_reason)

        normalized_lang = (language or "en").lower().strip()
        transcript = self.MOCK_TRANSCRIPTS.get(normalized_lang, self.MOCK_TRANSCRIPTS["en"])

        logger.info(
            "MockSpeechToTextProvider transcribed audio '%s' in '%s'",
            audio_file_path,
            normalized_lang,
        )

        return SpeechToTextResult(
            transcript=transcript,
            language=normalized_lang,
            confidence=0.94,
            provider="MOCK_STT_PROVIDER",
            is_mock=True,
            raw_response={
                "engine": "mock-aphc-stt-v1",
                "audio_path": audio_file_path,
                "confidence_score": 0.94,
            },
        )


class GoogleCloudSpeechToTextProvider(SpeechToTextProvider):
    """Google Cloud Speech-to-Text provider."""

    def __init__(self) -> None:
        self.credentials_path = getattr(settings, "GOOGLE_CLOUD_SPEECH_CREDENTIALS", "")

    def transcribe(self, audio_file_path: str, language: str = "en") -> SpeechToTextResult:
        if not self.credentials_path:
            raise RuntimeError(
                "Google Cloud Speech-to-Text credentials are not configured. "
                "Set GOOGLE_CLOUD_SPEECH_CREDENTIALS in settings or environment."
            )

        # In production with google-cloud-speech package installed:
        # from google.cloud import speech_v1p1beta1 as speech
        # client = speech.SpeechClient.from_service_account_json(self.credentials_path)
        # ...
        raise NotImplementedError("Live Google Cloud Speech-to-Text provider integration pending credentials.")


# Global singleton override for testing
_provider_override: SpeechToTextProvider | None = None


def set_speech_to_text_provider_override(provider: SpeechToTextProvider | None) -> None:
    """Set or reset an explicit STT provider override (used for test isolation)."""
    global _provider_override
    _provider_override = provider


def get_speech_to_text_provider() -> SpeechToTextProvider:
    """Factory returning the active Speech-to-Text provider."""
    if _provider_override is not None:
        return _provider_override

    provider_name = getattr(settings, "SPEECH_TO_TEXT_PROVIDER", "MOCK_STT_PROVIDER")
    if provider_name == "GOOGLE_CLOUD_SPEECH_TO_TEXT":
        return GoogleCloudSpeechToTextProvider()

    return MockSpeechToTextProvider()

