-- The site only reads raceclocker_cache; the edge function writes it with the secret key.
-- RLS already blocks writes from visitors (there are no insert, update or delete policies),
-- but TRUNCATE is not covered by RLS, so take the write privileges away as well.

revoke insert, update, delete, truncate, references, trigger on public.raceclocker_cache from anon, authenticated;
