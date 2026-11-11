import { addDays, todayISO } from "../dates";
import { statusFor, type Case, type Vendor } from "../types";

/** Deterministic demo data spanning the last ~12 months. */
export function buildSampleData(today = todayISO()): { vendors: Vendor[]; cases: Case[] } {
  const now = Date.now();
  const vendorSeeds: Array<[string, string, string, string]> = [
    ["المصرية للتغليف", "Egyptian Packaging Co.", "10532", "م. أحمد سمير — 01001234567"],
    ["النيل للكيماويات", "Nile Chemicals", "10877", "أ. منى عادل — 01112223344"],
    ["الدلتا للنقل", "Delta Logistics", "11204", ""],
    ["العربية للبلاستيك", "Arab Plastics", "10415", "مكتب المبيعات — 0223456789"],
    ["مصر للمعادن", "Misr Metals", "12090", ""],
    ["الشرق للأحبار", "El Sharq Inks", "10961", ""],
  ];
  const vendors: Vendor[] = vendorSeeds.map(([nameAr, nameEn, code, contact], i) => ({
    id: `demo-v${i + 1}`,
    nameAr, nameEn, code, contact,
    notes: i === 0 ? "مورد استراتيجي — كرتون مضلع" : "",
    createdAt: now - (400 - i) * 86_400_000,
    updatedAt: now - (400 - i) * 86_400_000,
  }));

  const issues: Array<[string, string, string]> = [
    ["تأخير توريد الخامات", "متابعة مع المورد", "المورد وعد بالتوريد خلال أسبوع"],
    ["فرق سعر في الفاتورة 801,000", "مراجعة مع الحسابات", "تم إصدار إشعار خصم"],
    ["مرتجع تالف", "استبدال الشحنة", ""],
    ["شهادة تحليل ناقصة", "طلب الشهادة من المورد", "تم الاستلام بالإيميل"],
    ["اختلاف الكمية عن أمر الشراء", "تسوية الكمية", "عجز 120 كرتونة"],
    ["تأخير في الدفع للمورد", "متابعة مع الخزينة", "المديونية 1,250,000"],
    ["تحديث بيانات المورد على SAP", "إرسال الفورم للـ Master Data", ""],
    ["مشكلة جودة في اللون", "زيارة المصنع", "تم أخذ عينات"],
    ["تجديد العقد السنوي", "تفاوض على الأسعار", "زيادة 7% مقترحة"],
  ];

  const cases: Case[] = [];
  let seq = 0;
  for (let k = 0; k < 42; k++) {
    const v = vendors[(k * 7) % vendors.length];
    const [title, task, comment] = issues[(k * 5) % issues.length];
    const start = addDays(today, -((k * 9) % 360) - 2);
    const open = k % 4 === 0 || k < 3;
    const duration = 1 + ((k * 13) % 25);
    const end = open ? null : addDays(start, duration) > today ? today : addDays(start, duration);
    const id = `demo-c${++seq}`;
    cases.push({
      id, vendorId: v.id, case: title, taskBar: task, startDate: start, endDate: end,
      comments: comment, status: statusFor(end), audioUrl: null, transcript: "",
      createdAt: now - k * 3_600_000, updatedAt: now - k * 3_600_000,
    });
  }
  return { vendors, cases };
}
