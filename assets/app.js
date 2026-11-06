/* Hyrox Sim Roelofarendsveen: leaderboard, login with an email code, and "Mijn tijden". */
(function () {
  'use strict';

  var CFG = window.HYROX_CONFIG || {};
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  var ICON_CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  /* ---------- Domain ---------- */
  var STATIONS = ['SkiErg', 'Sled push', 'Sled pull', 'Burpee broad jumps', 'Roeien', 'Farmers carry', 'Sandbag lunges', 'Wall balls'];
  var SEG = [];
  STATIONS.forEach(function (s, i) { SEG.push('Run ' + (i + 1)); SEG.push(s); });
  var CATS = [
    { id: 'single_men', label: 'Single mannen' },
    { id: 'single_women', label: 'Single vrouwen' },
    { id: 'doubles_mixed', label: 'Mixed dubbel', duo: true },
    { id: 'doubles_men', label: 'Mannen dubbel', duo: true },
    { id: 'doubles_women', label: 'Vrouwen dubbel', duo: true },
    { id: 'relay', label: 'Relay', team: true }
  ];
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });
  var DIV_LABEL = { open: 'Open', pro: 'Pro' };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function fmt(s) { var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); }
  function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function parseTime(v) {
    v = String(v).trim().replace(/[.,]/g, ':');
    var m = v.match(/^(\d):([0-5]\d):([0-5]\d)$/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    m = v.match(/^([0-5]?\d):([0-5]\d)$/);
    if (m) return +m[1] * 60 + +m[2];
    return null;
  }

  /* ---------- Supabase ---------- */
  var sb = null;
  try {
    // detectSessionInUrl: a login link in the mail (instead of a code) also works when the Site URL points here.
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  } catch (e) { console.error('Supabase niet beschikbaar', e); }

  // Where the link in the login mail should land: this page, without query or hash.
  // Without it Supabase falls back to the Referer header, which browsers cut down to the
  // bare domain (https://…github.io/), and on GitHub Pages that is a 404 instead of the site.
  // Supabase accepts it as long as it is on the same domain as the Site URL.
  function pageUrl() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined; }

  var api = {
    events: function () { return sb.from('events').select('*').order('sort_order', { ascending: true }); },
    board: function (ev, cat) { return sb.from('leaderboard').select('*').eq('event_id', ev).eq('category', cat).order('total_seconds', { ascending: true }); },
    profile: function (uid) { return sb.from('profiles').select('*').eq('id', uid).maybeSingle(); },
    saveProfile: function (row) { return sb.from('profiles').upsert(row).select().single(); },
    mine: function (uid) { return sb.from('results').select('*').eq('user_id', uid).order('created_at', { ascending: false }); },
    addResult: function (row) { return sb.from('results').upsert(row, { onConflict: 'user_id,event_id,category' }).select().single(); },
    updateResult: function (id, row) { return sb.from('results').update(row).eq('id', id).select().single(); },
    deleteResult: function (id) { return sb.from('results').delete().eq('id', id); },
    sendCode: function (email) { return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, emailRedirectTo: pageUrl() } }); },
    verifyCode: function (email, token) { return sb.auth.verifyOtp({ email: email, token: token, type: 'email' }); },
    signOut: function () { return sb.auth.signOut(); },
    session: function () { return sb.auth.getSession(); }
  };

  function nlError(err) {
    var m = String((err && (err.message || err.error_description)) || '') + ' ' + String((err && (err.code || err.status)) || '');
    // Supabase has three limits that need different advice:
    // 1. one mail per address per minute ("For security purposes, you can only request this after 52 seconds.")
    var wait = /security purposes\D*(\d+)\s*sec/i.exec(m);
    if (wait) return 'Je hebt net al een mail aangevraagd. Wacht nog ' + wait[1] + ' seconden en probeer het dan opnieuw.';
    if (/security purposes/i.test(m)) return 'Je hebt net al een mail aangevraagd. Wacht een minuut en probeer het dan opnieuw.';
    // 2. mails per hour for the whole site ("email rate limit exceeded"), very low until there is an own mail sender
    if (/email rate limit|over_email_send_rate_limit/i.test(m)) return 'De site heeft het afgelopen uur te veel inlogmails verstuurd. Heb je al een mail gekregen? Gebruik de link of code daaruit, of probeer het over een uur opnieuw.';
    // 3. requests per IP address
    if (/rate limit|over_request_rate_limit|429/i.test(m)) return 'Te veel pogingen achter elkaar. Probeer het over een paar minuten opnieuw.';
    if (/not.?authori[sz]ed|email_address_not_authorized/i.test(m)) return 'Naar dit e-mailadres kunnen we nog geen code sturen. Tijdens de testfase werkt inloggen alleen voor de organisatie.';
    if (/expired|invalid.*(otp|token)|otp_expired|token has expired/i.test(m)) return 'Deze code klopt niet of is verlopen. Vraag een nieuwe code aan.';
    if (/23505|duplicate key/i.test(m)) return 'Je hebt al een tijd voor dit event in deze categorie. Pas die tijd aan in je lijst.';
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(m)) return 'Geen verbinding met de server. Controleer je internet en probeer het opnieuw.';
    if (/row-level security|42501|permission denied/i.test(m)) return 'Dat mag niet met dit account. Log opnieuw in en probeer het nog eens.';
    return 'Er ging iets mis (' + (err && err.message ? err.message : 'onbekende fout') + '). Probeer het opnieuw.';
  }

  /* ---------- State ---------- */
  var state = { events: [], session: null, profile: null, mine: [] };
  var lb = { src: 'sim', ev: null, cat: 'single_men', club: '', q: '', div: '', open: {}, flash: null, rows: [], loading: true, error: null, req: 0 };

  function uid() { return state.session && state.session.user ? state.session.user.id : null; }
  function loggedIn() { return !!(uid() && state.profile); }
  // The coming edition (config nextEdition) stays off the leaderboard and the form until it has started.
  var NE = CFG.nextEdition || {};
  var NE_NUM = NE.number || '04';
  var NE_HAS_TIME = typeof NE.start === 'string' && /T\d/.test(NE.start);
  var NE_START = (function () {
    if (!NE.start) return null;
    var d = new Date(NE_HAS_TIME ? NE.start : NE.start + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  })();
  function notYetRaced(id) { return !!NE.eventId && id === NE.eventId && (!NE_START || Date.now() < NE_START.getTime()); }
  function eventsOf(src) {
    var kind = src === 'sim' ? 'sim' : 'official';
    var list = state.events.filter(function (e) { return e.kind === kind && !notYetRaced(e.id); });
    list.sort(function (a, b) { return src === 'sim' ? b.sort_order - a.sort_order : a.sort_order - b.sort_order; });
    return list;
  }
  function eventById(id) { return state.events.filter(function (e) { return e.id === id; })[0]; }
  function eventLabel(id) { var e = eventById(id); return e ? e.name : id; }
  function srcOfEvent(id) { var e = eventById(id); return e && e.kind === 'official' ? 'off' : 'sim'; }

  /* ---------- Leaderboard ---------- */
  function toRow(d) {
    var c = CAT[d.category] || {};
    var names = d.athlete || 'Onbekend';
    var members = null;
    if (c.team) { names = d.team_name || ('Team ' + names.split(' ')[0]); members = [d.athlete].concat(d.teammates || []); }
    else if (c.duo && d.partner_name) { names = d.athlete + ' & ' + d.partner_name; }
    return { id: d.id, names: names, members: members, club: d.club || 'Gast', total: d.total_seconds, verified: d.status === 'verified', division: d.division, splits: d.splits && d.splits.length === 16 ? d.splits : null, mine: !!uid() && d.user_id === uid() };
  }
  function ranked(rows) {
    var list = rows.map(toRow);
    list.sort(function (a, b) { return a.total - b.total; });
    var rank = 0, prev = -1;
    list.forEach(function (r, i) { if (r.total !== prev) { rank = i + 1; prev = r.total; } r.rank = rank; });
    return list;
  }

  function loadBoard() {
    if (!sb || !lb.ev) { lb.loading = false; lb.rows = []; renderLB(); return Promise.resolve(); }
    var token = ++lb.req;
    lb.loading = true; lb.error = null; renderLB();
    return api.board(lb.ev, lb.cat).then(function (res) {
      if (token !== lb.req) return;
      lb.loading = false;
      if (res.error) { lb.error = nlError(res.error); lb.rows = []; } else { lb.rows = res.data || []; }
      renderLB();
    }, function (err) {
      if (token !== lb.req) return;
      lb.loading = false; lb.error = nlError(err); lb.rows = []; renderLB();
    });
  }

  function rowHTML(r) {
    var open = !!lb.open[r.id];
    var b = [];
    if (r.mine) b.push('<span class="badge me">Jij</span>');
    b.push(r.verified ? '<span class="badge ok">' + ICON_CHECK + 'Geverifieerd</span>' : '<span class="badge">Zelf ingevoerd</span>');
    if (r.division === 'pro') b.push('<span class="badge pro">Pro</span>');
    var bar = r.splits
      ? '<span class="bar" aria-hidden="true">' + r.splits.map(function (s, i) { return '<i class="' + (i % 2 ? 'st' : 'rn') + '" style="flex:' + s + ' 1 0"></i>'; }).join('') + '</span>'
      : '<span class="bar bar-empty" aria-hidden="true"></span>';
    var sid = 'sp-' + String(r.id).replace(/[^a-z0-9]/gi, '');
    var rk = r.rank === 1 ? 'rk top1' : r.rank <= 3 ? 'rk top' : 'rk';
    return '<li class="lb-row' + (r.mine ? ' mine' : '') + (open ? ' open' : '') + (lb.flash === r.id ? ' flash' : '') + '">' +
      '<button type="button" class="lb-main" data-row="' + esc(r.id) + '" aria-expanded="' + open + '" aria-controls="' + sid + '">' +
      '<span class="' + rk + '">' + String(r.rank).padStart(2, '0') + '</span>' +
      '<span class="who"><span class="nm">' + esc(r.names) + '</span><span class="meta"><span>' + esc(r.club) + '</span>' + b.join('') + '</span></span>' +
      bar +
      '<span class="tm">' + fmt(r.total) + '</span>' +
      '<span class="chev" aria-hidden="true">' + ICON_CHEV + '</span>' +
      '</button>' +
      '<div class="lb-detail" id="' + sid + '"' + (open ? '' : ' hidden') + '>' + detailHTML(r) + '</div></li>';
  }
  function membersHTML(r) {
    if (!r.members) return '';
    return '<div class="members">' + r.members.map(function (m, k) {
      var t = r.splits ? r.splits[4 * k] + r.splits[4 * k + 1] + r.splits[4 * k + 2] + r.splits[4 * k + 3] : null;
      return '<div class="member"><span>Teamlid ' + (k + 1) + ' · run ' + (2 * k + 1) + ' + ' + (2 * k + 2) + '</span><b>' + esc(m) + '</b><span>' + STATIONS[2 * k] + ' · ' + STATIONS[2 * k + 1] + '</span>' + (t ? '<em>' + mmss(t) + '</em>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function detailHTML(r) {
    if (!r.splits) {
      return membersHTML(r) + '<p class="sp-sum">' + (r.mine ? 'Je hebt geen tussentijden ingevoerd.' : 'Voor deze tijd zijn geen tussentijden bekend.') + '</p>';
    }
    var run = 0;
    r.splits.forEach(function (s, i) { if (i % 2 === 0) run += s; });
    return membersHTML(r) + '<div class="splits">' + r.splits.map(function (s, i) { return '<div class="sp ' + (i % 2 ? 'st' : 'rn') + '"><span>' + SEG[i] + '</span><b>' + mmss(s) + '</b></div>'; }).join('') + '</div>' +
      '<p class="sp-sum">Lopen ' + fmt(run) + ' · stations ' + fmt(r.total - run) + '</p>';
  }

  function renderControls() {
    var active = document.activeElement;
    var refocus = active && active.dataset && active.dataset.cat ? '[data-cat="' + active.dataset.cat + '"]' : null;
    $$('[data-src]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.src === lb.src)); });
    var evs = eventsOf(lb.src);
    $('#lb-event').innerHTML = evs.length
      ? evs.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === lb.ev ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('')
      : '<option value="">Nog geen events</option>';
    $('#ctrl-div').hidden = lb.src !== 'off';
    $$('#lb-div button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.div === lb.div)); });
    $('#lb-cats').innerHTML = CATS.map(function (c) { return '<button type="button" class="chip" data-cat="' + c.id + '" aria-pressed="' + (c.id === lb.cat) + '">' + c.label + '</button>'; }).join('');
    if (refocus) { var f = $(refocus); if (f) f.focus(); }
    $('#lb-eyebrow').textContent = (lb.src === 'sim' ? 'Sim Roelofarendsveen · ' : '') + (lb.ev ? eventLabel(lb.ev) + ' · ' : '') + CAT[lb.cat].label;
  }

  var statusT = null;
  function announce(msg) {
    clearTimeout(statusT);
    statusT = setTimeout(function () { $('#lb-status').textContent = msg; }, 350);
  }
  function renderLB() {
    renderControls();
    var list = $('#lb-list');
    if (lb.loading) {
      $('#lb-summary').innerHTML = '';
      list.innerHTML = '<li class="lb-loading">Leaderboard laden…</li>';
      return;
    }
    if (lb.error) {
      $('#lb-summary').innerHTML = '';
      list.innerHTML = '<li class="lb-error">' + esc(lb.error) + ' <button type="button" class="linkbtn" id="lb-retry">Opnieuw laden</button></li>';
      announce(lb.error);
      return;
    }
    var all = ranked(lb.rows);
    var q = lb.q.trim().toLowerCase();
    var rows = all.filter(function (r) {
      var hay = (r.names + ' ' + (r.members ? r.members.join(' ') : '')).toLowerCase();
      return (!lb.club || r.club === lb.club) && (!q || hay.indexOf(q) >= 0) && (!lb.div || r.division === lb.div);
    });
    var best = all[0];
    var mine = all.filter(function (r) { return r.mine; })[0];
    var avg = all.length ? Math.round(all.reduce(function (a, r) { return a + r.total; }, 0) / all.length) : 0;
    $('#lb-summary').innerHTML =
      '<div><span class="k">Deelnemers</span><span class="v">' + all.length + '</span></div>' +
      '<div><span class="k">Snelste tijd</span><span class="v">' + (best ? fmt(best.total) : '–') + '</span></div>' +
      '<div><span class="k">Gemiddeld</span><span class="v">' + (avg ? fmt(avg) : '–') + '</span></div>' +
      '<div class="' + (mine ? 'is-mine' : '') + '"><span class="k">Jouw plek</span><span class="v">' +
      (mine ? mine.rank + ' <small>van ' + all.length + '</small>' : '<button type="button" class="linkbtn" data-open-login style="font-size:16px">' + (loggedIn() ? 'Tijd toevoegen' : 'Log in') + '</button>') +
      '</span></div>';
    if (!all.length) {
      list.innerHTML = '<li class="lb-empty">Nog geen tijden in deze categorie. Liep jij hier? Zet je tijd erin en sta bovenaan.<br><button type="button" class="btn btn-primary btn-sm" data-open-login>Tijd invoeren</button></li>';
      announce('Nog geen tijden bij ' + CAT[lb.cat].label + '.');
      return;
    }
    list.innerHTML = rows.length
      ? rows.map(rowHTML).join('')
      : '<li class="lb-empty">Geen resultaten voor deze filters. <button type="button" class="linkbtn" id="lb-reset">Wis filters</button></li>';
    announce(rows.length === 1 ? '1 tijd getoond.' : rows.length + ' tijden getoond.');
  }

  /* ---------- Clicks ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
    if (!t) return;
    var el;
    if ((el = t.closest('[data-src]'))) {
      if (lb.src !== el.dataset.src) { lb.src = el.dataset.src; var evs = eventsOf(lb.src); lb.ev = evs.length ? evs[0].id : null; lb.div = ''; lb.open = {}; loadBoard(); }
      return;
    }
    if ((el = t.closest('[data-cat]'))) { lb.cat = el.dataset.cat; lb.open = {}; loadBoard(); return; }
    if ((el = t.closest('#lb-div [data-div]'))) { lb.div = el.dataset.div; renderLB(); return; }
    if ((el = t.closest('[data-row]'))) {
      var id = el.dataset.row, li = el.parentNode, det = li.querySelector('.lb-detail');
      var open = !lb.open[id];
      if (open) lb.open[id] = 1; else delete lb.open[id];
      el.setAttribute('aria-expanded', String(open));
      li.classList.toggle('open', open);
      det.hidden = !open;
      return;
    }
    if (t.closest('#lb-reset')) { lb.club = ''; lb.q = ''; lb.div = ''; $('#lb-club').value = ''; $('#lb-search').value = ''; renderLB(); return; }
    if (t.closest('#lb-retry')) { loadBoard(); return; }
    if (t.closest('[data-open-login]')) { e.preventDefault(); goMine(); return; }
    if (t.closest('[data-signup]')) {
      toast('De inschrijving voor editie ' + NE_NUM + ' opent binnenkort.');
      return;
    }
    if ((el = t.closest('[data-edit]'))) { startEdit(el.dataset.edit); return; }
    if ((el = t.closest('[data-del]'))) { confirmDel = el.dataset.del; renderAccount(); var y = $('[data-del-yes]'); if (y) y.focus(); return; }
    if (t.closest('[data-del-no]')) { var was = confirmDel; confirmDel = null; renderAccount(); var d = $('[data-del="' + was + '"]'); if (d) d.focus(); return; }
    if ((el = t.closest('[data-del-yes]'))) { removeEntry(el.dataset.delYes, el); return; }
    if ((el = t.closest('[data-view]'))) { viewOnBoard(el.dataset.view); return; }
  });
  $('#lb-event').addEventListener('change', function (e) { lb.ev = e.target.value; lb.open = {}; loadBoard(); });
  $('#lb-club').addEventListener('change', function (e) { lb.club = e.target.value; renderLB(); });
  $('#lb-search').addEventListener('input', function (e) { lb.q = e.target.value; renderLB(); });

  /* ---------- Login with email code ---------- */
  var dlg = $('#login');
  var pendingMail = null, resendLeft = 0, resendTimer = null;
  function showErr(sel, msg) { var el = $(sel); el.textContent = msg; el.hidden = false; }
  function hideErr(sel) { var el = $(sel); el.hidden = true; el.textContent = ''; }
  function busy(btn, on, label) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); if (label) btn.textContent = label; }
  function step(name) { $$('[data-step]', dlg).forEach(function (el) { el.hidden = el.dataset.step !== name; }); }
  function openLogin() {
    if (uid() && !state.profile) { step('profile'); } else { step('mail'); hideErr('#l-mail-err'); $('#l-mail').value = pendingMail || ''; }
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else { dlg.setAttribute('open', ''); }
    setTimeout(function () { var f = uid() && !state.profile ? $('#p-name') : $('#l-mail'); f.focus(); }, 40);
  }
  function closeLogin() { if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open'); }
  function goMine() {
    if (loggedIn()) { if (location.hash === '#mijn-tijden') route(); else location.hash = 'mijn-tijden'; }
    else openLogin();
  }
  $('#login-close').addEventListener('click', closeLogin);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeLogin(); });
  function startResend(seconds) {
    resendLeft = seconds || 60; var b = $('#l-resend');
    clearInterval(resendTimer);
    var upd = function () { b.textContent = resendLeft > 0 ? 'Nieuwe code over ' + resendLeft + ' s' : 'Nieuwe code sturen'; b.disabled = resendLeft > 0; };
    upd();
    resendTimer = setInterval(function () { resendLeft--; upd(); if (resendLeft <= 0) clearInterval(resendTimer); }, 1000);
  }
  function sendCode(email, btn, errSel, after) {
    busy(btn, true);
    return api.sendCode(email).then(function (res) {
      busy(btn, false);
      if (res.error) { showErr(errSel, nlError(res.error)); return; }
      after();
    }, function (err) { busy(btn, false); showErr(errSel, nlError(err)); });
  }
  $('#form-mail').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#l-mail').value.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) { showErr('#l-mail-err', 'Vul een geldig e-mailadres in, bijvoorbeeld naam@gmail.com.'); $('#l-mail').focus(); return; }
    hideErr('#l-mail-err');
    if (!sb) { showErr('#l-mail-err', 'De verbinding met de server is niet gelukt. Ververs de pagina en probeer het opnieuw.'); return; }
    sendCode(v, $('#l-mail-btn'), '#l-mail-err', function () {
      pendingMail = v;
      $('#l-mail-echo').textContent = v; $('#l-code').value = ''; hideErr('#l-code-err');
      step('code'); startResend(60);
      setTimeout(function () { $('#l-code').focus(); }, 40);
    });
  });
  // Must match "Email OTP Length" in Supabase (Authentication, Sign In / Providers, Email). Default 6.
  var CODE_LEN = CFG.codeLength || 6;
  // No maxlength: a pasted code like " 424 242" would be cut off before the spaces are stripped.
  $('#l-code').removeAttribute('maxlength');
  $('#l-code').addEventListener('input', function (e) {
    var v = e.target.value.replace(/\D/g, '').slice(0, CODE_LEN);
    e.target.value = v;
    if (v.length === CODE_LEN && typeof $('#form-code').requestSubmit === 'function') $('#form-code').requestSubmit();
  });
  $('#form-code').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('#l-code').value.replace(/\D/g, '');
    if (c.length < CODE_LEN) { showErr('#l-code-err', 'De code heeft ' + CODE_LEN + ' cijfers.'); return; }
    var btn = $('#l-code-btn');
    if (btn.disabled) return;
    busy(btn, true);
    api.verifyCode(pendingMail, c).then(function (res) {
      busy(btn, false);
      if (res.error || !res.data || !res.data.session) { showErr('#l-code-err', nlError(res.error || { message: 'invalid otp' })); $('#l-code').select(); return; }
      state.session = res.data.session;
      return loadProfile().then(function () {
        if (!state.profile) { step('profile'); hideErr('#p-err'); setTimeout(function () { $('#p-name').focus(); }, 40); }
        else finishLogin();
      });
    }, function (err) { busy(btn, false); showErr('#l-code-err', nlError(err)); });
  });
  $('#l-resend').addEventListener('click', function () {
    var b = $('#l-resend');
    sendCode(pendingMail, b, '#l-code-err', function () { startResend(60); toast('Nieuwe code verstuurd naar ' + pendingMail + '.'); });
  });
  $('#l-back').addEventListener('click', function () { step('mail'); setTimeout(function () { $('#l-mail').focus(); }, 40); });
  $('#p-switch').addEventListener('click', function () {
    api.signOut().then(function () {
      state.session = null; state.profile = null; state.mine = [];
      updateNav(); hideErr('#l-mail-err'); $('#l-mail').value = '';
      step('mail'); setTimeout(function () { $('#l-mail').focus(); }, 40);
    });
  });
  $('#form-profile').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('#p-name').value.trim().replace(/\s+/g, ' ');
    if (n.length < 2) { showErr('#p-err', 'Vul je naam in zoals je op het leaderboard wilt staan.'); $('#p-name').focus(); return; }
    var btn = $('#p-btn'); busy(btn, true);
    api.saveProfile({ id: uid(), display_name: n.slice(0, 60), club: $('#p-club').value }).then(function (res) {
      busy(btn, false);
      if (res.error) { showErr('#p-err', nlError(res.error)); return; }
      state.profile = res.data;
      finishLogin();
    }, function (err) { busy(btn, false); showErr('#p-err', nlError(err)); });
  });
  function finishLogin() {
    closeLogin(); updateNav();
    toast('Ingelogd als ' + state.profile.display_name + '.');
    loadMine().then(function () { renderLB(); });
    if (location.hash === '#mijn-tijden') route(); else location.hash = 'mijn-tijden';
  }
  function loadProfile() {
    if (!uid()) { state.profile = null; return Promise.resolve(); }
    return api.profile(uid()).then(function (res) { state.profile = res.error ? null : res.data; });
  }
  function loadMine() {
    if (!uid()) { state.mine = []; return Promise.resolve(); }
    return api.mine(uid()).then(function (res) { state.mine = res.error ? [] : (res.data || []); renderAccount(); });
  }
  function updateNav() { $('#nav-cta').textContent = loggedIn() ? 'Mijn tijden' : 'Tijd invoeren'; }
  $('#nav-cta').addEventListener('click', function (e) { e.preventDefault(); closeMenu(); goMine(); });
  $('#btn-logout').addEventListener('click', function () {
    api.signOut().then(function () {
      state.session = null; state.profile = null; state.mine = [];
      updateNav(); resetForm(); renderLB();
      location.hash = 'leaderboard';
      toast('Je bent uitgelogd.');
    });
  });

  /* ---------- Mijn tijden ---------- */
  var editing = null, confirmDel = null;
  function formSrc() { return $('#f-src-off').checked ? 'off' : 'sim'; }
  $('#f-cat').innerHTML = CATS.map(function (c) { return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('');
  function syncForm() {
    var src = formSrc(), sel = $('#f-event'), cur = sel.value;
    var evs = eventsOf(src).filter(function (e) { return e.accepts_entries || e.id === cur; });
    sel.innerHTML = evs.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + '</option>'; }).join('');
    if (evs.some(function (e) { return e.id === cur; })) sel.value = cur;
    $('#fw-div').hidden = src !== 'off';
    $('#fw-link').hidden = src !== 'off';
    var c = CAT[$('#f-cat').value] || {};
    $('#fw-partner').hidden = !c.duo;
    $('#fw-team').hidden = !c.team;
  }
  $$('input[name="f-src"]').forEach(function (r) { r.addEventListener('change', syncForm); });
  $('#f-cat').addEventListener('change', syncForm);
  function formErr(msg, focusSel) { showErr('#f-error', msg); if (focusSel) $(focusSel).focus(); }
  function resetForm() {
    editing = null; $('#entry-form').reset(); hideErr('#f-error');
    $('#form-title').textContent = 'Tijd toevoegen'; $('#f-submit').textContent = 'Tijd opslaan'; $('#f-cancel').hidden = true;
    syncForm();
  }
  $('#f-cancel').addEventListener('click', function () { resetForm(); renderAccount(); });
  $('#entry-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!loggedIn()) { openLogin(); return; }
    var src = formSrc(), ev = $('#f-event').value, cat = $('#f-cat').value, c = CAT[cat];
    if (!ev) return formErr('Kies een event.', '#f-event');
    var total = parseTime($('#f-time').value);
    if (total === null) return formErr('Vul je eindtijd in als uren:minuten:seconden, bijvoorbeeld 1:12:05.', '#f-time');
    if (total < 1800 || total > 12600) return formErr('Die tijd lijkt niet te kloppen. Een Hyrox duurt meestal tussen 50 minuten en 2,5 uur.', '#f-time');
    var pname = $('#f-pname').value.trim().replace(/\s+/g, ' ');
    if (c.duo && pname.length < 2) return formErr('Vul de naam van je partner in.', '#f-pname');
    var tname = $('#f-team').value.trim().replace(/\s+/g, ' ');
    var mates = ['#f-mate1', '#f-mate2', '#f-mate3'].map(function (sel) { return $(sel).value.trim().replace(/\s+/g, ' '); });
    if (c.team && tname.length < 2) return formErr('Vul de naam van je team in.', '#f-team');
    if (c.team) { for (var mi = 0; mi < 3; mi++) { if (mates[mi].length < 2) return formErr('Vul de namen van alle vier teamleden in.', '#f-mate' + (mi + 1)); } }
    var link = $('#f-link').value.trim();
    if (src === 'off' && link && !/^https?:\/\//i.test(link)) return formErr('De link moet beginnen met https://', '#f-link');
    hideErr('#f-error');
    var row = {
      user_id: uid(), event_id: ev, category: cat,
      division: src === 'off' ? $('#f-div').value : 'open',
      total_seconds: total,
      partner_name: c.duo ? pname.slice(0, 60) : null,
      team_name: c.team ? tname.slice(0, 60) : null,
      teammates: c.team ? mates.map(function (m) { return m.slice(0, 60); }) : null,
      proof_url: src === 'off' && link ? link.slice(0, 500) : null
    };
    var btn = $('#f-submit'); busy(btn, true);
    var wasEditing = !!editing;
    var replacing = !editing && state.mine.some(function (m) { return m.event_id === ev && m.category === cat; });
    var call = editing ? api.updateResult(editing, row) : api.addResult(row);
    call.then(function (res) {
      busy(btn, false);
      if (res.error) { formErr(nlError(res.error)); return; }
      var saved = res.data;
      resetForm();
      return loadMine().then(function () {
        lb.src = srcOfEvent(saved.event_id); lb.ev = saved.event_id; lb.cat = saved.category; lb.open = {};
        return loadBoard();
      }).then(function () {
        var all = ranked(lb.rows), me = all.filter(function (r) { return r.id === saved.id; })[0];
        var verb = wasEditing ? 'Aangepast.' : replacing ? 'Bijgewerkt, je had hier al een tijd staan.' : 'Opgeslagen.';
        toast(verb + (me ? ' Je staat op plek ' + me.rank + ' van ' + all.length + ' bij ' + CAT[saved.category].label + ', ' + eventLabel(saved.event_id) + '.' : ''));
      });
    }, function (err) { busy(btn, false); formErr(nlError(err)); });
  });
  function startEdit(id) {
    var e = state.mine.filter(function (x) { return x.id === id; })[0]; if (!e) return;
    editing = id; confirmDel = null;
    $('#f-src-' + srcOfEvent(e.event_id)).checked = true; syncForm();
    $('#f-event').value = e.event_id; $('#f-cat').value = e.category; syncForm();
    $('#f-div').value = e.division || 'open';
    $('#f-pname').value = e.partner_name || '';
    $('#f-team').value = e.team_name || '';
    ['#f-mate1', '#f-mate2', '#f-mate3'].forEach(function (sel, k) { $(sel).value = (e.teammates || [])[k] || ''; });
    $('#f-time').value = fmt(e.total_seconds); $('#f-link').value = e.proof_url || '';
    $('#form-title').textContent = 'Tijd aanpassen'; $('#f-submit').textContent = 'Wijziging opslaan'; $('#f-cancel').hidden = false;
    renderAccount();
    $('#entry-form').scrollIntoView({ block: 'start' });
    $('#f-time').focus();
  }
  function removeEntry(id, btn) {
    busy(btn, true);
    api.deleteResult(id).then(function (res) {
      if (res.error) { busy(btn, false); toast(nlError(res.error)); return; }
      if (editing === id) resetForm();
      confirmDel = null;
      loadMine().then(function () { loadBoard(); });
      toast('Tijd verwijderd.');
    }, function (err) { busy(btn, false); toast(nlError(err)); });
  }
  function viewOnBoard(id) {
    var e = state.mine.filter(function (x) { return x.id === id; })[0]; if (!e) return;
    lb.src = srcOfEvent(e.event_id); lb.ev = e.event_id; lb.cat = e.category; lb.club = ''; lb.q = ''; lb.div = ''; lb.open = {};
    $('#lb-club').value = ''; $('#lb-search').value = '';
    lb.flash = id;
    loadBoard();
    location.hash = 'leaderboard';
    setTimeout(function () { lb.flash = null; }, 2600);
  }
  function entryHTML(e) {
    var c = CAT[e.category] || { label: e.category };
    var badge = e.status === 'verified' ? '<span class="badge ok">' + ICON_CHECK + 'Geverifieerd</span>'
      : e.status === 'rejected' ? '<span class="badge warn">Afgekeurd door de organisatie</span>'
      : e.proof_url ? '<span class="badge">Link ingediend, wordt gecontroleerd</span>' : '<span class="badge">Zelf ingevoerd</span>';
    var actions = confirmDel === e.id
      ? '<span class="ask">Deze tijd verwijderen?</span><button type="button" class="btn btn-sm btn-danger" data-del-yes="' + esc(e.id) + '">Verwijderen</button><button type="button" class="btn btn-sm btn-quiet" data-del-no>Annuleren</button>'
      : '<button type="button" class="btn btn-sm btn-quiet" data-view="' + esc(e.id) + '">Bekijk op leaderboard</button><button type="button" class="btn btn-sm btn-quiet" data-edit="' + esc(e.id) + '">Aanpassen</button><button type="button" class="btn btn-sm btn-quiet" data-del="' + esc(e.id) + '">Verwijderen</button>';
    var who = e.team_name ? ' · ' + esc(e.team_name) : e.partner_name ? ' met ' + esc(e.partner_name) : '';
    return '<li class="entry"' + (editing === e.id ? ' style="border-color: var(--accent)"' : '') + '>' +
      '<div class="e-top"><span class="e-ev">' + esc((srcOfEvent(e.event_id) === 'sim' ? 'Sim · ' : '') + eventLabel(e.event_id)) + (srcOfEvent(e.event_id) === 'off' ? ' · ' + (DIV_LABEL[e.division] || '') : '') + '</span><span class="e-time">' + fmt(e.total_seconds) + '</span></div>' +
      '<div class="e-meta">' + c.label + who + '</div>' +
      '<div class="e-badges">' + badge + '</div>' +
      '<div class="e-actions">' + actions + '</div></li>';
  }
  function renderAccount() {
    if (!loggedIn()) return;
    var u = state.profile;
    $('#acc-hello').textContent = 'Hoi ' + (u.display_name.split(' ')[0] || '');
    $('#acc-mail').textContent = 'Ingelogd als ' + (state.session.user.email || '') + ' · ' + u.club;
    var es = state.mine;
    var best = function (a) { return a.length ? fmt(Math.min.apply(null, a.map(function (e) { return e.total_seconds; }))) : '–'; };
    $('#acc-stats').innerHTML =
      '<div><span class="k">Races</span><span class="v">' + es.length + '</span></div>' +
      '<div><span class="k">Snelste sim</span><span class="v">' + best(es.filter(function (e) { return srcOfEvent(e.event_id) === 'sim'; })) + '</span></div>' +
      '<div><span class="k">Snelste officieel</span><span class="v">' + best(es.filter(function (e) { return srcOfEvent(e.event_id) === 'off'; })) + '</span></div>';
    $('#entry-list').innerHTML = es.length
      ? es.map(entryHTML).join('')
      : '<li class="empty"><b>Nog geen tijden.</b> Vul hiernaast je eerste tijd in' + (eventsOf('sim')[0] ? ', bijvoorbeeld van ' + esc(eventsOf('sim')[0].name.toLowerCase()) : '') + '. Die staat daarna meteen op het leaderboard.</li>';
  }

  /* ---------- Routing ---------- */
  function route() {
    var h = location.hash.replace('#', '');
    if (h === 'mijn-tijden') {
      if (!loggedIn()) { $('#view-account').hidden = true; $('#view-home').hidden = false; openLogin(); return; }
      $('#view-home').hidden = true; $('#view-account').hidden = false;
      renderAccount(); syncForm();
      window.scrollTo(0, 0);
      return;
    }
    var wasHidden = $('#view-home').hidden;
    $('#view-account').hidden = true; $('#view-home').hidden = false;
    if (h) { var el = document.getElementById(h); if (el && (wasHidden || h === 'leaderboard')) el.scrollIntoView(); }
    else if (wasHidden) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- Static content from config ---------- */
  var MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  var DAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
  var FULLDAYS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
  function dmy(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); }
  function renderStatic() {
    var num = NE_NUM, start = NE_START;
    var dateTxt = start ? DAYS[start.getDay()] + ' ' + start.getDate() + ' ' + MONTHS[start.getMonth()] + ' ' + start.getFullYear() : 'datum volgt';
    var longDate = start ? FULLDAYS[start.getDay()].toLowerCase() + ' ' + start.getDate() + ' ' + MONTHS[start.getMonth()] + ' ' + start.getFullYear() : '';
    $('#announce-left').textContent = 'Editie ' + num + ' · ' + dateTxt + ' · ' + (NE.location || 'HAL60, Roelofarendsveen');
    $('.bib .num').textContent = num;
    $('#bib-foot').textContent = 'EDITIE · ' + (start ? dmy(start) : 'DATUM VOLGT');
    $('#bib-start').textContent = start && NE_HAS_TIME ? 'START ' + String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0') : 'EDITIE ' + num;
    $('#prog-title').textContent = start ? FULLDAYS[start.getDay()] + ' ' + start.getDate() + ' ' + MONTHS[start.getMonth()] : 'Editie ' + num;
    // With a signup link the buttons become real links (new tab, long-press and copy work on phones).
    if (CFG.signupUrl) {
      $$('[data-signup]').forEach(function (b) {
        var a = document.createElement('a');
        a.className = b.className; a.href = CFG.signupUrl; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = b.textContent;
        b.parentNode.replaceChild(a, b);
      });
    }
    var prog = CFG.programme || [];
    $('#timeline').innerHTML = prog.map(function (p) { return '<li><b>' + esc(p[0]) + '</b><span>' + esc(p[1]) + '</span></li>'; }).join('');
    $('#timeline').hidden = !prog.length;
    $('#prog-note').textContent = prog.length ? 'Voorlopig programma. Je exacte heattijd krijg je een week van tevoren per mail.' : 'Het programma volgt zodra de heats bekend zijn.';
    var future = !!start && start.getTime() > Date.now();
    if (future && NE_HAS_TIME) {
      // Start time known: count down to the second.
      $('#countdown').hidden = false; $('#countdown-tbd').hidden = true;
      $('#countdown').firstChild.textContent = 'Start editie ' + num + ' over ';
      var tick = function () {
        var d = Math.max(0, start.getTime() - Date.now());
        var days = Math.floor(d / 864e5); d -= days * 864e5;
        var h = Math.floor(d / 36e5); d -= h * 36e5;
        var m = Math.floor(d / 6e4); var s = Math.floor((d - m * 6e4) / 1e3);
        $('#cd-d').textContent = days; $('#cd-h').textContent = String(h).padStart(2, '0');
        $('#cd-m').textContent = String(m).padStart(2, '0'); $('#cd-s').textContent = String(s).padStart(2, '0');
      };
      tick(); setInterval(tick, 1000);
    } else {
      $('#countdown').hidden = true; $('#countdown-tbd').hidden = false;
      var left = future ? Math.ceil((start.getTime() - Date.now()) / 864e5) : 0;
      $('#countdown-tbd').textContent = 'Editie ' + num + ' · ' + (!start ? 'datum volgt' : longDate + (future ? ' · nog ' + left + (left === 1 ? ' dag' : ' dagen') : ''));
    }
  }

  /* ---------- Menu & toast ---------- */
  function closeMenu() { $('#nav-links').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  $('#menu-btn').addEventListener('click', function () { var o = !$('#nav-links').classList.contains('open'); $('#nav-links').classList.toggle('open', o); this.setAttribute('aria-expanded', String(o)); });
  $$('#nav-links a').forEach(function (a) { a.addEventListener('click', closeMenu); });

  var toastT = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.hidden = true; }, 250); }, 4800);
  }

  /* ---------- Boot ---------- */
  function boot() {
    // An expired or already used login link lands here with the error in the hash.
    var linkError = /error_description=/.test(location.hash);
    if (linkError) history.replaceState(null, '', location.pathname + location.search);
    renderStatic(); updateNav(); renderLB(); syncForm();
    if (!sb) { lb.loading = false; lb.error = 'De leaderboard kon niet laden. Ververs de pagina en probeer het opnieuw.'; renderLB(); route(); return; }
    sb.auth.onAuthStateChange(function (_event, session) { state.session = session; });
    api.session().then(function (res) {
      state.session = res && res.data ? res.data.session : null;
      return loadProfile();
    }).then(function () {
      updateNav();
      if (linkError) toast('Deze inloglink is verlopen of al gebruikt. Log opnieuw in, dan krijg je een nieuwe code.');
      // Signed in through a link in the mail but no name yet: ask for it straight away.
      if (uid() && !state.profile) openLogin();
      return api.events();
    }).then(function (res) {
      if (res.error) { lb.loading = false; lb.error = nlError(res.error); renderLB(); return; }
      state.events = res.data || [];
      var evs = eventsOf(lb.src);
      lb.ev = evs.length ? evs[0].id : null;
      syncForm();
      loadMine();
      return loadBoard();
    }).then(function () { route(); }, function (err) {
      lb.loading = false; lb.error = nlError(err); renderLB(); route();
    });
  }
  boot();
})();
