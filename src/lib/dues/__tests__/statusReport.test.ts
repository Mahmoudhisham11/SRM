import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildStatusReport, cellISODate, DuesFormatError, isOpenStatus, statusLabel, statusReportFileName } from "../statusReport";
import { generateStatusReport } from "../statusReportXlsx";

const HEAD = ["Doc Sequence Value", "Vendor Number", "Vendor Name", "Invoice Type", "Invoice Amount", "Check Status", "Due Date", "Applied Amount", "Org Name"];
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const DMC = "Dar Al Mimar For Construction & Projects";
const CURVE = "Curve For Landscape Design & Construction";
// Like the ERP export: an empty row, a SUBTOTAL row, then the header on row 3.
const sheet = (...rows: unknown[][]) => [[], [null, null, null, null, { formula: "SUBTOTAL(9,E4:E99)", result: 0 }], HEAD, ...rows];

describe("Final: unpaid, nothing applied, due by the cutoff", () => {
  const rows = sheet(
    [1, "6010", "Holcim", "DEBIT", -500, null, d("2026-09-20"), 0, DMC], // credit note → kept
    [2, "6010", "Holcim", "STANDARD", 1000, null, d("2026-11-14"), 0, DMC], // due on cutoff → kept
    [3, "6010", "Holcim", "STANDARD", 1000, null, d("2026-11-15"), 0, DMC], // due after → out
    [4, "7737", "Sega", "STANDARD", 300, "DELIVERED", d("2026-10-01"), 0, DMC], // paid → out
    [5, "7737", "Sega", "STANDARD", 300, "IN_SAFE", d("2026-10-01"), 0, DMC], // in safe → out
    [6, "7737", "Sega", "STANDARD", 200, "UNDER_SIGNATURE", d("2026-10-01"), null, CURVE], // kept
    [7, "7737", "Sega", "STANDARD", 200, " ", d("2025-07-01"), 0, CURVE], // blank status → kept
    [8, "7737", "Sega", "STANDARD", 900, null, d("2026-10-01"), 450, CURVE], // partly applied → out
    [9, "1138", "Masader", "PREPAYMENT", 50, null, d("2026-11-01"), 0, CURVE], // kept
    [],
  );
  const r = buildStatusReport(rows, "2026-11-14");

  it("selects exactly the rows to pay", () => {
    expect(r.totalRows).toBe(9);
    expect(r.final.map((f) => f.cells[0]).sort()).toEqual([1, 2, 6, 7, 9]);
    expect(r.grandTotal).toBe(-500 + 1000 + 200 + 200 + 50);
  });

  it("orders by company (as in the sheet), then amount ascending", () => {
    expect(r.final.map((f) => f.cells[0])).toEqual([1, 2, 9, 6, 7]);
  });

  it("builds the breakdown by org › type › status across year/month", () => {
    expect(r.columns).toEqual([
      { year: 2025, months: [7] },
      { year: 2026, months: [9, 10, 11] },
    ]);
    const lines = r.breakdown.map((l) => [l.kind, l.org === CURVE ? "C" : l.org === DMC ? "D" : "", l.type, l.status, l.total]);
    expect(lines).toEqual([
      ["status", "C", "PREPAYMENT", "(blank)", 50],
      ["typeTotal", "C", "PREPAYMENT", "", 50],
      ["status", "C", "STANDARD", "UNDER_SIGNATURE", 200],
      ["status", "C", "STANDARD", " ", 200],
      ["typeTotal", "C", "STANDARD", "", 400],
      ["orgTotal", "C", "", "", 450],
      ["status", "D", "STANDARD", "(blank)", 1000],
      ["typeTotal", "D", "STANDARD", "", 1000],
      ["status", "D", "DEBIT", "(blank)", -500],
      ["typeTotal", "D", "DEBIT", "", -500],
      ["orgTotal", "D", "", "", 500],
      ["grandTotal", "", "", "", 950],
    ]);
    const grand = r.breakdown.at(-1)!;
    expect(Object.fromEntries(grand.byMonth)).toEqual({ "2025-07": 200, "2026-09": -500, "2026-10": 200, "2026-11": 1050 });
  });

  it("reports rows it can't read instead of dropping them silently", () => {
    const bad = buildStatusReport(sheet([1, "1", "x", "STANDARD", 10, null, "not a date", 0, DMC]), "2026-11-14");
    expect(bad.problems).toEqual([{ row: 4, reason: "badDueDate" }]);
  });
});

describe("reading cells", () => {
  it("statuses", () => {
    expect([null, "", " ", "UNDER_SIGNATURE", "DELIVERED", "IN_SAFE"].map(isOpenStatus)).toEqual([true, true, true, true, false, false]);
    expect([null, " ", "UNDER_SIGNATURE"].map(statusLabel)).toEqual(["(blank)", " ", "UNDER_SIGNATURE"]);
  });
  it("dates in every shape the export uses", () => {
    expect(cellISODate(d("2026-11-14"))).toBe("2026-11-14");
    expect(cellISODate(46340)).toBe("2026-11-14"); // Excel serial
    expect(cellISODate("14-NOV-2026")).toBe("2026-11-14");
    expect(cellISODate("14-Nov-26")).toBe("2026-11-14");
    expect(cellISODate("2026-11-14 00:00:00")).toBe("2026-11-14");
    expect(cellISODate("14/11/2026")).toBe("2026-11-14");
    expect(cellISODate("")).toBeNull();
  });
  it("names the missing columns", () => {
    try {
      buildStatusReport([["Invoice Amount", "Due Date"]], "2026-11-14");
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(DuesFormatError);
      expect((e as DuesFormatError).missing).toEqual(["Check Status", "Applied Amount", "Org Name", "Invoice Type"]);
    }
  });
  it("file name", () => expect(statusReportFileName("2026-11-14")).toBe("Supplier_Invoices_Status_Report (DMC, Curve) 14-11-2026.xlsx"));
});

describe("workbook", () => {
  it("keeps the uploaded sheet, adds Final (a table) and Breakdown, and freezes external formulas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("DM AP Order To Pay");
    wb.addWorksheet("Old notes");
    ws.addRow([]);
    ws.addRow([]);
    ws.addRow([...HEAD, "Marwa"]);
    ws.addRow([1, "6010", "Holcim", "STANDARD", 1000, null, d("2026-11-01"), 0, DMC, { formula: "VLOOKUP(C4,[1]Filtered!$B$2:$B$33,1,0)", result: "Holcim" }]);
    ws.addRow([2, "7737", "Sega", "STANDARD", 50, "DELIVERED", d("2026-11-01"), 0, DMC, null]);
    const input = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    const out = await generateStatusReport(input, "2026-11-14");
    expect(out.sourceSheet).toBe("DM AP Order To Pay");
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await out.blob.arrayBuffer());
    expect(back.worksheets.map((w) => w.name)).toEqual(["DM AP Order To Pay", "Final", "Breakdown"]);
    expect(back.worksheets[0].getCell("J4").value).toBe("Holcim"); // external VLOOKUP → its value
    const final = back.getWorksheet("Final")!;
    expect(final.getCell("A4").value).toBe("Doc Sequence Value");
    expect(final.getCell("A5").value).toBe(1);
    expect(final.getCell("A6").value).toBeNull();
    expect((final.getCell("E3").value as { formula: string }).formula).toBe("SUBTOTAL(9,E5:E5)");
    const breakdown = back.getWorksheet("Breakdown")!;
    const texts: unknown[] = [];
    breakdown.eachRow((row) => texts.push(row.getCell(1).value));
    expect(texts).toContain("Grand Total");
  });
});
