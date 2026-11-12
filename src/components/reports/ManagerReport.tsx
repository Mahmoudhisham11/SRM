"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { DesktopHeader, TopBar } from "@/components/AppShell";
import { useData } from "@/components/providers/DataProvider";
import { Button, ErrorState, LoadingBlock, Segmented } from "@/components/ui";
import { useCases, useVendorMap, useVendors } from "@/hooks/useCollections";
import { useGreetingName } from "@/hooks/useAppChrome";
import { useI18n } from "@/lib/i18n/useI18n";
import { usePendingDeletes } from "@/lib/data/pendingDeletes";
import { formatDMY, todayISO } from "@/lib/dates";
import { buildPeriodReport, presetRange, resolutionDays, type RangePreset } from "@/lib/reports";

/**
 * Manager report. The controls use the app's styling; the report itself is
 * deliberately neutral and formal (fixed grays, no theme colours) — it is what
 * gets printed / saved as PDF for the manager.
 */
export function ManagerReport() {
  const vendors = useVendors();
  const cases = useCases(null);
  const vmap = useVendorMap(vendors.data);
  const hidden = usePendingDeletes();
  const { demo } = useData();
  const name = useGreetingName();
  const { t, dir, vendorName } = useI18n();
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [custom, setCustom] = useState(() => presetRange("thisMonth"));

  const range = preset === "custom" ? custom : presetRange(preset);
  const valid = !!range.from && !!range.to && range.from <= range.to;
  const all = useMemo(() => cases.data.filter((c) => !hidden.has(c.id)), [cases.data, hidden]);
  const report = useMemo(() => (valid ? buildPeriodReport(all, range.from, range.to, vmap) : null), [all, range.from, range.to, vmap, valid]);

  if (vendors.error || cases.error) return <ErrorState error={(vendors.error ?? cases.error)!} />;
  if (vendors.loading || cases.loading) return <LoadingBlock />;

  const cell = "border border-neutral-300 px-2 py-1.5 align-top";
  return (
    <div>
      <TopBar back="/reports" title={t("manager.title")} />
      <DesktopHeader title={t("manager.title")} />

      <div className="mb-6 flex flex-col gap-3 print:hidden">
        <Segmented<RangePreset>
          label={t("manager.title")}
          value={preset}
          onChange={setPreset}
          className="w-full max-w-xl"
          options={[
            { value: "thisWeek", label: t("manager.thisWeek") },
            { value: "thisMonth", label: t("manager.thisMonth") },
            { value: "lastMonth", label: t("manager.lastMonth") },
            { value: "custom", label: t("manager.custom") },
          ]}
        />
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              {t("reports.from")}
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-11 rounded-full border border-line-strong bg-surface px-3" />
            </label>
            <label className="flex items-center gap-2">
              {t("reports.to")}
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-11 rounded-full border border-line-strong bg-surface px-3" />
            </label>
            {!valid && <span className="font-semibold text-danger">{t("manager.badRange")}</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => window.print()} disabled={!report}>
            <Printer className="h-4 w-4" />
            {t("manager.print")}
          </Button>
          <p className="text-xs text-ink-3">{t("manager.printHint")}</p>
        </div>
      </div>

      {report && (
        <article dir={dir} className="mx-auto max-w-4xl rounded-2xl bg-white p-6 text-neutral-900 shadow-[var(--shadow-soft)] ring-1 ring-neutral-200 sm:p-8 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
          <header className="border-b-2 border-neutral-900 pb-3">
            <h2 className="text-xl font-bold" dir="ltr" style={{ textAlign: "start" }}>
              SRM Issues Report
            </h2>
            <p className="mt-1 text-sm text-neutral-700">
              {t("manager.period")}: <b className="ltr-nums">{formatDMY(report.from)}</b> {t("manager.to")} <b className="ltr-nums">{formatDMY(report.to)}</b>
              <span className="mx-2 text-neutral-300">|</span>
              {t("manager.issued")}: <span className="ltr-nums">{formatDMY(todayISO())}</span>
              {name && !demo && (
                <>
                  <span className="mx-2 text-neutral-300">|</span>
                  {name}
                </>
              )}
            </p>
          </header>

          <dl className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-5 print:grid-cols-5">
            {(
              [
                [t("manager.active"), report.cases.length],
                [t("manager.opened"), report.openedInPeriod],
                [t("manager.closed"), report.closedInPeriod],
                [t("manager.openAtEnd"), report.openAtEnd],
                [t("manager.avg"), report.avgResolutionDays === null ? "—" : t("days", { n: report.avgResolutionDays })],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-neutral-300 p-3 print:break-inside-avoid">
                <dt className="text-xs text-neutral-600">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {report.byVendor.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">{t("manager.none")}</p>
          ) : (
            report.byVendor.map(({ vendorId, cases: vc }) => {
              const v = vmap.get(vendorId);
              const open = vc.filter((c) => c.status === "open").length;
              return (
                <section key={vendorId} className="mt-6 print:break-inside-avoid-page">
                  <h3 className="mb-2 flex flex-wrap items-baseline gap-2 font-bold">
                    {vendorName(v)}
                    {v?.code && <span className="ltr-nums text-sm font-normal text-neutral-500">{v.code}</span>}
                    <span className="text-sm font-normal text-neutral-600">— {t("manager.vendorLine", { n: vc.length, open })}</span>
                  </h3>
                  <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full border-collapse text-sm print:text-[11px]">
                      <thead>
                        <tr className="bg-neutral-100 text-xs">
                          {["Case", "Task Bar", "Start Date", "End Date", t("col.days"), "Comments"].map((h) => (
                            <th key={h} className={`${cell} text-start font-semibold`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vc.map((c) => (
                          <tr key={c.id} className="print:break-inside-avoid">
                            <td className={`${cell} min-w-40`}>{c.case}</td>
                            <td className={cell}>{c.taskBar}</td>
                            <td className={`${cell} ltr-nums whitespace-nowrap`}>{formatDMY(c.startDate)}</td>
                            <td className={`${cell} ltr-nums whitespace-nowrap`}>{c.endDate ? formatDMY(c.endDate) : <b>{t("status.open")}</b>}</td>
                            <td className={`${cell} text-center tabular-nums`}>{resolutionDays(c) ?? "—"}</td>
                            <td className={`${cell} min-w-40 text-neutral-700`}>{c.comments}</td>
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
