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
  /** Whose data this is (Firebase uid, or "demo"). Keys device-side queues. */
  readonly ownerId: string;
  /** Whether original recordings can be stored (Storage set up). */
  readonly audioEnabled: boolean;

  watchVendors(onData: (vendors: Vendor[]) => void, onError: (e: Error) => void): Unsubscribe;
  /** All cases, or only one vendor's. */
  watchCases(vendorId: string | null, onData: (cases: Case[]) => void, onError: (e: Error) => void): Unsubscribe;

  createVendor(input: VendorInput): { id: string; done: Promise<void> };
  updateVendor(id: string, input: VendorInput): Promise<void>;
  /** Deletes the vendor AND all its cases (and their audio). */
  deleteVendor(id: string): Promise<void>;
  /** Bulk add/update vendors from a supplier sheet (matched by code). */
  importVendors(rows: VendorInput[], existing: Vendor[]): Promise<VendorImportResult>;

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

/** Trim and collapse whitespace («Mechanical » → «Mechanical»). */
const tidy = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

export function cleanVendorInput(v: VendorInput): VendorInput {
  return {
    nameAr: tidy(v.nameAr),
    nameEn: tidy(v.nameEn),
    code: tidy(v.code),
    material: tidy(v.material),
    contact: (v.contact ?? "").trim(),
    notes: (v.notes ?? "").trim(),
  };
}

/** A stored vendor with defaults for fields added later (old documents have no `material`). */
export function normalizeVendor(id: string, d: Partial<Omit<Vendor, "id">>): Vendor {
  return {
    id,
    nameAr: d.nameAr ?? "",
    nameEn: d.nameEn ?? "",
    code: d.code ?? "",
    material: d.material ?? "",
    contact: d.contact ?? "",
    notes: d.notes ?? "",
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
  };
}

export interface VendorImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * Plan an import from a supplier sheet, matching existing vendors by code.
 * A known code gets the sheet's name and material (contact / notes are kept);
 * a new code becomes a new vendor.
 */
export function planVendorImport(
  rows: VendorInput[],
  existing: Vendor[],
): { create: VendorInput[]; update: Array<{ id: string; input: VendorInput }>; unchanged: number } {
  const byCode = new Map(existing.filter((v) => v.code).map((v) => [v.code, v]));
  const create: VendorInput[] = [];
  const update: Array<{ id: string; input: VendorInput }> = [];
  let unchanged = 0;
  const seen = new Set<string>();
  for (const raw of rows) {
    const r = cleanVendorInput(raw);
    if (!r.code || seen.has(r.code)) continue;
    seen.add(r.code);
    const v = byCode.get(r.code);
    if (!v) {
      create.push(r);
      continue;
    }
    const input: VendorInput = { nameAr: r.nameAr || v.nameAr, nameEn: v.nameEn, code: v.code, material: r.material || v.material, contact: v.contact, notes: v.notes };
    if (input.nameAr === v.nameAr && input.material === v.material) unchanged++;
    else update.push({ id: v.id, input });
  }
  return { create, update, unchanged };
}
