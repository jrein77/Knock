import { DEMO_OFFICE_ID } from "@/lib/seed";
import { LobbyBoard } from "./lobby-board";

// The front desk's laptop. No auth for the demo: it always shows the demo office.
export default function DeskPage() {
  return <LobbyBoard officeId={DEMO_OFFICE_ID} />;
}
