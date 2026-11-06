// RaceClocker -> Hyrox Sim Roelofarendsveen.
//
// GET /functions/v1/raceclocker?race=<RaceClocker id>
//
// Fetches the public results of a known RaceClocker race (https://raceclocker.com/<id>?JSON=1),
// turns them into the site's format (normalise.ts) and keeps the latest version in
// public.raceclocker_cache: 15 seconds on race day so the site can show the race live,
// an hour on other days. If RaceClocker is unreachable, the stored version is returned
// with "stale": true, so the results stay on the site even if RaceClocker drops the race.
//
// Deployed with verify_jwt = false: the data is public and the site calls it without a key.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalise, VERSION, ymd } from './normalise.ts';

// RaceClocker races the site may show, with the edition (events.id) they belong to and the
// race day (Amsterdam). On race day the results are refreshed every 15 seconds.
// Add the race of a new edition here and in assets/config.js (raceclocker).
const RACES: Record<string, { event: string; date: string }> = {
  '1fd4d9': { event: 'sim-01', date: '2025-10-12' }, // Hyrox Roelofarendsveen 2025
  // RaceClocker's page says Saturday 14 March, but all laps were tapped on Sunday the 15th.
  '0839eb85': { event: 'sim-02', date: '2026-03-15' }, // Hyrox sim. Roelofarendsveen editie 2
  f4b23f3b: { event: 'sim-03', date: '2026-10-18' }, // Hyrox sim. Roelofarendsveen #3
};

const LIVE_TTL_S = 15;
const ARCHIVE_TTL_S = 3600;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
};

function reply(body: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' },
  });
}

function admin() {
  let key = '';
  try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''; } catch { /* fall back below */ }
  if (!key) key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'GET') return reply({ error: 'Alleen GET' }, 405);

  const race = (new URL(req.url).searchParams.get('race') ?? '').trim().toLowerCase();
  const cfg = RACES[race];
  if (!cfg) return reply({ error: 'Onbekende race' }, 404);

  const db = admin();
  const { data: cached, error: readError } = await db.from('raceclocker_cache').select('fetched_at, payload').eq('race_id', race).maybeSingle();
  if (readError) console.error('cache read', readError.message);

  const now = Date.now();
  const today = ymd(now);
  const ttl = cfg.date === today ? LIVE_TTL_S : ARCHIVE_TTL_S;
  const age = cached ? (now - Date.parse(cached.fetched_at)) / 1000 : Infinity;
  if (cached && cached.payload?.v === VERSION && age < ttl) return reply(cached.payload, 200, Math.min(ttl, 60));

  try {
    const res = await fetch(`https://raceclocker.com/${race}?JSON=1`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`RaceClocker antwoordde ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error('RaceClocker gaf geen lijst met deelnemers');
    const payload = normalise(raw, race, cfg.event, now, cfg.date);
    if (!payload.entries.length && cached) throw new Error('RaceClocker gaf een lege lijst');
    const { error: writeError } = await db.from('raceclocker_cache').upsert({ race_id: race, event_id: cfg.event, fetched_at: payload.fetched_at, payload });
    if (writeError) console.error('cache write', writeError.message);
    return reply(payload, 200, payload.live ? LIVE_TTL_S : 60);
  } catch (e) {
    console.error('raceclocker fetch', race, e instanceof Error ? e.message : String(e));
    if (cached) return reply({ ...cached.payload, stale: true }, 200, LIVE_TTL_S);
    return reply({ error: 'RaceClocker is nu niet bereikbaar' }, 502);
  }
});
