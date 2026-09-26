import { supabase } from "@/lib/supabase/browser";
import type { Drug } from "@/lib/types";
import { FitList } from "./fit-list";

// The rep's phone: which offices are worth the drive, before they go.
export default async function RepPage() {
  const { data } = await supabase.from("drugs").select("*").order("brand");
  return <FitList drugs={(data ?? []) as Drug[]} />;
}
