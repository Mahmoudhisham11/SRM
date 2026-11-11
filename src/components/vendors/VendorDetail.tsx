"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useCases, useVendors } from "@/hooks/useCollections";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ConfirmDialog, EmptyState, ErrorState, Icon, LoadingBlock } from "@/components/ui";
import { CaseCard, type FieldMicRenderer } from "@/components/cases/CaseCard";
import { VendorFormModal } from "./VendorFormModal";
import { normalizeArabic } from "@/lib/parsing/normalize";
import type { Case, Vendor } from "@/lib/types";

export function VendorDetail({
  id,
  logger,
  fieldMic,
  parseDate,
}: {
  id: string;
  /** Voice logging panel for this vendor (rendered above the case list). */
  logger?: (vendor: Vendor) => ReactNode;
  fieldMic?: FieldMicRenderer;
  parseDate?: (text: string) => string | null;
}) {
  const vendors = useVendors();
  const cases = useCases(id);
  const repo = useRepo();
  const { track } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Case["status"]>("all");

  const vendor = vendors.data.find((v) => v.id === id);

  const shown = useMemo(() => {
    const nq = normalizeArabic(q.trim());
    return cases.data.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (!nq || normalizeArabic(`${c.case} ${c.taskBar} ${c.comments}`).includes(nq)),
    );
  }, [cases.data, q, status]);

  if (vendors.error) return <ErrorState error={vendors.error} />;
  if (vendors.loading) return <LoadingBlock />;
  if (!vendor) {
    return (
      <EmptyState icon="alert" title="المورد غير موجود">
        <Link href="/" className="font-semibold text-teal-700 underline">
          الرجوع لقائمة الموردين
        </Link>
      </EmptyState>
    );
  }

  const openCount = cases.data.filter((c) => c.status === "open").length;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <Link href="/" className="flex w-fit items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <Icon name="back" className="h-4 w-4" />
          الموردين
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{vendor.nameAr || vendor.nameEn}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {vendor.nameAr && vendor.nameEn && <span dir="ltr">{vendor.nameEn}</span>}
              {vendor.code && (
                <span className="ltr-nums rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold">{vendor.code}</span>
              )}
            </div>
            {(vendor.contact || vendor.notes) && (
              <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                {vendor.contact && <p>📞 {vendor.contact}</p>}
                {vendor.notes && <p className="whitespace-pre-wrap">{vendor.notes}</p>}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Icon name="edit" className="h-4 w-4" />
              تعديل
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDeleting(true)} className="text-red-700">
              <Icon name="trash" className="h-4 w-4" />
              حذف
            </Button>
          </div>
        </div>
      </section>

      {logger?.(vendor)}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">
            الحالات <span className="text-sm font-normal text-slate-500">({cases.data.length} — {openCount} مفتوحة)</span>
          </h2>
          <div className="ms-auto flex flex-wrap gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث في الحالات…"
              aria-label="بحث في الحالات"
              className="h-9 w-44 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              aria-label="الحالة"
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              <option value="all">الكل</option>
              <option value="open">مفتوحة</option>
              <option value="closed">مغلقة</option>
            </select>
          </div>
        </div>
        {cases.error ? (
          <ErrorState error={cases.error} />
        ) : cases.loading ? (
          <LoadingBlock />
        ) : cases.data.length === 0 ? (
          <EmptyState icon="mic" title="لا توجد حالات لهذا المورد">
            اضغط زر الميكروفون فوق وابدأ تسجيل أول حالة.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon="search" title="لا توجد نتائج" />
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((c) => (
              <CaseCard key={c.id} c={c} compact fieldMic={fieldMic} parseDate={parseDate} />
            ))}
          </div>
        )}
      </section>

      <VendorFormModal open={editing} vendor={vendor} vendors={vendors.data} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        title="حذف المورد"
        message={
          <p>
            سيتم حذف «{vendor.nameAr || vendor.nameEn}» و<b>كل حالاته ({cases.data.length})</b> نهائياً.
          </p>
        }
        onConfirm={() => {
          track(repo.deleteVendor(vendor.id), "تم حذف المورد");
          router.push("/");
        }}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}
