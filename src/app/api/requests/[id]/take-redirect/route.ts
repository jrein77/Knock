import { pingDesk } from "@/lib/ping";
import { createServerClient } from "@/lib/supabase/server";

// The rep tapped the redirect button on their answer screen (e.g. "Book Tuesday instead").
// Taking a next-slot redirect books that slot. Other redirects are just recorded for the desk.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServerClient();

  const existing = await db
    .from("requests")
    .select("office_id, redirect_action")
    .eq("id", id)
    .maybeSingle();
  if (!existing.data || !existing.data.redirect_action) {
    return Response.json({ error: "Nothing to take" }, { status: 404 });
  }

  const booksSlot = existing.data.redirect_action === "next_slot";
  const updated = await db
    .from("requests")
    .update({
      redirect_taken_at: new Date().toISOString(),
      ...(booksSlot ? { decision: "accepted" } : {}),
    })
    .eq("id", id);
  if (updated.error) {
    return Response.json({ error: updated.error.message }, { status: 500 });
  }

  await pingDesk(db, existing.data.office_id);
  return Response.json({ ok: true });
}
