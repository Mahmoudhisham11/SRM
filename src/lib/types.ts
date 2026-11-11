export interface Vendor {
  id: string;
  nameAr: string;
  nameEn: string;
  /** SAP-style vendor code, e.g. "10532". Optional for back-filled vendors. */
  code: string;
  contact: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type VendorInput = Pick<Vendor, "nameAr" | "nameEn" | "code" | "contact" | "notes">;

export type CaseStatus = "open" | "closed";

export interface Case {
  id: string;
  vendorId: string;
  case: string;
  taskBar: string;
  /** ISO "YYYY-MM-DD". */
  startDate: string;
  /** ISO "YYYY-MM-DD"; null while the case is still open. */
  endDate: string | null;
  comments: string;
  /** Derived: "closed" whenever endDate is set. Stored for querying/filtering. */
  status: CaseStatus;
  audioUrl: string | null;
  /** What the speech engine heard, kept for auditing the parse. */
  transcript: string;
  createdAt: number;
  updatedAt: number;
}

export type CaseInput = Pick<Case, "vendorId" | "case" | "taskBar" | "startDate" | "endDate" | "comments" | "transcript">;
export type CasePatch = Partial<Pick<Case, "case" | "taskBar" | "startDate" | "endDate" | "comments" | "audioUrl" | "transcript">>;

/** Editable case fields, in dictation order (matches the Excel columns). */
export const CASE_FIELDS = ["case", "taskBar", "startDate", "endDate", "comments"] as const;
export type CaseField = (typeof CASE_FIELDS)[number];

/** English labels = SRM_Issues_Log.xlsx headers. */
export const FIELD_LABELS: Record<CaseField, string> = {
  case: "Case",
  taskBar: "Task Bar",
  startDate: "Start Date",
  endDate: "End Date",
  comments: "Comments",
};

export const DATE_FIELDS: ReadonlySet<CaseField> = new Set(["startDate", "endDate"]);

export function statusFor(endDate: string | null | undefined): CaseStatus {
  return endDate ? "closed" : "open";
}

export function vendorDisplayName(v: Pick<Vendor, "nameAr" | "nameEn"> | undefined | null): string {
  if (!v) return "—";
  return v.nameAr || v.nameEn || "—";
}
