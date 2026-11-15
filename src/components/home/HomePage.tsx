"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { FileSpreadsheet, Info, Moon, Plus, Search, Sparkles, Sun, Target, X } from "lucide-react";
import { TopBar } from "@/components/AppShell";
import { useData, useRepo } from "@/components/providers/DataProvider";
import { Button, CountUp, EmptyState, ErrorState, Monogram, Skeleton, Slotted } from "@/components/ui";
import { materialOptions, VendorFormSheet } from "@/components/vendors/VendorFormSheet";
import { ImportVendorsSheet } from "@/components/vendors/ImportVendorsSheet";
import { NotebookCard } from "./NotebookCard";
import { useCases, useVendors } from "@/hooks/useCollections";
import { useDefaultYear, useSessionCount } from "@/hooks/useVoicePrefs";
import { useGreetingName } from "@/hooks/useAppChrome";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { notebookStats } from "@/lib/progress";
import { normalizeArabic } from "@/lib/parsing/normalize";
import { closest } from "@/lib/fuzzy";
import { LocalRepo } from "@/lib/data/localRepo";
import { buildSampleData } from "@/lib/data/sampleData";
import type { Vendor } from "@/lib/types";

export function vendorMatches(v: Vendor, q: string): boolean {
  if (!q) return true;
  const hay = normalizeArabic(`${v.nameAr} ${v.nameEn} ${v.code} ${v.material}`);
  return normalizeArabic(q).split(/\s+/).filter(Boolean).every((part) => hay.includes(part));
}

function greetingKey(hour: number, hasName: boolean): MessageKey {
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return (hasName ? `greet.${part}` : `greet.noName.${part}`) as MessageKey;
}

/** Vendor cards rendered at a time (the supplier list has hundreds). */
const PAGE = 60;
/** Only the first cards get the entrance animation; the rest appear at once. */
const ANIMATED = 12;
const itemVariants = { hidden: { opacity: 0, y: 14 }, show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: Math.min(i, ANIMATED) * 0.04 } }) };

export function HomePage() {
  const { t, todayLine, lang, vendorName } = useI18n();
  const vendors = useVendors();
  const cases = useCases(null);
  const { demo } = useData();
  const repo = useRepo();
  const router = useRouter();
  const params = useSearchParams();
  const name = useGreetingName();
  const [year] = useDefaultYear();
  const [sessionCount] = useSessionCount();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(params.get("add") === "1");
  const [importing, setImporting] = useState(false);
  const [material, setMaterial] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (params.get("add") === "1") router.replace("/");
  }, [params, router]);

  const now = new Date();
  const stats = useMemo(() => notebookStats(cases.data, year), [cases.data, year]);
  const openCount = useMemo(() => cases.data.filter((c) => c.status === "open").length, [cases.data]);
  const counts = useMemo(() => {
    const m = new Map<string, { open: number; closed: number }>();
    for (const c of cases.data) {
      const e = m.get(c.vendorId) ?? { open: 0, closed: 0 };
      e[c.status]++;
      m.set(c.vendorId, e);
    }
    return m;
  }, [cases.data]);
  const materials = useMemo(() => materialOptions(vendors.data), [vendors.data]);
  // Vendors you've logged cases for come first (most recent activity), then A→Z.
  const lastActivity = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cases.data) m.set(c.vendorId, Math.max(m.get(c.vendorId) ?? 0, c.updatedAt));
    return m;
  }, [cases.data]);
  const filtered = useMemo(() => {
    const list = vendors.data.filter((v) => (!material || v.material === material) && vendorMatches(v, q));
    return list.sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0));
  }, [vendors.data, q, material, lastActivity]);
  const shown = filtered.slice(0, limit);
  const suggestion = useMemo(
    () => (q.trim() && filtered.length === 0 ? closest(q, vendors.data, (v) => [v.nameAr, v.nameEn, v.code]) : null),
    [q, filtered.length, vendors.data],
  );

  const gKey = greetingKey(now.getHours(), !!name);
  const GreetIcon = now.getHours() < 17 ? Sun : Moon;
  const loading = vendors.loading || cases.loading;

  return (
    <div className="flex flex-col gap-5">
      <TopBar />

      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-1">
        <p className="flex items-center gap-1.5 text-sm text-ink-3">
          <GreetIcon className="h-4 w-4 text-open" aria-hidden />
          {todayLine(now)}
        </p>
        <h1 className="font-display-en mt-1 text-3xl font-bold leading-tight sm:text-4xl" key={lang}>
          <Slotted text={t(gKey)} slot="name" value={name} />
        </h1>
      </motion.header>

      {vendors.error || cases.error ? (
        <ErrorState error={(vendors.error ?? cases.error)!} onRetry={() => location.reload()} />
      ) : (
        <>
          {vendors.data.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.7fr)]">
              <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:contents">
                <StatTile tone="pink" icon={<Sparkles className="h-4 w-4" />} value={stats.loggedToday} label={t("stat.today")} sub={t("stat.todaySub")} />
                <StatTile tone="plain" icon={<Target className="h-4 w-4" />} value={openCount} label={t("stat.open")} />
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <NotebookCard stats={stats} sessionCount={sessionCount} />
              </div>
            </div>
          )}

          <label className="relative block">
            <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-5 w-5 text-ink-3" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder={t("vendors.search")}
              aria-label={t("vendors.search")}
              className="h-13 w-full rounded-full border border-line-strong bg-surface ps-12 pe-12 text-base shadow-[var(--shadow-soft)] [&::-webkit-search-cancel-button]:hidden focus:outline-none focus:ring-4 focus:ring-berry-tint"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label={t("vendors.noResults.clear")} className="absolute inset-y-0 end-3 my-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="card flex items-center gap-3 p-5">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="mt-3 h-1.5 w-full" />
                  </div>
                  <Skeleton className="h-11 w-11 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : vendors.data.length === 0 ? (
            <EmptyState
              title={t("vendors.empty.title")}
              body={t("vendors.empty.body")}
              action={
                <>
                  <Button onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" />
                    {t("vendors.add")}
                  </Button>
                  <Button variant="outline" onClick={() => setImporting(true)}>
                    <FileSpreadsheet className="h-4 w-4" />
                    {t("import.button")}
                  </Button>
                  {demo && repo instanceof LocalRepo && (
                    <Button variant="soft" onClick={() => repo.replaceAll(buildSampleData().vendors, buildSampleData().cases)}>
                      {t("vendors.loadSample")}
                    </Button>
                  )}
                </>
              }
            />
          ) : (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="me-auto text-lg font-bold">
                  {t("vendors.title")}{" "}
                  <span className="text-ink-3">
                    · {filtered.length === vendors.data.length ? vendors.data.length : t("vendors.showing", { shown: filtered.length, total: vendors.data.length })}
                  </span>
                </h2>
                {materials.length > 0 && (
                  <select
                    value={material}
                    onChange={(e) => {
                      setMaterial(e.target.value);
                      setLimit(PAGE);
                    }}
                    aria-label={t("vendors.materialFilter")}
                    className={`h-9 max-w-44 rounded-full border px-3 text-sm font-semibold ${material ? "border-transparent bg-surface-pink text-berry" : "border-line bg-surface text-ink-2"}`}
                  >
                    <option value="">{t("vendors.allMaterials")}</option>
                    {materials.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
                <Button variant="outline" size="sm" onClick={() => setImporting(true)} aria-label={t("import.button")} title={t("import.button")}>
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("import.button")}</span>
                </Button>
                <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" />
                  {t("vendors.add")}
                </Button>
              </div>
              {filtered.length === 0 ? (
                <>
                  <EmptyState
                    title={t("vendors.noResults.title", { q })}
                    body={t("vendors.noResults.body")}
                    action={
                      <Button variant="soft" onClick={() => setQ("")}>
                        <X className="h-4 w-4" />
                        {t("vendors.noResults.clear")}
                      </Button>
                    }
                  />
                  {suggestion && (
                    <button
                      type="button"
                      onClick={() => setQ(suggestion.code || vendorName(suggestion))}
                      className="card flex items-center gap-2 px-4 py-3 text-sm font-medium"
                    >
                      <Info className="h-4 w-4 text-berry" aria-hidden />
                      {t("vendors.noResults.suggest", { name: `${vendorName(suggestion)}${suggestion.code ? ` · ${suggestion.code}` : ""}` })}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map((v, i) => (
                      <motion.li key={v.id} variants={itemVariants} custom={i} initial={i < ANIMATED ? "hidden" : false} animate="show">
                        <VendorCard v={v} counts={counts.get(v.id) ?? { open: 0, closed: 0 }} />
                      </motion.li>
                    ))}
                  </ul>
                  {filtered.length > shown.length && (
                    <Button variant="outline" className="self-center" onClick={() => setLimit((n) => n + PAGE)}>
                      {t("vendors.showMore", { n: Math.min(PAGE, filtered.length - shown.length) })}
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      <VendorFormSheet
        open={adding}
        vendors={vendors.data}
        onClose={() => setAdding(false)}
        onCreated={(id) => router.push(`/vendor?id=${encodeURIComponent(id)}`)}
      />
      <ImportVendorsSheet open={importing} vendors={vendors.data} onClose={() => setImporting(false)} />
    </div>
  );
}

function StatTile({ tone, icon, value, label, sub }: { tone: "pink" | "plain"; icon: ReactNode; value: number; label: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card flex items-start justify-between p-5 ${tone === "pink" ? "!border-transparent !bg-surface-pink" : ""}`}
    >
      <div>
        <CountUp value={value} className="text-4xl font-bold" />
        <p className="mt-1 text-sm text-ink-2">{label}</p>
        {sub && <p className="text-xs text-ink-3">{sub}</p>}
      </div>
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tone === "pink" ? "bg-surface text-berry" : "bg-open-bg text-open"}`} aria-hidden>
        {icon}
      </span>
    </motion.div>
  );
}

function VendorCard({ v, counts }: { v: Vendor; counts: { open: number; closed: number } }) {
  const { t, vendorName, vendorAltName } = useI18n();
  const total = counts.open + counts.closed;
  const name = vendorName(v);
  const alt = vendorAltName(v);
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <Link
        href={`/vendor?id=${encodeURIComponent(v.id)}`}
        className="card flex h-full flex-col gap-4 p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
      >
        <div className="flex items-center gap-3">
          <Monogram name={name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{name}</p>
            {alt && <p className="truncate text-sm text-ink-3">{alt}</p>}
            {v.material && <p className="mt-0.5 truncate text-xs font-semibold text-berry" dir="ltr" style={{ textAlign: "start" }}>{v.material}</p>}
          </div>
          {v.code && <span className="ltr-nums rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-bold text-ink-2">{v.code}</span>}
        </div>
        <div>
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            {total > 0 && (
              <>
                <motion.span className="h-full rounded-full bg-closed" initial={{ width: 0 }} animate={{ width: `${(counts.closed / total) * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
                <motion.span className="h-full rounded-full bg-open" initial={{ width: 0 }} animate={{ width: `${(counts.open / total) * 100}%` }} transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} />
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-3">{t("vendors.counts", counts)}</p>
        </div>
      </Link>
    </motion.div>
  );
}
