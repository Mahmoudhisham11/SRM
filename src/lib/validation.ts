import { isISODate } from "./dates";
import type { MessageKey } from "./i18n/messages";
import type { CaseField, VendorInput } from "./types";

/** Field → message key (translated by the UI). */
export type FieldErrors<F extends string> = Partial<Record<F, MessageKey>>;

export function validateCaseFields(c: {
  case: string;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}): FieldErrors<CaseField> {
  const errors: FieldErrors<CaseField> = {};
  if (!c.case.trim()) errors.case = "err.caseRequired";
  if (!c.startDate) errors.startDate = "err.startRequired";
  else if (!isISODate(c.startDate)) errors.startDate = "err.invalidDate";
  if (c.endDate) {
    if (!isISODate(c.endDate)) errors.endDate = "err.invalidDate";
    else if (c.startDate && isISODate(c.startDate) && c.endDate < c.startDate) errors.endDate = "err.endBeforeStart";
  }
  return errors;
}

export interface VendorErrors {
  nameAr?: MessageKey;
  code?: MessageKey;
  material?: MessageKey;
  /** For "code taken": the vendor that already has it. */
  codeOwnerId?: string;
}

export function validateVendor(v: VendorInput, existingCodes: Map<string, string>, selfId?: string): VendorErrors {
  const errors: VendorErrors = {};
  if (!v.nameAr.trim() && !v.nameEn.trim()) errors.nameAr = "vendor.err.name";
  if (!v.material.trim()) errors.material = "vendor.err.material";
  const code = v.code.trim();
  if (!code) errors.code = "vendor.err.codeRequired";
  else {
    if (!/^[A-Za-z0-9\-_/]+$/.test(code)) errors.code = "vendor.err.codeFormat";
    const owner = existingCodes.get(code);
    if (owner && owner !== selfId) {
      errors.code = "vendor.err.codeTaken";
      errors.codeOwnerId = owner;
    }
  }
  return errors;
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0;
}
