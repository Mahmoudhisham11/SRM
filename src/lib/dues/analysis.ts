/**
 * Supplier Invoices Analysis (DMC, Curve).
 *
 * Input: the ERP export «DM AP Order To Pay» (header on row 3).
 * Output, like the hand-made Supplier_Invoices_Analysis workbook:
 *   Filtered · Advance · Applied · Fixed · Masader · Original
 *
 * Every row of the original goes to exactly one of Filtered / Applied /
 * Fixed / Masader, or to none of them, decided in this order:
 *   1. a per-invoice decision taken by hand before (exceptions)
 *   2. vendor on the "excluded" list      → none
 *   3. vendor on the "fixed" list          → Fixed   (all its rows)
 *   4. Invoice Type DEBIT                   → none
 *   5. vendor on the "masader" list        → Masader
 *   6. Applied Amount ≠ 0 and Check Status
 *      empty / blank                        → Applied
 *   7. everything else                      → Filtered
 * Advance = the Filtered rows that are PREPAYMENT with an empty Check Status.
 *
 * The vendor lists and exceptions are the analyst's own decisions; they're
 * learned from a hand-made Analysis workbook (learnAnalysisConfig) and kept in
 * the app, never in the code. Verified against the 06-11 and 14-11 workbooks.
 */
import { cellNumber, cellString, type Cell } from "./statusReport";

export type Placement = "Filtered" | "Applied" | "Fixed" | "Masader" | "none";
export const ANALYSIS_SHEETS = ["Filtered", "Advance", "Applied", "Fixed", "Masader"] as const;
export type AnalysisSheetName = (typeof ANALYSIS_SHEETS)[number];

export interface AnalysisConfig {
  version: 1;
  /** Vendor numbers whose rows all go to Fixed. */
  fixedVendors: string[];
  /** Vendor numbers left out of every sheet. */
  excludedVendors: string[];
  /** Vendor numbers that make up Masader. */
  masaderVendors: string[];
  /** Per-invoice decisions: rowKey → placement. */
  exceptions: Record<string, Placement>;
  /** Vendor number → name, for showing the lists. */
  vendorNames: Record<string, string>;
  /** Which hand-made workbook the lists came from. */
  learnedFrom?: string;
  learnedAt?: number;
}

export const EMPTY_CONFIG: AnalysisConfig = { version: 1, fixedVendors: [], excludedVendors: [], masaderVendors: [], exceptions: {}, vendorNames: {} };

/** Output columns, in order (the last one is the original's notes column, e.g. «marwa»). */
export const OUTPUT_COLUMNS = [
  "Org Name", "Project Name", "Vendor Number", "Vendor Name", "Invoice Type", "Vendor Site Code", "Invoice Num",
  "Last Approval Date", "Po Number", "Term Name", "Due Date", "Invoice Amount", "Applied Amount", "Amount Remaining",
  "Description", "Check Status", "Check Status Date", "Payment Receiving Date", "Check Doc Seq", "Check Date",
  "Check Amount", "Status Lookup Code", "User Name", "Gl Date", "Doc Sequence Value",
] as const;

export class AnalysisFormatError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing column(s): ${missing.join(", ")}`);
  }
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Where each named column is in a sheet (by header text, any order). */
export interface Columns {
  headerRow: number;
  index: Map<string, number>;
  headers: string[];
}

export function findColumns(rows: Cell[][], required: readonly string[], maxRow = 20): Columns {
  let best: Columns | null = null;
  let bestCount = -1;
  for (let r = 0; r < Math.min(rows.length, maxRow); r++) {
    const headers = (rows[r] ?? []).map((c) => cellString(c).trim());
    const index = new Map<string, number>();
    headers.forEach((h, i) => {
      const k = norm(h);
      if (k && !index.has(k)) index.set(k, i);
    });
    const count = required.filter((c) => index.has(norm(c))).length;
    if (count > bestCount) {
      best = { headerRow: r, index, headers };
      bestCount = count;
    }
    if (count === required.length) break;
  }
  const missing = required.filter((c) => !best?.index.has(norm(c)));
  if (!best || missing.length) throw new AnalysisFormatError(missing);
  return best;
}

const KEY_COLUMNS = ["Doc Sequence Value", "Invoice Num", "Invoice Amount"] as const;
const NEEDED = [...KEY_COLUMNS, "Vendor Number", "Vendor Name", "Invoice Type", "Check Status", "Applied Amount", "Due Date", "Org Name"] as const;

/** Identifies an invoice row across workbooks: Doc Sequence Value | Invoice Num | amount. */
export function rowKey(doc: Cell, invoiceNum: Cell, amount: Cell): string {
  const a = cellNumber(amount);
  const amt = Number.isFinite(a) ? (Math.round(a * 100) / 100 || 0).toFixed(2) : cellString(amount).trim();
  return `${cellString(doc).trim()}|${cellString(invoiceNum).trim()}|${amt}`;
}

export interface SourceRow {
  /** 0-based row index in the original sheet. */
  index: number;
  cells: Cell[];
  key: string;
  vendor: string;
  vendorName: string;
  type: string;
  status: Cell;
  applied: number;
  /** ISO due date or "" when missing. */
  due: string;
}

function isoDate(v: Cell): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 1 && v < 2958465) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = cellString(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

export function readSourceRows(rows: Cell[][]): { cols: Columns; rows: SourceRow[] } {
  const cols = findColumns(rows, NEEDED);
  const at = (cells: Cell[], name: string) => cells[cols.index.get(norm(name))!];
  const out: SourceRow[] = [];
  for (let r = cols.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (!cells.some((c) => cellString(c).trim() !== "")) continue;
    out.push({
      index: r,
      cells,
      key: rowKey(at(cells, "Doc Sequence Value"), at(cells, "Invoice Num"), at(cells, "Invoice Amount")),
      vendor: cellString(at(cells, "Vendor Number")).trim(),
      vendorName: cellString(at(cells, "Vendor Name")),
      type: cellString(at(cells, "Invoice Type")).trim().toUpperCase(),
      status: at(cells, "Check Status"),
      applied: cellNumber(at(cells, "Applied Amount")) || 0,
      due: isoDate(at(cells, "Due Date")),
    });
  }
  return { cols, rows: out };
}

const isBlankStatus = (v: Cell) => cellString(v).trim() === "";

/** Where a row goes (see the module comment for the order of the rules). */
export function placeRow(r: SourceRow, cfg: AnalysisConfig, sets = configSets(cfg)): Placement {
  const fixed = cfg.exceptions[r.key];
  if (fixed) return fixed;
  if (sets.excluded.has(r.vendor)) return "none";
  if (sets.fixed.has(r.vendor)) return "Fixed";
  if (r.type === "DEBIT") return "none";
  if (sets.masader.has(r.vendor)) return "Masader";
  if (r.applied !== 0 && isBlankStatus(r.status)) return "Applied";
  return "Filtered";
}

function configSets(cfg: AnalysisConfig) {
  return { fixed: new Set(cfg.fixedVendors), excluded: new Set(cfg.excludedVendors), masader: new Set(cfg.masaderVendors) };
}

/** Advance: Filtered rows that are prepayments not issued yet (Check Status empty). */
export function isAdvance(r: SourceRow): boolean {
  return r.type === "PREPAYMENT" && cellString(r.status) === "";
}

const byDue = (a: SourceRow, b: SourceRow) => (a.due === b.due ? a.index - b.index : !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1);
const byVendorThenDue = (a: SourceRow, b: SourceRow) => (a.vendorName === b.vendorName ? byDue(a, b) : a.vendorName < b.vendorName ? -1 : 1);

export interface Analysis {
  cols: Columns;
  sheets: Record<AnalysisSheetName, SourceRow[]>;
  /** Rows left out of every sheet. */
  excluded: SourceRow[];
  totalRows: number;
  /** Vendors in this file that aren't on any list (they go by the general rules). */
  newVendors: Array<{ vendor: string; name: string; rows: number }>;
}

export function buildAnalysis(rows: Cell[][], cfg: AnalysisConfig): Analysis {
  const { cols, rows: src } = readSourceRows(rows);
  const sets = configSets(cfg);
  const sheets: Analysis["sheets"] = { Filtered: [], Advance: [], Applied: [], Fixed: [], Masader: [] };
  const excluded: SourceRow[] = [];
  for (const r of src) {
    const p = placeRow(r, cfg, sets);
    if (p === "none") excluded.push(r);
    else sheets[p].push(r);
  }
  sheets.Advance = sheets.Filtered.filter(isAdvance);
  sheets.Filtered.sort(byDue);
  sheets.Advance.sort(byDue);
  sheets.Applied.sort(byDue);
  sheets.Masader.sort(byDue);
  sheets.Fixed.sort(byVendorThenDue);

  const known = new Set([...cfg.fixedVendors, ...cfg.excludedVendors, ...cfg.masaderVendors, ...Object.keys(cfg.vendorNames)]);
  const fresh = new Map<string, { vendor: string; name: string; rows: number }>();
  for (const r of src) {
    if (!r.vendor || known.has(r.vendor)) continue;
    const e = fresh.get(r.vendor) ?? { vendor: r.vendor, name: r.vendorName.trim(), rows: 0 };
    e.rows++;
    fresh.set(r.vendor, e);
  }
  return { cols, sheets, excluded, totalRows: src.length, newVendors: [...fresh.values()].sort((a, b) => b.rows - a.rows) };
}

/** Org Name as in the Analysis sheets: «Dar Al Mimar …» → DMC, «Curve …» → Curve. */
export function shortOrg(v: Cell): Cell {
  const s = cellString(v).trim();
  if (/^dar al mimar/i.test(s)) return "DMC";
  if (/^curve/i.test(s)) return "Curve";
  return v;
}

/** «supplier» → «Supplier» (the ERP sometimes exports it in lowercase). */
export function capitalizeSite(v: Cell): Cell {
  const s = cellString(v);
  return typeof v === "string" && s ? s[0].toUpperCase() + s.slice(1) : v;
}

// ---------------------------------------------------------------------------
// Learning the lists from a hand-made Analysis workbook

export interface LearnResult {
  config: AnalysisConfig;
  /** How many original rows the learned config puts exactly where the workbook has them. */
  matched: number;
  total: number;
}

/**
 * Learn the vendor lists and per-invoice exceptions from a hand-made Analysis
 * workbook. `sheets` are the workbook's sheets by name; "Original" (or the
 * sheet with the ERP header on row 3) is the source.
 */
export function learnAnalysisConfig(sheets: Record<string, Cell[][]>, fileName?: string): LearnResult {
  const originalName =
    Object.keys(sheets).find((n) => n.trim().toLowerCase() === "original") ??
    Object.keys(sheets).find((n) => {
      try {
        readSourceRows(sheets[n]);
        return !/^(filtered|advance|applied|fixed|masader)$/i.test(n.trim());
      } catch {
        return false;
      }
    });
  if (!originalName) throw new AnalysisFormatError(["Original"]);
  const { rows: src } = readSourceRows(sheets[originalName]);

  // Where the analyst put each row.
  const actual = new Map<string, Placement>();
  for (const name of ["Filtered", "Applied", "Fixed", "Masader"] as const) {
    const sheetName = Object.keys(sheets).find((n) => n.trim().toLowerCase() === name.toLowerCase());
    if (!sheetName) continue;
    const rows = sheets[sheetName];
    let cols: Columns;
    try {
      cols = findColumns(rows, KEY_COLUMNS);
    } catch {
      continue;
    }
    const at = (cells: Cell[], c: string) => cells[cols.index.get(norm(c))!];
    for (let r = cols.headerRow + 1; r < rows.length; r++) {
      const cells = rows[r] ?? [];
      if (cellString(at(cells, "Doc Sequence Value")).trim() === "") continue; // subtotal / empty rows
      actual.set(rowKey(at(cells, "Doc Sequence Value"), at(cells, "Invoice Num"), at(cells, "Invoice Amount")), name);
    }
  }
  const placeOf = (r: SourceRow): Placement => actual.get(r.key) ?? "none";

  // Vendor lists.
  const byVendor = new Map<string, { name: string; places: Placement[] }>();
  for (const r of src) {
    const e = byVendor.get(r.vendor) ?? { name: r.vendorName.trim(), places: [] };
    e.places.push(placeOf(r));
    byVendor.set(r.vendor, e);
  }
  const fixedVendors: string[] = [];
  const excludedVendors: string[] = [];
  const masaderVendors: string[] = [];
  const vendorNames: Record<string, string> = {};
  for (const [vendor, { name, places }] of byVendor) {
    if (!vendor) continue;
    vendorNames[vendor] = name;
    const count = (p: Placement) => places.filter((x) => x === p).length;
    if (count("Masader") > 0) masaderVendors.push(vendor);
    // Mostly in Fixed → a fixed-cost vendor (odd rows become exceptions).
    else if (count("Fixed") * 2 > places.length) fixedVendors.push(vendor);
    else if (count("none") === places.length) excludedVendors.push(vendor);
  }
  const config: AnalysisConfig = {
    version: 1,
    fixedVendors: fixedVendors.sort(),
    excludedVendors: excludedVendors.sort(),
    masaderVendors: masaderVendors.sort(),
    exceptions: {},
    vendorNames,
    learnedFrom: fileName,
    learnedAt: Date.now(),
  };
  // Everything the rules don't explain is a per-invoice decision.
  const sets = configSets(config);
  for (const r of src) {
    const want = placeOf(r);
    if (placeRow(r, config, sets) !== want) config.exceptions[r.key] = want;
  }
  const matched = src.filter((r) => placeRow(r, config, sets) === placeOf(r)).length;
  return { config, matched, total: src.length };
}
