"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Phone, Search, Trash2 } from "lucide-react";
import { DesktopHeader, TopBar } from "@/components/AppShell";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingBlock, Monogram, Segmented, Skeleton } from "@/components/ui";
import { CaseCard } from "@/components/cases/CaseCard";
import { VoiceLogger } from "@/components/voice/VoiceLogger";
import { FieldMic } from "@/components/voice/FieldMic";
import { VendorFormSheet } from "./VendorFormSheet";
import { useCases, useVendors } from "@/hooks/useCollections";
import { useDefaultYear } from "@/hooks/useVoicePrefs";
import { useI18n } from "@/lib/i18n/useI18n";
import { usePendingDeletes } from "@/lib/data/pendingDeletes";
import { parseSpokenDate } from "@/lib/parsing/arabicDates";
import { normalizeArabic } from "@/lib/parsing/normalize";
import type { CaseStatus } from "@/lib/types";

export function VendorDetail({ id, autoStart }: { id: string; autoStart: boolean }) {
  const vendors = useVendors();
  const cases = useCases(id);
  const repo = useRepo();
  const { track } = useToast();
  const { t, vendorName, vendorAltName } = useI18n();
  const router = useRouter();
  const hidden = usePendingDeletes();
  const [year] = useDefaultYear();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | CaseStatus>("all");

  const vendor = vendors.data.find((v) => v.id === id);
  const visible = useMemo(() => cases.data.filter((c) => !hidden.has(c.id)), [cases.data, hidden]);
  const counts = useMemo(
    () => ({ all: visible.length, open: visible.filter((c) => c.status === "open").length, closed: visible.filter((c) => c.status === "closed").length }),
    [visible],
  );
  const shown = useMemo(() => {
    const nq = normalizeArabic(q.trim());
    return visible.filter(
      (c) => (status === "all" || c.status === status) && (!nq || normalizeArabic(`${c.case} ${c.taskBar} ${c.comments}`).includes(nq)),
    );
  }, [visible, q, status]);
  const parseDate = useCallback((txt: string) => parseSpokenDate(txt, { defaultYear: year }), [year]);

  if (vendors.error) return <ErrorState error={vendors.error} />;
  if (vendors.loading) return <LoadingBlock />;
  if (!vendor) {
    return (
      <div className="pt-6">
        <TopBar back="/" />
        <EmptyState
          title={t("vendor.notFound")}
          action={
            <Link href="/" className="font-semibold text-berry underline">
              {t("vendor.backToList")}
            </Link>
          }
        />
      </div>
    );
  }

  const name = vendorName(vendor);
  const altName = vendorAltName(vendor);
  const phoneActions = (
    <div className="flex items-center gap-2">
      <IconButton label={t("common.edit")} onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" />
      </IconButton>
      <IconButton label={t("vendor.delete.button")} onClick={() => setDeleting(true)} className="hover:!text-danger">
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );

  return (
    <div>
      <TopBar back="/" actions={phoneActions} />
      <DesktopHeader
        back="/"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t("common.edit")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleting(true)} className="hover:!text-danger">
              <Trash2 className="h-4 w-4" />
              {t("vendor.delete.button")}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        {/* Vendor + logging */}
        <div className="flex flex-col gap-2">
          <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
            <Monogram name={name} className="h-14 w-14 text-2xl" />
            <div className="min-w-0">
              <h1 className="font-display-en truncate text-2xl font-bold sm:text-3xl">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                {vendor.code && <span className="ltr-nums rounded-lg border border-line bg-surface-2 px-2 py-0.5 text-xs font-bold text-ink-2">{vendor.code}</span>}
                {altName && <span>{altName}</span>}
                {vendor.contact && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    <span dir="auto">{vendor.contact}</span>
                  </span>
                )}
              </div>
              {vendor.notes && <p className="mt-1 text-sm text-ink-2">{vendor.notes}</p>}
            </div>
          </motion.header>
          <VoiceLogger vendor={vendor} autoStart={autoStart} />
        </div>

        {/* History */}
        <section className="flex flex-col gap-3 lg:sticky lg:top-8">
          <label className="relative block">
            <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-5 w-5 text-ink-3" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("cases.search")}
              aria-label={t("cases.search")}
              className="h-12 w-full rounded-full border border-line-strong bg-surface ps-12 pe-4 shadow-[var(--shadow-soft)] focus:outline-none focus:ring-4 focus:ring-berry-tint"
            />
          </label>
          <Segmented<"all" | CaseStatus>
            label={t("col.status")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: `${t("cases.all")} ${counts.all}` },
              { value: "open", label: `${t("status.open")} ${counts.open}` },
              { value: "closed", label: `${t("status.closed")} ${counts.closed}` },
            ]}
          />
          {cases.error ? (
            <ErrorState error={cases.error} />
          ) : cases.loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card space-y-2 p-4">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState title={t("cases.empty.title")} body={t("cases.empty.body")} />
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-3">{t("cases.noMatch")}</p>
          ) : (
            <motion.div layout className="flex flex-col gap-2.5">
              <AnimatePresence initial={false}>
                {shown.map((c) => (
                  <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                    <CaseCard c={c} compact parseDate={parseDate} fieldMic={(f, apply) => <FieldMic field={f} onText={apply} />} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      </div>

      <VendorFormSheet open={editing} vendor={vendor} vendors={vendors.data} onClose={() => setEditing(false)} onDeleteRequest={() => setDeleting(true)} />
      <ConfirmDialog
        open={deleting}
        icon={<Trash2 className="h-6 w-6" />}
        title={t("vendor.delete.title", { name })}
        body={t("vendor.delete.body", { total: counts.all, open: counts.open, closed: counts.closed })}
        confirmText={vendor.code || undefined}
        confirmPrompt={vendor.code ? t("vendor.delete.type", { code: vendor.code }) : undefined}
        confirmLabel={t("vendor.delete.confirm")}
        cancelLabel={t("vendor.delete.keep")}
        onConfirm={() => {
          track(repo.deleteVendor(vendor.id), t("vendor.deleted"));
          router.push("/");
        }}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}
