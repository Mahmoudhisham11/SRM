/**
 * Spoken Arabic (Egyptian + MSA) number parsing.
 *
 *   "801 ألف"            → 801000
 *   "مليون وربع"         → 1250000
 *   "خمسة وعشرين ألف"    → 25000
 *   "تلتمية وخمسين"      → 350
 *   "١٥٠٠"               → 1500
 *
 * The core is `readNumber`, a token reader that consumes the longest run of
 * tokens forming one number and reports where it stopped. The date parser uses
 * it to read day / month / year groups, so the grouping rules matter:
 *
 *  - Tokens joined by "و" belong to the same number ("واحد وعشرين" = 21).
 *  - Two bare numbers side by side are two separate numbers
 *    ("خمستاشر تلاتة" = 15, then 3) — that is how people dictate dates.
 *  - A scale word multiplies what came before it ("801 ألف"), and a number
 *    right after a scale continues it ("ألفين خمسة وعشرين" = 2025).
 *  - unit + "عشر" is an MSA teen ("خمسة عشر" = 15); unit + "مية" is a hundred
 *    ("تلات مية" = 300). Note "عشرة" (with ة) is NOT joined: in Egyptian speech
 *    "تلاتة عشرة" means 3 then 10 (a day and a month).
 */
import { normalizeArabic, normSet, tokenize, toLatinDigits, type Token } from "./normalize";

type Kind =
  | "unit" // 0-9
  | "teenSuffix" // عشر (joins a preceding unit into a teen)
  | "ten" // 10, 20..90
  | "teen" // 11..19 (Egyptian single words)
  | "hundred"
  | "scale" // ألف / مليون / مليار (and plurals)
  | "dual" // ألفين / مليونين
  | "fraction"
  | "digits";

interface Lex {
  kind: Kind;
  value: number;
}

const LEXICON = new Map<string, Lex>();
function add(kind: Kind, value: number, words: string[]) {
  for (const w of words) LEXICON.set(normalizeArabic(w), { kind, value });
}

add("unit", 0, ["صفر", "zero"]);
add("unit", 1, ["واحد", "واحدة", "أحد", "one"]);
add("unit", 2, ["اتنين", "إتنين", "اثنين", "اثنان", "اثنا", "اثني", "two"]);
add("unit", 3, ["تلاتة", "تلات", "ثلاثة", "ثلاث", "three"]);
add("unit", 4, ["أربعة", "اربعة", "أربع", "اربع", "four"]);
add("unit", 5, ["خمسة", "خمس", "five"]);
add("unit", 6, ["ستة", "ست", "six"]);
add("unit", 7, ["سبعة", "سبع", "seven"]);
add("unit", 8, ["تمانية", "تماني", "تمنية", "تمان", "تمن", "ثمانية", "ثماني", "ثمان", "eight"]);
add("unit", 9, ["تسعة", "تسع", "nine"]);
add("teenSuffix", 10, ["عشر"]);
add("ten", 10, ["عشرة", "ten"]);
add("teen", 11, ["حداشر", "احداشر", "حداشير", "eleven"]);
add("teen", 12, ["اتناشر", "إتناشر", "اطناشر", "twelve"]);
add("teen", 13, ["تلتاشر", "تلاتاشر", "تلطاشر", "thirteen"]);
add("teen", 14, ["أربعتاشر", "اربعتاشر", "اربعطاشر", "اربعتاشير", "fourteen"]);
add("teen", 15, ["خمستاشر", "خمسطاشر", "خمساشر", "fifteen"]);
add("teen", 16, ["ستاشر", "سطاشر", "سيتاشر", "sixteen"]);
add("teen", 17, ["سبعتاشر", "سبعطاشر", "سباتاشر", "seventeen"]);
add("teen", 18, ["تمنتاشر", "تمنطاشر", "تمانتاشر", "eighteen"]);
add("teen", 19, ["تسعتاشر", "تسعطاشر", "تساتاشر", "nineteen"]);
add("ten", 20, ["عشرين", "عشرون", "twenty"]);
add("ten", 30, ["تلاتين", "ثلاثين", "ثلاثون", "thirty"]);
add("ten", 40, ["أربعين", "اربعين", "أربعون", "forty"]);
add("ten", 50, ["خمسين", "خمسون", "fifty"]);
add("ten", 60, ["ستين", "ستون", "sixty"]);
add("ten", 70, ["سبعين", "سبعون", "seventy"]);
add("ten", 80, ["تمانين", "ثمانين", "ثمانون", "eighty"]);
add("ten", 90, ["تسعين", "تسعون", "ninety"]);
add("hundred", 100, ["مية", "ميه", "مائة", "مئة", "ماية", "ميت", "hundred"]);
add("hundred", 200, ["ميتين", "مئتين", "مائتين", "مايتين", "مئتان", "مائتان"]);
add("hundred", 300, ["تلتمية", "تلاتمية", "تلتميت", "ثلاثمائة", "ثلاثمئة", "ثلثمائة"]);
add("hundred", 400, ["ربعمية", "أربعمية", "اربعمية", "أربعمائة", "اربعمائة", "أربعمئة"]);
add("hundred", 500, ["خمسمية", "خمسميت", "خمسمائة", "خمسمئة"]);
add("hundred", 600, ["ستمية", "ستميت", "ستمائة", "ستمئة"]);
add("hundred", 700, ["سبعمية", "سبعميت", "سبعمائة", "سبعمئة"]);
add("hundred", 800, ["تمنمية", "تمانمية", "تمنميت", "ثمانمائة", "ثمانمئة", "ثمنمائة"]);
add("hundred", 900, ["تسعمية", "تسعميت", "تسعمائة", "تسعمئة"]);
add("scale", 1_000, ["ألف", "الف", "آلاف", "الاف", "تلاف", "ألوف", "thousand"]);
add("scale", 1_000_000, ["مليون", "ملايين", "million"]);
add("scale", 1_000_000_000, ["مليار", "مليارات", "بليون", "billion"]);
add("dual", 2_000, ["ألفين", "الفين", "ألفان", "الفان"]);
add("dual", 2_000_000, ["مليونين", "مليونان"]);
add("dual", 2_000_000_000, ["مليارين", "ملياران"]);
add("fraction", 0.5, ["نص", "نصف", "half"]);
add("fraction", 0.25, ["ربع", "quarter"]);
add("fraction", 1 / 3, ["تلت", "ثلث"]);

const THREE = normSet(["تلت", "تلات", "تلاتة", "ثلاث", "ثلاثة"]);
const QUARTERS = normSet(["تربع", "أرباع", "ارباع"]);
const CONJ = normalizeArabic("و");

const DIGITS_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

interface Classified extends Lex {
  /** Token started with the conjunction "و" (e.g. "وعشرين"). */
  conj: boolean;
  /** How many tokens this item spans (2 for "تلت تربع"). */
  span: number;
}

function lookup(norm: string): Lex | undefined {
  if (DIGITS_RE.test(norm)) return { kind: "digits", value: Number(norm.replace(/,/g, "")) };
  return LEXICON.get(norm);
}

function classify(tokens: Token[], i: number): Classified | null {
  const norm = tokens[i].norm;
  const next = tokens[i + 1]?.norm;
  const tryWord = (w: string, conj: boolean): Classified | null => {
    if (THREE.has(w) && next !== undefined && QUARTERS.has(next)) {
      return { kind: "fraction", value: 0.75, conj, span: 2 };
    }
    const lex = lookup(w);
    return lex ? { ...lex, conj, span: 1 } : null;
  };
  // Try the word as-is first: "واحد" starts with و but is not "و + احد".
  const direct = tryWord(norm, false);
  if (direct) return direct;
  if (norm.length > 1 && norm.startsWith(CONJ)) return tryWord(norm.slice(1), true);
  return null;
}

const NUMERIC_KINDS: ReadonlySet<Kind> = new Set(["unit", "teenSuffix", "ten", "teen", "hundred", "digits", "fraction"]);

export interface NumberRead {
  value: number;
  /** Index of the first token NOT consumed. */
  end: number;
  /** True if a scale (ألف/مليون/…) was involved: "801 ألف", "مليونين". */
  hasScale: boolean;
  /** True if only plain digits were read (no number words). */
  digitsOnly: boolean;
  /** Digit count of the first token when it was digits (e.g. 2 for "25"). */
  firstDigitsLength: number;
}

/**
 * Read one spoken number starting at token `start`.
 * Returns null if no number starts there.
 */
export function readNumber(tokens: Token[], start: number): NumberRead | null {
  let total = 0;
  let current = 0;
  let lastScale = 0;
  let prev: Kind | null = null;
  let prevUnitValue = 0;
  let pendingConj = false;
  let hasScale = false;
  let digitsOnly = true;
  let firstDigitsLength = 0;
  let end = start;
  let i = start;

  while (i < tokens.length) {
    const first = i === start;
    if (tokens[i].norm === CONJ) {
      if (first) return null;
      pendingConj = true;
      i++;
      continue;
    }
    const c = classify(tokens, i);
    if (!c) break;
    const conj = c.conj || pendingConj;
    pendingConj = false;

    if (first) {
      if (conj) return null;
    } else {
      const afterScale = prev === "scale" || prev === "dual";
      let allowed = false;
      if (conj) allowed = true;
      else if (c.kind === "scale" && prev !== null && NUMERIC_KINDS.has(prev)) allowed = true;
      else if (c.kind === "teenSuffix" && prev === "unit") allowed = true;
      else if (c.kind === "hundred" && c.value === 100 && prev === "unit") allowed = true;
      else if (afterScale && c.kind !== "digits" && c.kind !== "scale" && c.kind !== "dual") allowed = true;
      if (!allowed) break;
    }
    // A fraction must attach to something: a scale ("مليون وربع"), a running
    // value ("اتنين ونص") or a following scale ("ربع مليون").
    if (c.kind === "fraction" && !(first || current > 0 || prev === "scale" || prev === "dual")) break;

    switch (c.kind) {
      case "hundred":
        if (!conj && prev === "unit" && c.value === 100) {
          current = current - prevUnitValue + prevUnitValue * 100; // "تلات مية"
        } else current += c.value;
        break;
      case "scale":
        if (current === 0) current = 1;
        total += current * c.value;
        current = 0;
        lastScale = c.value;
        hasScale = true;
        break;
      case "dual":
        total += current + c.value;
        current = 0;
        lastScale = c.value / 2;
        hasScale = true;
        break;
      case "fraction":
        if (prev === "scale" || prev === "dual") total += c.value * lastScale; // "مليون وربع"
        else current += c.value; // "ربع مليون", "اتنين ونص"
        break;
      default:
        if (c.kind === "digits" && first) firstDigitsLength = tokens[i].norm.replace(/[,.]/g, "").length;
        current += c.value;
    }

    if (c.kind !== "digits") digitsOnly = false;
    prev = c.kind;
    if (c.kind === "unit") prevUnitValue = c.value;
    i += c.span;
    end = i;
  }

  if (end === start) return null;
  const value = Math.round((total + current) * 100) / 100;
  return { value, end, hasScale, digitsOnly, firstDigitsLength };
}

/** Parse a whole string as a single number. Returns null if anything is left over. */
export function parseArabicNumber(text: string): number | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  const r = readNumber(tokens, 0);
  return r && r.end === tokens.length ? r.value : null;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const TRAILING_PUNCT = /[.,;:!?،؛؟…]+$/;

/**
 * Replace spoken amounts inside free text with digits, conservatively:
 * only phrases that involve a scale word are rewritten ("801 ألف" → "801,000"),
 * so ordinary words like "واحد" in a sentence stay untouched.
 * Arabic-Indic digits are always converted to Latin digits.
 */
export function replaceSpokenNumbers(text: string): string {
  const tokens = tokenize(text);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const r = readNumber(tokens, i);
    if (r && r.hasScale) {
      const trailing = tokens[r.end - 1].raw.match(TRAILING_PUNCT)?.[0] ?? "";
      out.push(formatNumber(r.value) + trailing);
      i = r.end;
    } else {
      out.push(toLatinDigits(tokens[i].raw));
      i++;
    }
  }
  return out.join(" ");
}
