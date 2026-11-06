-- Beveiligingstest voor de Hyrox Sim-database.
-- Plak dit in Supabase: SQL Editor > New query > Run.
-- Alles wordt aan het eind teruggedraaid. De uitkomst staat in de foutmelding
-- "TEST SUMMARY (rolled back): ..." en hoort er zo uit te zien:
--   0 import by owner -> status=verified, 2/7/10/11/14 blocked, 3 owner_is_u1=true status=self_reported,
--   4 self-verify -> self_reported, 5 en 6 rows=0, 9 rows=1 time=3950, 12 rows=1,
--   17 status=verified, 19 owner adds link -> verified, 20 owner edits time -> self_reported.
do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  out text := '';
  r record;
  n int;
  rid uuid;
  rid_u2 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test1@example.com', '{}', '{}', now(), now()),
         (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test2@example.com', '{}', '{}', now(), now()),
         (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test3@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, display_name, club) values (u2, 'Test Twee', 'Gast');
  insert into public.results (user_id, event_id, category, total_seconds) values (u2, 'sim-04', 'single_women', 4500) returning id into rid_u2;
  insert into public.results (athlete_name, athlete_club, event_id, category, total_seconds, status)
  values ('Geimporteerd Persoon', 'By Opdam', 'sim-03', 'single_men', 3900, 'verified');
  select athlete_name, status into r from public.results where athlete_name = 'Geimporteerd Persoon';
  out := out || '0 import by owner -> name=' || coalesce(r.athlete_name, 'null') || ' status=' || r.status || '; ';
  insert into public.results (athlete_name, athlete_club, event_id, category, total_seconds, status)
  values ('Afgekeurd Persoon', 'Gast', 'sim-03', 'single_men', 2000, 'rejected');
  insert into public.events (id, kind, name, sort_order, accepts_entries) values ('sim-test', 'sim', 'Gesloten', 99, false);

  -- signed in as user 1
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'email', 'test1@example.com', 'role', 'authenticated')::text, true);

  insert into public.profiles (id, display_name, club) values (u1, 'Test Een', 'By Opdam');
  out := out || '1 own profile ok; ';
  begin
    insert into public.profiles (id, display_name, club) values (u3, 'Fake', 'Gast');
    out := out || '2 FAIL profile for someone else allowed; ';
  exception when others then out := out || '2 profile for someone else blocked (' || sqlstate || '); ';
  end;

  insert into public.results (event_id, category, total_seconds, status, user_id, athlete_name)
  values ('sim-04', 'single_men', 4000, 'verified', u2, 'Hacker') returning id into rid;
  select user_id, status, athlete_name into r from public.results where id = rid;
  out := out || '3 insert -> owner_is_u1=' || (r.user_id = u1) || ' status=' || r.status || ' athlete_name=' || coalesce(r.athlete_name, 'null') || '; ';

  update public.results set status = 'verified' where id = rid;
  select status into r from public.results where id = rid;
  out := out || '4 self-verify -> ' || r.status || '; ';

  update public.results set total_seconds = 1900 where user_id = u2;
  get diagnostics n = row_count;
  out := out || '5 edit other user rows=' || n || '; ';

  delete from public.results where user_id = u2;
  get diagnostics n = row_count;
  out := out || '6 delete other user rows=' || n || '; ';

  begin
    insert into public.results (event_id, category, total_seconds) values ('sim-04', 'doubles_mixed', 4000);
    out := out || '7 FAIL doubles without partner allowed; ';
  exception when others then out := out || '7 doubles without partner blocked (' || sqlstate || '); ';
  end;

  insert into public.results (event_id, category, total_seconds, team_name, teammates)
  values ('sim-04', 'relay', 3600, 'De Sleeduwers', array['A B', 'C D', 'E F']);
  out := out || '8 relay ok; ';

  insert into public.results (user_id, event_id, category, total_seconds) values (u1, 'sim-04', 'single_men', 3950)
  on conflict (user_id, event_id, category) do update set total_seconds = excluded.total_seconds;
  select count(*) into n from public.results where user_id = u1 and event_id = 'sim-04' and category = 'single_men';
  select total_seconds into r from public.results where id = rid;
  out := out || '9 upsert same race -> rows=' || n || ' time=' || r.total_seconds || '; ';

  begin
    insert into public.results (event_id, category, total_seconds) values ('sim-test', 'single_men', 4000);
    out := out || '10 FAIL closed event accepted; ';
  exception when others then out := out || '10 closed event blocked (' || sqlstate || '); ';
  end;

  begin
    insert into public.events (id, kind, name) values ('hack', 'sim', 'Hack');
    out := out || '11 FAIL non-organiser created event; ';
  exception when others then out := out || '11 non-organiser event blocked (' || sqlstate || '); ';
  end;

  select count(*) into n from public.leaderboard where event_id = 'sim-03';
  out := out || '12 sim-03 rows for u1=' || n || ' (rejected hidden); ';

  -- anonymous visitor
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.leaderboard;
  out := out || '13 anon leaderboard rows=' || n || '; ';
  begin
    insert into public.results (event_id, category, total_seconds) values ('sim-04', 'single_men', 4000);
    out := out || '14 FAIL anon insert allowed; ';
  exception when others then out := out || '14 anon insert blocked (' || sqlstate || '); ';
  end;
  select count(*) into n from public.events;
  out := out || '15 anon events=' || n || '; ';
  select count(*) into n from public.admins;
  out := out || '16 anon admins rows=' || n || '; ';

  -- organiser
  execute 'reset role';
  insert into public.admins (email) values ('test1@example.com');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'email', 'test1@example.com', 'role', 'authenticated')::text, true);
  update public.results set status = 'verified' where id = rid_u2;
  get diagnostics n = row_count;
  select status into r from public.results where id = rid_u2;
  out := out || '17 organiser verifies -> rows=' || n || ' status=' || r.status || '; ';
  insert into public.events (id, kind, name, sort_order) values ('sim-05', 'sim', 'Editie 05', 5);
  out := out || '18 organiser adds event ok; ';

  -- owner of a verified time
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'email', 'test2@example.com', 'role', 'authenticated')::text, true);
  update public.results set proof_url = 'https://example.com/uitslag' where id = rid_u2;
  select status into r from public.results where id = rid_u2;
  out := out || '19 owner adds link -> ' || r.status || '; ';
  update public.results set total_seconds = 4400 where id = rid_u2;
  select status into r from public.results where id = rid_u2;
  out := out || '20 owner edits time -> ' || r.status || '; ';

  raise exception 'TEST SUMMARY (rolled back): %', out;
end $$;