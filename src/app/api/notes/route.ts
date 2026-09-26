import { z } from "zod";
import { pingOffice } from "@/lib/ping";
import { createServerClient } from "@/lib/supabase/server";

const NoteBody = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(500),
});

// "Think we got this wrong?" A rep's note on one of their answers.
// The office comes from the request itself, so a note always lands on the right desk.
export async function POST(request: Request) {
  const parsed = NoteBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid note" }, { status: 400 });
  }
  const { requestId, body } = parsed.data;
  const db = createServerClient();

  const answered = await db
    .from("requests")
    .select("office_id, rep_name")
    .eq("id", requestId)
    .maybeSingle();
  if (!answered.data) {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }

  const saved = await db.from("rep_notes").insert({
    office_id: answered.data.office_id,
    request_id: requestId,
    rep_name: answered.data.rep_name,
    body,
  });
  if (saved.error) {
    return Response.json({ error: saved.error.message }, { status: 500 });
  }

  await pingOffice(db, answered.data.office_id);
  return Response.json({ ok: true });
}
