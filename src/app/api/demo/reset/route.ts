import { createServerClient } from "@/lib/supabase/server";
import { DEMO_OFFICE_ID, seedBrandBlocks, seedDrugs, seedOffices } from "@/lib/seed";
import { upcomingSlots } from "@/lib/week";

// Restores the demo to its starting state:
// clears requests, rep notes and sign history, restores the seed offices,
// drugs and brand blocks, and reseeds 1 accepted visit at Peachtree's next slot.
export async function POST() {
  const db = createServerClient();

  // Delete every row. Supabase requires a filter on delete, so match all ids.
  // rep_notes first because they reference requests.
  const cleared = await Promise.all([
    db.from("rep_notes").delete().not("id", "is", null),
    db.from("sign_history").delete().not("id", "is", null),
  ]);
  const requestsCleared = await db.from("requests").delete().not("id", "is", null);
  const blocksCleared = await db.from("brand_blocks").delete().not("office_id", "is", null);

  const drugs = await db.from("drugs").upsert(seedDrugs);
  const now = new Date().toISOString();
  const offices = await db
    .from("offices")
    .upsert(seedOffices.map((office) => ({ ...office, updated_at: now })));
  const blocks = await db.from("brand_blocks").insert(seedBrandBlocks);

  // The 1 accepted visit this week, so the cap (3) fills during the expo.
  const peachtree = seedOffices.find((office) => office.id === DEMO_OFFICE_ID)!;
  const nextSlot = upcomingSlots(new Date(), peachtree.visit_slots)[0];
  const visit = await db.from("requests").insert({
    office_id: DEMO_OFFICE_ID,
    rep_name: "Dana Brooks",
    rep_company: "Norvance",
    drug_id: "glucavia",
    purpose: "visit",
    source: "fit_list",
    decision: "accepted",
    reason_code: "slot",
    slot_at: nextSlot.toISOString(),
  });

  const results = [...cleared, requestsCleared, blocksCleared, drugs, offices, blocks, visit];
  const failed = results.find((result) => result.error);
  if (failed) {
    return Response.json({ ok: false, error: failed.error!.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
