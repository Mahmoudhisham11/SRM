"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { Calendar, CircleCheck, ChevronDown, Clock, Trash2 } from "lucide-react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { ConfirmDialog, StatusIcon, StatusPill } from "@/components/ui";
import { AudioPlayer } from "./AudioPlayer";
import { daysBetween, formatDMY, todayISO } from "@/lib/dates";
import { cleanText } from "@/lib/parsing/caseParser";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { scheduleDelete, undoDelete } from "@/lib/data/pendingDeletes";
import { FIELD_LABELS, type Case, type CaseField, type CasePatch } from "@/lib/types";
import { validateCaseFields } from "@/lib/validation";

/** Slot for re-dictating one field; provided by the voice module. */
export type FieldMicRenderer = (field: CaseField, apply: (text: string) => void) => ReactNode;

/**
 * A case, as a compact row (history lists: tap to expand, swipe for actions)
 * or as the full editable "review card" (tap a value to edit it, or use the
 * mic beside it to re-dictate just that field).
 */
export function CaseCard({
  c,
  compact = false,
  highlight = false,
  vendorName,
  fieldMic,
  parseDate,
}: {
  c: Case;
  compact?: boolean;
  highlight?: boolean;
  vendorName?: string;
  fieldMic?: FieldMicRenderer;
  parseDate?: (text: string) => string | null;
}) {
  const repo = useRepo();
  const { t } = useI18n();
  const { track, notify } = useToast();
  const [expanded, setExpanded] = useState(!compact);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  function save(patch: CasePatch): boolean {
    const errs = validateCaseFields({ ...c, ...patch });
    const first = Object.values(errs)[0];
    if (first) {
      notify(t(first), "error");
      return false;
    }
    track(repo.updateCase(c.id, patch));
    return true;
  }

  function applySpoken(field: CaseField, text: string) {
    if (field === "startDate" || field === "endDate") {
      const iso = parseDate?.(text) ?? null;
      if (!iso) return notify(`${t("voice.dateNotUnderstood")}: «${text}»`, "error");
      save({ [field]: iso });
    } else save({ [field]: cleanText(text) });
  }

  function remove() {
    scheduleDelete(c.id, () => track(repo.deleteCase(c.id)));
    notify(t("case.deleted"), "info", { label: t("case.undo"), run: () => undoDelete(c.id) });
  }

  function closeToday() {
    const today = todayISO();
    if (!save({ endDate: today < c.startDate ? c.startDate : today })) return;
    notify(t("case.closedToast"), "success", { label: t("case.undo"), run: () => void repo.updateCase(c.id, { endDate: null }) });
  }

  const days = c.endDate ? daysBetween(c.startDate, c.endDate) : daysBetween(c.startDate, todayISO());
  const daysText = days === 1 ? t("day1") : t("days", { n: Math.max(days, 0) });
  const mic = (f: CaseField) => fieldMic?.(f, (txt) => applySpoken(f, txt));

  return (
    <>
      <AnimatePresence initial={false} mode="popLayout">
        {!expanded ? (
          <SwipeRow key="row" canClose={c.status === "open"} onClose={closeToday} onDelete={remove}>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              className="flex w-full items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-4 py-3.5 text-start shadow-[var(--shadow-soft)] transition hover:border-berry-soft"
            >
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{c.case}</span>
                <span className="block truncate text-xs text-ink-3">
                  {vendorName && <>{vendorName} · </>}
                  {c.taskBar && <>{c.taskBar} · </>}
                  <span className="ltr-nums">
                    {formatDMY(c.startDate)}
                    {c.endDate ? ` → ${formatDMY(c.endDate)}` : ""}
                  </span>
                </span>
              </span>
              <StatusIcon status={c.status} />
            </button>
          </SwipeRow>
        ) : (
          <motion.article
            key="card"
            layout
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className={`card p-5 ${highlight ? "!border-berry-soft ring-4 ring-berry-tint" : ""}`}
          >
            <header className="flex flex-wrap items-center gap-2">
              <StatusPill status={c.status} />
              <span className="flex items-center gap-1 text-xs font-semibold text-ink-3">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {daysText}
              </span>
              {vendorName && <span className="text-xs font-semibold text-ink-2">· {vendorName}</span>}
              <div className="ms-auto flex items-center gap-0.5">
                {compact && (
                  <button type="button" onClick={() => setExpanded(false)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-3 hover:bg-surface-2">
                    {t("case.collapse")}
                  </button>
                )}
                {c.status === "open" && (
                  <button type="button" onClick={closeToday} title={t("case.closeToday")} aria-label={t("case.closeToday")} className="rounded-full p-2 text-ink-3 hover:bg-surface-2 hover:text-closed">
                    <CircleCheck className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => setConfirmDelete(true)} aria-label={t("common.delete")} className="rounded-full p-2 text-ink-3 hover:bg-surface-2 hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </header>

            <EditableTitle value={c.case} onSave={(v) => save({ case: v })} mic={mic("case")} />

            <dl className="divide-y divide-line border-t border-line">
              <EditableText field="taskBar" value={c.taskBar} onSave={(v) => save({ taskBar: v })} mic={mic("taskBar")} />
              <EditableDate field="startDate" value={c.startDate} required onSave={(v) => save({ startDate: v ?? undefined })} mic={mic("startDate")} />
              <EditableDate field="endDate" value={c.endDate} onSave={(v) => save({ endDate: v })} mic={mic("endDate")} />
              <EditableText field="comments" value={c.comments} multiline onSave={(v) => save({ comments: v })} mic={mic("comments")} />
            </dl>

            {c.audioUrl && (
              <div className="mt-3">
                <AudioPlayer src={c.audioUrl} seed={c.id} />
              </div>
            )}
            {c.transcript && (
              <div className="mt-2">
                <button type="button" onClick={() => setShowTranscript((s) => !s)} className="text-xs font-semibold text-berry hover:underline">
                  {showTranscript ? t("case.hideTranscript") : t("case.transcript")}
                </button>
                <AnimatePresence>
                  {showTranscript && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden rounded-2xl bg-surface-2 text-sm leading-relaxed text-ink-2"
                      dir="auto"
                    >
                      <span className="block p-3">{c.transcript}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.article>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDelete}
        icon={<Trash2 className="h-6 w-6" />}
        title={t("case.delete.title")}
        body={t("case.delete.body", { case: c.case })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** Swipe toward the end edge → close today (open cases); toward the start edge → delete. */
function SwipeRow({ children, canClose, onClose, onDelete }: { children: ReactNode; canClose: boolean; onClose: () => void; onDelete: () => void }) {
  const { isAr, t } = useI18n();
  const x = useMotionValue(0);
  // In RTL the "end" edge is on the left, so the meaning of +x flips.
  const toEnd = (v: number) => (isAr ? -v : v);
  const closeOpacity = useTransform(x, (v) => (canClose ? Math.min(1, Math.max(0, toEnd(v) / 80)) : 0));
  const deleteOpacity = useTransform(x, (v) => Math.min(1, Math.max(0, -toEnd(v) / 80)));
  return (
    <motion.div layout className="relative" exit={{ opacity: 0, height: 0 }}>
      <motion.div style={{ opacity: closeOpacity }} className="absolute inset-0 flex items-center justify-start rounded-[1.25rem] bg-closed-bg px-5 text-closed" aria-hidden>
        <span className="flex items-center gap-2 text-sm font-bold">
          <CircleCheck className="h-5 w-5" />
          {t("case.closeToday")}
        </span>
      </motion.div>
      <motion.div style={{ opacity: deleteOpacity }} className="absolute inset-0 flex items-center justify-end rounded-[1.25rem] bg-danger-bg px-5 text-danger" aria-hidden>
        <Trash2 className="h-5 w-5" />
      </motion.div>
      <motion.div
        drag="x"
        style={{ x, touchAction: "pan-y" }}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragEnd={(_, info) => {
          const d = toEnd(info.offset.x);
          if (d > 110 && canClose) onClose();
          else if (d < -110) onDelete();
        }}
        className="relative"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function FieldLabel({ field, required }: { field: CaseField; required?: boolean }) {
  const { t, isAr } = useI18n();
  return (
    <dt className="w-24 shrink-0 pt-2 sm:w-28">
      <span className="block text-xs font-bold text-ink" dir="ltr" style={{ textAlign: "start" }}>
        {FIELD_LABELS[field]}
        {required && <span className="text-danger">*</span>}
      </span>
      {isAr && <span className="block text-[11px] text-ink-3">{t(`voice.fieldHint.${field}` as MessageKey)}</span>}
    </dt>
  );
}

const valueBtn =
  "w-full min-h-10 rounded-xl px-2 py-1.5 text-start transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-berry";

function EditableTitle({ value, onSave, mic }: { value: string; onSave: (v: string) => boolean; mic?: ReactNode }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim();
    if (v === value || onSave(v)) setDraft(null);
  };
  return (
    <div className="my-3 flex items-start gap-2">
      {draft === null ? (
        <button type="button" onClick={() => setDraft(value)} aria-label={t("case.editField", { field: "Case" })} className={`${valueBtn} text-xl font-bold leading-snug`}>
          {value}
        </button>
      ) : (
        <input
          autoFocus
          value={draft}
          aria-label="Case"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          className="w-full rounded-xl border border-berry bg-surface px-2 py-1.5 text-xl font-bold focus:outline-none focus:ring-4 focus:ring-berry-tint"
        />
      )}
      {mic}
    </div>
  );
}

function EditableText({
  field,
  value,
  onSave,
  multiline,
  mic,
}: {
  field: CaseField;
  value: string;
  onSave: (v: string) => boolean;
  multiline?: boolean;
  mic?: ReactNode;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim();
    if (v === value || onSave(v)) setDraft(null);
  };
  const common = {
    autoFocus: true,
    value: draft ?? "",
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    "aria-label": FIELD_LABELS[field],
    className: "w-full rounded-xl border border-berry bg-surface px-2 py-1.5 text-base focus:outline-none focus:ring-4 focus:ring-berry-tint",
  };
  return (
    <div className="flex items-start gap-2 py-1.5">
      <FieldLabel field={field} />
      <dd className="min-w-0 flex-1">
        {draft === null ? (
          <button type="button" className={valueBtn} onClick={() => setDraft(value)} aria-label={t("case.editField", { field: FIELD_LABELS[field] })}>
            {value ? <span className="whitespace-pre-wrap break-words">{value}</span> : <span className="text-ink-3">—</span>}
          </button>
        ) : multiline ? (
          <textarea rows={3} {...common} onKeyDown={(e) => e.key === "Escape" && setDraft(null)} />
        ) : (
          <input
            {...common}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setDraft(null);
            }}
          />
        )}
      </dd>
      {mic}
    </div>
  );
}

function EditableDate({
  field,
  value,
  onSave,
  required,
  mic,
}: {
  field: CaseField;
  value: string | null;
  onSave: (v: string | null) => boolean;
  required?: boolean;
  mic?: ReactNode;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-start gap-2 py-1.5">
      <FieldLabel field={field} required={required} />
      <dd className="min-w-0 flex-1">
        {!editing ? (
          <button type="button" className={valueBtn} onClick={() => setEditing(true)} aria-label={t("case.editField", { field: FIELD_LABELS[field] })}>
            {value ? <span className="ltr-nums font-medium">{formatDMY(value)}</span> : <span className="text-ink-3">—</span>}
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            <input
              type="date"
              autoFocus
              defaultValue={value ?? ""}
              aria-label={FIELD_LABELS[field]}
              onChange={(e) => {
                if (e.target.value && onSave(e.target.value)) setEditing(false);
              }}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-berry bg-surface px-2 text-base"
            />
            {!required && value && (
              <button
                type="button"
                // onMouseDown so it runs before the input's blur closes the editor
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (onSave(null)) setEditing(false);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2"
              >
                {t("common.clear")}
              </button>
            )}
          </div>
        )}
      </dd>
      {mic}
    </div>
  );
}

