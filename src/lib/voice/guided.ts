/**
 * Guided-mode state machine (pure, unit-tested).
 *
 * The app asks for one field at a time: Case → Task By → Start Date →
 * End Date → Comments → review. Speech is appended to the current field;
 * commands move between fields. "حفظ" is surfaced as `saveRequested` so the
 * component can validate and persist, then `reset` for the next case.
 */
import { parseSpokenDate, parseSpokenEndDate, type DateContext } from "../parsing/arabicDates";
import { cleanText, type ParsedCase } from "../parsing/caseParser";
import { CASE_FIELDS, DATE_FIELDS, type CaseField } from "../types";
import { validateCaseFields, type FieldErrors } from "../validation";
import { splitCommands, type VoiceCommand } from "./commands";

/** Index CASE_FIELDS.length (5) is the "review / say حفظ" step. */
export const REVIEW_STEP = CASE_FIELDS.length;

export interface GuidedState {
  step: number;
  values: Record<CaseField, string>;
  /** Every final transcript of this case, in order (stored on the case). */
  transcript: string[];
  /** Incremented each time the user asks to save; the UI reacts to changes. */
  saveRequested: number;
}

export type GuidedAction =
  | { type: "speech"; text: string }
  | { type: "command"; command: VoiceCommand }
  | { type: "setField"; field: CaseField; value: string }
  | { type: "setValues"; values: Record<CaseField, string>; transcript?: string[] }
  | { type: "goto"; step: number }
  | { type: "reset" };

export function emptyValues(): Record<CaseField, string> {
  return { case: "", taskBar: "", startDate: "", endDate: "", comments: "" };
}

export function initialGuidedState(): GuidedState {
  return { step: 0, values: emptyValues(), transcript: [], saveRequested: 0 };
}

function applyCommand(s: GuidedState, cmd: VoiceCommand): GuidedState {
  const field = CASE_FIELDS[s.step] as CaseField | undefined;
  switch (cmd) {
    case "next":
      return { ...s, step: Math.min(s.step + 1, REVIEW_STEP) };
    case "skip":
      return {
        ...s,
        values: field ? { ...s.values, [field]: "" } : s.values,
        step: Math.min(s.step + 1, REVIEW_STEP),
      };
    case "back":
      return { ...s, step: Math.max(s.step - 1, 0) };
    case "clear":
      return field ? { ...s, values: { ...s.values, [field]: "" } } : s;
    case "save":
      return { ...s, saveRequested: s.saveRequested + 1 };
  }
}

function appendToCurrent(s: GuidedState, text: string): GuidedState {
  const body = text.trim();
  if (!body) return s;
  const field = CASE_FIELDS[s.step] as CaseField | undefined;
  // Speaking at the review step adds to Comments (the last field).
  const target: CaseField = field ?? "comments";
  // For dates, a new utterance replaces the old one (people re-say the date).
  const prev = s.values[target];
  const value = DATE_FIELDS.has(target) || !prev ? body : `${prev} ${body}`;
  return { ...s, values: { ...s.values, [target]: value } };
}

export function guidedReducer(s: GuidedState, a: GuidedAction): GuidedState {
  switch (a.type) {
    case "speech": {
      const { leading, body, trailing } = splitCommands(a.text);
      let next: GuidedState = { ...s, transcript: [...s.transcript, a.text.trim()].filter(Boolean) };
      for (const c of leading) next = applyCommand(next, c);
      next = appendToCurrent(next, body);
      for (const c of trailing) next = applyCommand(next, c);
      return next;
    }
    case "command":
      return applyCommand(s, a.command);
    case "setField":
      return { ...s, values: { ...s.values, [a.field]: a.value } };
    case "setValues":
      return { ...s, values: { ...a.values }, transcript: a.transcript ?? s.transcript };
    case "goto":
      return { ...s, step: Math.max(0, Math.min(a.step, REVIEW_STEP)) };
    case "reset":
      return { ...initialGuidedState(), saveRequested: s.saveRequested };
  }
}

export interface CaseDraft {
  case: string;
  taskBar: string;
  startDate: string | null;
  endDate: string | null;
  comments: string;
}

/** Interpret the raw field texts (dates parsed, numbers normalized) and validate. */
export function buildDraft(values: Record<CaseField, string>, ctx: DateContext): {
  draft: CaseDraft;
  errors: FieldErrors<CaseField>;
} {
  const startDate = values.startDate.trim() ? parseSpokenDate(values.startDate, ctx) : null;
  const endDate = values.endDate.trim() ? parseSpokenEndDate(values.endDate, startDate, ctx) : null;
  const draft: CaseDraft = {
    case: cleanText(values.case),
    taskBar: cleanText(values.taskBar),
    startDate,
    endDate,
    comments: cleanText(values.comments),
  };
  const errors = validateCaseFields(draft);
  if (values.startDate.trim() && !startDate) errors.startDate = "err.dateNotUnderstood";
  if (values.endDate.trim() && !endDate) errors.endDate = "err.dateNotUnderstood";
  return { draft, errors };
}

/**
 * Free mode, after a failed save: merge what was just said into the fields
 * already on screen instead of replacing them («من 15 مارس» only sets the
 * Start Date). Text without a keyword goes to Comments, since the Case is set.
 */
export function mergeFix(prev: Record<CaseField, string>, p: ParsedCase): Record<CaseField, string> {
  const out = { ...prev };
  const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ");
  if (p.case) {
    if (!prev.case.trim()) out.case = p.case;
    else out.comments = join(out.comments, p.case);
  }
  if (p.taskBar) out.taskBar = p.taskBar;
  if (p.startDate || p.startDateText) out.startDate = p.startDate ?? p.startDateText;
  // Keep the spoken words when the Start Date wasn't re-said, so the End Date
  // is read against the existing Start Date (New Year rollover).
  if (p.endDate || p.endDateText) out.endDate = p.startDate ? (p.endDate ?? p.endDateText) : p.endDateText;
  if (p.comments) out.comments = join(out.comments, p.comments);
  return out;
}
