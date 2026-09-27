<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/knock-logo-dark.svg">
    <img src="public/knock-logo.svg" alt="Knock" width="280">
  </picture>
</p>

<p align="center">
  Door Signs for pharma rep visits. Built at HackGT 13 for the Impiricus track.
  <br>
  <a href="https://knock-gules-one.vercel.app"><strong>Live demo</strong></a>
</p>

---

## What it is

Knock lets a medical office post a Door Sign that says whether it takes rep visits, which topics it wants to hear about, and when reps can come by. Reps check the sign before they drive over, or scan a QR code at the front desk, and get an answer in a few seconds, either a visit time or whatever the office offers instead, such as dropping off samples or a virtual meeting. The office owns the whole thing, reps request and the sign decides, and every answer ends up as a demand signal for the brand teams.

Most tools in this space rank doctors by prescribing data to tell reps who is worth visiting. Knock uses what the office said about itself, so it tells reps who is willing.

## Pages

| Route | Who uses it | What it does |
|---|---|---|
| `/` | Judges | Landing page with the three ways in |
| `/k/peachtree-family` | Reps | The QR request flow, three screens max |
| `/rep` | Reps | Every Door Sign, sorted by how good a fit it is |
| `/desk` | Front desk | Live board of requests, plus the Rep visits editor |
| `/sign` | Doctor | Change the Door Sign by tapping or by talking |
| `/sign/setup` | New office | Setup with an NPI lookup to pre-fill the office |
| `/signals` | Impiricus and brand teams | Demand Signals, where every number shows its source on hover |
| `/qr` | Demo | The printable QR code for the demo office |

## How it works

The decision engine in `src/lib/decide.ts` is one plain function with no AI in it. It reads the office's current sign and runs a fixed list of checks in order, so safety notices always get through, blocked companies and closed offices get a "not now", off-topic requests get pointed to what the office offers instead, and everything else gets the next open visit time that week. Any change to the sign applies to the very next request.

Grok only shows up on the office side, to help fill in the sign. The doctor can answer the setup questions out loud, where Grok reads each question in its own voice, transcribes the answer and turns it into that one setting. It can only pick from fixed choices like known topics, companies or clock times, and an answer that isn't about rep visits gets a set reply and changes nothing. If Grok is slow or down, the buttons and the calendar grid work the same as before.

Demand Signals is built only from the Door Signs and the requests reps make. Brand blocks and weekly limits stay private to the office, and a single brand's view only counts that brand's own requests.

All offices, brands and reps in the demo are made up.

## Stack

Next.js 16 (App Router) and TypeScript, Tailwind with shadcn/ui, Supabase for Postgres and realtime, xAI Grok through the Vercel AI SDK, Resend for rep emails, and Vercel for hosting.

## Running it locally

1. `npm install`
2. Create a Supabase project and run the files in `supabase/` in the SQL Editor in this order: `schema.sql`, `lockdown.sql`, `rep-message.sql`, `desk-tracking.sql`, `office-location.sql`, `rep-cancel.sql`.
3. Add the variables below to `.env.local`.
4. `npm run dev`, then press Reset demo at the bottom of `/desk` to load the demo offices and 30 days of history.

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Read-only access from the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes, never sent to the browser |
| `XAI_API_KEY` | Grok voice, transcription and answer parsing |
| `XAI_MODEL` | The Grok model for parsing answers, e.g. `grok-4-fast-non-reasoning` |
| `XAI_VOICE` | Grok's speaking voice, defaults to `carina` |
| `RESEND_API_KEY` | Emails to reps when the desk changes an answer (optional) |
| `EMAIL_FROM` | Sender address for those emails (optional) |

The full spec is in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).
