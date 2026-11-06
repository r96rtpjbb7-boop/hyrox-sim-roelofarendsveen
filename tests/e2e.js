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

async function setup(ctx, errs, tag) {
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }));
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route(/fonts\.gstatic\.com\/local\//, r => {
    const m = r.request().url().match(/local\/([^/]+)\/([^/?]+)/);
    r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.join(FS, m[1], 'files', m[2])) });
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
    body = body.replace("start: '2027-03-14'", "start: '2026-01-11'");
    r.fulfill({ response: resp, body });
  });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForSelector('#lb-list .lb-row');
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });

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
  await p.waitForFunction(() => document.querySelector('#l-mail-err').textContent.includes('te veel'));
  check('rate limit mapped to Dutch', true);
  await p.fill('#l-mail', 'Hans.Test@Example.com ');
  await p.click('#l-mail-btn');
  await p.waitForSelector('[data-step="code"]:not([hidden])');
  check('email lowercased and trimmed', (await p.textContent('#l-mail-echo')) === 'hans.test@example.com');
  check('otp call asks to create user', await p.evaluate(() => { const c = window.__calls.filter(x => x.op === 'otp').pop(); return c.payload.options.shouldCreateUser === true && c.payload.email === 'hans.test@example.com'; }));
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
    body = body.replace("start: '2027-03-14'", "start: '2027-03-14T08:00:00+01:00'").replace('signupUrl: null', "signupUrl: 'https://example.com/inschrijven'");
    r.fulfill({ response: resp, body });
  });
  const c = await ctx2.newPage();
  await c.goto(BASE);
  await c.waitForSelector('#lb-list .lb-row');
  check('countdown visible with date', await c.isVisible('#countdown') && await c.isHidden('#countdown-tbd'));
  check('programme title uses weekday', (await c.textContent('#prog-title')) === 'Zondag 14 maart', await c.textContent('#prog-title'));
  check('announcement shows date', (await c.textContent('#announce-left')) === 'Editie 04 · zo 14 maart 2027 · HAL60, Roelofarendsveen', await c.textContent('#announce-left'));
  check('bib shows start time', (await c.textContent('#bib-start')) === 'START 08:00', await c.textContent('#bib-start'));
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
  check('date-only start shows days left', /^Editie 04 · zondag 14 maart 2027 · nog \d+ dagen$/.test(await e.textContent('#countdown-tbd')) && await e.isHidden('#countdown'), await e.textContent('#countdown-tbd'));
  check('announcement for edition 04', (await e.textContent('#announce-left')) === 'Editie 04 · zo 14 maart 2027 · HAL60, Roelofarendsveen', await e.textContent('#announce-left'));
  check('bib for edition 04', (await e.textContent('.bib .num')) === '04' && (await e.textContent('#bib-start')) === 'EDITIE 04' && (await e.textContent('#bib-foot')) === 'EDITIE · 14.03.2027');
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
  check('form cannot pick edition 04 yet', JSON.stringify(await e.$$eval('#f-event option', o => o.map(x => x.textContent))) === JSON.stringify(['Editie 03', 'Editie 02', 'Editie 01']), await e.$$eval('#f-event option', o => o.map(x => x.textContent)));
  check('empty list suggests latest raced edition', (await e.textContent('#entry-list')).includes('bijvoorbeeld van editie 03'), await e.textContent('#entry-list'));
  await ctx3.close();

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

  const relevant = errs.filter(e => !/favicon/.test(e));
  check('no console or page errors', relevant.length === 0, relevant);
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  await b.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
