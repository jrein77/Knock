import "server-only";
import { officeChannel } from "./office-channel";
import type { createServerClient } from "./supabase/server";

// Tell every open screen for this office (desk, sign) that something changed.
// The ping carries no data: screens refetch from the server, so nothing private
// goes over realtime. Best effort: a missed ping only means a screen updates on its next load.
export async function pingOffice(db: ReturnType<typeof createServerClient>, officeId: string) {
  const channel = db.channel(officeChannel(officeId));
  try {
    await channel.httpSend("changed", {});
  } catch {
    // Ignore. The change itself already succeeded.
  } finally {
    await db.removeChannel(channel);
  }
}
