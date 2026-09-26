// Demo seed data (REQUIREMENTS.md section 8). /api/demo/reset writes this to the database.

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

// Every column is listed so a reset fully overwrites any edits made during the demo.
export const seedOffices: Office[] = [
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

export const seedBrandBlocks = [{ office_id: DEMO_OFFICE_ID, company: "Meridian Bio" }];
