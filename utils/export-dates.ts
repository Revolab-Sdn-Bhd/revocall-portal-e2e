/**
 * Date helpers for the Conversation Logs export specs. All dates are plain "yyyy-mm-dd" strings
 * (the format of the app's date inputs), so no time zone can shift them by accident.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** `iso` moved by `days` (negative = earlier). */
export function shiftDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Today as yyyy-mm-dd in the given IANA time zone. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** 2026-11-03 gives 03112026, the date format of the Call export file name. */
export function compactDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}${month}${year}`;
}

/** Call export file name part for a range, e.g. "27102026_to_02112026". */
export function rangeFilenamePart(from: string, to: string): string {
  return `${compactDate(from)}_to_${compactDate(to)}`;
}

const parts = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month: MONTHS[month - 1], day };
};

/**
 * Label of the Date range button: "Nov 3, 2026", "Nov 2 – 3, 2026", "Oct 27 – Nov 2, 2026" or
 * "Jan 1, 2025 – Nov 3, 2026" (en dash with spaces).
 */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${a.month} ${a.day}, ${a.year}`;
  if (a.year !== b.year) return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`;
  if (a.month !== b.month) return `${a.month} ${a.day} – ${b.month} ${b.day}, ${a.year}`;
  return `${a.month} ${a.day} – ${b.day}, ${a.year}`;
}

/** Date part of a list cell such as "3 Nov 2026, 1:23 AM" as yyyy-mm-dd. */
export function listDate(text: string): string {
  const match = /^(\d{1,2}) (\w{3}) (\d{4}),/.exec(text.trim());
  if (!match) throw new Error(`Unexpected list date "${text}"`);
  const month = MONTHS.indexOf(match[2]) + 1;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

/** A list cell such as "3 Nov 2026, 1:23 AM" as "2026-11-03 01:23" (24 hour clock). */
export function listDateTime(text: string): string {
  const match = /,\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text.trim());
  if (!match) throw new Error(`Unexpected list time "${text}"`);
  const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${listDate(text)} ${String(hour).padStart(2, '0')}:${match[2]}`;
}

/** A list duration such as "1m 22s" in seconds. */
export function listDurationSeconds(text: string): number {
  const match = /^(\d+)m (\d+)s$/.exec(text.trim());
  if (!match) throw new Error(`Unexpected list duration "${text}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** An ISO instant as "yyyy-mm-dd HH:mm:ss" on the wall clock of `timeZone` (how the export writes times). */
export function toWallClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
