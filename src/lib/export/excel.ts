import ExcelJS from "exceljs";
import { isoToUTCDate } from "../dates";
import type { Case, Vendor } from "../types";
import { headersFor, vendorLabel, type ExportOptions } from "./exportRows";

/**
 * Builds an .xlsx matching SRM_Issues_Log.xlsx:
 *   Case | Task By | Start Date | End Date | Comments  (+ optional Vendor, last)
 * - every cell Arial 10
 * - dates are real Excel dates displayed DD-MMM-YYYY (English month names
 *   regardless of the Windows locale, via the [$-409] locale prefix), so they
 *   sort and filter correctly in Excel.
 */
export const DATE_NUMFMT = "[$-409]dd-mmm-yyyy";
export const SHEET_NAME = "SRM Issues Log";

const FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };

export async function buildWorkbook(cases: Case[], vendors: Map<string, Vendor>, opts: ExportOptions): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SRM Voice Log";
  wb.created = new Date();
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });

  const widths = [45, 30, 14, 14, 55, 32];
  ws.columns = headersFor(opts).map((header, i) => ({ header, key: `c${i}`, width: widths[i] }));

  for (const c of cases) {
    const row: Array<string | Date | null> = [
      c.case,
      c.taskBar,
      isoToUTCDate(c.startDate),
      c.endDate ? isoToUTCDate(c.endDate) : null,
      c.comments,
    ];
    if (opts.includeVendor) row.push(vendorLabel(vendors.get(c.vendorId)));
    ws.addRow(row);
  }

  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = rowNumber === 1 ? { ...FONT, bold: true } : FONT;
      cell.alignment = { vertical: "top", wrapText: col === 1 || col === 2 || col === 5 };
      if (rowNumber > 1 && (col === 3 || col === 4)) cell.numFmt = DATE_NUMFMT;
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  return wb;
}

export async function buildXlsxBlob(cases: Case[], vendors: Map<string, Vendor>, opts: ExportOptions): Promise<Blob> {
  const wb = await buildWorkbook(cases, vendors, opts);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
