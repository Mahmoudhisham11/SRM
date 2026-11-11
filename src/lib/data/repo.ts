import { statusFor, type Case, type CaseInput, type CasePatch, type Vendor, type VendorInput } from "../types";

export type Unsubscribe = () => void;

/**
 * Storage-agnostic data access. Writes return immediately-applied promises:
 * the UI updates from the live subscription (Firestore's local cache), so
 * callers should NOT block the UI on them — when offline they only resolve
 * once the server acknowledges.
 */
export interface DataRepo {
  readonly kind: "firestore" | "local";

  watchVendors(onData: (vendors: Vendor[]) => void, onError: (e: Error) => void): Unsubscribe;
  /** All cases, or only one vendor's. */
  watchCases(vendorId: string | null, onData: (cases: Case[]) => void, onError: (e: Error) => void): Unsubscribe;

  createVendor(input: VendorInput): { id: string; done: Promise<void> };
  updateVendor(id: string, input: VendorInput): Promise<void>;
  /** Deletes the vendor AND all its cases (and their audio). */
  deleteVendor(id: string): Promise<void>;

  newCaseId(): string;
  createCase(id: string, input: CaseInput): Promise<void>;
  updateCase(id: string, patch: CasePatch): Promise<void>;
  deleteCase(id: string): Promise<void>;

  /** Upload a case's original recording; returns a URL playable in <audio>. */
  uploadAudio(caseId: string, blob: Blob): Promise<string>;
}

export function sortVendors(list: Vendor[]): Vendor[] {
  return [...list].sort((a, b) => (a.nameAr || a.nameEn).localeCompare(b.nameAr || b.nameEn, "ar"));
}

/** Newest case first (by start date, then creation time). */
export function sortCases(list: Case[]): Case[] {
  return [...list].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt);
}

export function buildCaseDoc(id: string, input: CaseInput, now: number): Case {
  return {
    id,
    vendorId: input.vendorId,
    case: input.case.trim(),
    taskBar: input.taskBar.trim(),
    startDate: input.startDate,
    endDate: input.endDate || null,
    comments: input.comments.trim(),
    status: statusFor(input.endDate),
    audioUrl: null,
    transcript: input.transcript,
    createdAt: now,
    updatedAt: now,
  };
}

/** Apply a patch and keep the derived `status` consistent. */
export function patchWithStatus(patch: CasePatch, now: number): CasePatch & { status?: Case["status"]; updatedAt: number } {
  const out: CasePatch & { status?: Case["status"]; updatedAt: number } = { ...patch, updatedAt: now };
  if ("endDate" in patch) {
    out.endDate = patch.endDate || null;
    out.status = statusFor(patch.endDate);
  }
  return out;
}

export function cleanVendorInput(v: VendorInput): VendorInput {
  return {
    nameAr: v.nameAr.trim(),
    nameEn: v.nameEn.trim(),
    code: v.code.trim(),
    contact: v.contact.trim(),
    notes: v.notes.trim(),
  };
}
