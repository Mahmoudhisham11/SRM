import { addDays, todayISO } from "./dates";
import type { Case } from "./types";

/** Local calendar date of a timestamp, as ISO. */
export function localISO(ms: number): string {
  return todayISO(new Date(ms));
}

export interface NotebookStats {
  year: number;
  /** Cases whose Start Date falls in `year`. */
  total: number;
  /** Which months of `year` have at least one case. */
  months: boolean[];
  monthsFilled: number;
  /** Consecutive days (ending today, or yesterday if nothing yet today) with cases logged. */
  streak: number;
  /** Cases logged (created) today, across all years. */
  loggedToday: number;
  nextMilestone: number;
  toNextMilestone: number;
}

export function milestoneAfter(n: number, step = 50): number {
  return (Math.floor(n / step) + 1) * step;
}

/** True when going from `before` to `after` crosses a celebration point. */
export function crossedMilestone(before: number, after: number, step = 50): number | null {
  const m = Math.floor(after / step) * step;
  return m > 0 && m > before && m <= after ? m : null;
}

export function notebookStats(cases: Case[], year: number, today = todayISO()): NotebookStats {
  const months = Array<boolean>(12).fill(false);
  let total = 0;
  let loggedToday = 0;
  const days = new Set<string>();
  for (const c of cases) {
    if (Number(c.startDate.slice(0, 4)) === year) {
      total++;
      months[Number(c.startDate.slice(5, 7)) - 1] = true;
    }
    const created = localISO(c.createdAt);
    days.add(created);
    if (created === today) loggedToday++;
  }
  let streak = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  const nextMilestone = milestoneAfter(total);
  return {
    year,
    total,
    months,
    monthsFilled: months.filter(Boolean).length,
    streak,
    loggedToday,
    nextMilestone,
    toNextMilestone: nextMilestone - total,
  };
}
