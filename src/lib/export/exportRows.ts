import { formatDMY } from "../dates";
import type { Case, Vendor } from "../types";

/** Column order = SRM_Issues_Log.xlsx. "Vendor" is the optional extra column (appended last). */
export const LOG_HEADERS = ["Case", "Task Bar", "Start Date", "End Date", "Comments"] as const;
export const VENDOR_HEADER = "Vendor";

export interface ExportOptions {
  includeVendor: boolean;
}

export function vendorLabel(v: Vendor | undefined): string {
  if (!v) return "";
  const name = v.nameAr || v.nameEn;
  return v.code ? `${name} (${v.code})` : name;
}

export function headersFor(opts: ExportOptions): string[] {
  return opts.includeVendor ? [...LOG_HEADERS, VENDOR_HEADER] : [...LOG_HEADERS];
}

/** Text rows (dates as DD-MMM-YYYY) — used by CSV. */
export function textRows(cases: Case[], vendors: Map<string, Vendor>, opts: ExportOptions): string[][] {
  return cases.map((c) => {
    const row = [c.case, c.taskBar, formatDMY(c.startDate), formatDMY(c.endDate), c.comments];
    if (opts.includeVendor) row.push(vendorLabel(vendors.get(c.vendorId)));
    return row;
  });
}

export function exportFileName(ext: "xlsx" | "csv", today: string): string {
  return `SRM_Issues_Log_${formatDMY(today)}.${ext}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
