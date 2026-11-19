import { CaseItem } from '../types';
import { formatCaseNumber, formatDate } from './formatters';

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  let s = String(value).trim();
  if (!s) {
    return '—';
  }
  // Formula injection mitigation (CWE-1236)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  // If the cell contains quotes, commas, or line breaks, enclose in double quotes and escape internal quotes
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateCasesCsvString(cases: CaseItem[]): string {
  const headers = [
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
  ];

  const rows = cases.map(item => {
    const caseNumber = formatCaseNumber(
      item.case_type,
      item.case_number,
      item.filing_year
    );
    const caseName = `${item.petitioner || 'Petitioner'} vs ${
      item.respondent || 'Respondent'
    }`;
    const court = item.bench || 'High Court of Andhra Pradesh';
    const courtHall = item.court_hall_number
      ? `Court Hall ${item.court_hall_number}`
      : '—';
    const startedDate = item.filing_year
      ? String(item.filing_year)
      : item.created_at
        ? formatDate(item.created_at)
        : '—';
    const nextHearingDate =
      item.effective_next_hearing_date || item.next_hearing_date
        ? formatDate(item.effective_next_hearing_date || item.next_hearing_date!)
        : '—';

    const hearingsCount = item.hearings?.length ?? 0;
    const hearingHistory =
      hearingsCount > 0 ? `${hearingsCount} hearing(s) listed` : 'No hearings listed';
    const adjournments = (item.hearings || []).filter(
      h =>
        (h.business_conducted || '').toLowerCase().includes('adjourn') ||
        (h.status || '').toLowerCase().includes('adjourn')
    );
    const adjournmentHistory = `${adjournments.length} adjournment(s) recorded`;

    const statusText = (item.status || item.current_stage || 'PENDING').toUpperCase();
    const isClosed =
      statusText.includes('DISPOSED') ||
      statusText.includes('CLOSED') ||
      Boolean(item.judgment_date) ||
      Boolean(item.latest_judgment);

    const judgmentDateVal = item.judgment_date || item.latest_judgment?.judgment_date;
    const judgmentDateStr = judgmentDateVal ? formatDate(judgmentDateVal) : '—';
    const closedDateStr = judgmentDateVal
      ? formatDate(judgmentDateVal)
      : isClosed
        ? 'Disposed'
        : '—';

    let judgmentStatus = 'Not Scheduled';
    if (judgmentDateVal || item.latest_judgment) {
      judgmentStatus = 'Certified Judgment Available';
    } else if (isClosed) {
      judgmentStatus = 'Pending';
    }

    const judgmentSummary = item.latest_judgment?.summary || '—';
    const updatedStr = item.updated_at ? formatDate(item.updated_at) : '—';

    return [
      sanitizeCsvCell(caseNumber),
      sanitizeCsvCell(item.case_type),
      sanitizeCsvCell(caseName),
      sanitizeCsvCell(item.petitioner),
      sanitizeCsvCell(item.respondent),
      sanitizeCsvCell(court),
      sanitizeCsvCell(courtHall),
      sanitizeCsvCell(startedDate),
      sanitizeCsvCell(nextHearingDate),
      sanitizeCsvCell(hearingHistory),
      sanitizeCsvCell(adjournmentHistory),
      sanitizeCsvCell(closedDateStr),
      sanitizeCsvCell(statusText),
      sanitizeCsvCell(judgmentDateStr),
      sanitizeCsvCell(judgmentStatus),
      sanitizeCsvCell(judgmentSummary),
      sanitizeCsvCell(updatedStr),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

export interface ExportResult {
  success: boolean;
  filename: string;
  count: number;
  error?: string;
}

export function exportCasesToCsvFile(
  cases: CaseItem[],
  customFilename?: string
): ExportResult {
  if (!cases || cases.length === 0) {
    return {
      success: false,
      filename: '',
      count: 0,
      error: 'No case records match the selected filters to export.',
    };
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `APHC_My_Cases_${dateStamp}.csv`;
  const csvContent = generateCasesCsvString(cases);

  // In Web environment, create Blob with UTF-8 BOM and download
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    try {
      const blob = new Blob(['\uFEFF' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.setAttribute('download', filename);
      link.rel = 'noopener';
      link.style.display = 'none';
      window.document.body.appendChild(link);
      link.click();

      // Defer link removal and ObjectURL revocation so the browser reliably
      // initiates the file download before the blob URL is released.
      if (process.env.NODE_ENV === 'test') {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
      } else {
        setTimeout(() => {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
          window.URL.revokeObjectURL(url);
        }, 1000);
      }

      return {
        success: true,
        filename,
        count: cases.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        filename,
        count: cases.length,
        error: msg || 'Failed to download CSV file in browser.',
      };
    }
  }

  return {
    success: true,
    filename,
    count: cases.length,
  };
}
