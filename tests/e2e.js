// End-to-end check of the real site against the fake Supabase client.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const FAKE = fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
const FS = path.join(__dirname, 'node_modules/@fontsource');
const FONTS = [['Archivo', 'archivo', [400, 500, 600, 700]], ['Big Shoulders Display', 'big-shoulders-display', [700, 900]], ['IBM Plex Mono', 'ibm-plex-mono', [500, 600]]];
const fontCss = FONTS.flatMap(([fam, dir, ws]) => ws.map(w => `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(https://fonts.gstatic.com/local/${dir}/${dir}-latin-${w}-normal.woff2) format('woff2');}`)).join('\n');

let failures = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); if (!ok) failures++; }

// RaceClocker results as the edge function "raceclocker" returns them (see normalise.ts).
const SEGS = [300, 240, 310, 200, 320, 260, 330, 280, 340, 300, 350, 270, 360, 290, 370, 420];
const scaled = total => { const t = SEGS.reduce((a, b) => a + b, 0); const o = SEGS.map(x => Math.round(x * total / t)); o[15] += total - o.reduce((a, b) => a + b, 0); return o; };
const amsDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
function rcEntry(o) {
  const status = o.status || 'finished';
  const splits = o.splits !== undefined ? o.splits : status === 'finished' ? scaled(o.total - (o.penalty || 0)) : null;
  return Object.assign({ bib: o.bib, name: o.name, names: o.name.split(/\s*(?:&|,)\s*/), cat: o.cat, cat_raw: '', age: o.age !== undefined ? o.age : '35-60', wave: '1 08:00', status, laps: o.laps !== undefined ? o.laps : 16, total: o.total || null, splits, penalty: o.penalty || 0, start: o.start !== undefined ? o.start : Date.parse('2026-10-18T06:00:00Z'), last: null }, o.extra || {});
}
const gapped = (() => { const sp = scaled(4500); const s = sp[2] + sp[3] + sp[4]; sp[2] = sp[3] = sp[4] = null; return { splits: sp, merged: [{ from: 2, to: 4, s }] }; })();
const RC_ARCHIVE = () => ({
  v: 3, race: 'f4b23f3b', event: 'sim-03', date: '2026-10-18', live: false, fetched_at: new Date().toISOString(),
  entries: [
    rcEntry({ bib: '101', name: 'Snelle Sander', cat: 'single_men', total: 3900, age: '16-34' }),
    rcEntry({ bib: '102', name: 'Gelijke Gijs', cat: 'single_men', total: 4100 }),
    rcEntry({ bib: '103', name: 'Gelijke Gert', cat: 'single_men', total: 4100 }),
    rcEntry({ bib: '104', name: 'Gemiste Gerrit', cat: 'single_men', total: 4500, splits: gapped.splits, extra: { merged: gapped.merged } }),
    rcEntry({ bib: '105', name: 'Uitvaller Udo', cat: 'single_men', status: 'dnf', laps: 4, splits: SEGS.slice(0, 4) }),
    rcEntry({ bib: '106', name: 'Thuisblijver Tom', cat: 'single_men', status: 'dns', laps: 0 }),
    rcEntry({ bib: '201', name: 'Anna Snel & Bea Snel', cat: 'doubles_women', total: 4800, penalty: 240, extra: { penalty_note: '2 banen lunges te weinig' } }),
    rcEntry({ bib: '301', name: 'Piet Een, Jan Twee, Kees Drie & Klaas Vier', cat: 'relay', total: 5000, age: '' }),
    rcEntry({ bib: '401', name: 'Kind Kim', cat: 'kids', total: 1150, splits: null, age: '' }),
    rcEntry({ bib: '402', name: 'Kind Kai', cat: 'kids', total: 1370, splits: null, age: '' })
  ],
  skipped: [], issues: [], stats: {}
});
// Race day of edition 04: stage 1 has two athletes on the course, from stage 2 on one of them is in.
function RC_LIVE(stage) {
  const now = Date.now(), start = now - 40 * 60e3, early = now - 70 * 60e3;
  return {
    v: 3, race: 'abcd1234', event: 'sim-04', date: amsDay(now), live: true, fetched_at: new Date().toISOString(),
    entries: [
      rcEntry({ bib: '501', name: 'Live Lars', cat: 'single_men', total: 3500, start: early }),
      rcEntry({ bib: '502', name: 'Live Luuk', cat: 'single_men', total: 3600, start: early }),
      stage === 1
        ? rcEntry({ bib: '503', name: 'Rennende Ruud', cat: 'single_men', status: 'running', laps: 9, splits: SEGS.slice(0, 9), start })
        : rcEntry({ bib: '503', name: 'Rennende Ruud', cat: 'single_men', total: 3700, start }),
      rcEntry({ bib: '504', name: 'Rennende Rik', cat: 'single_men', status: 'running', laps: 6, splits: SEGS.slice(0, 6), start }),
      rcEntry({ bib: '505', name: 'Wachtende Wim', cat: 'single_men', status: 'waiting', laps: 0, start: null })
    ],
    skipped: [], issues: [], stats: {}
  };
}
// Remove the RaceClocker line from config.js, for tests of self-reported times on edition 03.
const noRC = body => body.replace(/^\s*raceclocker:.*$/m, '');

async function setup(ctx, errs, tag) {
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }));
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route(/fonts\.gstatic\.com\/local\//, r => {
    const m = r.request().url().match(/local\/([^/]+)\/([^/?]+)/);
    r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(FS, m[1], 'files', m[2])) });
  });
  // The edge function: archive results for edition 03, live results for a race 'abcd1234'.
  ctx.rc = { calls: [], fail: false, payload: url => (/abcd1234/.test(url) ? RC_LIVE(ctx.rc.calls.filter(u => /abcd1234/.test(u)).length) : RC_ARCHIVE()) };
  await ctx.route(/\/functions\/v1\/raceclocker/, r => {
    const url = r.request().url();
    ctx.rc.calls.push(url);
    if (ctx.rc.fail) return r.fulfill({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'RaceClocker is nu niet bereikbaar' }) });
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ctx.rc.payload(url)) });
  });
  ctx.on('page', p => {
    p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text()); });
    p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
  });
}
const wait = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await setup(ctx, errs, 'desk');
  await ctx.route(/assets\/config\.js/, async r => {
    const resp = await r.fetch(); let body = await resp.text();
    body = noRC(body.replace("start: '2027-03-14T08:00:00+01:00'", "start: '2026-01-11'"));
    r.fulfill({ response: resp, body });
  });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForSelector('#lb-list .lb-row');
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });

  // Logos of the organising clubs
  const logoInfo = sel => p.$$eval(sel, imgs => imgs.map(i => ({ alt: i.alt, ok: i.complete && i.naturalWidth > 0, h: Math.round(i.getBoundingClientRect().height) })));
  const heroLogos = await logoInfo('.hero .orgs img');
  check('hero shows both club logos', heroLogos.length === 2 && heroLogos.every(l => l.ok && l.h >= 20) && heroLogos.map(l => l.alt).join('|') === 'Club Confidence|By Opdam', heroLogos);
  // What a screen reader says: alt texts of the images, hidden helper text, not the decorative ×.
  const spoken = await p.$eval('.hero .orgs', e => [...e.childNodes].map(n => n.nodeType === 3 ? n.textContent : n.getAttribute('aria-hidden') === 'true' ? '' : n.tagName === 'IMG' ? n.alt : n.textContent).join('').replace(/\s+/g, ' ').trim());
  check('hero logos read as "Georganiseerd door Club Confidence en By Opdam"', spoken === 'Georganiseerd door Club Confidence en By Opdam', spoken);
  await p.$eval('footer', f => f.scrollIntoView());
  await p.waitForFunction(() => [...document.querySelectorAll('footer img')].every(i => i.complete && i.naturalWidth > 0));
  const footLogos = await logoInfo('footer .foot-logo img');
  check('footer headings are the club logos', footLogos.length === 2 && footLogos.every(l => l.ok) && footLogos.map(l => l.alt).join('|') === 'Club Confidence|By Opdam', footLogos);
  await p.$eval('#top', e => e.scrollIntoView());

  // Leaderboard
  check('client created with project url and publishable key', await p.evaluate(() => window.__clientArgs.url.includes('ocdnerhyssvkjhdgstvp') && window.__clientArgs.key.startsWith('sb_publishable_')));
  check('default event is latest edition', (await p.$eval('#lb-event', s => s.value)) === 'sim-04');
  const nRows = await p.$$eval('#lb-list .lb-row', e => e.length);
  check('single men rows incl. imported', nRows === 11, nRows);
  const ranks = await p.$$eval('#lb-list .lb-row .rk', e => e.map(x => x.textContent));
  check('tie shares a rank', ranks[0] === '01' && ranks[1] === ranks[2], ranks.slice(0, 4));
  check('imported athlete shown', (await p.textContent('#lb-list')).includes('Pieter Geimporteerd'));
  check('summary shows participants', (await p.textContent('#lb-summary')).includes('11'));
  await p.click('[data-cat="relay"]');
  await p.waitForSelector('#lb-list .lb-row');
  check('relay shows team name', (await p.textContent('#lb-list .lb-row .nm')) === 'De Sleeduwers');
  await p.click('#lb-list .lb-main');
  check('relay detail lists 4 members', (await p.$$eval('#lb-list .lb-row.open .member', e => e.length)) === 4);
  await p.click('[data-cat="doubles_mixed"]');
  await p.waitForSelector('#lb-list .lb-row');
  check('duo shows both names', (await p.textContent('#lb-list .lb-row .nm')).includes(' & '));
  await p.fill('#lb-search', 'emma');
  check('search by partner name', (await p.$$eval('#lb-list .lb-row', e => e.length)) === 1);
  await p.fill('#lb-search', 'zzz');
  check('no-match state with reset', await p.isVisible('#lb-reset'));
  await p.click('#lb-reset');
  check('reset restores rows', (await p.$$eval('#lb-list .lb-row', e => e.length)) === 5);
  await wait(p, 450);
  check('screen reader status updated', (await p.textContent('#lb-status')).includes('tijden getoond'), await p.textContent('#lb-status'));
  await p.selectOption('#lb-event', 'sim-03');
  await p.click('[data-cat="single_men"]');
  await p.waitForSelector('#lb-list .lb-row');
  check('rejected time hidden on sim-03', !(await p.textContent('#lb-list')).includes('Afgekeurde Tijd') && (await p.$$eval('#lb-list .lb-row', e => e.length)) === 6);
  await p.selectOption('#lb-event', 'sim-01');
  await p.waitForSelector('#lb-list .lb-empty');
  check('empty edition shows invite', (await p.textContent('#lb-list')).includes('Nog geen tijden'));
  await p.click('[data-src="off"]');
  await p.waitForSelector('#lb-list .lb-row, #lb-list .lb-empty');
  check('official: first official event selected', (await p.$eval('#lb-event', s => s.value)) === 'off-utrecht');
  check('division filter visible', await p.isVisible('#ctrl-div'));
  await p.selectOption('#lb-event', 'off-amsterdam');
  await p.waitForSelector('#lb-list .lb-row');
  await p.click('#lb-div [data-div="pro"]');
  check('pro filter', (await p.$$eval('#lb-list .lb-row', e => e.length)) === 2);
  // race: fast category switching ends on the last click
  await p.evaluate(() => { window.__lat = 250; });
  await p.click('[data-cat="single_women"]'); await p.click('[data-cat="single_men"]');
  await p.waitForSelector('#lb-list .lb-row');
  await wait(p, 400);
  check('last click wins', (await p.$eval('[data-cat="single_men"]', e => e.getAttribute('aria-pressed'))) === 'true' && (await p.$$eval('#lb-list .lb-row', e => e.length)) === 2);
  await p.evaluate(() => { window.__lat = 60; });
  // error state + retry
  await p.evaluate(() => { window.__fail = { 'leaderboard:select': true }; });
  await p.click('[data-src="sim"]');
  await p.waitForSelector('#lb-retry');
  check('error state shown', (await p.textContent('#lb-list')).includes('Geen verbinding'));
  await p.evaluate(() => { window.__fail = {}; });
  await p.click('#lb-retry');
  await p.waitForSelector('#lb-list .lb-row');
  check('retry loads rows', (await p.$$eval('#lb-list .lb-row', e => e.length)) > 0);
  await p.$eval('#leaderboard', e => e.scrollIntoView());
  await wait(p, 200);
  await p.screenshot({ path: 'site-desk-lb.png' });

  // Login
  await p.click('#nav-cta');
  check('login dialog opens', await p.$eval('#login', d => d.open));
  await p.fill('#l-mail', 'geen-mail');
  await p.click('#l-mail-btn');
  check('invalid email message', (await p.textContent('#l-mail-err')).includes('geldig'));
  await p.fill('#l-mail', 'iemand.extern@gmail.com');
  await p.click('#l-mail-btn');
  await p.waitForFunction(() => !document.querySelector('#l-mail-err').hidden && document.querySelector('#l-mail-err').textContent.includes('testfase'));
  check('not-authorized mapped to Dutch', true);
  await p.fill('#l-mail', 'ratelimit@test.nl');
  await p.click('#l-mail-btn');
  await p.waitForFunction(() => document.querySelector('#l-mail-err').textContent.includes('Wacht nog 52 seconden'));
  check('per-address limit shows the seconds to wait', true);
  await p.fill('#l-mail', 'uurlimiet@test.nl');
  await p.click('#l-mail-btn');
  await p.waitForFunction(() => document.querySelector('#l-mail-err').textContent.includes('afgelopen uur'));
  check('hourly mail limit says to use the mail you got or wait an hour', !(await p.textContent('#l-mail-err')).includes('minuut'), await p.textContent('#l-mail-err'));
  await p.fill('#l-mail', 'Hans.Test@Example.com ');
  await p.click('#l-mail-btn');
  await p.waitForSelector('[data-step="code"]:not([hidden])');
  check('email lowercased and trimmed', (await p.textContent('#l-mail-echo')) === 'hans.test@example.com');
  check('otp call asks to create user', await p.evaluate(() => { const c = window.__calls.filter(x => x.op === 'otp').pop(); return c.payload.options.shouldCreateUser === true && c.payload.email === 'hans.test@example.com'; }));
  check('login link returns to this page, not the bare domain', await p.evaluate(() => window.__calls.filter(x => x.op === 'otp').pop().payload.options.emailRedirectTo === location.origin + location.pathname));
  check('code step explains a link in the mail', (await p.textContent('#l-link-hint')).includes('link in plaats van een code') && await p.isVisible('#l-link-hint'));
  check('resend is on cooldown', await p.$eval('#l-resend', b => b.disabled && /\d+ s/.test(b.textContent)));
  await p.fill('#l-code', '111111');
  await p.waitForFunction(() => document.querySelector('#l-code-err').textContent.includes('verlopen'));
  check('wrong code message', true);
  await p.fill('#l-code', '42a42 42');
  check('code input keeps digits only', (await p.$eval('#l-code', i => i.value)) === '424242');
  await p.waitForSelector('[data-step="profile"]:not([hidden])');
  check('verify used type email', await p.evaluate(() => window.__calls.filter(x => x.op === 'verify').pop().payload.type === 'email'));
  await p.click('#p-btn');
  check('profile name required', (await p.textContent('#p-err')).length > 0);
  await p.fill('#p-name', '  Hans   Tester ');
  await p.selectOption('#p-club', 'Club Confidence');
  await p.click('#p-btn');
  await p.waitForSelector('#view-account:not([hidden])');
  check('lands on Mijn tijden', (await p.evaluate(() => location.hash)) === '#mijn-tijden');
  check('greeting uses first name', (await p.textContent('#acc-hello')) === 'Hoi Hans');
  check('profile saved with collapsed spaces', await p.evaluate(() => JSON.parse(localStorage.getItem('fake-db')).profiles.some(x => x.display_name === 'Hans Tester' && x.club === 'Club Confidence')));
  check('nav says Mijn tijden', (await p.textContent('#nav-cta')).trim() === 'Mijn tijden');
  check('empty list message', (await p.textContent('#entry-list')).includes('Nog geen tijden'));

  // Add times
  await p.fill('#f-time', '1:02:03');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Opgeslagen'));
  const t1 = await p.textContent('#toast');
  check('save toast with rank', /plek \d+ van \d+ bij Single mannen, Editie 04/.test(t1), t1);
  check('upsert uses conflict target', await p.evaluate(() => { const c = window.__calls.filter(x => x.t === 'results' && x.op === 'upsert').pop(); return c.opts.onConflict === 'user_id,event_id,category' && c.payload.user_id && c.payload.division === 'open' && c.payload.proof_url === null; }));
  check('entry listed', (await p.$$eval('#entry-list .entry', e => e.length)) === 1);
  await p.selectOption('#f-cat', 'doubles_mixed');
  check('partner field shown for duo', await p.isVisible('#fw-partner'));
  await p.fill('#f-time', '58:44');
  await p.click('#f-submit');
  check('partner required', (await p.textContent('#f-error')).includes('partner'));
  await p.fill('#f-pname', 'Lotte van Dijk');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelectorAll('#entry-list .entry').length === 2);
  check('duo saved as 58:44', await p.evaluate(() => JSON.parse(localStorage.getItem('fake-db')).results.some(r => r.category === 'doubles_mixed' && r.total_seconds === 3524 && r.partner_name === 'Lotte van Dijk')));
  await p.selectOption('#f-cat', 'relay');
  await p.fill('#f-time', '55:10');
  await p.fill('#f-team', 'Team Hans');
  await p.fill('#f-mate1', 'A Een');
  await p.click('#f-submit');
  check('relay needs all members', (await p.textContent('#f-error')).includes('vier'));
  await p.fill('#f-mate2', 'B Twee'); await p.fill('#f-mate3', 'C Drie');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelectorAll('#entry-list .entry').length === 3);
  check('relay saved', true);
  await p.fill('#f-time', '0:20:00');
  await p.click('#f-submit');
  check('implausible time rejected', (await p.textContent('#f-error')).includes('niet te kloppen'));
  // same race again (not editing) updates the existing time
  await p.selectOption('#f-cat', 'single_men');
  await p.fill('#f-time', '1:01:00');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Bijgewerkt'));
  check('same race updates instead of duplicate', (await p.$$eval('#entry-list .entry', e => e.length)) === 3);
  // official with link
  await p.check('#f-src-off');
  check('official shows division and link', await p.isVisible('#fw-div') && await p.isVisible('#fw-link'));
  check('official events listed', JSON.stringify(await p.$$eval('#f-event option', o => o.map(x => x.textContent))) === JSON.stringify(['Hyrox Utrecht', 'Hyrox Amsterdam']));
  await p.selectOption('#f-event', 'off-amsterdam');
  await p.selectOption('#f-div', 'pro');
  await p.fill('#f-time', '1:15:00');
  await p.fill('#f-link', 'results.hyrox.com/123');
  await p.click('#f-submit');
  check('link must start with https', (await p.textContent('#f-error')).includes('https://'));
  await p.fill('#f-link', 'https://results.hyrox.com/123');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelectorAll('#entry-list .entry').length === 4);
  check('official entry badge shows link pending', (await p.textContent('#entry-list')).includes('Link ingediend'));
  await p.screenshot({ path: 'site-desk-account.png' });
  // edit
  await p.click('.entry [data-edit]');
  check('edit fills form', (await p.textContent('#form-title')) === 'Tijd aanpassen' && (await p.isVisible('#f-cancel')));
  const editedId = await p.evaluate(() => document.querySelector('.entry [data-edit]').dataset.edit);
  await p.fill('#f-time', '1:14:00');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Aangepast'));
  check('edit updates by id', await p.evaluate(id => { const c = window.__calls.filter(x => x.t === 'results' && x.op === 'update').pop(); return c.filters[0][0] === 'id' && c.filters[0][1] === id; }, editedId));
  // edit into a duplicate race -> friendly message
  await p.goto(BASE + '#mijn-tijden');
  await p.waitForSelector('#entry-list .entry');
  const ids = await p.$$eval('#entry-list [data-edit]', e => e.map(x => x.dataset.edit));
  const db = await p.evaluate(() => JSON.parse(localStorage.getItem('fake-db')));
  const relayId = ids.find(id => db.results.find(r => r.id === id && r.category === 'relay'));
  await p.click(`[data-edit="${relayId}"]`);
  await p.selectOption('#f-cat', 'single_men');
  await p.click('#f-submit');
  await p.waitForFunction(() => document.querySelector('#f-error').textContent.length > 0);
  check('duplicate race on edit explained', (await p.textContent('#f-error')).includes('al een tijd'), await p.textContent('#f-error'));
  await p.click('#f-cancel');
  // view on leaderboard
  const smId = ids.find(id => db.results.find(r => r.id === id && r.category === 'single_men'));
  await p.click(`[data-view="${smId}"]`);
  await p.waitForSelector('#lb-list .lb-row.mine');
  check('view jumps to own row', (await p.evaluate(() => location.hash)) === '#leaderboard' && (await p.$$eval('.lb-row.mine', e => e.length)) === 1);
  check('summary shows own place', /\d+ van \d+/.test(await p.textContent('#lb-summary .is-mine .v')));
  await p.screenshot({ path: 'site-desk-lb-mine.png' });
  // delete
  await p.goto(BASE + '#mijn-tijden');
  await p.waitForSelector('#entry-list .entry');
  await p.click('.entry [data-del]');
  check('delete asks to confirm', await p.isVisible('[data-del-yes]'));
  await p.click('[data-del-no]');
  check('cancel keeps entry', (await p.$$eval('#entry-list .entry', e => e.length)) === 4);
  await p.click('.entry [data-del]');
  await p.click('[data-del-yes]');
  await p.waitForFunction(() => document.querySelectorAll('#entry-list .entry').length === 3);
  check('delete removes entry', true);
  // session survives reload
  await p.goto(BASE);
  await p.waitForSelector('#lb-list .lb-row');
  await wait(p, 300);
  check('session persists after reload', (await p.textContent('#nav-cta')).trim() === 'Mijn tijden');
  // logout
  await p.goto(BASE + '#mijn-tijden');
  await p.waitForSelector('#btn-logout');
  await p.click('#btn-logout');
  await p.waitForFunction(() => document.querySelector('#nav-cta').textContent.trim() === 'Tijd invoeren');
  check('logout returns to leaderboard', (await p.evaluate(() => location.hash)) === '#leaderboard');
  await p.goto(BASE + '#mijn-tijden');
  await wait(p, 400);
  check('Mijn tijden requires login', await p.$eval('#login', d => d.open) && await p.isHidden('#view-account'));

  // Signed in but no profile yet (e.g. closed the dialog): profile step comes back, and switching email works
  await p.evaluate(() => { localStorage.setItem('fake-session', JSON.stringify({ access_token: 'x', user: { id: 'user-nieuw', email: 'nieuw@test.nl' } })); });
  await p.goto(BASE);
  await p.waitForSelector('[data-step="profile"]:not([hidden])');
  check('profile step reopens for signed-in user without name', await p.$eval('#login', d => d.open));
  await p.click('#p-switch');
  await p.waitForSelector('[data-step="mail"]:not([hidden])');
  check('switch email signs out', await p.evaluate(() => localStorage.getItem('fake-session') === null));
  await p.keyboard.press('Escape');

  // Expired login link lands with an error in the hash
  await p.goto('about:blank');
  await p.goto(BASE + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('verlopen'));
  check('expired link explained and hash cleaned', (await p.evaluate(() => location.hash)) === '');

  // Config: date, countdown, signup link
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await setup(ctx2, errs, 'cfg');
  await ctx2.route(/assets\/config\.js/, async r => {
    const resp = await r.fetch(); let body = await resp.text();
    body = noRC(body.replace("start: '2027-03-14T08:00:00+01:00'", "start: '2027-03-14'").replace('signupUrl: null', "signupUrl: 'https://example.com/inschrijven'"));
    r.fulfill({ response: resp, body });
  });
  const c = await ctx2.newPage();
  await c.goto(BASE);
  await c.waitForSelector('#lb-list .lb-row');
  check('date-only start shows days left', /^Editie 04 · zondag 14 maart 2027 · nog \d+ dagen$/.test(await c.textContent('#countdown-tbd')) && await c.isHidden('#countdown'), await c.textContent('#countdown-tbd'));
  check('programme title uses weekday', (await c.textContent('#prog-title')) === 'Zondag 14 maart', await c.textContent('#prog-title'));
  check('announcement shows date', (await c.textContent('#announce-left')) === 'Editie 04 · zo 14 maart 2027 · HAL60, Roelofarendsveen', await c.textContent('#announce-left'));
  check('date-only bib shows edition', (await c.textContent('#bib-start')) === 'EDITIE 04', await c.textContent('#bib-start'));
  check('signup buttons become links', (await c.$$eval('a.btn[href="https://example.com/inschrijven"][target="_blank"][rel="noopener"]', e => e.length)) === 2 && (await c.$$eval('[data-signup]', e => e.length)) === 0);
  await c.screenshot({ path: 'site-desk-top.png' });
  // Without signup link: toast
  await p.goto(BASE);
  await p.waitForSelector('#lb-list .lb-row');
  await p.click('.hero [data-signup]');
  check('no signup link -> toast', (await p.textContent('#toast')).includes('opent binnenkort'));
  check('past edition -> no countdown', await p.isHidden('#countdown') && (await p.textContent('#countdown-tbd')) === 'Editie 04 · zondag 11 januari 2026', await p.textContent('#countdown-tbd'));

  // Real config: edition 04 on Sunday 14 March 2027 is not raced yet
  const ctx3 = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await setup(ctx3, errs, 'live');
  const e = await ctx3.newPage();
  await e.goto(BASE);
  await e.waitForSelector('#lb-list .lb-row');
  check('coming edition hidden from leaderboard', (await e.$eval('#lb-event', s => s.value)) === 'sim-03' && !(await e.$$eval('#lb-event option', o => o.map(x => x.value))).includes('sim-04'));
  check('countdown to 08:00 on race day', await e.isVisible('#countdown') && await e.isHidden('#countdown-tbd') && (await e.textContent('#countdown')).startsWith('Start editie 04 over') && Number(await e.textContent('#cd-d')) > 100, await e.textContent('#countdown'));
  check('announcement for edition 04', (await e.textContent('#announce-left')) === 'Editie 04 · zo 14 maart 2027 · HAL60, Roelofarendsveen', await e.textContent('#announce-left'));
  check('bib for edition 04', (await e.textContent('.bib .num')) === '04' && (await e.textContent('#bib-start')) === 'START 08:00' && (await e.textContent('#bib-foot')) === 'EDITIE · 14.03.2027');
  check('programme title for edition 04', (await e.textContent('#prog-title')) === 'Zondag 14 maart', await e.textContent('#prog-title'));
  await e.click('.hero [data-signup]');
  check('signup toast names edition 04', (await e.textContent('#toast')).includes('editie 04'), await e.textContent('#toast'));
  await e.click('#nav-cta');
  await e.fill('#l-mail', 'live@test.nl');
  await e.click('#l-mail-btn');
  await e.waitForSelector('[data-step="code"]:not([hidden])');
  await e.fill('#l-code', '424242');
  await e.waitForSelector('[data-step="profile"]:not([hidden])');
  await e.fill('#p-name', 'Live Test');
  await e.click('#p-btn');
  await e.waitForSelector('#view-account:not([hidden])');
  check('form offers neither edition 04 (not raced yet) nor 03 (official timing)', JSON.stringify(await e.$$eval('#f-event option', o => o.map(x => x.textContent))) === JSON.stringify(['Editie 02', 'Editie 01']), await e.$$eval('#f-event option', o => o.map(x => x.textContent)));
  check('form has no Kids category', !(await e.$$eval('#f-cat option', o => o.map(x => x.value))).includes('kids'));
  check('empty list suggests the latest edition you can fill in', (await e.textContent('#entry-list')).includes('bijvoorbeeld van editie 02'), await e.textContent('#entry-list'));
  await ctx3.close();

  // Official timing (RaceClocker): edition 03 from the real config
  const ctxR = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await setup(ctxR, errs, 'rc');
  const r = await ctxR.newPage();
  await r.goto(BASE);
  await r.waitForSelector('#lb-list .lb-row');
  await r.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  check('RC: edition 03 shows the official results', (await r.$eval('#lb-event', s => s.value)) === 'sim-03' && (await r.textContent('#lb-list')).includes('Snelle Sander'));
  check('RC: no stored copy, so the function was asked once for race f4b23f3b', ctxR.rc.calls.length === 1 && /race=f4b23f3b/.test(ctxR.rc.calls[0]), ctxR.rc.calls);
  const rcRows = await r.$$eval('#lb-list .lb-row', rows => rows.map(x => ({ rk: x.querySelector('.rk').textContent, nm: x.querySelector('.nm').textContent, tm: x.querySelector('.tm').textContent })));
  check('RC: finishers ranked, tie shares a rank, DNF last, DNS left out', JSON.stringify(rcRows.map(x => x.rk)) === JSON.stringify(['01', '02', '02', '04', '–']) && rcRows[4].tm === 'DNF' && !rcRows.some(x => x.nm === 'Thuisblijver Tom'), rcRows);
  check('RC: start number, age group and official badge', /Nr\. 101/.test(await r.textContent('#lb-list .lb-row .meta')) && /16-34 jr/.test(await r.textContent('#lb-list .lb-row .meta')) && (await r.textContent('#lb-list .lb-row .badge.ok')).includes('Officiële tijd'));
  const chips = await r.$$eval('#lb-cats .chip', c => c.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check('RC: categories with counts, Kids only here', chips.length === 7 && chips[0] === 'Single mannen 5' && chips[6] === 'Kids 2', chips);
  const tiles = await r.textContent('#lb-summary');
  check('RC: summary with finishers of starters, fastest and average', /Gefinisht\s*4 van 5/.test(tiles) && tiles.includes('1:05:00') && tiles.includes('1:09:10'), tiles.replace(/\s+/g, ' '));
  check('RC: source links to RaceClocker', (await r.getAttribute('#lb-summary a', 'href')) === 'https://raceclocker.com/f4b23f3b');
  check('RC: club filter hidden, search by name or number', await r.isHidden('#lb-club') && (await r.getAttribute('#lb-search', 'placeholder')) === 'Naam of startnummer');
  check('RC: not live, no "on the course" block', await r.isHidden('#lb-live'));
  await r.click('[data-row="rc-101"]');
  const full = await r.$$eval('.lb-row.open .sp b', b => b.map(x => x.textContent));
  check('RC: 16 lap times in the detail, with running and station totals', full.length === 16 && !full.includes('–') && /Lopen 0:3\d:\d\d · stations 0:2\d:\d\d\./.test(await r.textContent('.lb-row.open .sp-sum')), full);
  await r.click('[data-row="rc-104"]');
  const gap = await r.$$eval('#sp-rc104 .sp b', b => b.map(x => x.textContent));
  const gapNote = await r.textContent('#sp-rc104 .sp-sum');
  check('RC: laps tapped wrong show as – with one combined time', gap.filter(x => x === '–').length === 3 && gapNote.includes('Run 2, Sled push en Run 3 samen') && gapNote.includes('niet elke ronde'.replace('niet', 'Niet')), { gap, gapNote });
  check('RC: combined part is hatched in the bar', (await r.$$eval('[data-row="rc-104"] .bar i.mx', e => e.length)) === 1);
  await r.click('[data-row="rc-105"]');
  check('RC: DNF detail says where it stopped', (await r.textContent('#sp-rc105 .sp-sum')).includes('Gestopt na Sled push, 4 van 16 onderdelen'), await r.textContent('#sp-rc105 .sp-sum'));
  await r.click('[data-row="rc-101"]');
  await r.$eval('#lb-summary', e => e.scrollIntoView());
  await r.screenshot({ path: 'site-rc-lb.png' });
  await r.fill('#lb-search', '103');
  check('RC: search by start number', (await r.$$eval('#lb-list .lb-row', e => e.length)) === 1 && (await r.textContent('#lb-list .nm')) === 'Gelijke Gert');
  await r.fill('#lb-search', '');
  await r.click('[data-cat="doubles_women"]');
  await r.waitForSelector('[data-row="rc-201"]');
  check('RC: penalty shown as a badge', (await r.textContent('[data-row="rc-201"] .badge.warn')) === '+4:00 straftijd');
  await r.click('[data-row="rc-201"]');
  check('RC: penalty reason in the detail', (await r.textContent('#sp-rc201 .sp-sum')).includes('Straftijd 4:00: 2 banen lunges te weinig.'), await r.textContent('#sp-rc201 .sp-sum'));
  await r.click('[data-cat="relay"]');
  await r.click('[data-row="rc-301"]');
  check('RC: relay lists the team without guessing who ran what', (await r.textContent('#sp-rc301 .team-names')) === 'Team: Piet Een, Jan Twee, Kees Drie en Klaas Vier' && (await r.$$eval('#sp-rc301 .member', e => e.length)) === 0);
  await r.click('[data-cat="kids"]');
  await r.click('[data-row="rc-401"]');
  check('RC: kids show the total only', (await r.textContent('#sp-rc401 .sp-sum')) === 'Bij de kids telt alleen de eindtijd.' && (await r.textContent('[data-row="rc-401"] .tm')) === '0:19:10');
  check('RC: only the category switch, no new request', ctxR.rc.calls.length === 1, ctxR.rc.calls.length);
  await r.selectOption('#lb-event', 'sim-02');
  await r.waitForSelector('#lb-list .lb-empty, #lb-list .lb-row');
  const chips2 = await r.$$eval('#lb-cats .chip', c => c.map(x => x.textContent.trim()));
  check('RC: other edition back to self-reported: club filter, no counts, no Kids', await r.isVisible('#lb-club') && chips2.length === 6 && chips2[0] === 'Single mannen' && (await r.$eval('#lb-cats [aria-pressed="true"]', x => x.dataset.cat)) === 'single_men', chips2);
  await r.selectOption('#lb-event', 'sim-03');
  await r.waitForSelector('[data-row="rc-101"]');
  check('RC: back to edition 03 from memory, no new request', ctxR.rc.calls.length === 1, ctxR.rc.calls.length);
  await ctxR.close();

  // A fresh stored copy is used as is; a stale one is refreshed; if that fails the stored copy stays.
  const ctxS = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await setup(ctxS, errs, 'rcfail');
  const fresh = RC_ARCHIVE();
  await ctxS.addInitScript(rows => { window.__rcCache = rows; }, [{ race_id: 'f4b23f3b', event_id: 'sim-03', fetched_at: new Date().toISOString(), payload: fresh }]);
  const s1 = await ctxS.newPage();
  await s1.goto(BASE);
  await s1.waitForSelector('[data-row="rc-101"]');
  check('RC cache: fresh stored copy used without calling the function', ctxS.rc.calls.length === 0, ctxS.rc.calls);
  await s1.close();
  const old = Object.assign(RC_ARCHIVE(), { fetched_at: new Date(Date.now() - 2 * 3600e3).toISOString() });
  old.entries[0].name = 'Oude Opslag';
  await ctxS.addInitScript(rows => { window.__rcCache = rows; }, [{ race_id: 'f4b23f3b', event_id: 'sim-03', fetched_at: old.fetched_at, payload: old }]);
  const s2 = await ctxS.newPage();
  await s2.goto(BASE);
  await s2.waitForSelector('[data-row="rc-101"]');
  check('RC cache: stored copy older than an hour is fetched again', ctxS.rc.calls.length === 1 && (await s2.textContent('[data-row="rc-101"] .nm')) === 'Snelle Sander', ctxS.rc.calls.length);
  await s2.close();
  ctxS.rc.fail = true;
  const s3 = await ctxS.newPage();
  await s3.goto(BASE);
  await s3.waitForSelector('[data-row="rc-101"]');
  check('RC cache: function down, the stored copy is still shown', (await s3.textContent('[data-row="rc-101"] .nm')) === 'Oude Opslag');
  await ctxS.close();

  // Race day of edition 04 with official timing: live
  const ctxL = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Amsterdam' });
  await setup(ctxL, errs, 'rclive');
  await ctxL.route(/assets\/config\.js/, async rt => {
    const resp = await rt.fetch(); let body = await resp.text();
    body = body.replace("start: '2027-03-14T08:00:00+01:00'", "start: '" + new Date(Date.now() - 60e3).toISOString() + "'")
      .replace("raceclocker: { 'sim-03': 'f4b23f3b' },", "raceclocker: { 'sim-03': 'f4b23f3b', 'sim-04': 'abcd1234' }, rcPollMs: 1500,");
    rt.fulfill({ response: resp, body });
  });
  const L = await ctxL.newPage();
  await L.goto(BASE);
  await L.waitForSelector('#lb-live .lb-row');
  check('live: edition 04 is the default on race day', (await L.$eval('#lb-event', s => s.value)) === 'sim-04');
  const onCourse = await L.$$eval('#lb-live .lb-row', rows => rows.map(x => ({ nm: x.querySelector('.nm').textContent, rk: x.querySelector('.rk').textContent, now: x.querySelector('.badge.live').textContent })));
  check('live: athletes on the course, furthest first, with the part they are doing', onCourse.length === 2 && onCourse[0].nm === 'Rennende Ruud' && onCourse[0].rk === '9/16' && onCourse[0].now === 'Nu Roeien' && onCourse[1].now === 'Nu Run 4', onCourse);
  const liveTiles = (await L.textContent('#lb-summary')).replace(/\s+/g, ' ');
  check('live: summary with on course, still to start and last update', /Gefinisht\s*2 van 4/.test(liveTiles) && /Onderweg\s*2 nog 1 te starten/.test(liveTiles) && /Live\s*Bijgewerkt \d+ s geleden/.test(liveTiles), liveTiles);
  const clock1 = await L.textContent('#lb-live .lb-row .tm');
  await wait(L, 1300);
  const clock2 = await L.textContent('#lb-live .lb-row .tm');
  check('live: race clock of an athlete on the course keeps running', /^0:4\d:\d\d$/.test(clock1) && clock1 !== clock2, [clock1, clock2]);
  check('live: hero says the edition is on, with a link', (await L.textContent('#countdown-tbd')) === 'Editie 04 is bezig · volg de uitslag live' && (await L.getAttribute('#countdown-tbd a', 'href')) === '#leaderboard');
  await L.waitForFunction(() => document.querySelectorAll('#lb-list .lb-row').length === 3, null, { timeout: 6000 });
  check('live: after the next update the finisher moves to the results and lights up', (await L.$$eval('#lb-live .lb-row', e => e.length)) === 1 && (await L.$eval('[data-row="rc-503"]', x => x.closest('.lb-row').classList.contains('flash'))) && (await L.textContent('[data-row="rc-503"] .rk')) === '03');
  await wait(L, 450);
  check('live: screen reader hears who came in', (await L.textContent('#lb-status')).startsWith('Binnen: Rennende Ruud, plek 3 in 1:01:40'), await L.textContent('#lb-status'));
  await L.click('[data-row="rc-504"]');
  await wait(L, 1800);
  check('live: an open row stays open through updates', await L.isVisible('#sp-rc504') && (await L.getAttribute('[data-row="rc-504"]', 'aria-expanded')) === 'true');
  const sw3 = await L.evaluate(() => document.documentElement.scrollWidth);
  check('live: no horizontal scroll', sw3 <= 1280, sw3);
  await L.$eval('#leaderboard', e => e.scrollIntoView());
  await L.screenshot({ path: 'site-live-lb.png' });
  await L.selectOption('#lb-event', 'sim-02');
  await L.waitForSelector('#lb-list .lb-empty, #lb-list .lb-row');
  const n1 = ctxL.rc.calls.length;
  await wait(L, 3200);
  check('live: no more requests after switching to an edition without timing', ctxL.rc.calls.length === n1 && await L.isHidden('#lb-live'), [n1, ctxL.rc.calls.length]);
  await ctxL.close();

  // Mobile
  for (const w of [390, 360]) {
    const m = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await setup(m, errs, 'm' + w);
    const q = await m.newPage();
    await q.goto(BASE);
    await q.waitForSelector('#lb-list .lb-row');
    await q.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    const sw = await q.evaluate(() => document.documentElement.scrollWidth);
    check('no horizontal scroll at ' + w, sw <= w, sw);
    const tops = await q.$$eval('.hero .orgs img', imgs => imgs.map(i => i.getBoundingClientRect()).map(r => Math.round(r.top + r.height / 2)));
    check('club logos side by side at ' + w, tops.length === 2 && Math.abs(tops[0] - tops[1]) <= 2, tops);
    await q.$eval('#leaderboard', e => e.scrollIntoView());
    await wait(q, 200);
    if (w === 390) {
      await q.screenshot({ path: 'site-mob-lb.png' });
      await q.click('#menu-btn');
      await q.click('#nav-cta');
      await q.fill('#l-mail', 'mobiel@test.nl');
      await q.click('#l-mail-btn');
      await q.waitForSelector('[data-step="code"]:not([hidden])');
      await q.screenshot({ path: 'site-mob-code.png' });
      await q.fill('#l-code', '424242');
      await q.waitForSelector('[data-step="profile"]:not([hidden])');
      await q.fill('#p-name', 'Mo Biel');
      await q.click('#p-btn');
      await q.waitForSelector('#view-account:not([hidden])');
      const sw2 = await q.evaluate(() => document.documentElement.scrollWidth);
      check('no horizontal scroll on Mijn tijden at 390', sw2 <= 390, sw2);
      await q.screenshot({ path: 'site-mob-account.png' });
    }
    await m.close();
  }

  // rcfail: the function answers 502 on purpose, the browser logs that.
  const relevant = errs.filter(e => !/favicon/.test(e) && !/^rcfail /.test(e));
  check('no console or page errors', relevant.length === 0, relevant);
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  await b.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
