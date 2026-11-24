import { describe, expect, it } from "vitest";
import { fromStored, toStored } from "../configStore";
import type { AnalysisConfig } from "../analysis";

const cfg: AnalysisConfig = {
  version: 1,
  fixedVendors: ["200"],
  excludedVendors: ["300"],
  masaderVendors: ["400"],
  exceptions: { "226091733|INV/1.5|-703079.18": "none", "1|2|3.00": "Filtered" },
  vendorNames: { "200": "Fixed Co" },
  learnedFrom: "Analysis.xlsx",
  learnedAt: 1,
};

/** Firestore rejects arrays inside arrays and `undefined` values. */
function firestoreSafe(v: unknown, inArray = false): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return !inArray && v.every((x) => firestoreSafe(x, true));
  if (v && typeof v === "object") return Object.values(v).every((x) => firestoreSafe(x, false));
  return true;
}

describe("stored Analysis lists", () => {
  it("can be saved by Firestore (no nested arrays, no undefined)", () => {
    expect(firestoreSafe(toStored(cfg))).toBe(true);
    expect(firestoreSafe(toStored({ ...cfg, learnedFrom: undefined, learnedAt: undefined }))).toBe(true);
  });
  it("round-trips", () => {
    expect(fromStored(JSON.parse(JSON.stringify(toStored(cfg))))).toEqual(cfg);
  });
  it("still reads the older [key, place] pairs kept on devices", () => {
    const old = { ...toStored(cfg), exceptionList: [["1|2|3.00", "Filtered"], ["bad", "nowhere"]] };
    expect(fromStored(old)?.exceptions).toEqual({ "1|2|3.00": "Filtered" });
  });
  it("ignores junk", () => {
    expect(fromStored(null)).toBeNull();
    expect(fromStored({ hello: 1 })).toBeNull();
  });
});
