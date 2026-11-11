import { describe, expect, it } from "vitest";
import { splitCommands } from "../commands";
import { buildDraft, guidedReducer, initialGuidedState, REVIEW_STEP, type GuidedState } from "../guided";
import { ruleBasedParser } from "../../parsing/caseParser";

const ctx = { defaultYear: 2025, today: "2026-11-11" };

describe("splitCommands", () => {
  it("trailing command", () => {
    expect(splitCommands("تأخير توريد الخامات التالي")).toEqual({ leading: [], body: "تأخير توريد الخامات", trailing: ["next"] });
  });
  it("command alone", () => {
    expect(splitCommands("تخطي")).toEqual({ leading: [], body: "", trailing: ["skip"] });
    expect(splitCommands("حفظ")).toEqual({ leading: [], body: "", trailing: ["save"] });
    expect(splitCommands("احفظ.")).toEqual({ leading: [], body: "", trailing: ["save"] });
  });
  it("spelling variants", () => {
    expect(splitCommands("التالى").trailing).toEqual(["next"]);
    expect(splitCommands("تخطى").trailing).toEqual(["skip"]);
    expect(splitCommands("اللي بعده").trailing).toEqual(["next"]);
  });
  it("several trailing commands", () => {
    expect(splitCommands("مفيش ملاحظات التالي حفظ")).toEqual({ leading: [], body: "مفيش ملاحظات", trailing: ["next", "save"] });
  });
  it("leading navigation command", () => {
    expect(splitCommands("التالي متابعة مع المورد")).toEqual({ leading: ["next"], body: "متابعة مع المورد", trailing: [] });
  });
  it("leading save is NOT a command (could be real text)", () => {
    expect(splitCommands("حفظ المستندات في الأرشيف")).toEqual({ leading: [], body: "حفظ المستندات في الأرشيف", trailing: [] });
  });
  it("mid-sentence words are text", () => {
    expect(splitCommands("التسليم الشهر التالي للطلب").trailing).toEqual([]);
  });
});

function speak(s: GuidedState, ...utterances: string[]) {
  return utterances.reduce((acc, text) => guidedReducer(acc, { type: "speech", text }), s);
}

describe("guidedReducer", () => {
  it("walks through all fields hands-free", () => {
    const s = speak(
      initialGuidedState(),
      "تأخير توريد الخامات التالي",
      "متابعة مع المورد التالي",
      "15 مارس التالي",
      "تخطي",
      "المورد وعد بالتوريد الأسبوع الجاي",
      "حفظ",
    );
    expect(s.values).toEqual({
      case: "تأخير توريد الخامات",
      taskBar: "متابعة مع المورد",
      startDate: "15 مارس",
      endDate: "",
      comments: "المورد وعد بالتوريد الأسبوع الجاي",
    });
    expect(s.step).toBe(4);
    expect(s.saveRequested).toBe(1);
    expect(s.transcript).toHaveLength(6);
  });

  it("appends multiple utterances to a text field", () => {
    const s = speak(initialGuidedState(), "تأخير توريد", "الخامات من المورد");
    expect(s.values.case).toBe("تأخير توريد الخامات من المورد");
  });

  it("replaces (not appends) a re-said date", () => {
    let s = guidedReducer(initialGuidedState(), { type: "goto", step: 2 });
    s = speak(s, "15 مارس", "16 مارس");
    expect(s.values.startDate).toBe("16 مارس");
  });

  it("back / clear / review step bounds", () => {
    let s = guidedReducer(initialGuidedState(), { type: "command", command: "back" });
    expect(s.step).toBe(0);
    s = speak(s, "حاجة غلط", "امسح");
    expect(s.values.case).toBe("");
    for (let i = 0; i < 10; i++) s = guidedReducer(s, { type: "command", command: "next" });
    expect(s.step).toBe(REVIEW_STEP);
    s = speak(s, "ملاحظة زيادة");
    expect(s.values.comments).toBe("ملاحظة زيادة");
  });

  it("reset keeps the save counter", () => {
    let s = speak(initialGuidedState(), "x حفظ");
    s = guidedReducer(s, { type: "reset" });
    expect(s.values.case).toBe("");
    expect(s.step).toBe(0);
    expect(s.saveRequested).toBe(1);
  });
});

describe("buildDraft", () => {
  it("parses dates, numbers and validates", () => {
    const { draft, errors } = buildDraft(
      { case: "فرق سعر 801 ألف", taskBar: "مراجعة الفاتورة", startDate: "خمستاشر تلاتة", endDate: "20/3", comments: "" },
      ctx,
    );
    expect(draft).toEqual({ case: "فرق سعر 801,000", taskBar: "مراجعة الفاتورة", startDate: "2025-03-15", endDate: "2025-03-20", comments: "" });
    expect(errors).toEqual({});
  });
  it("flags end before start and unparseable dates", () => {
    expect(buildDraft({ case: "x", taskBar: "", startDate: "20 مارس", endDate: "15 مارس", comments: "" }, ctx).errors.endDate).toBeTruthy();
    expect(buildDraft({ case: "x", taskBar: "", startDate: "بلا بلا", endDate: "", comments: "" }, ctx).errors.startDate).toBeTruthy();
    expect(buildDraft({ case: "", taskBar: "", startDate: "", endDate: "", comments: "" }, ctx).errors).toMatchObject({ case: expect.any(String), startDate: expect.any(String) });
  });
});

describe("RuleBasedCaseParser (free mode)", () => {
  const parse = (t: string) => ruleBasedParser.parseSync(t, ctx);

  it("full utterance with all keywords", () => {
    const r = parse("كيس تأخير توريد الخامات تاسك متابعة مع المورد من 15 مارس لحد 20 مارس ملاحظة المورد وعد بالتوريد");
    expect(r).toMatchObject({
      case: "تأخير توريد الخامات",
      taskBar: "متابعة مع المورد",
      startDate: "2025-03-15",
      endDate: "2025-03-20",
      comments: "المورد وعد بالتوريد",
    });
  });

  it("case without keyword = leading text", () => {
    const r = parse("فرق سعر في فاتورة 801 ألف تاسك مراجعة مع الحسابات بداية النهارده");
    expect(r).toMatchObject({ case: "فرق سعر في فاتورة 801,000", taskBar: "مراجعة مع الحسابات", startDate: "2026-11-11", endDate: null });
  });

  it("'من' that is not followed by a date stays as text", () => {
    const r = parse("كيس طلب شهادة من المورد من خمستاشر تلاتة");
    expect(r.case).toBe("طلب شهادة من المورد");
    expect(r.startDate).toBe("2025-03-15");
  });

  it("English keywords", () => {
    const r = parse("case late delivery task follow up start 1/2 end 10/2 comment urgent");
    expect(r).toMatchObject({ case: "late delivery", taskBar: "follow up", startDate: "2025-02-01", endDate: "2025-02-10", comments: "urgent" });
  });

  it("text after a date goes to comments; two-word markers", () => {
    const r = parse("الكيس مرتجع تالف التاسك بار استبدال تاريخ البداية امبارح والمورد وافق");
    expect(r).toMatchObject({ case: "مرتجع تالف", taskBar: "استبدال", startDate: "2026-11-10", comments: "والمورد وافق" });
  });

  it("missing fields stay empty/null", () => {
    const r = parse("مشكلة في الجودة");
    expect(r).toMatchObject({ case: "مشكلة في الجودة", taskBar: "", startDate: null, endDate: null, comments: "" });
  });
});
