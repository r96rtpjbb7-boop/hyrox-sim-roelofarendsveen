-- Keep the organiser check out of the public API: it was callable as /rest/v1/rpc/is_admin.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.is_admin() set schema private;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- The guard trigger calls the check by name, so point it at the new schema.
-- (Replaced again in 0003.)
create or replace function public.results_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  if private.is_admin() then
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
