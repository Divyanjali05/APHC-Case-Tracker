/**
 * Multilingual Voice Query Normalizer for Telugu, Hindi, and English legal queries.
 *
 * Handles:
 * 1. Indic Numerals (Telugu: ౦-౯, Devanagari: ०-९) -> ASCII (0-9)
 * 2. Spoken Vernacular Case Type Phrases -> Official APHC Case Type Codes
 * 3. Spoken Case Number & Year Connectors (e.g., "of", "బై", "साल")
 * 4. Noise word stripping and query sanitization
 */

export interface NormalizedVoiceQuery {
  raw: string;
  normalized: string;
  caseType?: string;
  caseNumber?: string;
  filingYear?: number;
  parties?: string;
  hasIndicNumerals: boolean;
  detectedLanguage?: 'en' | 'te' | 'hi';
}

const TELUGU_DIGITS: Record<string, string> = {
  '౦': '0',
  '౧': '1',
  '౨': '2',
  '౩': '3',
  '౪': '4',
  '౫': '5',
  '౬': '6',
  '౭': '7',
  '౮': '8',
  '౯': '9',
};

const DEVANAGARI_DIGITS: Record<string, string> = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
};

// Legal case type synonyms across English, Telugu, and Hindi
const CASE_TYPE_ALIASES: Record<string, string> = {
  // Writ Petition (WP)
  'writ petition': 'WP',
  'writ petitions': 'WP',
  'రిట్ పిటిషన్': 'WP',
  'రిట్ పిటీషన్': 'WP',
  రిట్: 'WP',
  'रिट याचिका': 'WP',
  'रिट पिटीशन': 'WP',
  रिट: 'WP',

  // Writ Appeal (WA)
  'writ appeal': 'WA',
  'రిట్ అప్పీల్': 'WA',
  'రిట్ అప్పీలు': 'WA',
  'रिट अपील': 'WA',

  // Criminal Petition (CRLP)
  'criminal petition': 'CRLP',
  'క్రిమినల్ పిటిషన్': 'CRLP',
  'క్రిమినల్ పిటీషన్': 'CRLP',
  'आपराधिक याचिका': 'CRLP',
  'क्रिमिनल पिटीशन': 'CRLP',

  // Civil Revision Petition (CRP)
  'civil revision petition': 'CRP',
  'civil revision': 'CRP',
  'సివిల్ రివిజన్ పిటిషన్': 'CRP',
  'సివిల్ రివిజన్': 'CRP',
  'सिविल रिवीजन याचिका': 'CRP',
  'सिविल रिवीजन': 'CRP',

  // Contempt Case (CC)
  'contempt case': 'CC',
  contempt: 'CC',
  'కంటెంప్ట్ కేసు': 'CC',
  'ధిక్కార కేసు': 'CC',
  కంటెంప్ట్: 'CC',
  'अवमानना वाद': 'CC',
  'अवमानना मामला': 'CC',
  'कंटेम्प्ट केस': 'CC',

  // Election Petition (EP)
  'election petition': 'EP',
  'ఎన్నికల పిటిషన్': 'EP',
  'चुनाव याचिका': 'EP',

  // Motor Accident Civil Misc Appeal (MACMA)
  'motor accident': 'MACMA',
  macma: 'MACMA',
  'మోటార్ యాక్సిడెంట్': 'MACMA',
  'मोटर दुर्घटना अपील': 'MACMA',
};

/**
 * Converts any Indic numerals (Telugu and Devanagari) in text to ASCII digits 0-9.
 */
export function convertIndicNumerals(text: string): {
  text: string;
  hasIndicNumerals: boolean;
} {
  let hasIndic = false;
  let result = '';

  for (const char of text) {
    if (TELUGU_DIGITS[char] !== undefined) {
      result += TELUGU_DIGITS[char];
      hasIndic = true;
    } else if (DEVANAGARI_DIGITS[char] !== undefined) {
      result += DEVANAGARI_DIGITS[char];
      hasIndic = true;
    } else {
      result += char;
    }
  }

  return { text: result, hasIndicNumerals: hasIndic };
}

/**
 * Detect language script presence in query string.
 */
export function detectQueryLanguage(text: string): 'en' | 'te' | 'hi' {
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
}

/**
 * Normalizes spoken multilingual case query for case tracking and search.
 */
export function normalizeVoiceQuery(rawQuery: string): NormalizedVoiceQuery {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return {
      raw: '',
      normalized: '',
      hasIndicNumerals: false,
    };
  }

  const raw = rawQuery.trim();
  if (!raw) {
    return {
      raw: '',
      normalized: '',
      hasIndicNumerals: false,
    };
  }

  const detectedLanguage = detectQueryLanguage(raw);

  // 1. Convert Indic numerals (Telugu / Devanagari) to ASCII digits
  const { text: asciiDigitsText, hasIndicNumerals } = convertIndicNumerals(raw);

  let processed = asciiDigitsText;

  // 2. Identify Case Type Alias replacements
  let matchedCaseType: string | undefined;

  // Sort keys by length descending to match longest phrases first (e.g., "civil revision petition" before "civil revision")
  const sortedAliases = Object.keys(CASE_TYPE_ALIASES).sort(
    (a, b) => b.length - a.length
  );

  for (const alias of sortedAliases) {
    const regex = new RegExp(`(^|\\s)${alias}(\\s|$|[0-9])`, 'i');
    if (regex.test(processed)) {
      matchedCaseType = CASE_TYPE_ALIASES[alias];
      processed = processed.replace(regex, `$1${matchedCaseType} $2`);
      break;
    }
  }

  // 3. Clean up spoken number prefixes like "number", "నంబర్", "నెంబర్", "नंबर", "संख्या", "no."
  processed = processed.replace(
    /(?:number|no\.?|నంబర్|నంబరు?|నెంబర్|నెంబరు?|नंबर|संख्या)\s*([0-9]+)/gi,
    '$1'
  );

  // 4. Clean spoken slash/year connectors: e.g., "100 of 2024", "100 by 2024", "100 బై 2024", "100 साल 2024", "100 వత్సరం 2024"
  processed = processed.replace(
    /([0-9]+)\s*(?:of|by|slash|\/|బై|యొక్క|సంవత్సరం|వత్సరం|साल|वर्ष)\s*([0-9]{4})/gi,
    '$1/$2'
  );

  // 5. Clean spoken "versus" / "vs": "వర్సెస్", "ఎదిరి", "बनाम"
  processed = processed.replace(/\s*(?:వర్సెస్|ఎదిరి|बनाम|versus)\s*/gi, ' vs ');

  // 6. Strip conversational search prefix phrases: "search for", "find case", "కేసు శోధించండి", "కేస్ చూపించు", "केस खोजें"
  processed = processed.replace(
    /^(?:search\s+for|find\s+case|find|show\s+case|కేసు\s+శోధించండి|కేస్\s+చూపించు|కేస్\s+వెతకండి|కేస్\s+శోధన|केस\s+खोजें|खोजें)\s+/gi,
    ''
  );

  // 7. Normalize consecutive whitespaces and clean punctuation (preserving letters, vowel marks, numbers, and slashes)
  processed = processed
    .replace(/[^\p{L}\p{M}\p{N}\s/]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 8. Extract structured tokens if applicable (CaseType CaseNumber/Year)
  const casePattern = /\b([A-Z]{2,6})\s+([0-9]+)(?:\/([0-9]{4}))?\b/i;
  const match = processed.match(casePattern);

  let caseNumber: string | undefined;
  let filingYear: number | undefined;

  if (match) {
    if (!matchedCaseType) matchedCaseType = match[1].toUpperCase();
    caseNumber = match[2];
    if (match[3]) filingYear = parseInt(match[3], 10);
  } else {
    // Check if there is a standalone case number and year: "1234/2024"
    const numYearMatch = processed.match(/\b([0-9]+)\/([0-9]{4})\b/);
    if (numYearMatch) {
      caseNumber = numYearMatch[1];
      filingYear = parseInt(numYearMatch[2], 10);
    }
  }

  return {
    raw,
    normalized: processed,
    caseType: matchedCaseType,
    caseNumber,
    filingYear,
    hasIndicNumerals,
    detectedLanguage,
  };
}
