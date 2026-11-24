"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { BookOpenCheck, CircleAlert, Download, FileSpreadsheet, ListChecks, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { DesktopHeader, TopBar } from "@/components/AppShell";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import { todayISO, formatDMY } from "@/lib/dates";
import { downloadBlob } from "@/lib/export/exportRows";
import { DuesFormatError, cellNumber, statusReportFileName } from "@/lib/dues/statusReport";
import { AnalysisFormatError, ANALYSIS_SHEETS, type Analysis, type AnalysisConfig } from "@/lib/dues/analysis";
import { useDuesConfig, type SharedProblem } from "@/hooks/useDuesConfig";

const fmtMoney = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Upload = { name: string; data: ArrayBuffer };
type Stage = { kind: "idle" } | { kind: "working" } | { kind: "done"; analysis: Analysis; blob: Blob } | { kind: "error"; message: string };

/**
 * Dues: upload the ERP export «DM AP Order To Pay» and download the finished
 * Supplier Invoices Analysis (Filtered · Advance · Applied · Fixed · Masader ·
 * Original), split exactly like the hand-made one. The Status Report (Final +
 * Breakdown) is one more button. Files are processed in the browser only.
 */
export function DuesPage() {
  const { t } = useI18n();
  const { notify, errorText } = useToast();
  const { config, source, problem, demo, save } = useDuesConfig();
  const input = useRef<HTMLInputElement>(null);
  const learnInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<Upload | null>(null);
  const [date, setDate] = useState(todayISO());
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [learning, setLearning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const readError = useCallback(
    (e: unknown) =>
      e instanceof DuesFormatError || e instanceof AnalysisFormatError
        ? t("dues.err.columns", { cols: e.missing.join("، ") })
        : t("dues.err.read", { reason: errorText(e) }),
    [t, errorText],
  );

  const run = useCallback(
    async (f: Upload, cfg: AnalysisConfig) => {
      setStage({ kind: "working" });
      await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
      try {
        const { generateAnalysis } = await import("@/lib/dues/analysisXlsx");
        const out = await generateAnalysis(f.data.slice(0), cfg); // exceljs may detach the buffer
        setStage({ kind: "done", analysis: out.analysis, blob: out.blob });
      } catch (e) {
        setStage({ kind: "error", message: readError(e) });
      }
    },
    [readError],
  );

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return notify(t("dues.err.type"), "error");
    const next = { name: f.name, data: await f.arrayBuffer() };
    setFile(next);
    if (input.current) input.current.value = "";
    if (config) void run(next, config);
    else setStage({ kind: "idle" });
  }

  async function learn(f: File | undefined) {
    if (!f) return;
    if (learnInput.current) learnInput.current.value = "";
    setLearning(true);
    try {
      const { learnFromAnalysisFile } = await import("@/lib/dues/analysisXlsx");
      const res = await learnFromAnalysisFile(await f.arrayBuffer(), f.name);
      await save(res.config);
      notify(t("dues.learned", { fixed: res.config.fixedVendors.length, excluded: res.config.excludedVendors.length, exceptions: Object.keys(res.config.exceptions).length }), "success");
      if (file) void run(file, res.config);
    } catch (e) {
      notify(readError(e), "error");
    } finally {
      setLearning(false);
    }
  }

  async function updateConfig(next: AnalysisConfig) {
    await save(next);
    if (file) void run(file, next);
  }

  async function downloadStatusReport() {
    if (!file) return;
    setReporting(true);
    try {
      const { generateStatusReport } = await import("@/lib/dues/statusReportXlsx");
      const out = await generateStatusReport(file.data.slice(0), date);
      downloadBlob(out.blob, statusReportFileName(date));
    } catch (e) {
      notify(readError(e), "error");
    } finally {
      setReporting(false);
    }
  }

  async function downloadAnalysis(blob: Blob) {
    const { analysisFileName } = await import("@/lib/dues/analysisXlsx");
    downloadBlob(blob, analysisFileName(date));
  }

  const working = stage.kind === "working";

  return (
    <div className="flex flex-col gap-5">
      <TopBar title={t("nav.dues")} />
      <DesktopHeader title={t("dues.title")} />
      <p className="max-w-2xl text-sm text-ink-2">{t("dues.intro")}</p>

      <ListsCard config={config} source={source} demo={demo} problem={problem} learning={learning} onLearn={() => learnInput.current?.click()} onChange={updateConfig} />
      <input ref={learnInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => learn(e.target.files?.[0])} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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

        <div className="card flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t("dues.reportDate")}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-12 rounded-2xl border border-line-strong bg-surface px-4 text-base" />
          </label>
          <p className="text-xs text-ink-3">{t("dues.reportDateHint")}</p>
          <p className="flex items-start gap-2 text-xs text-ink-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-closed" aria-hidden />
            {t("dues.private")}
          </p>
        </div>
      </div>

      {file && !config && stage.kind === "idle" && <Notice tone="warn">{t("dues.needLists")}</Notice>}
      {stage.kind === "error" && <Notice tone="error">{stage.message}</Notice>}

      {stage.kind === "done" && config && (
        <Result
          analysis={stage.analysis}
          config={config}
          reporting={reporting}
          onDownload={() => downloadAnalysis(stage.blob)}
          onStatusReport={downloadStatusReport}
          onChange={updateConfig}
        />
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: ReactNode }) {
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-2xl p-4 text-sm ${tone === "error" ? "bg-danger-bg text-danger" : "bg-open-bg text-ink"}`}>
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** The analyst's lists: where they came from, what's in them, and how to update them. */
function ListsCard({
  config,
  source,
  demo,
  problem,
  learning,
  onLearn,
  onChange,
}: {
  config: AnalysisConfig | null;
  source: string;
  demo: boolean;
  problem: SharedProblem;
  learning: boolean;
  onLearn: () => void;
  onChange: (c: AnalysisConfig) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (source === "loading") return null;

  if (!config) {
    return (
      <section className="card flex flex-col gap-3 border-open/40 p-5 sm:flex-row sm:items-center">
        <BookOpenCheck className="h-8 w-8 shrink-0 text-open" aria-hidden />
        <div className="flex-1">
          <p className="font-bold">{t("dues.lists.firstTitle")}</p>
          <p className="mt-1 text-sm text-ink-2">{t("dues.lists.firstBody")}</p>
        </div>
        <Button onClick={onLearn} disabled={learning}>
          {learning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
          {learning ? t("dues.lists.learning") : t("dues.lists.learn")}
        </Button>
      </section>
    );
  }

  const remove = (list: "fixedVendors" | "excludedVendors" | "masaderVendors", v: string) => onChange({ ...config, [list]: config[list].filter((x) => x !== v) });
  const name = (v: string) => config.vendorNames[v] || v;
  const exceptions = Object.keys(config.exceptions).length;

  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ListChecks className="h-6 w-6 text-berry" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("dues.lists.title")}</p>
          <p className="truncate text-xs text-ink-3">
            {config.learnedFrom ? t("dues.lists.from", { file: config.learnedFrom, date: config.learnedAt ? formatDMY(new Date(config.learnedAt).toISOString().slice(0, 10)) : "" }) : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onLearn} disabled={learning}>
          {learning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
          {learning ? t("dues.lists.learning") : t("dues.lists.update")}
        </Button>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex flex-wrap gap-2 text-start text-xs font-semibold">
        <Chip>{t("dues.lists.fixed", { n: config.fixedVendors.length })}</Chip>
        <Chip>{t("dues.lists.excluded", { n: config.excludedVendors.length })}</Chip>
        <Chip>{t("dues.lists.masader", { n: config.masaderVendors.length })}</Chip>
        <Chip>{t("dues.lists.exceptions", { n: exceptions })}</Chip>
        <span className="self-center text-berry underline">{open ? t("dues.lists.hide") : t("dues.lists.show")}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 text-sm">
          {(
            [
              ["fixedVendors", "dues.lists.fixedTitle"],
              ["excludedVendors", "dues.lists.excludedTitle"],
              ["masaderVendors", "dues.lists.masaderTitle"],
            ] as const
          ).map(([list, title]) => (
            <div key={list}>
              <p className="mb-1.5 text-xs font-bold text-ink-3">{t(title)}</p>
              <div className="flex flex-wrap gap-1.5">
                {config[list].length === 0 && <span className="text-xs text-ink-3">—</span>}
                {config[list].map((v) => (
                  <span key={v} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pe-1 ps-2.5 text-xs">
                    <span className="max-w-52 truncate">{name(v)}</span>
                    <span className="ltr-nums text-ink-3">{v}</span>
                    <button type="button" onClick={() => remove(list, v)} aria-label={t("dues.lists.remove", { name: name(v) })} className="rounded-full p-0.5 text-ink-3 hover:bg-danger-bg hover:text-danger">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {exceptions > 0 && <p className="text-xs text-ink-3">{t("dues.lists.exceptionsNote", { n: exceptions })}</p>}
        </div>
      )}
      {!demo && problem?.kind === "rules" && <p className="rounded-xl bg-open-bg px-3 py-2 text-xs text-ink">{t("dues.lists.deviceOnly")}</p>}
      {!demo && problem?.kind === "other" && <p className="rounded-xl bg-open-bg px-3 py-2 text-xs text-ink">{t("dues.lists.syncError", { code: problem.code })}</p>}
      {!demo && !problem && source === "shared" && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-closed">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {t("dues.lists.shared")}
        </p>
      )}
    </section>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface-pink px-2.5 py-1 text-berry">{children}</span>;
}

function Result({
  analysis,
  config,
  reporting,
  onDownload,
  onStatusReport,
  onChange,
}: {
  analysis: Analysis;
  config: AnalysisConfig;
  reporting: boolean;
  onDownload: () => void;
  onStatusReport: () => void;
  onChange: (c: AnalysisConfig) => void;
}) {
  const { t } = useI18n();
  const amountCol = analysis.cols.index.get("invoice amount")!;
  const totals = useMemo(
    () =>
      Object.fromEntries(
        ANALYSIS_SHEETS.map((s) => [s, analysis.sheets[s].reduce((sum, r) => sum + (cellNumber(r.cells[amountCol]) || 0), 0)]),
      ) as Record<(typeof ANALYSIS_SHEETS)[number], number>,
    [analysis, amountCol],
  );
  const add = (list: "fixedVendors" | "excludedVendors", vendor: string, vendorName: string) =>
    onChange({ ...config, [list]: [...config[list], vendor].sort(), vendorNames: { ...config.vendorNames, [vendor]: vendorName } });
  const keep = (vendor: string, vendorName: string) => onChange({ ...config, vendorNames: { ...config.vendorNames, [vendor]: vendorName } });

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onDownload}>
          <Download className="h-5 w-5" />
          {t("dues.downloadAnalysis")}
        </Button>
        <Button variant="outline" onClick={onStatusReport} disabled={reporting}>
          {reporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("dues.downloadStatus")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ANALYSIS_SHEETS.map((s) => (
          <div key={s} className={`card p-4 ${s === "Filtered" ? "!border-transparent !bg-surface-pink" : ""}`}>
            <p className="text-xs font-bold text-ink-3" dir="ltr" style={{ textAlign: "start" }}>
              {s}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${s === "Filtered" ? "text-berry" : ""}`}>{analysis.sheets[s].length.toLocaleString("en-US")}</p>
            <p className="truncate text-xs tabular-nums text-ink-3" dir="ltr" style={{ textAlign: "start" }}>
              {fmtMoney(totals[s])}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-3">{t("dues.rowsSummary", { total: analysis.totalRows.toLocaleString("en-US"), none: analysis.excluded.length.toLocaleString("en-US") })}</p>

      {analysis.newVendors.length > 0 && (
        <div className="card flex flex-col gap-2 border-open/40 p-4">
          <p className="text-sm font-bold">{t("dues.newVendors", { n: analysis.newVendors.length })}</p>
          <p className="text-xs text-ink-3">{t("dues.newVendorsBody")}</p>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {analysis.newVendors.map((v) => (
              <li key={v.vendor} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{v.name || "—"}</span>
                <span className="ltr-nums text-xs text-ink-3">
                  {v.vendor} · {t("dues.rows", { n: v.rows })}
                </span>
                <Button size="sm" variant="outline" onClick={() => add("fixedVendors", v.vendor, v.name)}>
                  Fixed
                </Button>
                <Button size="sm" variant="outline" onClick={() => add("excludedVendors", v.vendor, v.name)}>
                  {t("dues.exclude")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => keep(v.vendor, v.name)}>
                  {t("dues.keepNormal")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}
