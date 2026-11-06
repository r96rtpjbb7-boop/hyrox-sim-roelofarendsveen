-- RaceClocker race ids are not always 8 characters: edition 01 is raceclocker.com/1fd4d9.
alter table public.raceclocker_cache drop constraint raceclocker_cache_race_id_check;
alter table public.raceclocker_cache add constraint raceclocker_cache_race_id_check check (race_id ~ '^[0-9a-f]{4,16}$');
