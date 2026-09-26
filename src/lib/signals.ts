import "server-only";
import { effectiveStatus } from "./decide";
import type { SignSnapshot } from "./sign";
import { STATUS_STYLE } from "./status-style";
import type { createServerClient } from "./supabase/server";
import type { Day, DecisionKind, Drug, Office, Purpose } from "./types";
import { DAY_NAMES, DAYS, nyWeekday } from "./week";

// Demand Signals: plain counts over requests and Door Signs, written as short sentences.
//
// Privacy rules:
// - Brand blocks never appear. "blocked" is counted as "not taking visits".
// - A single-brand view only uses that brand's own requests and notes, plus office-level
//   public data (status, topics, visit times). Other brands' counts are never shown.

export const BRANDS = ["Norvance", "Helix Pharma", "Meridian Bio", "Aerion", "Lumen Therapeutics"];

const DAY_MS = 24 * 60 * 60 * 1000;

export type UnmetDemand = {
  area: string;
  sentence: string;
  offices: string[]; // offices that want the area and had no accepted visit about it
  copyText: string;
};

export type Misses = {
  sentence: string;
  parts: { label: string; count: number; tone: "topics" | "closed" | "neutral" }[];
  wantedAt?: { title: string; offices: string[] }; // where the brand's areas are wanted
};

export type Signals = {
  whose: string; // "Norvance reps" or "all reps"
  areas: string[]; // the brand's therapeutic areas (all areas for all brands)
  requests: number;
  accepted: number;
  acceptanceRate: number | null; // percent of visit requests, or null with none
  wantedAt: number; // open offices whose sign wants one of `areas`
  unmet: UnmetDemand[];
  misses: Misses | null;
  worthKnowing: { key: string; text: string; details?: string[] }[];
};

type RequestRow = {
  id: string;
  office_id: string;
  rep_company: string | null;
  drug_id: string | null;
  purpose: Purpose;
  decision: DecisionKind;
  reason_code: string | null;
  created_at: string;
};
type NoteRow = { office_id: string; request_id: string | null; rep_name: string | null; body: string };
type HistoryRow = { office_id: string; before: SignSnapshot; after: SignSnapshot; created_at: string };

export async function loadSignals(
  db: ReturnType<typeof createServerClient>,
  brand: string | null,
  days: number,
  now: Date
): Promise<Signals> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();

  const [officesResult, drugsResult, requestsResult, historyResult, notesResult] = await Promise.all([
    db.from("offices").select("*").order("name"),
    db.from("drugs").select("*"),
    db
      .from("requests")
      .select("id, office_id, rep_company, drug_id, purpose, decision, reason_code, created_at")
      .is("rep_canceled_at", null) // a visit the rep canceled isn't demand anymore
      .gte("created_at", since),
    db.from("sign_history").select("office_id, before, after, created_at").gte("created_at", since),
    db.from("rep_notes").select("office_id, request_id, rep_name, body").gte("created_at", since),
  ]);
  const failed = [officesResult, drugsResult, requestsResult, historyResult, notesResult].find(
    (result) => result.error
  );
  if (failed) throw new Error(failed.error!.message);

  const offices = officesResult.data as Office[];
  const drugs = drugsResult.data as Drug[];
  const allRequests = requestsResult.data as RequestRow[];
  const history = historyResult.data as HistoryRow[];
  const notes = notesResult.data as NoteRow[];

  const officeName = new Map(offices.map((office) => [office.id, office.name]));
  const drugById = new Map(drugs.map((drug) => [drug.id, drug]));

  // Whose request is it? The drug's company (what reps type can vary), else the rep's company.
  const companyOf = (r: RequestRow) => (r.drug_id && drugById.get(r.drug_id)?.company) || r.rep_company;
  const isVisit = (r: RequestRow) => r.purpose === "visit" || r.purpose === "lunch";

  const requests = brand ? allRequests.filter((r) => companyOf(r) === brand) : allRequests;
  const areas = [...new Set(drugs.filter((d) => !brand || d.company === brand).map((d) => d.area))].sort();
  const openOffices = offices.filter((office) => effectiveStatus(office, now) !== "closed");
  const wantsOurAreas = (office: Office) => office.topics.some((topic) => areas.includes(topic));
  const whose = brand ? `${brand} reps` : "all reps";
  const inWindow = `in the last ${days} days`;

  // --- The three numbers ---
  const accepted = requests.filter((r) => r.decision === "accepted" && isVisit(r)).length;
  const visitRequests = requests.filter(isVisit).length;
  const acceptanceRate = visitRequests > 0 ? Math.round((accepted / visitRequests) * 100) : null;
  const wantedAt = openOffices.filter(wantsOurAreas).length;

  // --- Unmet demand: offices that want an area, with no accepted visit about it ---
  const unmet: UnmetDemand[] = [];
  for (const area of areas) {
    const wanting = openOffices.filter((office) => office.topics.includes(area));
    if (wanting.length === 0) continue;

    const visitedIds = new Set(
      requests
        .filter((r) => r.decision === "accepted" && isVisit(r))
        .filter((r) => r.drug_id && drugById.get(r.drug_id)?.area === area)
        .map((r) => r.office_id)
    );
    const waiting = wanting.filter((office) => !visitedIds.has(office.id));
    if (waiting.length === 0) continue;

    const who = brand ?? "any brand";
    const wants = count(wanting.length, "office wants", "offices want");
    const outcome =
      waiting.length === wanting.length
        ? `None had an accepted ${who} visit about it ${inWindow}.`
        : `${waiting.length} of them had no accepted ${who} visit about it ${inWindow}.`;
    const offices = waiting.map((office) => office.name);
    unmet.push({
      area,
      sentence: `${wants} ${area} info. ${outcome}`,
      offices,
      copyText: `Offices that want ${area} info:\n${offices.map((name) => `- ${name}`).join("\n")}`,
    });
  }
  unmet.sort((a, b) => b.offices.length - a.offices.length);

  // --- Why requests didn't become visits. "blocked" and "closed" are both "not taking visits". ---
  let misses: Misses | null = null;
  const missed = requests.filter((r) => r.decision !== "accepted");
  if (missed.length > 0) {
    const parts = [
      {
        label: "Topic not wanted",
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
        count: missed.filter((r) =>
          ["cap_full", "no_slots", "time_unavailable"].includes(r.reason_code ?? "")
        ).length,
        tone: "neutral" as const,
      },
    ];
    const top = [...parts].sort((a, b) => b.count - a.count)[0];
    const share = Math.round((top.count / missed.length) * 100);
    const because: Record<string, string> = {
      "Topic not wanted": "the office doesn't list that topic",
      "Not taking visits": "the office wasn't taking visits",
      "No open time": "the office had no open time that week",
    };
    misses = {
      sentence: `${count(missed.length, "request", "requests")} from ${whose} didn't become visits ${inWindow}. ${share}% were because ${because[top.label]}.`,
      parts,
      wantedAt:
        brand && top.label === "Topic not wanted"
          ? {
              title: `Offices that do want ${areas.join(" or ")}`,
              offices: openOffices.filter(wantsOurAreas).map((office) => office.name),
            }
          : undefined,
    };
  }

  // --- Worth knowing: short, specific lines ---
  const worthKnowing: Signals["worthKnowing"] = [];

  // Offices that went from Closed to taking visits.
  for (const change of history) {
    if (change.before.status !== "closed" || change.after.status === "closed") continue;
    const topics = change.after.topics;
    if (brand && change.after.status === "topics" && !topics.some((t) => areas.includes(t))) continue;
    const ageDays = Math.floor((now.getTime() - new Date(change.created_at).getTime()) / DAY_MS);
    const when = ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays} days ago`;
    const label = STATUS_STYLE[change.after.status].label.replace(" to reps", "");
    const wants = topics.length > 0 ? ` It wants ${topics.join(", ")}.` : "";
    worthKnowing.push({
      key: `opened-${change.office_id}-${change.created_at}`,
      text: `${officeName.get(change.office_id)} switched from Closed to ${label} ${when}.${wants}`,
    });
  }

  // Offices that run out of room early in the week (a pattern, never a count).
  const minWeeks = days <= 7 ? 1 : 2;
  for (const office of offices) {
    if (brand && !wantsOurAreas(office) && office.status !== "open") continue;
    const firstFullDay = new Map<string, Day>();
    for (const r of allRequests) {
      if (r.office_id !== office.id || r.reason_code !== "cap_full") continue;
      const created = new Date(r.created_at);
      const weekday = nyWeekday(created);
      const monday = new Date(created.getTime() - DAYS.indexOf(weekday) * DAY_MS).toISOString().slice(0, 10);
      if (!firstFullDay.has(monday)) firstFullDay.set(monday, weekday);
    }
    if (firstFullDay.size < minWeeks) continue;

    // The day it most often fills. On a tie, the later day (the safer advice).
    const tally = new Map<Day, number>();
    for (const day of firstFullDay.values()) tally.set(day, (tally.get(day) ?? 0) + 1);
    const [fillDay] = [...tally.entries()].sort(
      (a, b) => b[1] - a[1] || DAYS.indexOf(b[0]) - DAYS.indexOf(a[0])
    )[0];
    worthKnowing.push({
      key: `fills-${office.id}`,
      text: `${office.name} is usually full by ${DAY_NAMES[fillDay]}. Ask early in the week.`,
    });
  }

  // Reps who think the sign got it wrong. Brand view: that brand's reps only.
  const requestById = new Map(allRequests.map((r) => [r.id, r]));
  const visibleNotes = notes.filter((note) => {
    if (!brand) return true;
    const request = note.request_id ? requestById.get(note.request_id) : undefined;
    return request !== undefined && companyOf(request) === brand;
  });
  for (const officeId of new Set(visibleNotes.map((note) => note.office_id))) {
    const officeNotes = visibleNotes.filter((note) => note.office_id === officeId);
    worthKnowing.push({
      key: `notes-${officeId}`,
      text: `${count(officeNotes.length, "rep", "reps")} said the sign at ${officeName.get(officeId)} got it wrong.`,
      details: officeNotes.map((note) => `“${note.body}” (${note.rep_name ?? "a rep"})`),
    });
  }

  return {
    whose,
    areas,
    requests: requests.length,
    accepted,
    acceptanceRate,
    wantedAt,
    unmet,
    misses,
    worthKnowing,
  };
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
