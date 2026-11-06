-- The guard only rewrites rows written by website visitors (anon/authenticated).
-- The dashboard, SQL editor and service role (imports, verifying times) are left alone.
create or replace function public.results_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if current_user not in ('anon', 'authenticated') or private.is_admin() then
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
