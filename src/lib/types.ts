// Shapes of the rows in supabase/schema.sql that the app works with.

export type Status = "open" | "topics" | "closed";
export type Purpose = "visit" | "drop_samples" | "lunch" | "safety_notice";
export type Source = "qr" | "fit_list";
export type RedirectAction = "drop_samples" | "virtual" | "next_slot" | "leave_materials";
export type DecisionKind = "accepted" | "redirected" | "declined";

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
// A visit time. `time` is when it starts ("HH:MM", New York time).
// With `end`, it's a window ("Tue 12:00-1:00 PM") and reps can be booked until it closes.
// Without `date` it repeats every week on `day`. With `date` ("YYYY-MM-DD") it happens
// once, on that date (and `day` is that date's weekday).
export type VisitSlot = {
  day: Day;
  time: string;
  end?: string;
  date?: string; // set for a one-off time on that date only
  skip?: string[]; // dates ("YYYY-MM-DD") a weekly time is off, e.g. the doctor is out that day
};

export type Office = {
  id: string;
  name: string;
  neighborhood: string | null;
  specialty: string | null;
  address: string | null;
  lat?: number | null; // location, for sorting the rep fit list by distance
  lng?: number | null;
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
