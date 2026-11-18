"use client";

import { AnimatePresence, motion, useTransform, type MotionValue } from "motion/react";
import { AudioLines, Mic, Pause } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { CASE_FIELDS, FIELD_LABELS } from "@/lib/types";
import type { VoiceCommand } from "@/lib/voice/commands";
import type { MessageKey } from "@/lib/i18n/messages";

// --- Mic orb ------------------------------------------------------------------

export type MicState = "idle" | "listening" | "paused" | "typing";

/**
 * The big mic. Listening: an organic aura (two morphing blobs) that swells
 * with her voice level. Paused: outline + pause icon + slowly turning dashed ring.
 */
export function MicOrb({
  state,
  level,
  size = "lg",
  onPress,
  label,
}: {
  state: MicState;
  level: MotionValue<number>;
  size?: "lg" | "sm";
  onPress: () => void;
  label: string;
}) {
  const scale = useTransform(level, [0, 1], [1, 1.25]);
  const scale2 = useTransform(level, [0, 1], [1, 1.14]);
  const dim = size === "lg" ? "h-28 w-28" : "h-12 w-12";
  const icon = size === "lg" ? "h-11 w-11" : "h-5 w-5";
  return (
    <motion.button
      type="button"
      onClick={onPress}
      aria-label={label}
      whileTap={{ scale: 0.94 }}
      className={`relative ${dim} shrink-0 rounded-full focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-berry-soft`}
    >
      {state === "listening" && (
        <>
          <motion.span style={{ scale }} className="absolute -inset-[24%]" aria-hidden>
            <span className="absolute inset-0 animate-[blob-morph_7s_ease-in-out_infinite] bg-berry-tint opacity-80" />
          </motion.span>
          <motion.span style={{ scale: scale2 }} className="absolute -inset-[12%]" aria-hidden>
            <span className="absolute inset-0 animate-[blob-morph_5s_ease-in-out_infinite_reverse] bg-surface-pink" />
          </motion.span>
        </>
      )}
      {state === "idle" && <span className="absolute -inset-[22%] rounded-full bg-berry-tint/70 blur-[2px]" aria-hidden />}
      {state === "paused" && (
        <span className="absolute -inset-[18%] animate-[spin_14s_linear_infinite] rounded-full border-2 border-dashed border-berry-soft" aria-hidden />
      )}
      <span
        className={`relative flex h-full w-full items-center justify-center rounded-full transition-colors ${
          state === "paused"
            ? "border-[3px] border-berry bg-surface text-berry"
            : "bg-gradient-to-br from-[var(--mic-1)] to-[var(--mic-2)] text-on-berry shadow-[var(--shadow-mic)]"
        }`}
      >
        {state === "paused" ? <Pause className={icon} /> : <Mic className={icon} />}
      </span>
    </motion.button>
  );
}

// --- Save burst ----------------------------------------------------------------

/**
 * Plays over the mic after a save: a check that draws itself in a mint disc,
 * plus a ring of sparkles (a bigger burst of dots for a milestone). ~0.9s, never blocks input.
 */
export function SaveBurst({ id, big }: { id: number; big: boolean }) {
  const n = big ? 18 : 10;
  return (
    <AnimatePresence>
      {id > 0 && (
        <motion.div key={id} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.span
            className="absolute flex h-28 w-28 items-center justify-center rounded-full bg-closed text-white shadow-lg"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [0.3, 1.08, 1, 0.9], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.95, times: [0, 0.3, 0.7, 1], ease: "easeOut" }}
          >
            <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }} />
            </svg>
          </motion.span>
          {Array.from({ length: n }, (_, i) => {
            const angle = (i / n) * Math.PI * 2 + (big ? 0 : 0.3);
            const dist = (big ? 150 : 95) + (i % 3) * 14;
            return (
              <motion.span
                key={i}
                className="absolute text-berry"
                initial={{ x: 0, y: 0, scale: 0.2, opacity: 0, rotate: 0 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  scale: [0.2, 1, 0.6],
                  opacity: [0, 1, 0],
                  rotate: big ? 160 : 90,
                }}
                transition={{ duration: big ? 1.3 : 0.85, delay: 0.08 + (i % 4) * 0.02, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden
              >
                {big ? (
                  <span className={`block rounded-full ${i % 2 ? "h-3 w-3 bg-berry" : "h-2.5 w-2.5 bg-berry-soft"}`} />
                ) : (
                  <svg viewBox="0 0 10 10" className="h-3 w-3" fill="currentColor">
                    <path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2Z" />
                  </svg>
                )}
              </motion.span>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Stepper (pin-shaped) ------------------------------------------------------------

function Pin({ state }: { state: "done" | "current" | "todo" }) {
  const big = state === "current";
  return (
    <motion.svg
      viewBox="0 0 24 30"
      className={big ? "h-9 w-8" : "h-7 w-6"}
      animate={{ scale: big ? 1 : 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      aria-hidden
    >
      <path
        d="M12 28.5C6 22 2 17.6 2 12a10 10 0 0 1 20 0c0 5.6-4 10-10 16.5Z"
        fill={state === "done" ? "var(--berry)" : state === "current" ? "var(--berry-tint)" : "var(--surface)"}
        stroke={state === "todo" ? "var(--line-strong)" : "var(--berry)"}
        strokeWidth={state === "current" ? 2.4 : 1.6}
      />
      {state === "done" && <path d="M8 12l3 3 5-5.5" fill="none" stroke="var(--on-berry)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </motion.svg>
  );
}

export function PinStepper({
  step,
  filled,
  onGoto,
  compact = false,
}: {
  step: number;
  filled: boolean[];
  onGoto: (i: number) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <ol className="relative flex items-start justify-between" aria-label={t("voice.step", { n: Math.min(step + 1, 5) })}>
      <span className="absolute inset-x-6 top-3.5 h-px bg-line-strong" aria-hidden />
      {CASE_FIELDS.map((f, i) => {
        const state = i === step ? "current" : filled[i] || i < step ? "done" : "todo";
        return (
          <li key={f} className="relative flex min-w-0 flex-1 flex-col items-center">
            <button
              type="button"
              onClick={() => onGoto(i)}
              aria-current={i === step ? "step" : undefined}
              className="flex max-w-full flex-col items-center gap-1 rounded-xl px-0.5 focus-visible:outline-2 focus-visible:outline-berry"
            >
              <span className="flex h-9 items-end bg-transparent">
                <Pin state={state} />
              </span>
              {!compact && (
                <span className={`max-w-full truncate text-[11px] ${i === step ? "font-bold text-berry" : "font-medium text-ink-3"}`} dir="ltr">
                  {FIELD_LABELS[f]}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// --- Command chips ------------------------------------------------------------------

const CHIP_KEYS: Record<VoiceCommand, MessageKey> = {
  next: "voice.next",
  skip: "voice.skip",
  back: "voice.back",
  clear: "voice.clear",
  save: "voice.save",
};

/** Spoken commands as tappable chips; the one just heard flashes. */
export function CommandChips({
  commands,
  flash,
  onCommand,
}: {
  commands: VoiceCommand[];
  flash: { cmd: VoiceCommand; at: number } | null;
  onCommand: (c: VoiceCommand) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {commands.map((c) => {
        const lit = flash?.cmd === c;
        return (
          <motion.button
            key={lit ? `${c}-${flash!.at}` : c}
            type="button"
            onClick={() => onCommand(c)}
            initial={lit ? { scale: 1.18 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 12 }}
            whileTap={{ scale: 0.92 }}
            className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${
              lit
                ? "border-berry bg-berry-tint text-berry"
                : c === "save"
                  ? "border-berry-soft bg-surface text-berry"
                  : "border-line bg-surface text-ink-2 hover:border-berry-soft"
            }`}
          >
            «{t(CHIP_KEYS[c])}»
          </motion.button>
        );
      })}
    </div>
  );
}

// --- Transcript box ------------------------------------------------------------------

export function TranscriptBox({ finalText, interim, placeholder }: { finalText: string; interim: string; placeholder: string }) {
  const { t } = useI18n();
  const words = finalText ? finalText.split(/\s+/) : [];
  return (
    <div className="rounded-[1.25rem] border-2 border-dashed border-line-strong bg-surface/70 px-4 py-3" aria-live="polite">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink-3">
        <AudioLines className="h-3.5 w-3.5" aria-hidden />
        {t("voice.heard")}
      </p>
      <p className="min-h-8 text-lg leading-relaxed" dir="auto">
        {!finalText && !interim && <span className="text-base text-ink-3">{placeholder}</span>}
        {words.map((w, i) => (
          <motion.span
            key={`${i}-${w}`}
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }}
            className="text-ink"
          >
            {w}{" "}
          </motion.span>
        ))}
        {interim && <span className="text-ink-3">{interim}</span>}
        <span className="ms-0.5 inline-block h-5 w-[2px] translate-y-1 animate-[caret-blink_1s_step-end_infinite] bg-berry" aria-hidden />
      </p>
    </div>
  );
}

