import "server-only";
import { sendEmail } from "./email";
import type { createServerClient } from "./supabase/server";
import { formatVisit } from "./week";

// How long to wait before emailing, so the desk's 10-second Undo can cancel it.
export const EMAIL_DELAY_MS = 12_000;

// Tell the rep their answer changed, after the desk overruled the sign.
// Runs after the Undo window: if the override was undone (or changed again), no email.
// Never mentions why (no blocks, no cap), same as the answer screen.
export async function emailOverride(
  db: ReturnType<typeof createServerClient>,
  requestId: string,
  overriddenAt: string
) {
  await new Promise((resolve) => setTimeout(resolve, EMAIL_DELAY_MS));

  const { data } = await db
    .from("requests")
    .select("decision, slot_at, overridden, overridden_at, rep_name, offices(name), reps(email)")
    .eq("id", requestId)
    .maybeSingle();
  // Undone, or changed again since? Compare times, not text: the database writes
  // "…+00:00" where JavaScript writes "…Z".
  const sameOverride =
    data?.overridden_at && new Date(data.overridden_at).getTime() === new Date(overriddenAt).getTime();
  if (!data || !data.overridden || !sameOverride) return;

  const email = (data.reps as unknown as { email: string | null } | null)?.email;
  if (!email) return; // the rep didn't leave an email
  const officeName = (data.offices as unknown as { name: string }).name;
  const greeting = data.rep_name ? `Hi ${data.rep_name},` : "Hi,";

  if (data.decision === "accepted") {
    const when = data.slot_at ? `${formatVisit(data.slot_at)}, 5 minutes with the team.` : "";
    await sendEmail({
      to: email,
      subject: `${officeName} can see you`,
      text: [
        greeting,
        "",
        `Good news: ${officeName} approved your visit. ${when}`.trim(),
        "Check in at the front desk when you arrive.",
        "",
        "Knock",
      ].join("\n"),
    });
  } else {
    await sendEmail({
      to: email,
      subject: `An update from ${officeName}`,
      text: [
        greeting,
        "",
        `${officeName} updated your request: they're not taking visits right now.`,
        "You're welcome to leave materials at the front desk.",
        "",
        "Knock",
      ].join("\n"),
    });
  }
}
