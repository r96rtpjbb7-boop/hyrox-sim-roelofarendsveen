// Login paths against the REAL supabase-js 2.45.4 (the version index.html loads), with the Supabase server mocked.
// Serve the site folder first, then run: node login-real.js http://127.0.0.1:8765/
// A: requesting a login mail sends this page as redirect_to (not the bare github.io domain).
// B: the link from the mail lands on the site with the session in the hash -> logged in, name step, profile saved with that token.
// C: an expired link shows a toast and cleans the address bar.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SB = path.join(__dirname, 'node_modules/@supabase/supabase-js/dist/umd');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const API = 'https://ocdnerhyssvkjhdgstvp.supabase.co';
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); if (!ok) fails++; }

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const USER = { id: '11111111-2222-3333-4444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'hans@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const JWT = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ sub: USER.id, aud: 'authenticated', role: 'authenticated', email: USER.email, exp, iat: exp - 3600, session_id: 'sess-1' }) + '.c2ln';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };

async function setup(ctx, log, db) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net/, r => {
    const f = path.join(SB, r.request().url().split('?')[0].split('/').pop());
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(f) });
  });
  await ctx.route(u => u.href.startsWith(API), r => {
    const req = r.request();
    const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: CORS, body: '' });
    log.push({ m: req.method(), path: u.pathname, search: u.search, auth: req.headers()['authorization'] || '', body: req.postData() || '' });
    const json = (status, body) => r.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify(body) });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/user') return req.headers()['authorization'] === 'Bearer ' + JWT ? json(200, USER) : json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    if (u.pathname === '/rest/v1/events') return json(200, [{ id: 'sim-03', kind: 'sim', name: 'Editie 03', location: 'HAL60, Roelofarendsveen', sort_order: 3, accepts_entries: true }]);
    if (u.pathname === '/rest/v1/leaderboard' || u.pathname === '/rest/v1/results') return json(200, []);
    if (u.pathname === '/rest/v1/profiles') {
      if (req.method() === 'GET') return json(200, db.profile ? [db.profile] : []);
      const row = JSON.parse(req.postData() || '{}');
      db.profile = Object.assign({ created_at: new Date().toISOString() }, Array.isArray(row) ? row[0] : row);
      return json(201, db.profile);
    }
    return json(404, { message: 'not mocked: ' + u.pathname });
  });
}

async function page(b, log, db) {
  const ctx = await b.newContext({ timezoneId: 'Europe/Amsterdam' });
  await setup(ctx, log, db);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  return { ctx, p, errs };
}

(async () => {
  const b = await chromium.launch();

  { // A
    const log = [], db = {};
    const { ctx, p, errs } = await page(b, log, db);
    await p.goto(BASE);
    await p.click('#nav-cta');
    await p.fill('#l-mail', 'hans@example.com');
    await p.click('#l-mail-btn');
    await p.waitForSelector('[data-step="code"]:not([hidden])');
    const otp = log.find(x => x.path === '/auth/v1/otp');
    const rt = otp && new URLSearchParams(otp.search).get('redirect_to');
    check('A: real supabase-js sends redirect_to = this page', rt === BASE, rt);
    check('A: otp body has email and create_user', !!otp && /"email":"hans@example.com"/.test(otp.body) && /"create_user":true/.test(otp.body), otp && otp.body);
    check('A: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  { // B
    const log = [], db = {};
    const { ctx, p, errs } = await page(b, log, db);
    await p.goto(BASE + '#access_token=' + JWT + '&expires_at=' + exp + '&expires_in=3600&refresh_token=rt-1&token_type=bearer&type=magiclink');
    await p.waitForSelector('[data-step="profile"]:not([hidden])', { timeout: 10000 });
    check('B: link login opens the name step', await p.$eval('#login', d => d.open));
    check('B: session checked with /auth/v1/user', log.some(x => x.path === '/auth/v1/user' && x.auth === 'Bearer ' + JWT));
    check('B: tokens removed from the address bar', await p.evaluate(() => !/access_token/.test(location.href)), await p.evaluate(() => location.href));
    check('B: session stored in this browser', await p.evaluate(() => Object.keys(localStorage).includes('sb-ocdnerhyssvkjhdgstvp-auth-token')));
    await p.fill('#p-name', 'Hans Test');
    await p.click('#p-btn');
    await p.waitForFunction(() => document.querySelector('[data-step="profile"]').hidden || !document.querySelector('#login').open, null, { timeout: 10000 });
    const prof = log.find(x => x.path === '/rest/v1/profiles' && x.m === 'POST');
    check('B: profile saved with the login token', !!prof && prof.auth === 'Bearer ' + JWT && /"display_name":"Hans Test"/.test(prof.body), prof && prof.body);
    check('B: no error shown on the name step', await p.$eval('#p-err', e => e.hidden));
    await p.goto(BASE);
    await p.waitForTimeout(1500);
    check('B: after reload still logged in, no name step again', !(await p.$eval('#login', d => d.open)) && await p.evaluate(() => Object.keys(localStorage).includes('sb-ocdnerhyssvkjhdgstvp-auth-token')));
    check('B: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  { // C
    const log = [], db = {};
    const { ctx, p, errs } = await page(b, log, db);
    await p.goto(BASE + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('verlopen'), null, { timeout: 10000 });
    check('C: expired link shows a toast and cleans the address', await p.evaluate(() => location.hash === ''), await p.evaluate(() => location.href));
    check('C: no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
