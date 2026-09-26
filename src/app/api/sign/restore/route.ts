import { z } from "zod";
import { pingOffice } from "@/lib/ping";
import type { SignSnapshot } from "@/lib/sign";
import { readSnapshot, writeSnapshot } from "@/lib/sign-server";
import { createServerClient } from "@/lib/supabase/server";

const RestoreBody = z.object({
  historyId: z.string().uuid(),
  // undo:   the Undo toast right after a change. Puts the sign back and forgets the change.
  // revert: "Change back" on the history line. Puts the sign back as a new change (itself undoable).
  mode: z.enum(["undo", "revert"]),
});

export async function POST(request: Request) {
  const parsed = RestoreBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid restore" }, { status: 400 });
  }
  const { historyId, mode } = parsed.data;
  const db = createServerClient();

  try {
    const entry = await db
      .from("sign_history")
      .select("office_id, summary, before")
      .eq("id", historyId)
      .maybeSingle();
    if (entry.error) throw new Error(entry.error.message);
    if (!entry.data) {
      return Response.json({ error: "Change not found" }, { status: 404 });
    }
    const officeId = entry.data.office_id as string;
    const restored = entry.data.before as SignSnapshot;

    if (mode === "undo") {
      await writeSnapshot(db, officeId, restored);
      await db.from("sign_history").delete().eq("id", historyId);
      await pingOffice(db, officeId);
      return Response.json({ historyId: null });
    }

    const current = await readSnapshot(db, officeId);
    await writeSnapshot(db, officeId, restored);
    const history = await db
      .from("sign_history")
      .insert({
        office_id: officeId,
        summary: `Changed back: ${entry.data.summary}`,
        before: current,
        after: restored,
      })
      .select("id")
      .single();
    if (history.error) throw new Error(history.error.message);

    await pingOffice(db, officeId);
    return Response.json({ historyId: history.data.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
