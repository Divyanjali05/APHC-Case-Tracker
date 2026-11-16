import {
  generateCasesCsvString,
  sanitizeCsvCell,
  exportCasesToCsvFile,
} from '../utils/csvExport';
import { CaseItem } from '../types';

describe('CSV Export Service & Formatting Verification', () => {
  it('correctly mitigates formula injection for dangerous characters', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
    expect(sanitizeCsvCell('+12345')).toBe("'+12345");
    expect(sanitizeCsvCell('-500')).toBe("'-500");
    expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
  });

  it('correctly quotes cells containing commas, double quotes, and line breaks', () => {
    expect(sanitizeCsvCell('Rao, Venkata')).toBe('"Rao, Venkata"');
    expect(sanitizeCsvCell('Judge "Justice" Reddy')).toBe('"Judge ""Justice"" Reddy"');
    expect(sanitizeCsvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
  });

  it('preserves Telugu and Hindi multilingual strings without corruption', () => {
    const telugu = 'శ్రీనివాస రావు';
    const hindi = 'राजेश कुमार';
    expect(sanitizeCsvCell(telugu)).toBe(telugu);
    expect(sanitizeCsvCell(hindi)).toBe(hindi);
  });

  it('generates CSV with exact 17 columns and valid content rows', () => {
    const testCases: CaseItem[] = [
      {
        id: 1,
        case_type: 'WP',
        case_number: '1234',
        filing_year: 2024,
        petitioner: 'శ్రీనివాస రావు (Srinivasa Rao)',
        respondent: 'State of Andhra Pradesh, rep by Chief Secretary',
        petitioner_advocate: 'Adv. Sharma',
        respondent_advocate: 'Adv. Kumar',
        current_stage: 'Final Hearing',
        status: 'Pending',
        bench: 'Chief Justice Bench',
        court_hall_number: 4,
        next_hearing_date: '2026-12-15',
        effective_next_hearing_date: '2026-12-15',
        hearings: [
          {
            id: 10,
            case: 1,
            hearing_date: '2026-11-01',
            business_conducted: 'Adjourned at request of petitioner advocate',
            created_at: '2026-11-01T00:00:00Z',
          },
        ],
        created_at: '2024-03-01T10:00:00Z',
        updated_at: '2026-11-10T12:00:00Z',
      },
      {
        id: 2,
        case_type: 'WA',
        case_number: '5678',
        filing_year: 2023,
        petitioner: 'M/S Tech Solutions Ltd',
        respondent: 'Commercial Tax Officer',
        current_stage: 'DISPOSED',
        status: 'Disposed',
        judgment_date: '2026-10-20',
        latest_judgment: {
          id: 50,
          case: 2,
          judgment_date: '2026-10-20',
          summary: 'Writ Appeal allowed. Assessment order set aside.',
          created_at: '2026-10-20T10:00:00Z',
          updated_at: '2026-10-20T10:00:00Z',
        },
        created_at: '2023-05-10T10:00:00Z',
        updated_at: '2026-10-20T16:00:00Z',
      },
    ];

    const csvOutput = generateCasesCsvString(testCases);
    const lines = csvOutput.split('\r\n');

    expect(lines.length).toBe(3); // 1 header + 2 case rows

    // Check Headers
    const headers = lines[0].split(',');
    expect(headers).toEqual([
      'Case Number',
      'Case Type',
      'Case Name',
      'Petitioner',
      'Respondent',
      'Court',
      'Court Hall',
      'Started/Filing Date',
      'Next Hearing Date',
      'Hearing History',
      'Adjournment History',
      'Closed Date',
      'Current Status',
      'Judgment Date',
      'Judgment Status',
      'Judgment Summary',
      'Last Updated',
    ]);

    // Check Row 1 (Telugu petitioner + comma respondent)
    expect(lines[1]).toContain('WP 1234/2024');
    expect(lines[1]).toContain('శ్రీనివాస రావు');
    expect(lines[1]).toContain('"State of Andhra Pradesh, rep by Chief Secretary"');
    expect(lines[1]).toContain('1 adjournment(s) recorded');

    // Check Row 2 (Disposed + Judgment)
    expect(lines[2]).toContain('WA 5678/2023');
    expect(lines[2]).toContain('Certified Judgment Available');
    expect(lines[2]).toContain('Writ Appeal allowed. Assessment order set aside.');
  });

  it('returns failure result when records array is empty', () => {
    const result = exportCasesToCsvFile([]);
    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
    expect(result.error).toContain('No case records match');
  });
});
