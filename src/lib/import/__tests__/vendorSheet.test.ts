import { describe, expect, it } from "vitest";
import { cellText, parseVendorSheet, SheetFormatError } from "../vendorSheet";
import { planVendorImport } from "../../data/repo";
import { validateVendor } from "../../validation";
import type { Vendor, VendorInput } from "../../types";

const HEAD = ["Vendor Number", "Vendor Name", "Material Type"];

describe("parseVendorSheet", () => {
  it("reads the Supplier_by_Material layout and tidies values", () => {
    const r = parseVendorSheet([
      HEAD,
      [12229, "      RAY Engineering Solutions راي للحلول الهندسيه", "Service"],
      [10859, "     مجموعه المدينه للصلب", "Steel"],
      [10450, "AM  FOR IRRIGATION", "Mechanical "],
      [], // formatting-only rows at the end of the sheet
      [null, null, null],
    ]);
    expect(r.skipped).toEqual([]);
    expect(r.vendors).toEqual([
      { nameAr: "RAY Engineering Solutions راي للحلول الهندسيه", nameEn: "", code: "12229", material: "Service", contact: "", notes: "" },
      { nameAr: "مجموعه المدينه للصلب", nameEn: "", code: "10859", material: "Steel", contact: "", notes: "" },
      { nameAr: "AM FOR IRRIGATION", nameEn: "", code: "10450", material: "Mechanical", contact: "", notes: "" },
    ]);
  });

  it("merges spelling variants of a material and counts them", () => {
    const r = parseVendorSheet([HEAD, [1, "a", "Arab"], [2, "b", "Arab "], [3, "c", "arab"], [4, "d", "Steel"]]);
    expect(r.vendors.map((v) => v.material)).toEqual(["Arab", "Arab", "Arab", "Steel"]);
    expect(r.materials).toEqual([{ material: "Arab", count: 3 }, { material: "Steel", count: 1 }]);
  });

  it("finds columns in any order, below a title row, with Arabic headers", () => {
    const r = parseVendorSheet([["قائمة الموردين 2026"], ["الخامة", "اسم المورد", "رقم المورد"], ["Steel", "مصر للمعادن", "١٢٠٩٠"]]);
    expect(r.vendors[0]).toMatchObject({ code: "12090", nameAr: "مصر للمعادن", material: "Steel" });
  });

  it("reports incomplete and repeated rows instead of importing them", () => {
    const r = parseVendorSheet([HEAD, [1, "a", "IT"], [null, "b", "IT"], [3, "", "IT"], [4, "d", ""], [1, "again", "IT"]]);
    expect(r.vendors).toHaveLength(1);
    expect(r.skipped).toEqual([
      { row: 3, reason: "missingCode" },
      { row: 4, reason: "missingName", code: "3" },
      { row: 5, reason: "missingMaterial", code: "4" },
      { row: 6, reason: "duplicate", code: "1" },
    ]);
  });

  it("says which columns are missing", () => {
    expect(() => parseVendorSheet([["Vendor Number", "Vendor Name"], [1, "a"]])).toThrow(SheetFormatError);
    try {
      parseVendorSheet([["Vendor Number", "Vendor Name"]]);
    } catch (e) {
      expect((e as SheetFormatError).missing).toEqual(["material"]);
    }
  });

  it("reads exceljs rich text / formula cells", () => {
    expect(cellText({ richText: [{ text: "Al " }, { text: "Ahram" }] })).toBe("Al Ahram");
    expect(cellText({ formula: "A1", result: 10532 })).toBe("10532");
    expect(cellText(10532)).toBe("10532");
  });
});

describe("planVendorImport", () => {
  const existing: Vendor[] = [
    { id: "v1", nameAr: "مصر للمعادن", nameEn: "Misr Metals", code: "12090", material: "", contact: "0100", notes: "مهم", createdAt: 0, updatedAt: 0 },
    { id: "v2", nameAr: "الدلتا", nameEn: "", code: "11204", material: "Service", contact: "", notes: "", createdAt: 0, updatedAt: 0 },
  ];
  const row = (code: string, name: string, material: string): VendorInput => ({ nameAr: name, nameEn: "", code, material, contact: "", notes: "" });

  it("creates new codes, updates changed ones, keeps contact and notes", () => {
    const plan = planVendorImport([row("12090", "مصر للمعادن", "Steel"), row("11204", "الدلتا", "Service"), row("99999", "جديد", "IT")], existing);
    expect(plan.create.map((v) => v.code)).toEqual(["99999"]);
    expect(plan.update).toEqual([{ id: "v1", input: { nameAr: "مصر للمعادن", nameEn: "Misr Metals", code: "12090", material: "Steel", contact: "0100", notes: "مهم" } }]);
    expect(plan.unchanged).toBe(1);
  });

  it("re-importing the same sheet changes nothing", () => {
    const sheet = [row("12090", "مصر للمعادن", ""), row("11204", "الدلتا", "Service")];
    expect(planVendorImport(sheet, existing)).toEqual({ create: [], update: [], unchanged: 2 });
  });
});

describe("validateVendor: number, name and material are required", () => {
  const v = (p: Partial<VendorInput>): VendorInput => ({ nameAr: "مورد", nameEn: "", code: "10532", material: "Steel", contact: "", notes: "", ...p });
  it("accepts a complete vendor", () => expect(validateVendor(v({}), new Map())).toEqual({}));
  it("flags each missing field", () => {
    expect(validateVendor(v({ code: "" }), new Map())).toEqual({ code: "vendor.err.codeRequired" });
    expect(validateVendor(v({ nameAr: "" }), new Map())).toEqual({ nameAr: "vendor.err.name" });
    expect(validateVendor(v({ material: " " }), new Map())).toEqual({ material: "vendor.err.material" });
  });
  it("still rejects a code that's taken", () => {
    expect(validateVendor(v({}), new Map([["10532", "other"]]))).toMatchObject({ code: "vendor.err.codeTaken" });
  });
});
