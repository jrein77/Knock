// Demo seed data (REQUIREMENTS.md section 7). /api/demo/reset writes this to the database.

import type { Drug, Office, RedirectAction } from "./types";

export const DEMO_OFFICE_ID = "peachtree-family";

const ALL_REDIRECTS: RedirectAction[] = ["drop_samples", "virtual", "next_slot", "leave_materials"];

export const seedDrugs: Drug[] = [
  { id: "glucavia", brand: "Glucavia", company: "Norvance", area: "GLP-1 / diabetes" },
  { id: "cardexa", brand: "Cardexa", company: "Helix Pharma", area: "Anticoagulant" },
  { id: "statora", brand: "Statora", company: "Meridian Bio", area: "Lipids" },
  { id: "pulmeris", brand: "Pulmeris", company: "Aerion", area: "Asthma / COPD" },
  { id: "dermavel", brand: "Dermavel", company: "Lumen Therapeutics", area: "Psoriasis" },
];

// The five offices from the spec. Every column is listed so a reset fully
// overwrites any edits made during the demo.
const specOffices: Office[] = [
  {
    id: DEMO_OFFICE_ID,
    name: "Peachtree Family Medicine",
    neighborhood: "Midtown",
    specialty: "Primary care",
    address: null,
    npi: null,
    status: "topics",
    today_status: null,
    today_status_date: null,
    topics: ["GLP-1 / diabetes", "Lipids"],
    topics_note: null,
    visit_slots: [
      { day: "Tue", time: "12:30" },
      { day: "Thu", time: "12:30" },
      { day: "Thu", time: "15:00" },
    ],
    weekly_cap: 3,
    redirect_options: ALL_REDIRECTS,
  },
  {
    id: "decatur-heart",
    name: "Decatur Heart Associates",
    neighborhood: "Decatur",
    specialty: "Cardiology",
    address: null,
    npi: null,
    status: "open",
    today_status: null,
    today_status_date: null,
    topics: ["Anticoagulant", "Lipids"],
    topics_note: null,
    visit_slots: [
      { day: "Mon", time: "12:00" },
      { day: "Wed", time: "12:00" },
    ],
    weekly_cap: 2,
    redirect_options: ALL_REDIRECTS,
  },
  {
    id: "buckhead-derm",
    name: "Buckhead Dermatology",
    neighborhood: "Buckhead",
    specialty: "Dermatology",
    address: null,
    npi: null,
    status: "closed",
    today_status: null,
    today_status_date: null,
    topics: ["Psoriasis"],
    topics_note: null,
    visit_slots: [{ day: "Fri", time: "12:00" }],
    weekly_cap: 1,
    redirect_options: ALL_REDIRECTS,
  },
  {
    id: "inman-pulm",
    name: "Inman Park Pulmonary",
    neighborhood: "Inman Park",
    specialty: "Pulmonology",
    address: null,
    npi: null,
    status: "topics",
    today_status: null,
    today_status_date: null,
    topics: ["Asthma / COPD"],
    topics_note: null,
    visit_slots: [{ day: "Tue", time: "11:30" }],
    weekly_cap: 2,
    redirect_options: ALL_REDIRECTS,
  },
  {
    id: "westend-peds",
    name: "West End Pediatrics",
    neighborhood: "West End",
    specialty: "Pediatrics",
    address: null,
    npi: null,
    status: "closed",
    today_status: null,
    today_status_date: null,
    topics: [],
    topics_note: null,
    visit_slots: [],
    weekly_cap: 0,
    redirect_options: ALL_REDIRECTS,
  },
];

// Eight more offices so /signals has enough to work with.
// GLP-1 / diabetes is wanted at 6 offices in total (Peachtree plus 5 here).
function office(
  fields: Pick<Office, "id" | "name" | "neighborhood" | "specialty" | "status" | "topics" | "visit_slots" | "weekly_cap">
): Office {
  return {
    address: null,
    npi: null,
    today_status: null,
    today_status_date: null,
    topics_note: null,
    redirect_options: ALL_REDIRECTS,
    ...fields,
  };
}

const moreOffices: Office[] = [
  office({
    id: "grantpark-internal",
    name: "Grant Park Internal Medicine",
    neighborhood: "Grant Park",
    specialty: "Internal medicine",
    status: "open",
    topics: ["GLP-1 / diabetes", "Lipids", "Anticoagulant"],
    visit_slots: [
      { day: "Mon", time: "12:00" },
      { day: "Wed", time: "12:30" },
    ],
    weekly_cap: 3,
  }),
  office({
    id: "vahi-endo",
    name: "Virginia-Highland Endocrinology",
    neighborhood: "Virginia-Highland",
    specialty: "Endocrinology",
    status: "topics",
    topics: ["GLP-1 / diabetes"],
    visit_slots: [
      { day: "Tue", time: "12:00" },
      { day: "Thu", time: "12:00" },
    ],
    weekly_cap: 2,
  }),
  office({
    id: "sandysprings-family",
    name: "Sandy Springs Family Practice",
    neighborhood: "Sandy Springs",
    specialty: "Primary care",
    status: "topics",
    topics: ["GLP-1 / diabetes", "Asthma / COPD"],
    visit_slots: [{ day: "Wed", time: "12:00" }],
    weekly_cap: 2,
  }),
  office({
    id: "marietta-cardio",
    name: "Marietta Cardiology",
    neighborhood: "Marietta",
    specialty: "Cardiology",
    status: "open",
    topics: ["Anticoagulant", "Lipids"],
    visit_slots: [
      { day: "Tue", time: "12:30" },
      { day: "Thu", time: "12:30" },
    ],
    weekly_cap: 2,
  }),
  // Changed from Closed to Topics only 3 days ago (see seed-history.ts).
  office({
    id: "kirkwood-derm",
    name: "Kirkwood Dermatology",
    neighborhood: "Kirkwood",
    specialty: "Dermatology",
    status: "topics",
    topics: ["Psoriasis"],
    visit_slots: [{ day: "Wed", time: "11:30" }],
    weekly_cap: 1,
  }),
  office({
    id: "eastpoint-health",
    name: "East Point Community Health",
    neighborhood: "East Point",
    specialty: "Primary care",
    status: "topics",
    topics: ["GLP-1 / diabetes", "Asthma / COPD"],
    visit_slots: [
      { day: "Mon", time: "12:00" },
      { day: "Fri", time: "12:00" },
    ],
    weekly_cap: 3,
  }),
  office({
    id: "brookhaven-internal",
    name: "Brookhaven Internal Medicine",
    neighborhood: "Brookhaven",
    specialty: "Internal medicine",
    status: "closed",
    topics: ["Lipids"],
    visit_slots: [{ day: "Thu", time: "12:00" }],
    weekly_cap: 2,
  }),
  office({
    id: "o4w-primary",
    name: "Old Fourth Ward Primary Care",
    neighborhood: "Old Fourth Ward",
    specialty: "Primary care",
    status: "open",
    topics: ["GLP-1 / diabetes", "Lipids"],
    visit_slots: [
      { day: "Tue", time: "11:30" },
      { day: "Fri", time: "12:30" },
    ],
    weekly_cap: 2,
  }),
];

// Where each demo office is: the middle of its Atlanta neighborhood.
const LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "peachtree-family": { lat: 33.7838, lng: -84.383 }, // Midtown
  "decatur-heart": { lat: 33.7748, lng: -84.2963 },
  "buckhead-derm": { lat: 33.84, lng: -84.3797 },
  "inman-pulm": { lat: 33.757, lng: -84.3525 },
  "westend-peds": { lat: 33.7367, lng: -84.415 },
  "grantpark-internal": { lat: 33.7361, lng: -84.37 },
  "vahi-endo": { lat: 33.7813, lng: -84.353 },
  "sandysprings-family": { lat: 33.9304, lng: -84.3733 },
  "marietta-cardio": { lat: 33.9526, lng: -84.5499 },
  "kirkwood-derm": { lat: 33.7507, lng: -84.3208 },
  "eastpoint-health": { lat: 33.6796, lng: -84.4394 },
  "brookhaven-internal": { lat: 33.8651, lng: -84.3366 },
  "o4w-primary": { lat: 33.765, lng: -84.371 },
};

// What each office offers instead of a visit, so practices differ in how they want to hear
// from reps (Demand Signals shows this). Offices not listed, including Peachtree, offer all four.
const REDIRECT_OPTIONS: Record<string, RedirectAction[]> = {
  "decatur-heart": ["drop_samples", "next_slot"],
  "grantpark-internal": ["virtual", "drop_samples", "next_slot"],
  "vahi-endo": ["virtual", "leave_materials"],
  "sandysprings-family": ["virtual", "next_slot"],
  "marietta-cardio": ["virtual", "next_slot"],
  "kirkwood-derm": ["virtual", "leave_materials"],
  "eastpoint-health": ["drop_samples", "leave_materials", "next_slot"],
  "o4w-primary": ["virtual", "drop_samples", "next_slot"],
};

export const seedOffices: Office[] = [...specOffices, ...moreOffices].map((office) => ({
  ...office,
  ...LOCATIONS[office.id],
  redirect_options: REDIRECT_OPTIONS[office.id] ?? office.redirect_options,
}));

export const seedBrandBlocks = [{ office_id: DEMO_OFFICE_ID, company: "Meridian Bio" }];
