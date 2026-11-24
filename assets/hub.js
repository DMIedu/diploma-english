(function () {
'use strict';
var C = window.DMI_CONFIG, A = window.DMI_API, app = document.getElementById('app');
var $ = function (i) { return document.getElementById(i); };
if (!A.token()) { location.replace('index.html'); return; }
var FIRST = false, ME = A.user() || {}, DATA = { results: [], writing: [], loaded: false }, EXAM = null, lastHash = location.hash, skipHash = false;
var LEVELS = ['A1', 'A2', 'B1', 'B2'], LEVEL_NAMES = { A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate', B2: 'Upper intermediate' };
$('hl').textContent = C.HOTLINE;

/* ---------------- helpers ---------------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fdate(d) { if (!d) return ''; var x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fdt(d) { var x = new Date(d); return isNaN(x) ? '' : fdate(x) + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes()); }
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
var loaded = {};
function load(src) {
  if (!loaded[src]) loaded[src] = new Promise(function (res, rej) {
    var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(); }; document.head.appendChild(s);
  });
  return loaded[src];
}
function loading() { app.innerHTML = '<div class="loading">Loading…</div>'; }
function failLoad() { app.innerHTML = '<main class="wrap"><div class="msg bad">Could not load this page. Please check your internet and refresh.</div></main>'; }
function authFail(r) { if (r && r.code === 'AUTH') { A.clear(); alert(r.error || 'Please sign in again.'); location.replace('index.html'); return true; } return false; }
function refresh() {
  return A.call('myResults').then(function (r) {
    if (authFail(r)) return r;
    if (r.ok) { DATA.results = r.results || []; DATA.writing = r.writing || []; DATA.loaded = true; }
    return r;
  });
}
function best(skill, test) {
  var b = null; DATA.results.forEach(function (r) { if (r.skill === skill && r.test === test && (b === null || Number(r.percent) > b)) b = Number(r.percent); });
  return b;
}
function attempts(skill, test) { return DATA.results.filter(function (r) { return r.skill === skill && r.test === test; }).length; }
function saveResult(o, el) {
  if (el) { el.className = 'msg warn'; el.textContent = 'Saving your marks…'; }
  return A.call('saveResult', o).then(function (r) {
    if (authFail(r)) return;
    if (el) {
      if (r.ok) { el.className = 'msg ok'; el.textContent = '✓ Your marks are saved to your DMI record.'; }
      else { el.className = 'msg bad'; el.textContent = 'Marks not saved: ' + (r.error || 'no connection') + ' Please show this screen to your teacher.'; }
    }
    if (r.ok) DATA.results.push({ time: new Date().toISOString(), skill: o.skill, level: o.level, test: o.test, score: o.score, max: o.max, percent: Math.round(o.score / o.max * 100) });
  });
}
function grade(p) { return p >= 75 ? 'Distinction' : p >= 65 ? 'Merit' : p >= 50 ? 'Pass' : 'Keep practising'; }
function levelChips(cur, base) {
  return '<div class="chips" role="tablist" aria-label="Level">' + LEVELS.map(function (l) {
    return '<a class="chip' + (l === cur ? ' on' : '') + '" href="#' + base + '/' + l + '" aria-current="' + (l === cur) + '">' + l + ' · ' + LEVEL_NAMES[l] + '</a>';
  }).join('') + '</div>';
}
function curLevel(p) { var l = (p || '').toUpperCase(); if (LEVELS.indexOf(l) < 0) l = ls('dmi_de_level') || 'A1'; ls('dmi_de_level', l); return l; }

/* ---------------- speech ---------------- */
var VOICE = null;
function pickVoice() {
  try { var v = speechSynthesis.getVoices(); VOICE = v.filter(function (x) { return /en-GB/i.test(x.lang); })[0] || v.filter(function (x) { return /^en/i.test(x.lang); })[0] || null; } catch (e) {}
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function stopAudio() { try { speechSynthesis.cancel(); } catch (e) {} }
function speak(text, rate, onend) {
  if (!('speechSynthesis' in window)) { alert('This browser cannot read text aloud. Please use Google Chrome.'); return; }
  stopAudio();
  var parts = String(text).match(/[^.!?]+[.!?]*\s*/g) || [text], i = 0;
  (function next() {
    if (i >= parts.length) { if (onend) onend(); return; }
    var u = new SpeechSynthesisUtterance(parts[i++].trim());
    u.lang = 'en-GB'; u.rate = rate || 0.9; if (VOICE) u.voice = VOICE;
    u.onend = next; u.onerror = function (e) { if (e.error !== 'interrupted' && e.error !== 'canceled') next(); };
    speechSynthesis.speak(u);
  })();
}

/* ---------------- exam mode ---------------- */
function examOn(on) {
  document.body.classList.toggle('nosel', on);
  $('top').hidden = on; $('nav').hidden = on; $('foot').hidden = on;
}
document.addEventListener('copy', function (e) { if (EXAM && !EXAM.done) e.preventDefault(); });
document.addEventListener('contextmenu', function (e) { if (EXAM && !EXAM.done) e.preventDefault(); });
window.addEventListener('beforeunload', function (e) { if (EXAM && !EXAM.done) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- shell ---------------- */
function header() {
  var exp = ME.expiry ? new Date(ME.expiry) : null, days = exp ? Math.ceil((exp - Date.now()) / 864e5) : null;
  $('who').innerHTML = '<b>' + esc(ME.name || '') + '</b><span>' + esc([ME.regNo, ME.batch || ME.branch].filter(Boolean).join(' · ')) + '</span>' +
    (days !== null && days <= 14 ? '<br><span class="badge warn">Access ends in ' + Math.max(days, 0) + ' day' + (days === 1 ? '' : 's') + '</span>' : '');
}
header();

function route() {
  if (skipHash) { skipHash = false; return; }
  if (EXAM && !EXAM.done) {
    if (!confirm('Leave this test? Your answers will be lost.')) { skipHash = true; location.hash = lastHash; return; }
    if (EXAM.timer) clearInterval(EXAM.timer);
  }
  EXAM = null; examOn(false); stopAudio(); lastHash = location.hash;
  app.onclick = null; app.onchange = null;
  if (REC) { try { REC.mr.stop(); } catch (e) {} }
  var h = decodeURIComponent(location.hash.slice(1) || 'home'), p = h.split('/');
  Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
    var on = a.dataset.r === ({ vtest: 'vocab', lpaper: 'listening', rpaper: 'reading', wtask: 'writing', sunit: 'speaking' }[p[0]] || p[0]);
    a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  var R = { home: home, vocab: vocab, vtest: vtest, listening: listening, lpaper: lpaper, reading: reading, rpaper: rpaper,
            writing: writing, wtask: wtask, speaking: speaking, sunit: sunit, results: results, account: account }[p[0]] || home;
  R(p[1], p[2]);
}
window.addEventListener('hashchange', route);

/* ---------------- home ---------------- */
function home(x, y, fresh) {
  if (FIRST) { FIRST = false; fresh = true; }
  if (!fresh) refresh().then(function (r) { if (r && r.ok && /^(#home)?$/.test(location.hash)) home(null, null, true); });
  var done = function (skill) { var s = {}; DATA.results.forEach(function (r) { if (r.skill === skill) s[r.test] = 1; }); return Object.keys(s).length; };
  var recent = DATA.results.slice().sort(function (a, b) { return new Date(b.time) - new Date(a.time); }).slice(0, 6);
  app.innerHTML = '<main class="wrap"><div class="eyebrow">Welcome back</div><h2>Hello, ' + esc((ME.name || '').split(' ')[0]) + ' 👋</h2>' +
    '<p class="muted" style="margin-top:0">Choose a practice room. Every test you finish is saved to your DMI record.' +
    (ME.expiry ? ' Your access is open until <b>' + fdate(ME.expiry) + '</b>.' : '') + '</p>' +
    '<div class="grid">' +
    tile('#vocab', '📚', 'Vocabulary', '856 verbs with Tamil meanings · ' + done('Vocabulary') + ' / 4 tests taken', true) +
    tile('#listening', '🎧', 'Listening', '40 papers, A1–B2 · ' + done('Listening') + ' / 40 taken') +
    tile('#reading', '📖', 'Reading', 'A1–B2 reading papers · ' + done('Reading') + ' taken') +
    tile('#writing', '✍️', 'Writing', '24 tasks · AI marks · ' + DATA.writing.length + ' sent') +
    tile('#speaking', '🗣️', 'Speaking', '40 speaking units · ' + done('Speaking') + ' practised') +
    tile('#results', '📊', 'My results', DATA.results.length + ' marks recorded') +
    '</div><h3 style="margin-top:28px">Recent marks</h3>' +
    (recent.length ? resultsTable(recent) : '<p class="muted">No marks yet. Start with a vocabulary test or a listening paper.</p>') + '</main>';
}
function tile(href, ic, t, s, y) { return '<a class="tile' + (y ? ' y' : '') + '" href="' + href + '"><span class="ic" aria-hidden="true">' + ic + '</span><b>' + t + '</b><span>' + esc(s) + '</span></a>'; }
function resultsTable(list) {
  return '<div class="tbl"><table class="t"><thead><tr><th>Date</th><th>Skill</th><th>Test</th><th>Marks</th><th>%</th></tr></thead><tbody>' +
    list.map(function (r) { return '<tr><td>' + fdt(r.time) + '</td><td>' + esc(r.skill) + '</td><td>' + esc(r.test) + '</td><td>' + esc(r.score) + ' / ' + esc(r.max) + '</td><td><b>' + esc(r.percent) + '%</b></td></tr>'; }).join('') +
    '</tbody></table></div>';
}

/* ---------------- vocabulary practice ---------------- */
var VS = { mode: 'list', page: 80, q: '', fi: 0, flip: false, quiz: null };
function learned(v) { if (v) ls('dmi_vocab_learned', JSON.stringify(v)); try { return JSON.parse(ls('dmi_vocab_learned') || '{}'); } catch (e) { return {}; } }
function hiSentence(o) { if (!o.b) return esc(o.en); var re = new RegExp('(^|[^A-Za-z-])(' + o.b.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ')(?![A-Za-z-])', 'i'); return esc(o.en).replace(re, '$1<mark>$2</mark>'); }
function vocab() {
  loading();
  load('assets/data/words.js').then(function () {
    var W = window.DMI_WORDS;
    app.innerHTML = '<main class="wrap"><div class="eyebrow">Do it yourself book · pages 80–99</div><h2>Vocabulary</h2>' +
      '<h3 style="margin-top:14px">Vocabulary tests <span class="muted" style="font-weight:500;font-size:14px">· 100 marks · ' + C.VOCAB_TEST_MINUTES + ' minutes</span></h3><div class="grid">' +
      C.VOCAB_TESTS.map(function (t) {
        var b = best('Vocabulary', t.name), n = attempts('Vocabulary', t.name);
        return '<a class="tile' + (b !== null ? ' done' : '') + '" href="#vtest/' + t.id + '"><b>' + t.name + '</b><span>Pages ' + t.pages[0] + '–' + t.pages[t.pages.length - 1] +
          (b !== null ? ' · best ' + b + '% · ' + n + ' attempt' + (n > 1 ? 's' : '') : ' · not taken yet') + '</span></a>';
      }).join('') + '</div>' +
      '<h3 style="margin-top:26px">Learn the words</h3><div class="chips" id="vm">' +
      ['list', 'flash', 'quiz'].map(function (m) { return '<button class="chip' + (VS.mode === m ? ' on' : '') + '" data-m="' + m + '">' + { list: 'Word list', flash: 'Flashcards', quiz: 'Quick practice' }[m] + '</button>'; }).join('') +
      '</div><div id="vp" style="margin-top:10px"></div><div class="bar"><input type="search" id="vq" placeholder="Search a word or Tamil meaning (all pages)…" aria-label="Search words"><span class="muted" id="vprog" style="font-weight:700;font-size:13px"></span></div><div id="vv"></div></main>';
    function pages() {
      $('vp').innerHTML = '<div class="chips">' + C.VOCAB_TESTS.reduce(function (a, t) { return a.concat(t.pages); }, []).map(function (p) {
        return '<button class="chip' + (p === VS.page && !VS.q ? ' on' : '') + '" data-p="' + p + '">Page ' + p + '</button>'; }).join('') + '</div>';
    }
    function cur() {
      var q = VS.q.trim().toLowerCase();
      if (q) return W.filter(function (o) { return o.w.toLowerCase().indexOf(q) === 0 || o.ta.indexOf(q) > -1 || o.f.join(' ').toLowerCase().indexOf(q) > -1; });
      return W.filter(function (o) { return o.p === VS.page; });
    }
    function card(o, L) {
      var d = L[o.n];
      return '<article class="w' + (d ? ' done' : '') + '"><div class="hd"><span class="num">' + o.n + '</span><span class="word">' + esc(o.w) + '</span><span class="mean ta">' + esc(o.ta) + '</span>' +
        '<span class="acts"><button class="btn sm" data-say="' + esc(o.w + '. ' + o.en) + '" aria-label="Listen to ' + esc(o.w) + '">🔊 Listen</button><button class="btn sm" data-learn="' + o.n + '">' + (d ? '✓ Learned' : 'Mark learned') + '</button></span></div>' +
        '<div class="forms"><div><small>Base (V1)</small>' + esc(o.w) + '</div><div><small>Past (V2)</small>' + esc(o.f[0]) + '</div><div><small>Past participle (V3)</small>' + esc(o.f[1]) + '</div><div><small>He / She / It</small>' + esc(o.f[2]) + '</div><div><small>-ing form</small>' + esc(o.f[3]) + '</div></div>' +
        '<div class="ex"><div>' + hiSentence(o) + '</div><div class="ta muted">' + esc(o.tas) + '</div></div></article>';
    }
    function render() {
      var L = cur(), v = $('vv'), Ld = learned();
      $('vprog').textContent = (VS.q ? 'Search: ' : 'Page ' + VS.page + ': ') + L.length + ' words · ' + L.filter(function (o) { return Ld[o.n]; }).length + ' learned';
      if (!L.length) { v.innerHTML = '<div class="card muted">No words found.</div>'; return; }
      if (VS.mode === 'list') { v.innerHTML = L.map(function (o) { return card(o, Ld); }).join(''); return; }
      if (VS.mode === 'flash') {
        if (VS.fi >= L.length) VS.fi = 0; var o = L[VS.fi];
        v.innerHTML = '<div class="card flash" id="fc" tabindex="0" role="button" aria-label="Flip card">' + (VS.flip ?
          '<div class="word">' + esc(o.w) + '</div><div class="mean ta">' + esc(o.ta) + '</div><div><b>' + esc([o.w].concat(o.f).join(' – ')) + '</b></div><div style="margin-top:10px">' + hiSentence(o) + '</div><div class="ta muted">' + esc(o.tas) + '</div>' :
          '<div class="word">' + esc(o.w) + '</div><div class="muted">Tap to see the meaning</div>') + '</div>' +
          '<div class="row"><button class="btn" id="fp">← Back</button><span class="muted" style="align-self:center;font-weight:700">' + (VS.fi + 1) + ' / ' + L.length + '</span><button class="btn pri" id="fn">Next →</button><button class="btn" id="fs" aria-label="Listen">🔊</button></div>';
        var flip = function () { VS.flip = !VS.flip; render(); };
        $('fc').onclick = flip; $('fc').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
        $('fp').onclick = function () { VS.fi = (VS.fi - 1 + L.length) % L.length; VS.flip = false; render(); };
        $('fn').onclick = function () { VS.fi = (VS.fi + 1) % L.length; VS.flip = false; render(); };
        $('fs').onclick = function () { speak(o.w, 0.9); };
        return;
      }
      if (!VS.quiz) newQuiz(L); drawQuiz();
      function newQuiz(L) {
        var pool = L.length >= 4 ? L : W;
        VS.quiz = { i: 0, score: 0, picked: null, qs: shuffle(L).slice(0, 10).map(function (o, i) {
          var wrong = []; shuffle(pool).forEach(function (x) { if (wrong.length < 3 && x.w !== o.w && x.ta !== o.ta && wrong.every(function (y) { return y.w !== x.w && y.ta !== x.ta; })) wrong.push(x); });
          if (i % 3 === 0) return { t: 'What is the Tamil meaning of <b>' + esc(o.w) + '</b>?', a: o.ta, ta: true, opts: shuffle([o.ta].concat(wrong.map(function (x) { return x.ta; }))) };
          if (i % 3 === 1) return { t: 'Which English word means <b class="ta">' + esc(o.ta) + '</b>?', a: o.w, opts: shuffle([o.w].concat(wrong.map(function (x) { return x.w; }))) };
          var set = []; [o.f[0], o.f[1], o.w, o.f[2], o.f[3]].forEach(function (x) { if (set.indexOf(x) < 0) set.push(x); });
          return { t: 'Past tense (V2) of <b>' + esc(o.w) + '</b>?', a: o.f[0], opts: shuffle(set.slice(0, 4)) };
        }) };
      }
      function drawQuiz() {
        var Q = VS.quiz;
        if (Q.i >= Q.qs.length) {
          v.innerHTML = '<div class="card" style="text-align:center"><h2>' + Q.score + ' / ' + Q.qs.length + '</h2><p class="muted">Quick practice only — not recorded.</p><div class="row"><button class="btn pri" id="again">Practise again</button></div></div>';
          $('again').onclick = function () { VS.quiz = null; render(); }; return;
        }
        var q = Q.qs[Q.i];
        v.innerHTML = '<div class="card"><div class="muted" style="font-weight:700;font-size:13px">Question ' + (Q.i + 1) + ' of ' + Q.qs.length + ' · Score ' + Q.score + '</div><p style="font-size:19px">' + q.t + '</p><div class="ops one">' +
          q.opts.map(function (o, k) { var c = ''; if (Q.picked !== null) { if (o === q.a) c = ' right'; else if (k === Q.picked) c = ' wrong'; }
            return '<label class="' + (q.ta ? 'ta' : '') + c + '"><input type="radio" name="vq" value="' + k + '"' + (Q.picked !== null ? ' disabled' : '') + (Q.picked === k ? ' checked' : '') + '><span>' + esc(o) + '</span></label>'; }).join('') +
          '</div>' + (Q.picked !== null ? '<div class="row"><button class="btn pri" id="nx">Next →</button></div>' : '') + '</div>';
        Array.prototype.forEach.call(v.querySelectorAll('input[name=vq]'), function (b) { b.onchange = function () { Q.picked = +b.value; if (q.opts[Q.picked] === q.a) Q.score++; drawQuiz(); }; });
        if ($('nx')) { $('nx').onclick = function () { Q.i++; Q.picked = null; drawQuiz(); }; $('nx').focus(); }
      }
    }
    $('vm').onclick = function (e) { var b = e.target.closest('[data-m]'); if (!b) return; VS.mode = b.dataset.m; VS.quiz = null; VS.flip = false;
      Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle('on', c === b); }); render(); };
    $('vp').onclick = function (e) { var b = e.target.closest('[data-p]'); if (!b) return; VS.page = +b.dataset.p; VS.q = ''; $('vq').value = ''; VS.fi = 0; VS.quiz = null; VS.flip = false; pages(); render(); };
    $('vq').oninput = function () { VS.q = this.value; VS.fi = 0; VS.quiz = null; pages(); render(); };
    $('vv').onclick = function (e) {
      var s = e.target.closest('[data-say]'); if (s) { speak(s.dataset.say, 0.9); return; }
      var l = e.target.closest('[data-learn]'); if (l) { var L = learned(), n = l.dataset.learn; if (L[n]) delete L[n]; else L[n] = 1; learned(L); render(); }
    };
    pages(); render();
  }, failLoad);
}

/* ---------------- vocabulary test ---------------- */
function vtest(id) {
  var T = C.VOCAB_TESTS.filter(function (t) { return String(t.id) === String(id); })[0];
  if (!T) { location.hash = '#vocab'; return; }
  loading();
  load('assets/data/words.js').then(function () {
    app.innerHTML = '<main class="wrap"><div class="card" style="max-width:640px;margin:0 auto"><div class="eyebrow">Vocabulary test</div><h2>' + T.name + '</h2>' +
      '<p class="muted" style="margin-top:0">Book pages ' + T.pages[0] + '–' + T.pages[T.pages.length - 1] + '</p>' +
      '<p><b>Student:</b> ' + esc(ME.name) + (ME.regNo ? ' · ' + esc(ME.regNo) : '') + ' · ' + esc(ME.branch) + '</p>' +
      '<ul><li>50 questions · 2 marks each · <b>100 marks</b></li><li>Time: <b>' + C.VOCAB_TEST_MINUTES + ' minutes</b>. The test is submitted when time ends.</li><li>10 questions from each page. Every attempt is saved to your record.</li><li>Do not refresh or close the page during the test.</li></ul>' +
      '<div class="row" style="justify-content:flex-start"><a class="btn" href="#vocab">Back</a><button class="btn pri" id="go">Start the test</button></div></div></main>';
    $('go').onclick = function () { runVocabTest(T); };
  }, failLoad);
}
function first(s) { return s === 'Was / Were' ? s : s.split('/')[0].trim(); }
function irregular(o) { var v = first(o.f[0]).toLowerCase(), w = o.w.toLowerCase(); return !/ed$/.test(v) || v === w; }
function nforms(o) { var u = []; [o.w, first(o.f[0]), first(o.f[1]), o.f[2], o.f[3]].forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); }); return u.length; }
function segs(t) { return t.split('/').map(function (x) { return x.replace(/\(.*?\)/g, '').trim(); }); }
function differ(a, b) { if (a.w === b.w) return false; var X = segs(a.ta), Y = segs(b.ta); for (var i = 0; i < X.length; i++) if (Y.indexOf(X[i]) > -1) return false; return true; }
function pick3(o, pool) { var r = []; shuffle(pool).forEach(function (x) { if (r.length < 3 && differ(o, x) && r.every(function (y) { return differ(x, y); })) r.push(x); }); return r; }
function buildVocab(T) {
  var W = window.DMI_WORDS, pool = W.filter(function (o) { return T.pages.indexOf(o.p) > -1; }), Aq = [], Bq = [], Cq = [], Dq = [];
  T.pages.forEach(function (p) {
    var sh = shuffle(pool.filter(function (o) { return o.p === p; }));
    var c = sh.filter(function (o) { return irregular(o) && nforms(o) >= 4; }).slice(0, 3);
    if (c.length < 3) c = c.concat(sh.filter(function (o) { return c.indexOf(o) < 0 && nforms(o) >= 4; }).slice(0, 3 - c.length));
    var rest = sh.filter(function (o) { return c.indexOf(o) < 0; });
    rest.slice(0, 3).forEach(function (o) { Aq.push({ sec: 'A', w: o.w, t: 'What is the Tamil meaning of <b>' + esc(o.w) + '</b>?', a: o.ta, ta: true, opts: shuffle([o.ta].concat(pick3(o, pool).map(function (x) { return x.ta; }))) }); });
    rest.slice(3, 5).forEach(function (o) { Bq.push({ sec: 'B', w: o.w, t: 'Which English word means <b class="ta">' + esc(o.ta) + '</b>?', a: o.w, opts: shuffle([o.w].concat(pick3(o, pool).map(function (x) { return x.w; }))) }); });
    c.forEach(function (o) {
      var v2 = first(o.f[0]), v3 = first(o.f[1]), irr = irregular(o), k, a;
      if (irr) k = (v2 !== v3 && Math.random() < 0.5) ? 1 : 0; else k = Math.random() < 0.5 ? 0 : 3;
      a = k === 3 ? o.f[3] : (k === 1 ? v3 : v2);
      var opts = [a]; [v2, v3, o.f[3], o.f[2], o.w].forEach(function (x) { if (opts.length < 4 && opts.indexOf(x) < 0) opts.push(x); });
      Cq.push({ sec: 'C', w: o.w, t: 'Choose ' + (k === 0 ? 'the past tense (V2)' : k === 1 ? 'the past participle (V3)' : 'the -ing form') + ' of <b>' + esc(o.w) + '</b>.', a: a, opts: shuffle(opts) });
    });
    rest.slice(5, 7).forEach(function (o) {
      var bl = o.b.toLowerCase(), idx = 0;
      for (var fi = 3; fi >= 0; fi--) o.f[fi].split('/').forEach(function (x) { if (x.trim().toLowerCase() === bl) idx = fi + 1; });
      if (o.w.toLowerCase() === bl) idx = 0;
      var re = new RegExp('(^|[^A-Za-z-])' + o.b.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '(?![A-Za-z-])', 'i');
      var m = o.en.match(re), shown = m ? m[0].slice(m[1].length) : o.b, cap = shown.charAt(0) === shown.charAt(0).toUpperCase() && o.en.indexOf(shown) === 0;
      var cs = function (x) { x = x.toLowerCase(); return cap ? x.charAt(0).toUpperCase() + x.slice(1) : x; };
      var ds = pick3(o, pool).map(function (x) { return cs([x.w, first(x.f[0]), first(x.f[1]), x.f[2], x.f[3]][idx].split(' / ')[0]); });
      Dq.push({ sec: 'D', w: o.w, t: esc(o.en).replace(esc(shown), '<b>&nbsp;________&nbsp;</b>'), clue: o.tas, a: cs(shown), opts: shuffle([cs(shown)].concat(ds)) });
    });
  });
  return shuffle(Aq).concat(shuffle(Bq), shuffle(Cq), shuffle(Dq));
}
var VSECS = { A: ['Section A — Tamil meaning', 'Choose the correct Tamil meaning of the English word.'], B: ['Section B — English word', 'Choose the English word for the Tamil meaning.'],
  C: ['Section C — Verb forms', 'Choose the correct form of the verb.'], D: ['Section D — Complete the sentence', 'Choose the word that completes the sentence. The Tamil sentence helps you.'] };
function runVocabTest(T) {
  var qs = buildVocab(T), start = Date.now(), total = C.VOCAB_TEST_MINUTES * 60;
  EXAM = { done: false }; examOn(true);
  var h = '<div class="stick"><div class="in"><span class="grow">' + esc(T.name) + ' · ' + esc(ME.name) + '</span><span id="cnt">0 / 50 answered</span><span class="timer" id="tm" role="timer" aria-label="Time left">' + C.VOCAB_TEST_MINUTES + ':00</span></div></div><main class="wrap">', last = '';
  qs.forEach(function (q, i) {
    if (q.sec !== last) { last = q.sec; h += '<div class="sec">' + VSECS[q.sec][0] + '<small>' + VSECS[q.sec][1] + ' (2 marks each)</small></div>'; }
    h += qBlock(i, (i + 1) + '. ' + q.t, q.opts, q.ta, q.clue);
  });
  h += '<button class="btn pri" id="sub" style="width:100%;font-size:17px;margin-top:8px">Submit the test</button></main>';
  app.innerHTML = h; window.scrollTo(0, 0);
  var ans = {}; app.onchange = function (e) { var r = e.target; if (r.type !== 'radio') return; ans[+r.name.slice(1)] = +r.value; $('q' + r.name.slice(1)).classList.remove('miss'); $('cnt').textContent = Object.keys(ans).length + ' / 50 answered'; };
  EXAM.timer = setInterval(function () {
    var left = Math.max(0, total - Math.floor((Date.now() - start) / 1000)); $('tm').textContent = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
    $('tm').classList.toggle('low', left <= 300); if (left <= 0) finish(true);
  }, 500);
  $('sub').onclick = function () { confirmSubmit(qs.length, ans, function () { finish(false); }); };
  function finish(auto) {
    if (EXAM.done) return; EXAM.done = true; clearInterval(EXAM.timer); app.onchange = null; examOn(false);
    var sec = { A: [0, 0], B: [0, 0], C: [0, 0], D: [0, 0] }, wrong = [];
    qs.forEach(function (q, i) { sec[q.sec][1] += 2; if (ans[i] !== undefined && q.opts[ans[i]] === q.a) sec[q.sec][0] += 2; else wrong.push(q.w); });
    var score = sec.A[0] + sec.B[0] + sec.C[0] + sec.D[0], mins = Math.round((Date.now() - start) / 6000) / 10;
    app.innerHTML = '<main class="wrap"><div class="card" style="max-width:600px;margin:0 auto;border:2px solid var(--ink)"><div style="display:flex;gap:12px;align-items:center;border-bottom:2px solid var(--ink);padding-bottom:10px"><img src="assets/dmi-logo.png" alt="" style="height:52px"><div><b>DMI Computer Education</b><br><span class="muted">Diploma in English · ' + esc(T.name) + '</span></div></div>' +
      '<p>' + esc(ME.name) + (ME.regNo ? ' · ' + esc(ME.regNo) : '') + ' · ' + esc(ME.branch) + ' · ' + fdt(new Date()) + '</p>' +
      '<div class="score">' + score + '<small> / 100</small></div><p style="text-align:center;font-weight:800;margin:6px 0 12px">' + grade(score) + '</p>' +
      '<div class="tbl"><table class="t"><tbody>' + ['A', 'B', 'C', 'D'].map(function (k) { return '<tr><td>' + VSECS[k][0].replace('Section ' + k + ' — ', '') + '</td><td style="text-align:right">' + sec[k][0] + ' / ' + sec[k][1] + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      (wrong.length ? '<p><b>Study these words again:</b> ' + wrong.map(esc).join(', ') + '</p>' : '<p><b>Perfect score!</b></p>') +
      (auto ? '<p class="muted">Time ended — submitted automatically.</p>' : '') + '<div id="st"></div>' +
      '<div class="row noprint" style="justify-content:flex-start"><button class="btn" onclick="print()">Print</button><a class="btn pri" href="#vocab">Back to vocabulary</a></div></div></main>';
    window.scrollTo(0, 0);
    saveResult({ skill: 'Vocabulary', level: 'Pages ' + T.pages[0] + '-' + T.pages[T.pages.length - 1], test: T.name, score: score, max: 100, minutes: mins,
      detail: 'A ' + sec.A[0] + '/30, B ' + sec.B[0] + '/20, C ' + sec.C[0] + '/30, D ' + sec.D[0] + '/20' + (auto ? ', auto-submitted' : '') + '. Wrong: ' + wrong.join(', ') }, $('st'));
  }
}
function qBlock(i, title, opts, ta, clue) {
  return '<fieldset class="qq" id="q' + i + '" style="margin-left:0;margin-right:0"><legend class="t" style="float:left;width:100%;padding:0">' + title + '</legend>' +
    (clue ? '<p class="ta muted" style="clear:both;margin:0 0 4px;font-size:14.5px">' + esc(clue) + '</p>' : '') +
    '<div class="ops" style="clear:both">' + opts.map(function (o, k) { return '<label' + (ta ? ' class="ta"' : '') + '><input type="radio" name="q' + i + '" value="' + k + '"><span>' + esc(o) + '</span></label>'; }).join('') + '</div></fieldset>';
}
function confirmSubmit(n, ans, go) {
  var miss = []; for (var i = 0; i < n; i++) { var m = ans[i] === undefined, el = $('q' + i); if (el) el.classList.toggle('miss', m); if (m) miss.push(i); }
  var d = document.createElement('div'); d.className = 'modal';
  d.innerHTML = '<div class="card" role="dialog" aria-modal="true" aria-labelledby="cft"><h3 id="cft">Submit your answers?</h3><p>' + (miss.length ? 'You have <b>' + miss.length + ' unanswered</b> question' + (miss.length > 1 ? 's' : '') + ' (marked in red). They get 0 marks.' : 'You have answered every question.') +
    ' You cannot change answers after submitting.</p><div class="row" style="justify-content:flex-start"><button class="btn" id="cfb">Go back</button><button class="btn pri" id="cfy">Yes, submit</button></div></div>';
  document.body.appendChild(d); $('cfb').focus();
  $('cfb').onclick = function () { d.remove(); if (miss.length) { var el = $('q' + miss[0]); if (el) el.scrollIntoView({ block: 'center' }); } };
  $('cfy').onclick = function () { d.remove(); go(); };
}

/* ---------------- listening ---------------- */
function listening(lv) {
  var L = curLevel(lv); loading();
  load('assets/data/listening-' + L.toLowerCase() + '.js').then(function () {
    var P = window.DMI_LISTENING[L];
    app.innerHTML = '<main class="wrap"><div class="eyebrow">Cambridge & City/Guilds style</div><h2>Listening</h2><p class="muted" style="margin-top:0">10 papers per level · 4 parts · 40 questions. The computer reads each part aloud — use Chrome for the best voice. Take any paper as many times as you like.</p>' +
      levelChips(L, 'listening') + '<div class="grid" style="margin-top:16px">' + P.map(function (p) {
        var name = L + ' Listening Paper ' + pad(p.n), b = best('Listening', name);
        return '<a class="tile' + (b !== null ? ' done' : '') + '" href="#lpaper/' + L + '/' + p.n + '"><span class="badge' + (b !== null ? ' ok' : ' grey') + '">' + (b !== null ? 'Best ' + b + '%' : 'Paper ' + pad(p.n)) + '</span><b>' + esc(p.title.replace(/^Paper \d+:\s*/, '')) + '</b><span>Paper ' + pad(p.n) + ' · 40 questions</span></a>';
      }).join('') + '</div></main>';
  }, failLoad);
}
function lpaper(lv, n) {
  var L = curLevel(lv); loading();
  load('assets/data/listening-' + L.toLowerCase() + '.js').then(function () {
    var P = window.DMI_LISTENING[L].filter(function (p) { return String(p.n) === String(n); })[0];
    if (!P) { location.hash = '#listening/' + L; return; }
    var name = L + ' Listening Paper ' + pad(P.n), qs = [], h = '', start = Date.now();
    P.sections.forEach(function (s, si) {
      h += '<div class="sec">Part ' + (si + 1) + ' — ' + esc(s.title) + '<small>Press Play and listen. Then answer questions ' + (qs.length + 1) + '–' + (qs.length + s.questions.length) + '.</small></div>' +
        '<div class="audio"><button class="btn pri sm" data-play="' + si + '">▶ Play part ' + (si + 1) + '</button><button class="btn sm" data-pause>⏸ Pause</button><button class="btn sm" data-stop>⏹ Stop</button>' +
        '<label style="margin:0;font-weight:600">Speed <select data-speed style="width:auto;padding:6px"><option value="0.75">Slow</option><option value="0.9" selected>Normal</option><option value="1.05">Fast</option></select></label><span class="muted" id="ps' + si + '" aria-live="polite"></span></div><div id="tr' + si + '"></div>';
      s.questions.forEach(function (q) {
        var order = shuffle(q.o.map(function (_, k) { return k; })), i = qs.length;
        qs.push({ q: q, order: order, sec: si });
        h += qBlock(i, (i + 1) + '. ' + esc(q.p), order.map(function (k) { return q.o[k]; }));
      });
    });
    EXAM = { done: false };
    app.innerHTML = '<div class="stick"><div class="in"><a href="#listening/' + L + '" style="color:#fff">← Papers</a><span class="grow">' + esc(name) + ' · ' + esc(P.title.replace(/^Paper \d+:\s*/, '')) + '</span><span id="cnt">0 / ' + qs.length + ' answered</span></div></div>' +
      '<main class="wrap" id="paper">' + h + '<div id="res"></div><button class="btn pri" id="sub" style="width:100%;font-size:17px;margin-top:8px">Submit answers</button></main>';
    var ans = {}, playing = null;
    app.onchange = function (e) { var r = e.target; if (r.type === 'radio') { ans[+r.name.slice(1)] = +r.value; $('q' + r.name.slice(1)).classList.remove('miss'); $('cnt').textContent = Object.keys(ans).length + ' / ' + qs.length + ' answered'; } };
    app.onclick = function (e) {
      var b = e.target.closest('[data-play],[data-pause],[data-stop]'); if (!b) return;
      var box = b.closest('.audio'), rate = +box.querySelector('[data-speed]').value;
      if (b.dataset.play !== undefined) {
        var si = +b.dataset.play, s = P.sections[si];
        Array.prototype.forEach.call(app.querySelectorAll('[id^=ps]'), function (x) { x.textContent = ''; });
        $('ps' + si).textContent = 'Playing…'; playing = si;
        speak(s.title + '. ' + s.transcript, rate, function () { if (playing === si) $('ps' + si).textContent = 'Finished. You can play it again.'; });
      } else if (b.dataset.pause !== undefined) {
        if (speechSynthesis.paused) { speechSynthesis.resume(); b.textContent = '⏸ Pause'; } else { speechSynthesis.pause(); b.textContent = '▶ Resume'; }
      } else { stopAudio(); if (playing !== null) $('ps' + playing).textContent = 'Stopped.'; playing = null; }
    };
    $('sub').onclick = function () {
      confirmSubmit(qs.length, ans, function () {
        EXAM.done = true; stopAudio(); var score = 0;
        qs.forEach(function (x, i) {
          var picked = ans[i], correctPos = x.order.indexOf(x.q.a), ok = picked === correctPos; if (ok) score++;
          var labels = $('q' + i).querySelectorAll('label');
          Array.prototype.forEach.call(labels, function (lb, k) { lb.querySelector('input').disabled = true; if (k === correctPos) lb.classList.add('right'); else if (k === picked) lb.classList.add('wrong'); });
          $('q' + i).insertAdjacentHTML('beforeend', '<div class="why">' + (ok ? '✓ Correct. ' : picked === undefined ? '— Not answered. ' : '✗ Wrong. ') + 'The recording says: <i>“' + esc(x.q.e) + '”</i></div>');
        });
        P.sections.forEach(function (s, si) { $('tr' + si).innerHTML = '<details class="card" style="margin:0 0 12px"><summary style="cursor:pointer;font-weight:700">Show the transcript for part ' + (si + 1) + '</summary><p style="line-height:1.7">' + esc(s.transcript) + '</p></details>'; });
        var pct = Math.round(score / qs.length * 100);
        $('sub').remove();
        var top = '<div class="card" style="border:2px solid var(--ink);margin-bottom:14px"><div class="eyebrow">' + esc(name) + '</div><div class="score">' + score + '<small> / ' + qs.length + '</small></div><p style="text-align:center;font-weight:800;margin:6px 0">' + pct + '% · ' + grade(pct) + '</p><div id="st"></div><div class="row"><a class="btn" href="#listening/' + L + '">All papers</a><button class="btn pri" id="again">Try this paper again</button></div><p class="muted" style="text-align:center;margin-bottom:0">Scroll down to see the answers and transcripts.</p></div>';
        $('paper').insertAdjacentHTML('afterbegin', top); window.scrollTo(0, 0);
        $('again').onclick = function () { lpaper(L, n); };
        saveResult({ skill: 'Listening', level: L, test: name, score: score, max: qs.length, minutes: Math.round((Date.now() - start) / 6000) / 10 }, $('st'));
      });
    };
  }, failLoad);
}

/* ---------------- reading ---------------- */
function reading(lv) {
  var L = curLevel(lv); loading();
  load('assets/data/reading.js').then(function () {
    var P = window.DMI_READING[L] || [];
    app.innerHTML = '<main class="wrap"><div class="eyebrow">Cambridge & City/Guilds style</div><h2>Reading</h2><p class="muted" style="margin-top:0">Signs, notices, emails and articles. Read carefully, then answer. Take a paper as many times as you like.</p>' +
      levelChips(L, 'reading') + '<div class="grid" style="margin-top:16px">' + P.map(function (p) {
        var name = L + ' Reading Paper ' + pad(p.n), b = best('Reading', name), nq = p.parts.reduce(function (a, x) { return a + x.questions.length; }, 0);
        return '<a class="tile' + (b !== null ? ' done' : '') + '" href="#rpaper/' + L + '/' + p.n + '"><span class="badge' + (b !== null ? ' ok' : ' grey') + '">' + (b !== null ? 'Best ' + b + '%' : 'Paper ' + pad(p.n)) + '</span><b>' + esc(p.title.replace(/^Reading Paper \d+:\s*/, '')) + '</b><span>' + nq + ' questions · ' + p.parts.length + ' parts</span></a>';
      }).join('') + '</div><p class="muted" style="margin-top:16px">More reading papers will be added here.</p></main>';
  }, failLoad);
}
function rpaper(lv, n) {
  var L = curLevel(lv); loading();
  load('assets/data/reading.js').then(function () {
    var P = (window.DMI_READING[L] || []).filter(function (p) { return String(p.n) === String(n); })[0];
    if (!P) { location.hash = '#reading/' + L; return; }
    var name = L + ' Reading Paper ' + pad(P.n), qs = [], h = '', start = Date.now();
    P.parts.forEach(function (x) {
      h += '<div class="sec">' + esc(x.title) + '<small>' + esc(x.instructions || 'Read and choose the correct answer.') + '</small></div>' + (x.text ? '<div class="passage">' + esc(x.text) + '</div>' : '');
      x.questions.forEach(function (q) { var order = shuffle(q.o.map(function (_, k) { return k; })), i = qs.length; qs.push({ q: q, order: order }); h += qBlock(i, (i + 1) + '. ' + esc(q.p), order.map(function (k) { return q.o[k]; })); });
    });
    EXAM = { done: false };
    app.innerHTML = '<div class="stick"><div class="in"><a href="#reading/' + L + '" style="color:#fff">← Papers</a><span class="grow">' + esc(name) + '</span><span id="cnt">0 / ' + qs.length + ' answered</span></div></div><main class="wrap" id="paper">' + h + '<button class="btn pri" id="sub" style="width:100%;font-size:17px;margin-top:8px">Submit answers</button></main>';
    var ans = {};
    app.onchange = function (e) { var r = e.target; if (r.type === 'radio') { ans[+r.name.slice(1)] = +r.value; $('q' + r.name.slice(1)).classList.remove('miss'); $('cnt').textContent = Object.keys(ans).length + ' / ' + qs.length + ' answered'; } };
    $('sub').onclick = function () {
      confirmSubmit(qs.length, ans, function () {
        EXAM.done = true; var score = 0;
        qs.forEach(function (x, i) {
          var picked = ans[i], cp = x.order.indexOf(x.q.a), ok = picked === cp; if (ok) score++;
          Array.prototype.forEach.call($('q' + i).querySelectorAll('label'), function (lb, k) { lb.querySelector('input').disabled = true; if (k === cp) lb.classList.add('right'); else if (k === picked) lb.classList.add('wrong'); });
          if (x.q.e) $('q' + i).insertAdjacentHTML('beforeend', '<div class="why">' + (ok ? '✓ ' : picked === undefined ? '— ' : '✗ ') + esc(x.q.e) + '</div>');
        });
        var pct = Math.round(score / qs.length * 100); $('sub').remove();
        $('paper').insertAdjacentHTML('afterbegin', '<div class="card" style="border:2px solid var(--ink);margin-bottom:14px"><div class="eyebrow">' + esc(name) + '</div><div class="score">' + score + '<small> / ' + qs.length + '</small></div><p style="text-align:center;font-weight:800;margin:6px 0">' + pct + '% · ' + grade(pct) + '</p><div id="st"></div><div class="row"><a class="btn" href="#reading/' + L + '">All papers</a><button class="btn pri" id="again">Try again</button></div></div>');
        window.scrollTo(0, 0); $('again').onclick = function () { rpaper(L, n); };
        saveResult({ skill: 'Reading', level: L, test: name, score: score, max: qs.length, minutes: Math.round((Date.now() - start) / 6000) / 10 }, $('st'));
      });
    };
  }, failLoad);
}

/* ---------------- writing ---------------- */
function writing(lv) {
  var L = curLevel(lv); loading();
  load('assets/data/writing.js').then(function () {
    var T = window.DMI_WRITING[L] || [];
    app.innerHTML = '<main class="wrap"><div class="eyebrow">Writing practice</div><h2>Writing</h2><p class="muted" style="margin-top:0">Choose a task, write your answer, and get it marked out of 100 by AI in seconds. Then see the corrections, an improved version and a model answer. Your teacher also sees your work.</p>' +
      levelChips(L, 'writing') + '<div class="grid" style="margin-top:16px">' + T.map(function (t) {
        var subs = DATA.writing.filter(function (w) { return w.taskId === t.id; }), best = bestAi(subs), marked = subs.filter(function (w) { return w.mark !== '' && w.mark != null; })[0];
        var badge = marked ? 'Teacher: ' + esc(marked.mark) : best != null ? 'Best AI mark ' + best + '/100' : subs.length ? subs.length + ' sent' : t.minWords + '–' + t.maxWords + ' words';
        return '<a class="tile' + (subs.length ? ' done' : '') + '" href="#wtask/' + L + '/' + t.id + '"><span class="badge' + (subs.length ? ' ok' : ' grey') + '">' + badge + '</span><span class="wtype">' + esc(t.type || '') + '</span><b>' + esc(t.title) + '</b><span>' + esc(t.prompt.slice(0, 95)) + (t.prompt.length > 95 ? '…' : '') + '</span></a>';
      }).join('') + '</div></main>';
  }, failLoad);
}
function bestAi(subs) { var b = null; subs.forEach(function (w) { var m = /^(\d+)\/100$/.exec(w.aiBand || ''); if (m && (b == null || +m[1] > b)) b = +m[1]; }); return b; }
function words(s) { return String(s || '').trim().match(/\S+/g) || []; }
/* word-level difference: red = remove, green = add */
function diffHtml(a, b) {
  var tk = function (t) { return String(t || '').replace(/\r/g, '').split(/[ \t]+|(?=\n)|(?<=\n)/).filter(function (w) { return w !== ''; }); };
  var x = tk(a), y = tk(b), n = x.length, m = y.length;
  if (!m || n * m > 250000) return esc(b);
  var norm = function (w) { return w.toLowerCase(); }, D = [], i, j;
  for (i = 0; i <= n; i++) { D.push(new Uint16Array(m + 1)); }
  for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) D[i][j] = x[i] === y[j] ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  var out = [], dl = [], ad = [];
  function flush() { if (dl.length) out.push('<del>' + esc(dl.join(' ').replace(/\n/g, ' ')) + '</del>'); if (ad.length) out.push('<ins>' + esc(ad.join(' ').replace(/\n/g, ' ')) + '</ins>'); dl = []; ad = []; }
  i = 0; j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { flush(); out.push(esc(x[i])); i++; j++; }
    else if (D[i + 1][j] >= D[i][j + 1]) dl.push(x[i++]); else ad.push(y[j++]);
  }
  while (i < n) dl.push(x[i++]); while (j < m) ad.push(y[j++]); flush();
  return out.join(' ').replace(/ ?\n ?/g, '<br>');
}
var WPARTS = [['task', 'Task & content'], ['organisation', 'Organisation'], ['grammar', 'Grammar'], ['vocabulary', 'Vocabulary'], ['spelling', 'Spelling & punctuation']];
function fbHtml(s, text, t, open) {
  var j; try { j = typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return ''; }
  if (!j) return '';
  if (j.note) return '<div class="msg warn">' + esc(j.note) + '</div>';
  if (!j.scores) { /* older feedback */
    var h0 = '<div class="card fb"><div class="eyebrow">AI feedback</div>' + (j.estimatedBand ? '<h3>' + esc(j.estimatedBand) + '</h3>' : '') + (j.taskAchievement ? '<p>' + esc(j.taskAchievement) + '</p>' : '');
    if (j.corrections && j.corrections.length) h0 += '<ul>' + j.corrections.map(function (x) { return '<li><s>' + esc(x.original) + '</s> → <b>' + esc(x.corrected) + '</b></li>'; }).join('') + '</ul>';
    return h0 + '</div>';
  }
  var tot = j.total, tone = tot >= 75 ? 'ok' : tot >= 50 ? 'mid' : 'low';
  var h = '<div class="wres"><div class="wscore ' + tone + '"><div><div class="eyebrow">AI mark</div><div class="big">' + tot + '<small>/100</small></div></div><div style="flex:1;min-width:200px">' +
    (j.levelReached ? '<span class="badge">Level shown: ' + esc(j.levelReached) + '</span> ' : '') + (j.words ? '<span class="badge grey">' + esc(j.words) + ' words</span>' : '') +
    '<p style="margin:8px 0 0">' + esc(j.summary || '') + '</p></div></div>';
  h += '<div class="wbars">' + WPARTS.map(function (p) { var v = (j.scores || {})[p[0]] || 0; return '<div class="wbar"><span>' + p[1] + '</span><div class="track"><i style="width:' + (v * 5) + '%"></i></div><b>' + v + '/20</b></div>'; }).join('') + '</div>';
  if (j.points && j.points.length) h += '<h4>Did you include everything?</h4><ul class="wpts">' + j.points.map(function (x) { return '<li class="' + (x.covered ? 'y' : 'n') + '">' + (x.covered ? '✓ ' : '✗ ') + esc(x.point) + '</li>'; }).join('') + '</ul>';
  if (j.strengths && j.strengths.length) h += '<h4>What you did well</h4><ul>' + j.strengths.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  if (j.corrections && j.corrections.length) h += '<h4>Corrections (' + j.corrections.length + ')</h4><ol class="wcorr">' + j.corrections.map(function (x) {
    return '<li><div><del>' + esc(x.original) + '</del> → <ins>' + esc(x.corrected) + '</ins>' + (x.type ? ' <span class="wtag">' + esc(x.type) + '</span>' : '') + '</div>' + (x.explain ? '<div class="muted">' + esc(x.explain) + '</div>' : '') + '</li>'; }).join('') + '</ol>';
  else h += '<div class="msg ok">No mistakes found. Excellent!</div>';
  if (j.correctedText) h += '<details class="card"' + (open ? ' open' : '') + '><summary>Your writing, corrected <span class="muted">(<del>red</del> = remove, <ins>green</ins> = add)</span></summary><div class="passage wdiff">' + (text ? diffHtml(text, j.correctedText) : esc(j.correctedText)) + '</div></details>';
  if (j.improvedVersion) h += '<details class="card"><summary>Improved version of your answer</summary><div class="passage" style="white-space:pre-line">' + esc(j.improvedVersion) + '</div></details>';
  if (t && t.modelAnswer) h += '<details class="card"><summary>Model answer</summary><div class="passage" style="white-space:pre-line">' + esc(t.modelAnswer) + '</div><p class="muted" style="margin:6px 0 0">' + (t.modelWords || '') + ' words</p></details>';
  if (j.nextSteps && j.nextSteps.length) h += '<h4>Practise next</h4><ul>' + j.nextSteps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  return h + '<p class="muted" style="font-size:13px">AI marks are a practice guide. Your teacher gives the final mark.</p></div>';
}
function wtask(lv, id) {
  var L = curLevel(lv); loading();
  load('assets/data/writing.js').then(function () {
    var t = (window.DMI_WRITING[L] || []).filter(function (x) { return x.id === id; })[0];
    if (!t) { location.hash = '#writing/' + L; return; }
    var dk = 'dmi_de_draft_' + t.id, subs = DATA.writing.filter(function (w) { return w.taskId === t.id; }).sort(function (a, b) { return new Date(b.time) - new Date(a.time); });
    var li = function (a) { return (a || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); };
    app.innerHTML = '<main class="wrap"><a href="#writing/' + L + '" class="muted">← All ' + L + ' tasks</a><div class="eyebrow" style="margin-top:8px">' + L + ' writing · ' + esc(t.type || '') + '</div><h2>' + esc(t.title) + '</h2>' +
      '<div class="split"><section><div class="card" style="border-left:6px solid var(--y)"><p style="font-size:17px;margin-top:0"><b>' + esc(t.prompt) + '</b></p>' +
      (t.points && t.points.length ? '<p style="margin:0 0 4px">In your answer, include:</p><ul style="margin:0 0 8px">' + li(t.points) + '</ul>' : '') +
      '<p class="muted" style="margin:0">Write <b>' + t.minWords + '–' + t.maxWords + ' words</b>.</p></div>' +
      (t.plan && t.plan.length ? '<details class="card"><summary>Plan your answer</summary><ol style="margin:8px 0 0">' + li(t.plan) + '</ol></details>' : '') +
      (t.phrases && t.phrases.length ? '<details class="card"><summary>Useful phrases</summary><ul style="margin:8px 0 0">' + li(t.phrases) + '</ul></details>' : '') +
      (t.tips && t.tips.length ? '<details class="card"><summary>Tips</summary><ul style="margin:8px 0 0">' + li(t.tips) + '</ul></details>' : '') +
      '<label for="wt" style="margin-top:12px">Your answer</label><textarea id="wt" spellcheck="false" rows="12"></textarea><div class="bar" style="justify-content:space-between"><span id="wc" class="muted" style="font-weight:700"></span><span class="muted" style="font-size:13px">Your draft is saved on this device.</span></div>' +
      '<div class="err" id="we" role="alert"></div><div class="row" style="justify-content:flex-start"><button class="btn pri" id="wai">Check with AI & send to teacher</button><button class="btn" id="wsend">Send to teacher only</button></div></section>' +
      '<section><div id="wfb"></div><h3>Your earlier answers</h3><div id="wold">' + (subs.length ? subs.map(function (w) {
        return '<details class="card" style="margin-bottom:10px"><summary><b>' + fdt(w.time) + '</b> · ' + esc(w.words) + ' words' + (w.aiBand ? ' · AI ' + esc(w.aiBand) : '') + (w.mark !== '' && w.mark != null ? ' · <span class="badge ok">Teacher: ' + esc(w.mark) + '</span>' : ' · <span class="badge grey">Waiting for teacher</span>') + '</summary>' +
          (w.comment ? '<div class="msg ok">Teacher: ' + esc(w.comment) + '</div>' : '') + (w.text ? '<div class="passage" style="white-space:pre-line">' + esc(w.text) + '</div>' : '') + fbHtml(w.aiFeedback, w.text, t) + '</details>';
      }).join('') : '<p class="muted">Nothing sent yet. Write your answer, then check it with AI.</p>') + '</div></section></div></main>';
    var ta = $('wt'); ta.value = ls(dk) || '';
    function count() { var n = words(ta.value).length; $('wc').textContent = n + ' words (target ' + t.minWords + '–' + t.maxWords + ')'; $('wc').style.color = n >= t.minWords && n <= t.maxWords ? 'var(--ok)' : ''; ls(dk, ta.value); return n; }
    ta.oninput = count; count();
    function send(ai) {
      var n = count(); if (n < Math.min(10, t.minWords)) { $('we').textContent = 'Please write at least ' + Math.min(10, t.minWords) + ' words.'; return; }
      var text = ta.value;
      $('we').textContent = ''; $('wai').disabled = $('wsend').disabled = true; $('wfb').innerHTML = '<div class="msg warn">' + (ai ? 'Checking your writing… this can take up to 30 seconds.' : 'Sending…') + '</div>';
      A.call('submitWriting', { level: L, taskId: t.id, task: t.title, type: t.type, prompt: t.prompt, points: t.points, minWords: t.minWords, maxWords: t.maxWords, text: text, wantAI: ai }).then(function (r) {
        $('wai').disabled = $('wsend').disabled = false;
        if (authFail(r)) return;
        if (!r.ok) { $('wfb').innerHTML = '<div class="msg bad">' + esc(r.error) + '</div>'; return; }
        $('wfb').innerHTML = '<div class="msg ok">✓ Sent to your teacher.</div>' + (ai ? fbHtml(r.aiFeedback, text, t, true) : (t.modelAnswer ? '<details class="card" open><summary>Model answer</summary><div class="passage" style="white-space:pre-line">' + esc(t.modelAnswer) + '</div></details>' : '')) +
          '<p><button class="btn" id="wagain">Improve it and try again</button></p>';
        $('wagain').onclick = function () { ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
        $('wfb').scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (/Nothing sent yet/.test($('wold').textContent)) $('wold').innerHTML = '<p class="muted">Your answers appear here next time you open this task.</p>';
        DATA.writing.push({ time: new Date().toISOString(), level: L, taskId: t.id, task: t.title, words: n, text: text, aiBand: r.aiBand, aiFeedback: r.aiFeedback, mark: '', comment: '' });
      });
    }
    $('wai').onclick = function () { send(true); }; $('wsend').onclick = function () { send(false); };
  }, failLoad);
}

/* ---------------- speaking ---------------- */
function speaking() {
  loading();
  load('assets/data/speaking.js').then(function () {
    var U = window.DMI_SPEAKING;
    app.innerHTML = '<main class="wrap"><div class="eyebrow">Spoken English · units 41–80</div><h2>Speaking</h2><p class="muted" style="margin-top:0">Listen to the questions, record your answer, and play it back to check yourself. Recordings stay on your phone or computer.</p>' +
      '<div class="msg warn">🤖 The AI speaking tutor is coming soon to this hub.</div><div class="grid" style="margin-top:12px">' + U.map(function (u) {
        var dn = best('Speaking', 'Speaking Unit ' + u.unitNumber) !== null;
        return '<a class="tile' + (dn ? ' done' : '') + '" href="#sunit/' + u.unitNumber + '"><span class="badge ' + (dn ? 'ok' : 'grey') + '">' + (dn ? '✓ ' : '') + 'Unit ' + u.unitNumber + '</span><b>' + esc(u.title) + '</b><span>' + esc(u.level) + '</span></a>';
      }).join('') + '</div></main>';
  }, failLoad);
}
var REC = null;
function sunit(n) {
  loading();
  load('assets/data/speaking.js').then(function () {
    var u = window.DMI_SPEAKING.filter(function (x) { return String(x.unitNumber) === String(n); })[0];
    if (!u) { location.hash = '#speaking'; return; }
    var lines = String(u.dialoguePreview || '').split(/\s\/\s/);
    app.innerHTML = '<main class="wrap"><a href="#speaking" class="muted">← All units</a><div class="eyebrow" style="margin-top:8px">Unit ' + u.unitNumber + ' · ' + esc(u.level) + '</div><h2>' + esc(u.title) + '</h2><p>' + esc(u.focus) + '</p>' +
      '<div class="split"><section><h3>Model dialogue</h3><div class="passage" style="white-space:normal">' + lines.map(function (l) { return '<p style="margin:0 0 8px">' + esc(l) + '</p>'; }).join('') + '</div><button class="btn sm" id="sd">🔊 Listen to the dialogue</button>' +
      '<h3 style="margin-top:20px">Key words</h3><div class="chips">' + (u.keyVocabulary || []).map(function (k) { return '<button class="chip" data-say="' + esc(k) + '">🔊 ' + esc(k) + '</button>'; }).join('') + '</div></section>' +
      '<section><h3>Answer the questions</h3><p class="muted" style="margin-top:0">Listen, then press Record and answer in 2–3 full sentences.</p>' + (u.suggestedQuestions || []).map(function (q, i) {
        return '<div class="qq"><p class="t">' + (i + 1) + '. ' + esc(q) + '</p><div class="row" style="justify-content:flex-start;margin-top:6px"><button class="btn sm" data-say="' + esc(q) + '">🔊 Listen</button><button class="btn sm pri" data-rec="' + i + '">🎙 Record answer</button></div><div id="pb' + i + '"></div></div>';
      }).join('') + '<div id="micErr" class="err" role="alert"></div>' +
      '<div class="card" style="margin-top:12px;border:2px solid var(--ink)"><b>Finished this unit?</b><p class="muted" style="margin:4px 0 10px">Record your answers, listen to yourself, then mark the unit as practised. Your teacher can see it.</p><button class="btn pri" id="sdone" disabled>✓ Mark unit ' + u.unitNumber + ' as practised</button> <span id="sst" class="muted"></span></div></section></div></main>';
    var recorded = {}, uname = 'Speaking Unit ' + u.unitNumber, prevDone = best('Speaking', uname);
    if (prevDone !== null) $('sst').textContent = '✓ Already practised before — you can do it again.';
    $('sdone').onclick = function () {
      var n = Object.keys(recorded).length, q = (u.suggestedQuestions || []).length || 1; this.disabled = true;
      saveResult({ skill: 'Speaking', level: u.level, test: uname, score: Math.min(n, q), max: q, detail: n + ' of ' + q + ' questions recorded' }, null).then(function () { $('sst').textContent = '✓ Saved. Well done!'; });
    };
    $('sd').onclick = function () { speak(lines.join('. '), 0.9); };
    app.onclick = function (e) {
      var s = e.target.closest('[data-say]'); if (s) { speak(s.dataset.say, 0.85); return; }
      var r = e.target.closest('[data-rec]'); if (!r) return;
      if (REC && REC.btn === r) { REC.mr.stop(); return; }
      if (REC) { REC.mr.stop(); }
      if (!navigator.mediaDevices || !window.MediaRecorder) { $('micErr').textContent = 'Recording is not supported in this browser. Please use Chrome.'; return; }
      stopAudio();
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var mr = new MediaRecorder(stream), chunks = [], i = r.dataset.rec;
        REC = { mr: mr, btn: r }; r.textContent = '⏹ Stop recording'; r.classList.remove('pri'); r.classList.add('red');
        mr.ondataavailable = function (ev) { if (ev.data.size) chunks.push(ev.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); }); REC = null;
          r.textContent = '🎙 Record again'; r.classList.add('pri'); r.classList.remove('red');
          var url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
          $('pb' + i).innerHTML = '<audio controls src="' + url + '" style="width:100%;margin-top:8px"></audio>';
          recorded[i] = 1; if ($('sdone')) $('sdone').disabled = false;
        };
        mr.start();
      }).catch(function () { $('micErr').textContent = 'Microphone permission was not given. Allow the microphone in your browser settings and try again.'; });
    };
  }, failLoad);
}

/* ---------------- results & account ---------------- */
function results(x, y, fresh) {
  if (FIRST) { FIRST = false; fresh = true; }
  if (!fresh) refresh().then(function (r) { if (r && r.ok && location.hash === '#results') results(null, null, true); });
  var list = DATA.results.slice().sort(function (a, b) { return new Date(b.time) - new Date(a.time); });
  var skills = ['All', 'Vocabulary', 'Listening', 'Reading', 'Speaking'];
  app.innerHTML = '<main class="wrap"><h2>My results</h2><div class="chips" id="rf">' + skills.map(function (s, i) { return '<button class="chip' + (i ? '' : ' on') + '" data-s="' + s + '">' + s + '</button>'; }).join('') + '</div><div id="rt" style="margin-top:12px"></div>' +
    '<h3 style="margin-top:26px">Writing</h3>' + (DATA.writing.length ? '<div class="tbl"><table class="t"><thead><tr><th>Date</th><th>Task</th><th>Words</th><th>AI band</th><th>Teacher mark</th><th>Teacher comment</th></tr></thead><tbody>' +
      DATA.writing.slice().sort(function (a, b) { return new Date(b.time) - new Date(a.time); }).map(function (w) { return '<tr><td>' + fdt(w.time) + '</td><td>' + esc(w.level) + ' · ' + esc(w.task) + '</td><td>' + esc(w.words) + '</td><td>' + esc(w.aiBand || '—') + '</td><td>' + (w.mark !== '' && w.mark != null ? '<b>' + esc(w.mark) + '</b>' : '<span class="muted">waiting</span>') + '</td><td>' + esc(w.comment || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="muted">No writing sent yet.</p>') + '</main>';
  function draw(s) { var l = s === 'All' ? list : list.filter(function (r) { return r.skill === s; }); $('rt').innerHTML = l.length ? resultsTable(l) : '<p class="muted">No marks yet.</p>'; }
  $('rf').onclick = function (e) { var b = e.target.closest('[data-s]'); if (!b) return; Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle('on', c === b); }); draw(b.dataset.s); };
  draw('All');
}
function account() {
  app.innerHTML = '<main class="wrap"><h2>My account</h2><div class="split"><div class="card"><table class="t"><tbody>' +
    [['Name', ME.name], ['Mobile', ME.mobile], ['Email', ME.email || '—'], ['Registration no.', ME.regNo || '—'], ['Branch', ME.branch], ['Course', ME.course], ['Batch', ME.batch || '—'], ['Class time', ME.schedule || '—'], ['Teacher', ME.teacher || '—'], ['Access until', fdate(ME.expiry)]]
      .map(function (r) { return '<tr><th style="position:static">' + r[0] + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') +
    '</tbody></table><p class="muted" style="font-size:13.5px">To change these details or renew access, contact your DMI branch.</p><button class="btn red" id="out">Sign out</button></div>' +
    '<form class="card" id="pw" novalidate><h3>Change password</h3><label for="op">Current password</label><input type="password" id="op" autocomplete="current-password"><label for="np">New password</label><input type="password" id="np" autocomplete="new-password"><label for="np2">Type it again</label><input type="password" id="np2" autocomplete="new-password"><div class="err" id="pe" role="alert"></div><button class="btn pri" id="pb">Change password</button></form></div></main>';
  $('out').onclick = function () { A.call('logout').then(function () { A.clear(); location.replace('index.html'); }); };
  $('pw').onsubmit = function (e) {
    e.preventDefault(); var n = $('np').value;
    if (n.length < 6) { $('pe').textContent = 'New password needs at least 6 characters.'; return; }
    if (n !== $('np2').value) { $('pe').textContent = 'The new passwords are not the same.'; return; }
    $('pb').disabled = true;
    A.call('changePassword', { oldPassword: $('op').value, newPassword: n }).then(function (r) {
      $('pb').disabled = false; if (authFail(r)) return;
      if (!r.ok) { $('pe').textContent = r.error; return; }
      $('pw').reset(); $('pe').textContent = ''; $('pw').insertAdjacentHTML('beforeend', '<div class="msg ok">✓ Password changed.</div>');
    });
  };
}

/* ---------------- start ---------------- */
A.call('me').then(function (r) {
  if (authFail(r)) return;
  if (r.ok) { ME = r.user; A.setUser(ME); header(); }
  else if (!r.ok && !DATA.loaded) { /* offline: continue with cached profile */ }
  return refresh();
}).then(function () { FIRST = true; route(); FIRST = false; }, route);
})();
