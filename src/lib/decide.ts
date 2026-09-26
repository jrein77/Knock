// The decision engine. Reads the office's current Door Sign and answers a rep's request.
// Plain rules, checked in order (REQUIREMENTS.md section 5). No LLM in here.

import type { DecisionKind, Drug, Office, Purpose, RedirectAction, Status } from "./types";
import { nyToday, upcomingSlots, WEEK_MS } from "./week";

export type ReasonCode =
  | "safety"
  | "blocked"
  | "closed"
  | "off_topic"
  | "drop_samples"
  | "slot"
  | "cap_full"
  | "no_slots";

export type DecideInput = {
  office: Office;
  brandBlocks: string[]; // companies this office has blocked
  drug: Drug | null; // null only for a safety notice with no drug picked
  repCompany: string;
  purpose: Purpose;
  acceptedThisWeek: number; // accepted visits with a slot in the next 7 days
  now: Date;
};

export type Decision = {
  decision: DecisionKind;
  reasonCode: ReasonCode;
  slotAt: Date | null;
  redirectAction: RedirectAction | null;
};

// "Just today" wins if it was set for today. Otherwise the regular status.
export function effectiveStatus(office: Office, now: Date): Status {
  if (office.today_status && office.today_status_date === nyToday(now)) {
    return office.today_status;
  }
  return office.status;
}

// The first of `preferred` that the office offers.
// Falls back to leaving materials, so every "no" comes with a next step.
function firstOffered(office: Office, preferred: RedirectAction[]): RedirectAction {
  const offered = preferred.find((action) => office.redirect_options.includes(action));
  return offered ?? "leave_materials";
}

// Blocked if the rep's company or the drug's company is on the office's block list.
function isBlocked(brandBlocks: string[], repCompany: string, drug: Drug | null): boolean {
  const blocked = brandBlocks.map((company) => company.trim().toLowerCase());
  const companies = [repCompany, drug?.company ?? ""].map((c) => c.trim().toLowerCase());
  return companies.some((company) => company !== "" && blocked.includes(company));
}

export function decide(input: DecideInput): Decision {
  const { office, brandBlocks, drug, repCompany, purpose, acceptedThisWeek, now } = input;
  const status = effectiveStatus(office, now);

  // 1. Safety notices always pass. Delivered at the desk, no slot needed.
  if (purpose === "safety_notice") {
    return { decision: "accepted", reasonCode: "safety", slotAt: null, redirectAction: null };
  }

  // 2. The office blocked this company. The rep never learns why.
  if (isBlocked(brandBlocks, repCompany, drug)) {
    return {
      decision: "declined",
      reasonCode: "blocked",
      slotAt: null,
      redirectAction: "leave_materials",
    };
  }

  // 3. Closed to rep visits.
  if (status === "closed") {
    return {
      decision: "declined",
      reasonCode: "closed",
      slotAt: null,
      redirectAction: firstOffered(office, ["drop_samples", "leave_materials"]),
    };
  }

  // 4. Topics only, and this drug isn't one of them.
  if (status === "topics" && drug && !office.topics.includes(drug.area)) {
    return {
      decision: "redirected",
      reasonCode: "off_topic",
      slotAt: null,
      redirectAction: firstOffered(office, ["virtual"]),
    };
  }

  // 5. Dropping off samples needs no slot.
  if (purpose === "drop_samples") {
    return { decision: "accepted", reasonCode: "drop_samples", slotAt: null, redirectAction: null };
  }

  // 6. Book the next visit slot, if the weekly cap has room.
  const slots = upcomingSlots(now, office.visit_slots);

  if (slots.length === 0) {
    return {
      decision: "redirected",
      reasonCode: "no_slots",
      slotAt: null,
      redirectAction: firstOffered(office, ["drop_samples", "leave_materials"]),
    };
  }

  if (acceptedThisWeek < office.weekly_cap) {
    return { decision: "accepted", reasonCode: "slot", slotAt: slots[0], redirectAction: null };
  }

  // Cap is full. Offer the first slot after this 7-day window.
  const nextWeek = upcomingSlots(new Date(now.getTime() + WEEK_MS), office.visit_slots);
  return {
    decision: "redirected",
    reasonCode: "cap_full",
    slotAt: nextWeek[0],
    redirectAction: firstOffered(office, ["next_slot", "leave_materials"]),
  };
}
