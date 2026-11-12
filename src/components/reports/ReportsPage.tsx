"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Calendar, ChevronDown, CircleCheck, Clock, Download, Printer, Search, Store, Target, X } from "lucide-react";
import { DesktopHeader, TopBar } from "@/components/AppShell";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, EmptyState, ErrorState, LoadingBlock, StatusPill } from "@/components/ui";
import { CaseCard } from "@/components/cases/CaseCard";
import { BarList, ColumnChart, StatTile } from "./Charts";
import { useCases, useVendorMap, useVendors } from "@/hooks/useCollections";
import { useI18n } from "@/lib/i18n/useI18n";
import { usePendingDeletes } from "@/lib/data/pendingDeletes";
import { formatDMY, formatMonthKey, todayISO } from "@/lib/dates";
import { EMPTY_FILTERS, filterCases, resolutionDays, sortCases, summarize, type CaseFilters, type Sort, type SortKey } from "@/lib/reports";
import { downloadBlob, exportFileName } from "@/lib/export/exportRows";
import { buildCsv } from "@/lib/export/csv";
import type { MessageKey } from "@/lib/i18n/messages";

const PAGE = 200;

export function ReportsPage() {
  const vendors = useVendors();
  const cases = useCases(null);
  const vmap = useVendorMap(vendors.data);
  const hidden = usePendingDeletes();
  const { t, vendorName } = useI18n();
  const { notify, errorText } = useToast();
  const [f, setF] = useState<CaseFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: "startDate", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [includeVendor, setIncludeVendor] = useState(true);
  const [exporting, setExporting] = useState(false);

  const all = useMemo(() => cases.data.filter((c) => !hidden.has(c.id)), [cases.data, hidden]);
  const filtered = useMemo(() => filterCases(all, f, vmap), [all, f, vmap]);
  const sorted = useMemo(() => sortCases(filtered, sort, vmap), [filtered, sort, vmap]);
  const s = useMemo(() => summarize(filtered), [filtered]);
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);
  const years = new Set(s.perMonth.map((m) => m.key.slice(0, 4)));
  const oneYear = years.size === 1 ? [...years][0] : null;

  const set = <K extends keyof CaseFilters>(k: K, v: CaseFilters[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setLimit(PAGE);
  };

  async function exportXlsx() {
    setExporting(true);
    try {
      // exceljs is large — load it only when exporting.
      const { buildXlsxBlob } = await import("@/lib/export/excel");
      downloadBlob(await buildXlsxBlob(sorted, vmap, { includeVendor }), exportFileName("xlsx", todayISO()));
    } catch (e) {
      notify(t("reports.exportFailed", { reason: errorText(e) }), "error");
    } finally {
      setExporting(false);
    }
  }

  function exportCsv() {
    downloadBlob(new Blob([buildCsv(sorted, vmap, { includeVendor })], { type: "text/csv;charset=utf-8" }), exportFileName("csv", todayISO()));
  }

  const managerLink = (
    <Link href="/reports/manager" className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-pink px-4 text-sm font-semibold text-berry hover:bg-berry-tint">
      <Printer className="h-4 w-4" aria-hidden />
      {t("nav.manager")}
    </Link>
  );

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-full sm:basis-64">
        <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-4 w-4 text-ink-3" aria-hidden />
        <input
          type="search"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder={t("reports.keyword")}
          aria-label={t("reports.keyword")}
          className="h-11 w-full rounded-full border border-line-strong bg-surface ps-10 pe-4 text-sm focus:outline-none focus:ring-4 focus:ring-berry-tint"
        />
      </label>
      <PillSelect icon={<Store className="h-4 w-4" />} active={!!f.vendorId} label={t("reports.allVendors")} value={f.vendorId} onChange={(v) => set("vendorId", v)}>
        <option value="">{t("reports.allVendors")}</option>
        {vendors.data.map((v) => (
          <option key={v.id} value={v.id}>
            {vendorName(v)}
            {v.code ? ` (${v.code})` : ""}
          </option>
        ))}
      </PillSelect>
      <PillSelect icon={<Target className="h-4 w-4" />} active={!!f.status} label={t("col.status")} value={f.status} onChange={(v) => set("status", v as CaseFilters["status"])}>
        <option value="">{t("reports.allStatus")}</option>
        <option value="open">{t("status.open")}</option>
        <option value="closed">{t("status.closed")}</option>
      </PillSelect>
      <span className={`flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm ${f.from || f.to ? "border-berry-soft bg-surface-pink text-berry" : "border-line-strong bg-surface text-ink-2"}`}>
        <Calendar className="h-4 w-4 shrink-0" aria-hidden />
        <input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} aria-label={`${t("reports.from")} (Start Date)`} className="w-[7.6rem] bg-transparent text-xs focus:outline-none" />
        <span aria-hidden>–</span>
        <input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} aria-label={`${t("reports.to")} (Start Date)`} className="w-[7.6rem] bg-transparent text-xs focus:outline-none" />
      </span>
      {active && (
        <button type="button" onClick={() => setF(EMPTY_FILTERS)} className="flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-ink-3 hover:bg-surface-2">
          <X className="h-4 w-4" aria-hidden />
          {t("reports.clearFilters")} · {t("reports.showing", { n: filtered.length, total: all.length })}
        </button>
      )}
    </div>
  );

  let body: ReactNode;
  if (vendors.error || cases.error) body = <ErrorState error={(vendors.error ?? cases.error)!} onRetry={() => location.reload()} />;
  else if (vendors.loading || cases.loading) body = <LoadingBlock />;
  else if (all.length === 0) body = <EmptyState title={t("reports.empty.title")} body={t("reports.empty.body")} />;
  else
    body = (
      <div className="flex flex-col gap-5">
        {filters}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={t("reports.total")} value={s.total} />
          <StatTile label={t("reports.open")} value={s.open} tone="open" icon={<Target className="h-4 w-4" />} />
          <StatTile label={t("reports.closed")} value={s.closed} tone="closed" icon={<CircleCheck className="h-4 w-4" />} />
          <StatTile label={t("reports.avgDays")} value={s.avgResolutionDays} decimals tone="plain" icon={<Clock className="h-4 w-4" />} />
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="card p-5 lg:col-span-3">
            <h2 className="mb-4 font-bold">
              {t("reports.perMonth")}
              {oneYear && <span className="text-ink-3"> · {oneYear}</span>}
              <span className="ms-2 text-xs font-normal text-ink-3">({t("reports.byStart")})</span>
            </h2>
            <ColumnChart
              data={s.perMonth.map((m) => ({
                key: m.key,
                label: oneYear ? formatMonthKey(m.key).split(" ")[0] : `${formatMonthKey(m.key).split(" ")[0]} ${m.key.slice(2, 4)}`,
                tip: formatMonthKey(m.key),
                value: m.count,
              }))}
            />
          </div>
          <div className="card p-5 lg:col-span-2">
            <h2 className="mb-4 font-bold">{t("reports.perVendor")}</h2>
            <BarList
              data={s.perVendor.map((v) => ({
                key: v.vendorId,
                label: vendorName(vmap.get(v.vendorId)),
                value: v.total,
                detail: t("vendors.counts", { open: v.open, closed: v.closed }),
              }))}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">
              {t("reports.allCases")} <span className="text-ink-3">· {filtered.length}</span>
            </h2>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <button type="button" role="switch" aria-checked={includeVendor} onClick={() => setIncludeVendor((v) => !v)} className="flex items-center gap-2 text-sm text-ink-2">
                {t("reports.includeVendor")}
                <span className={`relative h-6 w-11 rounded-full transition-colors ${includeVendor ? "bg-berry" : "bg-line-strong"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${includeVendor ? "end-0.5" : "start-0.5"}`} />
                </span>
              </button>
              <Button variant="soft" size="sm" onClick={exportXlsx} disabled={exporting || !sorted.length}>
                <Download className="h-4 w-4" />
                {exporting ? t("reports.exporting") : t("reports.exportExcel")}
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sorted.length}>
                <Download className="h-4 w-4" />
                CSV
              </Button>
            </div>
          </div>

          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-3">{t("cases.noMatch")}</p>
          ) : (
            <>
              {/* Phones: compact rows. Tablets/desktop: the full table. */}
              <div className="flex flex-col gap-2 md:hidden">
                {sorted.slice(0, limit).map((c) => (
                  <CaseCard key={c.id} c={c} compact vendorName={vendorName(vmap.get(c.vendorId))} />
                ))}
              </div>
              <div className="card hidden overflow-x-auto md:block">
                <CasesTable rows={sorted.slice(0, limit)} sort={sort} setSort={setSort} vendorName={(id) => vendorName(vmap.get(id))} />
              </div>
              {sorted.length > limit && (
                <Button variant="ghost" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
                  {t("reports.showMore", { n: sorted.length - limit })}
                </Button>
              )}
            </>
          )}
          <p className="text-xs text-ink-3">{t("reports.exportNote")}</p>
        </section>

        <details className="card p-5 text-sm">
          <summary className="cursor-pointer font-semibold">{t("reports.summaryTable")}</summary>
          <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
            <table className="w-full">
              <thead className="text-xs text-ink-3">
                <tr>
                  <th className="text-start font-semibold">{t("reports.vendor")}</th>
                  <th>{t("reports.total")}</th>
                  <th>{t("reports.open")}</th>
                  <th>{t("reports.closed")}</th>
                </tr>
              </thead>
              <tbody>
                {s.perVendor.map((v) => (
                  <tr key={v.vendorId} className="border-t border-line text-center tabular-nums">
                    <td className="py-1.5 text-start">{vendorName(vmap.get(v.vendorId))}</td>
                    <td>{v.total}</td>
                    <td>{v.open}</td>
                    <td>{v.closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full">
              <thead className="text-xs text-ink-3">
                <tr>
                  <th className="text-start font-semibold">{t("reports.month")}</th>
                  <th>{t("reports.total")}</th>
                </tr>
              </thead>
              <tbody>
                {s.perMonth.map((m) => (
                  <tr key={m.key} className="border-t border-line text-center tabular-nums">
                    <td className="ltr-nums py-1.5 text-start">{formatMonthKey(m.key)}</td>
                    <td>{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    );

  return (
    <div>
      <TopBar title={t("reports.title")} />
      <DesktopHeader title={t("reports.title")} actions={managerLink} />
      <div className="mb-4 flex justify-end lg:hidden">{managerLink}</div>
      {body}
    </div>
  );
}

function PillSelect({
  icon,
  label,
  value,
  active,
  onChange,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  active: boolean;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={`relative flex h-11 items-center gap-1.5 rounded-full border ps-3 pe-8 text-sm font-semibold ${active ? "border-berry-soft bg-surface-pink text-berry" : "border-line-strong bg-surface text-ink-2"}`}>
      <span aria-hidden>{icon}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="max-w-44 appearance-none truncate bg-transparent focus:outline-none">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 h-4 w-4" aria-hidden />
    </label>
  );
}

const COLUMNS: Array<{ key: SortKey; label: string | MessageKey; i18n?: boolean; className?: string }> = [
  { key: "case", label: "Case", className: "min-w-56" },
  { key: "taskBar", label: "Task Bar", className: "min-w-40" },
  { key: "startDate", label: "Start Date" },
  { key: "endDate", label: "End Date" },
  { key: "status", label: "col.status", i18n: true },
  { key: "days", label: "col.days", i18n: true },
  { key: "vendor", label: "Vendor" },
];

function CasesTable({
  rows,
  sort,
  setSort,
  vendorName,
}: {
  rows: ReturnType<typeof sortCases>;
  sort: Sort;
  setSort: (fn: (s: Sort) => Sort) => void;
  vendorName: (id: string) => string;
}) {
  const { t } = useI18n();
  return (
    <table className="w-full text-sm">
      <thead className="bg-surface-2/70 text-xs text-ink-3">
        <tr>
          {COLUMNS.map((c) => {
            const on = sort.key === c.key;
            const Arrow = on ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return (
              <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-4 py-3 text-start font-semibold ${c.className ?? ""}`}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                  className={`inline-flex items-center gap-1 hover:text-ink ${on ? "text-berry" : ""}`}
                >
                  {c.i18n ? t(c.label as MessageKey) : c.label}
                  <Arrow className="h-3.5 w-3.5" aria-hidden />
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((c) => {
          const days = resolutionDays(c);
          return (
            <tr key={c.id} className="align-top transition-colors hover:bg-surface-2/60">
              <td className="px-4 py-3 font-semibold">{c.case}</td>
              <td className="px-4 py-3 text-ink-2">{c.taskBar}</td>
              <td className="ltr-nums whitespace-nowrap px-4 py-3">{formatDMY(c.startDate)}</td>
              <td className="ltr-nums whitespace-nowrap px-4 py-3">{formatDMY(c.endDate) || "—"}</td>
              <td className="px-4 py-3">
                <StatusPill status={c.status} />
              </td>
              <td className="px-4 py-3 tabular-nums">{days ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <Link href={`/vendor?id=${encodeURIComponent(c.vendorId)}`} className="hover:text-berry hover:underline">
                  {vendorName(c.vendorId)}
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
