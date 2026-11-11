"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCases, useVendorMap, useVendors } from "@/hooks/useCollections";
import { errorMessage, useToast } from "@/components/providers/ToastProvider";
import { Button, EmptyState, ErrorState, Icon, LoadingBlock, StatusBadge } from "@/components/ui";
import { BarList, ColumnChart, StatTile } from "./Charts";
import { formatDMY, formatMonthKey, todayISO } from "@/lib/dates";
import { EMPTY_FILTERS, filterCases, resolutionDays, sortCases, summarize, type CaseFilters, type Sort, type SortKey } from "@/lib/reports";
import { downloadBlob, exportFileName } from "@/lib/export/exportRows";
import { buildCsv } from "@/lib/export/csv";
import { vendorDisplayName } from "@/lib/types";

const PAGE = 200;

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: "vendor", label: "Vendor" },
  { key: "case", label: "Case", className: "min-w-56" },
  { key: "taskBar", label: "Task Bar", className: "min-w-40" },
  { key: "startDate", label: "Start Date" },
  { key: "endDate", label: "End Date" },
  { key: "days", label: "أيام" },
  { key: "status", label: "الحالة" },
];

export function ReportsPage() {
  const vendors = useVendors();
  const cases = useCases(null);
  const vmap = useVendorMap(vendors.data);
  const { notify } = useToast();
  const [f, setF] = useState<CaseFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: "startDate", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [includeVendor, setIncludeVendor] = useState(true);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => filterCases(cases.data, f, vmap), [cases.data, f, vmap]);
  const sorted = useMemo(() => sortCases(filtered, sort, vmap), [filtered, sort, vmap]);
  const s = useMemo(() => summarize(filtered), [filtered]);
  const active = JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);

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
      notify("فشل التصدير: " + errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  }

  function exportCsv() {
    const csv = buildCsv(sorted, vmap, { includeVendor });
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), exportFileName("csv", todayISO()));
  }

  if (vendors.error || cases.error) return <ErrorState error={(vendors.error ?? cases.error)!} onRetry={() => location.reload()} />;
  if (vendors.loading || cases.loading) return <LoadingBlock />;
  if (cases.data.length === 0) {
    return (
      <EmptyState icon="chart" title="لا توجد حالات بعد">
        سجّل حالات من صفحة أي مورد وهتظهر التقارير هنا.
      </EmptyState>
    );
  }

  const input = "h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">التقارير</h1>
        <Link
          href="/reports/manager"
          className="ms-auto inline-flex h-10 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          <Icon name="print" className="h-4 w-4" />
          تقرير المدير
        </Link>
      </div>

      {/* Filters: one row above everything they affect */}
      <section aria-label="الفلاتر" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-6">
        <input
          type="search"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="كلمة بحث…"
          aria-label="بحث بالكلمة"
          className={`${input} col-span-2 sm:col-span-3 lg:col-span-2`}
        />
        <select value={f.vendorId} onChange={(e) => set("vendorId", e.target.value)} aria-label="المورد" className={`${input} col-span-2 sm:col-span-1`}>
          <option value="">كل الموردين</option>
          {vendors.data.map((v) => (
            <option key={v.id} value={v.id}>
              {vendorDisplayName(v)}
              {v.code ? ` (${v.code})` : ""}
            </option>
          ))}
        </select>
        <select value={f.status} onChange={(e) => set("status", e.target.value as CaseFilters["status"])} aria-label="الحالة" className={input}>
          <option value="">مفتوحة ومغلقة</option>
          <option value="open">مفتوحة</option>
          <option value="closed">مغلقة</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          من
          <input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} aria-label="من تاريخ (Start Date)" className={`${input} min-w-0 flex-1 px-2`} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          إلى
          <input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} aria-label="إلى تاريخ (Start Date)" className={`${input} min-w-0 flex-1 px-2`} />
        </label>
        {active && (
          <div className="col-span-2 flex items-center justify-between text-sm sm:col-span-3 lg:col-span-6">
            <span className="text-slate-600">
              {filtered.length} من {cases.data.length} حالة
            </span>
            <Button variant="ghost" size="sm" onClick={() => setF(EMPTY_FILTERS)}>
              مسح الفلاتر
            </Button>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="إجمالي الحالات" value={s.total.toLocaleString("en-US")} />
        <StatTile label="مفتوحة" value={s.open.toLocaleString("en-US")} sub={s.total ? `${Math.round((s.open / s.total) * 100)}%` : undefined} />
        <StatTile label="مغلقة" value={s.closed.toLocaleString("en-US")} sub={s.total ? `${Math.round((s.closed / s.total) * 100)}%` : undefined} />
        <StatTile label="متوسط مدة الحل" value={s.avgResolutionDays === null ? "—" : `${s.avgResolutionDays} يوم`} sub="من Start Date لـ End Date" />
      </section>

      <section className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3">
          <h2 className="mb-3 font-bold">الحالات لكل شهر <span className="text-xs font-normal text-slate-500">(حسب Start Date)</span></h2>
          <ColumnChart valueLabel="حالة" data={s.perMonth.map((m) => ({ key: m.key, label: formatMonthKey(m.key), value: m.count }))} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-bold">الحالات لكل مورد</h2>
          <BarList
            data={s.perVendor.map((v) => ({
              key: v.vendorId,
              label: vendorDisplayName(vmap.get(v.vendorId)),
              value: v.total,
              detail: `${v.open} مفتوحة · ${v.closed} مغلقة`,
            }))}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">كل الحالات ({filtered.length})</h2>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={includeVendor} onChange={(e) => setIncludeVendor(e.target.checked)} className="accent-teal-700" />
              عمود Vendor
            </label>
            <Button variant="secondary" size="sm" onClick={exportXlsx} disabled={exporting || !sorted.length}>
              <Icon name="download" className="h-4 w-4" />
              {exporting ? "جاري التصدير…" : "Excel"}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!sorted.length}>
              <Icon name="download" className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <EmptyState icon="search" title="لا توجد حالات مطابقة للفلاتر" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  {COLUMNS.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 text-start font-semibold ${c.className ?? ""}`}>
                        <button
                          type="button"
                          onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                          className={`inline-flex items-center gap-1 hover:text-slate-900 ${on ? "text-teal-800" : ""}`}
                        >
                          {c.label}
                          <span aria-hidden className="text-[10px]">{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="min-w-56 px-3 py-2 text-start font-semibold">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.slice(0, limit).map((c) => {
                  const v = vmap.get(c.vendorId);
                  const days = resolutionDays(c);
                  return (
                    <tr key={c.id} className="align-top hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link href={`/vendor?id=${encodeURIComponent(c.vendorId)}`} className="font-semibold text-teal-800 hover:underline">
                          {vendorDisplayName(v)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{c.case}</td>
                      <td className="px-3 py-2 text-slate-700">{c.taskBar}</td>
                      <td className="ltr-nums whitespace-nowrap px-3 py-2">{formatDMY(c.startDate)}</td>
                      <td className="ltr-nums whitespace-nowrap px-3 py-2">{formatDMY(c.endDate) || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{days ?? "—"}</td>
                      <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-2 text-slate-600">{c.comments}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length > limit && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  عرض المزيد ({sorted.length - limit} متبقية)
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">التصدير يشمل كل الحالات المعروضة بالفلاتر والترتيب الحاليين.</p>
      </section>

      {/* Table view of the chart data (accessible + print) */}
      <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold">جدول ملخص الموردين والشهور</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <table className="w-full">
            <thead className="text-xs text-slate-500"><tr><th className="text-start">المورد</th><th>الإجمالي</th><th>مفتوحة</th><th>مغلقة</th></tr></thead>
            <tbody>
              {s.perVendor.map((v) => (
                <tr key={v.vendorId} className="border-t border-slate-100 text-center tabular-nums">
                  <td className="py-1 text-start">{vendorDisplayName(vmap.get(v.vendorId))}</td>
                  <td>{v.total}</td><td>{v.open}</td><td>{v.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full">
            <thead className="text-xs text-slate-500"><tr><th className="text-start">الشهر</th><th>الحالات</th></tr></thead>
            <tbody>
              {s.perMonth.map((m) => (
                <tr key={m.key} className="border-t border-slate-100 text-center tabular-nums">
                  <td className="ltr-nums py-1 text-start">{formatMonthKey(m.key)}</td>
                  <td>{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
