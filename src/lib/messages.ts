// Short text shown to the rep with each answer.
// Grok will write these later (step 5); these templates are the fallback.
// Never mention blocks or cap usage: blocked and closed read the same.

import type { Decision } from "./decide";
import type { RedirectAction } from "./types";
import { formatSlot } from "./week";

export function templateMessage(decision: Decision, officeName: string): string {
  const { reasonCode, slotAt, redirectAction } = decision;
  // The answer screen shows the slot time in big type, so accepted text doesn't repeat it.

  if (decision.decision === "accepted") {
    if (reasonCode === "safety") {
      return `Thanks. Please bring the safety notice to the front desk at ${officeName}. Safety notices are always welcome.`;
    }
    if (reasonCode === "drop_samples") {
      return `Thanks. Drop your samples at the front desk at ${officeName} during office hours.`;
    }
    return `Check in at the front desk at ${officeName} when you arrive. The team is expecting you.`;
  }

  switch (redirectAction) {
    case "virtual":
      return `${officeName} isn't taking in-person visits on this topic right now. A short virtual meeting works instead.`;
    case "next_slot":
      return `The next open visit at ${officeName} is ${slotAt ? formatSlot(slotAt) : "next week"}.`;
    case "drop_samples":
      return `${officeName} isn't taking visits right now. You're welcome to drop samples at the front desk.`;
    default:
      return `${officeName} isn't taking visits right now. You're welcome to leave materials at the front desk.`;
  }
}

// Label for the big button under a redirect.
export function redirectLabel(action: RedirectAction, slotAt: Date | string | null): string {
  switch (action) {
    case "drop_samples":
      return "Drop samples at the front desk";
    case "virtual":
      return "Book a virtual meeting";
    case "next_slot":
      return slotAt ? `Book ${formatSlot(slotAt)} instead` : "Book the next open slot";
    case "leave_materials":
      return "Leave materials at the front desk";
  }
}

// Shown after the rep taps the redirect button. The desk sees it on the Lobby Board.
export function redirectDoneText(action: RedirectAction, slotAt: Date | string | null): string {
  switch (action) {
    case "drop_samples":
      return "Done. The front desk knows you're dropping off samples.";
    case "virtual":
      return "Done. The office will reach out to set up a virtual meeting.";
    case "next_slot":
      return slotAt ? `You're booked for ${formatSlot(slotAt)}.` : "You're booked for the next open slot.";
    case "leave_materials":
      return "Done. The front desk knows you're leaving materials.";
  }
}
