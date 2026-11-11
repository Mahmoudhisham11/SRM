"use client";

import { useState } from "react";
import { useRepo } from "@/components/providers/DataProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, Modal, TextArea, TextInput } from "@/components/ui";
import type { Vendor, VendorInput } from "@/lib/types";
import { hasErrors, validateVendor, type FieldErrors } from "@/lib/validation";
import { toLatinDigits } from "@/lib/parsing/normalize";

const EMPTY: VendorInput = { nameAr: "", nameEn: "", code: "", contact: "", notes: "" };

export function VendorFormModal({
  open,
  vendor,
  vendors,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Edit this vendor; omit to create. */
  vendor?: Vendor;
  /** All vendors, to keep codes unique. */
  vendors: Vendor[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  return (
    <Modal open={open} title={vendor ? "تعديل المورد" : "إضافة مورد"} onClose={onClose}>
      {/* Remount the form each time it opens so it starts from the vendor's current values. */}
      {open && <VendorForm vendor={vendor} vendors={vendors} onDone={onClose} onCreated={onCreated} />}
    </Modal>
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
  const [form, setForm] = useState<VendorInput>(() =>
    vendor
      ? { nameAr: vendor.nameAr, nameEn: vendor.nameEn, code: vendor.code, contact: vendor.contact, notes: vendor.notes }
      : EMPTY,
  );
  const [errors, setErrors] = useState<FieldErrors<keyof VendorInput>>({});

  const set = (k: keyof VendorInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = { ...form, code: toLatinDigits(form.code.trim()) };
    const codes = new Map(vendors.filter((v) => v.code).map((v) => [v.code, v.id]));
    const errs = validateVendor(clean, codes, vendor?.id);
    setErrors(errs);
    if (hasErrors(errs)) return;
    if (vendor) {
      track(repo.updateVendor(vendor.id, clean), "تم حفظ التعديلات");
    } else {
      const { id, done } = repo.createVendor(clean);
      track(done);
      onCreated?.(id);
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextInput label="اسم المورد (عربي)" value={form.nameAr} onChange={set("nameAr")} error={errors.nameAr} autoFocus />
      <TextInput label="Vendor name (English)" dir="ltr" value={form.nameEn} onChange={set("nameEn")} />
      <TextInput
        label="كود المورد (Vendor code)"
        dir="ltr"
        inputMode="numeric"
        placeholder="10532"
        value={form.code}
        onChange={set("code")}
        error={errors.code}
      />
      <TextInput label="بيانات التواصل (اختياري)" value={form.contact} onChange={set("contact")} placeholder="الاسم — الموبايل — الإيميل" />
      <TextArea label="ملاحظات (اختياري)" value={form.notes} onChange={set("notes")} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onDone}>
          إلغاء
        </Button>
        <Button type="submit">{vendor ? "حفظ" : "إضافة"}</Button>
      </div>
    </form>
  );
}
