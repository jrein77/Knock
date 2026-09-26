// Everything on a Door Sign that the office can edit, as one snapshot.
// sign_history stores a "before" and "after" snapshot for every change, so any change can be undone.

import type { Office } from "./types";

export type SignSnapshot = Pick<
  Office,
  | "name"
  | "specialty"
  | "address"
  | "npi"
  | "topics_note"
  | "status"
  | "today_status"
  | "today_status_date"
  | "topics"
  | "visit_slots"
  | "weekly_cap"
  | "redirect_options"
> & {
  brand_blocks: string[]; // private: reps never see these
};

export type SignChange = Partial<SignSnapshot>;

export type LastChange = { id: string; summary: string; created_at: string };
