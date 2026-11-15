import { describe, expect, it } from "vitest";
import { splitAtSaves, splitCommands } from "../commands";
import { buildDraft, mergeFix } from "../guided";
import { ruleBasedParser } from "../../parsing/caseParser";
import { parseSpokenDateInfo, parseSpokenEndDate, rollEndDateForward } from "../../parsing/arabicDates";

const ctx = { defaultYear: 2025, today: "2026-11-11" };
const FREE = new Set(["save", "clear"] as const);

describe("New Year rollover of the End Date", () => {
  it("free mode: «من 20 ديسمبر لحد 5 يناير» ends next January", () => {
    const r = ruleBasedParser.parseSync("كيس تأخير تاسك متابعة من 20 ديسمبر لحد 5 يناير", ctx);
    expect(r.startDate).toBe("2025-12-20");
    expect(r.endDate).toBe("2026-01-05");
  });
  it("guided mode: End Date said without a year", () => {
    const d = buildDraft({ case: "x", taskBar: "", startDate: "20 ديسمبر", endDate: "5 يناير", comments: "" }, ctx);
    expect(d.draft.endDate).toBe("2026-01-05");
    expect(d.errors.endDate).toBeUndefined();
  });
  it("a spoken year is respected (stays an error)", () => {
    const d = buildDraft({ case: "x", taskBar: "", startDate: "20 ديسمبر", endDate: "5 يناير 2025", comments: "" }, ctx);
    expect(d.draft.endDate).toBe("2025-01-05");
    expect(d.errors.endDate).toBe("err.endBeforeStart");
  });
  it("same month / long gaps are not rolled (real mistakes)", () => {
    expect(parseSpokenEndDate("15 مارس", "2025-03-20", ctx)).toBe("2025-03-15");
    expect(parseSpokenEndDate("15 فبراير", "2025-03-20", ctx)).toBe("2025-02-15");
  });
  it("knows when the year was inferred", () => {
    expect(parseSpokenDateInfo("5 يناير", ctx)).toEqual({ iso: "2025-01-05", yearInferred: true });
    expect(parseSpokenDateInfo("5/1/2026", ctx)).toEqual({ iso: "2026-01-05", yearInferred: false });
    expect(parseSpokenDateInfo("2026-01-05", ctx)?.yearInferred).toBe(false);
    expect(rollEndDateForward("2024-12-30", "2024-02-29", true)).toBe("2024-02-29"); // no 29 Feb 2025
  });
});

describe("command words stay in the text when they're ordinary speech", () => {
  it("«التالي» describing a time word is text", () => {
    expect(splitCommands("الشحنة اتأجلت للشهر التالي")).toEqual({ leading: [], body: "الشحنة اتأجلت للشهر التالي", trailing: [] });
    expect(splitCommands("الاجتماع في اليوم التالي")).toMatchObject({ trailing: [] });
  });
  it("«التالي» after a field's last word is still a command", () => {
    expect(splitCommands("متابعة مع المورد التالي").trailing).toEqual(["next"]);
    expect(splitCommands("تأخير توريد الخامات التالي").trailing).toEqual(["next"]);
  });
  it("«بعده» is text", () => {
    expect(splitCommands("كلمت المورد بعده")).toMatchObject({ body: "كلمت المورد بعده", trailing: [] });
  });
  it("verbs like «ارجع» don't navigate at the start of a sentence", () => {
    expect(splitCommands("ارجع للمورد بخصوص الفاتورة")).toEqual({ leading: [], body: "ارجع للمورد بخصوص الفاتورة", trailing: [] });
    expect(splitCommands("رجوع متابعة")).toMatchObject({ leading: ["back"] });
    expect(splitCommands("الفاتورة ارجعي").trailing).toEqual(["back"]); // verbs still work at the end
  });
  it("free mode only strips save / clear", () => {
    expect(splitCommands("الشحنة هتوصل الاسبوع التالي", FREE).body).toBe("الشحنة هتوصل الاسبوع التالي");
    expect(splitCommands("التالي متابعة مع المورد تخطي", FREE)).toEqual({ leading: [], body: "التالي متابعة مع المورد تخطي", trailing: [] });
    expect(splitCommands("ملاحظة المورد وافق حفظ", FREE).trailing).toEqual(["save"]);
  });
});

describe("splitAtSaves — several cases in one breath", () => {
  it("splits at «حفظ كيس»", () => {
    expect(splitAtSaves("كيس تأخير تاسك متابعة حفظ كيس مرتجع من 3 مارس حفظ")).toEqual(["كيس تأخير تاسك متابعة حفظ", "مرتجع من 3 مارس حفظ"]);
  });
  it("leaves «حفظ» inside text alone", () => {
    expect(splitAtSaves("كيس حفظ المستندات من 3 مارس حفظ")).toEqual(["كيس حفظ المستندات من 3 مارس حفظ"]);
    expect(splitAtSaves("")).toEqual([""]);
  });
  it("three cases", () => {
    expect(splitAtSaves("أ احفظي كيس ب save case ج")).toEqual(["أ احفظي", "ب save", "ج"]);
  });
});

describe("free mode: fixing a case that failed to save", () => {
  const first = ruleBasedParser.parseSync("كيس فاتورة متأخرة تاسك متابعة", ctx); // no Start Date → not saved
  const prev = { case: first.case, taskBar: first.taskBar, startDate: "", endDate: "", comments: "" };

  it("«من 15 مارس» only fills the Start Date", () => {
    const fixed = mergeFix(prev, ruleBasedParser.parseSync("من 15 مارس", ctx));
    expect(fixed).toEqual({ case: "فاتورة متأخرة", taskBar: "متابعة", startDate: "2025-03-15", endDate: "", comments: "" });
    expect(buildDraft(fixed, ctx).errors).toEqual({});
  });
  it("words without a keyword go to Comments, not over the Case", () => {
    const fixed = mergeFix(prev, ruleBasedParser.parseSync("المورد وعد يبعت النهارده", ctx));
    expect(fixed.case).toBe("فاتورة متأخرة");
    expect(fixed.comments).toContain("المورد وعد");
  });
  it("End Date alone is read against the existing Start Date (rollover)", () => {
    const fixed = mergeFix({ ...prev, startDate: "2025-12-20" }, ruleBasedParser.parseSync("لحد 5 يناير", ctx));
    expect(buildDraft(fixed, ctx).draft.endDate).toBe("2026-01-05");
  });
  it("the parser reports an explicit «كيس»", () => {
    expect(ruleBasedParser.parseSync("كيس جديد من 1 مارس", ctx).caseExplicit).toBe(true);
    expect(ruleBasedParser.parseSync("من 1 مارس", ctx).caseExplicit).toBe(false);
  });
});

describe("Task By keyword", () => {
  it("«تاسك باي» fills Task By", () => {
    const r = ruleBasedParser.parseSync("كيس تأخير تاسك باي أحمد من 3 مارس", ctx);
    expect(r).toMatchObject({ case: "تأخير", taskBar: "أحمد", startDate: "2025-03-03" });
  });
});
