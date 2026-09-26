-- Run once in the Supabase SQL Editor (after rep-message.sql).

-- Overrides: when the desk overruled the sign, and what the sign had said.
alter table requests add column overridden_at timestamptz;
alter table requests add column original_decision text;
alter table requests add column original_reason_code text;

-- Rep messages sent with a request: whether the desk has dealt with it.
-- (Notes already have rep_notes.read for the same thing.)
alter table requests add column message_handled boolean not null default false;
