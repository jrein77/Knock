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
| `/desk` | Front desk | Laptop | Lobby Board: Requests and Rep visits. Two views only |
| `/sign` | Doctor | Any | Rep visits: status buttons and short settings, split into what reps see and what only the office sees |
| `/sign/setup` | Doctor / office manager | Any | One question per screen setup, Talk / Type switch |
| `/rep` | Rep | Phone | Fit list: stack of Door Signs sorted green / amber / grey |
| `/k/[officeId]` | Rep | Phone | QR landing. Request flow: who, what, answer |
| `/signals` | Impiricus / brand teams | Laptop | Demand Signals: ranked insight cards from all requests and Door Signs |

Demo office id: `peachtree-family`. The printed QR points to `/k/peachtree-family`.

### 4.1 `/k/[officeId]` QR request flow (the demo core)

Max 3 screens, mobile first.
1. **Who:** name, company, email. Saved to localStorage as a rep id after first submit; skipped on later scans (show "Not you?" link).
2. **What are you bringing:** one-tap chips of all seeded drugs (brand name + therapeutic area), plus a chip "Safety notice". Purpose chips: Visit (default), Drop samples, Lunch. All structured, no free text drives the decision. Optional "Message to the office" textarea (max 280 chars), shown collapsed on the desk card; it never affects the decision.
3. **Answer:** whole screen turns a status color.
   - Green "You're in" + slot time ("Tuesday 12:30, 5 minutes with the team").
   - Amber "Not a visit this time" + redirect text + one big primary button for the redirect action (e.g. "Drop samples at the front desk" or "Book Thursday 12:30 instead").
   - Grey "Not now" + redirect text + button.
   - Small link under the answer: "Think we got this wrong? Leave a note" opens a Drawer with a textarea. Saved as a rep note.

### 4.2 `/desk` Lobby Board

- Header: office name, and a quiet messages chip top right with a count of new ones (opens a Drawer; no alerts, never in the main column). It holds rep notes ("Think we got this wrong?") and messages sent with requests.
  - Each message shows where the rep's request stands ("Booked: Tuesday Sep 29, 12:30 PM" or "Not booked"). Closing one out always has an outcome, never just "clear":
    - Not booked: **Book a visit** (next open time) or **Not this time** (declines, which also withdraws any "book next week" offer).
    - Booked: **Cancel the visit** or **Keep the visit**.
    - Nothing to act on (no request, the rep canceled, or a safety notice): **Mark done**.
  - Booking, declining and canceling are the same override as the board's buttons, so the rep gets the same email. Undo reverts both the override and the message. Resolved messages can be reopened.
  - Wording stays friendly: reps are guests, not adversaries.
- **Today view:** single column, newest on top, like a departures board.
  - QR arrivals (`source = 'qr'`) get a full card that slides in (motion): rep name, company, drug, decision, slot. Card actions: "Approve anyway" / "Decline" (override).
  - Other requests are quiet one-line rows.
  - Updates live via Supabase realtime. No refresh.
- **Rep visits view:** the same editor as `/sign` (see 4.3), without the office name, since the header shows it.
- Demo reset button, small, in the footer: "Reset demo" (calls `/api/demo/reset`).

### 4.3 `/sign` Rep visits (doctor)

The office answers "do we take rep visits, and which ones?" in two sections. No separate sign preview: the sections themselves say who sees what.

- **Reps see this** (eye icon, styled like the Door Sign card):
  - Status: **Open**, **Topics only**, **Closed** side by side, the current one in its status color. One line under them says what it means for reps (e.g. "Only reps with a topic you want"; Closed: "No visits. Safety notices still get through."). One tap changes it from now on. No "just today" option.
  - Short settings, each a small label over today's answer with a text **Change** button: **Topics**, **Visit times**, **Instead of a visit**. Change opens the editor in place on the card: no extra boxes or divider lines.
- **Only your office sees this** (lock icon, muted background): **Weekly limit**, **Blocked companies**.
- **Topics:** chips of therapeutic areas. "+ Add topic" opens a small inline box (Enter adds, Escape cancels).
- **Visit times** (also used in setup):
  - Weekly pattern: a grid of Mon to Fri by every working hour, 8 AM to 5 PM, in a scroll box that opens at the first time set. Tap a box to make that time available every week (green with a check). Drag across boxes to fill a rectangle, spreadsheet style; the first box decides whether the drag fills or clears. Tap a day name to fill that column, or a time to fill that row; tap again when full to clear it. Hovering a day or time previews the change (light green where it adds, faded where it clears). Times already in use (e.g. 12:30) get their own row; "+ Other time" adds one.
  - Next two weeks: every upcoming visit as a button. Tap one to skip just that date (e.g. the doctor is out) without touching the weekly pattern; tap again to bring it back. The Visit times answer lists skips ("Skipping Thu Oct 1").
- History line at the bottom: the most recent change with one-tap **Change back**.
- Undo toast (Sonner) on every change.
- Link: "Set up again" goes to `/sign/setup`.

### 4.4 `/sign/setup`

- One question per screen, big buttons, Progress bar, live Door Sign preview beside or below: "This is what reps see."
- Persistent **Talk / Type** switch at the top. Both modes write to the same draft. Switching keeps answers.
- Step 1: NPI number (optional). If entered, call the NPI Registry server-side and pre-fill name, specialty, address; doctor confirms. Skip button available.
- Step 2: Status (Open / Topics only / Closed).
- Step 3: Topics wanted (chips of therapeutic areas + optional free text).
- Step 4: Visit times (the same weekly grid as 4.3) and weekly cap (stepper 0 to 10).
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

### 4.6 `/signals` Demand Signals (the Impiricus product)

Who: Impiricus and brand teams, laptop. This is what Impiricus sells. Not a chart dashboard: a ranked feed of insight cards, each a plain sentence with the offices behind it and one action.

- Header: brand selector (All brands = Impiricus view, or one company: Norvance, Helix Pharma, Meridian Bio, Aerion, Lumen Therapeutics) and time window (7 / 30 days).
- Top row, three numbers only:
  - **Trips saved:** requests answered before a visit (redirected or declined from the fit list, plus QR redirects to drop samples or virtual).
  - **Accepted visits** in the window.
  - **Open demand:** offices whose Door Sign wants a topic in the selected brand's areas.
- Insight cards (computed with plain SQL/TypeScript in `src/lib/signals.ts`, sentences from templates, ranked by number of offices affected):
  1. **Unmet demand:** "7 offices want GLP-1 / diabetes info. None accepted a Norvance visit in 30 days." Expand: office list. Action: "Send list to field team" (copies list, toast).
  2. **Wasted effort by reason:** "Most of Aerion's redirects were off-topic. These offices don't list Asthma / COPD." Expand: breakdown bar (off-topic / not taking visits / slots full) and offices that do want the area.
  3. **Slots filling fast:** "Decatur Heart fills its weekly slots by Tuesday. Request early in the week."
  4. **Newly open:** "Buckhead Dermatology changed from Closed to Topics only this week and wants Psoriasis."
  5. **Mismatch notes:** "3 reps left notes saying Knock got it wrong at Peachtree Family." Links to notes.
  6. **Ask before you drive:** share of requests from the fit list vs walk-in QR, trend over the window.
- Privacy rules on this page: brand blocks never appear; `blocked` is merged into "not taking visits". A single brand view only shows its own requests plus office-level public data (status, topics, slots). Office-level counts for other brands never shown.
- One small horizontal bar is allowed inside card 2. No other charts.
- Updates on page load (no realtime needed).

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

Effective status: `today_status` if `today_status_date` equals today's date in America/New_York, else `status`. The UI no longer sets a just-today status (every change is from now on and clears any `today_status`); the columns stay so older history and Undo still work.

Visit slots: each is weekly (`day`, `time`, optional `end`) or a one-off on a `date`. A weekly slot may carry `skip`: dates it doesn't happen. All slot-to-date math goes through `upcomingWindows` in `src/lib/week.ts`, which passes over skipped dates, so the engine, fit list, desk overrides and reset all respect skips.

The answer text shown to the rep comes from templates keyed by decision + redirectAction (`src/lib/messages.ts`). Never reveal reasonCode `blocked` or cap usage. `blocked` and `closed` both read as "Not taking visits right now."

## 6. Where Grok is used (office setup only)

Reps and the decision engine use no LLM. All rep input is structured.
Provider: xAI via Vercel AI SDK (`@ai-sdk/xai`), model from env `XAI_MODEL`. Structured output with zod.
1. **Setup parsing:** turn a doctor's loose free text or voice transcript ("we don't need any more statin people, happy to hear about diabetes stuff, Tuesdays at lunch work") into Door Sign fields (status, topics as therapeutic-area tags, days, times, cap). The doctor always confirms on the Door Sign preview before saving.
2. **Talk mode:** Grok Voice (`XAI_VOICE_MODEL=grok-voice-latest`, `XAI_VOICE=carina`) via realtime WebSocket, browser uses a short-lived token minted by a server route. Cut at 1 AM Sunday if not working.
If Grok fails, the Type flow with chips still works; free text is optional.
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

Add 8 more fictional offices across Atlanta neighborhoods (Grant Park, Virginia-Highland, Sandy Springs, Marietta, Kirkwood, East Point, Brookhaven, Old Fourth Ward) with a mix of specialties and statuses so `/signals` has enough offices. At least 5 offices total should list GLP-1 / diabetes; at least one should have changed from Closed to Topics only in the last 7 days (sign_history row).

History for `/signals`: seed ~150 requests over the past 30 days across all offices, drugs, and reps, produced by running the real decision engine against each office's sign (not random decisions), with ~60% from `fit_list` and ~40% from `qr`, plus 3 rep notes at Peachtree Family. Norvance should have zero accepted visits at the GLP-1 offices so the unmet-demand card fires.

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
- The Door Sign component (`src/components/door-sign.tsx`) is the live preview in `/sign/setup`. Rounded, soft shadow, generous whitespace, feels like a physical sign. `/sign` and `/desk` edit the same fields as Rep visits (4.3), whose public section uses the same card style.
- Accessibility floor: base text 18px+, tap targets 48px+, words on every button, no icon-only controls, no swipe or hover-only actions, no hidden menus, AA contrast.
- Loading: shadcn Skeleton for every data area. (Lottie logo loader is post-MVP.)
- Motion (`motion` package) in exactly two places: Lobby Board card arrival and Door Sign status flip.
- Components: Card, Badge, Button (lg), ToggleGroup, Drawer, Sonner, Progress, Skeleton, Input, Textarea, Label.

## 10. Build order and cut lines

1. Schema + seed (including 30 days of history) + reset route, deployed to Vercel. (must)
2. Decision engine + `/k/[officeId]` flow end to end with template text. (must, this is the demo)
3. `/desk` Lobby Board with realtime + overrides. (must)
4. `/sign` Rep visits editing: status, settings edited in place, visit-time grid with skips, undo, history line. (must)
5. `/signals` Demand Signals page. (must, this is what Impiricus buys)
6. `/rep` fit list. (should)
7. Rep notes drawer. (should)
8. `/sign/setup` Type mode + NPI pre-fill. (should)
9. Grok setup parsing (free text to fields), then Talk mode with Grok Voice. (could; hard cut 1 AM Sunday)
10. Landing page polish, logo, QR tent card + rep cards printable page. (must before video)

## 11. Acceptance checks (run before recording the video)

- Scan QR on a real phone → answer screen in under 3 seconds, and the card appears on `/desk` without refresh.
- Each printed rep card produces its expected outcome.
- Flip Peachtree to Closed on `/sign` → next scan is grey with a redirect; `/rep` shows Peachtree grey.
- Skip one upcoming Peachtree visit time → the next accepted request books the following open time, not the skipped one.
- Undo restores the previous status.
- Safety notice is accepted even when Closed.
- Kill the xAI key → every flow except Talk mode and free-text setup parsing still works.
- `/signals` with Norvance selected shows the unmet GLP-1 demand card; after a visitor's Glucavia visit is accepted at Peachtree and the page is reloaded, the count reflects it.
- Reset demo restores everything.

## 12. Slide only (pitch, not built)

Brands pay per accepted visit; Impiricus runs the exchange and gets consented intent data. Aggregate trends only across large groups. Rep visits and lunches logged for Sunshine Act reporting. Sample requests hand off to Impiricus's existing sampling integration.