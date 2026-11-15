/**
 * Spoken-date parser for Egyptian Arabic / MSA / English dictation.
 *
 * Supported (day-first, as written in Egypt):
 *   "15 مارس", "١٥ مارس ٢٠٢٥", "15 من مارس", "مارس 15", "March 15 2024"
 *   "15/3", "15-3-2025", "15/3/25", "2025-03-15", "15 / 3"
 *   "خمستاشر تلاتة", "واحد وعشرين اتناشر", "خمسة عشر شهر تلاتة"
 *   "15 شهر 3", "اول مارس", "آخر فبراير"
 *   "النهارده", "امبارح", "اول امبارح", "بكرة"
 *   optional year: "15 مارس 2024", "15 مارس سنة 24", "15/3 الفين اربعة وعشرين"
 *
 * Dates spoken without a year get `ctx.defaultYear` (the session's
 * back-fill year). Relative words ("امبارح") always use the real `today`.
 */
import { addDays, daysInMonth, isValidParts, toISO, todayISO } from "../dates";
import { normalizeArabic, normSet, tokenize, type Token } from "./normalize";
import { readNumber } from "./numbers";

export interface DateContext {
  /** Year used when the speaker doesn't say one. */
  defaultYear: number;
  /** Today's date (ISO). Defaults to the real local date. */
  today?: string;
}

export interface DateRead {
  iso: string;
  /** Index of the first token not consumed. */
  end: number;
  /** True when no year was spoken and `ctx.defaultYear` was used. */
  yearInferred?: boolean;
}

const MONTH_WORDS: Array<[number, string[]]> = [
  [1, ["يناير", "ينايِر", "january", "jan", "كانون الثاني", "جانفي"]],
  [2, ["فبراير", "فبرير", "february", "feb", "شباط", "فيفري"]],
  [3, ["مارس", "march", "mar", "آذار", "اذار"]],
  [4, ["أبريل", "ابريل", "إبريل", "ابرايل", "april", "apr", "نيسان", "أفريل"]],
  [5, ["مايو", "ماي", "may", "أيار", "ايار"]],
  [6, ["يونيو", "يونيه", "يونية", "june", "jun", "حزيران", "جوان"]],
  [7, ["يوليو", "يوليه", "يولية", "july", "jul", "تموز", "جويلية"]],
  [8, ["أغسطس", "اغسطس", "أغسطوس", "august", "aug", "آب", "أوت"]],
  [9, ["سبتمبر", "september", "sep", "sept", "أيلول"]],
  [10, ["أكتوبر", "اكتوبر", "october", "oct", "تشرين الأول"]],
  [11, ["نوفمبر", "november", "nov", "تشرين الثاني"]],
  [12, ["ديسمبر", "december", "dec", "كانون الأول"]],
];

/** Normalized month phrase (1 or 2 words) → month number. */
const MONTHS = new Map<string, number>();
for (const [m, words] of MONTH_WORDS) for (const w of words) MONTHS.set(normalizeArabic(w), m);

const TODAY = normSet(["النهارده", "النهاردة", "النهاردا", "انهارده", "إنهارده", "اليوم", "today"]);
const YESTERDAY = normSet(["امبارح", "إمبارح", "مبارح", "أمس", "امس", "البارحة", "yesterday"]);
const TOMORROW = normSet(["بكرة", "بكره", "بكرا", "غدا", "غداً", "tomorrow"]);
const FIRST = normSet(["أول", "اول", "first"]);
const LAST = normSet(["آخر", "اخر", "last"]);
const BEFORE = normSet(["قبل"]);
const AFTER = normSet(["بعد"]);
const MONTH_WORD = normSet(["شهر", "month"]);
const YEAR_WORD = normSet(["سنة", "سنه", "عام", "year"]);
const OF = normSet(["من", "of"]);
/** Filler words people say before a date ("يوم 15", "بتاريخ 15/3"). */
export const DATE_FILLERS = normSet(["يوم", "في", "فى", "بتاريخ", "تاريخ", "التاريخ", "on", "the"]);

function readMonthName(tokens: Token[], i: number): { month: number; end: number } | null {
  if (i >= tokens.length) return null;
  if (i + 1 < tokens.length) {
    const two = MONTHS.get(`${tokens[i].norm} ${tokens[i + 1].norm}`);
    if (two) return { month: two, end: i + 2 };
  }
  const one = MONTHS.get(tokens[i].norm);
  return one ? { month: one, end: i + 1 } : null;
}

/** A plain integer in [min, max] read as one number group. */
function readInt(tokens: Token[], i: number, min: number, max: number) {
  if (i >= tokens.length) return null;
  const r = readNumber(tokens, i);
  if (!r || r.hasScale || !Number.isInteger(r.value) || r.value < min || r.value > max) return null;
  return r;
}

/** Tokens that only separate day/month/year: "/", "-", ".", "،". */
function isSeparator(t: Token | undefined): boolean {
  return !!t && (t.norm === "" || t.norm === "/" || t.norm === "\\");
}

function readMonth(tokens: Token[], i: number): { month: number; end: number } | null {
  let j = i;
  if (isSeparator(tokens[j])) j++;
  // "15 من مارس"
  if (j < tokens.length && OF.has(tokens[j].norm)) {
    const named = readMonthName(tokens, j + 1);
    if (named) return named;
  }
  const named = readMonthName(tokens, j);
  if (named) return named;
  // "15 شهر 3" / "15 شهر مارس"
  if (j < tokens.length && MONTH_WORD.has(tokens[j].norm)) {
    const afterWord = readMonthName(tokens, j + 1);
    if (afterWord) return afterWord;
    const n = readInt(tokens, j + 1, 1, 12);
    if (n) return { month: n.value, end: n.end };
    return null;
  }
  const n = readInt(tokens, j, 1, 12);
  return n ? { month: n.value, end: n.end } : null;
}

/** Optional trailing year. Returns null (and consumes nothing) if absent. */
function readYear(tokens: Token[], i: number): { year: number; end: number } | null {
  let j = i;
  if (isSeparator(tokens[j])) j++;
  let explicit = false;
  if (j < tokens.length && YEAR_WORD.has(tokens[j].norm)) {
    explicit = true;
    j++;
  }
  if (j >= tokens.length) return null;
  const r = readNumber(tokens, j);
  if (!r || !Number.isInteger(r.value)) return null;
  if (r.value >= 1900 && r.value <= 2200) return { year: r.value, end: r.end };
  // Two-digit years: "15/3 25", "سنة 24", "سنة اربعة وعشرين".
  const twoDigitDigits = r.digitsOnly && r.firstDigitsLength === 2;
  if (r.value >= 0 && r.value <= 99 && (explicit || twoDigitDigits)) return { year: 2000 + r.value, end: r.end };
  return null;
}

function build(y: number, m: number, d: number, end: number, yearInferred = false): DateRead | null {
  const parts = { y, m, d };
  if (!isValidParts(parts)) return null;
  return yearInferred ? { iso: toISO(parts), end, yearInferred } : { iso: toISO(parts), end };
}

const NUMERIC_DMY = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/;
const NUMERIC_YMD = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/;

/**
 * Try to read a date starting exactly at token `start` (after skipping fillers).
 */
export function readDate(tokens: Token[], start: number, ctx: DateContext): DateRead | null {
  const today = ctx.today ?? todayISO();
  let i = start;
  while (i < tokens.length && DATE_FILLERS.has(tokens[i].norm)) i++;
  if (i >= tokens.length) return null;
  const t = tokens[i].norm;
  const next = tokens[i + 1]?.norm;

  // --- Relative words -------------------------------------------------------
  if (TODAY.has(t)) return { iso: today, end: i + 1 };
  if ((FIRST.has(t) || BEFORE.has(t)) && next !== undefined && YESTERDAY.has(next)) {
    return { iso: addDays(today, -2), end: i + 2 }; // "اول امبارح"
  }
  if (AFTER.has(t) && next !== undefined && TOMORROW.has(next)) return { iso: addDays(today, 2), end: i + 2 };
  if (YESTERDAY.has(t)) return { iso: addDays(today, -1), end: i + 1 };
  if (TOMORROW.has(t)) return { iso: addDays(today, 1), end: i + 1 };

  // --- Numeric tokens: 15/3, 15-3-2025, 2025-03-15 -------------------------
  const ymd = NUMERIC_YMD.exec(t);
  if (ymd) return build(+ymd[1], +ymd[2], +ymd[3], i + 1);
  const dmy = NUMERIC_DMY.exec(t);
  if (dmy) {
    const d = +dmy[1];
    const m = +dmy[2];
    if (dmy[3]) {
      const y = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
      return build(y, m, d, i + 1);
    }
    const year = readYear(tokens, i + 1);
    return build(year?.year ?? ctx.defaultYear, m, d, year?.end ?? i + 1, !year);
  }

  // --- "أول مارس" / "آخر فبراير" -------------------------------------------
  if (FIRST.has(t) || LAST.has(t)) {
    let j = i + 1;
    if (j < tokens.length && MONTH_WORD.has(tokens[j].norm)) {
      const named = readMonthName(tokens, j + 1);
      const num = named ? null : readInt(tokens, j + 1, 1, 12);
      const month = named?.month ?? num?.value;
      if (month) j = named?.end ?? num!.end;
      else return null;
      return finishFirstLast(tokens, j, month, FIRST.has(t), ctx);
    }
    const named = readMonthName(tokens, j);
    if (named) return finishFirstLast(tokens, named.end, named.month, FIRST.has(t), ctx);
    return null;
  }

  // --- "March 15" / "مارس 15" ----------------------------------------------
  const monthFirst = readMonthName(tokens, i);
  if (monthFirst) {
    const day = readInt(tokens, monthFirst.end, 1, 31);
    if (!day) return null;
    const year = readYear(tokens, day.end);
    return build(year?.year ?? ctx.defaultYear, monthFirst.month, day.value, year?.end ?? day.end, !year);
  }

  // --- Day then month: "15 مارس", "خمستاشر تلاتة", "15 / 3" -----------------
  const day = readInt(tokens, i, 1, 31);
  if (!day) return null;
  const month = readMonth(tokens, day.end);
  if (!month) return null;
  const year = readYear(tokens, month.end);
  return build(year?.year ?? ctx.defaultYear, month.month, day.value, year?.end ?? month.end, !year);
}

function finishFirstLast(tokens: Token[], j: number, month: number, first: boolean, ctx: DateContext) {
  const year = readYear(tokens, j);
  const y = year?.year ?? ctx.defaultYear;
  return build(y, month, first ? 1 : daysInMonth(y, month), year?.end ?? j, !year);
}

/**
 * Find the first date anywhere in `text`. Lenient on purpose: in guided mode
 * people add words around the date ("كان يوم 15 مارس تقريبا").
 */
export function parseSpokenDate(text: string, ctx: DateContext): string | null {
  return parseSpokenDateInfo(text, ctx)?.iso ?? null;
}

/** Like `parseSpokenDate`, but also says whether the year was inferred. */
export function parseSpokenDateInfo(text: string, ctx: DateContext): { iso: string; yearInferred: boolean } | null {
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const r = readDate(tokens, i, ctx);
    if (r) return { iso: r.iso, yearInferred: !!r.yearInferred };
  }
  return null;
}

/** Longest case that may run across New Year when the End Date's year isn't said. */
const MAX_ROLLOVER_DAYS = 183;

/**
 * A case that runs across New Year: «من 20 ديسمبر لحد 5 يناير». Both dates
 * get the default year, so the End Date lands before the Start Date. When the
 * End Date's year wasn't spoken, its month is earlier in the year than the
 * Start Date's, and the case would then last at most ~6 months, move the End
 * Date to the next year. Anything else (e.g. 20 March → 15 March) stays an
 * error for the user to fix.
 */
export function rollEndDateForward(startIso: string | null, endIso: string | null, endYearInferred: boolean): string | null {
  if (!startIso || !endIso || !endYearInferred || endIso >= startIso) return endIso;
  const y = Number(endIso.slice(0, 4)) + 1;
  const m = Number(endIso.slice(5, 7));
  const d = Number(endIso.slice(8, 10));
  if (m >= Number(startIso.slice(5, 7))) return endIso;
  if (!isValidParts({ y, m, d })) return endIso; // 29 Feb → no such day next year
  const rolled = toISO({ y, m, d });
  const days = (Date.parse(`${rolled}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 86_400_000;
  return rolled >= startIso && days <= MAX_ROLLOVER_DAYS ? rolled : endIso;
}

/** Parse a spoken End Date relative to the case's Start Date (handles New Year rollover). */
export function parseSpokenEndDate(text: string, startIso: string | null, ctx: DateContext): string | null {
  const r = parseSpokenDateInfo(text, ctx);
  if (!r) return null;
  return rollEndDateForward(startIso, r.iso, r.yearInferred);
}
