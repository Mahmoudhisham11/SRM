import { addDays, daysBetween, endOfMonth, monthKey, startOfMonth, startOfWeek, todayISO } from "./dates";
import { normalizeArabic } from "./parsing/normalize";
import { vendorDisplayName, type Case, type CaseStatus, type Vendor } from "./types";

export interface CaseFilters {
  vendorId: string; // "" = all
  from: string; // ISO or ""
  to: string; // ISO or ""
  status: "" | CaseStatus;
  q: string;
}

export const EMPTY_FILTERS: CaseFilters = { vendorId: "", from: "", to: "", status: "", q: "" };

/** Date-range filters apply to the Start Date. Keyword matches all text fields + vendor. */
export function filterCases(cases: Case[], f: CaseFilters, vendors: Map<string, Vendor>): Case[] {
  const terms = normalizeArabic(f.q.trim()).split(/\s+/).filter(Boolean);
  return cases.filter((c) => {
    if (f.vendorId && c.vendorId !== f.vendorId) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.from && c.startDate < f.from) return false;
    if (f.to && c.startDate > f.to) return false;
    if (terms.length) {
      const v = vendors.get(c.vendorId);
      const hay = normalizeArabic(`${c.case} ${c.taskBar} ${c.comments} ${v?.nameAr ?? ""} ${v?.nameEn ?? ""} ${v?.code ?? ""}`);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

export type SortKey = "vendor" | "case" | "taskBar" | "startDate" | "endDate" | "status" | "days";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

export function resolutionDays(c: Pick<Case, "startDate" | "endDate">): number | null {
  return c.endDate ? daysBetween(c.startDate, c.endDate) : null;
}

export function sortCases(cases: Case[], s: Sort, vendors: Map<string, Vendor>): Case[] {
  const val = (c: Case): string | number => {
    switch (s.key) {
      case "vendor":
        return vendorDisplayName(vendors.get(c.vendorId));
      case "days":
        return resolutionDays(c) ?? -1;
      case "endDate":
        return c.endDate ?? "";
      default:
        return c[s.key];
    }
  };
  const mul = s.dir === "asc" ? 1 : -1;
  return [...cases].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar");
    return cmp * mul || b.createdAt - a.createdAt;
  });
}

export interface VendorStat {
  vendorId: string;
  total: number;
  open: number;
  closed: number;
}

export interface Summary {
  total: number;
  open: number;
  closed: number;
  /** Mean days from start to end over closed cases; null when none closed. */
  avgResolutionDays: number | null;
  perVendor: VendorStat[];
  /** Contiguous months (no gaps) from first to last case start. */
  perMonth: Array<{ key: string; count: number }>;
}

export function summarize(cases: Case[]): Summary {
  let open = 0;
  let closed = 0;
  let daysSum = 0;
  const vendors = new Map<string, VendorStat>();
  const months = new Map<string, number>();
  for (const c of cases) {
    if (c.status === "open") open++;
    else {
      closed++;
      daysSum += resolutionDays(c) ?? 0;
    }
    const v = vendors.get(c.vendorId) ?? { vendorId: c.vendorId, total: 0, open: 0, closed: 0 };
    v.total++;
    v[c.status]++;
    vendors.set(c.vendorId, v);
    const k = monthKey(c.startDate);
    months.set(k, (months.get(k) ?? 0) + 1);
  }
  const keys = [...months.keys()].sort();
  const perMonth: Summary["perMonth"] = [];
  if (keys.length) {
    let k = keys[0];
    const last = keys[keys.length - 1];
    while (k <= last) {
      perMonth.push({ key: k, count: months.get(k) ?? 0 });
      k = monthKey(addDays(endOfMonth(`${k}-01`), 1));
    }
  }
  return {
    total: cases.length,
    open,
    closed,
    avgResolutionDays: closed ? Math.round((daysSum / closed) * 10) / 10 : null,
    perVendor: [...vendors.values()].sort((a, b) => b.total - a.total),
    perMonth,
  };
}

// --- Manager report ---------------------------------------------------------

export type RangePreset = "thisWeek" | "thisMonth" | "lastMonth" | "custom";

export function presetRange(p: Exclude<RangePreset, "custom">, today = todayISO()): { from: string; to: string } {
  switch (p) {
    case "thisWeek": // Egyptian work week starts Sunday
      return { from: startOfWeek(today, 0), to: addDays(startOfWeek(today, 0), 6) };
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "lastMonth": {
      const prev = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
  }
}

export interface PeriodReport {
  from: string;
  to: string;
  /** Cases active in the period: opened in it, closed in it, or still open through it. */
  cases: Case[];
  openedInPeriod: number;
  closedInPeriod: number;
  openAtEnd: number;
  avgResolutionDays: number | null;
  byVendor: Array<{ vendorId: string; cases: Case[] }>;
}

export function buildPeriodReport(all: Case[], from: string, to: string, vendors: Map<string, Vendor>): PeriodReport {
  const cases = all.filter(
    (c) => c.startDate <= to && (c.endDate === null || c.endDate >= from),
  );
  const closedIn = cases.filter((c) => c.endDate && c.endDate >= from && c.endDate <= to);
  const days = closedIn.map((c) => resolutionDays(c) ?? 0);
  const group = new Map<string, Case[]>();
  for (const c of [...cases].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const g = group.get(c.vendorId) ?? [];
    g.push(c);
    group.set(c.vendorId, g);
  }
  return {
    from,
    to,
    cases,
    openedInPeriod: cases.filter((c) => c.startDate >= from).length,
    closedInPeriod: closedIn.length,
    openAtEnd: cases.filter((c) => c.endDate === null || c.endDate > to).length,
    avgResolutionDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    byVendor: [...group.entries()]
      .map(([vendorId, cases]) => ({ vendorId, cases }))
      .sort((a, b) => vendorDisplayName(vendors.get(a.vendorId)).localeCompare(vendorDisplayName(vendors.get(b.vendorId)), "ar")),
  };
}
