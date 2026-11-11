/**
 * Text normalization shared by all Arabic parsers.
 *
 * Speech engines (and people typing) produce many spellings of the same word:
 * أ/إ/آ/ا, ى/ي, ة/ه, with or without diacritics. We fold all of them to a
 * single canonical form before matching against keyword/number lexicons.
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Arabic-Indic and Persian digits (and Arabic separators) to ASCII. */
export function toLatinDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    const p = PERSIAN.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    if (ch === "٫") out += "."; // Arabic decimal separator
    else if (ch === "٬") out += ","; // Arabic thousands separator
    else out += ch;
  }
  return out;
}

/** Fold a single word/phrase to the canonical matching form. */
export function normalizeArabic(input: string): string {
  return toLatinDigits(input)
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, "") // diacritics (tashkeel)
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/،/g, ",")
    .replace(/؛/g, ";")
    .replace(/؟/g, "?");
}

/** Punctuation we strip from the edges of a token before matching. */
const EDGE_PUNCT = /^[\s"'«»“”()[\]{}.,;:!?…\-–—]+|[\s"'«»“”()[\]{}.,;:!?…\-–—]+$/g;

export interface Token {
  /** Original text as it appeared (used when rebuilding free text). */
  raw: string;
  /** Normalized form used for matching (edge punctuation removed). */
  norm: string;
}

/** Split text on whitespace into tokens carrying both raw and normalized forms. */
export function tokenize(input: string): Token[] {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, norm: normalizeArabic(raw).replace(EDGE_PUNCT, "") }))
    .filter((t) => t.raw.length > 0);
}

/** Collapse runs of whitespace and trim. */
export function cleanSpaces(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/** Build a Set of normalized words from raw spellings. */
export function normSet(words: string[]): Set<string> {
  return new Set(words.map((w) => normalizeArabic(w)));
}
