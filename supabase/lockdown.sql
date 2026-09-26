-- Run once in the Supabase SQL Editor (after schema.sql).
-- The anon key ships to every rep's phone, so it may only read public tables:
-- offices (the Door Sign) and drugs. Everything else is read by server routes.

drop policy "public read" on requests;
drop policy "public read" on rep_notes;
drop policy "public read" on sign_history;

-- The desk gets live updates from a data-free broadcast ping, not table changes.
alter publication supabase_realtime drop table requests, rep_notes;

-- When the rep tapped the redirect button on their answer screen.
alter table requests add column redirect_taken_at timestamptz;
