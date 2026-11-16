"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { CircleAlert, Download, FileSpreadsheet, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { DesktopHeader, TopBar } from "@/components/AppShell";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import { todayISO, formatDMY } from "@/lib/dates";
import { downloadBlob } from "@/lib/export/exportRows";
import { DuesFormatError, statusReportFileName, type StatusReport } from "@/lib/dues/statusReport";

const fmtMoney = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Stage = { kind: "idle" } | { kind: "working" } | { kind: "done"; report: StatusReport; blob: Blob; sheet: string } | { kind: "error"; message: string };

/**
 * Dues: upload the ERP export «DM AP Order To Pay» and download the
 * Supplier Invoices Status Report (original sheet + Final + Breakdown).
 * Everything runs in the browser — the file is never uploaded anywhere.
 */
export function DuesPage() {
  const { t } = useI18n();
  const { notify, errorText } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; data: ArrayBuffer } | null>(null);
  const [cutoff, setCutoff] = useState(todayISO());
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);

  const run = useCallback(
    async (f: { name: string; data: ArrayBuffer }, date: string) => {
      setStage({ kind: "working" });
      // Let the spinner paint before the heavy work starts.
      await new Promise((r) => setTimeout(r, 30));
      try {
        const { generateStatusReport } = await import("@/lib/dues/statusReportXlsx");
        // exceljs may detach the buffer: always give it a copy.
        const out = await generateStatusReport(f.data.slice(0), date);
        setStage({ kind: "done", report: out.report, blob: out.blob, sheet: out.sourceSheet });
      } catch (e) {
        const message =
          e instanceof DuesFormatError
            ? t("dues.err.columns", { cols: e.missing.join("، ") })
            : t("dues.err.read", { reason: errorText(e) });
        setStage({ kind: "error", message });
      }
    },
    [t, errorText],
  );

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      notify(t("dues.err.type"), "error");
      return;
    }
    const data = await f.arrayBuffer();
    const next = { name: f.name, data };
    setFile(next);
    void run(next, cutoff);
    if (input.current) input.current.value = "";
  }

  function changeCutoff(v: string) {
    if (!v) return;
    setCutoff(v);
    if (file) void run(file, v);
  }

  const working = stage.kind === "working";

  return (
    <div className="flex flex-col gap-5">
      <TopBar title={t("nav.dues")} />
      <DesktopHeader title={t("dues.title")} />

      <p className="max-w-2xl text-sm text-ink-2">{t("dues.intro")}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Upload */}
        <div>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <button
            type="button"
            disabled={working}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-4 py-8 text-center transition disabled:opacity-70 ${
              dragging ? "border-berry bg-surface-pink" : "border-line-strong bg-surface hover:border-berry-soft"
            }`}
          >
            {working ? <LoaderCircle className="h-9 w-9 animate-spin text-berry" aria-hidden /> : <FileSpreadsheet className="h-9 w-9 text-berry" aria-hidden />}
            <span className="max-w-full break-all font-bold [overflow-wrap:anywhere]">{working ? t("dues.working") : file ? file.name : t("dues.pick")}</span>
            <span className="text-xs text-ink-3">{file && !working ? t("dues.pickAnother") : t("dues.pickHint")}</span>
          </button>
        </div>

        {/* Cutoff */}
        <div className="card flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t("dues.cutoff")}</span>
            <input
              type="date"
              value={cutoff}
              onChange={(e) => changeCutoff(e.target.value)}
              disabled={working}
              className="h-12 rounded-2xl border border-line-strong bg-surface px-4 text-base"
            />
          </label>
          <p className="text-xs text-ink-3">{t("dues.cutoffHint")}</p>
          <p className="flex items-start gap-2 text-xs text-ink-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-closed" aria-hidden />
            {t("dues.private")}
          </p>
        </div>
      </div>

      {stage.kind === "error" && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger-bg p-4 text-sm text-danger">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {stage.message}
        </p>
      )}

      {stage.kind === "done" && <Result report={stage.report} sheet={stage.sheet} onDownload={() => downloadBlob(stage.blob, statusReportFileName(stage.report.cutoff))} onRerun={() => file && run(file, cutoff)} />}
    </div>
  );
}

function Result({ report, sheet, onDownload, onRerun }: { report: StatusReport; sheet: string; onDownload: () => void; onRerun: () => void }) {
  const { t } = useI18n();
  const orgTotals = report.breakdown.filter((l) => l.kind === "orgTotal");
  const typeTotals = report.breakdown.filter((l) => l.kind === "typeTotal");
  const debit = report.final.filter((f) => f.amount < 0).length;

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onDownload}>
          <Download className="h-5 w-5" />
          {t("dues.download")}
        </Button>
        <Button variant="outline" onClick={onRerun}>
          <RefreshCw className="h-4 w-4" />
          {t("dues.rerun")}
        </Button>
        <p className="text-xs text-ink-3">{t("dues.sheets", { sheet: sheet.trim() })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t("dues.total")} value={fmtMoney(report.grandTotal)} strong />
        <Tile label={t("dues.invoices")} value={String(report.final.length)} sub={debit ? t("dues.debits", { n: debit }) : undefined} />
        <Tile label={t("dues.rowsRead")} value={report.totalRows.toLocaleString("en-US")} />
        <Tile label={t("dues.cutoffShort")} value={formatDMY(report.cutoff)} />
      </div>

      {report.problems.length > 0 && (
        <details className="rounded-2xl bg-open-bg p-4 text-sm">
          <summary className="cursor-pointer font-semibold">{t("dues.problems", { n: report.problems.length })}</summary>
          <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-ink-2">
            {report.problems.slice(0, 200).map((p) => (
              <li key={p.row}>{t("dues.problemRow", { row: p.row, reason: t(p.reason === "badDueDate" ? "dues.badDueDate" : "dues.badAmount") })}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Summary by company › invoice type (same numbers as the Breakdown sheet) */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm" dir="ltr">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs text-ink-3">
              <th className="px-4 py-3 text-start font-semibold">Org Name › Invoice Type</th>
              <th className="px-4 py-3 text-end font-semibold">Supplier Invoices Dues</th>
            </tr>
          </thead>
          <tbody>
            {orgTotals.map((o) => (
              <OrgRows key={o.org} org={o.org} total={o.total} types={typeTotals.filter((x) => x.org === o.org)} />
            ))}
            <tr className="bg-surface-pink font-bold text-berry">
              <td className="px-4 py-3">Grand Total</td>
              <td className="px-4 py-3 text-end tabular-nums">{fmtMoney(report.grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function OrgRows({ org, total, types }: { org: string; total: number; types: Array<{ type: string; total: number }> }) {
  return (
    <>
      <tr className="border-b border-line">
        <td colSpan={2} className="px-4 pb-1 pt-3 font-bold">
          {org}
        </td>
      </tr>
      {types.map((x) => (
        <tr key={x.type} className="border-b border-line">
          <td className="px-4 py-2.5 ps-8 text-ink-2">{x.type}</td>
          <td className={`px-4 py-2.5 text-end tabular-nums ${x.total < 0 ? "text-danger" : ""}`}>{fmtMoney(x.total)}</td>
        </tr>
      ))}
      <tr className="border-b border-line bg-surface-2 font-bold">
        <td className="px-4 py-2.5">{org} Total</td>
        <td className="px-4 py-2.5 text-end tabular-nums">{fmtMoney(total)}</td>
      </tr>
    </>
  );
}

function Tile({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`card p-4 ${strong ? "!border-transparent !bg-surface-pink" : ""}`}>
      <p className={`truncate text-xl font-bold tabular-nums sm:text-2xl ${strong ? "text-berry" : ""}`} dir="ltr" style={{ textAlign: "start" }}>
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-ink-3">{label}</p>
      {sub && <p className="text-xs text-ink-3">{sub}</p>}
    </div>
  );
}
