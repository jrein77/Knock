import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server client. Uses the service role key, which bypasses RLS.
// Only import this from route handlers and server actions.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
