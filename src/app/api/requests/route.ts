import { z } from "zod";
import { decide } from "@/lib/decide";
import { templateMessage } from "@/lib/messages";
import { pingOffice } from "@/lib/ping";
import { createServerClient } from "@/lib/supabase/server";
import type { Drug, Office } from "@/lib/types";
import { WEEK_MS } from "@/lib/week";

const RequestBody = z.object({
  officeId: z.string().min(1),
  repId: z.string().uuid().nullable(),
  rep: z.object({
    name: z.string().trim().min(1),
    company: z.string().trim().min(1),
    email: z.string().trim(),
  }),
  drugId: z.string().nullable(),
  purpose: z.enum(["visit", "drop_samples", "lunch", "safety_notice"]),
  source: z.enum(["qr", "fit_list"]),
  // Optional note for the office. Shown on the desk; never affects the decision.
  repMessage: z.string().trim().max(280).optional(),
});

// A rep asks to visit an office. The decision engine answers from the current Door Sign.
// The response never includes the reason code (reps don't see why).
export async function POST(request: Request) {
  const parsed = RequestBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = parsed.data;
  if (!body.drugId && body.purpose !== "safety_notice") {
    return Response.json({ error: "Pick what you're bringing" }, { status: 400 });
  }

  const db = createServerClient();
  const now = new Date();

  // Everything the decision needs, fetched in parallel. Always the current sign.
  const [officeResult, drugResult, blocksResult, acceptedResult] = await Promise.all([
    db.from("offices").select("*").eq("id", body.officeId).maybeSingle(),
    body.drugId
      ? db.from("drugs").select("*").eq("id", body.drugId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("brand_blocks").select("company").eq("office_id", body.officeId),
    db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("office_id", body.officeId)
      .eq("decision", "accepted")
      .gte("slot_at", now.toISOString())
      .lt("slot_at", new Date(now.getTime() + WEEK_MS).toISOString()),
  ]);

  const failed = [officeResult, drugResult, blocksResult, acceptedResult].find((r) => r.error);
  if (failed) {
    return Response.json({ error: failed.error!.message }, { status: 500 });
  }
  const office = officeResult.data as Office | null;
  if (!office) {
    return Response.json({ error: "Office not found" }, { status: 404 });
  }
  const drug = drugResult.data as Drug | null;

  const repId = await findOrCreateRep(db, body.repId, body.rep, body.drugId);

  const decision = decide({
    office,
    brandBlocks: (blocksResult.data ?? []).map((block) => block.company),
    drug,
    repCompany: body.rep.company,
    purpose: body.purpose,
    acceptedThisWeek: acceptedResult.count ?? 0,
    now,
  });
  const message = templateMessage(decision, office.name);

  const saved = await db
    .from("requests")
    .insert({
      office_id: office.id,
      rep_id: repId,
      rep_name: body.rep.name,
      rep_company: body.rep.company,
      drug_id: drug?.id ?? null,
      purpose: body.purpose,
      source: body.source,
      decision: decision.decision,
      reason_code: decision.reasonCode,
      redirect_action: decision.redirectAction,
      slot_at: decision.slotAt?.toISOString() ?? null,
      message,
      rep_message: body.repMessage || null,
    })
    .select("id")
    .single();

  if (saved.error) {
    return Response.json({ error: saved.error.message }, { status: 500 });
  }
  await pingOffice(db, office.id);

  return Response.json({
    requestId: saved.data.id,
    repId,
    decision: decision.decision,
    slotAt: decision.slotAt?.toISOString() ?? null,
    slotEnd: decision.slotEnd?.toISOString() ?? null,
    redirectAction: decision.redirectAction,
    message,
  });
}

// Reuse the rep saved on this phone if it still exists, otherwise create one.
async function findOrCreateRep(
  db: ReturnType<typeof createServerClient>,
  repId: string | null,
  rep: { name: string; company: string; email: string },
  drugId: string | null
): Promise<string | null> {
  if (repId) {
    const existing = await db.from("reps").select("id").eq("id", repId).maybeSingle();
    if (existing.data) return existing.data.id;
  }

  const created = await db
    .from("reps")
    .insert({
      name: rep.name,
      company: rep.company,
      email: rep.email || null,
      drug_ids: drugId ? [drugId] : [],
    })
    .select("id")
    .single();

  // Saving the rep is nice to have; the request still goes through without it.
  return created.data?.id ?? null;
}
