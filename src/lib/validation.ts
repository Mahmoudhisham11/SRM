import { isISODate } from "./dates";
import type { CaseField, VendorInput } from "./types";

export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export function validateCaseFields(c: {
  case: string;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}): FieldErrors<CaseField> {
  const errors: FieldErrors<CaseField> = {};
  if (!c.case.trim()) errors.case = "الـ Case مطلوب";
  if (!c.startDate) errors.startDate = "تاريخ البداية مطلوب";
  else if (!isISODate(c.startDate)) errors.startDate = "تاريخ غير صحيح";
  if (c.endDate) {
    if (!isISODate(c.endDate)) errors.endDate = "تاريخ غير صحيح";
    else if (c.startDate && isISODate(c.startDate) && c.endDate < c.startDate) {
      errors.endDate = "تاريخ النهاية لازم يكون بعد أو يساوي تاريخ البداية";
    }
  }
  return errors;
}

export function validateVendor(v: VendorInput, existingCodes: Map<string, string>, selfId?: string): FieldErrors<keyof VendorInput> {
  const errors: FieldErrors<keyof VendorInput> = {};
  if (!v.nameAr.trim() && !v.nameEn.trim()) errors.nameAr = "اكتب اسم المورد (عربي أو إنجليزي)";
  const code = v.code.trim();
  if (code) {
    if (!/^[A-Za-z0-9\-_/]+$/.test(code)) errors.code = "الكود: أرقام وحروف فقط";
    const owner = existingCodes.get(code);
    if (owner && owner !== selfId) errors.code = "الكود ده مستخدم لمورد تاني";
  }
  return errors;
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0;
}
