"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRepo } from "@/components/providers/DataProvider";
import { errorMessage, useToast } from "@/components/providers/ToastProvider";
import { Button, Icon } from "@/components/ui";
import { CaseCard } from "@/components/cases/CaseCard";
import { useCases } from "@/hooks/useCollections";
import { useDefaultYear, useRecordAudio, useVoiceMode } from "@/hooks/useVoicePrefs";
import { FieldMic, useSpeechSupported } from "./FieldMic";
import { FieldsPanel } from "./FieldsPanel";
import { getCaseParser } from "@/lib/parsing/caseParser";
import { parseSpokenDate } from "@/lib/parsing/arabicDates";
import { buildDraft, emptyValues, FIELD_PROMPTS, guidedReducer, initialGuidedState, REVIEW_STEP } from "@/lib/voice/guided";
import { COMMAND_HINTS, splitCommands } from "@/lib/voice/commands";
import { startSpeech, type SpeechHandle } from "@/lib/voice/speech";
import { CaseRecorder, isRecordingSupported } from "@/lib/voice/recorder";
import { CASE_FIELDS, type CaseField, type Vendor } from "@/lib/types";
import type { FieldErrors } from "@/lib/validation";

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

type WakeLock = { release(): Promise<void> };

export function VoiceLogger({ vendor }: { vendor: Vendor }) {
  const repo = useRepo();
  const { notify, track } = useToast();
  const supported = useSpeechSupported();
  const [year, setYear] = useDefaultYear();
  const [mode, setMode] = useVoiceMode();
  const [recordAudio, setRecordAudio] = useRecordAudio();
  const ctx = useMemo(() => ({ defaultYear: year }), [year]);

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [g, dispatch] = useReducer(guidedReducer, undefined, initialGuidedState);
  const [freeText, setFreeText] = useState("");
  const [errors, setErrors] = useState<FieldErrors<CaseField>>({});
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const speech = useRef<SpeechHandle | null>(null);
  const recorder = useRef<CaseRecorder | null>(null);
  const wakeLock = useRef<WakeLock | null>(null);
  const freeTextRef = useRef("");
  const stateRef = useRef(g);
  useLayoutEffect(() => {
    stateRef.current = g;
  }, [g]);

  const cases = useCases(vendor.id);
  const sessionCases = useMemo(() => {
    const byId = new Map(cases.data.map((c) => [c.id, c]));
    return sessionIds.map((id) => byId.get(id)).filter((c) => c !== undefined);
  }, [cases.data, sessionIds]);

  // --- audio --------------------------------------------------------------
  const startClip = useCallback(async () => {
    if (!recordAudio || !isRecordingSupported()) return;
    recorder.current ??= new CaseRecorder();
    try {
      await recorder.current.begin();
    } catch (e) {
      notify("لم يتم تشغيل التسجيل الصوتي: " + errorMessage(e), "error");
    }
  }, [recordAudio, notify]);

  const releaseAudio = useCallback(() => {
    recorder.current?.release();
    recorder.current = null;
  }, []);

  // --- saving -------------------------------------------------------------
  const setFree = (t: string) => {
    freeTextRef.current = t;
    setFreeText(t);
  };

  const attemptSave = useCallback(
    async (values: Record<CaseField, string>, transcript: string[]) => {
      const { draft, errors: errs } = buildDraft(values, ctx);
      setErrors(errs);
      const firstBad = CASE_FIELDS.findIndex((f) => errs[f]);
      if (firstBad >= 0) {
        vibrate([60, 60, 60]);
        notify(`لم يتم الحفظ: ${errs[CASE_FIELDS[firstBad]]}`, "error");
        dispatch({ type: "goto", step: firstBad });
        return;
      }
      const id = repo.newCaseId();
      track(
        repo.createCase(id, {
          vendorId: vendor.id,
          case: draft.case,
          taskBar: draft.taskBar,
          startDate: draft.startDate!,
          endDate: draft.endDate,
          comments: draft.comments,
          transcript: transcript.join(" | "),
        }),
      );
      setSessionIds((ids) => [id, ...ids]);
      dispatch({ type: "reset" });
      setFree("");
      vibrate(80);
      notify("✓ اتحفظت — قول الحالة اللي بعدها", "success");

      // Close this case's audio clip and immediately start the next one.
      const rec = recorder.current;
      if (rec?.active) {
        const blob = await rec.finish();
        if (speech.current) void startClip();
        if (blob) {
          repo.uploadAudio(id, blob).catch((e) => notify("الحالة اتحفظت لكن التسجيل الصوتي ما اترفعش: " + errorMessage(e), "error"));
        }
      }
    },
    [ctx, notify, track, repo, vendor.id, startClip],
  );

  const saveFree = useCallback(async () => {
    const text = freeTextRef.current.trim();
    let values = stateRef.current.values;
    let transcript = stateRef.current.transcript;
    if (text) {
      setSaving(true);
      try {
        const p = await getCaseParser(undefined).parse(text, ctx);
        values = {
          case: p.case,
          taskBar: p.taskBar,
          startDate: p.startDate ?? p.startDateText,
          endDate: p.endDate ?? p.endDateText,
          comments: p.comments,
        };
        transcript = [text];
        dispatch({ type: "setValues", values, transcript });
        setFree("");
      } catch (e) {
        notify("فشل تحليل النص: " + errorMessage(e), "error");
        return;
      } finally {
        setSaving(false);
      }
    }
    await attemptSave(values, transcript);
  }, [ctx, attemptSave, notify]);

  const save = useCallback(() => {
    if (mode === "free") void saveFree();
    else void attemptSave(stateRef.current.values, stateRef.current.transcript);
  }, [mode, saveFree, attemptSave]);

  // Guided: "حفظ" said → reducer bumps saveRequested → save here.
  const lastSave = useRef(g.saveRequested);
  useEffect(() => {
    if (g.saveRequested === lastSave.current) return;
    lastSave.current = g.saveRequested;
    void attemptSave(g.values, g.transcript);
  }, [g.saveRequested, g.values, g.transcript, attemptSave]);

  // Haptic tick when guided mode moves to another field.
  const lastStep = useRef(g.step);
  useEffect(() => {
    if (g.step !== lastStep.current) vibrate(25);
    lastStep.current = g.step;
  }, [g.step]);

  // --- speech -------------------------------------------------------------
  // Recognition callbacks outlive renders; route them to the latest handler.
  const onFinal = useRef<(text: string) => void>(() => {});
  useLayoutEffect(() => {
    onFinal.current = (text: string) => {
      if (mode === "guided") return dispatch({ type: "speech", text });
      const { leading, body, trailing } = splitCommands(text);
      if (leading.length || body) setFree(`${freeTextRef.current} ${body}`.trim());
      if (trailing.includes("clear")) setFree("");
      if (trailing.includes("save")) void saveFree();
    };
  }, [mode, saveFree]);

  const listen = useCallback(() => {
    speech.current = startSpeech({
      keepAlive: true,
      onFinal: (t) => onFinal.current(t),
      onInterim: setInterim,
      onListening: setListening,
      onError: (code, msg) => {
        notify(msg, "error");
        // Some phones can't share the mic between recognition and recording.
        if (code === "audio-capture" && recorder.current) {
          releaseAudio();
          setRecordAudio(false);
          notify("تم إيقاف حفظ الصوت الأصلي على الجهاز ده — جرّب الميكروفون تاني", "info");
        }
      },
      onEnd: () => {
        speech.current = null;
        recorder.current?.pause();
      },
    });
    recorder.current?.resume();
  }, [notify, releaseAudio, setRecordAudio]);

  async function startSession() {
    setOpen(true);
    if (!supported) return;
    // Listening must not wait on the recorder's mic permission/start-up.
    listen();
    void startClip();
    try {
      wakeLock.current = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLock> } }).wakeLock?.request("screen") ?? null;
    } catch {
      /* not critical */
    }
  }

  function toggleListening() {
    if (speech.current) speech.current.stop();
    else {
      if (recordAudio && !recorder.current?.active) void startClip();
      listen();
    }
  }

  function endSession() {
    speech.current?.stop();
    releaseAudio();
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setOpen(false);
    dispatch({ type: "reset" });
    setFree("");
    setErrors({});
  }

  useEffect(
    () => () => {
      speech.current?.stop();
      recorder.current?.release();
      void wakeLock.current?.release().catch(() => undefined);
    },
    [],
  );

  const parseDate = useCallback((t: string) => parseSpokenDate(t, ctx), [ctx]);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => now - i);
  }, []);

  const hasContent = CASE_FIELDS.some((f) => g.values[f].trim()) || freeText.trim();

  // --- render ---------------------------------------------------------------
  const settings = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <div role="radiogroup" aria-label="طريقة الإملاء" className="flex rounded-xl bg-slate-100 p-1">
        {(["guided", "free"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m);
              setErrors({});
            }}
            className={`h-8 rounded-lg px-3 font-semibold ${mode === m ? "bg-white text-teal-800 shadow-sm" : "text-slate-600"}`}
          >
            {m === "guided" ? "موجّه (حقل بحقل)" : "حر (مرة واحدة)"}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-2 py-1">
        <Icon name="calendar" className="h-4 w-4 text-slate-500" />
        <span className="text-slate-600">السنة الافتراضية</span>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-7 rounded-md border-0 bg-white px-1 font-bold"
          aria-label="السنة الافتراضية للتواريخ بدون سنة"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      {isRecordingSupported() && supported && (
        <label className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-2 py-1.5 text-slate-600">
          <input type="checkbox" checked={recordAudio} onChange={(e) => setRecordAudio(e.target.checked)} className="accent-teal-700" />
          احفظ الصوت الأصلي
        </label>
      )}
    </div>
  );

  if (!open) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-teal-100 bg-gradient-to-b from-teal-50 to-white p-6 text-center">
        {!supported && <UnsupportedNotice />}
        <button
          type="button"
          onClick={startSession}
          className="group flex h-28 w-28 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-700/30 transition hover:bg-teal-800 active:scale-95"
          aria-label={supported ? "ابدأ تسجيل حالة بالصوت" : "ابدأ إدخال حالة بالكتابة"}
        >
          <Icon name={supported ? "mic" : "keyboard"} className="h-12 w-12" />
        </button>
        <p className="font-bold text-slate-800">{supported ? "اضغط وسجّل حالة جديدة بصوتك" : "إضافة حالة بالكتابة"}</p>
        {settings}
      </section>
    );
  }

  const field = CASE_FIELDS[g.step] as CaseField | undefined;
  const prompt = mode === "free"
    ? "قول الحالة كلها مرة واحدة: «كيس … تاسك … من 15 مارس لحد 20 مارس … ملاحظة …» ثم «حفظ»"
    : field
      ? FIELD_PROMPTS[field]
      : "راجع الحقول وقول «حفظ» — أو صحّح أي حقل";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-3xl border border-teal-200 bg-white p-4 shadow-sm sm:p-5">
        {!supported && <UnsupportedNotice />}

        <div className="flex items-center gap-4">
          {supported && (
            <button
              type="button"
              onClick={toggleListening}
              aria-label={listening ? "إيقاف الاستماع مؤقتاً" : "استئناف الاستماع"}
              className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${
                listening ? "bg-red-600 shadow-red-600/30" : "bg-teal-700 shadow-teal-700/30"
              }`}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />}
              <Icon name={listening ? "stop" : "mic"} className="relative h-9 w-9" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500">
              {supported ? (listening ? "🔴 بيسمع…" : "⏸ متوقف — اضغط الميكروفون") : "إدخال بالكتابة"}
              {mode === "guided" && <span className="ms-2">الحقل {Math.min(g.step + 1, 5)} من 5</span>}
            </p>
            <p className="text-lg font-bold leading-snug text-slate-900">{prompt}</p>
          </div>
          <Button variant="ghost" size="sm" className="self-start" onClick={endSession}>
            إنهاء
          </Button>
        </div>

        {supported && (
          <div className="min-h-14 rounded-2xl bg-slate-900 px-4 py-3 text-base leading-relaxed text-white" aria-live="polite">
            {mode === "free" && freeText && <span>{freeText} </span>}
            {interim ? <span className="text-slate-400">{interim}</span> : !freeText || mode === "guided" ? <span className="text-slate-500">النص المسموع هيظهر هنا…</span> : null}
          </div>
        )}

        <FieldsPanel
          values={g.values}
          step={mode === "guided" ? g.step : null}
          errors={errors}
          ctx={ctx}
          onSelect={(i) => mode === "guided" && g.step !== i && dispatch({ type: "goto", step: i })}
          onChange={(f, v) => {
            dispatch({ type: "setField", field: f, value: v });
            if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined }));
          }}
          onEnter={() => (g.step >= REVIEW_STEP - 1 ? save() : dispatch({ type: "command", command: "next" }))}
        />

        <div className="flex flex-wrap items-center gap-2">
          {mode === "guided" ? (
            <>
              <Button variant="secondary" onClick={() => dispatch({ type: "command", command: "back" })} disabled={g.step === 0}>
                <Icon name="back" className="h-4 w-4" />
                رجوع
              </Button>
              <Button variant="secondary" onClick={() => dispatch({ type: "command", command: "skip" })} disabled={g.step >= REVIEW_STEP}>
                <Icon name="skip" className="h-4 w-4" />
                تخطي
              </Button>
              <Button variant="secondary" onClick={() => dispatch({ type: "command", command: "next" })} disabled={g.step >= REVIEW_STEP}>
                التالي
                <Icon name="chevron" className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setFree("");
                dispatch({ type: "setValues", values: emptyValues(), transcript: [] });
              }}
              disabled={!hasContent}
            >
              مسح
            </Button>
          )}
          <Button className="ms-auto min-w-28" onClick={save} disabled={saving}>
            <Icon name="check" className="h-4 w-4" />
            حفظ
          </Button>
        </div>

        {supported && (
          <p className="text-center text-xs text-slate-500">
            أوامر صوتية:{" "}
            {(mode === "guided" ? (["next", "skip", "back", "clear", "save"] as const) : (["clear", "save"] as const)).map((c, i) => (
              <span key={c}>
                {i > 0 && " • "}«{COMMAND_HINTS[c]}»
              </span>
            ))}
          </p>
        )}
        <div className="border-t border-slate-100 pt-3">{settings}</div>
      </div>

      {sessionCases.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-slate-800">
            اتسجل في الجلسة دي ({sessionCases.length}) — راجع وصحّح بالضغط على أي حقل أو بالميكروفون جنبه
          </h3>
          {sessionCases.map((c, i) => (
            <CaseCard
              key={c.id}
              c={c}
              highlight={i === 0}
              parseDate={parseDate}
              fieldMic={(f, apply) => <FieldMic field={f} onText={apply} />}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function UnsupportedNotice() {
  return (
    <div role="alert" className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-start text-sm text-amber-900">
      <p className="font-bold">المتصفح ده مش بيدعم التعرف على الصوت.</p>
      <p className="mt-1">
        استخدم <b>Google Chrome</b> أو <b>Microsoft Edge</b> (على الموبايل أو اللابتوب) عشان التسجيل بالصوت. تقدر تكمّل دلوقتي بالكتابة في نفس الحقول.
      </p>
    </div>
  );
}
