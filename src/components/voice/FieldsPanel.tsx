"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/ui";
import { formatDMY } from "@/lib/dates";
import { parseSpokenDate, type DateContext } from "@/lib/parsing/arabicDates";
import { CASE_FIELDS, DATE_FIELDS, FIELD_LABELS, type CaseField } from "@/lib/types";
import type { FieldErrors } from "@/lib/validation";

/**
 * The five fields of the case being dictated. Each is also a normal input, so
 * everything can be done by keyboard. In guided mode the current field is
 * highlighted, and tapping a row moves dictation to it.
 */
export function FieldsPanel({
  values,
  step,
  errors,
  ctx,
  onSelect,
  onChange,
  onEnter,
}: {
  values: Record<CaseField, string>;
  /** Highlighted field index (guided mode) or null (free mode). */
  step: number | null;
  errors: FieldErrors<CaseField>;
  ctx: DateContext;
  onSelect: (index: number) => void;
  onChange: (field: CaseField, value: string) => void;
  /** Enter pressed in a single-line field (guided: go to next). */
  onEnter: () => void;
}) {
  // Keyboard flow: when the step moves (Enter / "التالي") and the user is
  // typing in this panel, move the caret to the new field. When dictating by
  // voice nothing is focused, so the phone keyboard doesn't pop up.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (step === null || !list || !list.contains(document.activeElement)) return;
    const target = list.querySelectorAll<HTMLElement>("[data-field-input]")[step];
    if (target && target !== document.activeElement) target.focus();
  }, [step]);

  return (
    <ol ref={listRef} className="flex flex-col gap-2">
      {CASE_FIELDS.map((field, i) => (
        <FieldRow
          key={field}
          field={field}
          index={i}
          value={values[field]}
          current={step === i}
          error={errors[field]}
          ctx={ctx}
          onSelect={() => onSelect(i)}
          onChange={(v) => onChange(field, v)}
          onEnter={onEnter}
        />
      ))}
    </ol>
  );
}

function FieldRow({
  field,
  index,
  value,
  current,
  error,
  ctx,
  onSelect,
  onChange,
  onEnter,
}: {
  field: CaseField;
  index: number;
  value: string;
  current: boolean;
  error?: string;
  ctx: DateContext;
  onSelect: () => void;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const id = useId();
  const isDate = DATE_FIELDS.has(field);
  const parsed = isDate && value.trim() ? parseSpokenDate(value, ctx) : null;
  const required = field === "case" || field === "startDate";

  return (
    <li
      className={`rounded-xl border p-3 transition-colors ${
        current ? "border-teal-500 bg-teal-50/60 ring-2 ring-teal-100" : error ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white"
      }`}
      onClick={onSelect}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            current ? "bg-teal-700 text-white" : value ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
          }`}
        >
          {value ? <Icon name="check" className="h-3.5 w-3.5" /> : index + 1}
        </span>
        <label htmlFor={id} className="text-sm font-bold text-slate-800" dir="ltr">
          {FIELD_LABELS[field]}
          {required && <span className="text-red-500">*</span>}
        </label>
        {current && <span className="ms-auto text-xs font-semibold text-teal-700">◀ بيسمع هنا</span>}
      </div>

      {field === "comments" ? (
        <textarea
          id={id}
          data-field-input
          rows={2}
          value={value}
          onFocus={onSelect}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-600/30"
        />
      ) : (
        <div className="flex gap-2">
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
            placeholder={isDate ? "15 مارس / 15/3 / النهارده" : ""}
            enterKeyHint="next"
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-base focus:outline-none focus:ring-2 focus:ring-teal-600/30"
          />
          {isDate && (
            <input
              type="date"
              aria-label={`اختيار ${FIELD_LABELS[field]} من التقويم`}
              value={parsed ?? ""}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-[8.5rem] shrink-0 rounded-lg border border-slate-300 bg-white px-1 text-sm"
            />
          )}
        </div>
      )}

      {isDate && value.trim() && (
        <p className={`mt-1 text-xs font-semibold ${parsed ? "text-emerald-700" : "text-red-600"}`}>
          {parsed ? (
            <>
              ✓ <span className="ltr-nums">{formatDMY(parsed)}</span>
            </>
          ) : (
            "⚠ مش فاهم التاريخ"
          )}
        </p>
      )}
      {error && !(isDate && value.trim() && !parsed) && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </li>
  );
}
