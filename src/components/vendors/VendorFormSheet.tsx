"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, Sheet, TextAreaField, TextField } from "@/components/ui";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Vendor, VendorInput } from "@/lib/types";
import { hasErrors, validateVendor, type VendorErrors } from "@/lib/validation";
import { toLatinDigits } from "@/lib/parsing/normalize";

const EMPTY: VendorInput = { nameAr: "", nameEn: "", code: "", contact: "", notes: "" };

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
    vendor ? { nameAr: vendor.nameAr, nameEn: vendor.nameEn, code: vendor.code, contact: vendor.contact, notes: vendor.notes } : EMPTY,
  );
  const [errors, setErrors] = useState<VendorErrors>({});

  const set = (k: keyof VendorInput) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k as keyof VendorErrors]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = { ...form, code: toLatinDigits(form.code.trim()) };
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
      <TextField label={t("vendor.nameAr")} required value={form.nameAr} onChange={set("nameAr")} error={errors.nameAr && t(errors.nameAr)} dir="rtl" />
      <TextField label={t("vendor.nameEn")} value={form.nameEn} onChange={set("nameEn")} dir="ltr" />
      <TextField label={t("vendor.code")} value={form.code} onChange={set("code")} error={codeError || undefined} dir="ltr" inputMode="numeric" placeholder="10532" />
      <TextField label={t("vendor.contact")} value={form.contact} onChange={set("contact")} placeholder={t("vendor.contactPh")} />
      <TextAreaField label={t("vendor.notes")} value={form.notes} onChange={set("notes")} placeholder={t("common.optional")} />
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
