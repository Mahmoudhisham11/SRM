/**
 * Calendar-date helpers. All dates in the app are stored as ISO "YYYY-MM-DD"
 * strings (no time, no timezone), which sort correctly and never shift by a
 * day when the phone and laptop are in different timezones.
 */

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export interface DateParts {
  y: number;
  m: number; // 1-12
  d: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidParts({ y, m, d }: DateParts): boolean {
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) &&
    y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function toISO({ y, m, d }: DateParts): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseISO(iso: string): DateParts | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const parts = { y: +m[1], m: +m[2], d: +m[3] };
  return isValidParts(parts) ? parts : null;
}

export function isISODate(value: unknown): value is string {
  return typeof value === "string" && parseISO(value) !== null;
}

/** Today in the user's local timezone, as ISO. */
export function todayISO(now: Date = new Date()): string {
  return toISO({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

export function addDays(iso: string, days: number): string {
  const p = parseISO(iso);
  if (!p) throw new Error(`Invalid ISO date: ${iso}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toISO({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** "2025-03-15" → "15-Mar-2025" (the SRM_Issues_Log format). */
export function formatDMY(iso: string | undefined | null): string {
  if (!iso) return "";
  const p = parseISO(iso);
  if (!p) return "";
  return `${String(p.d).padStart(2, "0")}-${MONTHS_SHORT[p.m - 1]}-${p.y}`;
}

/** "15-Mar-2025" → "2025-03-15" (also accepts "15-03-2025"). */
export function parseDMY(text: string): string | null {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3,}|\d{1,2})[-/ ](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = /^\d+$/.test(m[2])
    ? +m[2]
    : MONTHS_SHORT.findIndex((s) => s.toLowerCase() === m[2].slice(0, 3).toLowerCase()) + 1;
  const parts = { y: +m[3], m: month, d: +m[1] };
  return isValidParts(parts) ? toISO(parts) : null;
}

/** Date objects for Excel cells: midnight UTC so the serial number is exact. */
export function isoToUTCDate(iso: string): Date {
  const p = parseISO(iso)!;
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

/** "2025-03" key for monthly grouping. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function formatMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Start of the week containing `iso` (default Sunday, the Egyptian work week). */
export function startOfWeek(iso: string, weekStartsOn = 0 /* 0 = Sunday */): string {
  const p = parseISO(iso)!;
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function endOfMonth(iso: string): string {
  const p = parseISO(iso)!;
  return toISO({ y: p.y, m: p.m, d: daysInMonth(p.y, p.m) });
}
