import { effectiveStatus } from "@/lib/decide";
import { createServerClient } from "@/lib/supabase/server";
import type { Office } from "@/lib/types";
import { nyDayStart, nyToday, shiftDate } from "@/lib/week";

// The parts of a request the inbox needs to book or turn away the rep (and undo it).
const INBOX_REQUEST_COLUMNS =
  "id, rep_company, purpose, decision, slot_at, redirect_action, overridden, overridden_at, original_decision, original_reason_code, rep_canceled_at, drugs(brand)";

type InboxRequest = {
  id: string;
  rep_company: string | null;
  purpose: string;
  decision: string;
  slot_at: string | null;
  redirect_action: string | null;
  overridden: boolean;
  overridden_at: string | null;
  original_decision: string | null;
  original_reason_code: string | null;
  rep_canceled_at: string | null;
  drugs: { brand: string } | null;
};

// Everything the Lobby Board shows: the office, one day's requests (newest first; today by default),
// and the inbox of notes and messages from reps.
// Private (reason codes, blocks), so it's read here with the service role, not in the browser.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const officeId = params.get("officeId");
  if (!officeId) {
    return Response.json({ error: "officeId is required" }, { status: 400 });
  }

  const db = createServerClient();
  const now = new Date();

  // Which day's requests to show ("YYYY-MM-DD", New York). Defaults to today.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : nyToday(now);

  const [officeResult, requestsResult, notesResult, messagesResult] = await Promise.all([
    db.from("offices").select("*").eq("id", officeId).maybeSingle(),
    db
      .from("requests")
      .select(
        "id, rep_name, rep_company, purpose, source, decision, reason_code, redirect_action, slot_at, overridden, overridden_at, original_decision, original_reason_code, redirect_taken_at, rep_canceled_at, rep_message, created_at, drugs(brand)"
      )
      .eq("office_id", officeId)
      .gte("created_at", nyDayStart(day).toISOString())
      .lt("created_at", nyDayStart(shiftDate(day, 1)).toISOString())
      .order("created_at", { ascending: false }),
    // Rep notes ("Think we got this wrong?"), newest first.
    db
      .from("rep_notes")
      .select(`id, rep_name, body, read, created_at, requests(${INBOX_REQUEST_COLUMNS})`)
      .eq("office_id", officeId)
      .order("created_at", { ascending: false })
      .limit(100),
    // Messages reps sent along with a request.
    db
      .from("requests")
      .select(`${INBOX_REQUEST_COLUMNS}, rep_name, rep_message, message_handled, created_at`)
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
  // Each item carries the request it's about, so the desk can book or turn away the rep from there.
  const notes = (notesResult.data ?? []).map((note) => {
    const request = note.requests as unknown as InboxRequest | null;
    return {
      kind: "note" as const,
      id: note.id,
      body: note.body,
      repName: note.rep_name,
      repCompany: request?.rep_company ?? null,
      drug: request?.drugs?.brand ?? null,
      handled: note.read,
      createdAt: note.created_at,
      request,
    };
  });
  const messages = (messagesResult.data ?? []).map((row) => {
    const message = row as unknown as InboxRequest & {
      rep_name: string | null;
      rep_message: string;
      message_handled: boolean;
      created_at: string;
    };
    return {
      kind: "message" as const,
      id: message.id,
      body: message.rep_message,
      repName: message.rep_name,
      repCompany: message.rep_company,
      drug: message.drugs?.brand ?? null,
      handled: message.message_handled,
      createdAt: message.created_at,
      request: message,
    };
  });
  const inbox = [...notes, ...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Response.json({
    office: { ...office, effective_status: effectiveStatus(office, now) },
    day,
    today: nyToday(now),
    requests: requestsResult.data,
    inbox,
  });
}
