/**
 * Free-mode parsing: one utterance → case fields.
 *
 * Parsers sit behind the `CaseParser` interface so an LLM-backed parser can be
 * added later without touching the UI: implement `parse`, register it in
 * `CASE_PARSERS`, and select it by id (see README → "Plugging in an LLM parser").
 */
import { cleanSpaces, normalizeArabic, tokenize, type Token } from "./normalize";
import { readDate, rollEndDateForward, type DateContext } from "./arabicDates";
import { replaceSpokenNumbers } from "./numbers";

export interface ParsedCase {
  case: string;
  taskBar: string;
  /** ISO date or null if not found / not understood. */
  startDate: string | null;
  endDate: string | null;
  comments: string;
  /** The text the date was read from, for showing the user what was heard. */
  startDateText: string;
  endDateText: string;
  /** True when the Case was introduced by a «كيس» keyword (not just leading text). */
  caseExplicit: boolean;
}

export interface CaseParser {
  readonly id: string;
  readonly label: string;
  parse(transcript: string, ctx: DateContext): Promise<ParsedCase>;
}

type TextField = "case" | "taskBar" | "comments";
type DateField = "startDate" | "endDate";

const TEXT_MARKERS: Array<[TextField, string[]]> = [
  ["case", ["كيس", "الكيس", "كايس", "case"]],
  ["taskBar", ["تاسك باي", "التاسك باي", "task by", "تاسك بار", "التاسك بار", "تاسك", "التاسك", "task bar", "taskbar", "task", "المهمة", "مهمة"]],
  ["comments", ["ملاحظة", "ملاحظات", "الملاحظات", "كومنت", "كومنتس", "الكومنت", "comment", "comments", "تعليق"]],
];

const DATE_MARKERS: Array<[DateField, string[]]> = [
  ["startDate", ["تاريخ البداية", "تاريخ البدء", "start date", "بداية", "البداية", "بدأ", "بدات", "بدأت", "من", "start", "ستارت"]],
  ["endDate", ["تاريخ النهاية", "تاريخ الانتهاء", "end date", "نهاية", "النهاية", "لحد", "لغاية", "إلى", "الى", "حتى", "end", "اند", "اتقفل", "اتقفلت", "خلص", "خلصت", "اتحل", "اتحلت"]],
];

interface Marker {
  field: TextField | DateField;
  len: number;
}

const MARKERS = new Map<string, Marker>();
for (const [field, words] of [...TEXT_MARKERS, ...DATE_MARKERS] as Array<[TextField | DateField, string[]]>) {
  for (const w of words) {
    const norm = normalizeArabic(w);
    MARKERS.set(norm, { field, len: norm.split(" ").length });
  }
}

function markerAt(tokens: Token[], i: number): Marker | null {
  for (const len of [2, 1]) {
    if (i + len > tokens.length) continue;
    const key = tokens.slice(i, i + len).map((t) => t.norm).join(" ");
    const m = MARKERS.get(key);
    if (m) return m;
  }
  return null;
}

function isDateField(f: string): f is DateField {
  return f === "startDate" || f === "endDate";
}

export function cleanText(raw: string): string {
  return cleanSpaces(replaceSpokenNumbers(raw)).replace(/^[\s:،,.\-–]+|[\s:،,\-–]+$/g, "");
}

/** Keyword-rule parser (default, free, offline). */
export class RuleBasedCaseParser implements CaseParser {
  readonly id = "rules";
  readonly label = "قواعد الكلمات المفتاحية";

  async parse(transcript: string, ctx: DateContext): Promise<ParsedCase> {
    return this.parseSync(transcript, ctx);
  }

  parseSync(transcript: string, ctx: DateContext): ParsedCase {
    const tokens = tokenize(transcript);
    const buckets: Record<TextField, string[]> = { case: [], taskBar: [], comments: [] };
    const result: ParsedCase = {
      case: "", taskBar: "", comments: "",
      startDate: null, endDate: null, startDateText: "", endDateText: "",
      caseExplicit: false,
    };
    let endYearInferred = false;
    // Text before any marker is the Case; text after a date goes to Comments.
    let current: TextField = "case";
    let sawExplicitCase = false;

    let i = 0;
    while (i < tokens.length) {
      const m = markerAt(tokens, i);
      if (m && isDateField(m.field)) {
        const d = readDate(tokens, i + m.len, ctx);
        // Date markers like "من"/"لحد" are ordinary words unless a date follows.
        if (d && !result[m.field]) {
          result[m.field] = d.iso;
          result[`${m.field}Text` as const] = tokens.slice(i, d.end).map((t) => t.raw).join(" ");
          if (m.field === "endDate") endYearInferred = !!d.yearInferred;
          i = d.end;
          current = "comments";
          continue;
        }
      } else if (m) {
        const field = m.field as TextField;
        if (field === "case") {
          // Text said before an explicit "كيس" marker isn't the case title.
          if (!sawExplicitCase && buckets.case.length) buckets.comments.push(...buckets.case.splice(0));
          sawExplicitCase = true;
        }
        current = field;
        i += m.len;
        continue;
      }
      buckets[current].push(tokens[i].raw);
      i++;
    }

    result.endDate = rollEndDateForward(result.startDate, result.endDate, endYearInferred);
    result.caseExplicit = sawExplicitCase;
    result.case = cleanText(buckets.case.join(" "));
    result.taskBar = cleanText(buckets.taskBar.join(" "));
    result.comments = cleanText(buckets.comments.join(" "));
    return result;
  }
}

export const ruleBasedParser = new RuleBasedCaseParser();

/** Registry. Add an LLM parser here later; the UI picks by id. */
export const CASE_PARSERS: Record<string, CaseParser> = {
  [ruleBasedParser.id]: ruleBasedParser,
};

export function getCaseParser(id: string | undefined): CaseParser {
  return (id && CASE_PARSERS[id]) || ruleBasedParser;
}
