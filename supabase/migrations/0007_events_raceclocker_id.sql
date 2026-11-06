-- The RaceClocker race of an edition, filled in by the organisers in the Table Editor: only the
-- code from the link (raceclocker.com/abcd1234 -> abcd1234). With event_date (the race day, when
-- the results are live) this links a new edition without changing code or redeploying anything.
-- Editions 01-03 are still listed in assets/config.js and in the edge function.
alter table public.events add column raceclocker_id text unique check (raceclocker_id ~ '^[0-9a-f]{4,16}$');
comment on column public.events.raceclocker_id is 'Code of the RaceClocker race of this edition (raceclocker.com/<code>). Also fill in event_date: on that day the results are live.';
