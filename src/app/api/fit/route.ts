import { decide, effectiveStatus, type Decision } from "@/lib/decide";
import { createServerClient } from "@/lib/supabase/server";
import type { DecisionKind, Drug, Office } from "@/lib/types";
import { formatVisit, nyToday, WEEK_MS } from "@/lib/week";

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

function reasonText(decision: Decision, drug: Drug): string {
  switch (decision.reasonCode) {
    case "slot":
      return `Good fit for ${drug.brand}. Next visit ${formatVisit(decision.slotAt!, decision.slotEnd)}`;
    case "off_topic":
      return "Doesn't list your topics right now";
    case "cap_full":
      return `No open visit this week. Next is ${formatVisit(decision.slotAt!, decision.slotEnd)}`;
    case "no_slots":
      return decision.slotAt
        ? `No visit times this week. Next is ${formatVisit(decision.slotAt, decision.slotEnd)}`
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
  const drugIds = (params.get("drugs") ?? "").split(",").filter(Boolean);
  if (!company || drugIds.length === 0) {
    return Response.json({ error: "company and drugs are required" }, { status: 400 });
  }

  const db = createServerClient();
  const now = new Date();

  const [officesResult, drugsResult, blocksResult, acceptedResult] = await Promise.all([
    db.from("offices").select("*").order("name"),
    db.from("drugs").select("*").in("id", drugIds),
    db.from("brand_blocks").select("office_id, company"),
    db
      .from("requests")
      .select("office_id")
      .eq("decision", "accepted")
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
      status: effectiveStatus(office, now),
      todayOnly: office.today_status !== null && office.today_status_date === nyToday(now),
      topics: office.topics,
      visitSlots: office.visit_slots,
      redirectOptions: office.redirect_options,
      fit: FIT_BY_DECISION[best.decision.decision],
      reason: reasonText(best.decision, best.drug),
      drugId: best.drug.id,
    };
  });

  // Green first, then amber, then grey. Alphabetical within each.
  const order: Record<Fit, number> = { green: 0, amber: 1, grey: 2 };
  fits.sort((a, b) => order[a.fit] - order[b.fit] || a.name.localeCompare(b.name));

  return Response.json({ offices: fits });
}
