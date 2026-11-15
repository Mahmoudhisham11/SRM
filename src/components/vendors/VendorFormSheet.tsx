"use client";

import { useId, useMemo, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, Sheet, TextAreaField, TextField } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Vendor, VendorInput } from "@/lib/types";
import { hasErrors, validateVendor, type VendorErrors } from "@/lib/validation";
import { toLatinDigits } from "@/lib/parsing/normalize";

const EMPTY: VendorInput = { nameAr: "", nameEn: "", code: "", material: "", contact: "", notes: "" };

/** Material types already in use, most common first (suggestions for the Material field). */
export function materialOptions(vendors: Vendor[]): string[] {
  const counts = new Map<string, number>();
  for (const v of vendors) if (v.material) counts.set(v.material, (counts.get(v.material) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
}

export function VendorFormSheet({
  open,
  vendor,
  vendors,
  onClose,
  onCreated,
  onDeleteRequest,
}: {
  open: boolean;
  /** Edit this vendor; omit to create. */
  vendor?: Vendor;
  /** All vendors, to keep codes unique. */
  vendors: Vendor[];
  onClose: () => void;
  onCreated?: (id: string) => void;
  /** Shows a delete action when editing. */
  onDeleteRequest?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} title={vendor ? t("vendor.edit") : t("vendor.new")} onClose={onClose}>
      {/* Remount on each open so it starts from the vendor's current values. */}
      {open && <VendorForm vendor={vendor} vendors={vendors} onDone={onClose} onCreated={onCreated} />}
      {open && vendor && onDeleteRequest && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onDeleteRequest();
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-danger hover:bg-danger-bg"
        >
          <Trash2 className="h-4 w-4" />
          {t("vendor.delete.confirm")}
        </button>
      )}
    </Sheet>
  );
}

function VendorForm({
  vendor,
  vendors,
  onDone,
  onCreated,
}: {
  vendor?: Vendor;
  vendors: Vendor[];
  onDone: () => void;
  onCreated?: (id: string) => void;
}) {
  const repo = useRepo();
  const { track } = useToast();
  const { t, vendorName } = useI18n();
  const [form, setForm] = useState<VendorInput>(() =>
    vendor
      ? { nameAr: vendor.nameAr || vendor.nameEn, nameEn: vendor.nameEn, code: vendor.code, material: vendor.material, contact: vendor.contact, notes: vendor.notes }
      : EMPTY,
  );
  const materials = useMemo(() => materialOptions(vendors), [vendors]);
  const listId = useId();
  const [showMore, setShowMore] = useState(!!(vendor?.contact || vendor?.notes));
  const [errors, setErrors] = useState<VendorErrors>({});

  const set = (k: keyof VendorInput) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k as keyof VendorErrors]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const typed = form.material.trim();
    // «steel» → «Steel»: reuse the existing spelling of a known material.
    const material = materials.find((m) => m.toLowerCase() === typed.toLowerCase()) ?? typed;
    const clean = { ...form, material, code: toLatinDigits(form.code.trim()) };
    const codes = new Map(vendors.filter((v) => v.code).map((v) => [v.code, v.id]));
    const errs = validateVendor(clean, codes, vendor?.id);
    setErrors(errs);
    if (hasErrors(errs)) return;
    if (vendor) track(repo.updateVendor(vendor.id, clean), t("vendor.saved"));
    else {
      const { id, done } = repo.createVendor(clean);
      track(done);
      onCreated?.(id);
    }
    onDone();
  }

  const owner = errors.codeOwnerId ? vendors.find((v) => v.id === errors.codeOwnerId) : undefined;
  const codeError =
    errors.code === "vendor.err.codeTaken"
      ? t("vendor.err.codeTaken", { code: toLatinDigits(form.code.trim()), name: vendorName(owner) })
      : errors.code && t(errors.code);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField label={t("vendor.code")} required value={form.code} onChange={set("code")} error={codeError || undefined} dir="ltr" inputMode="numeric" placeholder="10532" />
      <TextField label={t("vendor.nameAr")} required value={form.nameAr} onChange={set("nameAr")} error={errors.nameAr && t(errors.nameAr)} dir="auto" />
      <TextField
        label={t("vendor.material")}
        required
        value={form.material}
        onChange={set("material")}
        error={errors.material && t(errors.material)}
        list={listId}
        placeholder={t("vendor.materialPh")}
        dir="ltr"
        autoComplete="off"
      />
      <datalist id={listId}>
        {materials.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {showMore ? (
        <>
          <TextField label={t("vendor.contact")} value={form.contact} onChange={set("contact")} placeholder={t("vendor.contactPh")} />
          <TextAreaField label={t("vendor.notes")} value={form.notes} onChange={set("notes")} placeholder={t("common.optional")} />
        </>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="self-start text-sm font-semibold text-berry hover:underline">
          + {t("vendor.more")}
        </button>
      )}
      <div className="flex gap-2 pt-2">
        <Button type="submit" size="lg" className="flex-1">
          <Check className="h-5 w-5" />
          {vendor ? t("vendor.save") : t("vendor.create")}
        </Button>
        <Button variant="outline" size="lg" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
