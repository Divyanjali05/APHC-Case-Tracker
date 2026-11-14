"""Unit tests for Multilingual Voice Query Normalization (Telugu, Hindi, and English)."""

from apps.cases.query_normalizer import (
    convert_indic_numerals_py,
    detect_language,
    normalize_voice_query_py,
)


class TestMultilingualIndicNumerals:
    """Test Telugu and Devanagari numeral conversions to ASCII."""

    def test_telugu_digits_conversion(self):
        text = "రిట్ ౧౨౩౪/౨౦౨౪"
        converted, has_indic = convert_indic_numerals_py(text)
        assert has_indic is True
        assert "1234/2024" in converted

    def test_devanagari_digits_conversion(self):
        text = "केस १२३४/२०२४"
        converted, has_indic = convert_indic_numerals_py(text)
        assert has_indic is True
        assert "1234/2024" in converted

    def test_ascii_digits_unmodified(self):
        text = "WP 1234/2024"
        converted, has_indic = convert_indic_numerals_py(text)
        assert has_indic is False
        assert converted == "WP 1234/2024"

    def test_all_telugu_digits(self):
        all_telugu = "౦౧౨౩౪౫౬౭౮౯"
        converted, has_indic = convert_indic_numerals_py(all_telugu)
        assert has_indic is True
        assert converted == "0123456789"

    def test_all_devanagari_digits(self):
        all_deva = "०१२३४५६७८९"
        converted, has_indic = convert_indic_numerals_py(all_deva)
        assert has_indic is True
        assert converted == "0123456789"


class TestLanguageDetection:
    """Test script detection for Telugu, Hindi, and English."""

    def test_detect_telugu(self):
        assert detect_language("రిట్ పిటిషన్ 1234") == "te"
        assert detect_language("రామయ్య") == "te"

    def test_detect_hindi(self):
        assert detect_language("रिट याचिका 1234") == "hi"
        assert detect_language("रमेश") == "hi"

    def test_detect_english(self):
        assert detect_language("Writ Petition 1234/2024") == "en"
        assert detect_language("WP 1234") == "en"


class TestVoiceQueryNormalization:
    """Test normalization of spoken legal queries across languages."""

    def test_english_case_query(self):
        res = normalize_voice_query_py("Writ Petition 101/2024")
        assert res["case_type"] == "WP"
        assert res["case_number"] == "101"
        assert res["filing_year"] == 2024
        assert "WP 101/2024" in res["normalized"]

    def test_telugu_spoken_case_query_with_telugu_numerals(self):
        res = normalize_voice_query_py("రిట్ పిటిషన్ ౧౦౧/౨౦౨౪")
        assert res["has_indic_numerals"] is True
        assert res["case_type"] == "WP"
        assert res["case_number"] == "101"
        assert res["filing_year"] == 2024
        assert "WP 101/2024" in res["normalized"]

    def test_hindi_spoken_case_query_with_devanagari_numerals(self):
        res = normalize_voice_query_py("रिट याचिका १०१/२०२४")
        assert res["has_indic_numerals"] is True
        assert res["case_type"] == "WP"
        assert res["case_number"] == "101"
        assert res["filing_year"] == 2024
        assert "WP 101/2024" in res["normalized"]

    def test_telugu_case_types(self):
        res_crlp = normalize_voice_query_py("క్రిమినల్ పిటిషన్ 55")
        assert res_crlp["case_type"] == "CRLP"
        assert res_crlp["case_number"] == "55"

        res_crp = normalize_voice_query_py("సివిల్ రివిజన్ పిటిషన్ 99")
        assert res_crp["case_type"] == "CRP"
        assert res_crp["case_number"] == "99"

        res_cc = normalize_voice_query_py("కంటెంప్ట్ కేసు 12")
        assert res_cc["case_type"] == "CC"
        assert res_cc["case_number"] == "12"

    def test_hindi_case_types(self):
        res_crlp = normalize_voice_query_py("आपराधिक याचिका 77")
        assert res_crlp["case_type"] == "CRLP"
        assert res_crlp["case_number"] == "77"

        res_crp = normalize_voice_query_py("सिविल रिवीजन 88")
        assert res_crp["case_type"] == "CRP"
        assert res_crp["case_number"] == "88"

        res_cc = normalize_voice_query_py("अवमानना वाद 33")
        assert res_cc["case_type"] == "CC"
        assert res_cc["case_number"] == "33"

    def test_spoken_connectors_and_noise_words(self):
        # Spoken "number" and "of"
        res1 = normalize_voice_query_py("WP number 123 of 2024")
        assert res1["case_number"] == "123"
        assert res1["filing_year"] == 2024
        assert "WP 123/2024" in res1["normalized"]

        # Telugu "నంబర్" and "బై"
        res2 = normalize_voice_query_py("WP నంబర్ 456 బై 2023")
        assert res2["case_number"] == "456"
        assert res2["filing_year"] == 2023
        assert "WP 456/2023" in res2["normalized"]

        # Hindi "नंबर" and "साल"
        res3 = normalize_voice_query_py("WP नंबर 789 साल 2022")
        assert res3["case_number"] == "789"
        assert res3["filing_year"] == 2022
        assert "WP 789/2022" in res3["normalized"]

    def test_conversational_prefixes_stripped(self):
        res_en = normalize_voice_query_py("find case WP 100")
        assert res_en["normalized"] == "WP 100"

        res_te = normalize_voice_query_py("కేస్ చూపించు WP 100")
        assert res_te["normalized"] == "WP 100"

        res_hi = normalize_voice_query_py("केस खोजें WP 100")
        assert res_hi["normalized"] == "WP 100"

    def test_party_name_queries(self):
        res_te = normalize_voice_query_py("రామయ్య వర్సెస్ శర్మ")
        assert "రామయ్య vs శర్మ" in res_te["normalized"]

        res_hi = normalize_voice_query_py("रमेश बनाम सुरेश")
        assert "रमेश vs सुरेश" in res_hi["normalized"]

    def test_empty_and_edge_cases(self):
        assert normalize_voice_query_py("")["normalized"] == ""
        assert normalize_voice_query_py("   ")["normalized"] == ""
        assert normalize_voice_query_py(None)["normalized"] == ""  # type: ignore
        assert normalize_voice_query_py("!@#$%,,,")["normalized"] == ""
