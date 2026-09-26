import { z } from "zod";
import { effectiveStatus } from "@/lib/decide";
import { pingOffice } from "@/lib/ping";
import type { LastChange } from "@/lib/sign";
import { readSnapshot, writeSnapshot } from "@/lib/sign-server";
import { createServerClient } from "@/lib/supabase/server";
import type { Office } from "@/lib/types";

// The Door Sign for the office's own screens (/sign and the desk), with its private parts:
// brand blocks, the weekly cap, and the most recent change.
export async function GET(request: Request) {
  const officeId = new URL(request.url).searchParams.get("officeId");
  if (!officeId) {
    return Response.json({ error: "officeId is required" }, { status: 400 });
  }
  const db = createServerClient();

  const [office, blocks, lastChange, drugs] = await Promise.all([
    db.from("offices").select("*").eq("id", officeId).maybeSingle(),
    db.from("brand_blocks").select("company").eq("office_id", officeId).order("company"),
    db
      .from("sign_history")
      .select("id, summary, created_at")
      .eq("office_id", officeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("drugs").select("area, company"),
  ]);

  const failed = [office, blocks, lastChange, drugs].find((result) => result.error);
  if (failed) {
    return Response.json({ error: failed.error!.message }, { status: 500 });
  }
  if (!office.data) {
    return Response.json({ error: "Office not found" }, { status: 404 });
  }

  // Choices for the topic and block editors.
  const areas = [...new Set((drugs.data ?? []).map((drug) => drug.area))].sort();
  const companies = [...new Set((drugs.data ?? []).map((drug) => drug.company))].sort();

  return Response.json({
    office: { ...office.data, effective_status: effectiveStatus(office.data as Office, new Date()) },
    brandBlocks: (blocks.data ?? []).map((block) => block.company),
    lastChange: lastChange.data as LastChange | null,
    areas,
    companies,
  });
}

const Status = z.enum(["open", "topics", "closed"]);

const SignChange = z
  .object({
    name: z.string().trim().min(1).max(120),
    specialty: z.string().trim().max(120).nullable(),
    address: z.string().trim().max(200).nullable(),
    npi: z.string().regex(/^\d{10}$/).nullable(),
    topics_note: z.string().trim().max(280).nullable(),
    status: Status,
    today_status: Status.nullable(),
    today_status_date: z.string().nullable(),
    topics: z.array(z.string().trim().min(1)),
    visit_slots: z.array(
      z.object({
        day: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        skip: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
      })
    ),
    weekly_cap: z.number().int().min(0).max(10),
    redirect_options: z.array(z.enum(["drop_samples", "virtual", "next_slot", "leave_materials"])),
    brand_blocks: z.array(z.string().trim().min(1)),
  })
  .partial();

const SaveBody = z.object({
  officeId: z.string().min(1),
  change: SignChange,
  summary: z.string().min(1),
});

// Apply one change to the sign. It takes effect on the very next request.
// Returns the history id so the change can be undone.
export async function POST(request: Request) {
  const parsed = SaveBody.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid change" }, { status: 400 });
  }
  const { officeId, change, summary } = parsed.data;
  const db = createServerClient();

  try {
    const before = await readSnapshot(db, officeId);
    if (!before) {
      return Response.json({ error: "Office not found" }, { status: 404 });
    }
    const after = { ...before, ...change };
    await writeSnapshot(db, officeId, after);

    const history = await db
      .from("sign_history")
      .insert({ office_id: officeId, summary, before, after })
      .select("id")
      .single();
    if (history.error) throw new Error(history.error.message);

    await pingOffice(db, officeId);
    return Response.json({ historyId: history.data.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
