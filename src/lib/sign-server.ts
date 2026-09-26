import "server-only";
import type { SignSnapshot } from "./sign";
import type { createServerClient } from "./supabase/server";

type Db = ReturnType<typeof createServerClient>;

const SIGN_COLUMNS =
  "status, today_status, today_status_date, topics, visit_slots, weekly_cap, redirect_options";

// The office's current sign, including its private brand blocks. Null if the office doesn't exist.
export async function readSnapshot(db: Db, officeId: string): Promise<SignSnapshot | null> {
  const [office, blocks] = await Promise.all([
    db.from("offices").select(SIGN_COLUMNS).eq("id", officeId).maybeSingle(),
    db.from("brand_blocks").select("company").eq("office_id", officeId).order("company"),
  ]);
  if (office.error) throw new Error(office.error.message);
  if (blocks.error) throw new Error(blocks.error.message);
  if (!office.data) return null;

  return {
    ...(office.data as Omit<SignSnapshot, "brand_blocks">),
    brand_blocks: blocks.data.map((block) => block.company),
  };
}

// Make the office's sign match the snapshot.
export async function writeSnapshot(db: Db, officeId: string, snapshot: SignSnapshot) {
  const { brand_blocks, ...signFields } = snapshot;

  const office = await db
    .from("offices")
    .update({ ...signFields, updated_at: new Date().toISOString() })
    .eq("id", officeId);
  if (office.error) throw new Error(office.error.message);

  // Replace the block list wholesale. It's a handful of rows at most.
  const cleared = await db.from("brand_blocks").delete().eq("office_id", officeId);
  if (cleared.error) throw new Error(cleared.error.message);
  if (brand_blocks.length > 0) {
    const inserted = await db
      .from("brand_blocks")
      .insert(brand_blocks.map((company) => ({ office_id: officeId, company })));
    if (inserted.error) throw new Error(inserted.error.message);
  }
}
