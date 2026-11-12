"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { useDictationLang } from "@/hooks/useVoicePrefs";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { isSpeechSupported, KNOWN_SPEECH_ERRORS, startSpeech, type SpeechHandle } from "@/lib/voice/speech";
import { FIELD_LABELS, type CaseField } from "@/lib/types";

const noopSubscribe = () => () => {};

export function useSpeechSupported(): boolean {
  // Server snapshot = true so the prerendered HTML doesn't flash the warning.
  return useSyncExternalStore(noopSubscribe, isSpeechSupported, () => true);
}

/** Small mic that re-dictates just one field, then hands the text back. */
export function FieldMic({ field, onText }: { field: CaseField; onText: (text: string) => void }) {
  const supported = useSpeechSupported();
  const { notify } = useToast();
  const { t } = useI18n();
  const [dictation] = useDictationLang();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const handle = useRef<SpeechHandle | null>(null);
  const heard = useRef<string[]>([]);

  useEffect(() => () => handle.current?.stop(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) return handle.current?.stop();
    heard.current = [];
    handle.current = startSpeech({
      lang: dictation,
      keepAlive: false,
      onFinal: (txt) => heard.current.push(txt),
      onInterim: setInterim,
      onListening: setListening,
      onError: (code) => {
        const key = (KNOWN_SPEECH_ERRORS as readonly string[]).includes(code) ? (`speech.${code}` as MessageKey) : null;
        notify(key ? t(key) : t("speech.generic", { code }), "error");
      },
      onEnd: () => {
        const text = heard.current.join(" ").trim();
        if (text) onText(text);
        handle.current = null;
      },
    });
  }

  const label = listening ? t("voice.pause") : t("case.redictate", { field: FIELD_LABELS[field] });
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
          listening ? "animate-pulse bg-berry text-on-berry" : "text-ink-3 hover:bg-surface-pink hover:text-berry"
        }`}
      >
        {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
      </button>
      {listening && interim && (
        <span className="absolute end-0 top-10 z-10 w-56 rounded-xl bg-tooltip px-3 py-2 text-xs text-on-tooltip shadow-lg">{interim}</span>
      )}
    </span>
  );
}
