"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AudioLines, Check, Keyboard, NotebookPen, X } from "lucide-react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Segmented, Slotted } from "@/components/ui";
import { CaseCard } from "@/components/cases/CaseCard";
import { NotebookCard } from "@/components/home/NotebookCard";
import { FieldMic, useSpeechSupported } from "./FieldMic";
import { FieldsPanel } from "./FieldsPanel";
import { CommandChips, MicOrb, PinStepper, SaveBurst, TranscriptBox, type MicState } from "./VoiceParts";
import { useCases } from "@/hooks/useCollections";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useClaimMic, useGreetingName } from "@/hooks/useAppChrome";
import { useDefaultYear, useDictationLang, useRecordAudio, useSessionCount, useVoiceMode, type VoiceMode } from "@/hooks/useVoicePrefs";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { getCaseParser } from "@/lib/parsing/caseParser";
import { parseSpokenDate } from "@/lib/parsing/arabicDates";
import { buildDraft, emptyValues, guidedReducer, initialGuidedState, mergeFix, REVIEW_STEP } from "@/lib/voice/guided";
import { splitAtSaves, splitCommands, type VoiceCommand } from "@/lib/voice/commands";
import { uploadAudioReliably } from "@/lib/data/audioUpload";
import { KNOWN_SPEECH_ERRORS, startSpeech, type SpeechHandle } from "@/lib/voice/speech";
import { CaseRecorder, isRecordingSupported } from "@/lib/voice/recorder";
import { crossedMilestone, notebookStats } from "@/lib/progress";
import { CASE_FIELDS, DATE_FIELDS, FIELD_LABELS, type CaseField, type Vendor } from "@/lib/types";
import type { FieldErrors } from "@/lib/validation";

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

type WakeLock = { release(): Promise<void> };

const GUIDED_CMDS: VoiceCommand[] = ["next", "skip", "back", "clear", "save"];
const FREE_CMDS: VoiceCommand[] = ["clear", "save"];
/** Free mode only listens for these, so words like «التالي» stay in the text. */
const FREE_CMD_SET: ReadonlySet<VoiceCommand> = new Set(FREE_CMDS);
/** Storage isn't set up for this project: stop recording instead of failing every case. */
const STORAGE_MISSING = /bucket-not-found|project-not-found|storage\/disabled/;
const PROMPT_KEYS: Record<CaseField, MessageKey> = {
  case: "voice.prompt.case",
  taskBar: "voice.prompt.taskBar",
  startDate: "voice.prompt.startDate",
  endDate: "voice.prompt.endDate",
  comments: "voice.prompt.comments",
};

export function VoiceLogger({ vendor, autoStart = false }: { vendor: Vendor; autoStart?: boolean }) {
  const repo = useRepo();
  const { notify, track, errorText } = useToast();
  const { t, isAr } = useI18n();
  const supported = useSpeechSupported();
  const name = useGreetingName();
  const [year, setYear] = useDefaultYear();
  const [mode, setMode] = useVoiceMode();
  const [recordAudioPref, setRecordAudio] = useRecordAudio();
  // Recording only makes sense where it can be stored (Storage set up / demo mode).
  const audioAvailable = repo.audioEnabled && isRecordingSupported();
  const recordAudio = recordAudioPref && audioAvailable;
  const [dictation] = useDictationLang();
  const [sessionCount, bumpSessionCount] = useSessionCount();
  const ctx = useMemo(() => ({ defaultYear: year }), [year]);

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [g, dispatch] = useReducer(guidedReducer, undefined, initialGuidedState);
  const [freeText, setFreeText] = useState("");
  const [errors, setErrors] = useState<FieldErrors<CaseField>>({});
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState({ id: 0, big: false });
  const [flash, setFlash] = useState<{ cmd: VoiceCommand; at: number } | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micInView, setMicInView] = useState(true);

  const speech = useRef<SpeechHandle | null>(null);
  const recorder = useRef<CaseRecorder | null>(null);
  const wakeLock = useRef<WakeLock | null>(null);
  const freeTextRef = useRef("");
  /** Free mode: the last save failed, so the next utterance FIXES the parsed fields instead of replacing them. */
  const fixingRef = useRef(false);
  /** Cases said in one breath («… حفظ كيس …»): the ones still to process after the current save. */
  const queuedRef = useRef<string[]>([]);
  // Recognition callbacks outlive renders; route them to the latest handler.
  const onFinal = useRef<(text: string, queued?: boolean) => void>(() => {});
  const stateRef = useRef(g);
  const micRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    stateRef.current = g;
  }, [g]);

  const { level, bump } = useAudioLevel(stream, listening);
  const allCases = useCases(null);
  const stats = useMemo(() => notebookStats(allCases.data, year), [allCases.data, year]);
  const statsRef = useRef(stats);
  useLayoutEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  const sessionCases = useMemo(() => {
    const byId = new Map(allCases.data.map((c) => [c.id, c]));
    return sessionIds.map((id) => byId.get(id)).filter((c) => c !== undefined);
  }, [allCases.data, sessionIds]);

  // --- audio ----------------------------------------------------------------
  const startClip = useCallback(async () => {
    if (!recordAudio || !isRecordingSupported()) return;
    recorder.current ??= new CaseRecorder();
    try {
      await recorder.current.begin();
      setStream(recorder.current.liveStream);
    } catch (e) {
      notify(`${t("voice.audioStartFailed")}: ${errorText(e)}`, "error");
    }
  }, [recordAudio, notify, t, errorText]);

  const releaseAudio = useCallback(() => {
    recorder.current?.release();
    recorder.current = null;
    setStream(null);
  }, []);

  // --- saving -----------------------------------------------------------------
  const setFree = (txt: string) => {
    freeTextRef.current = txt;
    setFreeText(txt);
  };

  const attemptSave = useCallback(
    async (values: Record<CaseField, string>, transcript: string[]): Promise<boolean> => {
      const { draft, errors: errs } = buildDraft(values, ctx);
      setErrors(errs);
      const firstBad = CASE_FIELDS.findIndex((f) => errs[f]);
      if (firstBad >= 0) {
        vibrate([50, 60, 50]);
        notify(t("voice.notSaved", { reason: t(errs[CASE_FIELDS[firstBad]]!) }), "error");
        dispatch({ type: "goto", step: firstBad });
        fixingRef.current = true;
        // Cases said after this one in the same breath: show them instead of losing them.
        const rest = queuedRef.current.splice(0);
        if (rest.length) notify(t("voice.restNotSaved", { text: rest.join(" … ") }), "info");
        return false;
      }
      fixingRef.current = false;
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

      // Celebration: milestone in this year's notebook → a bigger burst; else sparkles.
      const before = statsRef.current.total;
      const inYear = Number(draft.startDate!.slice(0, 4)) === statsRef.current.year;
      const milestone = inYear ? crossedMilestone(before, before + 1) : null;
      const nextSession = sessionCount + 1;
      setBurst((b) => ({ id: b.id + 1, big: !!milestone || nextSession % 10 === 0 }));
      vibrate(milestone ? [40, 60, 40, 60, 80] : 70);
      if (milestone) notify(name ? t("voice.milestone", { n: milestone, name }) : t("voice.milestoneNoName", { n: milestone }), "success");
      else if (nextSession % 10 === 0) notify(t("voice.sessionMilestone", { n: nextSession }), "success");
      else notify(t("voice.saved"), "success");

      bumpSessionCount();
      setSessionIds((ids) => [id, ...ids]);
      dispatch({ type: "reset" });
      setFree("");
      setHeard("");
      setErrors({});
      setFlashKey(0);

      // Close this case's audio clip and immediately start the next one.
      const rec = recorder.current;
      if (rec?.active) {
        const blob = await rec.finish();
        if (speech.current) void startClip();
        if (blob) {
          // Offline / flaky network: the clip is kept on the device and uploaded later.
          uploadAudioReliably(repo, id, blob).then((r) => {
            if (r.status === "queued") notify(t("voice.audioQueued"), "info");
            else if (r.status === "failed") {
              if (STORAGE_MISSING.test(r.code)) {
                setRecordAudio(false);
                releaseAudio();
                notify(t("voice.audioStorageOff"), "info");
              } else notify(t("voice.audioUploadFailed"), "error");
            }
          });
        }
      }

      // Next case from the same utterance («… حفظ كيس …»).
      const next = queuedRef.current.shift();
      if (next) setTimeout(() => onFinal.current(next, true), 0);
      return true;
    },
    [ctx, notify, track, repo, vendor.id, startClip, t, name, sessionCount, bumpSessionCount, setRecordAudio, releaseAudio],
  );

  const saveFree = useCallback(async (): Promise<boolean> => {
    const text = freeTextRef.current.trim();
    let values = stateRef.current.values;
    let transcript = stateRef.current.transcript;
    if (text) {
      setBusy(true);
      try {
        const p = await getCaseParser(undefined).parse(text, ctx);
        if (fixingRef.current && !p.caseExplicit) {
          // Fixing a case that failed to save: only fill/replace what was just said.
          values = mergeFix(stateRef.current.values, p);
          transcript = [...stateRef.current.transcript, text];
        } else {
          values = {
            case: p.case,
            taskBar: p.taskBar,
            startDate: p.startDate ?? p.startDateText,
            endDate: p.endDate ?? p.endDateText,
            comments: p.comments,
          };
          transcript = [text];
        }
        dispatch({ type: "setValues", values, transcript });
        setFree("");
        setFlashKey((k) => k + 1);
        // Let her see the words land in their fields before the save animation.
        await new Promise((r) => setTimeout(r, 650));
      } catch (e) {
        notify(`${t("voice.parseFailed")}: ${errorText(e)}`, "error");
        return false;
      } finally {
        setBusy(false);
      }
    }
    return attemptSave(values, transcript);
  }, [ctx, attemptSave, notify, t, errorText]);

  const save = useCallback(() => {
    if (mode === "free") void saveFree();
    else void attemptSave(stateRef.current.values, stateRef.current.transcript);
  }, [mode, saveFree, attemptSave]);

  // Guided: «حفظ» said → reducer bumps saveRequested → save here.
  const lastSave = useRef(g.saveRequested);
  useEffect(() => {
    if (g.saveRequested === lastSave.current) return;
    lastSave.current = g.saveRequested;
    void attemptSave(g.values, g.transcript);
  }, [g.saveRequested, g.values, g.transcript, attemptSave]);

  // Haptic tick + fresh transcript when guided mode moves to another field.
  const lastStep = useRef(g.step);
  useEffect(() => {
    if (g.step !== lastStep.current) vibrate(20);
    lastStep.current = g.step;
  }, [g.step]);

  const runCommand = useCallback(
    (cmd: VoiceCommand) => {
      setFlash({ cmd, at: Date.now() });
      if (cmd === "save") return save();
      if (mode === "free") {
        if (cmd === "clear") {
          setFree("");
          fixingRef.current = false;
          dispatch({ type: "setValues", values: emptyValues(), transcript: [] });
        }
        return;
      }
      dispatch({ type: "command", command: cmd });
      if (cmd === "next" || cmd === "skip" || cmd === "back") setHeard("");
    },
    [mode, save],
  );

  // --- speech -----------------------------------------------------------------
  useLayoutEffect(() => {
    onFinal.current = (raw: string, queued = false) => {
      bump();
      let text = raw;
      if (!queued) {
        // Several cases in one breath: handle the first now, the rest after each save.
        const [first, ...rest] = splitAtSaves(raw);
        text = first;
        queuedRef.current.push(...rest);
      }
      const { leading, body, trailing } = splitCommands(text, mode === "free" ? FREE_CMD_SET : undefined);
      const lastCmd = trailing[trailing.length - 1] ?? leading[leading.length - 1];
      if (lastCmd) setFlash({ cmd: lastCmd, at: Date.now() });
      if (mode === "guided") {
        setHeard(body);
        return dispatch({ type: "speech", text });
      }
      if (body) setFree(`${freeTextRef.current} ${body}`.trim());
      if (trailing.includes("clear")) {
        setFree("");
        fixingRef.current = false;
      }
      if (trailing.includes("save")) void saveFree();
    };
  }, [mode, saveFree, bump]);

  const listen = useCallback(() => {
    speech.current = startSpeech({
      lang: dictation,
      keepAlive: true,
      onFinal: (txt) => onFinal.current(txt),
      onInterim: (txt) => {
        setInterim(txt);
        if (txt) bump();
      },
      onListening: setListening,
      onError: (code) => {
        const key = (KNOWN_SPEECH_ERRORS as readonly string[]).includes(code) ? (`speech.${code}` as MessageKey) : null;
        notify(key ? t(key) : t("speech.generic", { code }), "error");
        // Some phones can't share the mic between recognition and recording.
        if (code === "audio-capture" && recorder.current) {
          releaseAudio();
          setRecordAudio(false);
          notify(t("voice.audioOffAndroid"), "info");
        }
      },
      onEnd: () => {
        speech.current = null;
        recorder.current?.pause();
      },
    });
    recorder.current?.resume();
  }, [dictation, notify, releaseAudio, setRecordAudio, t, bump]);

  const startSession = useCallback(async () => {
    setOpen(true);
    if (!supported) return;
    // Listening must not wait on the recorder's mic permission / start-up.
    listen();
    void startClip();
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLock> } }).wakeLock;
      wakeLock.current = (await wl?.request("screen")) ?? null;
    } catch {
      /* not critical */
    }
  }, [supported, listen, startClip]);

  const toggleListening = useCallback(() => {
    if (speech.current) speech.current.stop();
    else {
      if (recordAudio && !recorder.current?.active) void startClip();
      listen();
    }
  }, [recordAudio, startClip, listen]);

  function endSession() {
    speech.current?.stop();
    releaseAudio();
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setOpen(false);
    dispatch({ type: "reset" });
    fixingRef.current = false;
    queuedRef.current = [];
    setFree("");
    setHeard("");
    setErrors({});
  }

  // The shell's center mic: start here, or pause/resume if already logging.
  const onShellMic = useCallback(() => {
    if (!open) void startSession();
    else if (supported) toggleListening();
  }, [open, startSession, toggleListening, supported]);
  useClaimMic(onShellMic);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      void startSession();
    }
  }, [autoStart, startSession]);

  useEffect(
    () => () => {
      speech.current?.stop();
      recorder.current?.release();
      void wakeLock.current?.release().catch(() => undefined);
    },
    [],
  );

  // Keyboard: Ctrl/Cmd+Enter saves; Space toggles the mic (outside text fields).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest("input,textarea,select,[contenteditable]");
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      } else if (e.code === "Space" && !typing && !el.closest("button,a") && supported) {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, save, toggleListening, supported]);

  // Compact header once the big mic scrolls away.
  useEffect(() => {
    const el = micRef.current;
    if (!open || !el) return;
    const io = new IntersectionObserver(([e]) => setMicInView(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [open]);

  const parseDate = useCallback((txt: string) => parseSpokenDate(txt, ctx), [ctx]);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => now - i);
  }, []);

  const micState: MicState = !supported ? "typing" : !open ? "idle" : listening ? "listening" : "paused";
  const field = CASE_FIELDS[g.step] as CaseField | undefined;
  const filled = CASE_FIELDS.map((f) => (DATE_FIELDS.has(f) ? !!parseDate(g.values[f]) : !!g.values[f].trim()));

  // --- idle hero -----------------------------------------------------------------
  if (!open) {
    return (
      <section className="flex flex-col items-center gap-4 py-6 text-center">
        {!supported && <UnsupportedNotice />}
        {supported ? (
          <MicOrb state="idle" level={level} onPress={startSession} label={t("voice.start")} />
        ) : (
          <motion.button
            type="button"
            onClick={startSession}
            whileTap={{ scale: 0.94 }}
            className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-[var(--mic-1)] to-[var(--mic-2)] text-on-berry shadow-[var(--shadow-mic)]"
            aria-label={t("vendor.typeInstead")}
          >
            <Keyboard className="h-11 w-11" />
          </motion.button>
        )}
        <p className="text-sm font-semibold text-ink-2">{supported ? t("vendor.tapAndSpeak") : t("vendor.typeInstead")}</p>
      </section>
    );
  }

  const promptText =
    mode === "free" ? t("voice.prompt.free") : field ? t(PROMPT_KEYS[field], { field: "{field}" }) : t("voice.prompt.review");
  const promptSub = mode === "free" ? t("voice.sub.free") : field ? t(`voice.sub.${field}` as MessageKey) : "";

  return (
    <section className="flex flex-col gap-5">
      {/* Compact sticky header (scrolled past the big mic) */}
      <AnimatePresence>
        {!micInView && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed inset-x-0 top-0 z-40 border-b border-line bg-surface/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[var(--shadow-soft)] backdrop-blur lg:start-72"
          >
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">
                  <Slotted text={promptText} slot="field" value={field ? FIELD_LABELS[field] : ""} />
                </p>
                {mode === "guided" && <PinStepper step={g.step} filled={filled} onGoto={(i) => dispatch({ type: "goto", step: i })} compact />}
              </div>
              {supported && <MicOrb state={micState} level={level} size="sm" onPress={toggleListening} label={listening ? t("voice.pause") : t("voice.resume")} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings row */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<VoiceMode>
          size="sm"
          label={t("voice.mode.aria")}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErrors({});
            fixingRef.current = false;
          }}
          options={[
            { value: "guided", label: t("voice.mode.guided") },
            { value: "free", label: t("voice.mode.free") },
          ]}
        />
        <label className="relative flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-bold">
          <NotebookPen className="h-4 w-4 text-ink-3" aria-hidden />
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t("voice.year.aria")} className="appearance-none bg-transparent pe-1 focus:outline-none">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {supported && audioAvailable && (
          <button
            type="button"
            role="switch"
            aria-checked={recordAudio}
            aria-label={t("voice.audio.aria")}
            onClick={() => {
              const on = !recordAudio;
              setRecordAudio(on);
              if (!on) releaseAudio();
              else if (speech.current) void startClip();
            }}
            className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors ${
              recordAudio ? "border-transparent bg-surface-pink text-berry" : "border-line bg-surface text-ink-3"
            }`}
          >
            <AudioLines className="h-4 w-4" aria-hidden />
            {t("voice.audio")}
            {recordAudio && <Check className="h-3.5 w-3.5" aria-hidden />}
          </button>
        )}
        <button
          type="button"
          onClick={endSession}
          aria-label={t("voice.end")}
          title={t("voice.end")}
          className="ms-auto flex h-10 min-w-10 items-center justify-center gap-1 rounded-full border border-line bg-surface text-sm font-semibold text-ink-3 hover:text-berry sm:px-3"
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t("voice.end")}</span>
        </button>
      </div>

      {!supported && <UnsupportedNotice />}

      {mode === "guided" && <PinStepper step={g.step} filled={filled} onGoto={(i) => dispatch({ type: "goto", step: i })} />}

      <div className="text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h2
            key={`${mode}-${g.step}-${isAr}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            className="font-display-en text-2xl font-bold leading-snug sm:text-3xl"
          >
            <Slotted text={promptText} slot="field" value={field ? FIELD_LABELS[field] : ""} />
          </motion.h2>
        </AnimatePresence>
        {promptSub && <p className="mt-1 text-sm text-ink-3">{promptSub}</p>}
      </div>

      {supported && (
        <div ref={micRef} className="flex flex-col items-center gap-9 pb-2 pt-9">
          <div className="relative">
            <MicOrb state={micState} level={level} onPress={toggleListening} label={listening ? t("voice.pause") : t("voice.resume")} />
            <SaveBurst id={burst.id} big={burst.big} />
          </div>
          <p className={`text-sm font-bold ${listening ? "text-berry" : "text-ink-3"}`}>{listening ? t("voice.listening") : t("voice.paused")}</p>
        </div>
      )}
      {!supported && (
        <div ref={micRef} className="relative h-2">
          <SaveBurst id={burst.id} big={burst.big} />
        </div>
      )}

      {supported && (
        <TranscriptBox finalText={mode === "free" ? freeText : heard} interim={interim} placeholder={t("voice.heardPlaceholder")} />
      )}

      <CommandChips commands={mode === "guided" ? GUIDED_CMDS : FREE_CMDS} flash={flash} onCommand={runCommand} />

      <FieldsPanel
        values={g.values}
        step={mode === "guided" ? g.step : null}
        errors={errors}
        ctx={ctx}
        flashKey={flashKey}
        onSelect={(i) => mode === "guided" && g.step !== i && dispatch({ type: "goto", step: i })}
        onChange={(f, v) => {
          dispatch({ type: "setField", field: f, value: v });
          if (errors[f]) setErrors((e) => ({ ...e, [f]: undefined }));
        }}
        onEnter={() => (g.step >= REVIEW_STEP - 1 ? save() : runCommand("next"))}
      />
      {busy && <p className="text-center text-sm text-ink-3">…</p>}
      <p className="hidden text-center text-xs text-ink-3 lg:block">{t("voice.shortcuts")}</p>

      {/* This session */}
      <div className="flex flex-col gap-3 pt-2">
        <NotebookCard stats={stats} sessionCount={sessionCount} compact />
        {sessionCases.length > 0 && (
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-bold">{t("voice.loggedThisSession")}</h3>
            <span className="text-sm font-semibold text-ink-3">{sessionCases.length}</span>
          </div>
        )}
        <motion.div layout className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {sessionCases.map((c, i) => (
              <motion.div key={c.id} layout initial={{ opacity: 0, y: -40, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
                <CaseCard c={c} highlight={i === 0} parseDate={parseDate} fieldMic={(f, apply) => <FieldMic field={f} onText={apply} />} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

function UnsupportedNotice() {
  const { t } = useI18n();
  return (
    <div role="alert" className="w-full rounded-[var(--radius-card)] border border-open/30 bg-open-bg p-4 text-start text-sm text-ink">
      <p className="font-bold">{t("voice.unsupported.title")}</p>
      <p className="mt-1 text-ink-2">{t("voice.unsupported.body")}</p>
    </div>
  );
}
