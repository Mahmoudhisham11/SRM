"use client";

/**
 * Thin wrapper over the Web Speech API (SpeechRecognition).
 *
 * - Only ONE recognizer may run at a time in a page, so sessions are owned by
 *   a module-level controller: starting a new one (e.g. re-dictating a single
 *   field) pre-empts the current one, which is told via `onEnd("preempted")`.
 * - Chrome ends recognition after silences and on its own timers. With
 *   `keepAlive`, we restart it transparently so hands-free logging continues.
 * - Android Chrome duplicates results in continuous mode, so there we use
 *   single-utterance mode + restart, which behaves the same for the user.
 */

/* Minimal typings — the DOM lib doesn't ship SpeechRecognition types. */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
  length: number;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRErrorEvent {
  error: string;
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SR;

export function getRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getRecognitionCtor() !== null;
}

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export type EndReason = "stopped" | "preempted" | "error";

export interface SpeechOptions {
  lang?: string;
  /** Restart automatically after silences until stop() is called. */
  keepAlive: boolean;
  onInterim?(text: string): void;
  onFinal(text: string): void;
  onListening?(listening: boolean): void;
  onError?(code: string, message: string): void;
  onEnd?(reason: EndReason): void;
}

/** Errors that just mean "nothing heard yet" — keep going. */
const BENIGN = new Set(["no-speech", "aborted"]);

export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "اسمح للمتصفح باستخدام الميكروفون (من أيقونة القفل بجانب العنوان)";
    case "audio-capture":
      return "الميكروفون غير متاح — تأكد إنه متوصل ومش مستخدم في برنامج تاني";
    case "network":
      return "التعرف على الصوت محتاج إنترنت — كمّل بالكتابة لحد ما النت يرجع";
    case "language-not-supported":
      return "اللغة العربية (مصر) غير مدعومة في هذا المتصفح";
    default:
      return `خطأ في التعرف على الصوت (${code})`;
  }
}

export interface SpeechHandle {
  stop(): void;
}

let active: { rec: SR; opts: SpeechOptions; stop: (reason: EndReason) => void } | null = null;

export function startSpeech(opts: SpeechOptions): SpeechHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    opts.onError?.("unsupported", "المتصفح لا يدعم التعرف على الصوت");
    return { stop() {} };
  }
  active?.stop("preempted");

  const rec = new Ctor();
  rec.lang = opts.lang ?? "ar-EG";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = opts.keepAlive && !isAndroid();

  let wanted = true;
  let ended = false;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let fastFailures = 0;
  let startedAt = 0;

  const finish = (reason: EndReason) => {
    if (ended) return;
    ended = true;
    wanted = false;
    clearTimeout(restartTimer);
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
    if (active?.rec === rec) active = null;
    opts.onInterim?.("");
    opts.onListening?.(false);
    opts.onEnd?.(reason);
  };

  rec.onstart = () => {
    startedAt = Date.now();
    opts.onListening?.(true);
  };

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const text = r[0]?.transcript ?? "";
      if (r.isFinal) {
        if (text.trim()) opts.onFinal(text.trim());
      } else interim += text;
    }
    opts.onInterim?.(interim.trim());
  };

  rec.onerror = (e) => {
    if (BENIGN.has(e.error)) return;
    opts.onError?.(e.error, speechErrorMessage(e.error));
    finish("error");
  };

  rec.onend = () => {
    opts.onInterim?.("");
    if (!wanted || ended) return finish("stopped");
    if (!opts.keepAlive) return finish("stopped");
    // Guard against a tight restart loop (e.g. mic grabbed elsewhere).
    fastFailures = Date.now() - startedAt < 1000 ? fastFailures + 1 : 0;
    if (fastFailures > 5) {
      opts.onError?.("restart-loop", "التعرف على الصوت بيقف لوحده — جرّب تقفل وتفتح الميكروفون");
      return finish("error");
    }
    restartTimer = setTimeout(() => {
      try {
        rec.start();
      } catch {
        finish("error");
      }
    }, 150);
  };

  active = { rec, opts, stop: finish };
  try {
    rec.start();
  } catch (e) {
    opts.onError?.("start-failed", String(e));
    finish("error");
  }
  return {
    stop: () => {
      wanted = false;
      try {
        rec.stop(); // lets the last words arrive as a final result, then onend → finish
      } catch {
        finish("stopped");
      }
      // Safety net if onend never fires.
      setTimeout(() => finish("stopped"), 1500);
    },
  };
}
