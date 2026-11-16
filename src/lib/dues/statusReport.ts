/**
 * Supplier Invoices Status Report ("Dues").
 *
 * Input: the ERP export "DM AP Order To Pay" (one sheet; a header row with
 * "Doc Sequence Value", "Invoice Amount", "Check Status", "Applied Amount",
 * "Due Date", …; usually on row 3 under a SUBTOTAL row).
 *
 * Output (same as the hand-made Supplier_Invoices_Status_Report files):
 *   1. the original sheet, unchanged;
 *   2. "Final": the invoices still to pay —
 *        Check Status is empty, a blank " " or UNDER_SIGNATURE (not DELIVERED / IN_SAFE)
 *        AND Applied Amount = 0 (nothing applied yet)
 *        AND Due Date ≤ the cutoff date;
 *      verified row-for-row against the 06-11-2026 and 14-11-2026 reports.
 *   3. "Breakdown": Sum of Invoice Amount by Org Name › Invoice Type ›
 *      Check Status, across Due Date years › months, plus a one-column summary.
 *
 * This module is pure (no exceljs) so it can be unit-tested; see
 * statusReportXlsx.ts for reading / writing the workbook.
 */

export type Cell = unknown;

export const REQUIRED_COLUMNS = ["Invoice Amount", "Check Status", "Applied Amount", "Due Date", "Org Name", "Invoice Type"] as const;
export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export class DuesFormatError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing column(s): ${missing.join(", ")}`);
  }
}

/** Check Status values that mean "not paid yet" (empty, a single space, under signature). */
export function isOpenStatus(v: Cell): boolean {
  const s = cellString(v);
  return s.trim() === "" || s.trim().toUpperCase() === "UNDER_SIGNATURE";
}

/** How a Check Status shows in the Breakdown (Excel pivot labels). */
export function statusLabel(v: Cell): string {
  const s = cellString(v);
  if (s === "") return "(blank)";
  if (s.trim() === "") return " ";
  return s.trim();
}

/** Plain text of a cell value (exceljs rich text / formula / hyperlink aware). */
export function cellString(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("result" in o) return cellString(o.result);
    if ("text" in o) return cellString(o.text);
  }
  return String(v);
}

/** Numeric value of a cell (numbers, numeric text, formula results); empty → 0. */
export function cellNumber(v: Cell): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v) return cellNumber((v as { result: unknown }).result);
  const n = Number(String(cellString(v)).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** ISO date "YYYY-MM-DD" of a cell: Date, Excel serial, "20-Sep-2026", "2026-09-20", "20/09/2026". */
export function cellISODate(v: Cell): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (1900 system): day 25569 = 1970-01-01.
    if (v < 1 || v > 2958465) return null;
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  if (typeof v === "object" && v !== null && "result" in v) return cellISODate((v as { result: unknown }).result);
  const s = cellString(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})$/.exec(s);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toUpperCase()) + 1;
    if (!mon) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface SheetLayout {
  /** 0-based index of the header row. */
  headerRow: number;
  /** Header text per column (0-based). */
  headers: string[];
  /** Column index (0-based) of each required column. */
  col: Record<RequiredColumn, number>;
}

/** Find the header row (within the first 20 rows) and the required columns. */
export function findLayout(rows: Cell[][]): SheetLayout {
  let best: { row: number; found: Partial<Record<RequiredColumn, number>> } = { row: -1, found: {} };
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const found: Partial<Record<RequiredColumn, number>> = {};
    (rows[r] ?? []).forEach((c, i) => {
      const text = norm(cellString(c));
      for (const req of REQUIRED_COLUMNS) if (found[req] === undefined && text === norm(req)) found[req] = i;
    });
    if (Object.keys(found).length > Object.keys(best.found).length) best = { row: r, found };
    if (Object.keys(found).length === REQUIRED_COLUMNS.length) break;
  }
  const missing = REQUIRED_COLUMNS.filter((c) => best.found[c] === undefined);
  if (missing.length) throw new DuesFormatError(missing);
  const headers = (rows[best.row] ?? []).map((c) => cellString(c).trim());
  return { headerRow: best.row, headers, col: best.found as Record<RequiredColumn, number> };
}

export interface DueRow {
  /** 0-based row index in the source sheet. */
  index: number;
  cells: Cell[];
  org: string;
  type: string;
  status: string;
  amount: number;
  due: string;
}

export interface BreakdownMonth {
  year: number;
  /** 1-12 */
  month: number;
}

export interface BreakdownLine {
  kind: "status" | "typeTotal" | "orgTotal" | "grandTotal";
  org: string;
  type: string;
  status: string;
  /** Amount per "year-month" key ("2026-11"). */
  byMonth: Map<string, number>;
  total: number;
}

export interface StatusReport {
  layout: SheetLayout;
  cutoff: string;
  /** Data rows read from the sheet (non-empty). */
  totalRows: number;
  /** The Final rows, in output order. */
  final: DueRow[];
  /** Rows that couldn't be read (e.g. a Due Date that isn't a date) — reported, never silently dropped. */
  problems: Array<{ row: number; reason: "badDueDate" | "badAmount" }>;
  /** Year → months present, ascending. */
  columns: Array<{ year: number; months: number[] }>;
  breakdown: BreakdownLine[];
  grandTotal: number;
}

/** Invoice Type order in the Breakdown (as in the hand-made report); others follow alphabetically. */
const TYPE_ORDER = ["PREPAYMENT", "STANDARD", "DEBIT"];
/** Check Status order in the Breakdown. */
const STATUS_ORDER = ["UNDER_SIGNATURE", "(blank)", " "];

function orderBy(order: string[]) {
  return (a: string, b: string) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  };
}

/** Build the report from the sheet's rows (arrays of cell values, 0-based columns). */
export function buildStatusReport(rows: Cell[][], cutoff: string): StatusReport {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error(`Bad cutoff date: ${cutoff}`);
  const layout = findLayout(rows);
  const { col } = layout;
  const final: DueRow[] = [];
  const problems: StatusReport["problems"] = [];
  const orgOrder: string[] = [];
  let totalRows = 0;

  for (let r = layout.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (!cells.some((c) => cellString(c).trim() !== "")) continue;
    totalRows++;
    const org = cellString(cells[col["Org Name"]]).trim();
    if (org && !orgOrder.includes(org)) orgOrder.push(org);
    if (!isOpenStatus(cells[col["Check Status"]])) continue;
    const applied = cellNumber(cells[col["Applied Amount"]]);
    if (applied !== 0) continue;
    const due = cellISODate(cells[col["Due Date"]]);
    if (!due) {
      problems.push({ row: r + 1, reason: "badDueDate" });
      continue;
    }
    if (due > cutoff) continue;
    const amount = cellNumber(cells[col["Invoice Amount"]]);
    if (Number.isNaN(amount)) {
      problems.push({ row: r + 1, reason: "badAmount" });
      continue;
    }
    final.push({
      index: r,
      cells,
      org,
      type: cellString(cells[col["Invoice Type"]]).trim(),
      status: statusLabel(cells[col["Check Status"]]),
      amount,
      due,
    });
  }

  // Output order: by company (as they first appear in the sheet), then amount ascending.
  final.sort((a, b) => orgOrder.indexOf(a.org) - orgOrder.indexOf(b.org) || a.amount - b.amount || a.index - b.index);

  // Breakdown
  const ym = (d: string) => d.slice(0, 7);
  const months = new Map<number, Set<number>>();
  for (const f of final) {
    const y = Number(f.due.slice(0, 4));
    (months.get(y) ?? months.set(y, new Set()).get(y)!).add(Number(f.due.slice(5, 7)));
  }
  const columns = [...months].sort((a, b) => a[0] - b[0]).map(([year, set]) => ({ year, months: [...set].sort((a, b) => a - b) }));

  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const sum = (list: DueRow[]) => {
    const byMonth = new Map<string, number>();
    let total = 0;
    for (const f of list) {
      add(byMonth, ym(f.due), f.amount);
      total += f.amount;
    }
    return { byMonth, total };
  };

  const breakdown: BreakdownLine[] = [];
  const orgs = [...new Set(final.map((f) => f.org))].sort((a, b) => a.localeCompare(b));
  for (const org of orgs) {
    const inOrg = final.filter((f) => f.org === org);
    const types = [...new Set(inOrg.map((f) => f.type))].sort(orderBy(TYPE_ORDER));
    for (const type of types) {
      const inType = inOrg.filter((f) => f.type === type);
      const statuses = [...new Set(inType.map((f) => f.status))].sort(orderBy(STATUS_ORDER));
      for (const status of statuses) breakdown.push({ kind: "status", org, type, status, ...sum(inType.filter((f) => f.status === status)) });
      breakdown.push({ kind: "typeTotal", org, type, status: "", ...sum(inType) });
    }
    breakdown.push({ kind: "orgTotal", org, type: "", status: "", ...sum(inOrg) });
  }
  const grand = sum(final);
  breakdown.push({ kind: "grandTotal", org: "", type: "", status: "", ...grand });

  return { layout, cutoff, totalRows, final, problems, columns, breakdown, grandTotal: grand.total };
}

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Supplier_Invoices_Status_Report (DMC, Curve) 14-11-2026.xlsx" */
export function statusReportFileName(cutoff: string): string {
  const [y, m, d] = cutoff.split("-");
  return `Supplier_Invoices_Status_Report (DMC, Curve) ${d}-${m}-${y}.xlsx`;
}
