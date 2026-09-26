import "server-only";
import { deskChannel } from "./desk-channel";
import type { createServerClient } from "./supabase/server";

// Tell an office's desk that something changed. The ping carries no data:
// the desk refetches from the server, so nothing private goes over realtime.
// Best effort: a missed ping only means the desk updates on its next refresh.
export async function pingDesk(db: ReturnType<typeof createServerClient>, officeId: string) {
  const channel = db.channel(deskChannel(officeId));
  try {
    await channel.httpSend("changed", {});
  } catch {
    // Ignore. The request itself already succeeded.
  } finally {
    await db.removeChannel(channel);
  }
}
