/**
 * Reads a supplier list (e.g. Supplier_by_Material_2026.xlsx) into vendors.
 *
 * Columns are found by their header text, in any order and on any of the first
 * rows: «Vendor Number» / «رقم المورد» / «Code», «Vendor Name» / «اسم المورد»,
 * and «Material Type» / «Material» / «الخامة». Names and materials are tidied
 * (extra spaces), numbers become plain digits. Rows missing a number, a name or
 * a material are reported, not imported; a number seen twice keeps the first row.
 */
import { normalizeArabic, toLatinDigits } from "../parsing/normalize";
import type { VendorInput } from "../types";

export type SheetCell = unknown;

export interface SheetSkip {
  /** 1-based row number in the sheet. */
  row: number;
  reason: "missingCode" | "missingName" | "missingMaterial" | "duplicate";
  code?: string;
}

export interface SheetParseResult {
  vendors: VendorInput[];
  skipped: SheetSkip[];
  /** Distinct materials, most common first. */
  materials: Array<{ material: string; count: number }>;
}

export class SheetFormatError extends Error {
  constructor(readonly missing: Array<"code" | "name" | "material">) {
    super(`Missing column(s): ${missing.join(", ")}`);
  }
}

const HEADERS: Record<"code" | "name" | "material", RegExp> = {
  code: /(vendor|supplier)?\s*(number|no\.?|num|code|#|id)\b|رقم|كود/i,
  name: /(vendor|supplier)?\s*name|الاسم|اسم/i,
  material: /material|mat\.?\s*type|خام|ماتريال|نوع/i,
};

/** Text of an exceljs cell value (plain, rich text, formula result, hyperlink, date). */
export function cellText(v: SheetCell): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return cellText(o.text);
  }
  return String(v);
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

function findHeader(rows: SheetCell[][]): { row: number; cols: Record<"code" | "name" | "material", number> } {
  let best: { row: number; cols: Partial<Record<"code" | "name" | "material", number>> } = { row: -1, cols: {} };
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cols: Partial<Record<"code" | "name" | "material", number>> = {};
    rows[r]?.forEach((cell, c) => {
      const text = normalizeArabic(tidy(cellText(cell)));
      if (!text) return;
      // Check name before code: "Vendor Name" must not be taken as the code column.
      if (cols.material === undefined && HEADERS.material.test(text)) cols.material = c;
      else if (cols.name === undefined && HEADERS.name.test(text)) cols.name = c;
      else if (cols.code === undefined && HEADERS.code.test(text)) cols.code = c;
    });
    if (Object.keys(cols).length > Object.keys(best.cols).length) best = { row: r, cols };
    if (Object.keys(cols).length === 3) break;
  }
  const missing = (["code", "name", "material"] as const).filter((k) => best.cols[k] === undefined);
  if (missing.length) throw new SheetFormatError(missing);
  return { row: best.row, cols: best.cols as Record<"code" | "name" | "material", number> };
}

/** `rows` are the sheet's rows as arrays of cell values (0-based columns). */
export function parseVendorSheet(rows: SheetCell[][]): SheetParseResult {
  const { row: headerRow, cols } = findHeader(rows);
  const vendors: VendorInput[] = [];
  const skipped: SheetSkip[] = [];
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  // Keep the first spelling of each material («Arab» and «Arab » → «Arab»; «steel» → «Steel»).
  const spelling = new Map<string, string>();

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const code = toLatinDigits(tidy(cellText(row[cols.code]))).replace(/\.0+$/, "");
    const name = tidy(cellText(row[cols.name]));
    let material = tidy(cellText(row[cols.material]));
    if (!code && !name && !material) continue; // empty / formatting-only rows
    const rowNo = r + 1;
    if (!code) {
      skipped.push({ row: rowNo, reason: "missingCode" });
      continue;
    }
    if (!name) {
      skipped.push({ row: rowNo, reason: "missingName", code });
      continue;
    }
    if (!material) {
      skipped.push({ row: rowNo, reason: "missingMaterial", code });
      continue;
    }
    if (seen.has(code)) {
      skipped.push({ row: rowNo, reason: "duplicate", code });
      continue;
    }
    seen.add(code);
    const key = material.toLowerCase();
    material = spelling.get(key) ?? (spelling.set(key, material), material);
    counts.set(material, (counts.get(material) ?? 0) + 1);
    vendors.push({ nameAr: name, nameEn: "", code, material, contact: "", notes: "" });
  }
  const materials = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([material, count]) => ({ material, count }));
  return { vendors, skipped, materials };
}

/** Browser: read the first worksheet of an .xlsx file (exceljs is loaded on demand). */
export async function readVendorSheetFile(file: Blob): Promise<SheetParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new SheetFormatError(["code", "name", "material"]);
  const rows: SheetCell[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    // exceljs row.values is 1-based; shift to 0-based columns.
    rows[n - 1] = (row.values as SheetCell[]).slice(1);
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return parseVendorSheet(rows);
}
