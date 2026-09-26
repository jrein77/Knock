import { z } from "zod";
import { pingOffice } from "@/lib/ping";
import { createServerClient } from "@/lib/supabase/server";

const CancelBody = z.object({
  repId: z.string().uuid(),
  undo: z.boolean().optional(), // the rep's Undo right after canceling
});

// A rep cancels a visit they booked (or undoes that). Only the rep who booked it can.
// The desk sees it live, and the visit stops counting toward the weekly cap.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = CancelBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid cancel" }, { status: 400 });
  }
  const { repId, undo } = parsed.data;
  const db = createServerClient();

  const updated = await db
    .from("requests")
    .update({ rep_canceled_at: undo ? null : new Date().toISOString() })
    .eq("id", id)
    .eq("rep_id", repId)
    .eq("decision", "accepted")
    .select("office_id")
    .maybeSingle();

  if (updated.error) {
    return Response.json({ error: updated.error.message }, { status: 500 });
  }
  if (!updated.data) {
    return Response.json({ error: "Visit not found" }, { status: 404 });
  }

  await pingOffice(db, updated.data.office_id);
  return Response.json({ ok: true });
}
