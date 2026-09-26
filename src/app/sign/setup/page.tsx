import { DEMO_OFFICE_ID } from "@/lib/seed";
import { SetupFlow } from "./setup-flow";

// Setting up the Door Sign, one question per screen. No auth for the demo: the demo office.
export default function SetupPage() {
  return <SetupFlow officeId={DEMO_OFFICE_ID} />;
}
