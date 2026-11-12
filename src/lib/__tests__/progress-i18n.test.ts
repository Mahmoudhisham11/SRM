import { describe, expect, it } from "vitest";
import { crossedMilestone, milestoneAfter, notebookStats } from "../progress";
import { MESSAGES, translate } from "../i18n/messages";
import { splitCommands } from "../voice/commands";
import { statusFor, type Case } from "../types";

const at = (iso: string, hour = 10) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00`).getTime();
let n = 0;
const mk = (startDate: string, createdISO: string): Case => ({
  id: `c${++n}`, vendorId: "v", case: "x", taskBar: "", startDate, endDate: null, comments: "",
  status: statusFor(null), audioUrl: null, transcript: "", createdAt: at(createdISO), updatedAt: 0,
});

describe("notebookStats", () => {
  const today = "2026-11-12";
  const cases = [
    mk("2025-01-10", "2026-11-12"),
    mk("2025-01-20", "2026-11-12"),
    mk("2025-03-05", "2026-11-11"),
    mk("2025-04-01", "2026-11-10"),
    mk("2026-02-01", "2026-11-08"), // other year; gap on the 9th breaks the streak
  ];
  const s = notebookStats(cases, 2025, today);
  it("counts the year's cases and filled months", () => {
    expect(s.total).toBe(4);
    expect(s.monthsFilled).toBe(3);
    expect(s.months.slice(0, 4)).toEqual([true, false, true, true]);
  });
  it("streak and today", () => {
    expect(s.loggedToday).toBe(2);
    expect(s.streak).toBe(3); // 12, 11, 10
    expect(notebookStats(cases, 2025, "2026-11-13").streak).toBe(3); // nothing yet today: count from yesterday
    expect(notebookStats(cases, 2025, "2026-11-15").streak).toBe(0);
  });
  it("milestones", () => {
    expect(s.nextMilestone).toBe(50);
    expect(s.toNextMilestone).toBe(46);
    expect(milestoneAfter(142)).toBe(150);
    expect(milestoneAfter(150)).toBe(200);
    expect(crossedMilestone(149, 150)).toBe(150);
    expect(crossedMilestone(150, 151)).toBeNull();
    expect(crossedMilestone(0, 1)).toBeNull();
    expect(crossedMilestone(9, 10, 10)).toBe(10);
  });
});

describe("i18n", () => {
  it("translates with gender and variables", () => {
    expect(translate("ar", "f", "voice.prompt.case", { field: "Case" })).toBe("قولي الـ Case");
    expect(translate("ar", "m", "voice.prompt.case", { field: "Case" })).toBe("قول الـ Case");
    expect(translate("en", "f", "voice.prompt.case", { field: "Case" })).toBe("Say the Case");
    expect(translate("ar", "f", "greet.morning", { name: "نور" })).toBe("صباح الخير يا نور");
  });
  it("every entry has both languages (and both genders when gendered)", () => {
    for (const [key, e] of Object.entries(MESSAGES)) {
      expect(typeof e.en, key).toBe("string");
      if (typeof e.ar !== "string") {
        expect(e.ar.f.length, key).toBeGreaterThan(0);
        expect(e.ar.m.length, key).toBeGreaterThan(0);
      } else expect(e.ar.length, key).toBeGreaterThan(0);
    }
  });
});

describe("feminine voice commands", () => {
  it("امسحي / احفظي / ارجعي / فوتي", () => {
    expect(splitCommands("امسحي").trailing).toEqual(["clear"]);
    expect(splitCommands("احفظي").trailing).toEqual(["save"]);
    expect(splitCommands("ارجعي").trailing).toEqual(["back"]);
    expect(splitCommands("فوتي").trailing).toEqual(["skip"]);
  });
});

import { closest, similarity } from "../fuzzy";

describe("fuzzy vendor suggestion", () => {
  const vendors = [
    { name: "الدلتا للنقل", en: "Delta Logistics", code: "11204" },
    { name: "النيل للكيماويات", en: "Nile Chemicals", code: "10877" },
  ];
  const labels = (v: (typeof vendors)[number]) => [v.name, v.en, v.code];
  it("suggests the closest vendor for a misspelling", () => {
    expect(closest("دلتة", vendors, labels)?.code).toBe("11204"); // ة/ا confusion
    expect(closest("nile chemical", vendors, labels)?.code).toBe("10877");
    expect(closest("1120", vendors, labels)?.code).toBe("11204");
  });
  it("returns null when nothing is close", () => {
    expect(closest("xyz", vendors, labels)).toBeNull();
  });
  it("similarity is symmetric and 1 for equal", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("دلتا", "الدلتا")).toBeCloseTo(similarity("الدلتا", "دلتا"));
  });
});
