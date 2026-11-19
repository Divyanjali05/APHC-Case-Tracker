import { CaseFilters } from '../components/cases/CaseFilterModal';
import { normalizeVoiceQuery } from '../services/speech/voiceQueryNormalizer';
import { CaseItem } from '../types';
import { formatCaseNumber } from './formatters';

export type SortType =
  | 'CASE_DATE'
  | 'NEXT_HEARING'
  | 'JUDGMENT_DATE'
  | 'CLOSED_DATE'
  | 'CASE_NAME'
  | 'CASE_NUMBER'
  | 'RECENTLY_UPDATED';

export const DEFAULT_CASE_TYPES = [
  'WP',
  'WA',
  'CRLP',
  'CRP',
  'MACMA',
  'CC',
  'EP',
  'OTHER',
];

export const DEFAULT_YEARS = [
  '2026',
  '2025',
  '2024',
  '2023',
  '2022',
  '2021',
  '2020',
  '2019',
  '2018',
];

/**
 * Parse a date string (ISO YYYY-MM-DD or full timestamp) to local midnight / timestamp ms.
 * Returns null when missing, invalid, or N/A.
 */
export const parseDateToMs = (dateStr?: string | null): number | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (
    !trimmed ||
    trimmed.toUpperCase() === 'N/A' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return null;
  }
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDateOnly) {
    const [, y, m, d] = isoDateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
  }
  const parsed = new Date(trimmed).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Normalize raw case list response (handles array or paginated `{ results }`).
 */
export const normalizeCaseList = (cases: unknown): CaseItem[] => {
  if (Array.isArray(cases)) return cases as CaseItem[];
  if (
    cases &&
    typeof cases === 'object' &&
    Array.isArray((cases as { results?: unknown }).results)
  ) {
    return (cases as { results: CaseItem[] }).results;
  }
  return [];
};

/**
 * Derive available Case Type, Court/Bench, and Filing Year options from loaded cases
 * merged with backend-supported choices.
 */
export const extractCaseFilterOptions = (cases: unknown) => {
  const rawList = normalizeCaseList(cases);
  const types = new Set<string>(DEFAULT_CASE_TYPES);
  const courts = new Set<string>();
  const years = new Set<string>(DEFAULT_YEARS);

  rawList.forEach(item => {
    if (item.case_type?.trim()) {
      types.add(item.case_type.trim().toUpperCase());
    }
    if (item.bench?.trim()) {
      courts.add(item.bench.trim());
    }
    if (item.filing_year) {
      years.add(String(item.filing_year));
    }
  });

  return {
    availableCaseTypes: Array.from(types),
    availableCourts: Array.from(courts),
    availableYears: Array.from(years).sort((a, b) => Number(b) - Number(a)),
  };
};

/**
 * Compact, readable Sort button label for mobile & desktop toolbars.
 */
export const getSortButtonLabel = (sortBy: SortType, sortAsc: boolean): string => {
  const dir = sortAsc ? '↑' : '↓';
  switch (sortBy) {
    case 'CASE_NUMBER':
      return `Case No. ${dir}`;
    case 'CASE_DATE':
      return `Filing ${dir}`;
    case 'NEXT_HEARING':
      return `Hearing ${dir}`;
    case 'CLOSED_DATE':
      return `Closed ${dir}`;
    case 'JUDGMENT_DATE':
      return `Judgment ${dir}`;
    case 'RECENTLY_UPDATED':
      return `Updated ${dir}`;
    case 'CASE_NAME':
      return `Name ${dir}`;
    default:
      return `Sort ${dir}`;
  }
};

export type CanonicalCaseStatus = 'PENDING' | 'DISPOSED' | 'ADJOURNED';

const DISPOSED_STAGE_SET = new Set([
  'DISPOSED',
  'CLOSED',
  'COMPLETED',
  'DECIDED',
  'JUDGMENT AVAILABLE',
]);

/**
 * Determine the canonical mutually-exclusive lifecycle bucket for a case.
 * Mirrors backend `CaseStatusService`:
 *   Total = PENDING + DISPOSED + ADJOURNED
 */
export const getCanonicalCaseStatus = (item: CaseItem): CanonicalCaseStatus => {
  const backendCanonical = item.status_details?.canonical_status?.toUpperCase();
  if (
    backendCanonical === 'PENDING' ||
    backendCanonical === 'DISPOSED' ||
    backendCanonical === 'ADJOURNED'
  ) {
    return backendCanonical;
  }

  const stageUpper = (item.current_stage || '').trim().toUpperCase();
  const statusUpper = (item.status || item.status_details?.status || '')
    .trim()
    .toUpperCase();

  const hasJudgment = Boolean(
    item.judgment_date ||
      item.status_details?.has_judgment ||
      item.latest_judgment ||
      (item.judgments && item.judgments.length > 0)
  );

  // 1. Disposed (explicit disposed stage OR judgment recorded)
  if (
    item.status_details?.is_disposed ||
    hasJudgment ||
    DISPOSED_STAGE_SET.has(stageUpper) ||
    DISPOSED_STAGE_SET.has(statusUpper) ||
    stageUpper.includes('DISPOSED') ||
    stageUpper.includes('CLOSED') ||
    statusUpper.includes('DISPOSED') ||
    statusUpper.includes('CLOSED') ||
    statusUpper.includes('JUDGMENT AVAILABLE')
  ) {
    return 'DISPOSED';
  }

  // 2. Adjourned (strictly non-disposed)
  const hasAdjournedHearing = (item.hearings || []).some(h =>
    (h.business_conducted || '').toLowerCase().includes('adjourn')
  );
  if (
    stageUpper === 'ADJOURNED' ||
    stageUpper.includes('ADJOURN') ||
    statusUpper.includes('ADJOURN') ||
    hasAdjournedHearing
  ) {
    return 'ADJOURNED';
  }

  // 3. Pending (all remaining active matters, including Upcoming/Listed hearings)
  return 'PENDING';
};

/**
 * Shared real search, multi-filter, and multi-sort pipeline used by both
 * Home Dashboard ("My Cases" table) and Cases tab ("My Cases" list).
 */
export const filterAndSortCases = (
  cases: unknown,
  searchQuery: string,
  filters: CaseFilters,
  sortBy: SortType,
  sortAsc: boolean
): CaseItem[] => {
  let result = normalizeCaseList(cases).slice();

  // 1. Search filter (aligns instant client filtering with backend search)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    const normalizedQ = normalizeVoiceQuery(searchQuery).normalized.toLowerCase().trim();

    result = result.filter(item => {
      const fullCaseNumber = formatCaseNumber(
        item.case_type,
        item.case_number,
        item.filing_year
      ).toLowerCase();
      const simpleCaseNumber = `${item.case_type || ''} ${item.case_number || ''}`
        .trim()
        .toLowerCase();
      const rawCaseNumber = String(item.case_number || '').toLowerCase();
      const caseType = String(item.case_type || '').toLowerCase();
      const parties = `${item.petitioner || ''} ${item.respondent || ''}`.toLowerCase();
      const advocate = `${item.petitioner_advocate || ''} ${
        item.respondent_advocate || ''
      }`.toLowerCase();
      const court = `${item.bench || ''}`.toLowerCase();
      const hall = item.court_hall_number ? String(item.court_hall_number) : '';

      return (
        fullCaseNumber.includes(q) ||
        fullCaseNumber.includes(normalizedQ) ||
        simpleCaseNumber.includes(q) ||
        simpleCaseNumber.includes(normalizedQ) ||
        rawCaseNumber.includes(q) ||
        rawCaseNumber.includes(normalizedQ) ||
        caseType.includes(q) ||
        parties.includes(q) ||
        parties.includes(normalizedQ) ||
        advocate.includes(q) ||
        advocate.includes(normalizedQ) ||
        court.includes(q) ||
        hall === q
      );
    });
  }

  // 2A. Status filter (uses exact same canonical buckets as DashboardService)
  if (filters.status !== 'ALL') {
    result = result.filter(item => {
      const canonical = getCanonicalCaseStatus(item);
      if (filters.status === 'PENDING') {
        return canonical === 'PENDING';
      }
      if (filters.status === 'DISPOSED') {
        return canonical === 'DISPOSED';
      }
      if (filters.status === 'ADJOURNED') {
        return canonical === 'ADJOURNED';
      }
      if (filters.status === 'UPCOMING') {
        if (canonical !== 'PENDING') return false;
        const stageUpper = (item.current_stage || '').toUpperCase();
        return (
          stageUpper.includes('UPCOMING') ||
          stageUpper.includes('LISTED') ||
          Boolean(item.effective_next_hearing_date || item.next_hearing_date)
        );
      }
      return true;
    });
  }

  // 2B. Hearing schedule quick filter
  if (filters.hearing !== 'ALL') {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const endOfToday = startOfToday + 86400000 - 1;
    const endOfWeek = startOfToday + 7 * 86400000;
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59
    ).getTime();

    result = result.filter(item => {
      const hDate = parseDateToMs(
        item.effective_next_hearing_date || item.next_hearing_date
      );

      if (filters.hearing === 'NOT_SCHEDULED') {
        return hDate === null;
      }
      if (hDate === null) return false;

      switch (filters.hearing) {
        case 'TODAY':
          return hDate >= startOfToday && hDate <= endOfToday;
        case 'THIS_WEEK':
          return hDate >= startOfToday && hDate <= endOfWeek;
        case 'THIS_MONTH':
          return hDate >= startOfToday && hDate <= endOfMonth;
        case 'UPCOMING':
          return hDate >= startOfToday;
        case 'PAST':
          return hDate < startOfToday;
        default:
          return true;
      }
    });
  }

  // 2C. Judgment Availability filter
  if (filters.judgment !== 'ALL') {
    result = result.filter(item => {
      const hasJudgment = Boolean(
        item.judgment_date ||
          item.status_details?.has_judgment ||
          item.latest_judgment ||
          (item.judgments && item.judgments.length > 0)
      );
      if (filters.judgment === 'AVAILABLE') return hasJudgment;
      if (filters.judgment === 'PENDING') {
        return !hasJudgment && getCanonicalCaseStatus(item) === 'DISPOSED';
      }
      if (filters.judgment === 'NOT_AVAILABLE') return !hasJudgment;
      return true;
    });
  }

  // 2D. Filing Date Range filter (supports From-only, To-only, or From+To)
  if (filters.filingDateFrom?.trim() || filters.filingDateTo?.trim()) {
    const fromMs = parseDateToMs(filters.filingDateFrom);
    const toMs = parseDateToMs(filters.filingDateTo);
    result = result.filter(item => {
      const fMs =
        parseDateToMs(item.created_at) ??
        (item.filing_year ? new Date(item.filing_year, 0, 1).getTime() : null);
      if (fMs === null) return false;
      if (fromMs !== null && fMs < fromMs) return false;
      if (toMs !== null && fMs > toMs + 86400000 - 1) return false;
      return true;
    });
  }

  // 2E. Hearing Date Range filter (supports From-only, To-only, or From+To)
  if (filters.hearingDateFrom?.trim() || filters.hearingDateTo?.trim()) {
    const fromMs = parseDateToMs(filters.hearingDateFrom);
    const toMs = parseDateToMs(filters.hearingDateTo);
    result = result.filter(item => {
      const hMs = parseDateToMs(
        item.effective_next_hearing_date || item.next_hearing_date
      );
      if (hMs === null) return false;
      if (fromMs !== null && hMs < fromMs) return false;
      if (toMs !== null && hMs > toMs + 86400000 - 1) return false;
      return true;
    });
  }

  // 2F. Closed / Disposal Date Range filter (supports From-only, To-only, or From+To)
  if (filters.closedDateFrom?.trim() || filters.closedDateTo?.trim()) {
    const fromMs = parseDateToMs(filters.closedDateFrom);
    const toMs = parseDateToMs(filters.closedDateTo);
    result = result.filter(item => {
      if (getCanonicalCaseStatus(item) !== 'DISPOSED') return false;
      const cMs = parseDateToMs(
        item.judgment_date ||
          item.status_details?.judgment_date ||
          item.latest_judgment?.judgment_date
      );
      if (cMs === null) return false;
      if (fromMs !== null && cMs < fromMs) return false;
      if (toMs !== null && cMs > toMs + 86400000 - 1) return false;
      return true;
    });
  }

  // 2G. Court Hall Number filter
  if (filters.courtHallNumber?.trim()) {
    const targetHall = filters.courtHallNumber.trim().toLowerCase();
    result = result.filter(item => {
      return (
        item.court_hall_number !== null &&
        item.court_hall_number !== undefined &&
        String(item.court_hall_number).toLowerCase() === targetHall
      );
    });
  }

  // 2H. Court / Bench filter
  if (filters.court?.trim()) {
    const targetCourt = filters.court.trim().toLowerCase();
    result = result.filter(item => {
      const cName = `${item.bench || ''}`.toLowerCase();
      return cName.includes(targetCourt);
    });
  }

  // 2I. Case Type filter
  if (filters.caseType?.trim()) {
    const targetType = filters.caseType.trim().toUpperCase();
    result = result.filter(item => {
      return (item.case_type || '').toUpperCase() === targetType;
    });
  }

  // 2J. Filing Year filter
  if (filters.caseYear?.trim()) {
    const targetYear = parseInt(filters.caseYear.trim(), 10);
    result = result.filter(item => item.filing_year === targetYear);
  }

  // 3. Sorting
  result.sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'CASE_DATE') {
      const dateA =
        parseDateToMs(a.created_at) ??
        (a.filing_year ? new Date(a.filing_year, 0, 1).getTime() : null);
      const dateB =
        parseDateToMs(b.created_at) ??
        (b.filing_year ? new Date(b.filing_year, 0, 1).getTime() : null);
      if (dateA === null && dateB === null) comparison = 0;
      else if (dateA === null) comparison = -1;
      else if (dateB === null) comparison = 1;
      else comparison = dateA - dateB;
    } else if (sortBy === 'NEXT_HEARING') {
      const dateA = parseDateToMs(a.effective_next_hearing_date || a.next_hearing_date);
      const dateB = parseDateToMs(b.effective_next_hearing_date || b.next_hearing_date);
      if (dateA === null && dateB === null) comparison = 0;
      else if (dateA === null) comparison = -1;
      else if (dateB === null) comparison = 1;
      else comparison = dateA - dateB;
    } else if (sortBy === 'JUDGMENT_DATE') {
      const dateA = parseDateToMs(
        a.judgment_date ||
          a.status_details?.judgment_date ||
          a.latest_judgment?.judgment_date
      );
      const dateB = parseDateToMs(
        b.judgment_date ||
          b.status_details?.judgment_date ||
          b.latest_judgment?.judgment_date
      );
      if (dateA === null && dateB === null) comparison = 0;
      else if (dateA === null) comparison = -1;
      else if (dateB === null) comparison = 1;
      else comparison = dateA - dateB;
    } else if (sortBy === 'CLOSED_DATE') {
      const isDisposedA = getCanonicalCaseStatus(a) === 'DISPOSED';
      const isDisposedB = getCanonicalCaseStatus(b) === 'DISPOSED';
      const dateA = isDisposedA
        ? parseDateToMs(
            a.judgment_date ||
              a.status_details?.judgment_date ||
              a.latest_judgment?.judgment_date
          )
        : null;
      const dateB = isDisposedB
        ? parseDateToMs(
            b.judgment_date ||
              b.status_details?.judgment_date ||
              b.latest_judgment?.judgment_date
          )
        : null;
      if (dateA === null && dateB === null) comparison = 0;
      else if (dateA === null) comparison = -1;
      else if (dateB === null) comparison = 1;
      else comparison = dateA - dateB;
    } else if (sortBy === 'CASE_NAME') {
      const nameA = `${a.petitioner || ''} vs ${a.respondent || ''}`.toLowerCase();
      const nameB = `${b.petitioner || ''} vs ${b.respondent || ''}`.toLowerCase();
      comparison = nameA.localeCompare(nameB);
    } else if (sortBy === 'CASE_NUMBER') {
      const numA = `${a.case_type || ''} ${String(a.case_number || '').padStart(
        8,
        '0'
      )}/${a.filing_year || ''}`;
      const numB = `${b.case_type || ''} ${String(b.case_number || '').padStart(
        8,
        '0'
      )}/${b.filing_year || ''}`;
      comparison = numA.localeCompare(numB);
    } else if (sortBy === 'RECENTLY_UPDATED') {
      const dateA = parseDateToMs(a.updated_at);
      const dateB = parseDateToMs(b.updated_at);
      if (dateA === null && dateB === null) comparison = 0;
      else if (dateA === null) comparison = -1;
      else if (dateB === null) comparison = 1;
      else comparison = dateA - dateB;
    }

    return sortAsc ? comparison : -comparison;
  });

  return result;
};

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const formatDateRangeLabel = (from?: string, to?: string): string => {
  const f = (from || '').trim();
  const t = (to || '').trim();
  if (f && t) return `${f} to ${t}`;
  if (f) return `From ${f}`;
  if (t) return `Up to ${t}`;
  return '';
};

/**
 * Build removable summary chips ONLY for currently applied filters.
 */
export const buildActiveFilterChips = (
  filters: CaseFilters,
  onUpdateFilters: (updater: (prev: CaseFilters) => CaseFilters) => void
): ActiveFilterChip[] => {
  const chips: ActiveFilterChip[] = [];

  if (filters.status !== 'ALL') {
    chips.push({
      key: 'status',
      label: `Status: ${
        filters.status.charAt(0) + filters.status.slice(1).toLowerCase()
      }`,
      onRemove: () => onUpdateFilters(p => ({ ...p, status: 'ALL' })),
    });
  }
  if (filters.caseType?.trim()) {
    chips.push({
      key: 'caseType',
      label: `Type: ${filters.caseType}`,
      onRemove: () => onUpdateFilters(p => ({ ...p, caseType: '' })),
    });
  }
  if (filters.court?.trim()) {
    chips.push({
      key: 'court',
      label: `Court: ${filters.court}`,
      onRemove: () => onUpdateFilters(p => ({ ...p, court: '' })),
    });
  }
  if (filters.courtHallNumber?.trim()) {
    chips.push({
      key: 'courtHall',
      label: `Hall ${filters.courtHallNumber}`,
      onRemove: () => onUpdateFilters(p => ({ ...p, courtHallNumber: '' })),
    });
  }
  if (filters.caseYear?.trim()) {
    chips.push({
      key: 'caseYear',
      label: `Year: ${filters.caseYear}`,
      onRemove: () => onUpdateFilters(p => ({ ...p, caseYear: '' })),
    });
  }
  if (filters.filingDateFrom?.trim() || filters.filingDateTo?.trim()) {
    chips.push({
      key: 'filingDate',
      label: `Filing: ${formatDateRangeLabel(
        filters.filingDateFrom,
        filters.filingDateTo
      )}`,
      onRemove: () =>
        onUpdateFilters(p => ({ ...p, filingDateFrom: '', filingDateTo: '' })),
    });
  }
  if (filters.hearing !== 'ALL') {
    chips.push({
      key: 'hearing',
      label: `Hearing: ${filters.hearing.replace(/_/g, ' ').toLowerCase()}`,
      onRemove: () => onUpdateFilters(p => ({ ...p, hearing: 'ALL' })),
    });
  }
  if (filters.hearingDateFrom?.trim() || filters.hearingDateTo?.trim()) {
    chips.push({
      key: 'hearingDate',
      label: `Hearing: ${formatDateRangeLabel(
        filters.hearingDateFrom,
        filters.hearingDateTo
      )}`,
      onRemove: () =>
        onUpdateFilters(p => ({ ...p, hearingDateFrom: '', hearingDateTo: '' })),
    });
  }
  if (filters.closedDateFrom?.trim() || filters.closedDateTo?.trim()) {
    chips.push({
      key: 'closedDate',
      label: `Closed: ${formatDateRangeLabel(
        filters.closedDateFrom,
        filters.closedDateTo
      )}`,
      onRemove: () =>
        onUpdateFilters(p => ({ ...p, closedDateFrom: '', closedDateTo: '' })),
    });
  }
  if (filters.judgment !== 'ALL') {
    const labelMap: Record<string, string> = {
      AVAILABLE: 'Available',
      NOT_AVAILABLE: 'Not Available',
      PENDING: 'Pending',
    };
    chips.push({
      key: 'judgment',
      label: `Judgment: ${labelMap[filters.judgment] || filters.judgment}`,
      onRemove: () => onUpdateFilters(p => ({ ...p, judgment: 'ALL' })),
    });
  }

  return chips;
};
