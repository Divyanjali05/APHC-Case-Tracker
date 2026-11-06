import {
  convertIndicNumerals,
  detectQueryLanguage,
  normalizeVoiceQuery,
} from '../services/speech/voiceQueryNormalizer';

describe('Voice Query Normalizer', () => {
  describe('convertIndicNumerals', () => {
    it('converts Telugu numerals to ASCII digits', () => {
      const { text, hasIndicNumerals } = convertIndicNumerals('రిట్ ౧౨౩౪/౨౦౨౪');
      expect(hasIndicNumerals).toBe(true);
      expect(text).toContain('1234/2024');
    });

    it('converts Devanagari numerals to ASCII digits', () => {
      const { text, hasIndicNumerals } = convertIndicNumerals('केस १२३४/२०२४');
      expect(hasIndicNumerals).toBe(true);
      expect(text).toContain('1234/2024');
    });

    it('leaves standard ASCII digits unmodified', () => {
      const { text, hasIndicNumerals } = convertIndicNumerals('WP 100/2024');
      expect(hasIndicNumerals).toBe(false);
      expect(text).toBe('WP 100/2024');
    });

    it('correctly maps all 10 digits for Telugu and Devanagari', () => {
      expect(convertIndicNumerals('౦౧౨౩౪౫౬౭౮౯').text).toBe('0123456789');
      expect(convertIndicNumerals('०१२३४५६७८९').text).toBe('0123456789');
    });
  });

  describe('detectQueryLanguage', () => {
    it('detects Telugu script', () => {
      expect(detectQueryLanguage('రిట్ పిటిషన్')).toBe('te');
      expect(detectQueryLanguage('రామయ్య')).toBe('te');
    });

    it('detects Devanagari/Hindi script', () => {
      expect(detectQueryLanguage('रिट याचिका')).toBe('hi');
      expect(detectQueryLanguage('सुरेश')).toBe('hi');
    });

    it('defaults to English for Latin script', () => {
      expect(detectQueryLanguage('Writ Petition 101/2024')).toBe('en');
      expect(detectQueryLanguage('WP 1234')).toBe('en');
    });
  });

  describe('normalizeVoiceQuery', () => {
    it('normalizes spoken English case queries', () => {
      const res = normalizeVoiceQuery('Writ Petition 101/2024');
      expect(res.caseType).toBe('WP');
      expect(res.caseNumber).toBe('101');
      expect(res.filingYear).toBe(2024);
      expect(res.normalized).toBe('WP 101/2024');
    });

    it('normalizes spoken Telugu queries with Telugu numerals', () => {
      const res = normalizeVoiceQuery('రిట్ పిటిషన్ ౧౦౧/౨౦౨౪');
      expect(res.hasIndicNumerals).toBe(true);
      expect(res.caseType).toBe('WP');
      expect(res.caseNumber).toBe('101');
      expect(res.filingYear).toBe(2024);
      expect(res.normalized).toBe('WP 101/2024');
    });

    it('normalizes spoken Hindi queries with Devanagari numerals', () => {
      const res = normalizeVoiceQuery('रिट याचिका १०१/२०२४');
      expect(res.hasIndicNumerals).toBe(true);
      expect(res.caseType).toBe('WP');
      expect(res.caseNumber).toBe('101');
      expect(res.filingYear).toBe(2024);
      expect(res.normalized).toBe('WP 101/2024');
    });

    it('normalizes various Telugu case types', () => {
      expect(normalizeVoiceQuery('క్రిమినల్ పిటిషన్ 55').caseType).toBe('CRLP');
      expect(normalizeVoiceQuery('సివిల్ రివిజన్ పిటిషన్ 99').caseType).toBe('CRP');
      expect(normalizeVoiceQuery('కంటెంప్ట్ కేసు 12').caseType).toBe('CC');
      expect(normalizeVoiceQuery('ఎన్నికల పిటిషన్ 7').caseType).toBe('EP');
    });

    it('normalizes various Hindi case types', () => {
      expect(normalizeVoiceQuery('आपराधिक याचिका 77').caseType).toBe('CRLP');
      expect(normalizeVoiceQuery('सिविल रिवीजन 88').caseType).toBe('CRP');
      expect(normalizeVoiceQuery('अवमानना वाद 33').caseType).toBe('CC');
      expect(normalizeVoiceQuery('चुनाव याचिका 4').caseType).toBe('EP');
    });

    it('cleans spoken connectors like "of", "బై", "साल"', () => {
      expect(normalizeVoiceQuery('WP 100 of 2024').normalized).toBe('WP 100/2024');
      expect(normalizeVoiceQuery('WP నంబర్ 456 బై 2023').normalized).toBe('WP 456/2023');
      expect(normalizeVoiceQuery('WP नंबर 789 साल 2022').normalized).toBe('WP 789/2022');
    });

    it('cleans conversational search prefixes in all three languages', () => {
      expect(normalizeVoiceQuery('find case WP 100').normalized).toBe('WP 100');
      expect(normalizeVoiceQuery('కేస్ చూపించు WP 100').normalized).toBe('WP 100');
      expect(normalizeVoiceQuery('केस खोजें WP 100').normalized).toBe('WP 100');
    });

    it('cleans versus in Telugu and Hindi party queries', () => {
      expect(normalizeVoiceQuery('రామయ్య వర్సెస్ శర్మ').normalized).toBe(
        'రామయ్య vs శర్మ'
      );
      expect(normalizeVoiceQuery('रमेश बनाम सुरेश').normalized).toBe('रमेश vs सुरेश');
    });

    it('handles empty, whitespace, and special character inputs safely', () => {
      expect(normalizeVoiceQuery('').normalized).toBe('');
      expect(normalizeVoiceQuery('   ').normalized).toBe('');
      expect(normalizeVoiceQuery('!@#$%').normalized).toBe('');
    });
  });
});
