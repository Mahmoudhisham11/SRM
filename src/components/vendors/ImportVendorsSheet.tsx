"use client";

import { useMemo, useRef, useState } from "react";
import { CircleAlert, FileSpreadsheet, Upload } from "lucide-react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, Sheet } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import { planVendorImport } from "@/lib/data/repo";
import type { Vendor } from "@/lib/types";
import { readVendorSheetFile, SheetFormatError, type SheetParseResult } from "@/lib/import/vendorSheet";

/**
 * Import vendors from a supplier sheet (.xlsx): Vendor Number · Vendor Name ·
 * Material Type. Shows what will happen (new / updated / unchanged / skipped)
 * before writing anything. Re-importing the same sheet is safe: vendors are
 * matched by number, so nothing is duplicated.
 */
export function ImportVendorsSheet({ open, vendors, onClose }: { open: boolean; vendors: Vendor[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} title={t("import.title")} onClose={onClose}>
      {open && <ImportFlow vendors={vendors} onDone={onClose} />}
    </Sheet>
  );
}

function ImportFlow({ vendors, onDone }: { vendors: Vendor[]; onDone: () => void }) {
  const repo = useRepo();
  const { notify, errorText } = useToast();
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; result: SheetParseResult } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");

  const plan = useMemo(() => (file ? planVendorImport(file.result.vendors, vendors) : null), [file, vendors]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError("");
    setFile(null);
    setBusy("reading");
    try {
      setFile({ name: f.name, result: await readVendorSheetFile(f) });
    } catch (e) {
      setError(
        e instanceof SheetFormatError
          ? t("import.err.columns", { cols: e.missing.map((c) => t(`import.col.${c}`)).join("، ") })
          : t("import.err.read", { reason: errorText(e) }),
      );
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  }

  async function run() {
    if (!file) return;
    setBusy("saving");
    try {
      const r = await repo.importVendors(file.result.vendors, vendors);
      notify(t("import.done", { created: r.created, updated: r.updated }), "success");
      onDone();
    } catch (e) {
      notify(errorText(e), "error");
      setBusy("");
    }
  }

  const skipped = file?.result.skipped ?? [];
  const nothingToDo = !!plan && plan.create.length + plan.update.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">{t("import.body")}</p>

      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!!busy}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center transition hover:border-berry-soft disabled:opacity-60"
      >
        <FileSpreadsheet className="h-8 w-8 text-berry" aria-hidden />
        <span className="font-semibold">{file ? file.name : t("import.pick")}</span>
        <span className="text-xs text-ink-3">{busy === "reading" ? t("import.reading") : file ? t("import.pickAnother") : ".xlsx"}</span>
      </button>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-bg p-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {file && plan && (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t("import.new")} value={plan.create.length} strong />
            <Stat label={t("import.updated")} value={plan.update.length} />
            <Stat label={t("import.unchanged")} value={plan.unchanged} />
          </dl>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-3">{t("import.materials", { n: file.result.materials.length })}</p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" dir="ltr">
              {file.result.materials.map((m) => (
                <span key={m.material} className="rounded-full bg-surface-pink px-2.5 py-1 text-xs font-semibold text-berry">
                  {m.material} <span className="text-ink-3">{m.count}</span>
                </span>
              ))}
            </div>
          </div>
          {skipped.length > 0 && (
            <details className="rounded-2xl bg-open-bg p-3 text-sm">
              <summary className="cursor-pointer font-semibold">{t("import.skipped", { n: skipped.length })}</summary>
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-ink-2">
                {skipped.slice(0, 100).map((s) => (
                  <li key={`${s.row}-${s.reason}`}>
                    {t("import.row", { row: s.row })}
                    {s.code ? ` (${s.code})` : ""}: {t(`import.reason.${s.reason}`)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {plan.update.length > 0 && <p className="text-xs text-ink-3">{t("import.updateNote")}</p>}
          <Button size="lg" onClick={run} disabled={!!busy || nothingToDo}>
            <Upload className="h-5 w-5" />
            {busy === "saving" ? t("import.saving") : nothingToDo ? t("import.nothing") : t("import.go", { n: plan.create.length + plan.update.length })}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${strong ? "bg-surface-pink text-berry" : "bg-surface-2"}`}>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
      <dt className="text-xs font-semibold text-ink-3">{label}</dt>
    </div>
  );
}
