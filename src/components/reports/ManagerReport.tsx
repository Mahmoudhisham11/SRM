"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCases, useVendorMap, useVendors } from "@/hooks/useCollections";
import { useData } from "@/components/providers/DataProvider";
import { Button, ErrorState, Icon, LoadingBlock } from "@/components/ui";
import { formatDMY, todayISO } from "@/lib/dates";
import { buildPeriodReport, presetRange, resolutionDays, type RangePreset } from "@/lib/reports";
import { vendorDisplayName } from "@/lib/types";

const PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: "thisWeek", label: "الأسبوع ده" },
  { id: "thisMonth", label: "الشهر ده" },
  { id: "lastMonth", label: "الشهر اللي فات" },
  { id: "custom", label: "فترة مخصصة" },
];

export function ManagerReport() {
  const vendors = useVendors();
  const cases = useCases(null);
  const vmap = useVendorMap(vendors.data);
  const { auth } = useData();
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [custom, setCustom] = useState(() => presetRange("thisMonth"));

  const range = preset === "custom" ? custom : presetRange(preset);
  const valid = range.from && range.to && range.from <= range.to;
  const report = useMemo(
    () => (valid ? buildPeriodReport(cases.data, range.from, range.to, vmap) : null),
    [cases.data, range.from, range.to, vmap, valid],
  );

  if (vendors.error || cases.error) return <ErrorState error={(vendors.error ?? cases.error)!} />;
  if (vendors.loading || cases.loading) return <LoadingBlock />;

  const author = auth.status === "signedIn" && auth.user.uid !== "demo" ? auth.user.name : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 print:hidden">
        <Link href="/reports" className="flex w-fit items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <Icon name="back" className="h-4 w-4" />
          التقارير
        </Link>
        <h1 className="text-2xl font-bold">تقرير المدير</h1>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="الفترة">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => setPreset(p.id)}
              className={`h-10 rounded-xl px-4 text-sm font-semibold ${
                preset === p.id ? "bg-teal-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              من
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-2" />
            </label>
            <label className="flex items-center gap-1">
              إلى
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-2" />
            </label>
            {!valid && <span className="font-semibold text-red-600">تاريخ البداية لازم يكون قبل النهاية</span>}
          </div>
        )}
        <div>
          <Button onClick={() => window.print()} disabled={!report}>
            <Icon name="print" className="h-4 w-4" />
            طباعة / حفظ PDF
          </Button>
          <p className="mt-1 text-xs text-slate-500">لحفظه PDF اختار «Save as PDF» في نافذة الطباعة.</p>
        </div>
      </div>

      {report && (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="border-b-2 border-slate-800 pb-3">
            <h2 className="text-xl font-bold" dir="ltr" style={{ textAlign: "right" }}>
              SRM Issues Report
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              الفترة: <b className="ltr-nums">{formatDMY(report.from)}</b> إلى <b className="ltr-nums">{formatDMY(report.to)}</b>
              <span className="mx-2 text-slate-300">|</span>
              تاريخ الإصدار: <span className="ltr-nums">{formatDMY(todayISO())}</span>
              {author && (
                <>
                  <span className="mx-2 text-slate-300">|</span>
                  {author}
                </>
              )}
            </p>
          </header>

          <dl className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-5 print:grid-cols-5">
            {[
              ["حالات خلال الفترة", report.cases.length],
              ["اتفتحت", report.openedInPeriod],
              ["اتقفلت", report.closedInPeriod],
              ["مفتوحة في آخر الفترة", report.openAtEnd],
              ["متوسط مدة الحل", report.avgResolutionDays === null ? "—" : `${report.avgResolutionDays} يوم`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 p-3 print:break-inside-avoid">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {report.byVendor.length === 0 ? (
            <p className="py-8 text-center text-slate-500">لا توجد حالات في هذه الفترة.</p>
          ) : (
            report.byVendor.map(({ vendorId, cases: vc }) => {
              const v = vmap.get(vendorId);
              const open = vc.filter((c) => c.status === "open").length;
              return (
                <section key={vendorId} className="mt-5 print:break-inside-avoid-page">
                  <h3 className="mb-2 flex flex-wrap items-baseline gap-2 font-bold">
                    {vendorDisplayName(v)}
                    {v?.code && <span className="ltr-nums text-sm font-normal text-slate-500">{v.code}</span>}
                    <span className="text-sm font-normal text-slate-600">
                      — {vc.length} حالة ({open} مفتوحة)
                    </span>
                  </h3>
                  <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full border-collapse text-sm print:text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-xs print:bg-slate-100">
                          {["Case", "Task Bar", "Start Date", "End Date", "أيام", "Comments"].map((h) => (
                            <th key={h} className="border border-slate-300 px-2 py-1 text-start font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vc.map((c) => (
                          <tr key={c.id} className="align-top print:break-inside-avoid">
                            <td className="min-w-40 border border-slate-300 px-2 py-1">{c.case}</td>
                            <td className="border border-slate-300 px-2 py-1">{c.taskBar}</td>
                            <td className="ltr-nums whitespace-nowrap border border-slate-300 px-2 py-1">{formatDMY(c.startDate)}</td>
                            <td className="ltr-nums whitespace-nowrap border border-slate-300 px-2 py-1">
                              {c.endDate ? formatDMY(c.endDate) : <b className="text-amber-700">مفتوحة</b>}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{resolutionDays(c) ?? "—"}</td>
                            <td className="min-w-40 border border-slate-300 px-2 py-1 text-slate-700">{c.comments}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          )}
        </article>
      )}
    </div>
  );
}
