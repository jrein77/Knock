import { createClient } from "@supabase/supabase-js";

// Browser client. Uses the anon key, so it can only read (RLS select policies).
// All writes go through server routes using the service role client.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
