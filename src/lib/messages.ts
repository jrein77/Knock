// Short text shown to the rep with each answer, from templates keyed by decision + redirect.
// No LLM. Never mention blocks or cap usage: blocked and closed both read "Not taking visits right now."

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

  if (reasonCode === "time_unavailable" && slotAt) {
    return `That time isn't open anymore. The next open visit at ${officeName} is ${formatSlot(slotAt)}.`;
  }

  // Why it isn't a visit, then what they can do instead. Blocked and closed read the same.
  const why =
    reasonCode === "off_topic"
      ? `${officeName} isn't taking visits on this topic right now.`
      : reasonCode === "cap_full" || reasonCode === "no_slots"
        ? `${officeName} has no open visit times this week.`
        : "Not taking visits right now.";

  switch (redirectAction) {
    case "next_slot":
      return `The next open visit at ${officeName} is ${slotAt ? formatSlot(slotAt) : "next week"}.`;
    case "virtual":
      return `${why} A short virtual meeting works instead.`;
    case "drop_samples":
      return `${why} You're welcome to drop samples at the front desk.`;
    case "leave_materials":
      return `${why} You're welcome to leave materials at the front desk.`;
    default:
      // The office didn't choose anything reps can do instead.
      return `${why} Please try again another time.`;
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
