-- Hyrox Sim Roelofarendsveen: events, profiles, results, admins + row level security

create table public.events (
  id text primary key,
  kind text not null check (kind in ('sim', 'official')),
  name text not null,
  event_date date,
  location text,
  sort_order int not null default 0,
  accepts_entries boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.events is 'Races: the Roelofarendsveen sim editions and official Hyrox events.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  club text not null default 'Gast' check (club in ('Club Confidence', 'By Opdam', 'Gast')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Public name and club per signed-in athlete. No email here.';

create table public.admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
comment on table public.admins is 'Organisers who may verify or reject times and manage events. Managed with SQL only.';

create table public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete cascade,
  athlete_name text check (athlete_name is null or char_length(btrim(athlete_name)) between 2 and 60),
  athlete_club text check (athlete_club is null or athlete_club in ('Club Confidence', 'By Opdam', 'Gast')),
  event_id text not null references public.events (id) on update cascade,
  category text not null check (category in ('single_men', 'single_women', 'doubles_mixed', 'doubles_men', 'doubles_women', 'relay')),
  division text not null default 'open' check (division in ('open', 'pro')),
  total_seconds int not null check (total_seconds between 1800 and 12600),
  splits int[] check (splits is null or (array_length(splits, 1) = 16 and 0 < all (splits))),
  partner_name text check (partner_name is null or char_length(btrim(partner_name)) between 2 and 60),
  team_name text check (team_name is null or char_length(btrim(team_name)) between 2 and 60),
  teammates text[] check (teammates is null or array_length(teammates, 1) = 3),
  proof_url text check (proof_url is null or (proof_url ~* '^https?://' and char_length(proof_url) <= 500)),
  status text not null default 'self_reported' check (status in ('self_reported', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint results_owner_or_name check (user_id is not null or athlete_name is not null),
  constraint results_partner_for_doubles check (category not like 'doubles_%' or partner_name is not null),
  constraint results_team_for_relay check (category <> 'relay' or (team_name is not null and teammates is not null)),
  constraint results_one_per_race unique (user_id, event_id, category)
);
comment on table public.results is 'Finish times. Athletes add and edit their own; imported rows (athlete_name, no user) come from the organisers.';
create index results_board_idx on public.results (event_id, category, total_seconds);
create index results_user_idx on public.results (user_id);

-- Helper: is the signed-in user an organiser?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Guard: athletes can never verify their own time, change the owner, or write imported rows.
create or replace function public.results_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := (select auth.uid());
    new.athlete_name := null;
    new.athlete_club := null;
    new.status := 'self_reported';
  else
    new.user_id := old.user_id;
    new.athlete_name := old.athlete_name;
    new.athlete_club := old.athlete_club;
    new.created_at := old.created_at;
    if (new.total_seconds, new.splits, new.event_id, new.category, new.division)
       is distinct from (old.total_seconds, old.splits, old.event_id, old.category, old.division) then
      new.status := 'self_reported';
    else
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;
create trigger results_guard before insert or update on public.results
  for each row execute function public.results_guard();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Row level security
alter table public.events enable row level security;
alter table public.profiles enable row level security;
alter table public.results enable row level security;
alter table public.admins enable row level security;

create policy "Events are public" on public.events
  for select to anon, authenticated using (true);
create policy "Organisers manage events" on public.events
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "Athletes create their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "Athletes edit their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Leaderboard times are public" on public.results
  for select to anon, authenticated
  using (status <> 'rejected' or user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Athletes add their own times" on public.results
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and exists (select 1 from public.events e where e.id = event_id and e.accepts_entries))
    or (select public.is_admin())
  );
create policy "Athletes edit their own times" on public.results
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Athletes delete their own times" on public.results
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Public leaderboard view (respects the policies above)
create view public.leaderboard with (security_invoker = true) as
select
  r.id,
  r.event_id,
  r.category,
  r.division,
  r.total_seconds,
  r.splits,
  r.status,
  r.partner_name,
  r.team_name,
  r.teammates,
  r.user_id,
  coalesce(p.display_name, r.athlete_name) as athlete,
  coalesce(p.club, r.athlete_club, 'Gast') as club,
  r.created_at
from public.results r
left join public.profiles p on p.id = r.user_id
where r.status <> 'rejected';

grant select on public.leaderboard to anon, authenticated;

-- Events we already know about
insert into public.events (id, kind, name, location, sort_order) values
  ('sim-01', 'sim', 'Editie 01', 'HAL60, Roelofarendsveen', 1),
  ('sim-02', 'sim', 'Editie 02', 'HAL60, Roelofarendsveen', 2),
  ('sim-03', 'sim', 'Editie 03', 'HAL60, Roelofarendsveen', 3),
  ('sim-04', 'sim', 'Editie 04', 'HAL60, Roelofarendsveen', 4),
  ('off-utrecht', 'official', 'Hyrox Utrecht', 'Utrecht', 101),
  ('off-amsterdam', 'official', 'Hyrox Amsterdam', 'Amsterdam', 102);
