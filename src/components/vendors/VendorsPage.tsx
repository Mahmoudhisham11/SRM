"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCases, useVendors } from "@/hooks/useCollections";
import { useData, useRepo } from "@/components/providers/DataProvider";
import { Button, EmptyState, ErrorState, Icon, LoadingBlock } from "@/components/ui";
import { VendorFormModal } from "./VendorFormModal";
import { normalizeArabic } from "@/lib/parsing/normalize";
import { LocalRepo } from "@/lib/data/localRepo";
import { buildSampleData } from "@/lib/data/sampleData";
import type { Vendor } from "@/lib/types";

export function vendorMatches(v: Vendor, q: string): boolean {
  if (!q) return true;
  const hay = normalizeArabic(`${v.nameAr} ${v.nameEn} ${v.code}`);
  return normalizeArabic(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => hay.includes(part));
}

export function VendorsPage() {
  const vendors = useVendors();
  const cases = useCases(null);
  const { demo } = useData();
  const repo = useRepo();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, { open: number; closed: number }>();
    for (const c of cases.data) {
      const e = m.get(c.vendorId) ?? { open: 0, closed: 0 };
      e[c.status]++;
      m.set(c.vendorId, e);
    }
    return m;
  }, [cases.data]);

  const filtered = useMemo(() => vendors.data.filter((v) => vendorMatches(v, q)), [vendors.data, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الموردين</h1>
          {!vendors.loading && <p className="text-sm text-slate-500">{vendors.data.length} مورد</p>}
        </div>
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus" />
          إضافة مورد
        </Button>
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-slate-400">
          <Icon name="search" />
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو الكود…"
          aria-label="بحث عن مورد"
          className="h-12 w-full rounded-2xl border border-slate-300 bg-white ps-10 pe-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-600/40"
        />
      </div>

      {vendors.error ? (
        <ErrorState error={vendors.error} onRetry={() => location.reload()} />
      ) : vendors.loading ? (
        <LoadingBlock />
      ) : vendors.data.length === 0 ? (
        <EmptyState icon="users" title="لا يوجد موردين بعد">
          <p>ابدأ بإضافة أول مورد، وبعدها افتحه وسجّل الحالات بصوتك.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" />
              إضافة مورد
            </Button>
            {demo && repo instanceof LocalRepo && (
              <Button
                variant="secondary"
                onClick={() => {
                  const { vendors: v, cases: c } = buildSampleData();
                  repo.replaceAll(v, c);
                }}
              >
                تحميل بيانات تجريبية
              </Button>
            )}
          </div>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title="لا توجد نتائج">
          جرّب جزء من الاسم أو الكود.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const c = counts.get(v.id) ?? { open: 0, closed: 0 };
            return (
              <li key={v.id}>
                <Link
                  href={`/vendor?id=${encodeURIComponent(v.id)}`}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">{v.nameAr || v.nameEn}</p>
                      {v.nameAr && v.nameEn && (
                        <p className="truncate text-sm text-slate-500" dir="ltr" style={{ textAlign: "right" }}>
                          {v.nameEn}
                        </p>
                      )}
                    </div>
                    {v.code && (
                      <span className="ltr-nums shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700">
                        {v.code}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex gap-3 text-xs text-slate-600">
                    <span>
                      <b className="text-amber-700">{c.open}</b> مفتوحة
                    </span>
                    <span>
                      <b className="text-emerald-700">{c.closed}</b> مغلقة
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <VendorFormModal open={adding} vendors={vendors.data} onClose={() => setAdding(false)} />
    </div>
  );
}
