import { decide, type Decision } from "@/lib/decide";
import { createServerClient } from "@/lib/supabase/server";
import type { DecisionKind, Drug, Office } from "@/lib/types";
import { milesBetween } from "@/lib/distance";
import { formatVisit, upcomingWindows, WEEK_MS } from "@/lib/week";

// The rep's fit list: every office, colored by what the decision engine would answer
// if this rep asked for a visit right now with their best drug for that office.
// Only public sign fields, the color and a plain reason leave the server:
// never brand blocks, cap usage or reason codes.

type Fit = "green" | "amber" | "grey";

const FIT_BY_DECISION: Record<DecisionKind, Fit> = {
  accepted: "green",
  redirected: "amber",
  declined: "grey",
};
const RANK: Record<DecisionKind, number> = { accepted: 0, redirected: 1, declined: 2 };

// One short line for the row. The section heading already says good fit / maybe / not now.
function reasonText(decision: Decision): string {
  switch (decision.reasonCode) {
    case "slot":
      return `Next visit ${formatVisit(decision.slotAt!, decision.slotEnd, true)}`;
    case "off_topic":
      return "Doesn't list your topics right now";
    case "cap_full":
      return `Full this week. Next: ${formatVisit(decision.slotAt!, decision.slotEnd, true)}`;
    case "no_slots":
      return decision.slotAt
        ? `No times this week. Next: ${formatVisit(decision.slotAt, decision.slotEnd, true)}`
        : "No visit times posted";
    case "blocked":
      return "Not taking visits for your products right now";
    default:
      return "Closed to reps right now";
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const company = params.get("company")?.trim() ?? "";
  // The rep's location, if their phone shared it. Only used to measure distance; never stored.
  const repLat = Number(params.get("lat"));
  const repLng = Number(params.get("lng"));
  const here = params.has("lat") && params.has("lng") && isFinite(repLat) && isFinite(repLng)
    ? { lat: repLat, lng: repLng }
    : null;
  const drugIds = (params.get("drugs") ?? "").split(",").filter(Boolean);
  if (!company || drugIds.length === 0) {
    return Response.json({ error: "company and drugs are required" }, { status: 400 });
  }

  const db = createServerClient();
  const now = new Date();

  // The rep's own upcoming visits (from their saved rep id), so the list can show them,
  // let them cancel, and grey out times they're already booked.
  const repId = params.get("repId");
  const myVisits =
    repId && /^[0-9a-f-]{36}$/.test(repId)
      ? (
          await db
            .from("requests")
            .select("id, slot_at, offices(name)")
            .eq("rep_id", repId)
            .eq("decision", "accepted")
            .is("rep_canceled_at", null)
            .gte("slot_at", now.toISOString())
            .order("slot_at")
        ).data ?? []
      : [];

  const [officesResult, drugsResult, blocksResult, acceptedResult] = await Promise.all([
    db.from("offices").select("*").order("name"),
    db.from("drugs").select("*").in("id", drugIds),
    db.from("brand_blocks").select("office_id, company"),
    db
      .from("requests")
      .select("office_id")
      .eq("decision", "accepted")
      .is("rep_canceled_at", null)
      .gte("slot_at", now.toISOString())
      .lt("slot_at", new Date(now.getTime() + WEEK_MS).toISOString()),
  ]);
  const failed = [officesResult, drugsResult, blocksResult, acceptedResult].find((r) => r.error);
  if (failed) {
    return Response.json({ error: failed.error!.message }, { status: 500 });
  }

  const offices = officesResult.data as Office[];
  const blocks = blocksResult.data ?? [];
  const accepted = acceptedResult.data ?? [];
  const drugs = drugsResult.data as Drug[];
  if (drugs.length === 0) {
    return Response.json({ error: "Unknown drugs" }, { status: 400 });
  }

  const fits = offices.map((office) => {
    const brandBlocks = blocks
      .filter((block) => block.office_id === office.id)
      .map((block) => block.company);
    const acceptedThisWeek = accepted.filter((r) => r.office_id === office.id).length;

    // Try each of the rep's drugs and keep the best answer.
    const answers = drugs.map((drug) => ({
      drug,
      decision: decide({
        office,
        brandBlocks,
        drug,
        repCompany: company,
        purpose: "visit",
        acceptedThisWeek,
        now,
      }),
    }));
    answers.sort((a, b) => RANK[a.decision.decision] - RANK[b.decision.decision]);
    const best = answers[0];

    return {
      id: office.id,
      name: office.name,
      neighborhood: office.neighborhood,
      specialty: office.specialty,
      topics: office.topics,
      visitSlots: office.visit_slots,
      fit: FIT_BY_DECISION[best.decision.decision],
      reason: reasonText(best.decision),
      drugId: best.drug.id,
      drugBrand: best.drug.brand,
      // For good fits: this week's visit times, for the rep to tap one.
      times:
        best.decision.decision === "accepted"
          ? upcomingWindows(now, office.visit_slots)
              .filter((opening) => opening.start.getTime() < now.getTime() + WEEK_MS)
              .slice(0, 6)
              .map((opening) => ({
                start: opening.start.toISOString(),
                end: opening.end?.toISOString() ?? null,
              }))
          : [],
      distanceMiles:
        here && office.lat != null && office.lng != null
          ? Math.round(milesBetween(here, { lat: office.lat, lng: office.lng }) * 10) / 10
          : null,
    };
  });

  // Green first, then amber, then grey. Within each: nearest first, or alphabetical without a location.
  const order: Record<Fit, number> = { green: 0, amber: 1, grey: 2 };
  fits.sort(
    (a, b) =>
      order[a.fit] - order[b.fit] ||
      (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) ||
      a.name.localeCompare(b.name)
  );

  return Response.json({
    offices: fits,
    myVisits: myVisits.map((visit) => ({
      id: visit.id,
      slotAt: visit.slot_at,
      officeName: (visit.offices as unknown as { name: string } | null)?.name ?? "an office",
    })),
  });
}
