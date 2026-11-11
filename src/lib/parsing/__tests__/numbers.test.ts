import { describe, expect, it } from "vitest";
import { parseArabicNumber, replaceSpokenNumbers } from "../numbers";
import { normalizeArabic, toLatinDigits } from "../normalize";

describe("toLatinDigits / normalizeArabic", () => {
  it("converts Arabic-Indic and Persian digits", () => {
    expect(toLatinDigits("١٠٥٣٢")).toBe("10532");
    expect(toLatinDigits("۱۲۳")).toBe("123");
    expect(toLatinDigits("١٥/٣/٢٠٢٥")).toBe("15/3/2025");
    expect(toLatinDigits("٢٫٥")).toBe("2.5");
  });
  it("folds spelling variants", () => {
    expect(normalizeArabic("أكتوبر")).toBe(normalizeArabic("اكتوبر"));
    expect(normalizeArabic("مية")).toBe(normalizeArabic("ميه"));
    expect(normalizeArabic("التالى")).toBe(normalizeArabic("التالي"));
    expect(normalizeArabic("مِئَة")).toBe(normalizeArabic("مئه"));
  });
});

describe("parseArabicNumber", () => {
  const cases: Array<[string, number]> = [
    // digits
    ["801", 801],
    ["١٥٠٠", 1500],
    ["1,250,000", 1_250_000],
    ["2.5", 2.5],
    // digits + scale
    ["801 ألف", 801_000],
    ["801 الف", 801_000],
    ["٨٠١ ألف", 801_000],
    ["2.5 مليون", 2_500_000],
    ["3 مليار", 3_000_000_000],
    ["15 ألف", 15_000],
    // units / teens / tens (Egyptian)
    ["واحد", 1],
    ["اتنين", 2],
    ["تلاتة", 3],
    ["تمانية", 8],
    ["عشرة", 10],
    ["حداشر", 11],
    ["اتناشر", 12],
    ["خمستاشر", 15],
    ["تمنتاشر", 18],
    ["تسعتاشر", 19],
    ["عشرين", 20],
    ["خمسة وعشرين", 25],
    ["واحد وتلاتين", 31],
    ["تسعة وتسعين", 99],
    // MSA
    ["ثلاثة", 3],
    ["خمسة عشر", 15],
    ["اثنا عشر", 12],
    ["ثلاثة وعشرون", 23],
    ["ثلاثمائة", 300],
    ["مائتين", 200],
    // hundreds
    ["مية", 100],
    ["ميتين", 200],
    ["تلتمية", 300],
    ["خمسمية", 500],
    ["تلات مية", 300],
    ["خمس مية", 500],
    ["تلتمية وخمسين", 350],
  ];
  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => expect(parseArabicNumber(text)).toBe(expected));
  }

  const scaleCases: Array<[string, number]> = [
    ["ألف", 1_000],
    ["ألفين", 2_000],
    ["تلات تلاف", 3_000],
    ["خمس آلاف", 5_000],
    ["عشرين ألف", 20_000],
    ["خمسة وعشرين ألف", 25_000],
    ["مية ألف", 100_000],
    ["ميتين ألف", 200_000],
    ["خمسمية ألف", 500_000],
    ["تمنمية وواحد ألف", 801_000],
    ["عشرين ألف وخمسمية", 20_500],
    ["مليون", 1_000_000],
    ["مليونين", 2_000_000],
    ["تلاتة مليون", 3_000_000],
    ["مليون وربع", 1_250_000],
    ["مليون ونص", 1_500_000],
    ["مليون ونصف", 1_500_000],
    ["مليون وتلت", 1_333_333.33],
    ["مليون وتلت تربع", 1_750_000],
    ["مليونين ونص", 2_500_000],
    ["ربع مليون", 250_000],
    ["نص مليون", 500_000],
    ["تلت مليون", 333_333.33],
    ["اتنين ونص مليون", 2_500_000],
    ["ألف ونص", 1_500],
    ["مليون وخمسمية ألف", 1_500_000],
    ["مليون و250 ألف", 1_250_000],
    ["تلاتة مليون وتلتمية وخمسين ألف وميتين", 3_350_200],
    ["مليار", 1_000_000_000],
    ["مليار ونص", 1_500_000_000],
    ["ألفين خمسة وعشرين", 2_025],
    ["الفين وخمسة وعشرين", 2_025],
    ["ألفين وأربعة وعشرين", 2_024],
  ];
  for (const [text, expected] of scaleCases) {
    it(`"${text}" → ${expected}`, () => expect(parseArabicNumber(text)).toBe(expected));
  }

  it("fractions on their own", () => {
    expect(parseArabicNumber("اتنين ونص")).toBe(2.5);
    expect(parseArabicNumber("نص")).toBe(0.5);
  });

  it("rejects non-numbers and leftovers", () => {
    expect(parseArabicNumber("")).toBeNull();
    expect(parseArabicNumber("فاتورة")).toBeNull();
    expect(parseArabicNumber("801 ألف جنيه")).toBeNull();
    expect(parseArabicNumber("تسعمية تسعة وتسعين")).toBeNull(); // two numbers, not one
    expect(parseArabicNumber("وعشرين")).toBeNull();
  });

  it("does not join 'عشرة' with a preceding unit (Egyptian day + month)", () => {
    expect(parseArabicNumber("تلاتة عشرة")).toBeNull();
  });
});

describe("replaceSpokenNumbers (amounts inside free text)", () => {
  const cases: Array<[string, string]> = [
    ["فاتورة بقيمة 801 ألف جنيه", "فاتورة بقيمة 801,000 جنيه"],
    ["المديونية مليون وربع", "المديونية 1,250,000"],
    ["دفعة خمسة وعشرين ألف، والباقي بكرة", "دفعة 25,000، والباقي بكرة"],
    ["مطلوب ربع مليون قبل آخر الشهر", "مطلوب 250,000 قبل آخر الشهر"],
    ["كود المورد ١٠٥٣٢", "كود المورد 10532"],
    ["اتصلت بيهم تلات مرات", "اتصلت بيهم تلات مرات"], // no scale → untouched
    ["واحد من الموردين اتأخر", "واحد من الموردين اتأخر"],
    ["أمر شراء 4500123 بمبلغ 2.5 مليون", "أمر شراء 4500123 بمبلغ 2,500,000"],
    ["خصم ألف ونص على الفاتورة", "خصم 1,500 على الفاتورة"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}"`, () => expect(replaceSpokenNumbers(input)).toBe(expected));
  }
});
