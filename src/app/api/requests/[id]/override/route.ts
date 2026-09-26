import { after } from "next/server";
import { z } from "zod";
import { emailOverride } from "@/lib/override-email";
import { pingOffice } from "@/lib/ping";
import { createServerClient } from "@/lib/supabase/server";
import type { Office } from "@/lib/types";
import { upcomingSlots } from "@/lib/week";

// The columns an override changes. Undo sends the saved copy back with action "restore".
const Snapshot = z.object({
  decision: z.enum(["accepted", "redirected", "declined"]),
  slot_at: z.string().nullable(),
  redirect_action: z.string().nullable(),
  overridden: z.boolean(),
  overridden_at: z.string().nullable(),
  original_decision: z.string().nullable(),
  original_reason_code: z.string().nullable(),
});

const OverrideBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("restore"), previous: Snapshot }),
]);

// Long enough to wait out the Undo window before emailing the rep (see emailOverride).
export const maxDuration = 30;

// The front desk overrules the sign: "Approve anyway" or "Decline", plus Undo.
// After an approve or decline, the rep gets an email unless the desk undoes it in time.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = OverrideBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid override" }, { status: 400 });
  }
  const body = parsed.data;
  const db = createServerClient();

  const existing = await db
    .from("requests")
    .select(
      "office_id, purpose, decision, reason_code, redirect_action, slot_at, overridden, original_decision, original_reason_code, offices(visit_slots)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!existing.data) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }
  const request_ = existing.data;

  let changes: z.infer<typeof Snapshot>;

  // What the sign decided, kept from the first override so the desk can always see it.
  const original = request_.overridden
    ? {
        original_decision: request_.original_decision,
        original_reason_code: request_.original_reason_code,
      }
    : { original_decision: request_.decision, original_reason_code: request_.reason_code };
  const overriddenAt = new Date().toISOString();

  if (body.action === "restore") {
    changes = body.previous;
  } else if (body.action === "approve") {
    // Visits and lunches get the next slot this week, even if the cap is full.
    const needsSlot = request_.purpose === "visit" || request_.purpose === "lunch";
    const office = request_.offices as unknown as Pick<Office, "visit_slots">;
    const nextSlot = needsSlot ? upcomingSlots(new Date(), office.visit_slots)[0] : undefined;
    changes = {
      decision: "accepted",
      slot_at: nextSlot?.toISOString() ?? null,
      redirect_action: null,
      overridden: true,
      overridden_at: overriddenAt,
      ...original,
    };
  } else {
    // Safety notices always pass. Nobody can decline them.
    if (request_.purpose === "safety_notice") {
      return Response.json({ error: "Safety notices can't be declined" }, { status: 400 });
    }
    changes = {
      decision: "declined",
      slot_at: null,
      redirect_action: "leave_materials",
      overridden: true,
      overridden_at: overriddenAt,
      ...original,
    };
  }

  const updated = await db.from("requests").update(changes).eq("id", id);
  if (updated.error) {
    return Response.json({ error: updated.error.message }, { status: 500 });
  }

  await pingOffice(db, request_.office_id);
  if (body.action !== "restore") {
    // If a booked visit was just declined, the email says it's canceled (and when it was).
    const wasBooked = request_.decision === "accepted" && body.action === "decline";
    const canceledSlot = wasBooked ? request_.slot_at : null;
    after(() => emailOverride(db, id, changes.overridden_at!, { wasBooked, canceledSlot }));
  }
  return Response.json({ ok: true });
}
