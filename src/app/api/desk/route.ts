import { effectiveStatus } from "@/lib/decide";
import { createServerClient } from "@/lib/supabase/server";
import type { Office } from "@/lib/types";
import { nyStartOfToday } from "@/lib/week";

// Everything the Lobby Board shows: the office and today's requests, newest first.
// Private (reason codes, blocks), so it's read here with the service role, not in the browser.
export async function GET(request: Request) {
  const officeId = new URL(request.url).searchParams.get("officeId");
  if (!officeId) {
    return Response.json({ error: "officeId is required" }, { status: 400 });
  }

  const db = createServerClient();
  const now = new Date();

  const [officeResult, requestsResult] = await Promise.all([
    db.from("offices").select("*").eq("id", officeId).maybeSingle(),
    db
      .from("requests")
      .select(
        "id, rep_name, rep_company, purpose, source, decision, reason_code, redirect_action, slot_at, overridden, redirect_taken_at, rep_message, created_at, drugs(brand)"
      )
      .eq("office_id", officeId)
      .gte("created_at", nyStartOfToday(now).toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (officeResult.error || requestsResult.error) {
    const error = officeResult.error ?? requestsResult.error;
    return Response.json({ error: error!.message }, { status: 500 });
  }
  const office = officeResult.data as Office | null;
  if (!office) {
    return Response.json({ error: "Office not found" }, { status: 404 });
  }

  return Response.json({
    office: { ...office, effective_status: effectiveStatus(office, now) },
    requests: requestsResult.data,
  });
}
