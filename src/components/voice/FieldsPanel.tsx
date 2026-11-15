"use client";

import { useEffect, useId, useRef } from "react";
import { motion, useAnimate } from "motion/react";
import { Calendar, Check, CircleAlert, Mic } from "lucide-react";
import { formatDMY } from "@/lib/dates";
import { parseSpokenDate, parseSpokenEndDate, type DateContext } from "@/lib/parsing/arabicDates";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { CASE_FIELDS, DATE_FIELDS, FIELD_LABELS, type CaseField } from "@/lib/types";
import type { FieldErrors } from "@/lib/validation";

/**
 * The five fields of the case being dictated, as cards. Each is a normal
 * input too (keyboard fallback). In guided mode the current card is
 * highlighted, and tapping a card (or its mic) moves dictation there.
 */
export function FieldsPanel({
  values,
  step,
  errors,
  ctx,
  flashKey,
  onSelect,
  onChange,
  onEnter,
}: {
  values: Record<CaseField, string>;
  /** Highlighted field index (guided mode) or null (free mode). */
  step: number | null;
  errors: FieldErrors<CaseField>;
  ctx: DateContext;
  /** Bump to make filled cards pulse in sequence (free mode: words "fly" into fields). */
  flashKey: number;
  onSelect: (index: number) => void;
  onChange: (field: CaseField, value: string) => void;
  onEnter: () => void;
}) {
  // Keyboard flow: when the step moves and she's typing in this panel, move the caret
  // to the new field. When dictating nothing is focused, so the phone keyboard stays down.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (step === null || !list || !list.contains(document.activeElement)) return;
    const target = list.querySelectorAll<HTMLElement>("[data-field-input]")[step];
    if (target && target !== document.activeElement) target.focus();
  }, [step]);

  let filledIndex = 0;
  const startIso = values.startDate.trim() ? parseSpokenDate(values.startDate, ctx) : null;
  return (
    <ol ref={listRef} className="flex flex-col gap-2.5">
      {CASE_FIELDS.map((field, i) => (
        <FieldCard
          key={field}
          field={field}
          index={i}
          value={values[field]}
          current={step === i}
          error={errors[field]}
          ctx={ctx}
          startIso={startIso}
          flashKey={flashKey}
          flashOrder={values[field].trim() ? filledIndex++ : 0}
          onSelect={() => onSelect(i)}
          onChange={(v) => onChange(field, v)}
          onEnter={onEnter}
        />
      ))}
    </ol>
  );
}

function FieldCard({
  field,
  index,
  value,
  current,
  error,
  ctx,
  startIso,
  flashKey,
  flashOrder,
  onSelect,
  onChange,
  onEnter,
}: {
  field: CaseField;
  index: number;
  value: string;
  current: boolean;
  error?: MessageKey;
  ctx: DateContext;
  /** Parsed Start Date, so the End Date preview handles New Year rollover. */
  startIso: string | null;
  flashKey: number;
  flashOrder: number;
  onSelect: () => void;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const { t, isAr } = useI18n();
  const id = useId();
  const isDate = DATE_FIELDS.has(field);
  const parsed = !isDate || !value.trim() ? null : field === "endDate" ? parseSpokenEndDate(value, startIso, ctx) : parseSpokenDate(value, ctx);
  const required = field === "case" || field === "startDate";
  const filled = isDate ? !!parsed : !!value.trim();
  const dateUnclear = isDate && !!value.trim() && !parsed;

  // Imperative so the <li> never remounts (that would drop keyboard focus).
  const [scope, animate] = useAnimate<HTMLLIElement>();
  const seen = useRef({ flashKey, error });
  useEffect(() => {
    const prev = seen.current;
    seen.current = { flashKey, error };
    if (!scope.current) return;
    if (flashKey !== prev.flashKey && flashKey > 0 && value.trim()) {
      void animate(scope.current, { backgroundColor: ["var(--surface)", "var(--berry-tint)", "var(--surface)"] }, { duration: 0.7, delay: flashOrder * 0.09 });
    }
    if (error && error !== prev.error && !dateUnclear) void animate(scope.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.4 });
  }, [flashKey, error, value, flashOrder, dateUnclear, animate, scope]);

  return (
    <motion.li
      ref={scope}
      layout
      onClick={onSelect}
      className={`rounded-[1.25rem] border bg-surface p-4 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] ${
        current ? "border-berry ring-4 ring-berry-tint" : error ? "border-danger/60" : "border-line"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            current ? "bg-berry text-on-berry" : "bg-surface-2 text-ink-3"
          }`}
        >
          {index + 1}
        </span>
        <label htmlFor={id} className="text-sm font-bold" dir="ltr">
          {FIELD_LABELS[field]}
          {required && <span className="text-danger">*</span>}
        </label>
        {isAr && <span className="text-xs text-ink-3">{t(`voice.fieldHint.${field}` as MessageKey)}</span>}
        <span className="ms-auto flex items-center gap-1">
          {filled && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex h-6 w-6 items-center justify-center rounded-full bg-closed-bg text-closed" aria-hidden>
              <Check className="h-3.5 w-3.5" />
            </motion.span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            aria-label={t("case.redictate", { field: FIELD_LABELS[field] })}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${current ? "text-berry" : "text-ink-3 hover:text-berry"}`}
          >
            <Mic className="h-4 w-4" />
          </button>
        </span>
      </div>

      {field === "comments" ? (
        <textarea
          id={id}
          data-field-input
          rows={2}
          value={value}
          onFocus={onSelect}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-none rounded-xl bg-transparent px-1 text-lg leading-relaxed focus:bg-surface-2 focus:outline-none"
        />
      ) : (
        <div className="flex items-center gap-2">
          <input
            id={id}
            data-field-input
            value={value}
            onFocus={onSelect}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onEnter();
              }
            }}
            placeholder={isDate ? t("voice.datePlaceholder") : ""}
            enterKeyHint="next"
            className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-1 text-lg placeholder:text-base placeholder:text-ink-3 focus:bg-surface-2 focus:outline-none"
          />
          {isDate && (
            // The native date input sits invisibly on top of the icon, so tapping opens the OS picker.
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <Calendar className="h-4 w-4" aria-hidden />
              <input
                type="date"
                aria-label={t("voice.pickDate", { field: FIELD_LABELS[field] })}
                value={parsed ?? ""}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
          )}
        </div>
      )}

      {isDate && value.trim() && (
        <motion.p
          key={parsed ?? "bad"}
          initial={{ opacity: 0, scale: 0.8, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${parsed ? "bg-closed-bg text-closed" : "bg-danger-bg text-danger"}`}
        >
          {parsed ? (
            <>
              <span className="ltr-nums">{formatDMY(parsed)}</span>
              <Check className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              <CircleAlert className="h-3.5 w-3.5" aria-hidden />
              {t("voice.dateNotUnderstood")}
            </>
          )}
        </motion.p>
      )}
      {error && !dateUnclear && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-danger">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          {t(error)}
        </p>
      )}
    </motion.li>
  );
}
