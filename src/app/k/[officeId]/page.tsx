import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import type { Drug } from "@/lib/types";
import { RequestFlow } from "./request-flow";

// QR landing. A rep scans the code at the front desk and asks to visit.
export default async function QrLandingPage(props: PageProps<"/k/[officeId]">) {
  const { officeId } = await props.params;

  // Public reads, so the anon key is enough.
  const [officeResult, drugsResult] = await Promise.all([
    supabase.from("offices").select("id, name").eq("id", officeId).maybeSingle(),
    supabase.from("drugs").select("*").order("brand"),
  ]);

  if (!officeResult.data) {
    notFound();
  }

  return (
    <RequestFlow
      officeId={officeResult.data.id}
      officeName={officeResult.data.name}
      drugs={(drugsResult.data ?? []) as Drug[]}
    />
  );
}
