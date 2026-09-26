// Status colors and labels, shared by every surface.
// green = open / accepted, amber = topics / redirected, grey = closed / declined.

import type { DecisionKind, Status } from "./types";

export const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  open: { label: "Open to reps", className: "bg-status-open text-status-open-foreground" },
  topics: { label: "Topics only", className: "bg-status-topics text-status-topics-foreground" },
  closed: { label: "Closed to reps", className: "bg-status-closed text-status-closed-foreground" },
};

export const DECISION_STYLE: Record<DecisionKind, { label: string; className: string }> = {
  accepted: { label: "Accepted", className: STATUS_STYLE.open.className },
  redirected: { label: "Redirected", className: STATUS_STYLE.topics.className },
  declined: { label: "Declined", className: STATUS_STYLE.closed.className },
};
