# Knock: Requirements (MVP for HackGT 13, Impiricus track)

Deadline: Sunday Sep 27, 8:00 AM ET (hard). Devpost video required. Judged at a table expo.
Judging criteria: impact on HCP, originality, technical execution, commercial fit.

## 1. What Knock is

An in-person opt-in channel for pharma rep visits. The medical office publishes a **Door Sign** (whether it takes rep visits, which topics it wants, when). Reps ask before they drive, or scan a QR code at the front desk. Knock answers instantly: approved with a time slot, redirected to something useful, or "not now" with a redirect. Every answer is a demand signal.

- **Office:** the noise gets filtered. The office owns the app. Reps request; the office's sign decides. Reps never schedule directly.
- **Rep:** know before you go. Only visit offices that are open to you and want what you carry.
- **Differentiator:** existing tools rank doctors by value using prescribing data. Knock uses what the office declared: who is willing. "Their tools tell reps who's worth visiting. Ours tells them who's willing."

## 2. What Knock is NOT (do not build)

- Not a dashboard. No sidebars, data tables, charts, settings pages, or more than two tabs on any surface.
- Not a chatbot. No chat UI anywhere. The AI decides and writes short text; nobody chats with it.
- Not a scheduling tool for reps. Reps cannot pick arbitrary times.
- No auth, no native app, no EHR or patient data, no calendar OAuth, no billing, no maps, no charts, no dark mode, no agent-to-agent negotiation, no email digest.

## 3. Core rules (non-negotiable)

1. **Safety notices always pass.** A request with purpose `safety_notice` is always accepted. This is the only setting nobody can change.
2. **Every no comes with a redirect.** Declined and redirected answers always include one concrete next step (next open slot, drop samples at desk, virtual meeting, leave materials).
3. **Publish demand, hide rejections.** Reps may see an office's status, wanted topics, and visit days. Reps never see brand blocks, cap usage, or the reason code behind a "not now".
4. **Decisions always read the current sign.** Any edit takes effect on the very next request.
5. **Undo, never confirm.** Every change shows a toast with Undo for ~10 seconds. No confirm dialogs. Nothing is irreversible.
6. **Safe default** for a new office status: `topics`.

## 4. Surfaces and routes (no auth, separate URLs)

| Route | Who | Device | Purpose |
|---|---|---|---|
| `/` | Judges | Laptop | Landing: logo, one-line pitch, three big buttons: View as Office, View as Rep, Scan demo QR (shows the QR large) |
| `/desk` | Front desk | Laptop | Lobby Board (Today) and Our Sign. Two views only |
| `/sign` | Doctor | Any | The Door Sign with three big status buttons, edit in place, and setup flow |
| `/sign/setup` | Doctor / office manager | Any | One question per screen setup, Talk / Type switch |
| `/rep` | Rep | Phone | Fit list: stack of Door Signs sorted green / amber / grey |
| `/k/[officeId]` | Rep | Phone | QR landing. Request flow: who, what, answer |

Demo office id: `peachtree-family`. The printed QR points to `/k/peachtree-family`.

### 4.1 `/k/[officeId]` QR request flow (the demo core)

Max 3 screens, mobile first.
1. **Who:** name, company, email. Saved to localStorage as a rep id after first submit; skipped on later scans (show "Not you?" link).
2. **What are you bringing:** one-tap chips of all seeded drugs (brand name + therapeutic area), plus a chip "Safety notice". Optional purpose chips: Visit (default), Drop samples, Lunch.
3. **Answer:** whole screen turns a status color.
   - Green "You're in" + slot time ("Tuesday 12:30, 5 minutes with the team").
   - Amber "Not a visit this time" + redirect text + one big primary button for the redirect action (e.g. "Drop samples at the front desk" or "Book Thursday 12:30 instead").
   - Grey "Not now" + redirect text + button.
   - Small link under the answer: "Think we got this wrong? Leave a note" opens a Drawer with a textarea. Saved as a rep note.

### 4.2 `/desk` Lobby Board

- Header: office name, the Door Sign status pill, a quiet "Notes (n)" chip top right (opens a Drawer with rep notes; no alerts, never in the main column).
- **Today view:** single column, newest on top, like a departures board.
  - QR arrivals (`source = 'qr'`) get a full card that slides in (motion): rep name, company, drug, decision, slot. Card actions: "Approve anyway" / "Decline" (override).
  - Other requests are quiet one-line rows.
  - Updates live via Supabase realtime. No refresh.
- **Our Sign view:** the same Door Sign component as `/sign`, editable.
- Demo reset button, small, in the footer: "Reset demo" (calls `/api/demo/reset`).

### 4.3 `/sign` Door Sign (doctor)

- The Door Sign card, big. Labeled "This is what reps see."
- Three big buttons: **Open**, **Topics only**, **Closed** (ToggleGroup). Tapping one opens a two-button choice: **Just today** / **From now on**.
  - Just today writes `today_status` + `today_status_date`; it expires automatically the next day (computed on read, no cron).
- Every line on the sign is tappable to edit in place: topics wanted, visit slots, weekly cap, redirect options, brand blocks (brand blocks shown only here and on desk, labeled "Private, reps never see this").
- History line under the sign: the most recent change, e.g. "Yesterday: closed to all reps. Reopen?" with one-tap revert.
- Undo toast (Sonner) on every change.
- Link: "Set up again" goes to `/sign/setup`.

### 4.4 `/sign/setup`

- One question per screen, big buttons, Progress bar, live Door Sign preview beside or below: "This is what reps see."
- Persistent **Talk / Type** switch at the top. Both modes write to the same draft. Switching keeps answers.
- Step 1: NPI number (optional). If entered, call the NPI Registry server-side and pre-fill name, specialty, address; doctor confirms. Skip button available.
- Step 2: Status (Open / Topics only / Closed).
- Step 3: Topics wanted (chips of therapeutic areas + optional free text).
- Step 4: Visit days and times (chips for days, a few time chips) and weekly cap (stepper 0 to 10).
- Step 5: Redirect options offered (checkbox chips: Drop samples, Virtual meeting, Next open slot, Leave materials).
- Step 6: Review the sign, Save.
- **Type** mode must work first. **Talk** mode (Grok Voice) is layered on later: spoken answer is transcribed, shown as editable text, and parsed by Grok into the same fields.

### 4.5 `/rep` Fit list

- Rep picks their drugs once (chips; saved to localStorage with rep id).
- Stack of Door Sign cards for all seeded offices, sorted:
  - **Green:** effective status open, or topics and a wanted topic matches one of the rep's drug areas, and the rep's company is not blocked, and a slot is available.
  - **Amber:** open or topics but no topic match, or no slot this week.
  - **Grey (collapsed at bottom):** closed, or rep's company blocked (shown only as "Not taking visits for your products right now").
- The reason is written on the card ("Wants: GLP-1, lipids · Tue/Thu 12:30"). No filter UI.
- Tap a card: "Request a visit" goes through the same decision engine, with `source = 'fit_list'`.

## 5. Decision engine

Location: `src/lib/decide.ts`. Pure function, plain TypeScript, easy to read. No LLM inside the decision.

Input: office (with effective status), brand blocks, drug, rep, purpose, count of accepted visits this week, now.
Output: `{ decision: 'accepted' | 'redirected' | 'declined', reasonCode, slotAt | null, redirectAction | null }`.

Order of checks:
1. `purpose === 'safety_notice'` → accepted, reasonCode `safety`, no slot needed (deliver at desk).
2. Rep's company is in the office's brand blocks → declined, reasonCode `blocked`, redirect `leave_materials`.
3. Effective status `closed` → declined, reasonCode `closed`, redirect: first allowed of `drop_samples`, `leave_materials`.
4. Effective status `topics` and drug's therapeutic area is not in office topics → redirected, reasonCode `off_topic`, redirect: `virtual` if offered, else `leave_materials`.
5. Purpose `drop_samples` → accepted, no slot.
6. Find next slot this week (Mon to Sun, America/New_York) where accepted count < weekly cap. If found → accepted with slotAt. If not → redirected, reasonCode `cap_full`, slotAt = first slot next week, redirect `next_slot`.

Effective status: `today_status` if `today_status_date` equals today's date in America/New_York, else `status`.

After deciding, the API route calls Grok once to write the short, friendly redirect or confirmation text shown to the rep (1 to 2 sentences, never reveals reasonCode `blocked` or cap usage). If the Grok call fails or takes longer than 3 seconds, use a template string. The demo must never depend on the LLM responding.

## 6. Where Grok is used

Provider: xAI via Vercel AI SDK (`@ai-sdk/xai`), model name from env `XAI_MODEL`. Structured output with zod where fields are returned.
1. **Answer text:** write the 1 to 2 sentence message for the rep from `{decision, reasonCode (sanitized), redirectAction, slotAt, officeName}`. Template fallback.
2. **Setup parsing:** turn free text or a voice transcript into Door Sign fields (topics as therapeutic-area tags, days, times, cap).
3. **Talk mode:** Grok Voice for setup (later, cut at 1 AM Sunday if not working).
Grok Imagine: logo concepts only, not in the product.

## 7. Data model (Supabase Postgres)

See `supabase/schema.sql`. Tables: `offices`, `brand_blocks`, `drugs`, `reps`, `requests`, `rep_notes`, `sign_history`.
Realtime enabled on `offices`, `requests`, `rep_notes`.
Reads from the browser use the anon key with select-only RLS policies. All writes go through Next.js route handlers or server actions using the service role key (server only).

## 8. Seed data (fictional brands, real therapeutic areas, fictional offices in real Atlanta neighborhoods)

Drugs:
| id | brand | company | area |
|---|---|---|---|
| glucavia | Glucavia | Norvance | GLP-1 / diabetes |
| cardexa | Cardexa | Helix Pharma | Anticoagulant |
| statora | Statora | Meridian Bio | Lipids |
| pulmeris | Pulmeris | Aerion | Asthma / COPD |
| dermavel | Dermavel | Lumen Therapeutics | Psoriasis |

Offices:
| id | name | neighborhood | specialty | status | topics | slots | cap | blocks |
|---|---|---|---|---|---|---|---|---|
| peachtree-family (demo) | Peachtree Family Medicine | Midtown | Primary care | topics | GLP-1 / diabetes, Lipids | Tue 12:30, Thu 12:30, Thu 15:00 | 3 | Meridian Bio |
| decatur-heart | Decatur Heart Associates | Decatur | Cardiology | open | Anticoagulant, Lipids | Mon 12:00, Wed 12:00 | 2 | none |
| buckhead-derm | Buckhead Dermatology | Buckhead | Dermatology | closed | Psoriasis | Fri 12:00 | 1 | none |
| inman-pulm | Inman Park Pulmonary | Inman Park | Pulmonology | topics | Asthma / COPD | Tue 11:30 | 2 | none |
| westend-peds | West End Pediatrics | West End | Pediatrics | closed | none | none | 0 | none |

Demo office seeded with 1 accepted visit this week, so cap fills during the expo. Reset restores this.
Redirect options for all offices: drop_samples, virtual, next_slot, leave_materials.

Printed rep cards for the expo and their expected outcome at Peachtree Family:
- Glucavia (Norvance) → green, slot.
- Pulmeris (Aerion) → amber, off topic, virtual.
- Statora (Meridian Bio) → grey, "not now" (blocked, reason hidden).
- Cardexa safety notice → green, always accepted.
- After the cap fills → amber, next week's slot.

`/api/demo/reset`: deletes requests, rep_notes, sign_history, restores seed offices, reseeds the 1 accepted visit.

## 9. UI system

- Next.js App Router, TypeScript, Tailwind, shadcn/ui (Stone base color), Geist font, lucide-react icons.
- Status colors are the only color in the app: green = open / accepted, amber = topics / redirected, grey = closed / declined. Define as CSS variables and use everywhere.
- The Door Sign is one component (`src/components/door-sign.tsx`) reused on `/sign`, `/desk`, `/rep`, setup preview. Rounded, soft shadow, generous whitespace, feels like a physical sign.
- Accessibility floor: base text 18px+, tap targets 48px+, words on every button, no icon-only controls, no swipe or hover-only actions, no hidden menus, AA contrast.
- Loading: shadcn Skeleton for every data area. (Lottie logo loader is post-MVP.)
- Motion (`motion` package) in exactly two places: Lobby Board card arrival and Door Sign status flip.
- Components: Card, Badge, Button (lg), ToggleGroup, Drawer, Sonner, Progress, Skeleton, Input, Textarea, Label.

## 10. Build order and cut lines

1. Schema + seed + reset route, deployed to Vercel. (must)
2. Decision engine + `/k/[officeId]` flow end to end with template text. (must, this is the demo)
3. `/desk` Lobby Board with realtime + overrides. (must)
4. `/sign` Door Sign editing: status with just today / from now on, edit in place, undo, history line. (must)
5. Grok answer text with fallback. (should)
6. `/rep` fit list. (should)
7. Rep notes drawer. (should)
8. `/sign/setup` Type mode + NPI pre-fill. (should)
9. Talk mode with Grok Voice. (could; hard cut 1 AM Sunday)
10. Landing page polish, logo, QR tent card + rep cards printable page. (must before video)

## 11. Acceptance checks (run before recording the video)

- Scan QR on a real phone → answer screen in under 3 seconds, and the card appears on `/desk` without refresh.
- Each printed rep card produces its expected outcome.
- Flip Peachtree to Closed "Just today" on `/sign` → next scan is grey with a redirect; `/rep` shows Peachtree grey.
- Undo restores the previous status.
- Safety notice is accepted even when Closed.
- Kill the xAI key → every flow still works with template text.
- Reset demo restores everything.

## 12. Slide only (pitch, not built)

Brands pay per accepted visit; Impiricus runs the exchange and gets consented intent data. Aggregate trends only across large groups. Rep visits and lunches logged for Sunshine Act reporting. Sample requests hand off to Impiricus's existing sampling integration.
