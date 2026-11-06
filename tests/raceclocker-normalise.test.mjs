// Unit test for supabase/functions/raceclocker/normalise.ts with RaceClocker-shaped data.
// Run: node --experimental-strip-types tests/raceclocker-normalise.test.mjs
import { normalise, amsToEpoch, splitNames, trustedLaps, lapSplits, VERSION } from '../supabase/functions/raceclocker/normalise.ts';

let fails = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); if (!ok) fails++; }

const pad = n => String(n).padStart(2, '0');
const clock = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
const DAY = '2026-10-18';
// A participant whose laps are `segs` seconds apart, starting at `startS` seconds after midnight.
// `at` overrides the clock time (seconds after midnight) of single laps, `lapDate` the date of laps 1+.
function person({ bib, name, gender, age = '35-60', wave = '1 08:00', date = DAY, lapDate = date, startS = 8 * 3600 + 101, segs = [], at = {}, penalty = '0', note = '', result = '0', tenths = 3, finish = null }) {
  const laps = [{ LapNumber: 0, LapTime: clock(startS), LapTimedc: String(tenths), LapTimeSec: 0, LapDate: date }];
  let t = startS;
  segs.forEach((s, i) => { t += s; const c = at[i + 1] ?? t; laps.push({ LapNumber: String(i + 1), LapTime: clock(c), LapTimedc: '0', LapTimeSec: 0, LapDate: lapDate }); });
  return {
    Name: name, Rank: '1', 'Bib number': bib, Club: '', Category: 'All', Wave: wave, Age: age, Gender: gender,
    Start: clock(startS) + '.' + tenths, 'Start date': date, Finish: finish ? clock(finish) + '.0' : '00:00:00.0', 'Finish date': finish ? date : null,
    Result: 'In race...', 'Result in seconds': result, Penalty: penalty, 'Penalty note': note, Laps: laps,
  };
}
const full = [300, 240, 310, 200, 320, 260, 330, 280, 340, 300, 350, 270, 360, 290, 370, 420]; // 16 segments
const sum = a => a.reduce((x, y) => x + y, 0);
const S0 = 8 * 3600 + 101; // default start, 08:01:41.3
const cumAt = k => S0 + sum(full.slice(0, k)); // clock second of lap k with the full segments

const raw = [
  { Name: 'Naam (1)', Rank: '1', 'Bib number': 'Startnummer', Age: 'Leeftijdscategorie', Gender: 'Divisie ', Wave: 'Wave nummer ' },
  person({ bib: '335', name: 'Karlijn Borst & Nina  Pfelzer ', gender: 'Duo Women', segs: full }),
  person({ bib: '336', name: 'Chrissie Klein & Cheryl van der Hoorn', gender: 'Duo Woman', segs: full.map(s => s + 10) }),
  person({ bib: '427', name: 'Jenny de Keizer-Lei', gender: 'Single Woman', age: '16-34', segs: full.slice(0, 9) }),
  // Like bib 001 in edition 3: a test run the day before, lap 0 later moved to race day 17:00.
  person({ bib: '001', name: 'Michel Opdam', gender: 'Man', wave: 'Wave nummer', startS: 17 * 3600, lapDate: '2026-10-17', segs: full }),
  person({ bib: '423', name: 'Piet, Jan, Kees & Klaas', gender: 'Relay', segs: full, penalty: '30', note: 'no-rep wall balls' }),
  person({ bib: '498', name: 'test', gender: 'Kids', segs: full }),
  person({ bib: '200', name: 'Piet Snel', gender: 'Single Men', segs: [...full, 5] }),
  person({ bib: '201', name: 'Kees Nietgestart', gender: 'Single Men', segs: [] }),
  person({ bib: '202', name: 'Ali Mixed & Bo Mixed', gender: 'Mixed Duo', segs: full }),
  person({ bib: '203', name: 'Raar Ding', gender: 'Divisie X', segs: full }),
  // Like bib 348: lap 12 tapped 18 s before lap 11.
  person({ bib: '348', name: 'Tenika & Marinde', gender: 'Duo Women', segs: full, at: { 12: cumAt(11) - 18 } }),
  // One lap tapped far too late (after the finish): only that lap drops out.
  person({ bib: '204', name: 'Uitschieter', gender: 'Single Men', segs: full, at: { 5: cumAt(16) + 600 } }),
  // A tap missed at the end of station 4, made up for with a double tap at the end of run 5 (16 laps).
  person({ bib: '207', name: 'Gemiste Tik', gender: 'Single Men', segs: full, at: { 8: cumAt(9) - 2 } }),
  // A double tap: lap 4 tapped twice, 2 seconds apart, so 17 laps.
  person({ bib: '205', name: 'Dubbel Getikt', gender: 'Single Men', segs: [...full.slice(0, 4), 2, ...full.slice(4)] }),
  // Kids: another format, only the total.
  person({ bib: '495', name: 'Kind Een', gender: 'Kids', age: '', segs: [108, 227, 6, 1, 1, 3, 281, 2, 1, 178, 1, 3, 1, 229, 1, 107] }),
  person({ bib: '496', name: 'Kind Twee', gender: 'Kids', age: '', segs: [100, 200, 1, 1, 1, 1, 300, 1, 1, 200, 1, 1, 1, 200, 1, 100], at: { 4: cumAt(0) + 100 + 200 } }),
  // A race with a finish line: 15 laps plus Finish.
  person({ bib: '206', name: 'Met Finishlijn', gender: 'Single Men', segs: full.slice(0, 15), finish: cumAt(16) }),
];

const now = Date.parse('2026-11-06T15:00:00Z');
const out = normalise(raw, 'f4b23f3b', 'sim-03', now, DAY);
const by = bib => out.entries.find(e => e.bib === bib);

check('payload carries the version', out.v === VERSION && VERSION >= 3);
check('header row skipped, test entry skipped', !by('Startnummer') && !by('498') && out.skipped.some(s => s.bib === '498' && s.reason === 'testdeelnemer'), out.skipped);
check('laps on another day: skipped as a test, not ranked', !by('001') && out.skipped.some(s => s.bib === '001' && /2026-10-17/.test(s.reason)), out.skipped);
check('race day as configured', out.date === DAY && out.live === false, out.date);
const kb = by('335');
check('duo: names split and cleaned', kb.name === 'Karlijn Borst & Nina Pfelzer' && kb.names.join('|') === 'Karlijn Borst|Nina Pfelzer', kb.names);
check('duo: category from "Gender"', kb.cat === 'doubles_women' && by('336').cat === 'doubles_women' && by('202').cat === 'doubles_mixed');
check('finished: 16 splits that add up to the total', kb.status === 'finished' && kb.splits.length === 16 && sum(kb.splits) === kb.total && kb.total === sum(full) && !kb.merged, { total: kb.total, splits: kb.splits });
check('tenths of the start are taken into account', by('336').total === sum(full) + 160, by('336').total);
check('start is Amsterdam time (CEST in October)', kb.start === Date.parse('2026-10-18T06:01:41.300Z'), new Date(kb.start).toISOString());
check('winter time is handled too', amsToEpoch('2027-03-14', '08:00:00') === Date.parse('2027-03-14T07:00:00Z'));
check('not finished on a past day = dnf with the laps done', by('427').status === 'dnf' && by('427').laps === 9 && by('427').total === null && by('427').splits.length === 9, by('427'));
check('no laps on a past day = dns (wave start gives no-shows a lap 0 too)', by('201').status === 'dns', by('201').status);
const relay = by('423');
check('penalty added to the total, splits stay clean, note kept', relay.total === sum(full) + 30 && sum(relay.splits) === sum(full) && relay.penalty === 30 && relay.penalty_note === 'no-rep wall balls' && out.issues.some(i => i.bib === '423' && /no-rep/.test(i.issue)));
check('relay: four names', relay.names.length === 4 && relay.cat === 'relay', relay.names);
check('17 laps without a double tap: first 16 used and reported', by('200').total === sum(full) && out.issues.some(i => i.bib === '200' && /17 rondes/.test(i.issue)));
const dbl = by('205');
check('double tap within 5 s dropped: finish is the last lap', dbl.total === sum(full) + 2 && dbl.laps === 16 && out.issues.some(i => i.bib === '205' && /dubbele tik/.test(i.issue)), { total: dbl.total, splits: dbl.splits });
check('unknown category reported, not guessed', by('203').cat === null && out.issues.some(i => i.bib === '203'));

const td = by('348');
check('laps out of order: total unchanged', td.status === 'finished' && td.total === sum(full), td.total);
check('laps out of order: both conflicting laps drop out, 3 segments unknown', td.splits.filter(s => s === null).length === 3 && td.splits[10] === null && td.splits[11] === null && td.splits[12] === null, td.splits);
check('laps out of order: one combined time for those segments', td.merged && td.merged.length === 1 && td.merged[0].from === 10 && td.merged[0].to === 12 && td.merged[0].s === full[10] + full[11] + full[12], td.merged);
check('laps out of order: known splits + combined time = total', sum(td.splits.filter(s => s !== null)) + td.merged[0].s === td.total);
check('laps out of order: reported with lap numbers and clock times', out.issues.some(i => i.bib === '348' && /ronde 11 \(\d\d:\d\d:\d\d\.\d\), ronde 12/.test(i.issue)), out.issues.filter(i => i.bib === '348'));
const mt = by('207');
check('missed tap + double tap: the two segments around it are shown together', mt.total === sum(full) && mt.splits[7] === null && mt.splits[8] === null && mt.splits.filter(s => s === null).length === 2 && mt.merged[0].from === 7 && mt.merged[0].to === 8 && mt.merged[0].s === full[7] + full[8], { splits: mt.splits, merged: mt.merged });
check('missed tap + double tap: reported', out.issues.some(i => i.bib === '207' && /ronde 8 is 2 s voor de volgende getikt/.test(i.issue)), out.issues.filter(i => i.bib === '207'));
check('no segment shorter than 20 s is shown for adults', out.entries.every(e => !e.splits || e.splits.every(s => s === null || s >= 20)));
const ui = by('204');
check('one lap far too late: only that lap drops out', ui.total === sum(full) && ui.splits.filter(s => s === null).length === 2 && ui.merged[0].from === 4 && ui.merged[0].to === 5 && ui.merged[0].s === full[4] + full[5], { splits: ui.splits, merged: ui.merged });

const k1 = by('495'), k2 = by('496');
check('kids: own category, only the total, no lap issues', k1.cat === 'kids' && k1.splits === null && k1.total === 1150 && k2.splits === null && k2.total === 1110 && k2.status === 'finished' && !out.issues.some(i => i.bib === '495' || i.bib === '496'), { k1: k1.total, k2: k2.total });
check('finish line after 15 laps counts as lap 16', by('206').status === 'finished' && by('206').total === sum(full) && by('206').splits.length === 16, by('206'));
check('stats per category and status', out.stats.doubles_women.finished === 3 && out.stats.single_women.dnf === 1 && out.stats.kids.finished === 2 && out.stats.single_men.finished === 5, out.stats);
check('names split on en/and/&/+/', splitNames('A en B').length === 2 && splitNames('Jensen Bennet').length === 1 && splitNames('A/B').length === 2);

// trustedLaps on its own
const ok = t => trustedLaps(t).map(v => (v ? 1 : 0)).join('');
check('trustedLaps: increasing = all trusted', ok([0, 10, 20, 30]) === '1111');
check('trustedLaps: two laps that contradict each other both drop out', ok([0, 10, 30, 25, 40]) === '11001', ok([0, 10, 30, 25, 40]));
check('trustedLaps: one outlier drops out alone', ok([0, 10, 99, 30, 40, 50]) === '110111', ok([0, 10, 99, 30, 40, 50]));
check('trustedLaps: a lap before the start drops out', ok([0, -5, 10, 20]) === '1011', ok([0, -5, 10, 20]));
const ls = lapSplits(0, [100000, 300000, 250000, 400000]);
check('lapSplits: last lap trusted, merged run around the bad laps', ls.lastOk && ls.merged[0].from === 1 && ls.merged[0].to === 3 && ls.merged[0].s === 300 && ls.order.join() === '2,3' && !ls.double.length, ls);
const ld = lapSplits(0, [300000, 600000, 602000, 900000]);
check('lapSplits: two taps 2 s apart = the first one is wrong', ld.splits.join() === '300,,,298' && ld.double[0].lap === 2 && ld.double[0].gap === 2 && ld.merged[0].s === 302, ld);
const lf = lapSplits(0, [1000, 300000]);
check('lapSplits: a first lap right after the start drops out itself', lf.splits.join() === ',' && lf.double[0].lap === 1 && lf.merged.length === 1 && lf.merged[0].s === 300, lf);

// A configured race day that does not match the data: the data wins, and it is reported.
const wrong = normalise(raw, 'f4b23f3b', 'sim-03', now, '2026-10-25');
check('wrong race date in the config: most common start day used and reported', wrong.date === DAY && wrong.issues.some(i => /racedatum/.test(i.issue)) && wrong.entries.length === out.entries.length);

// Before race day: everyone registered is waiting.
const before = normalise([person({ bib: '600', name: 'Vroege Vogel', gender: 'Single Men', date: '2027-03-14', startS: 8 * 3600, segs: [] })], 'abcdef12', 'sim-04', now, '2027-03-14');
check('before race day = waiting, not live', before.entries[0].status === 'waiting' && before.live === false, before.entries[0].status);

// Live: same race "today", during the race.
const liveNow = Date.parse('2026-10-18T07:00:00Z'); // 09:00 in Amsterdam
const live = normalise(raw, 'f4b23f3b', 'sim-03', liveNow, DAY);
const j = live.entries.find(e => e.bib === '427');
check('race day today = live', live.live === true);
check('running athlete has laps done, partial splits and the time of the last lap', j.status === 'running' && j.laps === 9 && j.splits.length === 9 && j.last > j.start, j);
const later = person({ bib: '500', name: 'Laat Gestart', gender: 'Single Men', wave: '25 16:00', startS: 16 * 3600, segs: [] });
later.Laps = [];
later.Start = '00:00:00.0'; later['Start date'] = null;
const live2 = normalise([later], 'f4b23f3b', 'sim-03', liveNow, DAY);
check('later wave on race day = waiting', live2.entries[0].status === 'waiting', live2.entries[0].status);

const idle = normalise(raw, 'f4b23f3b', 'sim-03', Date.parse('2026-10-18T09:00:00Z'), DAY); // 11:00, 2 h after the last lap of 427
check('on race day: no lap for 40 minutes = dnf, no first lap after 30 minutes = dns', idle.entries.find(e => e.bib === '427').status === 'dnf' && idle.entries.find(e => e.bib === '201').status === 'dns');
const early = normalise(raw, 'f4b23f3b', 'sim-03', Date.parse('2026-10-18T06:10:00Z'), DAY); // 08:10, wave 1 started 08:01
check('just started, no lap yet = running', early.entries.find(e => e.bib === '201').status === 'running');

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
