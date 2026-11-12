"use client";

import { motion } from "motion/react";
import { Flame, NotebookPen, Sparkles, Target } from "lucide-react";
import { CountUp } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import type { NotebookStats } from "@/lib/progress";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * "دفتر 2025" — progress through digitising a year of notebooks.
 * One petal per month: filled when that month has cases; the month in
 * progress (current month of the current year) is dashed.
 */
export function NotebookCard({ stats, sessionCount, compact = false }: { stats: NotebookStats; sessionCount: number; compact?: boolean }) {
  const { t } = useI18n();
  const now = new Date();
  const currentMonth = stats.year === now.getFullYear() ? now.getMonth() : -1;

  return (
    <section
      aria-label={t("notebook.aria", { cases: stats.total, year: stats.year, months: stats.monthsFilled })}
      className="card flex items-center gap-4 bg-surface-2/60 p-5"
    >
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <NotebookPen className="h-5 w-5 text-berry" aria-hidden />
          {t("notebook.title", { year: stats.year })}
        </h2>
        <p className="mt-1 text-xs font-semibold text-ink-2">{t("notebook.months", { n: stats.monthsFilled })}</p>
        <div className="mt-1.5 flex gap-px" dir="ltr" aria-hidden>
          {MONTH_LETTERS.map((m, i) => (
            <span
              key={i}
              className={`flex h-4 w-[0.95rem] items-center justify-center rounded text-[9px] font-bold ${
                stats.months[i] ? "bg-berry-tint text-berry" : "text-ink-3"
              }`}
            >
              {m}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip icon={<Flame className="h-3.5 w-3.5" />}>{t("notebook.streak", { n: stats.streak })}</Chip>
          <Chip icon={<Sparkles className="h-3.5 w-3.5" />}>{t("notebook.session", { n: sessionCount })}</Chip>
        </div>
        {!compact && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-berry">
            <Target className="h-3.5 w-3.5" aria-hidden />
            {t("notebook.milestone", { n: stats.toNextMilestone, target: stats.nextMilestone })}
          </p>
        )}
      </div>
      <PetalRing months={stats.months} currentMonth={currentMonth} total={stats.total} label={t("notebook.cases")} />
    </section>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 shadow-[var(--shadow-soft)]">
      <span className="text-berry" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

function PetalRing({ months, currentMonth, total, label }: { months: boolean[]; currentMonth: number; total: number; label: string }) {
  return (
    <div className="relative h-28 w-28 shrink-0 sm:h-32 sm:w-32" aria-hidden>
      <svg viewBox="-60 -60 120 120" className="h-full w-full">
        {months.map((filled, i) => {
          const inProgress = !filled && i === currentMonth;
          return (
            // Rotation lives on <g>: motion's own transform (scale) would replace it otherwise.
            <g key={i} transform={`rotate(${i * 30})`}>
            <motion.ellipse
              cx={0}
              cy={-44}
              rx={6.5}
              ry={11}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 300, damping: 18 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              fill={filled ? "var(--berry)" : "var(--surface)"}
              stroke={filled ? "var(--berry)" : inProgress ? "var(--berry)" : "var(--line-strong)"}
              strokeWidth={1.5}
              strokeDasharray={inProgress ? "3 2.5" : undefined}
            />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={total} className="text-2xl font-bold leading-none" />
        <span className="text-xs text-ink-3">{label}</span>
      </div>
    </div>
  );
}
