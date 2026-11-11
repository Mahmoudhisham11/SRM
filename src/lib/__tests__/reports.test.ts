import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildPeriodReport, EMPTY_FILTERS, filterCases, presetRange, sortCases, summarize } from "../reports";
import { buildWorkbook, DATE_NUMFMT, SHEET_NAME } from "../export/excel";
import { buildCsv } from "../export/csv";
import { formatDMY, parseDMY } from "../dates";
import { statusFor, type Case, type Vendor } from "../types";

const vendor = (id: string, nameAr: string, code: string): Vendor => ({
  id, nameAr, nameEn: "", code, contact: "", notes: "", createdAt: 0, updatedAt: 0,
});
const V = new Map([
  ["a", vendor("a", "المصرية للتغليف", "10532")],
  ["b", vendor("b", "النيل للكيماويات", "10877")],
]);
let n = 0;
const mk = (vendorId: string, startDate: string, endDate: string | null, title = "x", comments = ""): Case => ({
  id: `c${++n}`, vendorId, case: title, taskBar: "t", startDate, endDate, comments,
  status: statusFor(endDate), audioUrl: null, transcript: "", createdAt: n, updatedAt: n,
});

const cases = [
  mk("a", "2025-01-10", "2025-01-20", "تأخير توريد"),
  mk("a", "2025-01-25", null, "فرق سعر", "مليون"),
  mk("b", "2025-03-05", "2025-03-07", "مرتجع"),
  mk("b", "2025-03-28", "2025-04-02", "شهادة"),
];

describe("dates format", () => {
  it("DD-MMM-YYYY round-trip", () => {
    expect(formatDMY("2025-03-05")).toBe("05-Mar-2025");
    expect(parseDMY("05-Mar-2025")).toBe("2025-03-05");
    expect(formatDMY(null)).toBe("");
  });
});

describe("filterCases", () => {
  it("by vendor, status, range, keyword (incl. vendor name/code)", () => {
    expect(filterCases(cases, { ...EMPTY_FILTERS, vendorId: "b" }, V)).toHaveLength(2);
    expect(filterCases(cases, { ...EMPTY_FILTERS, status: "open" }, V)).toHaveLength(1);
    expect(filterCases(cases, { ...EMPTY_FILTERS, from: "2025-01-20", to: "2025-03-05" }, V).map((c) => c.case)).toEqual(["فرق سعر", "مرتجع"]);
    expect(filterCases(cases, { ...EMPTY_FILTERS, q: "مليون" }, V)).toHaveLength(1);
    expect(filterCases(cases, { ...EMPTY_FILTERS, q: "10877" }, V)).toHaveLength(2);
    expect(filterCases(cases, { ...EMPTY_FILTERS, q: "المصريه" }, V)).toHaveLength(2); // ة/ه folded
  });
});

describe("sortCases", () => {
  it("by days desc puts open (no end) last", () => {
    const s = sortCases(cases, { key: "days", dir: "desc" }, V);
    expect(s.map((c) => c.case)).toEqual(["تأخير توريد", "شهادة", "مرتجع", "فرق سعر"]);
  });
  it("by vendor asc", () => {
    expect(sortCases(cases, { key: "vendor", dir: "asc" }, V)[0].vendorId).toBe("a");
  });
});

describe("summarize", () => {
  const s = summarize(cases);
  it("totals and average resolution", () => {
    expect([s.total, s.open, s.closed]).toEqual([4, 1, 3]);
    expect(s.avgResolutionDays).toBe(5.7); // (10 + 2 + 5) / 3
  });
  it("months are contiguous with zero gaps", () => {
    expect(s.perMonth).toEqual([
      { key: "2025-01", count: 2 },
      { key: "2025-02", count: 0 },
      { key: "2025-03", count: 2 },
    ]);
  });
  it("per vendor", () => {
    expect(s.perVendor.find((v) => v.vendorId === "a")).toMatchObject({ total: 2, open: 1, closed: 1 });
  });
  it("empty input", () => {
    expect(summarize([])).toMatchObject({ total: 0, avgResolutionDays: null, perMonth: [] });
  });
});

describe("period report", () => {
  it("presets", () => {
    expect(presetRange("thisMonth", "2026-11-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("thisWeek", "2026-11-11")).toEqual({ from: "2026-11-08", to: "2026-11-14" }); // Sun–Sat
  });
  it("includes cases active during the range", () => {
    const r = buildPeriodReport(cases, "2025-03-01", "2025-03-31", V);
    // still-open Jan case + both March cases
    expect(r.cases.map((c) => c.case).sort()).toEqual(["شهادة", "فرق سعر", "مرتجع"].sort());
    expect(r.openedInPeriod).toBe(2);
    expect(r.closedInPeriod).toBe(1); // شهادة closes in April
    expect(r.openAtEnd).toBe(2); // فرق سعر + شهادة
    expect(r.byVendor.map((g) => g.vendorId)).toEqual(["a", "b"]);
  });
});

describe("Excel export (SRM_Issues_Log format)", () => {
  it("columns, Arial 10, real dates as DD-MMM-YYYY", async () => {
    const wb = await buildWorkbook(cases, V, { includeVendor: false });
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const ws = back.getWorksheet(SHEET_NAME)!;
    expect(ws.getRow(1).values).toEqual([undefined, "Case", "Task Bar", "Start Date", "End Date", "Comments"]);
    expect(ws.rowCount).toBe(5);
    const r2 = ws.getRow(2);
    expect(r2.getCell(1).value).toBe("تأخير توريد");
    expect((r2.getCell(3).value as Date).toISOString().slice(0, 10)).toBe("2025-01-10");
    expect(r2.getCell(3).numFmt).toBe(DATE_NUMFMT);
    expect(ws.getRow(3).getCell(4).value).toBeNull(); // open case: empty End Date
    for (const row of [1, 2, 5]) {
      for (let col = 1; col <= 5; col++) {
        const f = ws.getRow(row).getCell(col).font;
        expect(f?.name).toBe("Arial");
        expect(f?.size).toBe(10);
      }
    }
  });
  it("optional Vendor column is appended last", async () => {
    const wb = await buildWorkbook(cases, V, { includeVendor: true });
    const ws = wb.getWorksheet(SHEET_NAME)!;
    expect(ws.getRow(1).getCell(6).value).toBe("Vendor");
    expect(ws.getRow(2).getCell(6).value).toBe("المصرية للتغليف (10532)");
  });
});

describe("CSV export", () => {
  it("BOM, headers, DD-MMM-YYYY, quoting, formula neutralization", () => {
    const tricky = [mk("a", "2025-01-10", null, 'كيس "مهم", عاجل', "=1+1")];
    const csv = buildCsv(tricky, V, { includeVendor: true });
    expect(csv.startsWith("﻿Case,Task Bar,Start Date,End Date,Comments,Vendor\r\n")).toBe(true);
    expect(csv).toContain('"كيس ""مهم"", عاجل",t,10-Jan-2025,,"\'=1+1",المصرية للتغليف (10532)\r\n');
  });
});
