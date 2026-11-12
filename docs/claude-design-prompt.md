# Design brief: SRM Voice Log — bilingual (Arabic / English), voice-first, mobile-first

## 1. What this is
SRM Voice Log is a working web app (Next.js + Tailwind, already built and functional). A supplier-relationship (SRM) specialist at an Egyptian manufacturing company uses it to log daily supplier issues **by voice**, in Egyptian Arabic.
Today the team logs issues in an Excel sheet with these columns: **Case | Task Bar | Start Date | End Date | Comments** (dates as DD-MMM-YYYY). The app replaces typing with dictation and exports back to that same Excel format.

I need a complete redesign: a design system plus every screen, ready for a developer to implement. The current version works but looks generic. Use the attached screenshots for structure only; don't copy the look.

## 2. Who uses it
- **Primary user:** a young woman on our SRM team. She'll use it more than anyone, mostly on her phone (Android, Chrome) and sometimes on a laptop.
- **Two jobs:**
  1. Back-filling about a year of paper-notebook entries. These are long sessions, dozens of cases in a row, mostly hands-free.
  2. Quick daily logging between calls and meetings.
- She should *love* opening it. It must feel personal, warm and motivating, not like enterprise software.
- Her name (for greetings): ______ · Her favourite colours: ______ · Things she likes: ______

## 3. Visual direction: feminine, elegant, professional
- Feminine and soft but still credible at work. Think of a beautifully designed premium planner or journal app, not a cartoon or a kids' app. No "pink everything", no glitter overload.
- **Palette idea (refine freely):**
  - Base atmosphere: blush/rose and soft lavender.
  - Primary action colour: a deeper berry, plum or mauve, for contrast and seriousness.
  - Surfaces: warm cream / off-white instead of pure white.
  - Supporting accents: gentle peach and sage.
- **Status colours** must stay clearly distinct: open = warm amber/peach, closed = sage/mint green, error = soft but clear rose-red. Never use colour alone; always add an icon or label.
- **Shapes and depth:**
  - Generous rounded corners (16–28px cards, pill buttons) and soft layered shadows.
  - Subtle gradients and blurred "glow" blobs in backgrounds.
  - Thin, delicate line icons with rounded caps.
- **Decoration, used sparingly:** small sparkles, petals, soft hand-drawn underlines, and a tiny botanical line illustration for empty states.
- **Typography:**
  - One family that renders BOTH Arabic and Latin beautifully and feels soft/rounded, e.g. Readex Pro, Alexandria, IBM Plex Sans Arabic, or Tajawal + Plus Jakarta Sans.
  - Optionally an elegant display face for English headings only.
  - It must stay very legible in data tables, with tabular numerals for dates and amounts.
- **Contrast:** all text must meet WCAG AA on its background. Pastels are for surfaces and decoration, never for text.
- **Themes:** a light theme (main) and a dark "evening" theme (deep plum/aubergine, not pure black). Also 3–4 accent themes she can choose in Settings (e.g. Rose, Lavender, Peach, Sage).

## 4. Bilingual: Arabic & English
- **Language switch:** the full UI works in **Arabic (RTL, default)** and **English (LTR)**. Switch from the header (an animated "ع / EN" toggle) and from Settings. Design every key screen in both directions.
- **Mirror correctly:** layout, directional icons (arrows, chevrons, back), steppers, swipe directions.
- **Do NOT mirror:** chart time axes (left→right), dates (15-Mar-2025), vendor codes, amounts.
- **Field labels:** Case / Task Bar / Start Date / End Date / Comments stay in **English in both languages** because they match the Excel headers. In the Arabic UI, add a small Arabic hint under each.
- **Arabic tone:**
  - Friendly Egyptian Arabic for conversational text (prompts, empty states, success messages); clear and short for buttons.
  - Address her in the feminine form: «قولي الـ Case»، «اضغطي»، «اتحفظت ✓ — يلا اللي بعدها»، «لسه مفيش موردين».
  - Add a Settings option for form of address (feminine / masculine / neutral).
- **Dictation language** is separate from UI language: Egyptian Arabic (ar-EG) by default, English as an option.

## 5. Screens to design
Design each at mobile 390px and desktop 1280–1440px, in Arabic RTL and English LTR, with all states.

1. **Sign-in:** Google sign-in only. A lovely first impression: app mark, tagline, a soft animated blob or illustration.
2. **Home / Vendors:**
   - A greeting with her name and time of day («صباح الخير يا ___ ☀️»).
   - Today's stats: cases logged today and open cases.
   - The back-fill progress widget (see §7).
   - Instant search by vendor name or code.
   - Vendor cards: a monogram avatar in a soft per-vendor colour, Arabic/English name, a code chip (e.g. 10532), and a mini open/closed bar.
   - Primary "Add vendor" action.
   - Empty, loading-skeleton and no-results states.
3. **Add / Edit vendor:** a bottom sheet on mobile, a modal on desktop.
   - Fields: name (Arabic), name (English), vendor code, contact, notes.
   - Inline validation, e.g. a duplicate vendor code.
4. **Vendor page:**
   - Header: name, code, contact.
   - The big mic as the hero.
   - Case history as compact rows (status dot, case title, dates, task) that expand into the full editable card.
   - Search and an open/closed filter.
   - Delete-vendor confirmation that warns all its cases will be deleted.
5. **Voice logging session — THE CORE SCREEN. Spend the most effort here.**
   - **Mic button:**
     - Idle: big, inviting.
     - Listening: a living, organic blob or aura that reacts to her voice volume in real time (we can provide the live mic level). Not just a ping.
     - Also design paused and disabled states.
   - **Guided mode (default):**
     - The app asks one field at a time: Case → Task Bar → Start Date → End Date → Comments → review.
     - Show a 5-step progress (beads, petals or a stepper) with the current step highlighted.
     - The prompt appears in large friendly text («قولي الـ Task Bar»).
     - A live transcript area shows interim words fading in as she speaks.
     - The 5 fields are stacked below and fill as she talks. Each is also editable by keyboard.
   - **Voice commands:**
     - She can say «التالي» (next), «تخطي» (skip), «رجوع» (back), «امسح» (clear field) and «حفظ» (save).
     - Show them as subtle chips. When one is recognised, its chip flashes so she knows it was heard.
   - **Date fields** show what she said («خمستاشر تلاتة») AND the parsed result as a chip «15-Mar-2025 ✓». If parsing fails, show a gentle warning («مش فاهم التاريخ») with a calendar fallback.
   - **Free mode:**
     - She says everything in one sentence («كيس … تاسك … من 15 مارس لحد 20 مارس … ملاحظة …») and the transcript fills.
     - On «حفظ», the parsed words visibly *fly* into their fields before saving.
   - **Session settings:** Guided/Free toggle, a "default year" selector for back-filling (e.g. 2025), and a "keep original audio" toggle. Keep these compact so the mic and prompt stay at the top on a phone.
   - **States:**
     - listening, paused, saving
     - mic permission denied
     - no internet for speech recognition
     - unsupported browser ("use Chrome or Edge"), with the keyboard fallback
     - offline ("saved on this phone, will sync")
6. **Review cards (session list):** every saved case appears as an editable card showing:
   - Case, Task Bar, Start/End Date, Comments
   - a status badge and duration in days
   - an audio player for the original recording, with a mini waveform
   - a "what I heard" transcript toggle
   - a mic per field to re-dictate just that field, tap-to-edit inline, and delete
7. **Back-fill progress & motivation:** she is digitising a year of notebooks.
   - Design a widget such as «دفتر 2025» with a progress ring or a notebook that fills up.
   - Show cases this session and a streak of days.
   - Celebrate milestones (10 / 50 / 100 cases). Tasteful gamification: rewarding, never childish.
8. **Reports:**
   - Filter bar: keyword, vendor, status, date range.
   - Stat tiles: total, open, closed, average resolution days.
   - A cases-per-month column chart and a cases-per-vendor bar chart, with tap/hover tooltips.
   - A full sortable table.
   - Export buttons (Excel, CSV) with an "include Vendor column" toggle.
   - On mobile, decide between a card list and a scrollable table.
9. **Manager report:**
   - Date presets: this week, this month, last month, custom.
   - A printable summary: totals plus a table grouped by vendor, and Print / Save PDF.
   - **IMPORTANT:** the printed/PDF version must be neutral, formal and black-and-white friendly, because it goes to her manager. The feminine styling is for the screen only.
10. **Settings:** language, theme/accent, light/dark, dictation language, form of address, her name for greetings, sign out.
11. **System pieces:** toasts (success/error/info), confirm dialogs, bottom sheets, empty states with small illustrations, skeleton loaders, error-with-retry, an offline banner, a demo-mode banner.

## 6. Motion & interaction (very important)

### Signature moment: saving a case
When she says «حفظ» or taps Save:
1. The fields compress into one card.
2. The card lifts with a soft spring and a checkmark draws itself.
3. A small burst of sparkles or petals plays (subtle, about 600ms).
4. The card flies or morphs into the top of the session list below.
5. "Today" counts up with a rolling number, the back-fill ring advances, and the phone gives a short haptic.
6. The form resets with a gentle cascade, and the mic is ready for the next case immediately.

The whole sequence must take **≤ 900ms and never block her**. She may log 30 cases in a row and can start speaking during the animation.

Milestones (every 10th case, 50, 100) get a slightly bigger celebration and a friendly message.

### Micro-interactions
- **Moving to the next field:** the active field glides into focus, the stepper bead fills, and a light haptic plays.
- **Live transcript:** words fade or blur in as they're recognised; interim words are lighter and settle into full colour when final.
- **Command recognised:** the matching chip pulses.
- **Validation error:** a gentle shake, a rose highlight and a friendly message. No harsh red flash.
- **Parsed date chip:** pops in with a tiny bounce.
- **Vendor cards:** lift on hover (desktop), scale on press (mobile); lists stagger in.
- **Case rows on mobile:** swipe to close a case (End Date = today) and swipe to delete with Undo.
- **Charts and numbers:** bars grow from the baseline and numbers count up.
- **Language toggle:** a smooth crossfade or direction flip, not a hard jump.
- **Desktop power features:** a Ctrl/Cmd+K command palette (go to vendor, new case, export) and shortcuts: Enter = next field, Ctrl+Enter = save, Space = toggle mic.

### Motion spec to deliver
- Durations, easing curves / spring settings and stagger values.
- Fast and soft: 150–350ms for UI, springs for cards.
- Respect `prefers-reduced-motion`: replace motion with simple fades.
- Animation must never delay data entry.

## 7. Realistic content for mockups

**Vendors (fictional):**

| Arabic name | English name | Code |
|---|---|---|
| المصرية للتغليف | Egyptian Packaging Co. | 10532 |
| النيل للكيماويات | Nile Chemicals | 10877 |
| الدلتا للنقل | Delta Logistics | 11204 |
| العربية للبلاستيك | Arab Plastics | 10415 |

**Example cases:**

| Case | Task Bar | Start Date | End Date | Comments |
|---|---|---|---|---|
| تأخير توريد الخامات | متابعة مع المورد | 15-Mar-2025 | 20-Mar-2025 | المورد وعد بالتوريد خلال أسبوع |
| فرق سعر في الفاتورة 801,000 | مراجعة مع الحسابات | 02-Apr-2025 | — (still open) | |

Other example case titles: «شهادة تحليل ناقصة», «مرتجع تالف», «تجديد العقد السنوي».

**Case fields:**
- Case (required)
- Task Bar
- Start Date (required)
- End Date (optional; when set, the case is closed)
- Comments
- status (open / closed)
- original audio and transcript

**Dates:** always DD-MMM-YYYY (15-Mar-2025) with Latin digits, in both languages.

## 8. Deliverables
1. **Design system:**
   - colour tokens (light, dark and each accent theme) with hex values
   - type scale for Arabic and English
   - spacing, radii, shadows, iconography style
   - motion tokens

   Name tokens so they map directly to CSS variables and a Tailwind CSS v4 `@theme`.
2. **Component library with all states:** buttons, inputs, date field with parsed chip, mic button (idle / listening / paused / disabled), stepper, transcript box, command chips, vendor card, case row (compact / expanded), review card, audio player, stat tile, charts, table, filter bar, toast, dialog/sheet, empty / loading / error states, language toggle, theme picker, command palette.
3. **All screens in §5:** mobile and desktop, Arabic RTL and English LTR. Light and dark for the key screens (home, logging session, review card).
4. **A clickable prototype or storyboard** of the guided-dictation flow and the save-a-case moment, with the motion spec.
5. **Developer notes:** the app is Next.js (App Router) + TypeScript + Tailwind CSS v4, and animations will be built with Motion (Framer Motion). Keep everything implementable with web tech: CSS, SVG, and optionally Lottie for celebrations.

## 9. Constraints
- **Mobile-first:** thumb-reachable primary actions, tap targets ≥ 44px, no horizontal page scroll at 360px width.
- **Long sessions:** comfortable one-handed and hands-free use, low eye strain.
- **Accessibility:** AA contrast, visible focus states, labelled controls, never colour-only meaning, reduced-motion support.
- **Exports stay formal:** the Excel export and the printed manager report stay neutral and professional.
