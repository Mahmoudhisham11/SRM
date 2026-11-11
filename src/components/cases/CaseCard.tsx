"use client";

import { useState, type ReactNode } from "react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ConfirmDialog, Icon, IconButton, StatusBadge } from "@/components/ui";
import { daysBetween, formatDMY } from "@/lib/dates";
import { cleanText } from "@/lib/parsing/caseParser";
import { FIELD_LABELS, type Case, type CaseField, type CasePatch } from "@/lib/types";
import { validateCaseFields } from "@/lib/validation";

/** Slot for re-dictating one field; provided by the voice module. */
export type FieldMicRenderer = (field: CaseField, apply: (text: string) => void) => ReactNode;

/**
 * Editable review card. Tap any field to fix it by keyboard; when a
 * `fieldMic` renderer is given, each field also gets a mic to re-dictate it.
 */
export function CaseCard({
  c,
  vendorName,
  highlight = false,
  fieldMic,
  parseDate,
  compact = false,
}: {
  c: Case;
  vendorName?: string;
  highlight?: boolean;
  /** Start as a one-line summary that expands on tap (long history lists). */
  compact?: boolean;
  fieldMic?: FieldMicRenderer;
  /** Turns re-dictated date speech into ISO. */
  parseDate?: (text: string) => string | null;
}) {
  const repo = useRepo();
  const { track, notify } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  function save(patch: CasePatch): boolean {
    const next = { ...c, ...patch };
    const errors = validateCaseFields(next);
    const first = Object.values(errors)[0];
    if (first) {
      notify(first, "error");
      return false;
    }
    track(repo.updateCase(c.id, patch));
    return true;
  }

  function applySpoken(field: CaseField, text: string) {
    if (field === "startDate" || field === "endDate") {
      const iso = parseDate?.(text) ?? null;
      if (!iso) return notify(`مش فاهم التاريخ: «${text}»`, "error");
      save({ [field]: iso });
    } else {
      save({ [field]: cleanText(text) });
    }
  }

  const duration = c.endDate ? daysBetween(c.startDate, c.endDate) : null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start shadow-sm hover:border-teal-300"
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.status === "open" ? "bg-amber-500" : "bg-emerald-500"}`} aria-label={c.status === "open" ? "مفتوحة" : "مغلقة"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{c.case}</span>
          <span className="block truncate text-xs text-slate-500">
            {vendorName && <>{vendorName} · </>}
            <span className="ltr-nums">{formatDMY(c.startDate)}{c.endDate ? ` → ${formatDMY(c.endDate)}` : ""}</span>
            {c.taskBar && <> · {c.taskBar}</>}
          </span>
        </span>
        {c.audioUrl && <Icon name="play" className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-slate-400" />
      </button>
    );
  }

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${highlight ? "border-teal-400 ring-2 ring-teal-100" : "border-slate-200"}`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        {duration !== null && <span className="text-xs text-slate-500">{duration} يوم</span>}
        {vendorName && <span className="text-xs font-semibold text-slate-600">{vendorName}</span>}
        <div className="ms-auto flex items-center gap-1">
          {compact && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} aria-expanded>
              طي
            </Button>
          )}
          {c.transcript && (
            <Button variant="ghost" size="sm" onClick={() => setShowTranscript((s) => !s)}>
              {showTranscript ? "إخفاء النص" : "النص المسموع"}
            </Button>
          )}
          <IconButton label="حذف الحالة" onClick={() => setConfirmDelete(true)} className="hover:text-red-600">
            <Icon name="trash" className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <EditableText field="case" value={c.case} required onSave={(v) => save({ case: v })} mic={fieldMic?.("case", (t) => applySpoken("case", t))} wide />
        <EditableText field="taskBar" value={c.taskBar} onSave={(v) => save({ taskBar: v })} mic={fieldMic?.("taskBar", (t) => applySpoken("taskBar", t))} wide />
        <EditableDate field="startDate" value={c.startDate} required onSave={(v) => save({ startDate: v ?? undefined })} mic={fieldMic?.("startDate", (t) => applySpoken("startDate", t))} />
        <EditableDate field="endDate" value={c.endDate} onSave={(v) => save({ endDate: v })} mic={fieldMic?.("endDate", (t) => applySpoken("endDate", t))} />
        <EditableText field="comments" value={c.comments} multiline onSave={(v) => save({ comments: v })} mic={fieldMic?.("comments", (t) => applySpoken("comments", t))} wide />
      </dl>

      {c.audioUrl && (
        <audio controls preload="none" src={c.audioUrl} className="mt-3 h-10 w-full">
          <track kind="captions" />
        </audio>
      )}
      {showTranscript && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600" dir="auto">
          {c.transcript}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="حذف الحالة"
        message={<p>هل تريد حذف «{c.case}»؟ لا يمكن التراجع.</p>}
        onConfirm={() => track(repo.deleteCase(c.id), "تم الحذف")}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
  );
}

function FieldShell({
  field,
  required,
  wide,
  mic,
  children,
}: {
  field: CaseField;
  required?: boolean;
  wide?: boolean;
  mic?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-slate-500" dir="ltr" style={{ justifyContent: "flex-end" }}>
        {FIELD_LABELS[field]}
        {required && <span className="text-red-500">*</span>}
      </dt>
      <dd className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        {mic}
      </dd>
    </div>
  );
}

const displayBtn =
  "w-full min-h-10 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-600";

function EditableText({
  field,
  value,
  onSave,
  required,
  multiline,
  wide,
  mic,
}: {
  field: CaseField;
  value: string;
  onSave: (v: string) => boolean;
  required?: boolean;
  multiline?: boolean;
  wide?: boolean;
  mic?: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim();
    if (v === value || onSave(v)) setDraft(null);
  };
  const cancel = () => setDraft(null);
  const common = {
    autoFocus: true,
    value: draft ?? "",
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    "aria-label": FIELD_LABELS[field],
    className: "w-full rounded-lg border border-teal-500 bg-white px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-600/30",
  };
  return (
    <FieldShell field={field} required={required} wide={wide} mic={mic}>
      {draft === null ? (
        <button type="button" className={displayBtn} onClick={() => setDraft(value)} aria-label={`تعديل ${FIELD_LABELS[field]}`}>
          {value ? <span className="whitespace-pre-wrap break-words">{value}</span> : <span className="text-slate-400">—</span>}
        </button>
      ) : multiline ? (
        <textarea rows={3} {...common} onKeyDown={(e) => e.key === "Escape" && cancel()} />
      ) : (
        <input
          {...common}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
        />
      )}
    </FieldShell>
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
  const [editing, setEditing] = useState(false);
  return (
    <FieldShell field={field} required={required} mic={mic}>
      {!editing ? (
        <button type="button" className={displayBtn} onClick={() => setEditing(true)} aria-label={`تعديل ${FIELD_LABELS[field]}`}>
          {value ? <span className="ltr-nums font-medium">{formatDMY(value)}</span> : <span className="text-slate-400">—</span>}
        </button>
      ) : (
        <div className="flex items-center gap-1">
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
            className="h-10 min-w-0 flex-1 rounded-lg border border-teal-500 bg-white px-2 text-base"
          />
          {!required && value && (
            <Button
              variant="ghost"
              size="sm"
              // onMouseDown so it fires before the input's blur closes the editor
              onMouseDown={(e) => {
                e.preventDefault();
                if (onSave(null)) setEditing(false);
              }}
            >
              مسح
            </Button>
          )}
        </div>
      )}
    </FieldShell>
  );
}
