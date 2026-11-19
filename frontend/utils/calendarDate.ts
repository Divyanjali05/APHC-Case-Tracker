import { CalendarViewType } from '../types';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Return YYYY-MM-DD for a Date object in the user's LOCAL timezone (never UTC). */
export function formatLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Return today's YYYY-MM-DD string in the user's LOCAL timezone. */
export function getLocalTodayIso(): string {
  return formatLocalDateIso(new Date());
}

/** Parse a YYYY-MM-DD string into a local-midnight Date object (avoids UTC shift). */
export function parseLocalDate(dateStr?: string | null): Date {
  if (dateStr) {
    const match = ISO_DATE_RE.exec(dateStr.trim().slice(0, 10));
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(year, month - 1, day);
      if (
        parsed.getFullYear() === year &&
        parsed.getMonth() === month - 1 &&
        parsed.getDate() === day
      ) {
        return parsed;
      }
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Check whether a YYYY-MM-DD string matches today's date in the user's LOCAL timezone. */
export function isLocalToday(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return dateStr.trim().slice(0, 10) === getLocalTodayIso();
}

/** Add or subtract days cleanly in local time across month/year boundaries. */
export function addDaysLocal(dateStr: string, deltaDays: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDateIso(d);
}

/**
 * Add or subtract months cleanly in local time, clamping day to the target month's
 * last valid day (e.g. Mar 31 - 1 month => Feb 28/29 instead of overflowing into March).
 */
export function addMonthsLocal(dateStr: string, deltaMonths: number): string {
  const d = parseLocalDate(dateStr);
  const originalDay = d.getDate();
  const targetFirst = new Date(d.getFullYear(), d.getMonth() + deltaMonths, 1);
  const lastDayOfTarget = new Date(
    targetFirst.getFullYear(),
    targetFirst.getMonth() + 1,
    0
  ).getDate();
  const clampedDay = Math.min(originalDay, lastDayOfTarget);
  return formatLocalDateIso(
    new Date(targetFirst.getFullYear(), targetFirst.getMonth(), clampedDay)
  );
}

/** Compute Monday-to-Sunday 7-day range for a local YYYY-MM-DD date. */
export function getWeekDatesLocal(dateStr: string): {
  start: string;
  end: string;
  dates: string[];
} {
  const base = parseLocalDate(dateStr);
  // JS getDay(): Sun=0, Mon=1..Sat=6 -> Monday offset 0..6
  const mondayOffset = (base.getDay() + 6) % 7;
  const monday = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() - mondayOffset
  );
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + i
    );
    dates.push(formatLocalDateIso(dayDate));
  }
  return {
    start: dates[0],
    end: dates[6],
    dates,
  };
}

/** Format YYYY-MM-DD as readable long date, e.g. "November 18, 2026". */
export function formatLongDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format YYYY-MM-DD as compact weekday date, e.g. "Wed, Nov 18, 2026". */
export function formatShortWeekdayDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Format header date label based on active Day / Week / Month view. */
export function formatCalendarPeriodLabel(
  selectedDate: string,
  view: CalendarViewType,
  startDate?: string,
  endDate?: string
): string {
  if (view === 'month') {
    const d = parseLocalDate(selectedDate);
    return d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  if (view === 'week') {
    const week =
      startDate && endDate
        ? { start: startDate, end: endDate }
        : getWeekDatesLocal(selectedDate);
    const s = parseLocalDate(week.start);
    const e = parseLocalDate(week.end);
    const sameYear = s.getFullYear() === e.getFullYear();
    const startFmt = s.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
    const endFmt = e.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${startFmt} – ${endFmt}`;
  }

  return formatShortWeekdayDate(selectedDate);
}

/** Format heading scope label (e.g. "November 18, 2026", "Nov 16 – Nov 22, 2026", "November 2026"). */
export function formatSummaryScopeLabel(
  selectedDate: string,
  view: CalendarViewType,
  startDate?: string,
  endDate?: string
): string {
  if (view === 'day') {
    return formatLongDate(selectedDate);
  }
  return formatCalendarPeriodLabel(selectedDate, view, startDate, endDate);
}

/** Format "HH:MM:SS" or ISO timestamp to readable 12-hour time like "10:30 AM". */
export function formatDisplayTime(timeOrIso?: string | null): string {
  if (!timeOrIso) return 'All Day';
  const trimmed = timeOrIso.trim();
  if (!trimmed) return 'All Day';

  // Handle "HH:MM" or "HH:MM:SS"
  const hhmmMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (hhmmMatch) {
    const h = Number(hhmmMatch[1]);
    const m = Number(hhmmMatch[2]);
    const dt = new Date(2000, 0, 1, h, m);
    return dt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Handle ISO datetime string
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return trimmed;
}
