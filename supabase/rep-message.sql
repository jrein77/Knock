-- Run once in the Supabase SQL Editor (after lockdown.sql).
-- Optional message from the rep to the office. Shown on the desk card; never affects the decision.
alter table requests add column rep_message text check (char_length(rep_message) <= 280);
