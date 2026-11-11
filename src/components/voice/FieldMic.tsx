"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";
import { useToast } from "@/components/providers/ToastProvider";
import { isSpeechSupported, startSpeech, type SpeechHandle } from "@/lib/voice/speech";
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
      keepAlive: false,
      onFinal: (t) => heard.current.push(t),
      onInterim: setInterim,
      onListening: setListening,
      onError: (_code, msg) => notify(msg, "error"),
      onEnd: () => {
        const text = heard.current.join(" ").trim();
        if (text) onText(text);
        handle.current = null;
      },
    });
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "إيقاف" : `أعد إملاء ${FIELD_LABELS[field]}`}
        title={listening ? "إيقاف" : `أعد إملاء ${FIELD_LABELS[field]}`}
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          listening ? "animate-pulse bg-red-600 text-white" : "text-slate-500 hover:bg-teal-50 hover:text-teal-700"
        }`}
      >
        <Icon name={listening ? "stop" : "mic"} className="h-4 w-4" />
      </button>
      {listening && interim && (
        <span className="absolute end-0 top-10 z-10 w-56 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">{interim}</span>
      )}
    </span>
  );
}
