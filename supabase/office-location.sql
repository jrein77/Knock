-- Run once in the Supabase SQL Editor (after desk-tracking.sql).
-- Where each office is, so the rep fit list can sort by distance. Public, like the rest of the sign.
alter table offices add column lat double precision;
alter table offices add column lng double precision;
