/* Test double for supabase-js v2: same call shapes the site uses, data in localStorage. */
(function () {
  var LS_DB = 'fake-db', LS_SES = 'fake-session';
  function lat() { return window.__lat != null ? window.__lat : 60; }
  function later(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, lat()); }); }
  window.__calls = [];

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function splitsFor(total, rnd) {
    var w = [], s = 0, i;
    for (i = 0; i < 16; i++) { var x = (i % 2 ? 0.9 : 1.1) * (0.8 + rnd() * 0.4); w.push(x); s += x; }
    var out = w.map(function (x) { return Math.max(1, Math.round(total * x / s)); });
    var diff = total - out.reduce(function (a, b) { return a + b; }, 0); out[15] += diff; return out;
  }
  var nid = 0;
  function uuid() { nid++; return '00000000-0000-4000-8000-' + String(Date.now() % 1e6).padStart(6, '0') + String(nid).padStart(6, '0'); }

  function seed() {
    var rnd = rng(7);
    var db = {
      events: [
        { id: 'sim-01', kind: 'sim', name: 'Editie 01', location: 'HAL60, Roelofarendsveen', sort_order: 1, accepts_entries: true },
        { id: 'sim-02', kind: 'sim', name: 'Editie 02', location: 'HAL60, Roelofarendsveen', sort_order: 2, accepts_entries: true },
        { id: 'sim-03', kind: 'sim', name: 'Editie 03', location: 'HAL60, Roelofarendsveen', sort_order: 3, accepts_entries: true },
        { id: 'sim-04', kind: 'sim', name: 'Editie 04', location: 'HAL60, Roelofarendsveen', sort_order: 4, accepts_entries: true },
        { id: 'off-utrecht', kind: 'official', name: 'Hyrox Utrecht', location: 'Utrecht', sort_order: 101, accepts_entries: true },
        { id: 'off-amsterdam', kind: 'official', name: 'Hyrox Amsterdam', location: 'Amsterdam', sort_order: 102, accepts_entries: true }
      ],
      profiles: [], results: []
    };
    var men = ['Jeroen de Vries', 'Bas van Leeuwen', 'Thijs Kok', 'Ruben Bakker', 'Daan Visser', 'Niels Jansen', 'Koen Smit', 'Mark de Boer', 'Sven Mulder', 'Joost Vermeer'];
    var women = ['Sanne de Graaf', 'Lotte van Dijk', 'Eva Hendriks', 'Fleur Dekker', 'Iris Brouwer', 'Noor Vos', 'Anouk Peters'];
    var clubs = ['Club Confidence', 'By Opdam', 'Gast'];
    var k = 0;
    function person(name) { k++; var p = { id: 'user-' + k, display_name: name, club: clubs[k % 3] }; db.profiles.push(p); return p; }
    function res(p, ev, cat, total, extra) {
      var r = Object.assign({ id: uuid(), user_id: p ? p.id : null, athlete_name: null, athlete_club: null, event_id: ev, category: cat, division: 'open', total_seconds: total, splits: rnd() < 0.7 ? splitsFor(total, rnd) : null, partner_name: null, team_name: null, teammates: null, proof_url: null, status: rnd() < 0.25 ? 'verified' : 'self_reported', created_at: new Date(Date.now() - k * 36e5).toISOString() }, extra || {});
      db.results.push(r); return r;
    }
    men.forEach(function (n, i) { res(person(n), 'sim-04', 'single_men', 3720 + i * 151 + Math.round(rnd() * 90)); });
    women.forEach(function (n, i) { res(person(n), 'sim-04', 'single_women', 4080 + i * 163 + Math.round(rnd() * 90)); });
    res(null, 'sim-04', 'single_men', db.results[1].total_seconds, { athlete_name: 'Pieter Geimporteerd', athlete_club: 'By Opdam', status: 'verified', splits: null });
    var partnersM = ['Lisa Kramer', 'Emma Willems', 'Julia Bos', 'Sara Meijer', 'Roos Prins'];
    db.profiles.slice(0, 5).forEach(function (p, i) { res(p, 'sim-04', 'doubles_mixed', 3540 + i * 140, { partner_name: partnersM[i] }); });
    db.profiles.slice(5, 8).forEach(function (p, i) { res(p, 'sim-04', 'doubles_men', 3420 + i * 150, { partner_name: ['Tim Hoek', 'Rick Post', 'Lars Kuiper'][i] }); });
    db.profiles.slice(10, 12).forEach(function (p, i) { res(p, 'sim-04', 'doubles_women', 3900 + i * 170, { partner_name: ['Mila Bosch', 'Tess Lammers'][i] }); });
    [['De Sleeduwers', ['Anna Kok', 'Wouter Ros', 'Bram Dijkstra']], ['Wall Ball Warriors', ['Femke Blom', 'Joris Kuipers', 'Maud Veenstra']], ['Polder Power', ['Tom Wolters', 'Kim de Haan', 'Jesse van Wijk']]].forEach(function (t, i) {
      res(db.profiles[i + 2], 'sim-04', 'relay', 3240 + i * 180, { team_name: t[0], teammates: t[1], splits: splitsFor(3240 + i * 180, rnd) });
    });
    db.profiles.slice(0, 6).forEach(function (p, i) { res(p, 'sim-03', 'single_men', 3900 + i * 170); });
    res(null, 'sim-03', 'single_men', 2400, { athlete_name: 'Afgekeurde Tijd', athlete_club: 'Gast', status: 'rejected' });
    db.profiles.slice(0, 6).forEach(function (p, i) { res(p, 'off-amsterdam', 'single_men', 3660 + i * 200, { division: i % 3 === 0 ? 'pro' : 'open', proof_url: 'https://results.hyrox.com/' }); });
    db.profiles.slice(10, 13).forEach(function (p, i) { res(p, 'off-utrecht', 'single_women', 4200 + i * 220, { division: 'open' }); });
    // Edition 01 has no official timing: a self-reported time of someone who also raced later.
    res(db.profiles[0], 'sim-01', 'single_men', 4300, { status: 'verified', splits: null });
    return db;
  }
  function loadDB() { try { var d = JSON.parse(localStorage.getItem(LS_DB)); if (d && d.events) return d; } catch (e) {} var s = seed(); localStorage.setItem(LS_DB, JSON.stringify(s)); return s; }
  function saveDB(db) { localStorage.setItem(LS_DB, JSON.stringify(db)); }
  function session() { try { return JSON.parse(localStorage.getItem(LS_SES)); } catch (e) { return null; } }
  function uid() { var s = session(); return s && s.user ? s.user.id : null; }
  function err(message, code, status) { return { data: null, error: { message: message, code: code || '', details: null, hint: null, status: status } }; }
  function rlsErr(t) { return err('new row violates row-level security policy for table "' + t + '"', '42501'); }

  function viewRows(db, t) {
    if (t === 'leaderboard') {
      return db.results.filter(function (r) { return r.status !== 'rejected'; }).map(function (r) {
        var p = db.profiles.filter(function (x) { return x.id === r.user_id; })[0];
        return { id: r.id, event_id: r.event_id, category: r.category, division: r.division, total_seconds: r.total_seconds, splits: r.splits, status: r.status, partner_name: r.partner_name, team_name: r.team_name, teammates: r.teammates, user_id: r.user_id, athlete: p ? p.display_name : r.athlete_name, club: p ? p.club : (r.athlete_club || 'Gast'), created_at: r.created_at };
      });
    }
    if (t === 'results') return db.results.filter(function (r) { return r.status !== 'rejected' || (r.user_id && r.user_id === uid()); });
    // Stored RaceClocker results: tests put rows in window.__rcCache before the page loads.
    if (t === 'raceclocker_cache') return window.__rcCache || [];
    // Changes organisers make in the Table Editor: tests put them in window.__eventPatch.
    if (t === 'events' && window.__eventPatch) return db.events.map(function (e) { return Object.assign({}, e, window.__eventPatch[e.id] || {}); });
    return db[t] || [];
  }
  function checkResult(db, r) {
    if (!(r.total_seconds >= 1800 && r.total_seconds <= 12600)) return err('new row violates check constraint "results_total_seconds_check"', '23514');
    if (/^doubles_/.test(r.category) && !r.partner_name) return err('new row violates check constraint "results_partner_for_doubles"', '23514');
    if (r.category === 'relay' && (!r.team_name || !r.teammates || r.teammates.length !== 3)) return err('new row violates check constraint "results_team_for_relay"', '23514');
    return null;
  }

  function Q(t) { this.t = t; this.op = 'select'; this.filters = []; this.ord = null; this.mode = null; this.payload = null; this.opts = null; }
  Q.prototype.select = function () { return this; };
  Q.prototype.eq = function (c, v) { this.filters.push([c, v]); return this; };
  Q.prototype.in = function (c, v) { this.filters.push([c, v, 'in']); return this; };
  Q.prototype.order = function (c, o) { this.ord = [c, !o || o.ascending !== false]; return this; };
  Q.prototype.maybeSingle = function () { this.mode = 'maybe'; return this; };
  Q.prototype.single = function () { this.mode = 'single'; return this; };
  Q.prototype.upsert = function (row, opts) { this.op = 'upsert'; this.payload = row; this.opts = opts || {}; return this; };
  Q.prototype.update = function (row) { this.op = 'update'; this.payload = row; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  Q.prototype.then = function (a, b) { return this.run().then(a, b); };
  Q.prototype.match = function (r) { return this.filters.every(function (f) { return f[2] === 'in' ? f[1].indexOf(r[f[0]]) >= 0 : r[f[0]] === f[1]; }); };
  Q.prototype.out = function (rows) {
    if (this.mode === 'maybe') return rows.length > 1 ? err('JSON object requested, multiple (or no) rows returned', 'PGRST116') : { data: rows[0] || null, error: null };
    if (this.mode === 'single') return rows.length === 1 ? { data: rows[0], error: null } : err('JSON object requested, multiple (or no) rows returned', 'PGRST116');
    return { data: rows, error: null };
  };
  Q.prototype.run = function () {
    var self = this;
    window.__calls.push({ t: this.t, op: this.op, filters: this.filters.slice(), payload: this.payload, opts: this.opts });
    if (window.__fail && window.__fail[this.t + ':' + this.op]) return later(err('TypeError: Failed to fetch'));
    var db = loadDB(), me = uid(), res;
    if (this.op === 'select') {
      var rows = viewRows(db, this.t).filter(function (r) { return self.match(r); });
      if (this.ord) { var c = this.ord[0], asc = this.ord[1]; rows.sort(function (x, y) { return (x[c] > y[c] ? 1 : x[c] < y[c] ? -1 : 0) * (asc ? 1 : -1); }); }
      res = this.out(rows);
    } else if (this.t === 'profiles' && this.op === 'upsert') {
      var p = this.payload;
      if (!me || p.id !== me) res = rlsErr('profiles');
      else {
        var ex = db.profiles.filter(function (x) { return x.id === me; })[0];
        if (ex) Object.assign(ex, p); else db.profiles.push(Object.assign({}, p));
        saveDB(db); res = this.out([Object.assign({}, p)]);
      }
    } else if (this.t === 'results' && this.op === 'upsert') {
      if (!me) res = rlsErr('results');
      else {
        var row = Object.assign({}, this.payload, { user_id: me, athlete_name: null, athlete_club: null });
        var ev = db.events.filter(function (e) { return e.id === row.event_id; })[0];
        var bad = checkResult(db, row);
        if (!ev || !ev.accepts_entries) res = rlsErr('results');
        else if (bad) res = bad;
        else {
          var cur = db.results.filter(function (x) { return x.user_id === me && x.event_id === row.event_id && x.category === row.category; })[0];
          if (cur) {
            var timeChanged = cur.total_seconds !== row.total_seconds || cur.division !== row.division;
            Object.assign(cur, row, { id: cur.id, status: timeChanged ? 'self_reported' : cur.status, created_at: cur.created_at });
            saveDB(db); res = this.out([cur]);
          } else {
            var n = Object.assign({ id: uuid(), splits: null, status: 'self_reported', created_at: new Date().toISOString() }, row, { status: 'self_reported' });
            db.results.push(n); saveDB(db); res = this.out([n]);
          }
        }
      }
    } else if (this.t === 'results' && this.op === 'update') {
      var targets = db.results.filter(function (x) { return self.match(x) && me && x.user_id === me; });
      var upd = this.payload, conflict = null, invalid = null;
      targets.forEach(function (x) {
        var nx = Object.assign({}, x, upd, { user_id: x.user_id });
        if (db.results.some(function (o) { return o.id !== x.id && o.user_id === me && o.event_id === nx.event_id && o.category === nx.category; })) conflict = err('duplicate key value violates unique constraint "results_one_per_race"', '23505');
        invalid = invalid || checkResult(db, nx);
      });
      if (conflict) res = conflict;
      else if (invalid) res = invalid;
      else {
        targets.forEach(function (x) {
          var changed = x.total_seconds !== upd.total_seconds || x.event_id !== upd.event_id || x.category !== upd.category || x.division !== upd.division;
          Object.assign(x, upd, { user_id: x.user_id, status: changed ? 'self_reported' : x.status });
        });
        saveDB(db); res = this.out(targets);
      }
    } else if (this.t === 'results' && this.op === 'delete') {
      var before = db.results.length;
      db.results = db.results.filter(function (x) { return !(self.match(x) && me && x.user_id === me); });
      saveDB(db); res = { data: null, error: null, count: before - db.results.length };
    } else res = err('not supported in fake: ' + this.t + ' ' + this.op);
    return later(JSON.parse(JSON.stringify(res)));
  };

  var listeners = [];
  function emit(ev, s) { listeners.forEach(function (cb) { setTimeout(function () { cb(ev, s); }, 0); }); }
  var auth = {
    getSession: function () { return later({ data: { session: session() }, error: null }); },
    onAuthStateChange: function (cb) { listeners.push(cb); setTimeout(function () { cb('INITIAL_SESSION', session()); }, 0); return { data: { subscription: { unsubscribe: function () {} } } }; },
    signInWithOtp: function (o) {
      window.__calls.push({ t: 'auth', op: 'otp', payload: o });
      if (/ratelimit/.test(o.email)) return later({ data: { user: null, session: null }, error: { message: 'For security purposes, you can only request this after 52 seconds.', status: 429, code: 'over_email_send_rate_limit' } });
      if (/uurlimiet/.test(o.email)) return later({ data: { user: null, session: null }, error: { message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' } });
      if (/extern/.test(o.email)) return later({ data: { user: null, session: null }, error: { message: 'Email address not authorized', status: 400, code: 'email_address_not_authorized' } });
      return later({ data: { user: null, session: null }, error: null });
    },
    verifyOtp: function (o) {
      window.__calls.push({ t: 'auth', op: 'verify', payload: o });
      if (o.token !== '424242' || o.type !== 'email') return later({ data: { user: null, session: null }, error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' } });
      var s = { access_token: 'fake', token_type: 'bearer', user: { id: 'user-' + o.email.replace(/[^a-z0-9]/g, ''), email: o.email } };
      localStorage.setItem(LS_SES, JSON.stringify(s)); emit('SIGNED_IN', s);
      return later({ data: { user: s.user, session: s }, error: null });
    },
    signOut: function () { localStorage.removeItem(LS_SES); emit('SIGNED_OUT', null); return later({ error: null }); }
  };
  window.supabase = {
    createClient: function (url, key, opts) {
      window.__clientArgs = { url: url, key: key, opts: opts };
      return { from: function (t) { return new Q(t); }, auth: auth };
    }
  };
})();
