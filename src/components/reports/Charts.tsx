"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { CountUp } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";

/**
 * Single-series charts in plain HTML (one hue → no legend; the card title
 * names the series). The peak bar is emphasised in berry, the rest are soft
 * pink; hovering/focusing a bar emphasises it instead and shows a tooltip.
 * Every value is also in the numbers table, so the tooltip never gates data.
 */

function niceMax(v: number): number {
  if (v <= 5) return Math.max(v, 1);
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => v / s <= 5) ?? pow * 10;
  return Math.ceil(v / step) * step;
}

export function ColumnChart({
  data,
  height = 200,
}: {
  data: Array<{ key: string; label: string; tip: string; value: number }>;
  height?: number;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-3">{t("reports.noData")}</p>;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  // Counts are whole numbers, so ticks are too (positions stay exact: t / max).
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const labelEvery = data.length > 8 ? Math.ceil(data.length / 7) : 1;
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const emphasised = active ?? peak;

  return (
    // Top padding leaves room for the tooltip above the tallest bar.
    <div dir="ltr" className="flex gap-2 pt-12">
      <div className="relative w-7 shrink-0 text-xs text-ink-3" style={{ height }}>
        {ticks.map((tk) => (
          <span key={tk} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(tk / max) * 100}%` }}>
            {tk}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((tk) => (
            <div key={tk} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(tk / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-1.5" onPointerLeave={() => setActive(null)}>
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              const on = i === emphasised;
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.tip}: ${d.value}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:bg-surface-2"
                >
                  {d.value > 0 && (
                    <motion.div
                      className={`w-full max-w-9 rounded-t-md transition-colors ${on ? "bg-berry" : "bg-berry-soft"}`}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.7, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  {on && (active !== null || d.value > 0) && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl bg-tooltip px-2.5 py-1.5 text-center text-xs text-on-tooltip shadow-lg"
                      style={{ bottom: `calc(${h}% + 8px)` }}
                    >
                      <div className="font-bold">{d.tip}</div>
                      <div className="opacity-80">
                        {d.value} {t("notebook.cases")}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 flex gap-1.5 border-t border-line-strong">
          {data.map((d, i) => (
            <span key={d.key} className="relative h-5 flex-1 text-xs text-ink-3">
              {i % labelEvery === 0 && <span className="absolute start-1/2 top-1.5 -translate-x-1/2 whitespace-nowrap">{d.label}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ranked horizontal bars, value at the tip. The top bar is berry, the rest soft. */
export function BarList({
  data,
  limit = 8,
}: {
  data: Array<{ key: string; label: string; value: number; detail?: string }>;
  limit?: number;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string | null>(null);
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-3">{t("reports.noData")}</p>;
  const shown = data.slice(0, limit);
  const rest = data.slice(limit);
  const max = Math.max(...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-3.5">
      {shown.map((d, i) => (
        <li
          key={d.key}
          tabIndex={0}
          aria-label={`${d.label}: ${d.value}${d.detail ? ` — ${d.detail}` : ""}`}
          onPointerEnter={() => setActive(d.key)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(d.key)}
          onBlur={() => setActive(null)}
          className="relative grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-berry-soft"
        >
          <span className="truncate text-sm text-ink-2">{d.label}</span>
          <span className="h-3">
            <motion.span
              className={`block h-full rounded-e-md transition-colors ${i === 0 || active === d.key ? "bg-berry" : "bg-berry-soft"}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span className="text-end text-sm font-bold tabular-nums">{d.value}</span>
          {active === d.key && d.detail && (
            <span role="tooltip" className="pointer-events-none absolute -top-8 end-0 z-10 rounded-xl bg-tooltip px-2.5 py-1 text-xs text-on-tooltip shadow-lg">
              {d.detail}
            </span>
          )}
        </li>
      ))}
      {rest.length > 0 && <li className="text-xs text-ink-3">{t("reports.otherVendors", { n: rest.length, cases: rest.reduce((a, d) => a + d.value, 0) })}</li>}
    </ul>
  );
}

export function StatTile({ label, value, decimals, icon, tone }: { label: string; value: number | null; decimals?: boolean; icon?: ReactNode; tone?: "open" | "closed" | "plain" }) {
  const toneCls = tone === "open" ? "bg-open-bg text-open" : tone === "closed" ? "bg-closed-bg text-closed" : "bg-surface-2 text-ink-3";
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card flex items-start justify-between p-5">
      <div>
        <p className="text-3xl font-bold tabular-nums sm:text-4xl">
          {value === null ? "—" : decimals ? value.toLocaleString("en-US", { maximumFractionDigits: 1 }) : <CountUp value={value} />}
        </p>
        <p className="mt-1 text-sm text-ink-2">{label}</p>
      </div>
      {icon && (
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${toneCls}`} aria-hidden>
          {icon}
        </span>
      )}
    </motion.div>
  );
}
