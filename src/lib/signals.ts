import "server-only";
import { decide, effectiveStatus } from "./decide";
import type { SignSnapshot } from "./sign";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "./status-style";
import type { createServerClient } from "./supabase/server";
import type { Day, DecisionKind, Drug, Office, Purpose, RedirectAction } from "./types";
import { currentSlots, DAY_NAMES, DAYS, formatClock, nyWeekday, WEEK_MS } from "./week";

// Demand Signals: what practices have declared on their Door Signs (not prescribing data),
// and what happened when reps asked. Plain counts, written as sentences a brand team can act on.
//
// Privacy rules:
// - Brand blocks never appear. "blocked" is counted as "not taking visits".
// - A single-brand view only uses that brand's own requests and notes, plus practice-level
//   public data (status, topics, visit times, how they take reps). Other brands' counts never show.

export const BRANDS = ["Norvance", "Helix Pharma", "Meridian Bio", "Aerion", "Lumen Therapeutics"];

const DAY_MS = 24 * 60 * 60 * 1000;

export type Signals = {
  whose: string; // "Norvance reps" or "all reps"
  areas: string[]; // the brand's therapeutic areas (every area for all brands)
  practicesDeclared: number; // practices with a Door Sign, for the footnote
  headline: string; // the one thing to know
  numbers: { value: string; label: string }[];
  demandByTopic: { area: string; asking: number; visited: number }[];
  unmet: {
    area: string;
    sentence: string; // full sentence (used as the headline)
    title: string; // short, for the card under the headline
    offices: string[];
    copyText: string;
  }[];
  channels: { sentence: string; rows: { label: string; count: number }[]; of: number } | null;
  bestTime: string | null;
  misses: {
    sentence: string;
    parts: { label: string; count: number; tone: "topics" | "closed" | "neutral" }[];
    // Walk-ins that were turned away, and where the same rep could have booked instead.
    rerouted: { sentence: string; offices: string[] } | null;
  } | null;
  cancellations: {
    sentence: string;
    byRep: number;
    byPractice: number;
    practices: { name: string; byRep: number; byPractice: number }[]; // where it happens most
  } | null;
  changes: { key: string; text: string; details?: string[] }[];
};

type RequestRow = {
  id: string;
  office_id: string;
  rep_company: string | null;
  drug_id: string | null;
  purpose: Purpose;
  source: "qr" | "fit_list";
  decision: DecisionKind;
  reason_code: string | null;
  created_at: string;
  rep_canceled_at: string | null;
  overridden: boolean;
  original_decision: string | null;
};
type NoteRow = { office_id: string; request_id: string | null; rep_name: string | null; body: string };
type HistoryRow = { office_id: string; before: SignSnapshot; after: SignSnapshot; created_at: string };

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// The most common item in a list.
function mostCommon<T>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export async function loadSignals(
  db: ReturnType<typeof createServerClient>,
  brand: string | null,
  days: number,
  now: Date
): Promise<Signals> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();

  const [officesResult, drugsResult, requestsResult, historyResult, notesResult, blocksResult, bookedResult] =
    await Promise.all([
    db.from("offices").select("*").order("name"),
    db.from("drugs").select("*"),
    db
      .from("requests")
      .select(
        "id, office_id, rep_company, drug_id, purpose, source, decision, reason_code, created_at, rep_canceled_at, overridden, original_decision"
      )
      .gte("created_at", since),
    db.from("sign_history").select("office_id, before, after, created_at").gte("created_at", since),
    db.from("rep_notes").select("office_id, request_id, rep_name, body").gte("created_at", since),
    // For "where could they have gone instead": each office's blocks and visits booked this week.
    db.from("brand_blocks").select("office_id, company"),
    db
      .from("requests")
      .select("office_id")
      .eq("decision", "accepted")
      .is("rep_canceled_at", null)
      .gte("slot_at", now.toISOString())
      .lt("slot_at", new Date(now.getTime() + WEEK_MS).toISOString()),
  ]);
  const failed = [
    officesResult,
    drugsResult,
    requestsResult,
    historyResult,
    notesResult,
    blocksResult,
    bookedResult,
  ].find((result) => result.error);
  if (failed) throw new Error(failed.error!.message);

  const offices = officesResult.data as Office[];
  const drugs = drugsResult.data as Drug[];
  // Every request, including canceled ones (for the cancellations section)...
  const everyRequest = requestsResult.data as RequestRow[];
  // ...and the ones that still stand. A visit the rep canceled isn't demand anymore.
  const allRequests = everyRequest.filter((r) => !r.rep_canceled_at);
  const history = historyResult.data as HistoryRow[];
  const notes = notesResult.data as NoteRow[];

  const officeName = new Map(offices.map((office) => [office.id, office.name]));
  const drugById = new Map(drugs.map((drug) => [drug.id, drug]));

  // Whose request is it? The drug's company (what reps type can vary), else the rep's company.
  const companyOf = (r: RequestRow) => (r.drug_id && drugById.get(r.drug_id)?.company) || r.rep_company;
  const isVisit = (r: RequestRow) => r.purpose === "visit" || r.purpose === "lunch";
  const areaOf = (r: RequestRow) => (r.drug_id ? drugById.get(r.drug_id)?.area : undefined);

  const requests = brand ? allRequests.filter((r) => companyOf(r) === brand) : allRequests;
  const areas = [...new Set(drugs.filter((d) => !brand || d.company === brand).map((d) => d.area))].sort();
  const openOffices = offices.filter((office) => effectiveStatus(office, now) !== "closed");
  const asking = openOffices.filter((office) => office.topics.some((topic) => areas.includes(topic)));
  const whose = brand ? `${brand} reps` : "all reps";
  // Wording that works for one brand or for all of them.
  const brandVisit = brand ? `${brand} visit` : "visit"; // "a Norvance visit" / "a visit"
  const yourTopics = brand ? "your topics" : "a topic";
  const inWindow = `in the last ${days} days`;

  // --- Demand by topic: practices asking for each area, and which of them got a visit about it ---
  const byTopic = areas
    .map((area) => {
      const askingForArea = openOffices.filter((office) => office.topics.includes(area));
      const visitedIds = new Set(
        requests
          .filter((r) => r.decision === "accepted" && isVisit(r) && areaOf(r) === area)
          .map((r) => r.office_id)
      );
      return {
        area,
        asking: askingForArea.length,
        visited: askingForArea.filter((office) => visitedIds.has(office.id)).length,
        waiting: askingForArea.filter((office) => !visitedIds.has(office.id)),
      };
    })
    .filter((row) => row.asking > 0)
    .sort((a, b) => b.asking - a.asking);

  // --- Where you're wanted but not visiting ---
  const unmet = byTopic
    .filter((row) => row.waiting.length > 0)
    .sort((a, b) => b.waiting.length - a.waiting.length)
    .map((row) => {
      const names = row.waiting.map((office) => office.name);
      const outcome =
        row.visited === 0
          ? `None had an accepted ${brandVisit} about it ${inWindow}.`
          : `${row.waiting.length} of them had no accepted ${brandVisit} about it ${inWindow}.`;
      return {
        area: row.area,
        sentence: `${count(row.asking, "practice is", "practices are")} asking for ${row.area} information. ${outcome}`,
        title: `${row.area}: ${row.waiting.length} of ${row.asking} practices asking have had no ${brandVisit}`,
        offices: names,
        copyText: `Practices asking for ${row.area} information:\n${names.map((n) => `- ${n}`).join("\n")}`,
      };
    });

  // --- The headline and three numbers ---
  const accepted = requests.filter((r) => r.decision === "accepted" && isVisit(r)).length;
  const visitRequests = requests.filter(isVisit).length;
  const welcomeRate = visitRequests > 0 ? Math.round((accepted / visitRequests) * 100) : null;

  const headline =
    unmet.length > 0
      ? unmet[0].sentence
      : asking.length > 0
        ? `${count(asking.length, "practice is", "practices are")} asking for ${areas.join(" or ")}, and every one had a visit ${inWindow}.`
        : `No practices are asking for ${areas.join(" or ")} right now.`;

  const numbers = [
    {
      value: String(asking.length),
      label: brand ? `practices asking for ${areas.join(" or ")}` : "practices asking for a topic",
    },
    {
      value: welcomeRate === null ? "None" : `${welcomeRate}%`,
      label: `of ${whose}' visit requests welcomed`,
    },
    { value: String(requests.length), label: `requests from ${whose} ${inWindow}` },
  ];

  // --- How they want to hear from you: what practices asking for your topics offer instead ---
  let channels: Signals["channels"] = null;
  if (asking.length > 0) {
    const options: RedirectAction[] = ["virtual", "drop_samples", "leave_materials"];
    const rows = options
      .map((option) => ({
        option,
        label: REDIRECT_OPTION_LABELS[option],
        count: asking.filter((office) => office.redirect_options.includes(option)).length,
      }))
      .sort((a, b) => b.count - a.count);
    const top = rows[0];
    const takes: Record<string, string> = {
      virtual: "offer virtual meetings, a way to reach them without a visit",
      drop_samples: "take samples at the front desk",
      leave_materials: "take materials at the front desk",
    };
    channels = {
      sentence: `${top.count} of the ${count(asking.length, "practice", "practices")} asking for ${yourTopics} ${takes[top.option]}.`,
      rows: rows.map(({ label, count: n }) => ({ label, count: n })),
      of: asking.length,
    };
  }

  // --- Best time to ask: the day and time most practices asking for your topics see reps ---
  const slots = asking.flatMap((office) => currentSlots(office.visit_slots, now));
  const bestTime =
    slots.length > 0
      ? `Most practices asking for ${yourTopics} see reps on ${DAY_NAMES[mostCommon(slots.map((s) => s.day))]}s, around ${formatClock(mostCommon(slots.map((s) => s.time)))}.`
      : null;

  // --- Where turned-away walk-ins could have gone ---
  // A rep who drove over and scanned the QR, then got a "not now", wasted the trip.
  // Run each of those requests through the decision engine again, against every other
  // practice's sign as it stands today: would anyone have said yes to that rep and drug?
  // This is exactly what the fit list would have told them before they drove.
  const blocks = blocksResult.data ?? [];
  const bookedThisWeek = bookedResult.data ?? [];
  function reroute(missed: RequestRow[]): NonNullable<Signals["misses"]>["rerouted"] {
    const walkIns = missed.filter((r) => r.source === "qr" && isVisit(r) && r.drug_id);
    if (walkIns.length === 0) return null;

    const welcomingOffices = new Set<string>();
    let couldHaveBooked = 0;
    for (const r of walkIns) {
      const drug = drugById.get(r.drug_id!) ?? null;
      const yes = offices.filter(
        (office) =>
          office.id !== r.office_id &&
          decide({
            office,
            brandBlocks: blocks.filter((b) => b.office_id === office.id).map((b) => b.company),
            drug,
            repCompany: r.rep_company ?? drug?.company ?? "",
            purpose: r.purpose,
            acceptedThisWeek: bookedThisWeek.filter((b) => b.office_id === office.id).length,
            now,
          }).decision === "accepted"
      );
      if (yes.length > 0) couldHaveBooked += 1;
      for (const office of yes) welcomingOffices.add(office.name);
    }

    const trips = count(walkIns.length, "rep drove to a practice", "reps drove to practices");
    const instead =
      couldHaveBooked === 0
        ? "Asking on Knock first would have saved every one of those trips."
        : `Asking on Knock first would have saved every one of those trips, and ${
            couldHaveBooked === walkIns.length ? "all" : couldHaveBooked
          } of them could have booked a visit this week somewhere that wants them.`;
    return {
      sentence: `${trips} and got turned away at the desk. ${instead}`,
      offices: [...welcomingOffices].sort(),
    };
  }

  // --- Why visits were declined. "blocked" and "closed" are both "not taking visits". ---
  let misses: Signals["misses"] = null;
  const missed = requests.filter((r) => r.decision !== "accepted");
  if (missed.length > 0) {
    const parts = [
      {
        label: "Topic not asked for",
        count: missed.filter((r) => r.reason_code === "off_topic").length,
        tone: "topics" as const,
      },
      {
        label: "Not taking visits",
        count: missed.filter((r) => r.reason_code === "blocked" || r.reason_code === "closed").length,
        tone: "closed" as const,
      },
      {
        label: "No open time",
        count: missed.filter((r) => ["cap_full", "no_slots", "time_unavailable"].includes(r.reason_code ?? ""))
          .length,
        tone: "neutral" as const,
      },
    ];
    const top = [...parts].sort((a, b) => b.count - a.count)[0];
    const share = Math.round((top.count / missed.length) * 100);
    const because: Record<string, string> = {
      "Topic not asked for": "the practice hadn't asked for that topic",
      "Not taking visits": "the practice wasn't taking visits",
      "No open time": "the practice had no open time that week",
    };
    misses = {
      sentence: `${share}% of the ${count(missed.length, "request", "requests")} that didn't become visits were because ${because[top.label]}.`,
      parts,
      rerouted: reroute(missed),
    };
  }

  // --- Cancellations: booked visits that fell through, and which side called them off ---
  let cancellations: Signals["cancellations"] = null;
  {
    // Visits only (not sample drop-offs or safety notices), for this brand or all.
    const ours = (brand ? everyRequest.filter((r) => companyOf(r) === brand) : everyRequest).filter(isVisit);
    const canceledByRep = (r: RequestRow) => r.decision === "accepted" && Boolean(r.rep_canceled_at);
    const canceledByPractice = (r: RequestRow) =>
      r.overridden && r.original_decision === "accepted" && r.decision === "declined";
    // Everything that was booked at some point: still booked, or canceled by either side.
    const booked = ours.filter((r) => r.decision === "accepted" || canceledByPractice(r));
    const byRep = ours.filter(canceledByRep);
    const byPractice = ours.filter(canceledByPractice);

    if (booked.length > 0) {
      const perPractice = new Map<string, { byRep: number; byPractice: number }>();
      for (const r of [...byRep, ...byPractice]) {
        const entry = perPractice.get(r.office_id) ?? { byRep: 0, byPractice: 0 };
        if (canceledByRep(r)) entry.byRep += 1;
        else entry.byPractice += 1;
        perPractice.set(r.office_id, entry);
      }
      const canceled = byRep.length + byPractice.length;
      cancellations = {
        sentence:
          canceled === 0
            ? `None of the ${count(booked.length, "booked visit", "booked visits")} ${inWindow} ${booked.length === 1 ? "was" : "were"} canceled.`
            : `${canceled} of ${count(booked.length, "booked visit", "booked visits")} ${
                canceled === 1 ? "was" : "were"
              } canceled ${inWindow}: ${byRep.length} by reps, ${byPractice.length} by practices.`,
        byRep: byRep.length,
        byPractice: byPractice.length,
        practices: [...perPractice.entries()]
          .map(([officeId, entry]) => ({ name: officeName.get(officeId) ?? "A practice", ...entry }))
          .sort((a, b) => b.byRep + b.byPractice - (a.byRep + a.byPractice))
          .slice(0, 3),
      };
    }
  }

  // --- What changed: practices opening up, filling early, and reps who disagreed ---
  const changes: Signals["changes"] = [];

  for (const change of history) {
    if (change.before.status !== "closed" || change.after.status === "closed") continue;
    const topics = change.after.topics;
    if (brand && change.after.status === "topics" && !topics.some((t) => areas.includes(t))) continue;
    const ageDays = Math.floor((now.getTime() - new Date(change.created_at).getTime()) / DAY_MS);
    const when = ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays} days ago`;
    const label = STATUS_STYLE[change.after.status].label.replace(" to reps", "");
    const wants = topics.length > 0 ? ` It's asking for ${topics.join(", ")}.` : "";
    changes.push({
      key: `opened-${change.office_id}-${change.created_at}`,
      text: `${officeName.get(change.office_id)} switched from Closed to ${label} ${when}.${wants}`,
    });
  }

  // Practices that run out of room early in the week (a pattern, never a count).
  const minWeeks = days <= 7 ? 1 : 2;
  for (const office of offices) {
    if (brand && !asking.includes(office)) continue;
    const firstFullDay = new Map<string, Day>();
    for (const r of allRequests) {
      if (r.office_id !== office.id || r.reason_code !== "cap_full") continue;
      const created = new Date(r.created_at);
      const weekday = nyWeekday(created);
      const monday = new Date(created.getTime() - DAYS.indexOf(weekday) * DAY_MS).toISOString().slice(0, 10);
      if (!firstFullDay.has(monday)) firstFullDay.set(monday, weekday);
    }
    if (firstFullDay.size < minWeeks) continue;
    const dayCounts = new Map<Day, number>();
    for (const day of firstFullDay.values()) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    // The day it most often fills. On a tie, the later day (the safer advice).
    const [fillDay] = [...dayCounts.entries()].sort(
      (a, b) => b[1] - a[1] || DAYS.indexOf(b[0]) - DAYS.indexOf(a[0])
    )[0];
    changes.push({
      key: `fills-${office.id}`,
      text: `${office.name} is usually full by ${DAY_NAMES[fillDay]}. Ask early in the week.`,
    });
  }

  // Reps who think a sign got it wrong. Brand view: that brand's reps only.
  const requestById = new Map(allRequests.map((r) => [r.id, r]));
  const visibleNotes = notes.filter((note) => {
    if (!brand) return true;
    const request = note.request_id ? requestById.get(note.request_id) : undefined;
    return request !== undefined && companyOf(request) === brand;
  });
  for (const officeId of new Set(visibleNotes.map((note) => note.office_id))) {
    const officeNotes = visibleNotes.filter((note) => note.office_id === officeId);
    changes.push({
      key: `notes-${officeId}`,
      text: `${count(officeNotes.length, "rep", "reps")} said the sign at ${officeName.get(officeId)} got it wrong.`,
      details: officeNotes.map((note) => `“${note.body}” (${note.rep_name ?? "a rep"})`),
    });
  }

  return {
    whose,
    areas,
    practicesDeclared: offices.length,
    headline,
    numbers,
    demandByTopic: byTopic.map(({ area, asking: n, visited }) => ({ area, asking: n, visited })),
    unmet,
    channels,
    bestTime,
    misses,
    cancellations,
    changes,
  };
}
