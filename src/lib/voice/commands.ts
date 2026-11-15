/**
 * Voice commands said between fields in guided mode.
 *
 * Commands are only recognised at the END of an utterance (all commands) or
 * at its START (navigation only). That keeps natural phrases like
 * "حفظ المستندات" mid-sentence from triggering anything, while still working
 * when the engine glues "…الخامات التالي" together. On top of that:
 * - "التالي"/"السابق" right after a noun they describe ("الشهر التالي",
 *   "اليوم السابق") are text, not commands.
 * - Only the noun forms count at the START ("التالي", "رجوع", "تخطي"); verbs
 *   like "ارجع"/"فوت" naturally start sentences ("ارجع للمورد…").
 * - Callers can restrict which commands are recognised (free mode only uses
 *   "حفظ" and "امسح", so it never eats "التالي" from what was said).
 */
import { normalizeArabic, tokenize } from "../parsing/normalize";

export type VoiceCommand = "next" | "skip" | "save" | "back" | "clear";

const COMMAND_WORDS: Array<[VoiceCommand, string[]]> = [
  ["next", ["التالي", "التالى", "next", "نكست"]],
  ["skip", ["تخطي", "تخطى", "اتخطى", "سكيب", "skip", "فوت", "فوتي"]],
  ["save", ["حفظ", "احفظ", "احفظي", "سيف", "save"]],
  ["back", ["رجوع", "ارجع", "ارجعي", "السابق", "back"]],
  ["clear", ["امسح", "امسحي", "مسح", "clear"]],
];

/** normalized phrase → command; phrases may be 1 or 2 words. */
const PHRASES = new Map<string, VoiceCommand>();
for (const [cmd, words] of COMMAND_WORDS) for (const w of words) PHRASES.set(normalizeArabic(w), cmd);

/** Phrases that may also start an utterance (navigation nouns, not verbs). */
const LEADING_PHRASES = new Set(["التالي", "التالى", "next", "نكست", "تخطي", "تخطى", "سكيب", "skip", "رجوع", "السابق", "back"].map((w) => normalizeArabic(w)));

/** Adjective-like commands: after one of these nouns they're part of the text. */
const ADJECTIVE_COMMANDS = new Set(["التالي", "التالى", "السابق"].map((w) => normalizeArabic(w)));
const DESCRIBED_NOUNS = new Set(
  // Time / sequence words only: a field often ENDS with other nouns («متابعة مع
  // المورد») right before the command, so those must not block it.
  ["شهر", "يوم", "اسبوع", "أسبوع", "سنة", "سنه", "عام", "ميعاد", "موعد", "معاد", "اجتماع", "مرحلة", "مرحله", "خطوة", "خطوه", "دفعة", "دفعه", "دور", "مره", "مرة"].map((w) =>
    normalizeArabic(w),
  ),
);
/** Strip the article and a one-letter proclitic (و/ف/ب/ك): "وللشهر" → "شهر". */
function bareNoun(norm: string): string {
  if (norm.startsWith("ال") || norm.startsWith("لل")) return norm.slice(2); // الشهر / للشهر
  if ("وفبك".includes(norm[0] ?? "") && (norm.startsWith("ال", 1) || norm.startsWith("لل", 1))) return norm.slice(3); // بالشهر / وللشهر
  return norm;
}

export const ALL_COMMANDS: ReadonlySet<VoiceCommand> = new Set(["next", "skip", "save", "back", "clear"]);

export interface SplitResult {
  leading: VoiceCommand[];
  body: string;
  trailing: VoiceCommand[];
}

function matchAt(
  norms: string[],
  i: number,
  fromEnd: boolean,
  allowed: ReadonlySet<VoiceCommand>,
): { cmd: VoiceCommand; len: number } | null {
  for (const len of [2, 1]) {
    const start = fromEnd ? i - len + 1 : i;
    if (start < 0 || start + len > norms.length) continue;
    const phrase = norms.slice(start, start + len).join(" ");
    const cmd = PHRASES.get(phrase);
    if (!cmd || !allowed.has(cmd)) continue;
    if (!fromEnd && !LEADING_PHRASES.has(phrase)) continue;
    // "الشهر التالي" / "المورد السابق": an adjective describing the word before it.
    if (fromEnd && ADJECTIVE_COMMANDS.has(phrase) && start > 0 && DESCRIBED_NOUNS.has(bareNoun(norms[start - 1]))) continue;
    return { cmd, len };
  }
  return null;
}

/**
 * Split an utterance into leading commands, the spoken text, and trailing
 * commands. `allowed` limits which commands are recognised (default: all).
 */
export function splitCommands(text: string, allowed: ReadonlySet<VoiceCommand> = ALL_COMMANDS): SplitResult {
  const tokens = tokenize(text);
  const norms = tokens.map((t) => t.norm);
  let lo = 0;
  let hi = tokens.length; // exclusive
  const leading: VoiceCommand[] = [];
  const trailing: VoiceCommand[] = [];

  // Peel commands off the end first ("تخطي" alone is trailing, so it counts).
  while (hi > lo) {
    const m = matchAt(norms, hi - 1, true, allowed);
    if (!m || hi - m.len < lo) break;
    trailing.unshift(m.cmd);
    hi -= m.len;
  }
  while (lo < hi) {
    const m = matchAt(norms, lo, false, allowed);
    if (!m || m.cmd === "save" || m.cmd === "clear" || lo + m.len > hi) break;
    leading.push(m.cmd);
    lo += m.len;
  }
  const body = tokens.slice(lo, hi).map((t) => t.raw).join(" ");
  return { leading, body, trailing };
}

const SAVE_WORDS = new Set(COMMAND_WORDS.find(([c]) => c === "save")![1].map((w) => normalizeArabic(w)));
const CASE_WORDS = new Set(["كيس", "الكيس", "كايس", "case"].map((w) => normalizeArabic(w)));

/**
 * «… حفظ كيس …» said without a pause arrives as ONE utterance. Split it at
 * every "save word + case keyword" so each case is saved on its own:
 *   "كيس أ تاسك ب حفظ كيس ج حفظ" → ["كيس أ تاسك ب حفظ", "ج حفظ"].
 * Every segment but the last ends with the save word; the «كيس» keyword that
 * started the next case is dropped (the new case starts at its Case field).
 * "حفظ المستندات" (no «كيس» after it) is left alone.
 */
export function splitAtSaves(text: string): string[] {
  const tokens = tokenize(text);
  const segments: string[] = [];
  let from = 0;
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (i > from && SAVE_WORDS.has(tokens[i].norm) && CASE_WORDS.has(tokens[i + 1].norm)) {
      segments.push(tokens.slice(from, i + 1).map((t) => t.raw).join(" "));
      from = i + 2;
      i++;
    }
  }
  const rest = tokens.slice(from).map((t) => t.raw).join(" ");
  if (rest.trim() || !segments.length) segments.push(rest);
  return segments;
}
