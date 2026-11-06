-- Official timing from RaceClocker.
-- The edge function supabase/functions/raceclocker fetches the public results of a
-- RaceClocker race, turns them into the site's format and stores the latest version
-- here. The site reads it through that function; this table is also the archive if
-- RaceClocker ever stops serving a race.

create table public.raceclocker_cache (
  race_id text primary key check (race_id ~ '^[0-9a-f]{8}$'),
  event_id text references public.events (id) on update cascade,
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);

comment on table public.raceclocker_cache is
  'Latest normalised RaceClocker results per race. Written only by the raceclocker edge function (secret key); public to read.';

alter table public.raceclocker_cache enable row level security;

-- The results are public on raceclocker.com as well. No insert, update or delete
-- policies: only the edge function writes, with the secret key that bypasses RLS.
create policy "Cached RaceClocker results are public" on public.raceclocker_cache
  for select to anon, authenticated using (true);
