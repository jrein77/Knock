-- Knock schema. Paste into Supabase SQL Editor and run once.

create table offices (
  id text primary key,
  name text not null,
  neighborhood text,
  specialty text,
  address text,
  lat double precision,            -- location, for sorting the rep fit list by distance
  lng double precision,
  npi text,
  status text not null default 'topics' check (status in ('open','topics','closed')),
  today_status text check (today_status in ('open','topics','closed')),
  today_status_date date,
  topics text[] not null default '{}',
  topics_note text,
  visit_slots jsonb not null default '[]',   -- e.g. [{"day":"Tue","time":"12:30"}]
  weekly_cap int not null default 3,
  redirect_options text[] not null default '{drop_samples,virtual,next_slot,leave_materials}',
  updated_at timestamptz not null default now()
);

create table brand_blocks (
  office_id text references offices(id) on delete cascade,
  company text not null,
  primary key (office_id, company)
);

create table drugs (
  id text primary key,
  brand text not null,
  company text not null,
  area text not null
);

create table reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  email text,
  drug_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  office_id text references offices(id) on delete cascade,
  rep_id uuid references reps(id) on delete set null,
  rep_name text,
  rep_company text,
  drug_id text references drugs(id),
  purpose text not null default 'visit' check (purpose in ('visit','drop_samples','lunch','safety_notice')),
  source text not null default 'qr' check (source in ('qr','fit_list')),
  decision text not null check (decision in ('accepted','redirected','declined')),
  reason_code text,
  redirect_action text,
  slot_at timestamptz,
  message text,                    -- answer text shown to the rep (template)
  rep_message text check (char_length(rep_message) <= 280), -- optional message from the rep to the office
  overridden boolean not null default false,
  overridden_at timestamptz,       -- when the desk overruled the sign
  original_decision text,          -- what the sign said before the override
  original_reason_code text,
  message_handled boolean not null default false, -- desk has dealt with rep_message
  redirect_taken_at timestamptz,   -- when the rep tapped the redirect button
  rep_canceled_at timestamptz,     -- when the rep canceled a visit they had booked
  created_at timestamptz not null default now()
);

create table rep_notes (
  id uuid primary key default gen_random_uuid(),
  office_id text references offices(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,
  rep_name text,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table sign_history (
  id uuid primary key default gen_random_uuid(),
  office_id text references offices(id) on delete cascade,
  summary text not null,           -- e.g. 'Closed to all reps (just today)'
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);

-- The anon key ships to every rep's phone, so it may only read the public Door Sign (offices) and drugs.
-- Everything else is read and written by server routes with the service role key.
alter table offices enable row level security;
alter table brand_blocks enable row level security;
alter table drugs enable row level security;
alter table reps enable row level security;
alter table requests enable row level security;
alter table rep_notes enable row level security;
alter table sign_history enable row level security;

create policy "public read" on offices for select using (true);
create policy "public read" on drugs for select using (true);
-- requests, rep_notes, sign_history, brand_blocks, reps: no anon policy (private).

-- Screens get live updates from a data-free broadcast ping (src/lib/ping.ts), not table changes.
alter publication supabase_realtime add table offices;
