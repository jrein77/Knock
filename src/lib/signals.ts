import "server-only";
import { decide, effectiveStatus } from "./decide";
import type { SignSnapshot } from "./sign";
import { REDIRECT_OPTION_LABELS, STATUS_STYLE } from "./status-style";
import type { createServerClient } from "./supabase/server";
import type { Day, DecisionKind, Drug, Office, Purpose, RedirectAction, Source } from "./types";
import { currentSlots, DAY_NAMES, DAYS, formatClock, nyWeekday, WEEK_MS } from "./week";

// Demand Signals: what practices have declared on their Door Signs (not prescribing data),
// and what happened when reps asked. Plain counts, written as sentences a brand team can act on.
// Every number in a sentence is a Stat: hovering it shows how it was counted and who's behind it.
//
// Privacy rules:
// - Brand blocks never appear. "blocked" is counted as "not taking visits".
// - A single-brand view only uses that brand's own requests and notes, plus practice-level
//   public data (status, topics, visit times, how they take reps). Other brands' counts never show.
// - Weekly limits are private to each practice and never used here.

export const BRANDS = ["Norvance", "Helix Pharma", "Meridian Bio", "Aerion", "Lumen Therapeutics"];

const DAY_MS = 24 * 60 * 60 * 1000;

// A number in a sentence, with where it came from: how it was counted, and who's behind it.
export type Stat = { value: string; about: string; items?: string[] };
// A sentence: plain text with Stats in it.
export type Line = (string | Stat)[];
type Row = { label: string; count: Stat };

export type Signals = {
  whose: string; // "Norvance reps" or "all reps"
  areas: string[]; // the brand's therapeutic areas (every area for all brands)
  headline: Line;
  numbers: { stat: Stat; label: string }[];
  footnote: Line;
  demandByTopic: { lead: Line | null; rows: { area: string; asking: Stat; visited: Stat; requests: Stat | null }[] };
  unmet: { area: string; title: Line; offices: string[]; copyText: string }[];
  whoAsks: { lead: Line; rows: Row[]; neighborhoods: Line | null } | null;
  reach: { channels: { lead: Line; rows: Row[] } | null; bestTime: Line | null; capacity: Line | null } | null;
  askFirst: { lead: Line; trend: Line | null; tripsSaved: Line } | null;
  misses: {
    lead: Line;
    parts: { label: string; count: Stat; share: number; tone: "topics" | "closed" | "neutral" }[];
    rerouted: { lead: Line; offices: string[] } | null;
  } | null;
  afterNo: { lead: Line; rows: Row[] } | null;
  leadTime: Line | null;
  desk: Line | null;
  cancellations: { lead: Line; practices: { name: string; byRep: number; byPractice: number }[] } | null;
  handoffs: Line | null;
  changes: { key: string; text: Line; details?: string[] }[];
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
  redirect_taken_at: string | null;
  slot_at: string | null;
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

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function stat(value: string | number, about: string, items?: string[]): Stat {
  return { value: String(value), about, items: items && items.length > 0 ? items : undefined };
}

// Write a sentence with Stats in it: line`${stat} practices are asking.`
function line(strings: TemplateStringsArray, ...values: (string | number | Stat)[]): Line {
  const parts: Line = [];
  strings.forEach((text, i) => {
    if (text) parts.push(text);
    if (i < values.length) {
      const value = values[i];
      parts.push(typeof value === "object" ? value : String(value));
    }
  });
  return parts;
}

// The most common item in a list.
function mostCommon<T>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// "Decatur Heart Associates: 3" for each practice, most first.
function byPractice(rows: { office_id: string }[], nameOf: (id: string) => string): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.office_id, (counts.get(row.office_id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nameOf(id)}: ${n}`);
}

function ago(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
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
          "id, office_id, rep_company, drug_id, purpose, source, decision, reason_code, redirect_action, redirect_taken_at, slot_at, created_at, rep_canceled_at, overridden, original_decision"
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
  const history = (historyResult.data as HistoryRow[]).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const notes = notesResult.data as NoteRow[];

  const officeName = new Map(offices.map((office) => [office.id, office.name]));
  const nameOf = (id: string) => officeName.get(id) ?? "A practice";
  const drugById = new Map(drugs.map((drug) => [drug.id, drug]));

  // Whose request is it? The drug's company (what reps type can vary), else the rep's company.
  const companyOf = (r: RequestRow) => (r.drug_id && drugById.get(r.drug_id)?.company) || r.rep_company;
  const isVisit = (r: RequestRow) => r.purpose === "visit" || r.purpose === "lunch";
  const areaOf = (r: RequestRow) => (r.drug_id ? drugById.get(r.drug_id)?.area : undefined);

  const requests = brand ? allRequests.filter((r) => companyOf(r) === brand) : allRequests;
  const areas = [...new Set(drugs.filter((d) => !brand || d.company === brand).map((d) => d.area))].sort();
  const openOffices = offices.filter((office) => effectiveStatus(office, now) !== "closed");
  const asking = openOffices.filter((office) => office.topics.some((topic) => areas.includes(topic)));
  const askingNames = asking.map((office) => office.name);
  const whose = brand ? `${brand} reps` : "all reps";
  // Wording that works for one brand or for all of them.
  const brandVisit = brand ? `${brand} visit` : "visit"; // "a Norvance visit" / "a visit"
  const yourTopics = brand ? "your topics" : "a topic";
  const inWindow = `in the last ${days} days`;
  const fromRequests = `${brand ? `${brand}'s` : "All"} requests ${inWindow}.`;
  const fromSigns = "From Door Signs as they are today.";

  // --- Demand by topic: practices asking for each area, and which of them got a visit about it ---
  const byTopic = areas
    .map((area) => {
      const askingForArea = openOffices.filter((office) => office.topics.includes(area));
      const acceptedHere = requests.filter((r) => r.decision === "accepted" && isVisit(r) && areaOf(r) === area);
      const visitedIds = new Set(acceptedHere.map((r) => r.office_id));
      const visited = askingForArea.filter((office) => visitedIds.has(office.id));
      // All brands only: how many reps asked about it, to show which topics are crowded.
      const repRequests = brand ? null : allRequests.filter((r) => isVisit(r) && areaOf(r) === area);
      return {
        area,
        askingForArea,
        visited,
        waiting: askingForArea.filter((office) => !visitedIds.has(office.id)),
        repRequests,
      };
    })
    .filter((row) => row.askingForArea.length > 0)
    .sort((a, b) => b.askingForArea.length - a.askingForArea.length);

  const topicRows = byTopic.map((row) => ({
    area: row.area,
    asking: stat(
      row.askingForArea.length,
      `Practices open to reps whose Door Sign lists ${row.area}. ${fromSigns}`,
      row.askingForArea.map((office) => office.name)
    ),
    visited: stat(
      row.visited.length,
      `Of those, practices with an accepted ${brandVisit} about ${row.area} ${inWindow}.`,
      row.visited.map((office) => office.name)
    ),
    requests: row.repRequests
      ? stat(
          row.repRequests.length,
          `Visit requests from reps about ${row.area} ${inWindow}, all brands.`,
          byPractice(row.repRequests, nameOf)
        )
      : null,
  }));
  const roomiest = [...byTopic].sort((a, b) => b.waiting.length - a.waiting.length)[0];
  const topicLead =
    byTopic.length > 1 && roomiest && roomiest.waiting.length > 0
      ? line`${roomiest.area} has the most room: ${stat(
          roomiest.waiting.length,
          `Practices asking for ${roomiest.area} with no accepted ${brandVisit} about it ${inWindow}.`,
          roomiest.waiting.map((office) => office.name)
        )} of ${stat(roomiest.askingForArea.length, `Practices whose Door Sign lists ${roomiest.area}. ${fromSigns}`, roomiest.askingForArea.map((o) => o.name))} practices asking for it haven't had a visit about it.`
      : null;

  // --- Where you're wanted but not visiting ---
  const unmet = byTopic
    .filter((row) => row.waiting.length > 0)
    .sort((a, b) => b.waiting.length - a.waiting.length)
    .map((row) => {
      const names = row.waiting.map((office) => office.name);
      const askingStat = stat(
        row.askingForArea.length,
        `Practices open to reps whose Door Sign lists ${row.area}. ${fromSigns}`,
        row.askingForArea.map((office) => office.name)
      );
      const waitingStat = stat(
        row.waiting.length,
        `Practices asking for ${row.area} with no accepted ${brandVisit} about it ${inWindow}.`,
        names
      );
      return {
        area: row.area,
        sentence:
          row.visited.length === 0
            ? line`${askingStat} ${row.askingForArea.length === 1 ? "practice is" : "practices are"} asking for ${row.area} information. None had an accepted ${brandVisit} about it ${inWindow}.`
            : line`${askingStat} practices are asking for ${row.area} information. ${waitingStat} of them had no accepted ${brandVisit} about it ${inWindow}.`,
        title: line`${row.area}: ${waitingStat} of ${askingStat} practices asking have had no ${brandVisit}.`,
        offices: names,
        copyText: `Practices asking for ${row.area} information:\n${names.map((n) => `- ${n}`).join("\n")}`,
      };
    });

  // --- The headline and the numbers ---
  const visitRequests = requests.filter(isVisit);
  const acceptedVisits = visitRequests.filter((r) => r.decision === "accepted");
  const welcomeRate = visitRequests.length > 0 ? percent(acceptedVisits.length, visitRequests.length) : null;

  // Trips saved: answered before anyone drove (a "not now" from the fit list), or a walk-in
  // pointed to a drop-off or a virtual meeting instead of a wasted visit.
  const savedFromFitList = requests.filter((r) => r.source === "fit_list" && r.decision !== "accepted");
  const savedAtDesk = requests.filter(
    (r) => r.source === "qr" && (r.redirect_action === "drop_samples" || r.redirect_action === "virtual")
  );
  const tripsSaved = savedFromFitList.length + savedAtDesk.length;

  const askingStat = stat(
    asking.length,
    `Practices open to reps whose Door Sign lists ${brand ? areas.join(" or ") : "any topic"}. ${fromSigns}`,
    askingNames
  );
  const headline =
    unmet.length > 0
      ? unmet[0].sentence
      : asking.length > 0
        ? line`${askingStat} ${asking.length === 1 ? "practice is" : "practices are"} asking for ${areas.join(" or ")}, and every one had a visit ${inWindow}.`
        : [`No practices are asking for ${areas.join(" or ")} right now.`];

  const numbers = [
    { stat: askingStat, label: brand ? `practices asking for ${areas.join(" or ")}` : "practices asking for a topic" },
    {
      stat: stat(
        welcomeRate === null ? "None" : `${welcomeRate}%`,
        `${count(acceptedVisits.length, "visit request was", "visit requests were")} accepted out of ${visitRequests.length}. ${fromRequests}`,
        byPractice(acceptedVisits, nameOf).map((item) => `${item} accepted`)
      ),
      label: `of ${whose}' visit requests welcomed`,
    },
    {
      stat: stat(
        tripsSaved,
        `Answered before a wasted trip: ${savedFromFitList.length} "not now" answers from the fit list before driving, plus ${savedAtDesk.length} walk-ins pointed to samples or a virtual meeting instead.`,
        byPractice([...savedFromFitList, ...savedAtDesk], nameOf)
      ),
      label: "trips saved",
    },
    {
      stat: stat(
        requests.length,
        `Every request ${inWindow}: visits, lunches, sample drop-offs and safety notices. ${requests.filter((r) => r.source === "fit_list").length} asked from the fit list, ${requests.filter((r) => r.source === "qr").length} scanned in at the desk.`,
        byPractice(requests, nameOf)
      ),
      label: `requests from ${whose} ${inWindow}`,
    },
  ];

  const statusCounts = (["open", "topics", "closed"] as const).map((status) => ({
    status,
    names: offices.filter((office) => effectiveStatus(office, now) === status).map((office) => office.name),
  }));
  const footnote = line`From what ${stat(
    offices.length,
    `Practices with a Door Sign on Knock. ${statusCounts.map((s) => `${STATUS_STYLE[s.status].label.replace(" to reps", "")}: ${s.names.length}`).join(", ")}.`,
    offices.map((office) => office.name)
  )} practices put on their Door Signs. Not prescribing data.`;

  // --- Who's asking: the specialties and neighborhoods behind the demand ---
  let whoAsks: Signals["whoAsks"] = null;
  if (asking.length > 0) {
    const specialties = [...new Set(asking.map((office) => office.specialty ?? "Other"))]
      .map((specialty) => ({
        specialty,
        names: asking.filter((office) => (office.specialty ?? "Other") === specialty).map((office) => office.name),
      }))
      .sort((a, b) => b.names.length - a.names.length);
    const top = specialties[0];
    const places = [...new Set(asking.map((office) => office.neighborhood).filter(Boolean))] as string[];
    whoAsks = {
      lead: line`${top.specialty} practices lead the demand: ${stat(
        top.names.length,
        `${top.specialty} practices asking for ${yourTopics}. ${fromSigns}`,
        top.names
      )} of the ${askingStat} asking for ${yourTopics}.`,
      rows: specialties.map((row) => ({
        label: row.specialty,
        count: stat(row.names.length, `${row.specialty} practices asking for ${yourTopics}.`, row.names),
      })),
      neighborhoods:
        places.length > 0
          ? line`Spread across ${stat(
              places.length,
              "Atlanta neighborhoods with a practice asking for these topics.",
              places.map(
                (place) =>
                  `${place}: ${asking.filter((office) => office.neighborhood === place).map((o) => o.name).join(", ")}`
              )
            )} neighborhoods.`
          : null,
    };
  }

  // --- How to reach them: what they accept instead of a visit, when they see reps, how often ---
  let reach: Signals["reach"] = null;
  if (asking.length > 0) {
    const options: RedirectAction[] = ["virtual", "drop_samples", "leave_materials"];
    const optionRows = options
      .map((option) => ({
        option,
        names: asking.filter((office) => office.redirect_options.includes(option)).map((office) => office.name),
      }))
      .sort((a, b) => b.names.length - a.names.length);
    const top = optionRows[0];
    const takes: Record<string, string> = {
      virtual: "offer virtual meetings, a way to reach them without a visit",
      drop_samples: "take samples at the front desk",
      leave_materials: "take materials at the front desk",
    };
    const channels = {
      lead: line`${stat(
        top.names.length,
        `Practices asking for ${yourTopics} whose Door Sign offers "${REDIRECT_OPTION_LABELS[top.option]}" instead of a visit.`,
        top.names
      )} of the ${askingStat} practices asking for ${yourTopics} ${takes[top.option]}.`,
      rows: optionRows.map((row) => ({
        label: REDIRECT_OPTION_LABELS[row.option],
        count: stat(
          `${row.names.length} of ${asking.length}`,
          `Practices asking for ${yourTopics} that offer this instead of a visit.`,
          row.names
        ),
      })),
    };

    const slots = asking.flatMap((office) =>
      currentSlots(office.visit_slots, now).map((slot) => ({ ...slot, office: office.name }))
    );
    let bestTime: Line | null = null;
    let capacity: Line | null = null;
    if (slots.length > 0) {
      const day = mostCommon(slots.map((s) => s.day));
      const time = mostCommon(slots.map((s) => s.time));
      const onDay = [...new Set(slots.filter((s) => s.day === day).map((s) => s.office))];
      bestTime = line`Most practices asking for ${yourTopics} see reps on ${DAY_NAMES[day]}s, around ${formatClock(time)}: ${stat(
        onDay.length,
        `Practices asking for ${yourTopics} with a visit time on ${DAY_NAMES[day]}.`,
        onDay
      )} of them.`;
      capacity = line`Together they post ${stat(
        slots.length,
        `Visit times a week on the Door Signs of practices asking for ${yourTopics}. Weekly limits are private, so this is times offered, not visits available.`,
        asking.map((office) => `${office.name}: ${currentSlots(office.visit_slots, now).length}`)
      )} visit times a week.`;
    }
    reach = { channels, bestTime, capacity };
  }

  // --- Ask before you drive: the fit list versus walk-ins at the desk, and the trend ---
  let askFirst: Signals["askFirst"] = null;
  if (requests.length > 0) {
    const fromFitList = requests.filter((r) => r.source === "fit_list");
    const walkIns = requests.filter((r) => r.source === "qr");
    const middle = new Date(now.getTime() - (days / 2) * DAY_MS).toISOString();
    const shareOf = (list: RequestRow[]) => percent(list.filter((r) => r.source === "fit_list").length, list.length);
    const earlier = requests.filter((r) => r.created_at < middle);
    const later = requests.filter((r) => r.created_at >= middle);
    const direction = shareOf(later) >= shareOf(earlier) ? "up" : "down";
    askFirst = {
      lead: line`${stat(
        `${percent(fromFitList.length, requests.length)}%`,
        `${fromFitList.length} of ${requests.length} requests were asked from the rep's fit list before driving. The other ${walkIns.length} scanned the QR code at the front desk. ${fromRequests}`,
        byPractice(fromFitList, nameOf).map((item) => `${item} from the fit list`)
      )} of requests were asked before driving over. The rest were walk-ins at the desk.`,
      trend:
        earlier.length >= 4 && later.length >= 4
          ? line`That's ${stat(
              `${shareOf(later)}%`,
              `Asked from the fit list in the last ${days / 2} days: ${later.filter((r) => r.source === "fit_list").length} of ${later.length}.`
            )} lately, ${direction} from ${stat(
              `${shareOf(earlier)}%`,
              `Asked from the fit list in the ${days / 2} days before that: ${earlier.filter((r) => r.source === "fit_list").length} of ${earlier.length}.`
            )} earlier in the period.`
          : null,
      tripsSaved: line`${numbers[2].stat} trips were skipped because the rep got an answer before driving over.`,
    };
  }

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

    const walkInStat = stat(
      walkIns.length,
      `Visit requests scanned in at the front desk that didn't become visits ${inWindow}.`,
      byPractice(walkIns, nameOf)
    );
    const couldStat = stat(
      couldHaveBooked === walkIns.length ? "All" : couldHaveBooked,
      "Each turned-away walk-in was run through the decision engine again against every other practice's sign as it is today. These would have been accepted somewhere.",
      [...welcomingOffices].sort()
    );
    return {
      lead:
        couldHaveBooked === 0
          ? line`${walkInStat} ${walkIns.length === 1 ? "rep drove to a practice" : "reps drove to practices"} and got turned away at the desk.`
          : line`${walkInStat} ${walkIns.length === 1 ? "rep drove to a practice" : "reps drove to practices"} and got turned away at the desk. ${couldStat} of them could have booked a visit this week somewhere that wants them.`,
      offices: [...welcomingOffices].sort(),
    };
  }

  // --- Why visits were declined. "blocked" and "closed" are both "not taking visits". ---
  let misses: Signals["misses"] = null;
  const missed = requests.filter((r) => r.decision !== "accepted");
  if (missed.length > 0) {
    const groups = [
      {
        label: "Topic not asked for",
        rows: missed.filter((r) => r.reason_code === "off_topic"),
        tone: "topics" as const,
        because: "the practice hadn't asked for that topic",
      },
      {
        label: "Not taking visits",
        rows: missed.filter((r) => r.reason_code === "blocked" || r.reason_code === "closed"),
        tone: "closed" as const,
        because: "the practice wasn't taking visits",
      },
      {
        label: "No open time",
        rows: missed.filter((r) => ["cap_full", "no_slots", "time_unavailable"].includes(r.reason_code ?? "")),
        tone: "neutral" as const,
        because: "the practice had no open time that week",
      },
    ];
    const top = [...groups].sort((a, b) => b.rows.length - a.rows.length)[0];
    misses = {
      lead: line`${stat(
        `${percent(top.rows.length, missed.length)}%`,
        `${top.rows.length} of ${missed.length} requests that didn't become visits. ${fromRequests}`,
        byPractice(top.rows, nameOf)
      )} of the ${stat(
        missed.length,
        `Requests ${inWindow} that were redirected or declined.`,
        byPractice(missed, nameOf)
      )} requests that didn't become visits were because ${top.because}.`,
      parts: groups.map((group) => ({
        label: group.label,
        count: stat(group.rows.length, `${group.label}, ${inWindow}.`, byPractice(group.rows, nameOf)),
        share: group.rows.length,
        tone: group.tone,
      })),
      rerouted: reroute(missed),
    };
  }

  // --- After a "not now": did reps take what the practice offered instead? ---
  let afterNo: Signals["afterNo"] = null;
  const offered = missed.filter((r) => r.redirect_action && r.redirect_action !== "next_slot");
  if (offered.length > 0) {
    const taken = offered.filter((r) => r.redirect_taken_at);
    const actions = [...new Set(offered.map((r) => r.redirect_action!))];
    afterNo = {
      lead: line`When a practice offered something instead of a visit, reps took it ${stat(
        `${percent(taken.length, offered.length)}%`,
        `${taken.length} of ${offered.length} "not now" answers that offered a drop-off or a virtual meeting, where the rep tapped to take it.`,
        byPractice(taken, nameOf).map((item) => `${item} taken`)
      )} of the time.`,
      rows: actions.map((action) => {
        const rows = offered.filter((r) => r.redirect_action === action);
        const took = rows.filter((r) => r.redirect_taken_at);
        return {
          label: REDIRECT_OPTION_LABELS[action],
          count: stat(
            `${took.length} of ${rows.length}`,
            `Times "${REDIRECT_OPTION_LABELS[action]}" was offered, and how many reps took it.`,
            byPractice(took, nameOf).map((item) => `${item} taken`)
          ),
        };
      }),
    };
  }

  // --- How far ahead visits book ---
  let leadTime: Line | null = null;
  const bookedVisits = acceptedVisits.filter((r) => r.slot_at);
  if (bookedVisits.length > 0) {
    const daysAhead = (r: RequestRow) => (new Date(r.slot_at!).getTime() - new Date(r.created_at).getTime()) / DAY_MS;
    const average = bookedVisits.reduce((sum, r) => sum + daysAhead(r), 0) / bookedVisits.length;
    const perPractice = [...new Set(bookedVisits.map((r) => r.office_id))]
      .map((id) => {
        const here = bookedVisits.filter((r) => r.office_id === id);
        return { id, average: here.reduce((sum, r) => sum + daysAhead(r), 0) / here.length };
      })
      .sort((a, b) => a.average - b.average);
    leadTime = line`Accepted visits were booked ${stat(
      `${average.toFixed(1)} days`,
      `Average time from a rep's request to the visit time it booked, over ${count(bookedVisits.length, "accepted visit", "accepted visits")} ${inWindow}.`,
      perPractice.map((p) => `${nameOf(p.id)}: ${p.average.toFixed(1)} days`)
    )} ahead on average. Soonest at ${nameOf(perPractice[0].id)}.`;
  }

  // --- The front desk's own calls: overriding the sign ---
  let desk: Line | null = null;
  {
    const approved = requests.filter((r) => r.overridden && r.decision === "accepted" && r.original_decision !== "accepted");
    const canceled = requests.filter((r) => r.overridden && r.decision === "declined" && r.original_decision === "accepted");
    if (approved.length + canceled.length > 0) {
      desk = line`Front desks approved ${stat(
        approved.length,
        `Requests the Door Sign turned down that the front desk approved anyway ${inWindow}. A sign stricter than its desk.`,
        byPractice(approved, nameOf)
      )} ${approved.length === 1 ? "request" : "requests"} their sign had turned down, and took back ${stat(
        canceled.length,
        `Booked visits the front desk canceled ${inWindow}.`,
        byPractice(canceled, nameOf)
      )} booked ${canceled.length === 1 ? "visit" : "visits"}.`;
    }
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
    const byPracticeRows = ours.filter(canceledByPractice);

    if (booked.length > 0) {
      const perPractice = new Map<string, { byRep: number; byPractice: number }>();
      for (const r of [...byRep, ...byPracticeRows]) {
        const entry = perPractice.get(r.office_id) ?? { byRep: 0, byPractice: 0 };
        if (canceledByRep(r)) entry.byRep += 1;
        else entry.byPractice += 1;
        perPractice.set(r.office_id, entry);
      }
      const canceled = byRep.length + byPracticeRows.length;
      const bookedStat = stat(booked.length, `Visits booked ${inWindow}, including ones later canceled.`, byPractice(booked, nameOf));
      cancellations = {
        lead:
          canceled === 0
            ? line`None of the ${bookedStat} booked visits ${inWindow} were canceled.`
            : line`${stat(canceled, `Booked visits canceled ${inWindow}, by either side.`, byPractice([...byRep, ...byPracticeRows], nameOf))} of ${bookedStat} booked visits were canceled ${inWindow}: ${stat(
                byRep.length,
                "Canceled by the rep from their fit list.",
                byPractice(byRep, nameOf)
              )} by reps, ${stat(byPracticeRows.length, "Canceled by the practice's front desk.", byPractice(byPracticeRows, nameOf))} by practices.`,
        practices: [...perPractice.entries()]
          .map(([officeId, entry]) => ({ name: nameOf(officeId), ...entry }))
          .sort((a, b) => b.byRep + b.byPractice - (a.byRep + a.byPractice))
          .slice(0, 3),
      };
    }
  }

  // --- Handoffs that aren't visits: samples and safety notices (for the sampling team) ---
  let handoffs: Line | null = null;
  {
    const samples = requests.filter(
      (r) =>
        (r.purpose === "drop_samples" && r.decision === "accepted") ||
        (r.redirect_action === "drop_samples" && r.redirect_taken_at)
    );
    const safety = requests.filter((r) => r.purpose === "safety_notice");
    if (samples.length + safety.length > 0) {
      handoffs = line`Beyond visits, reps left samples ${stat(
        samples.length,
        `Sample drop-offs at the front desk ${inWindow}: asked for directly, or taken after a "not now".`,
        byPractice(samples, nameOf)
      )} times and delivered ${stat(
        safety.length,
        `Safety notices ${inWindow}. These always get through, even when a practice is closed.`,
        byPractice(safety, nameOf)
      )} safety ${safety.length === 1 ? "notice" : "notices"}.`;
    }
  }

  // --- What changed: a log of how practices' Door Signs moved, newest first ---
  // One entry per practice: its sign at the start of the period against its sign now, so a
  // practice that flipped back and forth shows only where it ended up.
  const changes: Signals["changes"] = [];
  const statusName = (status: SignSnapshot["status"]) => STATUS_STYLE[status].label.replace(" to reps", "");
  const WAYS: Record<RedirectAction, string> = {
    drop_samples: "sample drop-offs",
    virtual: "virtual meetings",
    next_slot: "the next open visit",
    leave_materials: "leaving materials",
  };
  const netChanges = [...new Set(history.map((row) => row.office_id))].map((officeId) => {
    const rows = history.filter((row) => row.office_id === officeId); // newest first
    return {
      office_id: officeId,
      before: rows[rows.length - 1].before,
      after: rows[0].after,
      created_at: rows[0].created_at,
    };
  });
  for (const change of netChanges) {
    const name = nameOf(change.office_id);
    const when = ago(change.created_at, now);
    const { before, after } = change;
    const relevant = (topics: string[]) => topics.filter((topic) => areas.includes(topic));
    const key = `${change.office_id}-${change.created_at}`;
    // Brand view: only practices that want (or wanted) this brand's topics, or that opened to every rep.
    const mattersToBrand =
      !brand || after.status === "open" || relevant([...before.topics, ...after.topics]).length > 0;
    if (!mattersToBrand) continue;

    if (before.status !== after.status) {
      const wants = relevant(after.topics);
      changes.push({
        key: `${key}-status`,
        text: [
          `${name} switched from ${statusName(before.status)} to ${statusName(after.status)} ${when}.`,
          after.status !== "closed" && wants.length > 0 ? ` It's asking for ${wants.join(", ")}.` : "",
        ],
      });
    }
    const added = relevant(after.topics.filter((topic) => !before.topics.includes(topic)));
    if (added.length > 0) {
      changes.push({ key: `${key}-added`, text: [`${name} started asking for ${added.join(", ")} ${when}.`] });
    }
    const dropped = relevant(before.topics.filter((topic) => !after.topics.includes(topic)));
    if (dropped.length > 0) {
      changes.push({ key: `${key}-dropped`, text: [`${name} stopped asking for ${dropped.join(", ")} ${when}.`] });
    }
    const moreTimes = after.visit_slots.length - before.visit_slots.length;
    if (moreTimes !== 0) {
      changes.push({
        key: `${key}-times`,
        text: [
          `${name} ${moreTimes > 0 ? "added" : "removed"} ${count(Math.abs(moreTimes), "visit time", "visit times")} a week ${when}.`,
        ],
      });
    }
    const newWays = after.redirect_options.filter((option) => !before.redirect_options.includes(option));
    if (newWays.length > 0) {
      changes.push({
        key: `${key}-ways`,
        text: [`${name} now takes ${newWays.map((way) => WAYS[way]).join(" and ")} instead of a visit (${when}).`],
      });
    }
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
      text: [
        `${office.name} is usually full by ${DAY_NAMES[fillDay]}: `,
        stat(
          `${firstFullDay.size} weeks`,
          `Weeks ${inWindow} when reps were told this practice was full. It's the day it first filled that counts, never how many visits it takes.`,
          [...firstFullDay.entries()].map(([monday, day]) => `Week of ${monday}: full by ${DAY_NAMES[day]}`)
        ),
        " running. Ask early in the week.",
      ],
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
      text: [
        stat(
          count(officeNotes.length, "rep", "reps"),
          `Reps who tapped "Think we got this wrong?" after an answer from this practice ${inWindow}.`,
          officeNotes.map((note) => note.rep_name ?? "A rep")
        ),
        ` said the sign at ${nameOf(officeId)} got it wrong.`,
      ],
      details: officeNotes.map((note) => `“${note.body}” (${note.rep_name ?? "a rep"})`),
    });
  }

  return {
    whose,
    areas,
    headline,
    numbers,
    footnote,
    demandByTopic: { lead: topicLead, rows: topicRows },
    unmet: unmet.map(({ area, title, offices: names, copyText }) => ({ area, title, offices: names, copyText })),
    whoAsks,
    reach,
    askFirst,
    misses,
    afterNo,
    leadTime,
    desk,
    cancellations,
    handoffs,
    changes,
  };
}
