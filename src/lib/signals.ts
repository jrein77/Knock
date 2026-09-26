import "server-only";
import { effectiveStatus } from "./decide";
import type { SignSnapshot } from "./sign";
import { STATUS_STYLE } from "./status-style";
import type { createServerClient } from "./supabase/server";
import type { DecisionKind, Drug, Office, Purpose, RedirectAction, Source } from "./types";
import { nyWeekday } from "./week";

// Demand Signals: plain counts over requests and Door Signs, written as sentences.
//
// Privacy rules:
// - Brand blocks never appear. "blocked" is merged into "not taking visits".
// - A single-brand view only uses that brand's own requests, plus office-level
//   public data (status, topics, slots). Other brands' counts are never shown.

export const BRANDS = ["Norvance", "Helix Pharma", "Meridian Bio", "Aerion", "Lumen Therapeutics"];

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NAMES: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export type InsightCard = {
  key: string;
  sentence: string;
  officesAffected: number;
  officeList?: { title: string; names: string[] };
  breakdown?: { label: string; count: number; tone: "topics" | "closed" | "neutral" }[];
  notes?: { repName: string; body: string }[];
  copyAction?: { label: string; text: string };
};

export type Signals = {
  tripsSaved: number;
  acceptedVisits: number;
  openDemand: number;
  cards: InsightCard[];
};

type RequestRow = {
  id: string;
  office_id: string;
  rep_company: string | null;
  drug_id: string | null;
  purpose: Purpose;
  source: Source;
  decision: DecisionKind;
  reason_code: string | null;
  redirect_action: RedirectAction | null;
  created_at: string;
};

type NoteRow = { office_id: string; request_id: string | null; rep_name: string | null; body: string };
type HistoryRow = { office_id: string; before: SignSnapshot; after: SignSnapshot; created_at: string };

export function plural(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

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
      .select("id, office_id, rep_company, drug_id, purpose, source, decision, reason_code, redirect_action, created_at")
      .gte("created_at", since)
      .order("created_at"),
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
  const companyOf = (request: RequestRow) =>
    (request.drug_id && drugById.get(request.drug_id)?.company) || request.rep_company;

  const requests = brand ? allRequests.filter((r) => companyOf(r) === brand) : allRequests;
  const brandAreas = [
    ...new Set(drugs.filter((d) => !brand || d.company === brand).map((d) => d.area)),
  ].sort();
  const openOffices = offices.filter((office) => effectiveStatus(office, now) !== "closed");
  const isVisit = (r: RequestRow) => r.purpose === "visit" || r.purpose === "lunch";

  // --- The three numbers ---

  // Trips saved: answered before anyone drove over.
  const tripsSaved = requests.filter(
    (r) =>
      r.decision !== "accepted" &&
      (r.source === "fit_list" ||
        r.redirect_action === "drop_samples" ||
        r.redirect_action === "virtual")
  ).length;
  const acceptedVisits = requests.filter((r) => r.decision === "accepted" && isVisit(r)).length;
  const openDemand = openOffices.filter((office) =>
    office.topics.some((topic) => brandAreas.includes(topic))
  ).length;

  const cards: InsightCard[] = [];
  const windowText = `${days} days`;
  // "a Norvance visit", "an Aerion visit", or "a visit about it" across all brands.
  const aVisit = !brand
    ? "a visit about it"
    : /^[AEIOU]/.test(brand)
      ? `an ${brand} visit`
      : `a ${brand} visit`;

  // --- 1. Unmet demand: offices want an area, but nobody's visits there were accepted. ---
  for (const area of brandAreas) {
    const wanting = openOffices.filter((office) => office.topics.includes(area));
    if (wanting.length === 0) continue;

    const acceptedOfficeIds = new Set(
      requests
        .filter((r) => r.decision === "accepted" && isVisit(r))
        .filter((r) => r.drug_id && drugById.get(r.drug_id)?.area === area)
        .map((r) => r.office_id)
    );
    const unmet = wanting.filter((office) => !acceptedOfficeIds.has(office.id));
    if (unmet.length === 0) continue;

    const acceptedCount = wanting.length - unmet.length;
    const wants = wanting.length === 1 ? "1 office wants" : `${wanting.length} offices want`;
    const outcome =
      acceptedCount === 0
        ? `None accepted ${aVisit} in ${windowText}.`
        : `Only ${acceptedCount} accepted ${aVisit} in ${windowText}.`;
    const names = unmet.map((office) => office.name);

    cards.push({
      key: `unmet-${area}`,
      sentence: `${wants} ${area} info. ${outcome}`,
      officesAffected: unmet.length,
      officeList: { title: `Offices waiting for ${area}`, names },
      copyAction: {
        label: "Send list to field team",
        text: `Offices that want ${area} info:\n${names.map((name) => `- ${name}`).join("\n")}`,
      },
    });
  }

  // --- 2. Wasted effort by reason. "blocked" and "closed" are both "not taking visits". ---
  const misses = requests.filter((r) => r.decision !== "accepted");
  if (misses.length > 0) {
    const offTopic = misses.filter((r) => r.reason_code === "off_topic");
    const notTaking = misses.filter((r) => r.reason_code === "blocked" || r.reason_code === "closed");
    const slotsFull = misses.filter((r) => r.reason_code === "cap_full" || r.reason_code === "no_slots");

    const buckets = [
      { label: "Off-topic", count: offTopic.length, tone: "topics" as const, phrase: "off-topic" },
      { label: "Not taking visits", count: notTaking.length, tone: "closed" as const, phrase: "at offices not taking visits" },
      { label: "Slots full", count: slotsFull.length, tone: "neutral" as const, phrase: "at offices with full weeks" },
    ];
    const top = [...buckets].sort((a, b) => b.count - a.count)[0];
    const whose = brand ? `${brand}'s redirects` : "redirects";
    const lead = top.count * 2 >= misses.length ? `Most of ${whose}` : `The biggest share of ${whose}`;
    let sentence = `${lead} ${top.count === 1 ? "was" : "were"} ${top.phrase}.`;
    if (top.label === "Off-topic" && brand) {
      sentence += ` These offices don't list ${brandAreas.join(" or ")}.`;
    }

    // Where the brand's areas are actually wanted, for a better next trip.
    const wantingNames = openOffices
      .filter((office) => office.topics.some((topic) => brandAreas.includes(topic)))
      .map((office) => office.name);

    cards.push({
      key: "wasted",
      sentence,
      officesAffected: new Set(misses.map((r) => r.office_id)).size,
      breakdown: buckets.map(({ label, count, tone }) => ({ label, count, tone })),
      officeList: brand
        ? { title: `Offices that do want ${brandAreas.join(" or ")}`, names: wantingNames }
        : undefined,
    });
  }

  // --- 3. Slots filling fast: the day each week an office first ran out of room. ---
  // Uses every brand's requests but shows no counts, only the office's pattern.
  const minWeeks = days <= 7 ? 1 : 2;
  for (const office of offices) {
    const firstFullDayByWeek = new Map<string, string>();
    for (const r of allRequests) {
      if (r.office_id !== office.id || r.reason_code !== "cap_full") continue;
      const created = new Date(r.created_at);
      const weekday = nyWeekday(created);
      // The week's Monday, as a key.
      const mondayOffset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
      const weekKey = new Date(created.getTime() - mondayOffset * DAY_MS).toISOString().slice(0, 10);
      if (!firstFullDayByWeek.has(weekKey)) firstFullDayByWeek.set(weekKey, weekday);
    }
    if (firstFullDayByWeek.size < minWeeks) continue;

    // The day it most often fills. On a tie, the later day (the safer advice).
    const tally = new Map<string, number>();
    for (const day of firstFullDayByWeek.values()) tally.set(day, (tally.get(day) ?? 0) + 1);
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const [fillDay] = [...tally.entries()].sort(
      (a, b) => b[1] - a[1] || order.indexOf(b[0]) - order.indexOf(a[0])
    )[0];

    cards.push({
      key: `filling-${office.id}`,
      sentence: `${office.name} fills its weekly slots by ${DAY_NAMES[fillDay]}. Request early in the week.`,
      officesAffected: 1,
    });
  }

  // --- 4. Newly open: an office that went from Closed to taking visits. ---
  for (const change of history) {
    if (change.before.status !== "closed" || change.after.status === "closed") continue;
    const topics = change.after.topics;
    if (brand && change.after.status === "topics" && !topics.some((t) => brandAreas.includes(t))) {
      continue;
    }
    const ageDays = (now.getTime() - new Date(change.created_at).getTime()) / DAY_MS;
    const when = ageDays <= 7 ? "this week" : `in the last ${windowText}`;
    const wants = topics.length > 0 ? ` and wants ${topics.join(", ")}` : "";
    cards.push({
      key: `newly-open-${change.office_id}-${change.created_at}`,
      sentence: `${officeName.get(change.office_id)} changed from Closed to ${STATUS_STYLE[change.after.status].label.replace(" to reps", "")} ${when}${wants}.`,
      officesAffected: 1,
    });
  }

  // --- 5. Mismatch notes: reps who think Knock got it wrong. Brand view: that brand's reps only. ---
  const requestById = new Map(allRequests.map((r) => [r.id, r]));
  const visibleNotes = notes.filter((note) => {
    if (!brand) return true;
    const request = note.request_id ? requestById.get(note.request_id) : undefined;
    return request !== undefined && companyOf(request) === brand;
  });
  for (const officeId of new Set(visibleNotes.map((note) => note.office_id))) {
    const officeNotes = visibleNotes.filter((note) => note.office_id === officeId);
    const reps = officeNotes.length === 1 ? "1 rep left a note" : `${officeNotes.length} reps left notes`;
    cards.push({
      key: `notes-${officeId}`,
      sentence: `${reps} saying Knock got it wrong at ${officeName.get(officeId)}.`,
      officesAffected: 1,
      notes: officeNotes.map((note) => ({ repName: note.rep_name ?? "A rep", body: note.body })),
    });
  }

  // --- 6. Ask before you drive: fit list vs walk-in QR, first half of the window vs second. ---
  if (requests.length > 0) {
    const share = (rows: RequestRow[]) =>
      rows.length === 0 ? 0 : Math.round((rows.filter((r) => r.source === "fit_list").length / rows.length) * 100);
    const midpoint = now.getTime() - (days / 2) * DAY_MS;
    const earlier = share(requests.filter((r) => new Date(r.created_at).getTime() < midpoint));
    const later = share(requests.filter((r) => new Date(r.created_at).getTime() >= midpoint));
    const trend =
      later > earlier
        ? `up from ${earlier}% earlier in the window`
        : later < earlier
          ? `down from ${earlier}% earlier in the window`
          : "steady across the window";
    const whose = brand ? `${brand}'s requests` : "requests";
    cards.push({
      key: "ask-first",
      sentence: `Lately ${later}% of ${whose} were asked before driving (fit list, not a walk-in QR scan), ${trend}.`,
      officesAffected: new Set(requests.map((r) => r.office_id)).size,
    });
  }

  // Ranked by how many offices each card affects.
  cards.sort((a, b) => b.officesAffected - a.officesAffected);

  return { tripsSaved, acceptedVisits, openDemand, cards };
}
