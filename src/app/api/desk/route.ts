import { effectiveStatus } from "@/lib/decide";
import { createServerClient } from "@/lib/supabase/server";
import type { Office } from "@/lib/types";
import { nyStartOfToday } from "@/lib/week";

// Everything the Lobby Board shows: the office, today's requests (newest first),
// and the inbox of notes and messages from reps.
// Private (reason codes, blocks), so it's read here with the service role, not in the browser.
export async function GET(request: Request) {
  const officeId = new URL(request.url).searchParams.get("officeId");
  if (!officeId) {
    return Response.json({ error: "officeId is required" }, { status: 400 });
  }

  const db = createServerClient();
  const now = new Date();

  const [officeResult, requestsResult, notesResult, messagesResult] = await Promise.all([
    db.from("offices").select("*").eq("id", officeId).maybeSingle(),
    db
      .from("requests")
      .select(
        "id, rep_name, rep_company, purpose, source, decision, reason_code, redirect_action, slot_at, overridden, overridden_at, original_decision, original_reason_code, redirect_taken_at, rep_message, created_at, drugs(brand)"
      )
      .eq("office_id", officeId)
      .gte("created_at", nyStartOfToday(now).toISOString())
      .order("created_at", { ascending: false }),
    // Rep notes ("Think we got this wrong?"), newest first.
    db
      .from("rep_notes")
      .select("id, rep_name, body, read, created_at, requests(rep_company, decision, drugs(brand))")
      .eq("office_id", officeId)
      .order("created_at", { ascending: false })
      .limit(100),
    // Messages reps sent along with a request.
    db
      .from("requests")
      .select("id, rep_name, rep_company, decision, rep_message, message_handled, created_at, drugs(brand)")
      .eq("office_id", officeId)
      .not("rep_message", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const failed = [officeResult, requestsResult, notesResult, messagesResult].find((r) => r.error);
  if (failed) {
    const error = failed.error;
    return Response.json({ error: error!.message }, { status: 500 });
  }
  const office = officeResult.data as Office | null;
  if (!office) {
    return Response.json({ error: "Office not found" }, { status: 404 });
  }

  // One inbox for everything reps wrote to the desk, newest first.
  type Joined = { rep_company: string | null; decision: string; drugs: { brand: string } | null } | null;
  const notes = (notesResult.data ?? []).map((note) => {
    const request = note.requests as unknown as Joined;
    return {
      kind: "note" as const,
      id: note.id,
      body: note.body,
      repName: note.rep_name,
      repCompany: request?.rep_company ?? null,
      drug: request?.drugs?.brand ?? null,
      decision: request?.decision ?? null,
      handled: note.read,
      createdAt: note.created_at,
    };
  });
  const messages = (messagesResult.data ?? []).map((message) => ({
    kind: "message" as const,
    id: message.id,
    body: message.rep_message as string,
    repName: message.rep_name,
    repCompany: message.rep_company,
    drug: (message.drugs as unknown as { brand: string } | null)?.brand ?? null,
    decision: message.decision,
    handled: message.message_handled,
    createdAt: message.created_at,
  }));
  const inbox = [...notes, ...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Response.json({
    office: { ...office, effective_status: effectiveStatus(office, now) },
    requests: requestsResult.data,
    inbox,
  });
}
