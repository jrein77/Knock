// 30 days of past activity for /signals, rebuilt on every demo reset.
// Every decision comes from the real decision engine run against the office's sign
// at that time. A fixed random seed makes every reset tell the same story.

import { decide, declineRedirect } from "./decide";
import { templateMessage } from "./messages";
import { seedBrandBlocks, seedDrugs, seedOffices } from "./seed";
import type { SignSnapshot } from "./sign";
import type { Drug, Office, Purpose, Source } from "./types";
import { nyStartOfToday, nyWeekday, WEEK_MS } from "./week";

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_COUNT = 150;

// Kirkwood Dermatology switched from Closed to Topics only this many days ago.
const KIRKWOOD_ID = "kirkwood-derm";
const KIRKWOOD_OPENED_DAYS_AGO = 3;

// Where each drug's reps go. Chosen so the /signals story shows up:
// - Norvance (Glucavia) never gets to the six offices that want GLP-1 / diabetes: unmet demand.
// - Aerion (Pulmeris) mostly lands at offices that don't list Asthma / COPD: wasted effort.
// - Decatur Heart gets its requests early in the week (see pickDay): slots filling fast.
const TARGET_OFFICES: Record<string, string[]> = {
  glucavia: ["decatur-heart", "inman-pulm", "marietta-cardio", "buckhead-derm", KIRKWOOD_ID, "brookhaven-internal"],
  // Decatur Heart is listed twice for Cardexa and Statora to keep it busy.
  cardexa: ["decatur-heart", "decatur-heart", "marietta-cardio", "grantpark-internal", "peachtree-family", "o4w-primary"],
  statora: ["decatur-heart", "decatur-heart", "marietta-cardio", "peachtree-family", "grantpark-internal", "o4w-primary", "brookhaven-internal"],
  // Peachtree and Virginia-Highland are listed twice to weight them.
  pulmeris: ["peachtree-family", "vahi-endo", "peachtree-family", "vahi-endo", KIRKWOOD_ID, "inman-pulm", "eastpoint-health"],
  dermavel: ["buckhead-derm", KIRKWOOD_ID, "westend-peds", "sandysprings-family"],
};

const REP_NAMES: Record<string, string[]> = {
  Norvance: ["Ava Mitchell", "Jordan Reyes", "Chris Bell"],
  "Helix Pharma": ["Sam Okafor", "Taylor Nguyen", "Morgan Hayes"],
  "Meridian Bio": ["Riley Carter", "Jamie Patel", "Casey Brooks"],
  Aerion: ["Priya Shah", "Alex Kim", "Drew Foster"],
  "Lumen Therapeutics": ["Robin Diaz", "Quinn Parker", "Avery Lane"],
};

const NOTE_BODIES = [
  "Our label was just updated for kidney patients. Two minutes would help your team.",
  "I only needed to drop off the new dosing card, not a full visit.",
  "Dr. Patel asked me to follow up on last month's lunch.",
];

// mulberry32: a tiny seeded random number generator. Same seed, same history.
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

// A weekday 1 to 30 days ago at an office-hours time.
// Decatur Heart's requests come Monday afternoon and Tuesday, all after its Monday noon
// slot, so they compete for Wednesday's slot and the week fills by Tuesday.
function pickTime(random: () => number, officeId: string, now: Date): Date {
  const isDecatur = officeId === "decatur-heart";
  const allowedDays = isDecatur ? ["Mon", "Tue"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const firstHour = isDecatur ? 13 : 8;
  const midnight = nyStartOfToday(now).getTime();

  for (;;) {
    const daysAgo = 1 + Math.floor(random() * 30);
    const hour = firstHour + Math.floor(random() * (17 - firstHour)); // up to 4 PM
    const minute = pick(random, [0, 15, 30, 45]);
    const time = new Date(midnight - daysAgo * DAY_MS + (hour * 60 + minute) * 60 * 1000);
    if (allowedDays.includes(nyWeekday(time))) return time;
  }
}

function pickPurpose(random: () => number): Purpose {
  const roll = random();
  if (roll < 0.7) return "visit";
  if (roll < 0.8) return "lunch";
  if (roll < 0.95) return "drop_samples";
  return "safety_notice";
}

// The office's sign as it was at `time`.
function signAt(office: Office, time: Date, now: Date): Office {
  const openedAt = now.getTime() - KIRKWOOD_OPENED_DAYS_AGO * DAY_MS;
  if (office.id === KIRKWOOD_ID && time.getTime() < openedAt) {
    return { ...office, status: "closed" };
  }
  return office;
}

function snapshot(office: Office): SignSnapshot {
  return {
    name: office.name,
    specialty: office.specialty,
    address: office.address,
    npi: office.npi,
    topics_note: office.topics_note,
    status: office.status,
    today_status: office.today_status,
    today_status_date: office.today_status_date,
    topics: office.topics,
    visit_slots: office.visit_slots,
    weekly_cap: office.weekly_cap,
    redirect_options: office.redirect_options,
    brand_blocks: seedBrandBlocks.filter((b) => b.office_id === office.id).map((b) => b.company),
  };
}

export function generateHistory(now: Date) {
  const random = makeRandom(13);
  const officesById = new Map(seedOffices.map((office) => [office.id, office]));
  const drugsById = new Map<string, Drug>(seedDrugs.map((drug) => [drug.id, drug]));

  // 1. Who asked where and when, in time order.
  const drafts = Array.from({ length: REQUEST_COUNT }, (_, i) => {
    const drug = drugsById.get(seedDrugs[i % seedDrugs.length].id)!;
    const officeId = pick(random, TARGET_OFFICES[drug.id]);
    return {
      id: crypto.randomUUID(),
      drug,
      officeId,
      time: pickTime(random, officeId, now),
      purpose: pickPurpose(random),
      source: (random() < 0.6 ? "fit_list" : "qr") as Source,
      repName: pick(random, REP_NAMES[drug.company]),
    };
  }).sort((a, b) => a.time.getTime() - b.time.getTime());

  // 2. Run each one through the decision engine, counting accepted visits as we go.
  const acceptedSlots: { officeId: string; slotAt: Date }[] = [];

  const requests = drafts.map((draft) => {
    const office = signAt(officesById.get(draft.officeId)!, draft.time, now);
    const windowEnd = draft.time.getTime() + WEEK_MS;
    const acceptedThisWeek = acceptedSlots.filter(
      (a) =>
        a.officeId === office.id &&
        a.slotAt.getTime() >= draft.time.getTime() &&
        a.slotAt.getTime() < windowEnd
    ).length;

    const decision = decide({
      office,
      brandBlocks: seedBrandBlocks.filter((b) => b.office_id === office.id).map((b) => b.company),
      drug: draft.drug,
      repCompany: draft.drug.company,
      purpose: draft.purpose,
      acceptedThisWeek,
      now: draft.time,
    });
    if (decision.decision === "accepted" && decision.slotAt) {
      acceptedSlots.push({ officeId: office.id, slotAt: decision.slotAt });
    }

    return {
      id: draft.id,
      office_id: office.id,
      rep_name: draft.repName,
      rep_company: draft.drug.company,
      drug_id: draft.drug.id,
      purpose: draft.purpose,
      source: draft.source,
      decision: decision.decision,
      reason_code: decision.reasonCode,
      redirect_action: decision.redirectAction,
      slot_at: decision.slotAt?.toISOString() ?? null,
      message: templateMessage(decision, office.name),
      created_at: draft.time.toISOString(),
      // Filled in below for the few visits that get canceled later.
      rep_canceled_at: null as string | null,
      overridden: false,
      overridden_at: null as string | null,
      original_decision: null as string | null,
      original_reason_code: null as string | null,
      redirect_taken_at: null as string | null,
    };
  });

  // 2a. After a "not now": some reps take what the office offered instead, a few minutes later.
  //     And now and then the desk approves a visit the sign had pushed to next week.
  for (const request of requests) {
    if (request.decision === "accepted") continue;
    const roll = random();
    const created = new Date(request.created_at).getTime();
    if (request.redirect_action && request.redirect_action !== "next_slot" && roll < 0.45) {
      request.redirect_taken_at = new Date(created + 3 * 60 * 1000).toISOString();
    } else if (request.reason_code === "cap_full" && request.slot_at && roll > 0.85) {
      request.overridden = true;
      request.overridden_at = new Date(created + 20 * 60 * 1000).toISOString();
      request.original_decision = request.decision;
      request.original_reason_code = request.reason_code;
      request.decision = "accepted";
      request.redirect_action = null;
    }
  }

  // 2b. A few booked visits get canceled a day later: some by the rep, some by the practice.
  //     Demand Signals shows both kinds of drop-off.
  for (const request of requests) {
    if (request.decision !== "accepted" || !request.slot_at) continue;
    const canceledAt = new Date(new Date(request.created_at).getTime() + DAY_MS).toISOString();
    const roll = random();
    if (roll < 0.1) {
      request.rep_canceled_at = canceledAt;
    } else if (roll < 0.18) {
      // The practice's desk took the visit back ("Cancel visit").
      request.overridden = true;
      request.overridden_at = canceledAt;
      request.original_decision = "accepted";
      request.original_reason_code = request.reason_code;
      request.decision = "declined";
      request.redirect_action = declineRedirect(officesById.get(request.office_id)!);
      request.slot_at = null;
    }
  }

  // 3. Three reps who thought Peachtree Family got it wrong.
  const peachtreeNos = requests.filter(
    (r) => r.office_id === "peachtree-family" && r.decision !== "accepted"
  );
  const repNotes = peachtreeNos.slice(-3).map((request, i) => ({
    office_id: "peachtree-family",
    request_id: request.id,
    rep_name: request.rep_name,
    body: NOTE_BODIES[i],
    created_at: new Date(new Date(request.created_at).getTime() + 5 * 60 * 1000).toISOString(),
  }));

  // 4. Door Signs changing over the month, for "What changed" on Demand Signals.
  //    Kirkwood Dermatology opening up (Closed to Topics only) is the one the demo leads with.
  const kirkwood = officesById.get(KIRKWOOD_ID)!;
  const sandySprings = officesById.get("sandysprings-family")!;
  const grantPark = officesById.get("grantpark-internal")!;
  const marietta = officesById.get("marietta-cardio")!;
  const brookhaven = officesById.get("brookhaven-internal")!;
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const signHistory = [
    {
      office_id: KIRKWOOD_ID,
      summary: "Topics only (from now on)",
      before: snapshot({ ...kirkwood, status: "closed" }),
      after: snapshot(kirkwood),
      created_at: daysAgo(KIRKWOOD_OPENED_DAYS_AGO),
    },
    {
      office_id: sandySprings.id,
      summary: "Wants: GLP-1 / diabetes, Asthma / COPD",
      before: snapshot({ ...sandySprings, topics: ["GLP-1 / diabetes"] }),
      after: snapshot(sandySprings),
      created_at: daysAgo(5),
    },
    {
      office_id: grantPark.id,
      summary: "Visit times changed",
      before: snapshot({ ...grantPark, visit_slots: grantPark.visit_slots.slice(0, 1) }),
      after: snapshot(grantPark),
      created_at: daysAgo(9),
    },
    {
      office_id: marietta.id,
      summary: "Other options changed",
      before: snapshot({
        ...marietta,
        redirect_options: marietta.redirect_options.filter((option) => option !== "virtual"),
      }),
      after: snapshot(marietta),
      created_at: daysAgo(12),
    },
    {
      office_id: brookhaven.id,
      summary: "Closed to reps (from now on)",
      before: snapshot({ ...brookhaven, status: "topics" }),
      after: snapshot(brookhaven),
      created_at: daysAgo(18),
    },
  ];

  return { requests, repNotes, signHistory };
}
