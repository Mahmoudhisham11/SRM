/**
 * Reads the ERP export and writes the Status Report workbook with exceljs.
 * The uploaded sheet is kept exactly as it was (same workbook, other sheets
 * removed); "Final" and "Breakdown" are added after it.
 */
import type ExcelJS from "exceljs";
import { buildStatusReport, findLayout, MONTH_LABELS, type Cell, type StatusReport } from "./statusReport";

type Workbook = ExcelJS.Workbook;
type Worksheet = ExcelJS.Worksheet;

const FONT: Partial<ExcelJS.Font> = { name: "Segoe UI", size: 10 };
const BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const AMOUNT_FMT = "#,##0.00";
const DATE_FMT = "[$-409]d/mmm/yy;@";
/** Columns shown as dates in Final (the rest keep their values as-is). */
const DATE_COLUMNS = new Set(["due date", "gl date", "check date", "check status date"]);
const AMOUNT_COLUMNS = new Set(["invoice amount", "applied amount", "amount remaining", "check amount"]);

async function loadExcel(): Promise<typeof ExcelJS> {
  const mod = await import("exceljs");
  return (mod.default ?? mod) as typeof ExcelJS;
}

/** All rows of a sheet as 0-based arrays of cell values. */
export function sheetRows(ws: Worksheet): Cell[][] {
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values = row.values as Cell[];
    rows[n - 1] = Array.isArray(values) ? values.slice(1) : [];
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return rows;
}

/** The sheet that looks like the ERP export (has the required headers). */
export function pickSourceSheet(wb: Workbook): { ws: Worksheet; rows: Cell[][] } {
  let firstError: unknown = null;
  for (const ws of wb.worksheets) {
    const rows = sheetRows(ws);
    try {
      findLayout(rows);
      return { ws, rows };
    } catch (e) {
      firstError ??= e;
    }
  }
  throw firstError ?? new Error("Empty workbook");
}

export interface GeneratedReport {
  report: StatusReport;
  sourceSheet: string;
  blob: Blob;
}

/** Read an uploaded workbook and build the Status Report workbook. */
export async function generateStatusReport(data: ArrayBuffer, cutoff: string): Promise<GeneratedReport> {
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  const { ws: source, rows } = pickSourceSheet(wb);
  const report = buildStatusReport(rows, cutoff);

  // Formulas that point at another workbook ("[1]Filtered!…") break once the file
  // leaves the analyst's PC: keep their last calculated values instead.
  freezeExternalFormulas(source);
  // Keep only the source sheet, then add the two report sheets.
  for (const other of [...wb.worksheets]) if (other.id !== source.id) wb.removeWorksheet(other.id);
  // exceljs keeps defined names / pivot leftovers from removed sheets; drop them to keep the file valid.
  const names = (wb as unknown as { definedNames?: { model: unknown[] } }).definedNames;
  if (names) names.model = [];
  writeFinal(wb, report);
  writeBreakdown(wb, report);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: "visible" }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return { report, sourceSheet: source.name, blob };
}

/** Replace formulas that reference other workbooks with their cached results. */
export function freezeExternalFormulas(ws: Worksheet): number {
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row) =>
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value as { formula?: string; sharedFormula?: string; result?: unknown } | null;
      if (!v || typeof v !== "object" || !("formula" in v || "sharedFormula" in v)) return;
      const formula = cell.formula ?? v.formula ?? "";
      if (!/\[\d+\]/.test(formula)) return;
      const result = v.result;
      cell.value = result == null || (typeof result === "object" && "error" in (result as object)) ? null : (result as ExcelJS.CellValue);
      n++;
    }),
  );
  return n;
}

/** Header names made unique and non-empty (Excel tables require it). */
function tableHeaders(headers: string[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    let h = (headers[i] ?? "").trim() || `Column${i + 1}`;
    const key = h.toLowerCase();
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n) h = `${h}${n + 1}`;
    return h;
  });
}

/** A cell value that's safe to put in a table: formulas become their results. */
function plainValue(v: Cell): ExcelJS.CellValue {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: unknown };
    if ("result" in o) return plainValue(o.result as Cell);
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("text" in o) return plainValue(o.text as Cell);
  }
  return String(v);
}

function writeFinal(wb: Workbook, report: StatusReport) {
  const ws = wb.addWorksheet("Final");
  const width = Math.max(report.layout.headers.length, ...report.final.map((f) => f.cells.length));
  const headers = tableHeaders(report.layout.headers, width);
  const amountCol = report.layout.col["Invoice Amount"] + 1;

  // Row 3: total of Invoice Amount over the table (like the hand-made report).
  const total = ws.getCell(3, amountCol);
  const last = 4 + Math.max(report.final.length, 1);
  total.value = { formula: `SUBTOTAL(9,${colLetter(amountCol)}5:${colLetter(amountCol)}${last})`, result: report.grandTotal };
  total.numFmt = AMOUNT_FMT;
  total.font = BOLD;

  ws.addTable({
    name: "FinalTable",
    ref: "A4",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows: report.final.length
      ? report.final.map((f) => Array.from({ length: width }, (_, i) => plainValue(f.cells[i])))
      : [Array.from({ length: width }, () => null)],
  });

  headers.forEach((h, i) => {
    const column = ws.getColumn(i + 1);
    const key = h.toLowerCase();
    column.width = key === "vendor name" ? 48 : key === "project name" ? 32 : key === "description" ? 40 : key === "org name" ? 24 : 16;
    if (AMOUNT_COLUMNS.has(key)) column.numFmt = AMOUNT_FMT;
    else if (DATE_COLUMNS.has(key)) column.numFmt = DATE_FMT;
  });
  ws.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => (cell.font = row.number === 4 ? BOLD : FONT)));
  total.font = BOLD;
  ws.views = [{ state: "frozen", ySplit: 4 }];
}

function writeBreakdown(wb: Workbook, report: StatusReport) {
  const ws = wb.addWorksheet("Breakdown");
  const months = report.columns.flatMap(({ year, months }) => [...months.map((m) => ({ year, month: m })), { year, month: 0 }]);
  const valueCols = months.length + 1; // + Grand Total
  const firstValueCol = 4; // A: Org, B: Type, C: Status
  const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
  const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  const border: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FF9BC2E6" } } };

  // --- Pivot 1: by Due Date year / month -----------------------------------
  let r = 2;
  ws.getCell(r, 1).value = "Sum of Invoice Amount";
  ws.getCell(r, firstValueCol).value = "Years (Due Date)";
  ws.getCell(r, firstValueCol + 1).value = "Months (Due Date)";
  r++;
  // Year row
  let c = firstValueCol;
  for (const { year, months: ms } of report.columns) {
    ws.getCell(r, c).value = String(year);
    c += ms.length;
    ws.getCell(r, c).value = `${year} Total`;
    c++;
  }
  ws.getCell(r, c).value = "Grand Total";
  r++;
  // Month row
  c = firstValueCol;
  for (const m of months) {
    if (m.month) ws.getCell(r, c).value = MONTH_LABELS[m.month - 1];
    c++;
  }
  r++;
  ws.getCell(r, 1).value = "Org Name";
  ws.getCell(r, 2).value = "Invoice Type";
  ws.getCell(r, 3).value = "Check Status";
  for (let rr = 2; rr <= r; rr++) {
    for (let cc = 1; cc < firstValueCol + valueCols; cc++) {
      const cell = ws.getCell(rr, cc);
      cell.font = BOLD;
      cell.fill = HEAD_FILL;
    }
  }
  r++;

  let lastOrg = "";
  let lastType = "";
  for (const line of report.breakdown) {
    const row = ws.getRow(r);
    if (line.kind === "status") {
      if (line.org !== lastOrg) row.getCell(1).value = line.org;
      if (line.org !== lastOrg || line.type !== lastType) row.getCell(2).value = line.type;
      row.getCell(3).value = line.status;
      lastOrg = line.org;
      lastType = line.type;
    } else if (line.kind === "typeTotal") {
      row.getCell(2).value = `${line.type} Total`;
      lastType = "";
    } else if (line.kind === "orgTotal") {
      row.getCell(1).value = `${line.org} Total`;
      lastOrg = "";
    } else row.getCell(1).value = "Grand Total";

    c = firstValueCol;
    for (const m of months) {
      const v = m.month ? line.byMonth.get(`${m.year}-${String(m.month).padStart(2, "0")}`) : sumYear(line.byMonth, m.year);
      if (v !== undefined && v !== 0) row.getCell(c).value = round2(v);
      else if (v === 0 && m.month && line.byMonth.has(`${m.year}-${String(m.month).padStart(2, "0")}`)) row.getCell(c).value = 0;
      c++;
    }
    row.getCell(c).value = round2(line.total);

    const strong = line.kind !== "status";
    for (let cc = 1; cc < firstValueCol + valueCols; cc++) {
      const cell = row.getCell(cc);
      cell.font = strong ? BOLD : FONT;
      if (cc >= firstValueCol) cell.numFmt = AMOUNT_FMT;
      if (line.kind === "orgTotal" || line.kind === "grandTotal") {
        cell.fill = line.kind === "grandTotal" ? HEAD_FILL : TOTAL_FILL;
        cell.border = border;
      }
    }
    r++;
  }

  // --- Pivot 2: totals only ("Supplier Invoices Dues") ------------------------
  r += 3;
  const head = ["Org Name", "Invoice Type", "Check Status", "Supplier Invoices Dues"];
  head.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h;
    cell.font = BOLD;
    cell.fill = HEAD_FILL;
  });
  r++;
  lastOrg = "";
  lastType = "";
  for (const line of report.breakdown) {
    const row = ws.getRow(r);
    if (line.kind === "status") {
      if (line.org !== lastOrg) row.getCell(1).value = line.org;
      if (line.org !== lastOrg || line.type !== lastType) row.getCell(2).value = line.type;
      row.getCell(3).value = line.status;
      lastOrg = line.org;
      lastType = line.type;
    } else if (line.kind === "typeTotal") {
      row.getCell(2).value = `${line.type} Total`;
      lastType = "";
    } else if (line.kind === "orgTotal") {
      row.getCell(1).value = `${line.org} Total`;
      lastOrg = "";
    } else row.getCell(1).value = "Grand Total";
    row.getCell(4).value = round2(line.total);
    row.getCell(4).numFmt = AMOUNT_FMT;
    for (let cc = 1; cc <= 4; cc++) {
      const cell = row.getCell(cc);
      cell.font = line.kind === "status" ? FONT : BOLD;
      if (line.kind === "orgTotal") cell.fill = TOTAL_FILL;
      if (line.kind === "grandTotal") cell.fill = HEAD_FILL;
    }
    r++;
  }

  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  for (let cc = firstValueCol; cc < firstValueCol + valueCols; cc++) ws.getColumn(cc).width = cc === firstValueCol ? 24 : 15;
}

function sumYear(byMonth: Map<string, number>, year: number): number | undefined {
  let total: number | undefined;
  for (const [k, v] of byMonth) if (k.startsWith(`${year}-`)) total = (total ?? 0) + v;
  return total;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
