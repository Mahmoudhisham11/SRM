/**
 * Writes the Supplier Invoices Analysis workbook (see analysis.ts) with exceljs:
 *   Filtered · Advance · Applied · Fixed · Masader · Original
 * Same layout as the hand-made file: SUBTOTALs on row 1, headers on row 2,
 * panes frozen at E3, zoom 90 %, AutoFilter, Segoe UI 10, amounts
 * «#,##0.00_ ;[Red]\-#,##0.00\ », dates «d-mmm-yy»; Fixed grouped by vendor with
 * a «… Total» row per vendor and a Grand Total, collapsed like the original.
 */
import type ExcelJS from "exceljs";
import { buildAnalysis, capitalizeSite, learnAnalysisConfig, OUTPUT_COLUMNS, shortOrg, type Analysis, type AnalysisConfig, type LearnResult, type SourceRow } from "./analysis";
import { cellNumber, cellString, type Cell } from "./statusReport";
import { freezeExternalFormulas, pickSourceSheet, sheetRows } from "./statusReportXlsx";

type Workbook = ExcelJS.Workbook;
type Worksheet = ExcelJS.Worksheet;

const FONT: Partial<ExcelJS.Font> = { name: "Segoe UI", size: 10 };
const BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true };
export const AMOUNT_FMT = "#,##0.00_ ;[Red]\\-#,##0.00\\ ";
export const DATE_FMT = "d-mmm-yy";
const DATE_COLS = new Set(["Due Date", "Check Status Date", "Check Date", "Gl Date"]);
const AMOUNT_COLS = new Set(["Invoice Amount", "Applied Amount", "Amount Remaining"]);
/** Column widths of the hand-made file (others: Excel's default). */
const WIDTHS: Record<string, number> = { A: 9.1, B: 16.6, C: 9.1, D: 24, E: 9.1, K: 12.3, L: 15.4, M: 12.9, N: 16, O: 9.1, Q: 12.4, R: 9.1, S: 12.7, T: 12.8, U: 9.1, X: 12.6, Y: 9.1 };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

async function loadExcel(): Promise<typeof ExcelJS> {
  const mod = await import("exceljs");
  return (mod.default ?? mod) as typeof ExcelJS;
}

function plain(v: Cell): ExcelJS.CellValue {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: unknown; error?: unknown };
    if ("result" in o) return o.result == null || (typeof o.result === "object" && o.result !== null && "error" in o.result) ? null : plain(o.result as Cell);
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("text" in o) return plain(o.text as Cell);
    if ("error" in o) return null;
  }
  return String(v);
}

/** The notes column at the end of the export (e.g. «marwa»): its header and index. */
function notesColumn(a: Analysis): { header: string; index: number } | null {
  const known = new Set([...OUTPUT_COLUMNS.map(norm), "org id"]);
  for (let i = a.cols.headers.length - 1; i >= 0; i--) {
    const h = a.cols.headers[i];
    if (h && !known.has(norm(h))) return { header: h, index: i };
  }
  return null;
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const L = OUTPUT_COLUMNS.indexOf("Invoice Amount") + 1; // 12
const N = OUTPUT_COLUMNS.indexOf("Amount Remaining") + 1; // 14

function setupSheet(ws: Worksheet, headers: string[]) {
  const width = headers.length;
  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 2, topLeftCell: "E3", zoomScale: 90 }];
  for (let c = 1; c <= width; c++) {
    const col = ws.getColumn(c);
    const w = WIDTHS[colLetter(c)];
    if (w) col.width = w;
  }
  // Row 1: totals of Invoice Amount and Amount Remaining.
  for (const c of [L, N]) {
    const cell = ws.getCell(1, c);
    cell.value = { formula: `SUBTOTAL(9,${colLetter(c)}3:${colLetter(c)}1048576)`, result: 0 };
    cell.numFmt = AMOUNT_FMT;
    cell.font = FONT;
  }
  // Row 2: headers.
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    cell.font = FONT;
    styleColumnCell(cell, OUTPUT_COLUMNS[i] ?? "");
  });
}

function styleColumnCell(cell: ExcelJS.Cell, column: string) {
  if (AMOUNT_COLS.has(column)) cell.numFmt = AMOUNT_FMT;
  else if (DATE_COLS.has(column)) cell.numFmt = DATE_FMT;
}

/** The output row for one source row (26 values). */
function outputValues(a: Analysis, r: SourceRow, notes: { index: number } | null): ExcelJS.CellValue[] {
  const get = (name: string) => {
    const i = a.cols.index.get(norm(name));
    return i === undefined ? null : r.cells[i];
  };
  const values: ExcelJS.CellValue[] = OUTPUT_COLUMNS.map((name) => {
    if (name === "Org Name") return plain(shortOrg(get(name)));
    if (name === "Vendor Site Code") return plain(capitalizeSite(get(name)));
    if (name === "Amount Remaining") return null; // filled below
    return plain(get(name));
  });
  values.push(notes ? plain(r.cells[notes.index]) : null);
  return values;
}

function remaining(r: SourceRow, a: Analysis): number {
  const inv = cellNumber(r.cells[a.cols.index.get(norm("Invoice Amount"))!]) || 0;
  const app = cellNumber(r.cells[a.cols.index.get(norm("Applied Amount"))!]) || 0;
  return Math.round((inv - app) * 100) / 100;
}

function writeRows(ws: Worksheet, a: Analysis, list: SourceRow[], notes: { index: number } | null, opts: { remainingFormula: boolean; startRow?: number }) {
  let rowNo = opts.startRow ?? 3;
  for (const r of list) {
    const values = outputValues(a, r, notes);
    const row = ws.getRow(rowNo);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = FONT;
      styleColumnCell(cell, OUTPUT_COLUMNS[i] ?? "");
    });
    const rem = remaining(r, a);
    row.getCell(N).value = opts.remainingFormula ? { formula: `L${rowNo}-M${rowNo}`, result: rem } : rem;
    rowNo++;
  }
  return rowNo;
}

function sum(list: SourceRow[], a: Analysis, col: "Invoice Amount" | "Remaining") {
  return list.reduce((s, r) => s + (col === "Remaining" ? remaining(r, a) : cellNumber(r.cells[a.cols.index.get(norm("Invoice Amount"))!]) || 0), 0);
}

/** Row 1 totals: keep the formulas, store their current results (shown before Excel recalculates). */
function finishTotals(ws: Worksheet, a: Analysis, list: SourceRow[]) {
  ws.getCell(1, L).value = { formula: "SUBTOTAL(9,L3:L1048576)", result: Math.round(sum(list, a, "Invoice Amount") * 100) / 100 };
  ws.getCell(1, N).value = { formula: "SUBTOTAL(9,N3:N1048576)", result: Math.round(sum(list, a, "Remaining") * 100) / 100 };
}

function writeFlatSheet(wb: Workbook, name: string, a: Analysis, list: SourceRow[], headers: string[], notes: { index: number } | null, remainingFormula: boolean) {
  const ws = wb.addWorksheet(name);
  setupSheet(ws, headers);
  const end = writeRows(ws, a, list, notes, { remainingFormula });
  finishTotals(ws, a, list);
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(end - 1, 2), column: headers.length } };
  return ws;
}

/** Fixed: one group per vendor (A→Z), each followed by «<vendor> Total», then «Grand Total». Collapsed to the totals. */
function writeFixed(wb: Workbook, a: Analysis, list: SourceRow[], headers: string[], notes: { index: number } | null) {
  const ws = wb.addWorksheet("Fixed", { properties: { outlineLevelRow: 2, outlineProperties: { summaryBelow: true, summaryRight: true } } });
  setupSheet(ws, headers);
  const D = OUTPUT_COLUMNS.indexOf("Vendor Name") + 1;
  let rowNo = 3;
  let i = 0;
  let lastData = 2;
  while (i < list.length) {
    const name = list[i].vendorName;
    let j = i;
    while (j < list.length && list[j].vendorName === name) j++;
    const group = list.slice(i, j);
    const start = rowNo;
    rowNo = writeRows(ws, a, group, notes, { remainingFormula: false, startRow: rowNo });
    for (let r = start; r < rowNo; r++) {
      const row = ws.getRow(r);
      row.outlineLevel = 2;
      row.hidden = true;
    }
    lastData = rowNo - 1;
    const total = ws.getRow(rowNo);
    total.getCell(D).value = `${name} Total`;
    total.getCell(D).font = BOLD;
    total.getCell(L).value = { formula: `SUBTOTAL(9,L${start}:L${rowNo - 1})`, result: Math.round(sum(group, a, "Invoice Amount") * 100) / 100 };
    total.getCell(L).numFmt = AMOUNT_FMT;
    total.getCell(L).font = FONT;
    total.outlineLevel = 1;
    rowNo++;
    i = j;
  }
  const grand = ws.getRow(rowNo);
  grand.getCell(D).value = "Grand Total";
  grand.getCell(D).font = BOLD;
  // Up to the last data row, like Excel's Data › Subtotal.
  grand.getCell(L).value = { formula: `SUBTOTAL(9,L3:L${Math.max(lastData, 3)})`, result: Math.round(sum(list, a, "Invoice Amount") * 100) / 100 };
  grand.getCell(L).numFmt = AMOUNT_FMT;
  grand.getCell(L).font = FONT;
  finishTotals(ws, a, list);
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(lastData, 2), column: headers.length } };
  return ws;
}

export interface GeneratedAnalysis {
  analysis: Analysis;
  sourceSheet: string;
  blob: Blob;
}

/** Read the uploaded ERP export and write the Analysis workbook. */
export async function generateAnalysis(data: ArrayBuffer, cfg: AnalysisConfig): Promise<GeneratedAnalysis> {
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  const { ws: source, rows } = pickSourceSheet(wb);
  const sourceName = source.name;
  const analysis = buildAnalysis(rows, cfg);
  const notes = notesColumn(analysis);
  const headers: string[] = [...OUTPUT_COLUMNS, notes?.header ?? "marwa"];

  freezeExternalFormulas(source);
  for (const other of [...wb.worksheets]) if (other.id !== source.id) wb.removeWorksheet(other.id);
  const names = (wb as unknown as { definedNames?: { model: unknown[] } }).definedNames;
  if (names) names.model = [];

  writeFlatSheet(wb, "Filtered", analysis, analysis.sheets.Filtered, headers, notes, true);
  writeFlatSheet(wb, "Advance", analysis, analysis.sheets.Advance, headers, notes, false);
  writeFlatSheet(wb, "Applied", analysis, analysis.sheets.Applied, headers, notes, false);
  writeFixed(wb, analysis, analysis.sheets.Fixed, headers, notes);
  writeFlatSheet(wb, "Masader", analysis, analysis.sheets.Masader, headers, notes, false);

  // The uploaded sheet goes last, as «Original».
  source.name = "Original";
  (source as unknown as { orderNo: number }).orderNo = 1000;
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return { analysis, sourceSheet: sourceName, blob };
}

/** Learn the vendor lists from a hand-made Analysis workbook. */
export async function learnFromAnalysisFile(data: ArrayBuffer, fileName?: string): Promise<LearnResult> {
  const Excel = await loadExcel();
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  const sheets: Record<string, Cell[][]> = {};
  for (const ws of wb.worksheets) sheets[ws.name] = sheetRows(ws);
  return learnAnalysisConfig(sheets, fileName);
}

/** "Supplier_Invoices_Analysis_Dmc_Curve_14_11_2026.xlsx" */
export function analysisFileName(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `Supplier_Invoices_Analysis_Dmc_Curve_${d}_${m}_${y}.xlsx`;
}

export { cellString };
