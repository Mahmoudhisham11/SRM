# SRM Voice Log

Log daily supplier-relationship (SRM) work **by voice**, in Egyptian Arabic, from your phone or laptop.
Built for back-filling a year of notebook entries quickly, then for day-to-day logging.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Motion (animations) · lucide icons · Firebase (Google sign-in, Firestore, Storage) · exceljs · Vitest.

**Bilingual:** full Arabic (RTL, default) and English (LTR) UI, switched from the «EN | ع» toggle and remembered per device. The five field labels (Case, Task Bar, Start Date, End Date, Comments) stay in English in both languages to match the `SRM_Issues_Log.xlsx` headers. Arabic text addresses the user in the feminine form («قولي»، «اضغطي»); this can be switched to masculine in **Settings**.

**Design:** "Rose & Berry" light theme plus an "Evening" dark theme (or Auto). Readex Pro for Arabic and Latin text, with Fraunces for English headings. Every screen is mobile-first: a bottom bar with a center mic on phones, a sidebar on desktop.

---

## Features

| Area | What you get |
|---|---|
| **Vendors** | Add, edit and delete vendors (Arabic/English name, code such as `10532`, contact, notes). Instant search by name or code; it ignores spelling variants (أ/ا، ة/ه، ى/ي) and accepts Arabic-Indic digits. The vendor page lists all of that vendor's cases. |
| **Voice logging** | Open a vendor, press the big mic and dictate. **Guided mode** asks one field at a time. **Free mode** takes the whole case in one sentence. Hands-free: «حفظ» saves and starts the next case right away. |
| **Parsing** | Spoken dates (`15 مارس`, `15/3`, `خمستاشر تلاتة`, `النهارده`, `امبارح`, `اول امبارح`, `آخر فبراير`, English months, Arabic-Indic digits) and amounts (`801 ألف` → 801,000, `مليون وربع` → 1,250,000). A session-level **default year** applies to back-filled dates spoken without a year. |
| **Review** | Each saved case shows as an editable card. Tap a field to fix it by keyboard, or tap its mic to re-dictate just that field. The original audio is kept so you can replay it. |
| **Reports** | One table of all cases with search, sorting and filters (vendor, date range, status, keyword). Summary tiles, cases per month and per vendor, and average resolution time. |
| **Manager report** | This week / this month / last month / custom range. Shows totals plus a table grouped by vendor. **Print / Save as PDF.** |
| **Export** | **Excel** in the SRM_Issues_Log format (`Case | Task Bar | Start Date | End Date | Comments`, `DD-MMM-YYYY`, Arial 10, optional **Vendor** column), plus **CSV**. |
| **Experience** | Greeting with her name, today's count, and a «دفتر 2025» notebook ring (one petal per month), day streak and next milestone. The mic's aura follows her voice level, the chip for a recognised command flashes, and on save a check draws itself with a sparkle burst while the case drops into the session list. Milestones get a petal burst. Swipe a history row to close it today or delete it (with Undo). The phone vibrates on save and on field changes. Everything respects "reduce motion". |
| **Quality** | Per-user security rules, offline-tolerant (Firestore cache with queued writes), and loading, empty and error states. About 210 unit tests for the parsers, reports and export, plus 11 security-rules tests against the Firebase emulators. |

---

## 1. Try it in 1 minute (demo mode, no Firebase)

```bash
npm install
npm run dev
```

Open http://localhost:3000 in **Chrome or Edge**. Without Firebase settings the app runs in **demo mode**: data stays in this browser only, and there's a «تحميل بيانات تجريبية» button that loads sample data.

---

## 2. Firebase setup

1. **Create a project** at https://console.firebase.google.com.
2. **Authentication** → *Get started* → *Sign-in method* → enable **Google**.
3. **Firestore Database** → *Create database* → **production mode**. Pick a nearby location, e.g. `europe-west1` or `me-central1`.
4. **Storage** → *Get started*. This holds the original audio clips.
   > Cloud Storage for Firebase needs the **Blaze (pay-as-you-go)** plan on new projects. It still has a free monthly allowance, and short voice clips are tiny (≈ 5–15 KB per case).
   > If you'd rather stay on the free Spark plan, skip Storage and untick «احفظ الصوت الأصلي» in the logger. Everything else works without it.
5. **Project settings → Your apps → Web app (`</>`)** → register an app and copy its config.
6. Copy `.env.example` to `.env.local` and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
   NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123
   ```

   These values are public by design: they identify the project. Security comes from the rules in step 7.
7. **Deploy the security rules:**

   ```bash
   npx firebase-tools login
   npx firebase-tools use --add          # choose your project
   npx firebase-tools deploy --only firestore:rules,storage
   ```

8. Restart `npm run dev` and sign in with Google.

### Data layout and rules

```
users/{uid}/vendors/{vendorId}      Vendor
users/{uid}/cases/{caseId}          Case (flat, with vendorId, so reports read one collection)
storage: users/{uid}/audio/{caseId} original recording
```

- `firestore.rules` lets each user read and write **only** `users/{their uid}/…`. It also validates every case: a required Case, ISO dates, **End Date ≥ Start Date**, and `status` = `closed` exactly when End Date is set.
- `storage.rules`: owner-only, audio content types only, 20 MB max.

---

## 3. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. On https://vercel.com → **Add New… → Project** → import the repository. The framework is detected as Next.js; the defaults are fine.
3. Under **Environment Variables**, add the six `NEXT_PUBLIC_FIREBASE_*` values from `.env.local`.
4. **Deploy.**
5. In Firebase → **Authentication → Settings → Authorized domains**, add your Vercel domain (for example `srm-voice-log.vercel.app`, plus any custom domain). Google sign-in won't work on that domain without this step.

Voice and microphone only work over **HTTPS**, which Vercel provides, or on `localhost`.

---

## 4. Using it

### Guided mode (default)

The app asks for each field in turn: **Case → Task Bar → Start Date → End Date → Comments**. Speak, then say a command:

| Say | Effect |
|---|---|
| «التالي» | next field |
| «تخطي» | clear this field and move on (e.g. no End Date yet) |
| «رجوع» | previous field |
| «امسح» / «امسحي» | clear the current field |
| «حفظ» / «احفظي» | validate, save, and **start the next case immediately** |

The commands also show as tappable chips, and the one just heard flashes. Feminine forms («ارجعي»، «فوتي») and English («next», «skip», «back», «clear», «save») work too.

Commands count only at the **end** of what you said («…الخامات التالي»), or at the start for navigation. That way «الشهر التالي» or «حفظ المستندات» inside a sentence stays as text.

### Free mode

Say everything at once, then «حفظ»:

> «كيس تأخير توريد الخامات تاسك متابعة مع المورد من 15 مارس لحد 20 مارس ملاحظة المورد وعد بالتوريد»

| Field | Keywords |
|---|---|
| Case | كيس، الكيس، case. Text before any keyword also counts as the Case. |
| Task Bar | تاسك، تاسك بار، task، مهمة |
| Start Date | من، بداية، تاريخ البداية، بدأ، start. These only count when a date follows them, so «طلب من المورد» stays text. |
| End Date | لحد، لغاية، إلى، حتى، نهاية، خلص، اتقفل، end |
| Comments | ملاحظة، ملاحظات، كومنت، تعليق، comment |

If something is missing, for example a Start Date, the parsed fields stay on screen with the problem highlighted, ready to fix.

### Dates and numbers it understands

- `15 مارس` · `١٥ مارس ٢٠٢٤` · `15/3` · `15-3-2024` · `15/3/24` · `2024-03-15` · `15 من مارس` · `March 15`
- `خمستاشر تلاتة` (15/3) · `واحد وعشرين اتناشر` (21/12) · `خمسة عشر شهر تلاتة` · `15 شهر 3`
- `النهارده` · `امبارح` · `اول امبارح` · `بكرة` · `أول مارس` · `آخر فبراير`
- Year: `… 2024` · `… سنة 24` · `… الفين اربعة وعشرين`. Without a year, the **default year** selector applies.
- Amounts inside text: `801 ألف` → `801,000`, `مليون وربع` → `1,250,000`, `ربع مليون` → `250,000`, `ألف ونص` → `1,500`. Plain words like «واحد من الموردين» are left alone.
- Note: in Egyptian speech «تلاتة عشرة» is read as **day 3, month 10**. Say «تلتاشر» for 13.

### Back-filling last year

Set **السنة الافتراضية** to the notebook's year. It stays set for this browser session only, so it won't leak into tomorrow's normal logging. Use guided mode and keep going case after case with «حفظ».

### Keyboard

Every field is a normal input. In guided mode, **Enter** moves to the next field, and Enter on the last field saves. **Ctrl/⌘+Enter** saves from anywhere, and **Space** pauses or resumes the mic. Date fields also have a calendar picker.

### Settings

Name used in the greeting · language · appearance (Light / Evening / Auto) · Arabic form of address · dictation language (Arabic-Egypt or English) · sign out.

### Browser support

Speech recognition needs **Google Chrome** or **Microsoft Edge**, on desktop or Android. Other browsers (Firefox, and Safari in most versions) show a clear notice, and the keyboard still works. Chrome's recognizer runs on Google's servers, so **dictation needs internet**. Offline, keep logging by keyboard.

### Offline

Firestore keeps a local cache. Cases you save offline appear immediately and sync when the connection returns (tested). Audio uploads need a connection; if one fails, the case is still saved and you'll see a message.

---

## 5. Excel export format

`Reports → Excel` exports the cases currently shown (with the current filters and sort):

- Sheet **SRM Issues Log**, columns in this order: **Case | Task Bar | Start Date | End Date | Comments**, plus **Vendor** last when «عمود Vendor» is ticked. It's appended at the end so the original column positions don't change.
- Every cell is **Arial 10**. The header row is bold, frozen, and has an AutoFilter.
- Dates are **real Excel dates** formatted `[$-409]dd-mmm-yyyy` (e.g. `15-Mar-2025`), so they sort and filter as dates. The `[$-409]` prefix keeps English month names even on Arabic Windows.

> The original `SRM_Issues_Log.xlsx` wasn't available while this was built. The layout follows the description: same columns, order, date format and font. To match details such as column widths, header styling or the sheet name, adjust `src/lib/export/excel.ts`. `src/lib/__tests__/reports.test.ts` checks the format.

CSV is UTF-8 with BOM, so Excel shows Arabic correctly. Dates are `DD-MMM-YYYY` text.

---

## 6. Plugging in an LLM parser later

Free-mode parsing sits behind an interface (`src/lib/parsing/caseParser.ts`):

```ts
export interface CaseParser {
  readonly id: string;
  readonly label: string;
  parse(transcript: string, ctx: DateContext): Promise<ParsedCase>;
}
```

To add one, implement it. Typically you'd call your own API route so the API key stays on the server. Then register it:

```ts
class LlmCaseParser implements CaseParser {
  readonly id = "llm";
  readonly label = "LLM";
  async parse(transcript: string, ctx: DateContext): Promise<ParsedCase> {
    const res = await fetch("/api/parse-case", { method: "POST", body: JSON.stringify({ transcript, ctx }) });
    if (!res.ok) return ruleBasedParser.parse(transcript, ctx); // fall back to rules
    return res.json();
  }
}
CASE_PARSERS.llm = new LlmCaseParser();
```

…and pass `"llm"` to `getCaseParser(...)` in `VoiceLogger.tsx`. The UI, validation and saving stay unchanged. A good pattern is to run the LLM output's dates back through `parseSpokenDate` and validation.

---

## 7. Development

```bash
npm run dev          # http://localhost:3000
npm test             # unit tests: Arabic date/number parsers, voice commands, guided flow, free-mode parser, reports, Excel/CSV
npm run test:rules   # security-rules tests on the Firebase emulators (needs Java; fetches firebase-tools via npx)
npm run lint
npm run build
```

### Running against the local Firebase emulators

```bash
npm run emulators    # auth, firestore, storage on 127.0.0.1
```

Then create `.env.local` with any demo values plus the emulator switch, and run `npm run dev`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-srm-voice-log.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-srm-voice-log
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-srm-voice-log.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1
NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1
```

### Project structure

```
src/
  app/                      routes: / (vendors), /vendor?id=, /reports, /reports/manager
  components/
    AppShell.tsx            top bar + bottom nav (phone), sidebar (desktop), vendor picker, sign-in
    ui.tsx                  design-system primitives (buttons, fields, sheet, segmented, toggles…)
    providers/              auth + data repository, toasts, motion config
    home/                   greeting, stats, notebook ring, vendor cards
    vendors/                vendor page, vendor form sheet
    cases/                  case card (compact row ↔ review card, swipe actions), audio player
    voice/                  VoiceLogger, mic orb, stepper, chips, transcript, field cards, save burst
    reports/                reports page, manager report, charts
    settings/               settings page
  hooks/                    live Firestore subscriptions, voice preferences
  lib/
    parsing/                normalize · numbers · arabicDates · caseParser (+ tests)
    voice/                  speech (Web Speech API), recorder (MediaRecorder), commands, guided state machine (+ tests)
    data/                   DataRepo interface · FirestoreRepo · LocalRepo (demo) · sample data
    export/                 excel (exceljs) · csv
    i18n/                   all UI text (Arabic f/m + English) and the useI18n hook
    reports.ts, progress.ts, fuzzy.ts, dates.ts, validation.ts, types.ts
firestore.rules, storage.rules, firebase.json
tests/rules.test.ts         security-rules tests (emulators)
```
