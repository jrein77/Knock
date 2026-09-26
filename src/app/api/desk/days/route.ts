import { createServerClient } from "@/lib/supabase/server";
import { nyDayStart, nyToday } from "@/lib/week";

// How many requests an office had on each day of a month, for the desk's calendar.
// GET /api/desk/days?officeId=peachtree-family&month=2026-09 -> { "2026-09-24": 3, ... }
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const officeId = params.get("officeId");
  const month = params.get("month") ?? "";
  if (!officeId || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "officeId and month (YYYY-MM) are required" }, { status: 400 });
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;

  const db = createServerClient();
  const { data, error } = await db
    .from("requests")
    .select("created_at")
    .eq("office_id", officeId)
    .gte("created_at", nyDayStart(`${month}-01`).toISOString())
    .lt("created_at", nyDayStart(`${nextMonth}-01`).toISOString());
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const row of data) {
    const day = nyToday(new Date(row.created_at));
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return Response.json(counts);
}
