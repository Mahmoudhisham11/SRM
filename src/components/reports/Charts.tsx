"use client";

import { useState } from "react";

/**
 * Single-series charts in plain HTML (one hue → no legend; the card title
 * names the series). Thin marks, 4px rounded data-ends, hairline grid, and a
 * per-mark tooltip on hover AND keyboard focus. Every value is also in the
 * summary table / cases table, so the tooltip never gates information.
 */
const MARK = "bg-teal-700";
const MARK_HOVER = "bg-teal-500";

function niceMax(v: number): number {
  if (v <= 5) return Math.max(v, 1);
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => v / s <= 5) ?? pow * 10;
  return Math.ceil(v / step) * step;
}

export function ColumnChart({
  data,
  valueLabel,
  height = 180,
}: {
  data: Array<{ key: string; label: string; value: number }>;
  valueLabel: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">لا توجد بيانات</p>;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  // Counts are whole numbers, so ticks are too (positions stay exact: t / max).
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const labelEvery = Math.ceil(data.length / 8);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <div dir="ltr" className="flex gap-2">
      {/* y axis */}
      <div className="relative w-6 shrink-0 text-[10px] text-slate-400" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / max) * 100}%`, transform: "translateY(50%)" }}>
            {t}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-slate-200" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end" onPointerLeave={() => setActive(null)}>
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}: ${d.value} ${valueLabel}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full flex-1 items-end justify-center outline-none focus-visible:bg-slate-100"
                >
                  {d.value > 0 && (
                    <div
                      className={`w-full max-w-6 rounded-t-[4px] ${active === i ? MARK_HOVER : MARK}`}
                      style={{ height: `${h}%`, marginInline: 1 }}
                    />
                  )}
                  {i === peak && d.value > 0 && active === null && (
                    <span className="absolute text-[11px] font-semibold text-slate-700" style={{ bottom: `calc(${h}% + 2px)` }}>
                      {d.value}
                    </span>
                  )}
                  {active === i && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-xs text-white shadow-lg"
                      style={{ bottom: `calc(${h}% + 6px)` }}
                    >
                      <div className="text-sm font-bold">{d.value}</div>
                      <div className="text-slate-300">{d.label}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex border-t border-slate-300">
          {data.map((d, i) => (
            <span key={d.key} className="flex-1 truncate pt-1 text-center text-[10px] text-slate-500">
              {i % labelEvery === 0 ? d.label : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ranked horizontal bars with the value at the tip (RTL: bars grow leftward). */
export function BarList({
  data,
  limit = 8,
}: {
  data: Array<{ key: string; label: string; value: number; detail?: string }>;
  limit?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  if (!data.length) return <p className="py-10 text-center text-sm text-slate-500">لا توجد بيانات</p>;
  const shown = data.slice(0, limit);
  const rest = data.slice(limit);
  const max = Math.max(...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {shown.map((d) => (
        <li
          key={d.key}
          tabIndex={0}
          aria-label={`${d.label}: ${d.value}${d.detail ? ` — ${d.detail}` : ""}`}
          onPointerEnter={() => setActive(d.key)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(d.key)}
          onBlur={() => setActive(null)}
          className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
        >
          <div className="mb-1 truncate text-xs font-medium text-slate-700">{d.label}</div>
          <div className="flex items-center gap-2">
            <div className="h-4 min-w-0 flex-1">
              <div
                className={`h-full rounded-e-[4px] ${active === d.key ? MARK_HOVER : MARK}`}
                style={{ width: `${Math.max((d.value / max) * 100, 1.5)}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-xs font-semibold tabular-nums text-slate-700">{d.value}</span>
          </div>
          {active === d.key && d.detail && (
            <div role="tooltip" className="pointer-events-none absolute end-0 top-0 z-10 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg">
              {d.detail}
            </div>
          )}
        </li>
      ))}
      {rest.length > 0 && (
        <li className="text-xs text-slate-500">
          + {rest.length} موردين آخرين ({rest.reduce((a, d) => a + d.value, 0)} حالة)
        </li>
      )}
    </ul>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
