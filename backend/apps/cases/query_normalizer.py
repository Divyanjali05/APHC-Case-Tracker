"""Multilingual Voice Query Normalizer for Telugu, Hindi, and English legal queries.

Features:
1. Converts Indic numerals (Telugu: ౦-౯, Devanagari: ०-९) to ASCII digits (0-9).
2. Maps spoken vernacular case types (e.g., "రిట్ పిటిషన్", "रिट याचिका") to canonical APHC codes.
3. Cleans spoken connectors ("బై", "of", "साल", "యొక్క") and noise words ("కేసు నంబర్", "केस नंबर").
4. Generates search filter expressions for flexible matching across case dockets.
"""

import re
from typing import Any

TELUGU_DIGITS = {
    "౦": "0",
    "౧": "1",
    "౨": "2",
    "౩": "3",
    "౪": "4",
    "౫": "5",
    "౬": "6",
    "౭": "7",
    "౮": "8",
    "౯": "9",
}

DEVANAGARI_DIGITS = {
    "०": "0",
    "१": "1",
    "२": "2",
    "३": "3",
    "४": "4",
    "५": "5",
    "६": "6",
    "७": "7",
    "८": "8",
    "९": "9",
}

CASE_TYPE_SYNONYMS = {
    # Writ Petition (WP)
    "writ petition": "WP",
    "writ petitions": "WP",
    "రిట్ పిటిషన్": "WP",
    "రిట్ పిటీషన్": "WP",
    "రిట్": "WP",
    "रिट याचिका": "WP",
    "रिट पिटीशन": "WP",
    "रिट": "WP",
    # Writ Appeal (WA)
    "writ appeal": "WA",
    "రిట్ అప్పీల్": "WA",
    "రిట్ అప్పీలు": "WA",
    "रिट अपील": "WA",
    # Criminal Petition (CRLP)
    "criminal petition": "CRLP",
    "క్రిమినల్ పిటిషన్": "CRLP",
    "క్రిమినల్ పిటీషన్": "CRLP",
    "आपराधिक याचिका": "CRLP",
    "क्रिमिनल पिटीशन": "CRLP",
    # Civil Revision Petition (CRP)
    "civil revision petition": "CRP",
    "civil revision": "CRP",
    "సివిల్ రివిజన్ పిటిషన్": "CRP",
    "సివిల్ రివిజన్": "CRP",
    "सिविल रिवीजन याचिका": "CRP",
    "सिविल रिवीजन": "CRP",
    # Contempt Case (CC)
    "contempt case": "CC",
    "contempt": "CC",
    "కంటెంప్ట్ కేసు": "CC",
    "ధిక్కార కేసు": "CC",
    "కంటెంప్ట్": "CC",
    "अवमानना वाद": "CC",
    "अवमानना मामला": "CC",
    "कंटेम्प्ट केस": "CC",
    # Election Petition (EP)
    "election petition": "EP",
    "ఎన్నికల పిటిషన్": "EP",
    "चुनाव याचिका": "EP",
    # Motor Accident Civil Misc Appeal (MACMA)
    "motor accident": "MACMA",
    "macma": "MACMA",
    "మోటార్ యాక్సిడెంట్": "MACMA",
    "मोटर दुर्घटना अपील": "MACMA",
}


def convert_indic_numerals_py(text: str) -> tuple[str, bool]:
    """Converts Telugu and Devanagari numerals to ASCII digits."""
    has_indic = False
    result_chars = []
    for char in text:
        if char in TELUGU_DIGITS:
            result_chars.append(TELUGU_DIGITS[char])
            has_indic = True
        elif char in DEVANAGARI_DIGITS:
            result_chars.append(DEVANAGARI_DIGITS[char])
            has_indic = True
        else:
            result_chars.append(char)
    return "".join(result_chars), has_indic


def detect_language(text: str) -> str:
    """Detects whether text has Telugu, Devanagari (Hindi), or English script."""
    if re.search(r"[\u0C00-\u0C7F]", text):
        return "te"
    if re.search(r"[\u0900-\u097F]", text):
        return "hi"
    return "en"


def normalize_voice_query_py(raw_query: str) -> dict[str, Any]:
    """Normalizes spoken multilingual query string into structured metadata and search terms."""
    if not raw_query or not isinstance(raw_query, str):
        return {
            "raw": "",
            "normalized": "",
            "case_type": None,
            "case_number": None,
            "filing_year": None,
            "keywords": [],
            "has_indic_numerals": False,
            "detected_language": "en",
        }

    raw = raw_query.strip()
    if not raw:
        return {
            "raw": "",
            "normalized": "",
            "case_type": None,
            "case_number": None,
            "filing_year": None,
            "keywords": [],
            "has_indic_numerals": False,
            "detected_language": "en",
        }

    detected_lang = detect_language(raw)

    # 1. Convert Indic numerals to ASCII digits
    ascii_text, has_indic = convert_indic_numerals_py(raw)
    processed = ascii_text

    # 2. Case Type Aliases (sorted by length descending for longest match)
    matched_case_type: str | None = None
    sorted_synonyms = sorted(CASE_TYPE_SYNONYMS.keys(), key=len, reverse=True)

    for synonym in sorted_synonyms:
        pattern = re.compile(rf"(^|\s){re.escape(synonym)}(\s|$|[0-9])", re.IGNORECASE)
        if pattern.search(processed):
            matched_case_type = CASE_TYPE_SYNONYMS[synonym]
            processed = pattern.sub(rf"\g<1>{matched_case_type} \g<2>", processed)
            break

    # 3. Clean spoken number prefixes
    processed = re.sub(
        r"(?:number|no\.?|నంబర్|నంబరు?|నెంబర్|నెంబరు?|नंबर|संख्या)\s*([0-9]+)",
        r"\1",
        processed,
        flags=re.IGNORECASE,
    )

    # 4. Clean spoken slash/year connectors
    processed = re.sub(
        r"([0-9]+)\s*(?:of|by|slash|/|బై|యొక్క|సంవత్సరం|వత్సరం|साल|वर्ष)\s*([0-9]{4})",
        r"\1/\2",
        processed,
        flags=re.IGNORECASE,
    )

    # 5. Clean spoken versus
    processed = re.sub(r"\s*(?:వర్సెస్|ఎదిరి|बनाम|versus)\s*", " vs ", processed, flags=re.IGNORECASE)

    # 6. Strip conversational search prefixes
    processed = re.sub(
        r"^(?:search\s+for|find\s+case|find|show\s+case|కేసు\s+శోధించండి|కేస్\s+చూపించు|కేస్\s+వెతకండి|కేస్\s+శోధన|केस\s+खोजें|खोजें)\s+",
        "",
        processed,
        flags=re.IGNORECASE,
    )

    # 7. Normalize whitespace and punctuation (clean punctuation and symbols while preserving Indic matras and scripts)
    processed = re.sub(
        r"[\!\"\#\$\%\&\'\(\)\*\+\,\-\.\:\;\<\=\>\?\@\[\\\]\^\`\{\|\}\~]+", " ", processed
    )
    processed = re.sub(r"\s+", " ", processed).strip()

    # 8. Extract structured tokens
    case_number: str | None = None
    filing_year: int | None = None

    case_match = re.search(r"\b([A-Za-z]{2,6})\s+([0-9]+)(?:/([0-9]{4}))?\b", processed)
    if case_match:
        if not matched_case_type:
            matched_case_type = case_match.group(1).upper()
        case_number = case_match.group(2)
        if case_match.group(3):
            filing_year = int(case_match.group(3))
    else:
        num_year_match = re.search(r"\b([0-9]+)/([0-9]{4})\b", processed)
        if num_year_match:
            case_number = num_year_match.group(1)
            filing_year = int(num_year_match.group(2))
        else:
            num_only_match = re.search(r"\b([0-9]+)\b", processed)
            if num_only_match:
                case_number = num_only_match.group(1)

    # Tokenize for multi-word keyword filtering
    tokens = [t for t in processed.split(" ") if t and t.lower() not in ("vs", "and", "or", "&")]

    return {
        "raw": raw,
        "normalized": processed,
        "case_type": matched_case_type,
        "case_number": case_number,
        "filing_year": filing_year,
        "keywords": tokens,
        "has_indic_numerals": has_indic,
        "detected_language": detected_lang,
    }
