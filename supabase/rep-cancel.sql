-- Run once in the Supabase SQL Editor (after office-location.sql).
-- When the rep canceled a visit they had booked. Canceled visits no longer count
-- toward the office's weekly cap.
alter table requests add column rep_canceled_at timestamptz;
