(function () {
'use strict';
var C = window.DMI_CONFIG, app = document.getElementById('app'), $ = function (i) { return document.getElementById(i); };
var TK = 'dmi_de_admin', ME = null, D = { students: [], results: [], writing: [], batches: [], staff: [] };
var SKILLS = ['Vocabulary', 'Listening', 'Reading', 'Writing', 'Speaking'];
var VT = (C.VOCAB_TESTS || []).map(function (t) { return t.name; });
var WEEK = 7 * 864e5;

/* ---------- helpers ---------- */
function tok() { try { return sessionStorage.getItem(TK) || ''; } catch (e) { return ''; } }
function call(a, d) {
  if (!C.API_URL) return Promise.resolve({ ok: false, error: 'API_URL is not set in assets/config.js.' });
  return fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, d || {}, { action: a, token: tok() })) })
    .then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: 'No connection.' }; })
    .then(function (r) { if (r.code === 'AUTH') { try { sessionStorage.removeItem(TK); } catch (e) {} login(r.error); } return r; });
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fd(d) { if (!d) return ''; var x = new Date(d); return isNaN(x) ? esc(d) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fdt(d) { var x = new Date(d); return isNaN(x) ? '' : fd(x) + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes()); }
function ago(d) { if (!d) return '—'; var x = new Date(d); if (isNaN(x)) return '—'; var days = Math.floor((Date.now() - x) / 864e5); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'; }
function badge(s) { return '<span class="badge ' + ({ Active: 'ok', Pending: 'warn', Expired: 'grey', Rejected: 'bad', Blocked: 'bad', Admin: 'grey', Teacher: 'ok', Off: 'bad' }[s] || 'grey') + '">' + esc(s) + '</span>'; }
function toast(m, bad) { var d = document.createElement('div'); d.className = 'msg ' + (bad ? 'bad' : 'ok'); d.setAttribute('role', 'status'); d.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:40;box-shadow:0 6px 20px rgba(0,0,0,.2)'; d.textContent = m; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500); }
function modal(html) { var d = document.createElement('div'); d.className = 'modal'; d.innerHTML = '<div class="card" role="dialog" aria-modal="true">' + html + '</div>'; document.body.appendChild(d); var f = d.querySelector('button,input,select'); if (f) f.focus(); return d; }
function isAdmin() { return ME && ME.role === 'Admin'; }
function pctBar(p) { if (p == null) return '<span class="muted">—</span>'; return '<span class="pct">' + p + '%</span><div class="bar2 ' + (p >= 60 ? '' : p >= 30 ? 'mid' : 'low') + '" aria-hidden="true"><i style="width:' + Math.min(100, p) + '%"></i></div>'; }
function batchById(id) { return D.batches.filter(function (b) { return b.ID === id; })[0]; }
function staffByEmail(e) { return D.staff.filter(function (s) { return s.email === String(e || '').toLowerCase(); })[0]; }
function teacherName(b) { var s = b && staffByEmail(b.TeacherEmail); return s ? s.name : (b && b.TeacherEmail) || '—'; }
function batchOptions(sel, withNone) {
  return (withNone ? '<option value="">' + withNone + '</option>' : '') + D.batches.filter(function (b) { return b.Active !== 'No' || b.ID === sel; })
    .map(function (b) { return '<option value="' + esc(b.ID) + '"' + (b.ID === sel ? ' selected' : '') + '>' + esc(b.Name) + (b.Branch ? ' · ' + esc(b.Branch) : '') + (b.Schedule ? ' · ' + esc(b.Schedule) : '') + '</option>'; }).join('');
}
function activeStudents(filterFn) { return D.students.filter(function (s) { return s.State === 'Active' && (!filterFn || filterFn(s)); }); }

/* ---------- statistics ---------- */
function stats(students) {
  var ids = {}; students.forEach(function (s) { ids[s.ID] = 1; });
  var n = students.length, since = Date.now() - WEEK, out = { n: n };
  ['Vocabulary', 'Listening', 'Reading', 'Speaking'].forEach(function (k) {
    var ever = {}, week = {}, sum = 0, cnt = 0;
    D.results.forEach(function (r) { if (!ids[r.StudentID] || r.Skill !== k) return; ever[r.StudentID] = 1; if (new Date(r.Time) >= since) week[r.StudentID] = 1; sum += Number(r.Percent) || 0; cnt++; });
    out[k] = { ever: n ? Math.round(Object.keys(ever).length / n * 100) : null, week: n ? Math.round(Object.keys(week).length / n * 100) : null, avg: (cnt && k !== 'Speaking') ? Math.round(sum / cnt) : null, attempts: cnt };
  });
  var we = {}, ww = {}, toMark = 0, wc = 0;
  D.writing.forEach(function (w) { if (!ids[w.StudentID]) return; wc++; we[w.StudentID] = 1; if (new Date(w.Time) >= since) ww[w.StudentID] = 1; if (w.TeacherMark === '' || w.TeacherMark == null) toMark++; });
  out.Writing = { ever: n ? Math.round(Object.keys(we).length / n * 100) : null, week: n ? Math.round(Object.keys(ww).length / n * 100) : null, avg: null, attempts: wc, toMark: toMark };
  var anyWeek = {}; D.results.forEach(function (r) { if (ids[r.StudentID] && new Date(r.Time) >= since) anyWeek[r.StudentID] = 1; });
  Object.keys(ww).forEach(function (k) { anyWeek[k] = 1; });
  out.activeWeek = n ? Math.round(Object.keys(anyWeek).length / n * 100) : null;
  out.vocab = VT.map(function (t) { var d = {}, best = {}; D.results.forEach(function (r) { if (ids[r.StudentID] && r.Test === t) { d[r.StudentID] = 1; best[r.StudentID] = Math.max(best[r.StudentID] || 0, Number(r.Percent) || 0); } });
    var b = Object.keys(best).map(function (k) { return best[k]; });
    return { done: n ? Math.round(Object.keys(d).length / n * 100) : null, avgBest: b.length ? Math.round(b.reduce(function (a, x) { return a + x; }, 0) / b.length) : null }; });
  return out;
}
function studentSum(id) {
  var R = D.results.filter(function (r) { return r.StudentID === id; }).sort(function (a, b) { return new Date(b.Time) - new Date(a.Time); });
  var W = D.writing.filter(function (w) { return w.StudentID === id; }).sort(function (a, b) { return new Date(b.Time) - new Date(a.Time); });
  var s = { R: R, W: W, last: null };
  ['Vocabulary', 'Listening', 'Reading', 'Speaking'].forEach(function (k) {
    var rs = R.filter(function (r) { return r.Skill === k; }), best = {};
    rs.forEach(function (r) { best[r.Test] = Math.max(best[r.Test] || 0, Number(r.Percent) || 0); });
    var b = Object.keys(best).map(function (t) { return best[t]; });
    s[k] = { attempts: rs.length, tests: b.length, avgBest: b.length ? Math.round(b.reduce(function (a, x) { return a + x; }, 0) / b.length) : null, best: best };
  });
  s.Writing = { sent: W.length, marked: W.filter(function (w) { return w.TeacherMark !== '' && w.TeacherMark != null; }).length };
  if (R[0]) s.last = R[0].Time; if (W[0] && (!s.last || new Date(W[0].Time) > new Date(s.last))) s.last = W[0].Time;
  return s;
}

/* ---------- auth & shell ---------- */
function login(msg) {
  ME = null; $('nav').hidden = true; $('who').innerHTML = '';
  app.innerHTML = '<main class="wrap"><form class="card" id="lf" style="max-width:420px;margin:30px auto;border:2px solid var(--ink)" novalidate><h2>Staff sign-in</h2><p class="muted" style="margin-top:0">For DMI admins and teachers.</p><label for="le">Email</label><input type="email" id="le" autocomplete="username"><label for="lp">Password</label><input type="password" id="lp" autocomplete="current-password"><div class="err" id="lerr" role="alert">' + esc(msg || '') + '</div><button class="btn pri" style="width:100%" id="lb">Sign in</button></form></main>';
  $('lf').onsubmit = function (e) {
    e.preventDefault(); $('lb').disabled = true;
    call('adminLogin', { email: $('le').value, password: $('lp').value }).then(function (r) {
      $('lb').disabled = false; if (!r.ok) { $('lerr').textContent = r.error; return; }
      try { sessionStorage.setItem(TK, r.token); } catch (e) {} ME = r.user; start();
    });
  };
}
function start() {
  $('ptitle').textContent = isAdmin() ? 'Admin panel' : 'Teacher panel';
  $('who').innerHTML = '<b>' + esc(ME.name || ME.email) + '</b><span>' + esc(ME.role) + ' · <a href="#" id="pwl" style="color:#ffe600">Password</a> · <a href="#" id="lo" style="color:#ffe600">Sign out</a></span>';
  $('lo').onclick = function (e) { e.preventDefault(); call('logout').then(function () { try { sessionStorage.removeItem(TK); } catch (e) {} login(); }); };
  $('pwl').onclick = function (e) { e.preventDefault(); changePw(); };
  var items = isAdmin() ? [['dash', 'Dashboard'], ['apps', 'Applications <span id="pc"></span>'], ['students', 'Students'], ['batches', 'Batches'], ['results', 'Results'], ['writing', 'Writing <span id="wcnt"></span>'], ['staff', 'Staff']]
                        : [['dash', 'My batches'], ['students', 'My students'], ['writing', 'Writing <span id="wcnt"></span>']];
  $('navin').innerHTML = items.map(function (i) { return '<a href="#' + i[0] + '" data-r="' + i[0] + '">' + i[1] + '</a>'; }).join('');
  $('nav').hidden = false; loadAll().then(route);
}
function loadAll() {
  app.innerHTML = '<div class="loading">Loading…</div>';
  return call('staffData').then(function (r) {
    if (!r.ok) { if (r.code !== 'AUTH') app.innerHTML = '<main class="wrap"><div class="msg bad">' + esc(r.error) + '</div></main>'; return; }
    D = r; ME = r.user;
    var p = D.students.filter(function (s) { return s.Status === 'Pending'; }).length, w = D.writing.filter(function (x) { return x.TeacherMark === '' || x.TeacherMark == null; }).length;
    if ($('pc')) $('pc').innerHTML = p ? '<span class="count">' + p + '</span>' : '';
    if ($('wcnt')) $('wcnt').innerHTML = w ? '<span class="count">' + w + '</span>' : '';
  });
}
function route() {
  if (!ME) return;
  app.onclick = null; app.onchange = null;
  var p = decodeURIComponent(location.hash.slice(1) || 'dash').split('/'), r = p[0];
  Array.prototype.forEach.call(document.querySelectorAll('#navin a'), function (a) { a.classList.toggle('on', a.dataset.r === r || (r === 'batch' && a.dataset.r === 'dash') || (r === 'student' && a.dataset.r === 'students')); });
  var V = { dash: dash, batch: batchView, student: studentView, apps: apps, students: students, batches: batches, results: results, writing: writing, staff: staffView }[r] || dash;
  if (!isAdmin() && ['apps', 'batches', 'staff', 'results'].indexOf(r) >= 0) V = dash;
  window.scrollTo(0, 0); V(p[1]);
}
window.addEventListener('hashchange', route);
function act(a, d, okMsg) {
  return call(a, d).then(function (r) { if (!r.ok) { toast(r.error || 'Failed', true); return r; } if (okMsg) toast(okMsg); return loadAll().then(function () { route(); return r; }); });
}
function changePw() {
  var m = modal('<h3>Change my password</h3><label for="cp0">Current password</label><input type="password" id="cp0" autocomplete="current-password"><label for="cp1">New password (8+ characters)</label><input type="password" id="cp1" autocomplete="new-password"><label for="cp2">Type it again</label><input type="password" id="cp2" autocomplete="new-password"><div class="err" id="cpe" role="alert"></div><div class="row" style="justify-content:flex-start"><button class="btn" id="cpx">Cancel</button><button class="btn pri" id="cpy">Save</button></div>');
  $('cpx').onclick = function () { m.remove(); };
  $('cpy').onclick = function () {
    if ($('cp1').value.length < 8) { $('cpe').textContent = 'Use at least 8 characters.'; return; }
    if ($('cp1').value !== $('cp2').value) { $('cpe').textContent = 'The new passwords are not the same.'; return; }
    call('changeStaffPassword', { oldPassword: $('cp0').value, newPassword: $('cp1').value }).then(function (r) { if (!r.ok) { $('cpe').textContent = r.error; return; } m.remove(); toast('Password changed.'); });
  };
}
function showPassword(title, pw, who) {
  var m = modal('<h3>' + esc(title) + '</h3><p style="font-size:28px;font-weight:800;letter-spacing:2px;text-align:center;font-family:monospace">' + esc(pw) + '</p><p class="muted">Give this to ' + esc(who) + '. It will not be shown again. They can change it after signing in.</p><button class="btn pri" id="cl">Done</button>');
  $('cl').onclick = function () { m.remove(); };
}

/* ---------- dashboard ---------- */
function skillCells(st) { return SKILLS.map(function (k) { var x = st[k]; return '<td>' + pctBar(x.ever) + (x.avg != null ? '<span class="sub">avg ' + x.avg + '%</span>' : '') + '</td>'; }).join(''); }
function dash() {
  var mine = isAdmin() ? D.batches : D.batches;
  var act7 = 0, since = Date.now() - WEEK; D.results.forEach(function (r) { if (new Date(r.Time) >= since) act7++; });
  var noBatch = activeStudents(function (s) { return !s.BatchID || !batchById(s.BatchID); });
  var pend = D.students.filter(function (s) { return s.Status === 'Pending'; }).length;
  var toMark = D.writing.filter(function (w) { return w.TeacherMark === '' || w.TeacherMark == null; }).length;
  var h = '<main class="wrap"><h2>' + (isAdmin() ? 'Dashboard' : 'My batches') + '</h2><div class="cards">' +
    '<div class="stat"><b>' + activeStudents().length + '</b><span>active students</span></div>' +
    (isAdmin() ? '<a class="stat' + (pend ? ' warn' : '') + '" href="#apps" style="text-decoration:none"><b>' + pend + '</b><span>applications waiting</span></a>' : '') +
    '<div class="stat"><b>' + mine.length + '</b><span>batches</span></div>' +
    '<div class="stat"><b>' + act7 + '</b><span>tests taken in the last 7 days</span></div>' +
    '<a class="stat' + (toMark ? ' warn' : '') + '" href="#writing" style="text-decoration:none"><b>' + toMark + '</b><span>writing to mark</span></a>' +
    (isAdmin() && noBatch.length ? '<a class="stat warn" href="#students/nobatch" style="text-decoration:none"><b>' + noBatch.length + '</b><span>active students with no batch — assign them</span></a>' : '') + '</div>';
  h += '<div class="bar" style="justify-content:space-between"><h3 style="margin:0">Batches · % of students who practised each skill</h3>' + (isAdmin() ? '<button class="btn sm" id="mail">✉ Email teachers their report now</button>' : '') + '</div>';
  if (!mine.length) h += '<div class="card muted">' + (isAdmin() ? 'No batches yet. <a href="#batches">Create your first batch</a>, then assign students to it.' : 'No batches are assigned to you yet. Please ask the admin.') + '</div>';
  else {
    h += '<div class="tbl"><table class="t"><thead><tr><th>Batch</th><th>Teacher</th><th>Students</th><th>Active this week</th>' + SKILLS.map(function (k) { return '<th>' + k + '</th>'; }).join('') + '</tr></thead><tbody>';
    mine.forEach(function (b) {
      var st = stats(activeStudents(function (s) { return s.BatchID === b.ID; }));
      h += '<tr><td><a class="rowlink" href="#batch/' + esc(b.ID) + '">' + esc(b.Name) + '</a>' + (b.Active === 'No' ? ' ' + badge('Off') : '') + '<span class="sub">' + esc([b.Branch, b.Schedule].filter(Boolean).join(' · ')) + '</span></td><td>' + esc(teacherName(b)) + '</td><td><b>' + st.n + '</b></td><td>' + pctBar(st.activeWeek) + '</td>' + skillCells(st) + '</tr>';
    });
    if (isAdmin() && noBatch.length) { var st0 = stats(noBatch); h += '<tr><td><a class="rowlink" href="#students/nobatch">No batch</a></td><td>—</td><td><b>' + st0.n + '</b></td><td>' + pctBar(st0.activeWeek) + '</td>' + skillCells(st0) + '</tr>'; }
    h += '</tbody></table></div><p class="muted" style="font-size:13px">Big number = % of the batch who did at least one test in that skill. “avg” = average score of their attempts. Click a batch for each student.</p>';
  }
  app.innerHTML = h + '</main>';
  if ($('mail')) $('mail').onclick = function () { if (!confirm('Send each teacher their batch report by email now?')) return; this.disabled = true; call('emailReports').then(function (r) { toast(r.ok ? 'Sent ' + r.sent + ' email(s).' : r.error, !r.ok); }); };
}

/* ---------- batch view ---------- */
function batchView(id) {
  var b = batchById(id); if (!b) { location.hash = '#dash'; return; }
  var list = activeStudents(function (s) { return s.BatchID === b.ID; }).sort(function (x, y) { return String(x.Name).localeCompare(y.Name); });
  var st = stats(list);
  var h = '<main class="wrap"><a href="#dash" class="muted">← Dashboard</a><h2 style="margin-top:6px">' + esc(b.Name) + '</h2><p class="muted" style="margin-top:0">' + esc([b.Branch, b.Course, b.Schedule].filter(Boolean).join(' · ')) + ' · Teacher: <b>' + esc(teacherName(b)) + '</b> · ' + st.n + ' students</p>' +
    '<div class="cards">' + SKILLS.map(function (k) { var x = st[k]; return '<div class="stat"><span>' + k + '</span><b>' + (x.ever == null ? '—' : x.ever + '%') + '</b><span>did at least one · ' + (x.week == null ? 0 : x.week) + '% this week' + (x.avg != null ? ' · avg ' + x.avg + '%' : '') + (k === 'Writing' && x.toMark ? ' · ' + x.toMark + ' to mark' : '') + '</span></div>'; }).join('') + '</div>' +
    '<h3>Vocabulary tests</h3><div class="cards">' + VT.map(function (t, i) { var v = st.vocab[i]; return '<div class="stat"><span>' + esc(t) + '</span><b>' + (v.done == null ? '—' : v.done + '%') + '</b><span>of students did it' + (v.avgBest != null ? ' · avg best ' + v.avgBest + '%' : '') + '</span></div>'; }).join('') + '</div>' +
    '<h3>Students</h3>' + studentTable(list) + '</main>';
  app.innerHTML = h;
}
function studentTable(list) {
  if (!list.length) return '<div class="card muted">No students in this batch yet.</div>';
  return '<div class="tbl"><table class="t"><thead><tr><th>Student</th><th>Vocabulary tests</th><th>Listening</th><th>Reading</th><th>Writing</th><th>Speaking</th><th>Last practice</th></tr></thead><tbody>' + list.map(function (s) {
    var m = studentSum(s.ID);
    function c(x, total) { return x.tests ? '<b>' + x.tests + (total ? ' / ' + total : '') + '</b><span class="sub">avg best ' + x.avgBest + '%</span>' : '<span class="muted">none</span>'; }
    return '<tr><td><a class="rowlink" href="#student/' + esc(s.ID) + '">' + esc(s.Name) + '</a>' + (isAdmin() ? '<span class="sub">' + esc(s.RegNo || '') + '</span>' : '') + '</td><td>' + c(m.Vocabulary, VT.length) + '</td><td>' + c(m.Listening) + '</td><td>' + c(m.Reading) + '</td><td>' + (m.Writing.sent ? '<b>' + m.Writing.sent + '</b><span class="sub">' + m.Writing.marked + ' marked</span>' : '<span class="muted">none</span>') + '</td><td>' + (m.Speaking.tests ? '<b>' + m.Speaking.tests + '</b><span class="sub">units</span>' : '<span class="muted">none</span>') + '</td><td>' + ago(m.last) + '</td></tr>';
  }).join('') + '</tbody></table></div>';
}

/* ---------- student view ---------- */
function studentView(id) {
  var s = D.students.filter(function (x) { return x.ID === id; })[0]; if (!s) { location.hash = '#students'; return; }
  var m = studentSum(id), b = batchById(s.BatchID);
  var h = '<main class="wrap"><a href="' + (b ? '#batch/' + esc(b.ID) : '#students') + '" class="muted">← ' + (b ? esc(b.Name) : 'Students') + '</a><h2 style="margin-top:6px">' + esc(s.Name) + (isAdmin() ? ' ' + badge(s.State) : '') + '</h2>' +
    (!isAdmin() ? '<div class="card"><div class="kv"><span>Batch</span><b>' + (b ? esc(b.Name) : '—') + '</b><span>Last practice</span><b>' + ago(m.last) + '</b></div></div>' : '') +
    (!isAdmin() ? '' : '<div class="split"><div class="card"><div class="kv"><span>Reg. no.</span><b>' + esc(s.RegNo || '—') + '</b><span>Mobile</span><b>' + esc(s.Mobile) + '</b><span>Email</span><b>' + esc(s.Email || '—') + '</b><span>Branch</span><b>' + esc(s.Branch) + '</b><span>Course</span><b>' + esc(s.Course) + '</b><span>Batch</span><b>' + (b ? esc(b.Name) + ' · ' + esc(teacherName(b)) : '<span style="color:var(--bad)">No batch</span>') + '</b><span>Access until</span><b>' + fd(s.Expiry) + '</b><span>Last sign-in</span><b>' + fdt(s.LastLogin) + '</b><span>Last practice</span><b>' + ago(m.last) + '</b></div></div>' +
    (isAdmin() ? '<div class="card"><h3>Admin</h3><label for="sb">Batch</label><div class="bar" style="margin:0"><select id="sb">' + batchOptions(s.BatchID, '— No batch —') + '</select><button class="btn sm pri" id="sbs">Save batch</button></div><div class="acts" style="margin-top:14px">' +
      (s.State !== 'Pending' && s.State !== 'Rejected' ? '<button class="btn sm pri" data-a="renew">+3 months access</button><button class="btn sm" data-a="reset">Reset password</button>' : '') + (s.State !== 'Blocked' && s.State !== 'Rejected' ? '<button class="btn sm red" data-a="block">Block</button>' : '') + '</div></div>' : '') + '</div>');
  h += '<h3 style="margin-top:22px">Summary</h3><div class="cards">' +
    ['Vocabulary', 'Listening', 'Reading'].map(function (k) { var x = m[k]; return '<div class="stat"><span>' + k + '</span><b>' + (x.avgBest == null ? '—' : x.avgBest + '%') + '</b><span>' + x.tests + ' test' + (x.tests === 1 ? '' : 's') + ' · ' + x.attempts + ' attempt' + (x.attempts === 1 ? '' : 's') + '</span></div>'; }).join('') +
    '<div class="stat"><span>Speaking</span><b>' + m.Speaking.tests + '</b><span>units practised</span></div>' +
    '<div class="stat"><span>Writing</span><b>' + m.Writing.sent + '</b><span>sent · ' + m.Writing.marked + ' marked</span></div></div>';
  h += '<h3>Vocabulary tests</h3><div class="tbl"><table class="t"><thead><tr><th>Test</th><th>Best</th><th>Attempts</th></tr></thead><tbody>' + VT.map(function (t) { var n = m.R.filter(function (r) { return r.Test === t; }).length; return '<tr><td>' + esc(t) + '</td><td>' + (m.Vocabulary.best[t] != null ? '<b>' + m.Vocabulary.best[t] + '%</b>' : '<span class="muted">not taken</span>') + '</td><td>' + n + '</td></tr>'; }).join('') + '</tbody></table></div>';
  h += '<h3 style="margin-top:22px">Every attempt</h3>' + (m.R.length ? '<div class="tbl"><table class="t"><thead><tr><th>Date</th><th>Skill</th><th>Test</th><th>Marks</th><th>%</th><th>Minutes</th></tr></thead><tbody>' + m.R.map(function (r) { return '<tr><td>' + fdt(r.Time) + '</td><td>' + esc(r.Skill) + '</td><td>' + esc(r.Test) + '</td><td>' + esc(r.Score) + ' / ' + esc(r.Max) + '</td><td><b>' + esc(r.Percent) + '%</b></td><td>' + esc(r.Minutes) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">No tests yet.</p>');
  h += '<h3 style="margin-top:22px">Writing</h3>' + (m.W.length ? m.W.map(function (w) { return '<details class="card" style="margin-bottom:8px"><summary style="cursor:pointer"><b>' + fdt(w.Time) + '</b> · ' + esc(w.Level) + ' · ' + esc(w.Task) + ' · ' + esc(w.Words) + ' words · ' + (w.TeacherMark !== '' && w.TeacherMark != null ? badge('Marked ' + w.TeacherMark) : badge('To mark')) + '</summary><div class="passage" style="font-size:15px">' + esc(w.Text) + '</div>' + (w.TeacherComment ? '<p><b>Comment:</b> ' + esc(w.TeacherComment) + '</p>' : '') + '<a href="#writing">Mark in Writing →</a></details>'; }).join('') : '<p class="muted">No writing yet.</p>');
  app.innerHTML = h + '</main>';
  if (isAdmin()) {
    $('sbs').onclick = function () { act('setBatch', { id: s.ID, batchId: $('sb').value }, 'Batch saved.'); };
    app.onclick = function (e) { var x = e.target.closest('[data-a]'); if (!x) return; studentAction(x.dataset.a, s); };
  }
}
function studentAction(a, s) {
  if (a === 'renew') act('renew', { id: s.ID, days: 90 }, 'Access extended by 3 months.');
  if (a === 'block' && confirm('Block ' + s.Name + '? They will be signed out and cannot sign in.')) act('block', { id: s.ID }, 'Blocked.');
  if (a === 'reset' && confirm('Make a new password for ' + s.Name + '?')) call('resetPassword', { id: s.ID }).then(function (r) { if (!r.ok) { toast(r.error, true); return; } showPassword('New password for ' + s.Name, r.password, s.Name + ' (' + s.Mobile + ')'); });
}

/* ---------- applications ---------- */
function apps() {
  var P = D.students.filter(function (s) { return s.Status === 'Pending'; }).sort(function (a, b) { return new Date(a.AppliedOn) - new Date(b.AppliedOn); });
  var h = '<main class="wrap"><h2>Applications waiting</h2><p class="muted" style="margin-top:0">Choose the <b>batch</b> (it sets the teacher and class time), check the reg. no., then Approve. Approval gives 3 months of access.</p>';
  if (!D.batches.length) h += '<div class="msg warn">You have no batches yet. <a href="#batches">Create a batch first</a> — you need one to approve students.</div>';
  h += P.length ? '<div class="tbl"><table class="t"><thead><tr><th>Applied</th><th>Name</th><th>Mobile</th><th>Branch</th><th>Reg. no.</th><th>Batch</th><th>Action</th></tr></thead><tbody>' + P.map(function (s) {
    var sug = D.batches.filter(function (b) { return b.Branch === s.Branch && b.Active !== 'No'; });
    return '<tr><td>' + fdt(s.AppliedOn) + (s.Note ? '<span class="sub">' + esc(s.Note) + '</span>' : '') + '</td><td><b>' + esc(s.Name) + '</b><span class="sub">' + esc(s.Course) + (s.Email ? ' · ' + esc(s.Email) : '') + '</span></td><td>' + esc(s.Mobile) + '</td><td>' + esc(s.Branch) + '</td>' +
      '<td><input type="text" value="' + esc(s.RegNo) + '" data-reg="' + esc(s.ID) + '" aria-label="Registration number for ' + esc(s.Name) + '" style="min-width:110px;padding:6px 8px;font-size:14px"></td>' +
      '<td><select data-bat="' + esc(s.ID) + '" aria-label="Batch for ' + esc(s.Name) + '" style="min-width:180px;padding:6px 8px;font-size:14px">' + batchOptions(sug.length === 1 ? sug[0].ID : '', 'Choose batch…') + '</select></td>' +
      '<td class="acts"><button class="btn sm pri" data-ap="' + esc(s.ID) + '">Approve</button><button class="btn sm red" data-rj="' + esc(s.ID) + '">Reject</button></td></tr>';
  }).join('') + '</tbody></table></div>' : '<div class="card muted">No applications waiting. 🎉</div>';
  app.innerHTML = h + '</main>';
  app.onclick = function (e) {
    var b = e.target.closest('[data-ap],[data-rj]'); if (!b) return;
    if (b.dataset.ap) {
      var bat = app.querySelector('[data-bat="' + b.dataset.ap + '"]').value;
      if (!bat) { toast('Choose a batch first.', true); app.querySelector('[data-bat="' + b.dataset.ap + '"]').focus(); return; }
      b.disabled = true; act('approve', { id: b.dataset.ap, regNo: app.querySelector('[data-reg="' + b.dataset.ap + '"]').value, batchId: bat, days: 90 }, 'Approved — the student can sign in now.');
    } else if (confirm('Reject this application?')) { b.disabled = true; act('reject', { id: b.dataset.rj }, 'Application rejected.'); }
  };
}

/* ---------- students ---------- */
function students(pre) {
  if (!isAdmin()) return teacherStudents();
  var h = '<main class="wrap"><h2>' + (isAdmin() ? 'Students' : 'My students') + '</h2><div class="bar"><input type="search" id="sq" placeholder="Search name, mobile or reg. no." aria-label="Search students"><select id="sbr" aria-label="Branch"><option value="">All branches</option>' + C.BRANCHES.map(function (b) { return '<option>' + b + '</option>'; }).join('') + '</select><select id="sbt" aria-label="Batch"><option value="">All batches</option>' + (isAdmin() ? '<option value="__none"' + (pre === 'nobatch' ? ' selected' : '') + '>No batch</option>' : '') + batchOptions('') + '</select>' +
    (isAdmin() ? '<select id="sst" aria-label="Status"><option value="">All statuses</option><option selected>Active</option><option>Expired</option><option>Pending</option><option>Blocked</option><option>Rejected</option></select>' : '') + '</div>' +
    (isAdmin() ? '<div class="bar" id="bulk" hidden style="background:var(--y2);padding:8px 12px;border-radius:10px"><b id="selN"></b><select id="mvb" aria-label="Move to batch" style="max-width:320px">' + batchOptions('', 'Move selected to batch…') + '</select><button class="btn sm pri" id="mv">Move</button></div>' : '') + '<div id="sl"></div></main>';
  app.innerHTML = h;
  var sel = {};
  function draw() {
    var q = $('sq').value.toLowerCase(), br = $('sbr').value, bt = $('sbt').value, st = $('sst') ? $('sst').value : '';
    var L = D.students.filter(function (x) { return (!br || x.Branch === br) && (!st || x.State === st) && (!bt || (bt === '__none' ? !batchById(x.BatchID) : x.BatchID === bt)) && (!q || [x.Name, x.Mobile, x.RegNo, x.Email].join(' ').toLowerCase().indexOf(q) > -1); })
      .sort(function (a, b) { return String(a.Name).localeCompare(b.Name); });
    $('sl').innerHTML = '<p class="muted">' + L.length + ' students</p><div class="tbl"><table class="t"><thead><tr>' + (isAdmin() ? '<th><input type="checkbox" id="all" aria-label="Select all"></th>' : '') + '<th>Name</th><th>Mobile</th><th>Reg. no.</th><th>Branch</th><th>Batch</th><th>Status</th><th>Access until</th><th>Tests</th><th>Last practice</th></tr></thead><tbody>' + L.map(function (x) {
      var b = batchById(x.BatchID), m = studentSum(x.ID);
      return '<tr' + (sel[x.ID] ? ' class="sel"' : '') + '>' + (isAdmin() ? '<td><input type="checkbox" data-sel="' + esc(x.ID) + '"' + (sel[x.ID] ? ' checked' : '') + ' aria-label="Select ' + esc(x.Name) + '"></td>' : '') +
        '<td><a class="rowlink" href="#student/' + esc(x.ID) + '">' + esc(x.Name) + '</a></td><td>' + esc(x.Mobile) + '</td><td>' + esc(x.RegNo) + '</td><td>' + esc(x.Branch) + '</td><td>' + (b ? esc(b.Name) : '<span style="color:var(--bad);font-weight:700">none</span>') + '</td><td>' + badge(x.State) + '</td><td>' + fd(x.Expiry) + '</td><td>' + m.R.length + '</td><td>' + ago(m.last) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    var n = Object.keys(sel).length; if ($('bulk')) { $('bulk').hidden = !n; $('selN').textContent = n + ' selected'; }
    if ($('all')) $('all').onchange = function () { var on = this.checked; L.forEach(function (x) { if (on) sel[x.ID] = 1; else delete sel[x.ID]; }); draw(); };
  }
  $('sq').oninput = $('sbr').onchange = $('sbt').onchange = draw; if ($('sst')) { $('sst').onchange = draw; if (pre === 'nobatch') $('sst').value = 'Active'; }
  app.onchange = function (e) { var c = e.target.closest('[data-sel]'); if (!c) return; if (c.checked) sel[c.dataset.sel] = 1; else delete sel[c.dataset.sel]; draw(); };
  if ($('mv')) $('mv').onclick = function () { var b = $('mvb').value, ids = Object.keys(sel); if (!b) { toast('Choose a batch.', true); return; } act('setBatch', { ids: ids, batchId: b }, ids.length + ' student(s) moved.'); };
  draw();
}

function teacherStudents() {
  app.innerHTML = '<main class="wrap"><h2>My students</h2><p class="muted" style="margin-top:0">Each student\'s best average score per skill. Click a name for every test.</p><div class="bar"><input type="search" id="sq" placeholder="Search name" aria-label="Search students"><select id="sbt" aria-label="Batch"><option value="">All my batches</option>' + batchOptions('') + '</select></div><div id="sl"></div></main>';
  function cell(x, total) { return x.tests ? '<b>' + (x.avgBest) + '%</b><span class="sub">' + x.tests + (total ? ' / ' + total : '') + ' test' + (x.tests === 1 ? '' : 's') + '</span>' : '<span class="muted">—</span>'; }
  function draw() {
    var q = $('sq').value.toLowerCase(), bt = $('sbt').value;
    var L = D.students.filter(function (x) { return (!bt || x.BatchID === bt) && (!q || String(x.Name).toLowerCase().indexOf(q) > -1); }).sort(function (a, b) { return String(a.Name).localeCompare(b.Name); });
    $('sl').innerHTML = '<p class="muted">' + L.length + ' students</p><div class="tbl"><table class="t"><thead><tr><th>Name</th><th>Batch</th><th>Vocabulary</th><th>Listening</th><th>Reading</th><th>Writing</th><th>Speaking</th><th>Last practice</th></tr></thead><tbody>' + L.map(function (x) {
      var m = studentSum(x.ID), b = batchById(x.BatchID);
      return '<tr><td><a class="rowlink" href="#student/' + esc(x.ID) + '">' + esc(x.Name) + '</a></td><td>' + (b ? esc(b.Name) : '—') + '</td><td>' + cell(m.Vocabulary, VT.length) + '</td><td>' + cell(m.Listening) + '</td><td>' + cell(m.Reading) + '</td><td>' + (m.Writing.sent ? '<b>' + m.Writing.sent + '</b><span class="sub">sent</span>' : '<span class="muted">—</span>') + '</td><td>' + (m.Speaking.tests ? '<b>' + m.Speaking.tests + '</b><span class="sub">units</span>' : '<span class="muted">—</span>') + '</td><td>' + ago(m.last) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  $('sq').oninput = $('sbt').onchange = draw; draw();
}

/* ---------- batches ---------- */
function batches() {
  var teachers = D.staff.filter(function (s) { return s.active; });
  function form(b) {
    b = b || {};
    return '<form class="card inline" id="bf" novalidate style="margin-bottom:16px"><input type="hidden" id="bid" value="' + esc(b.ID || '') + '"><div style="grid-column:1/-1"><h3 style="margin:0">' + (b.ID ? 'Edit batch' : 'New batch') + '</h3></div>' +
      '<div><label for="bn">Batch name</label><input type="text" id="bn" value="' + esc(b.Name || '') + '" placeholder="e.g. KN-DE-Nov26-A" maxlength="60"></div>' +
      '<div><label for="bb">Branch</label><select id="bb">' + C.BRANCHES.map(function (x) { return '<option' + (x === b.Branch ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="bc">Course</label><select id="bc">' + C.COURSES.map(function (x) { return '<option' + (x === (b.Course || 'Diploma in English') ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="bs">Class time</label><input type="text" id="bs" value="' + esc(b.Schedule || '') + '" placeholder="e.g. Sat & Sun 9–11 am" maxlength="80"></div>' +
      '<div><label for="bt">Teacher</label><select id="bt"><option value="">— choose —</option>' + teachers.map(function (t) { return '<option value="' + esc(t.email) + '"' + (t.email === String(b.TeacherEmail || '').toLowerCase() ? ' selected' : '') + '>' + esc(t.name) + ' (' + t.role + ')</option>'; }).join('') + '</select></div>' +
      '<div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ba"' + (b.Active === 'No' ? '' : ' checked') + '> Batch is running</label></div>' +
      '<div class="err" id="be" role="alert" style="grid-column:1/-1"></div><div class="acts" style="grid-column:1/-1"><button class="btn pri" id="bsv">' + (b.ID ? 'Save changes' : 'Create batch') + '</button>' + (b.ID ? '<button class="btn" type="button" id="bcx">Cancel</button>' : '') + '</div></form>';
  }
  function draw(edit) {
    app.innerHTML = '<main class="wrap"><h2>Batches</h2><p class="muted" style="margin-top:0">A batch sets the class time and the teacher. Students are put in a batch when you approve them. ' + (teachers.length < 2 ? 'Add teachers under <a href="#staff">Staff</a> first.' : '') + '</p>' + form(edit) +
      (D.batches.length ? '<div class="tbl"><table class="t"><thead><tr><th>Batch</th><th>Branch</th><th>Class time</th><th>Teacher</th><th>Students</th><th>Status</th><th></th></tr></thead><tbody>' + D.batches.map(function (b) {
        return '<tr><td><a class="rowlink" href="#batch/' + esc(b.ID) + '">' + esc(b.Name) + '</a><span class="sub">' + esc(b.Course) + '</span></td><td>' + esc(b.Branch) + '</td><td>' + esc(b.Schedule) + '</td><td>' + esc(teacherName(b)) + '</td><td>' + activeStudents(function (s) { return s.BatchID === b.ID; }).length + '</td><td>' + (b.Active === 'No' ? badge('Off') : badge('Active')) + '</td><td><button class="btn sm" data-ed="' + esc(b.ID) + '">Edit</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="card muted">No batches yet.</div>') + '</main>';
    $('bf').onsubmit = function (e) {
      e.preventDefault();
      var d = { id: $('bid').value || undefined, name: $('bn').value.trim(), branch: $('bb').value, course: $('bc').value, schedule: $('bs').value.trim(), teacherEmail: $('bt').value, active: $('ba').checked };
      if (d.name.length < 2) { $('be').textContent = 'Enter a batch name.'; return; }
      if (!d.teacherEmail) { $('be').textContent = 'Choose the teacher.'; return; }
      $('bsv').disabled = true; act('saveBatch', d, d.id ? 'Batch saved.' : 'Batch created.');
    };
    if ($('bcx')) $('bcx').onclick = function () { draw(); };
    app.onclick = function (e) { var x = e.target.closest('[data-ed]'); if (x) { draw(batchById(x.dataset.ed)); window.scrollTo(0, 0); } };
  }
  draw();
}

/* ---------- staff ---------- */
function staffView() {
  app.innerHTML = '<main class="wrap"><h2>Staff</h2><p class="muted" style="margin-top:0">Teachers sign in on this same page and only see their own batches. When you add someone, a password is shown once — give it to them.</p>' +
    '<form class="card inline" id="sf" novalidate style="margin-bottom:16px"><div style="grid-column:1/-1"><h3 style="margin:0">Add a teacher or admin</h3></div><div><label for="se">Email</label><input type="email" id="se" autocomplete="off"></div><div><label for="sn">Name</label><input type="text" id="sn" maxlength="60"></div><div><label for="sr">Role</label><select id="sr"><option>Teacher</option><option>Admin</option></select></div><div><button class="btn pri" id="ss" style="width:100%">Add</button></div><div class="err" id="ser" role="alert" style="grid-column:1/-1"></div></form>' +
    '<div class="tbl"><table class="t"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Batches</th><th>Status</th><th>Action</th></tr></thead><tbody>' + D.staff.map(function (s) {
      var nb = D.batches.filter(function (b) { return String(b.TeacherEmail).toLowerCase() === s.email; }).map(function (b) { return esc(b.Name); }).join(', ');
      var me = s.email === ME.email;
      return '<tr><td><b>' + esc(s.name) + '</b>' + (me ? ' <span class="muted">(you)</span>' : '') + '</td><td>' + esc(s.email) + '</td><td>' + badge(s.role) + '</td><td>' + (nb || '<span class="muted">none</span>') + '</td><td>' + (s.active ? badge('Active') : badge('Off')) + (s.hasPassword ? '' : ' <span class="badge warn">no password</span>') + '</td><td class="acts">' +
        (me ? '' : '<button class="btn sm" data-rp="' + esc(s.email) + '">New password</button><button class="btn sm' + (s.active ? ' red' : '') + '" data-tg="' + esc(s.email) + '">' + (s.active ? 'Turn off' : 'Turn on') + '</button><button class="btn sm" data-rl="' + esc(s.email) + '">Make ' + (s.role === 'Admin' ? 'teacher' : 'admin') + '</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div></main>';
  $('sf').onsubmit = function (e) {
    e.preventDefault(); var em = $('se').value.trim().toLowerCase(), nm = $('sn').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { $('ser').textContent = 'Enter a valid email.'; return; } if (nm.length < 2) { $('ser').textContent = 'Enter the name.'; return; }
    if (staffByEmail(em)) { $('ser').textContent = 'This email is already on the list.'; return; }
    $('ss').disabled = true;
    call('saveStaff', { email: em, name: nm, role: $('sr').value }).then(function (r) { $('ss').disabled = false; if (!r.ok) { $('ser').textContent = r.error; return; } loadAll().then(function () { route(); if (r.password) showPassword('Password for ' + nm, r.password, nm + ' (' + em + ')'); }); });
  };
  app.onclick = function (e) {
    var x = e.target.closest('[data-rp],[data-tg],[data-rl]'); if (!x) return; var s = staffByEmail(x.dataset.rp || x.dataset.tg || x.dataset.rl);
    if (x.dataset.rp && confirm('Make a new password for ' + s.name + '? Their old password stops working.')) call('resetStaffPassword', { email: s.email }).then(function (r) { if (!r.ok) { toast(r.error, true); return; } showPassword('New password for ' + s.name, r.password, s.name); });
    if (x.dataset.tg) act('saveStaff', { email: s.email, name: s.name, role: s.role, active: !s.active }, s.active ? 'Turned off.' : 'Turned on.');
    if (x.dataset.rl && confirm('Change ' + s.name + ' to ' + (s.role === 'Admin' ? 'Teacher' : 'Admin') + '?')) act('saveStaff', { email: s.email, name: s.name, role: s.role === 'Admin' ? 'Teacher' : 'Admin', active: s.active }, 'Role changed.');
  };
}

/* ---------- results ---------- */
function results() {
  var tests = {}; D.results.forEach(function (r) { tests[r.Test] = 1; });
  var stuBatch = {}; D.students.forEach(function (s) { stuBatch[s.ID] = s.BatchID; });
  app.innerHTML = '<main class="wrap"><h2>Results</h2><div class="bar"><input type="search" id="rq" placeholder="Search student or reg. no." aria-label="Search"><select id="rbt" aria-label="Batch"><option value="">All batches</option>' + batchOptions('') + '</select><select id="rs" aria-label="Skill"><option value="">All skills</option>' + ['Vocabulary', 'Listening', 'Reading', 'Speaking'].map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select><select id="rt" aria-label="Test"><option value="">All tests</option>' + Object.keys(tests).sort().map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select><label style="margin:0;display:flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" id="rbest"> Best attempt only</label><button class="btn sm" id="csv">Download CSV</button></div><div id="rl"></div></main>';
  var cur = [];
  function draw() {
    var q = $('rq').value.toLowerCase(), bt = $('rbt').value, s = $('rs').value, t = $('rt').value;
    cur = D.results.filter(function (r) { return (!bt || stuBatch[r.StudentID] === bt) && (!s || r.Skill === s) && (!t || r.Test === t) && (!q || [r.Name, r.RegNo].join(' ').toLowerCase().indexOf(q) > -1); }).sort(function (a, b) { return new Date(b.Time) - new Date(a.Time); });
    if ($('rbest').checked) { var m = {}; cur.forEach(function (r) { var k = r.StudentID + '|' + r.Test; if (!m[k] || Number(r.Percent) > Number(m[k].Percent)) m[k] = r; }); cur = Object.keys(m).map(function (k) { return m[k]; }); }
    var avg = cur.length ? Math.round(cur.reduce(function (a, r) { return a + Number(r.Percent); }, 0) / cur.length) : 0;
    $('rl').innerHTML = '<p class="muted">' + cur.length + ' results · average ' + avg + '%</p><div class="tbl"><table class="t"><thead><tr><th>Date</th><th>Student</th><th>Batch</th><th>Test</th><th>Marks</th><th>%</th><th>Min</th><th>Detail</th></tr></thead><tbody>' + cur.slice(0, 500).map(function (r) {
      var b = batchById(stuBatch[r.StudentID]);
      return '<tr><td>' + fdt(r.Time) + '</td><td><a class="rowlink" href="#student/' + esc(r.StudentID) + '">' + esc(r.Name) + '</a><span class="sub">' + esc(r.RegNo) + '</span></td><td>' + (b ? esc(b.Name) : '—') + '</td><td>' + esc(r.Test) + '</td><td>' + esc(r.Score) + ' / ' + esc(r.Max) + '</td><td><b>' + esc(r.Percent) + '%</b></td><td>' + esc(r.Minutes) + '</td><td style="max-width:260px;font-size:12.5px">' + esc(r.Detail) + '</td></tr>';
    }).join('') + '</tbody></table></div>' + (cur.length > 500 ? '<p class="muted">Showing the newest 500. Download the CSV for all.</p>' : '');
  }
  $('rq').oninput = $('rbt').onchange = $('rs').onchange = $('rt').onchange = $('rbest').onchange = draw; draw();
  $('csv').onclick = function () {
    var H = ['Time', 'Name', 'RegNo', 'Branch', 'Batch', 'Skill', 'Level', 'Test', 'Score', 'Max', 'Percent', 'Minutes', 'Detail'];
    var csv = [H.join(',')].concat(cur.map(function (r) { return H.map(function (h) { var v = h === 'Time' ? fdt(r[h]) : h === 'Batch' ? ((batchById(stuBatch[r.StudentID]) || {}).Name || '') : String(r[h] == null ? '' : r[h]); return '"' + v.replace(/"/g, '""') + '"'; }).join(','); })).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'dmi-diploma-results.csv'; a.click();
  };
}

/* ---------- writing ---------- */
function fb(s) { var j; try { j = JSON.parse(s); } catch (e) { return ''; } if (!j) return ''; if (j.note) return '<p class="muted">' + esc(j.note) + '</p>';
  if (!j.scores) return '<div style="font-size:14px"><b>AI: ' + esc(j.estimatedBand || '') + '</b> — ' + esc(j.taskAchievement || '') + (j.corrections && j.corrections.length ? '<ul>' + j.corrections.map(function (c) { return '<li><s>' + esc(c.original) + '</s> → <b>' + esc(c.corrected) + '</b></li>'; }).join('') + '</ul>' : '') + '</div>';
  var P = [['task', 'Task'], ['organisation', 'Organisation'], ['grammar', 'Grammar'], ['vocabulary', 'Vocabulary'], ['spelling', 'Spelling']];
  var miss = (j.points || []).filter(function (x) { return !x.covered; });
  return '<details class="card" style="margin:10px 0;font-size:14px"><summary><b>AI mark ' + esc(j.total) + '/100</b>' + (j.levelReached ? ' · level ' + esc(j.levelReached) : '') + ' · ' + P.map(function (p) { return p[1] + ' ' + ((j.scores || {})[p[0]] || 0) + '/20'; }).join(' · ') + '</summary>' +
    '<p>' + esc(j.summary || '') + '</p>' + (miss.length ? '<p style="color:var(--bad)"><b>Missing:</b> ' + miss.map(function (x) { return esc(x.point); }).join('; ') + '</p>' : '') +
    ((j.corrections || []).length ? '<ol>' + j.corrections.map(function (c) { return '<li><s>' + esc(c.original) + '</s> → <b>' + esc(c.corrected) + '</b>' + (c.explain ? ' <span class="muted">— ' + esc(c.explain) + '</span>' : '') + '</li>'; }).join('') + '</ol>' : '') +
    (j.correctedText ? '<p><b>Corrected text</b></p><div class="passage" style="font-size:14px;white-space:pre-line">' + esc(j.correctedText) + '</div>' : '') + '</details>'; }
function writing() {
  app.innerHTML = '<main class="wrap"><h2>Writing</h2><div class="chips" id="wf"><button class="chip on" data-f="todo">To mark</button><button class="chip" data-f="all">All</button></div><div id="wl" style="margin-top:12px"></div></main>';
  var f = 'todo', stuBatch = {}; D.students.forEach(function (s) { stuBatch[s.ID] = s.BatchID; });
  function draw() {
    var L = D.writing.filter(function (w) { return f === 'all' || w.TeacherMark === '' || w.TeacherMark == null; }).sort(function (a, b) { return new Date(b.Time) - new Date(a.Time); });
    $('wl').innerHTML = L.length ? L.map(function (w) { var b = batchById(stuBatch[w.StudentID]);
      return '<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><a class="rowlink" href="#student/' + esc(w.StudentID) + '">' + esc(w.Name) + '</a>' + (isAdmin() && w.RegNo ? ' · ' + esc(w.RegNo) : '') + ' · ' + (b ? esc(b.Name) : esc(w.Branch || '')) + '<br><span class="muted">' + esc(w.Level) + ' · ' + esc(w.Task) + ' · ' + esc(w.Words) + ' words · ' + fdt(w.Time) + '</span></div>' + (w.TeacherMark !== '' && w.TeacherMark != null ? '<span class="badge ok">Marked ' + esc(w.TeacherMark) + ' by ' + esc(w.MarkedBy) + '</span>' : '') + '</div>' +
        '<div class="passage" style="font-size:15px;white-space:pre-line">' + esc(w.Text) + '</div>' + fb(w.AIFeedback) + (w.AIBand && !(w.TeacherMark !== '' && w.TeacherMark != null) ? '<p class="muted" style="font-size:13px;margin:4px 0">The AI mark is filled in for you. Change it if you disagree, then save.</p>' : '') +
        '<div class="bar"><input type="text" placeholder="Mark (e.g. 72/100)" value="' + esc(w.TeacherMark !== '' && w.TeacherMark != null ? w.TeacherMark : (w.AIBand || '')) + '" data-m="' + esc(w.ID) + '" aria-label="Mark" style="max-width:200px"><input type="text" placeholder="Comment for the student" value="' + esc(w.TeacherComment) + '" data-c="' + esc(w.ID) + '" aria-label="Comment"><button class="btn sm pri" data-save="' + esc(w.ID) + '">Save mark</button></div></div>'; }).join('') : '<div class="card muted">Nothing to mark.</div>';
  }
  $('wf').onclick = function (e) { var b = e.target.closest('[data-f]'); if (!b) return; f = b.dataset.f; Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle('on', c === b); }); draw(); };
  app.onclick = function (e) { var b = e.target.closest('[data-save]'); if (!b) return; var id = b.dataset.save, m = app.querySelector('[data-m="' + id + '"]').value.trim(); if (!m) { toast('Enter a mark first.', true); return; } b.disabled = true; act('markWriting', { id: id, mark: m, comment: app.querySelector('[data-c="' + id + '"]').value }, 'Mark saved.'); };
  draw();
}

if (tok()) call('adminMe').then(function (r) { if (r.ok) { ME = r.user; start(); } else if (r.code !== 'AUTH') login(r.error); }); else login();
})();
