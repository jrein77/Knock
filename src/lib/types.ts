// Shapes of the rows in supabase/schema.sql that the app works with.

export type Status = "open" | "topics" | "closed";
export type Purpose = "visit" | "drop_samples" | "lunch" | "safety_notice";
export type Source = "qr" | "fit_list";
export type RedirectAction = "drop_samples" | "virtual" | "next_slot" | "leave_materials";
export type DecisionKind = "accepted" | "redirected" | "declined";

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export type VisitSlot = { day: Day; time: string }; // time is "HH:MM", New York time

export type Office = {
  id: string;
  name: string;
  neighborhood: string | null;
  specialty: string | null;
  address: string | null;
  npi: string | null;
  status: Status;
  today_status: Status | null;
  today_status_date: string | null; // "YYYY-MM-DD"
  topics: string[];
  topics_note: string | null;
  visit_slots: VisitSlot[];
  weekly_cap: number;
  redirect_options: RedirectAction[];
};

export type Drug = {
  id: string;
  brand: string;
  company: string;
  area: string;
};
