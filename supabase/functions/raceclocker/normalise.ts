// Turns the public RaceClocker results JSON (https://raceclocker.com/<id>?JSON=1)
// into the format the site shows. Pure logic, no network: also tested with Node.
//
// RaceClocker gives one record per participant (some races start with a header row). Times are
// clock times in Europe/Amsterdam. Laps: lap 0 is the start, laps 1-16 are run 1,
// station 1, run 2, ... station 8. A segment time is the difference between two laps.

// Raise when the payload changes: the edge function then refetches instead of serving
// a cached payload in the old format.
export const VERSION = 5;
export const SEGMENTS = 16;
export const TZ = 'Europe/Amsterdam';
// With more than 16 laps, a lap within this many ms after the previous one is a double tap.
const DOUBLE_TAP_MS = 5000;
// No run or station takes less than this (tenths of a second). Two laps closer together are a
// tap that was missed and made up for with a double tap.
const MIN_SEGMENT_DS = 200;

// RaceClocker's "Gender" column holds the category of the race. Edition 01 left it empty and
// has a code in "Custom" instead: H, D or M (heren, dames, mixed) + S or D (single, duo).
const CATEGORY: Record<string, string> = {
  'hs': 'single_men', 'ds': 'single_women', 'hd': 'doubles_men', 'dd': 'doubles_women', 'md': 'doubles_mixed',
  'man': 'single_men', 'men': 'single_men', 'single man': 'single_men', 'single men': 'single_men', 'single heren': 'single_men',
  'woman': 'single_women', 'women': 'single_women', 'single woman': 'single_women', 'single women': 'single_women', 'single dames': 'single_women',
  'duo men': 'doubles_men', 'duo man': 'doubles_men', 'men duo': 'doubles_men', 'duo heren': 'doubles_men',
  'duo women': 'doubles_women', 'duo woman': 'doubles_women', 'women duo': 'doubles_women', 'duo dames': 'doubles_women',
  'mixed duo': 'doubles_mixed', 'duo mixed': 'doubles_mixed', 'mixed': 'doubles_mixed', 'duo mix': 'doubles_mixed',
  'relay': 'relay', 'estafette': 'relay',
  'kids': 'kids',
};
// Categories with their own, shorter format: the 16 laps are not run + station, so only
// the total time is shown.
const TOTAL_ONLY = new Set(['kids']);

export type Status = 'finished' | 'running' | 'waiting' | 'dnf' | 'dns';

export interface Merged {
  from: number; // first segment (0-15) without a reliable time of its own
  to: number; // last such segment
  s: number; // seconds for these segments together
}

export interface Entry {
  bib: string;
  name: string;
  names: string[];
  cat: string | null;
  cat_raw: string;
  age: string;
  wave: string;
  status: Status;
  laps: number; // segments completed (0-16)
  total: number | null; // seconds, incl. penalty
  // One time per completed segment, in seconds; null where the laps were tapped out of
  // order (see merged). null as a whole when only the total counts (kids).
  splits: (number | null)[] | null;
  merged?: Merged[];
  penalty: number; // seconds
  penalty_note?: string;
  start: number | null; // epoch ms
  last: number | null; // epoch ms of the latest lap
}

export interface Payload {
  v: number;
  race: string;
  event: string;
  date: string | null; // race day, YYYY-MM-DD in Amsterdam
  live: boolean; // race day is today
  fetched_at: string;
  entries: Entry[];
  skipped: { bib: string; name: string; reason: string }[];
  issues: { bib: string; name: string; issue: string }[];
  stats: Record<string, Record<string, number>>;
}

const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const CLOCK_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function ymd(ms: number): string {
  return DATE_FMT.format(new Date(ms));
}

// "10:04:22.8" in Amsterdam, for messages about a lap.
export function clock(ms: number): string {
  return CLOCK_FMT.format(new Date(ms)) + '.' + Math.floor((((ms % 1000) + 1000) % 1000) / 100);
}

// Epoch ms of a wall-clock time in Amsterdam ("2026-10-18", "08:01:41" or "08:01:41.3").
export function amsToEpoch(date: string, time: string, tenths = 0): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').trim());
  const t = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d))?/.exec(String(time ?? '').trim());
  if (!d || !t) return null;
  const guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], +t[3]);
  const p: Record<string, string> = {};
  for (const part of PARTS_FMT.formatToParts(new Date(guess))) p[part.type] = part.value;
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const dc = t[4] !== undefined ? +t[4] : (Number.isFinite(tenths) ? tenths : 0);
  return guess - (shown - guess) + dc * 100;
}

function seconds(v: unknown): number {
  const s = String(v ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(+s);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(s);
  return m ? (+(m[1] ?? 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}

function clean(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

export function splitNames(name: string): string[] {
  return name.split(/\s*(?:&|\+|\/|,|\s(?:en|and)\s)\s*/i).map((s) => s.trim()).filter(Boolean);
}

// t[0] = 0 is the start, t[1..n] the laps (time since the start). A lap is trusted when it is
// part of every longest chain of laps that keep going up in time. A lap that is out of order
// drops out; when two laps contradict each other and either could be the wrong one, both do.
export function trustedLaps(t: number[]): boolean[] {
  const n = t.length - 1;
  const L = new Array(n + 1).fill(0); // longest chain from the start up to and including i (0 = not after the start)
  const R = new Array(n + 1).fill(0); // longest chain from i onwards
  L[0] = 1;
  for (let i = 1; i <= n; i++) {
    let best = 0;
    for (let j = 0; j < i; j++) if (L[j] > 0 && t[j] < t[i]) best = Math.max(best, L[j]);
    L[i] = best ? best + 1 : 0;
  }
  for (let i = n; i >= 0; i--) {
    if (L[i] === 0) continue;
    let best = 0;
    for (let j = i + 1; j <= n; j++) if (L[j] > 0 && t[j] > t[i]) best = Math.max(best, R[j]);
    R[i] = best + 1;
  }
  const len = R[0];
  const onSome = t.map((_, i) => L[i] > 0 && L[i] + R[i] - 1 === len);
  const atPos: Record<number, number> = {};
  onSome.forEach((on, i) => { if (on) atPos[L[i]] = (atPos[L[i]] ?? 0) + 1; });
  return onSome.map((on, i) => on && atPos[L[i]] === 1);
}

// Segment times from the laps; segments next to an untrusted or missing lap (null) get null,
// and each run of those gets one combined time when the laps around it are trusted.
export function lapSplits(start: number, marks: (number | null)[]) {
  const tenths = [0, ...marks.map((ms) => (ms === null ? NaN : Math.round((ms - start) / 100)))];
  const ok = trustedLaps(tenths); // a missing lap (NaN) is never trusted
  const missing = marks.map((ms, i) => (ms === null ? i + 1 : -1)).filter((i) => i > 0);
  const order = ok.map((v, i) => (v || Number.isNaN(tenths[i]) ? -1 : i)).filter((i) => i > 0);
  // A segment of a few seconds: the timer missed a lap and tapped twice at the next one, so
  // the first of the two taps is not when that lap was done.
  const double: { lap: number; gap: number }[] = [];
  let prev = 0;
  for (let i = 1; i < tenths.length; i++) {
    if (!ok[i]) continue;
    const gap = tenths[i] - tenths[prev];
    if (gap < MIN_SEGMENT_DS) {
      const wrong = prev > 0 ? prev : i;
      ok[wrong] = false;
      double.push({ lap: wrong, gap: Math.round(gap / 10) });
      if (wrong === i) continue;
    }
    prev = i;
  }
  const sec = tenths.map((x) => Math.round(x / 10));
  const splits: (number | null)[] = [];
  for (let i = 0; i < marks.length; i++) splits.push(ok[i] && ok[i + 1] ? sec[i + 1] - sec[i] : null);
  const merged: Merged[] = [];
  for (let a = 0; a < splits.length; a++) {
    if (splits[a] !== null) continue;
    let b = a;
    while (b + 1 < splits.length && splits[b + 1] === null) b++;
    if (ok[a] && ok[b + 1]) merged.push({ from: a, to: b, s: sec[b + 1] - sec[a] });
    a = b;
  }
  return { splits, merged, order, missing, double, lastOk: ok[marks.length] };
}

// deno-lint-ignore no-explicit-any
export function normalise(raw: any[], race: string, event: string, now = Date.now(), raceDate: string | null = null): Payload {
  const today = ymd(now);
  const entries: Entry[] = [];
  const skipped: Payload['skipped'] = [];
  const issues: Payload['issues'] = [];
  const days: Record<string, number> = {};

  // deno-lint-ignore no-explicit-any
  const parsed: { p: any; bib: string; name: string; start: number | null; lap0: boolean; marks: (number | null)[] }[] = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const bib = clean(p?.['Bib number']);
    const name = clean(p?.Name);
    const timed = Array.isArray(p?.Laps) && p.Laps.length > 0;
    if (!/^\d+$/.test(bib)) {
      // A header row ("Startnummer") is left out quietly. Laps without a bib number cannot be
      // linked to anyone: left out, but listed so the organisers can fix it in RaceClocker.
      if (!bib && timed) skipped.push({ bib, name, reason: 'geen startnummer' });
      continue;
    }
    if (!name || /^test\b/i.test(name)) { skipped.push({ bib, name, reason: 'testdeelnemer' }); continue; }
    // RaceClocker's name for a bib that was tapped but is not on the start list.
    if (/^unknown$/i.test(name)) { skipped.push({ bib, name, reason: 'onbekende deelnemer, naam ontbreekt in RaceClocker' }); continue; }
    // deno-lint-ignore no-explicit-any
    const laps = (Array.isArray(p.Laps) ? p.Laps : []).map((l: any) => ({
      n: parseInt(String(l?.LapNumber ?? ''), 10),
      ms: amsToEpoch(String(l?.LapDate ?? ''), String(l?.LapTime ?? ''), parseInt(String(l?.LapTimedc ?? '0'), 10)),
    })).filter((l: { n: number; ms: number | null }) => Number.isFinite(l.n) && l.ms !== null)
      .sort((a: { n: number }, b: { n: number }) => a.n - b.n) as { n: number; ms: number }[];
    const lap0 = laps.find((l) => l.n === 0);
    const start = lap0 ? lap0.ms : amsToEpoch(clean(p['Start date']), clean(p.Start));
    const numbered = laps.filter((l) => l.n >= 1);
    let marks: (number | null)[] = numbered.map((l) => l.ms);
    // RaceClocker numbers the taps 1, 2, 3 ... A tap deleted afterwards leaves a gap in those
    // numbers. The numbers then still say which lap each tap was; the gap is a lap without a time.
    const top = numbered.length ? numbered[numbered.length - 1].n : 0;
    if (top <= SEGMENTS && top > numbered.length && new Set(numbered.map((l) => l.n)).size === numbered.length) {
      marks = Array.from({ length: top }, (_, i) => numbered.find((l) => l.n === i + 1)?.ms ?? null);
    }
    // A race with a finish line on top of the laps: then the laps stop at 15.
    const finish = /^0?0:00:00/.test(clean(p.Finish)) ? null : amsToEpoch(clean(p['Finish date']), clean(p.Finish));
    if (finish !== null && marks.length === SEGMENTS - 1) marks.push(finish);
    if (start !== null) days[ymd(start)] = (days[ymd(start)] ?? 0) + 1;
    parsed.push({ p, bib, name, start, lap0: !!lap0, marks });
  }

  // Race day: as configured, unless most participants clearly started on another day.
  const common = Object.entries(days).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let date = raceDate ?? common;
  if (raceDate && common && common !== raceDate && days[common] > (days[raceDate] ?? 0)) {
    issues.push({ bib: '', name: '', issue: `racedatum ${raceDate} in de functie klopt niet, de meeste starts zijn op ${common}` });
    date = common;
  }
  const phase = !date ? 'past' : date > today ? 'future' : date < today ? 'past' : 'today';

  for (const x of parsed) {
    const { p, bib, name, start } = x;
    let marks = x.marks;
    const times = (a: (number | null)[]) => a.filter((v): v is number => v !== null);

    // Laps on another day than the race: a test of the timing, not part of the race.
    const offDay = date ? [start, ...marks].filter((v): v is number => v !== null).map(ymd).find((d) => d !== date) : undefined;
    if (offDay) { skipped.push({ bib, name, reason: `rondes op ${offDay}, niet op de racedag ${date}` }); continue; }

    const catRaw = clean(p.Gender) || clean(p.Custom);
    const cat = CATEGORY[catRaw.toLowerCase()] ?? null;
    if (!cat) issues.push({ bib, name, issue: `onbekende categorie "${catRaw}"` });
    const totalOnly = cat !== null && TOTAL_ONLY.has(cat);
    const penalty = seconds(p.Penalty);
    const penaltyNote = clean(p['Penalty note']);
    const resultSec = Math.round(Number(p['Result in seconds']) || 0);

    if (marks.length > SEGMENTS && start !== null && !totalOnly) {
      let extra = marks.length - SEGMENTS;
      const kept: number[] = [];
      for (const ms of times(marks)) {
        const prev = kept.length ? kept[kept.length - 1] : start;
        if (extra > 0 && ms >= prev && ms - prev < DOUBLE_TAP_MS) { extra--; continue; }
        kept.push(ms);
      }
      if (kept.length < marks.length) issues.push({ bib, name, issue: `${marks.length - kept.length} dubbele tik genegeerd` });
      marks = kept;
    }
    if (marks.length > SEGMENTS) issues.push({ bib, name, issue: `${marks.length} rondes geregistreerd, de eerste ${SEGMENTS} gebruikt` });
    const used = marks.slice(0, SEGMENTS);
    const done = used.length;

    let splits: (number | null)[] | null = null;
    let merged: Merged[] = [];
    let lastOk = true;
    if (start !== null && done && !totalOnly) {
      const r = lapSplits(start, used);
      splits = r.splits;
      merged = r.merged;
      lastOk = r.lastOk;
      const why: string[] = [];
      if (r.order.length) why.push(`${r.order.map((i) => `ronde ${i} (${clock(used[i - 1] as number)})`).join(', ')} past niet in de volgorde`);
      if (r.missing.length) why.push(`${r.missing.map((i) => `ronde ${i}`).join(', ')} ontbreekt`);
      for (const d of r.double) why.push(`ronde ${d.lap} is ${d.gap} s voor de volgende getikt, een tik gemist`);
      if (why.length) issues.push({ bib, name, issue: `${why.join('; ')}: die onderdelen staan samen` });
    }

    let status: Status;
    let total: number | null = null;
    const fin = done === SEGMENTS ? used[SEGMENTS - 1] : null;
    const finishSec = start !== null && fin !== null ? Math.round((fin - start) / 1000) : null;
    if (finishSec !== null && finishSec <= 0) {
      skipped.push({ bib, name, reason: 'de start ligt na de finish, tijd niet te berekenen' });
      continue;
    }
    if (finishSec !== null) {
      total = finishSec + penalty;
      status = 'finished';
      if (!lastOk) issues.push({ bib, name, issue: `finish (${clock(fin as number)}) ligt voor een eerdere ronde, eindtijd nakijken` });
    } else if (resultSec > 0) {
      total = resultSec + penalty;
      status = 'finished';
      issues.push({ bib, name, issue: `eindtijd zonder ${SEGMENTS} rondetijden (${done} rondes)` });
    } else if (phase === 'future') {
      status = 'waiting';
    } else if (phase === 'past') {
      status = done ? 'dnf' : 'dns';
    } else if (start !== null && start <= now && (x.lap0 || done)) {
      // In a wave start everyone in the wave gets lap 0, also no-shows. Nobody needs half
      // an hour for the first kilometre or 40 minutes for one segment.
      const idleMin = (now - (times(used).length ? Math.max(...times(used)) : start)) / 60000;
      if (!done) status = idleMin > 30 ? 'dns' : 'running';
      else status = idleMin > 40 ? 'dnf' : 'running';
    } else {
      status = 'waiting';
    }
    if (penalty) issues.push({ bib, name, issue: `straftijd ${penalty} s opgeteld${penaltyNote ? ` (${penaltyNote})` : ''}` });

    const e: Entry = {
      bib, name, names: splitNames(name), cat, cat_raw: catRaw, age: clean(p.Age), wave: clean(p.Wave),
      status, laps: done, total, splits, penalty, start,
      last: status === 'finished' && fin !== null ? fin : times(used).length ? Math.max(...times(used)) : null,
    };
    if (merged.length) e.merged = merged;
    if (penaltyNote) e.penalty_note = penaltyNote;
    entries.push(e);
  }

  const stats: Payload['stats'] = {};
  for (const e of entries) {
    const k = e.cat ?? 'onbekend';
    stats[k] ??= {};
    stats[k][e.status] = (stats[k][e.status] ?? 0) + 1;
  }

  return { v: VERSION, race, event, date, live: date === today, fetched_at: new Date(now).toISOString(), entries, skipped, issues, stats };
}
