import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildAnalysis, capitalizeSite, EMPTY_CONFIG, learnAnalysisConfig, placeRow, readSourceRows, rowKey, shortOrg, type AnalysisConfig } from "../analysis";
import { generateAnalysis, AMOUNT_FMT } from "../analysisXlsx";

// Synthetic ERP export (made-up vendors and invoices).
const HEAD = ["Doc Sequence Value", "Vendor Number", "Vendor Name", "Invoice Type", "Vendor Site Code", "Invoice Num", "Last Approval Date", "Po Number", "Invoice Amount", "Description", "Check Status", "Check Status Date", "Payment Receiving Date", "Check Doc Seq", "Check Date", "Check Amount", "Status Lookup Code", "User Name", "Term Name", "Due Date", "Gl Date", "Org Id", "Applied Amount", "Amount Remaining", "Org Name", "Project Name", "marwa"];
const DMC = "Dar Al Mimar For Construction & Projects";
const CURVE = "Curve For Landscape Design & Construction";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
let seq = 1000;
function row(o: { v: string; name: string; type?: string; amount: number; applied?: number; status?: string | null; due: string; org?: string; site?: string; notes?: string }) {
  const r: unknown[] = Array(HEAD.length).fill(null);
  const set = (h: string, v: unknown) => (r[HEAD.indexOf(h)] = v);
  set("Doc Sequence Value", ++seq);
  set("Vendor Number", o.v);
  set("Vendor Name", o.name);
  set("Invoice Type", o.type ?? "STANDARD");
  set("Vendor Site Code", o.site ?? "supplier");
  set("Invoice Num", `INV-${seq}`);
  set("Invoice Amount", o.amount);
  set("Check Status", o.status ?? null);
  set("Due Date", d(o.due));
  set("Applied Amount", o.applied ?? 0);
  set("Org Name", o.org ?? DMC);
  set("Project Name", "DMC-Test");
  set("marwa", o.notes ?? null);
  return r;
}
const rows = [
  [], [null, null, null, null, null, null, null, null, { formula: "SUBTOTAL(9,I4:I99)", result: 0 }], HEAD,
  row({ v: "100", name: "Alpha", amount: 500, due: "2026-03-01" }), // Filtered
  row({ v: "100", name: "Alpha", amount: 300, due: "2026-01-01" }), // Filtered (earlier)
  row({ v: "100", name: "Alpha", amount: 900, applied: 400, due: "2026-02-01" }), // Applied
  row({ v: "100", name: "Alpha", amount: 900, applied: 400, status: "DELIVERED", due: "2026-02-02" }), // paid → Filtered
  row({ v: "100", name: "Alpha", type: "PREPAYMENT", amount: 50, due: "2026-04-01", org: CURVE }), // Filtered + Advance
  row({ v: "100", name: "Alpha", type: "DEBIT", amount: -20, due: "2026-04-02" }), // none
  row({ v: "200", name: "Fixed Co", amount: 70, due: "2026-02-01", site: "Service", notes: "Fixed Co" }), // Fixed
  row({ v: "200", name: "Fixed Co", amount: 10, applied: 10, due: "2026-01-01", site: "Service" }), // Fixed (even when applied)
  row({ v: "150", name: "Beta Fixed", amount: 5, due: "2026-05-01" }), // Fixed (second group)
  row({ v: "300", name: "Gone Ltd", amount: 999, due: "2026-01-01" }), // excluded
  row({ v: "400", name: "Masader", amount: 60, due: "2026-02-01" }), // Masader
  row({ v: "400", name: "Masader", type: "DEBIT", amount: -6, due: "2026-02-01" }), // none
  row({ v: "500", name: "Odd", amount: 1, due: "2026-01-05" }), // exception → none
];
const cfg: AnalysisConfig = {
  ...EMPTY_CONFIG,
  fixedVendors: ["200", "150"],
  excludedVendors: ["300"],
  masaderVendors: ["400"],
  exceptions: { [rowKey(1013, "INV-1013", 1)]: "none" },
};

describe("placing rows", () => {
  const a = buildAnalysis(rows, cfg);
  const amounts = (k: keyof typeof a.sheets) => a.sheets[k].map((r) => r.cells[HEAD.indexOf("Invoice Amount")]);

  it("follows the rules in order", () => {
    expect(amounts("Filtered")).toEqual([300, 900, 500, 50]); // by Due Date
    expect(amounts("Applied")).toEqual([900]);
    expect(amounts("Masader")).toEqual([60]);
    expect(amounts("Advance")).toEqual([50]);
    expect(a.excluded.map((r) => r.cells[HEAD.indexOf("Invoice Amount")]).sort()).toEqual([-20, -6, 1, 999].sort());
  });
  it("Fixed is grouped by vendor name, then due date", () => {
    expect(a.sheets.Fixed.map((r) => [r.vendorName, r.cells[HEAD.indexOf("Invoice Amount")]])).toEqual([
      ["Beta Fixed", 5],
      ["Fixed Co", 10],
      ["Fixed Co", 70],
    ]);
  });
  it("reports vendors that aren't on any list", () => {
    expect(a.newVendors.map((v) => v.vendor).sort()).toEqual(["100", "500"]);
  });
  it("short org names and capitalized site codes", () => {
    expect([shortOrg(DMC), shortOrg(CURVE), shortOrg("Other")]).toEqual(["DMC", "Curve", "Other"]);
    expect([capitalizeSite("supplier"), capitalizeSite("Service")]).toEqual(["Supplier", "Service"]);
  });
});

describe("learning the lists from a hand-made workbook", () => {
  it("recovers the lists and the per-invoice decisions", () => {
    const { rows: src } = readSourceRows(rows);
    const want = buildAnalysis(rows, cfg);
    // A "hand-made" workbook: the sheets as the analyst left them (keys only matter).
    const sheet = (list: typeof src) => [[], ["Doc Sequence Value", "Invoice Num", "Invoice Amount"], ...list.map((r) => [r.cells[0], r.cells[5], r.cells[8]])];
    const learned = learnAnalysisConfig(
      { Original: rows, Filtered: sheet(want.sheets.Filtered), Applied: sheet(want.sheets.Applied), Fixed: sheet(want.sheets.Fixed), Masader: sheet(want.sheets.Masader) },
      "hand-made.xlsx",
    );
    expect(learned.matched).toBe(learned.total);
    expect(learned.config.fixedVendors).toEqual(["150", "200"]);
    expect(learned.config.masaderVendors).toEqual(["400"]);
    expect(learned.config.excludedVendors).toEqual(["300", "500"]); // «Odd» only had the one excluded row
    for (const r of src) expect(placeRow(r, learned.config)).toBe(placeRow(r, cfg));
  });
});

describe("workbook", () => {
  it("writes the six sheets in the hand-made layout", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("DM AP Order To Pay");
    rows.forEach((r) => ws.addRow(r));
    const out = await generateAnalysis((await wb.xlsx.writeBuffer()) as ArrayBuffer, cfg);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await out.blob.arrayBuffer());
    expect(back.worksheets.map((w) => w.name)).toEqual(["Filtered", "Advance", "Applied", "Fixed", "Masader", "Original"]);
    const f = back.getWorksheet("Filtered")!;
    expect(f.getRow(2).values).toEqual([undefined, ...HEAD.slice(0, 0), "Org Name", "Project Name", "Vendor Number", "Vendor Name", "Invoice Type", "Vendor Site Code", "Invoice Num", "Last Approval Date", "Po Number", "Term Name", "Due Date", "Invoice Amount", "Applied Amount", "Amount Remaining", "Description", "Check Status", "Check Status Date", "Payment Receiving Date", "Check Doc Seq", "Check Date", "Check Amount", "Status Lookup Code", "User Name", "Gl Date", "Doc Sequence Value", "marwa"]);
    expect(f.getCell("A3").value).toBe("DMC");
    expect(f.getCell("F3").value).toBe("Supplier");
    expect((f.getCell("N3").value as { formula: string }).formula).toBe("L3-M3");
    expect((f.getCell("L1").value as { formula: string }).formula).toBe("SUBTOTAL(9,L3:L1048576)");
    expect(f.getCell("L3").numFmt.replace(/\\/g, "")).toBe(AMOUNT_FMT.replace(/\\/g, "")); // exceljs drops the escapes when reading
    const fixed = back.getWorksheet("Fixed")!;
    expect(fixed.getCell("D4").value).toBe("Beta Fixed Total");
    expect((fixed.getCell("L4").value as { formula: string }).formula).toBe("SUBTOTAL(9,L3:L3)");
    expect(fixed.getCell("D7").value).toBe("Fixed Co Total");
    expect(fixed.getCell("D8").value).toBe("Grand Total");
    expect((fixed.getCell("L8").value as { formula: string }).formula).toBe("SUBTOTAL(9,L3:L6)");
    expect(fixed.getRow(3).outlineLevel).toBe(2);
    expect(back.getWorksheet("Original")!.getCell("A4").value).toBe(1001);
  });
});
