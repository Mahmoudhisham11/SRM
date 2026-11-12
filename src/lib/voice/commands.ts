/**
 * Voice commands said between fields in guided mode.
 *
 * Commands are only recognised at the END of an utterance (all commands) or
 * at its START (navigation only). That keeps natural phrases like
 * "الشهر التالي" or "حفظ المستندات" mid-sentence from triggering anything,
 * while still working when the engine glues "…الخامات التالي" together.
 */
import { normalizeArabic, tokenize } from "../parsing/normalize";

export type VoiceCommand = "next" | "skip" | "save" | "back" | "clear";

const COMMAND_WORDS: Array<[VoiceCommand, string[]]> = [
  ["next", ["التالي", "التالى", "بعده", "اللي بعده", "next", "نكست"]],
  ["skip", ["تخطي", "تخطى", "اتخطى", "سكيب", "skip", "فوت", "فوتي"]],
  ["save", ["حفظ", "احفظ", "احفظي", "سيف", "save"]],
  ["back", ["رجوع", "ارجع", "ارجعي", "السابق", "back"]],
  ["clear", ["امسح", "امسحي", "مسح", "clear"]],
];

/** normalized phrase → command; phrases may be 1 or 2 words. */
const PHRASES = new Map<string, VoiceCommand>();
for (const [cmd, words] of COMMAND_WORDS) for (const w of words) PHRASES.set(normalizeArabic(w), cmd);

const LEADING_ALLOWED: ReadonlySet<VoiceCommand> = new Set(["next", "skip", "back"]);

export interface SplitResult {
  leading: VoiceCommand[];
  body: string;
  trailing: VoiceCommand[];
}

function matchAt(norms: string[], i: number, fromEnd: boolean): { cmd: VoiceCommand; len: number } | null {
  for (const len of [2, 1]) {
    const start = fromEnd ? i - len + 1 : i;
    if (start < 0 || start + len > norms.length) continue;
    const cmd = PHRASES.get(norms.slice(start, start + len).join(" "));
    if (cmd) return { cmd, len };
  }
  return null;
}

export function splitCommands(text: string): SplitResult {
  const tokens = tokenize(text);
  const norms = tokens.map((t) => t.norm);
  let lo = 0;
  let hi = tokens.length; // exclusive
  const leading: VoiceCommand[] = [];
  const trailing: VoiceCommand[] = [];

  // Peel commands off the end first ("تخطي" alone is trailing, so it counts).
  while (hi > lo) {
    const m = matchAt(norms, hi - 1, true);
    if (!m || hi - m.len < lo) break;
    trailing.unshift(m.cmd);
    hi -= m.len;
  }
  while (lo < hi) {
    const m = matchAt(norms, lo, false);
    if (!m || !LEADING_ALLOWED.has(m.cmd) || lo + m.len > hi) break;
    leading.push(m.cmd);
    lo += m.len;
  }
  const body = tokens.slice(lo, hi).map((t) => t.raw).join(" ");
  return { leading, body, trailing };
}
