import { z } from "zod";
import { pingOffice } from "@/lib/ping";
import { createServerClient } from "@/lib/supabase/server";

const HandleBody = z.object({
  kind: z.enum(["note", "message"]),
  id: z.string().uuid(),
  handled: z.boolean(),
});

// Mark something in the desk's inbox as handled (or move it back to new).
// Notes use rep_notes.read; messages sent with a request use requests.message_handled.
export async function POST(request: Request) {
  const parsed = HandleBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid inbox update" }, { status: 400 });
  }
  const { kind, id, handled } = parsed.data;
  const db = createServerClient();

  const updated =
    kind === "note"
      ? await db.from("rep_notes").update({ read: handled }).eq("id", id).select("office_id").maybeSingle()
      : await db
          .from("requests")
          .update({ message_handled: handled })
          .eq("id", id)
          .select("office_id")
          .maybeSingle();

  if (updated.error) {
    return Response.json({ error: updated.error.message }, { status: 500 });
  }
  if (!updated.data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await pingOffice(db, updated.data.office_id);
  return Response.json({ ok: true });
}
