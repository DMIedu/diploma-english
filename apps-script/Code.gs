/**
 * DMI Diploma in English – Practice Hub backend (Google Apps Script)
 *
 * ONE-TIME SETUP
 * 1. Create a new Google Sheet, name it "DMI Diploma English Hub".
 * 2. In the sheet: Extensions → Apps Script. Delete everything there, paste this file, Save.
 * 3. Reload the Google Sheet. A new menu "DMI Hub" appears.
 *    DMI Hub → "1. Set up the sheet tabs"      (creates the tabs)
 *    DMI Hub → "2. Add an admin user"          (your admin email + password)
 * 4. Optional – AI writing feedback:
 *    Apps Script editor → Project Settings (gear) → Script properties → Add:
 *      GEMINI_API_KEY = your Google AI Studio key   (kept secret here, never in GitHub)
 *      GEMINI_MODEL   = gemini-2.5-flash            (optional; change if Google renames models)
 * 5. Deploy → New deployment → type "Web app"
 *      Execute as: Me        Who has access: Anyone
 *    Copy the Web app URL (ends with /exec) and paste it into assets/config.js (API_URL).
 *
 * After any change to this file: Deploy → Manage deployments → Edit (pencil) →
 * Version: "New version" → Deploy. The URL stays the same.
 */

var ACCESS_DAYS = 90;              // access after approval (3 months)
var STUDENT_SESSION_DAYS = 14;     // student stays signed in on a device
var ADMIN_SESSION_HOURS = 12;
var HASH_ROUNDS = 3000;
var AI_PER_DAY = 10;               // AI writing checks per student per day
var BRANCHES = ['Jaffna', 'Nelliady', 'Chavakachcheri', 'Chunnakam', 'Kilinochchi', 'Sandilipay'];

var TABS = {
  Students: ['ID', 'Name', 'Mobile', 'Email', 'RegNo', 'Branch', 'Course', 'Status', 'AppliedOn', 'ApprovedOn',
             'Expiry', 'ApprovedBy', 'Note', 'Salt', 'Hash', 'LastLogin'],
  Admins:   ['Email', 'Name', 'Salt', 'Hash', 'Active', 'Created'],
  Sessions: ['TokenHash', 'Role', 'UserKey', 'Expires'],
  Results:  ['ID', 'Time', 'StudentID', 'Name', 'RegNo', 'Branch', 'Skill', 'Level', 'Test', 'Score', 'Max',
             'Percent', 'Minutes', 'Detail'],
  Writing:  ['ID', 'Time', 'StudentID', 'Name', 'RegNo', 'Branch', 'Level', 'TaskID', 'Task', 'Words', 'Text',
             'AIBand', 'AIFeedback', 'TeacherMark', 'TeacherComment', 'MarkedBy']
};

// ---------------- menu (sheet-side setup) ----------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('DMI Hub')
    .addItem('1. Set up the sheet tabs', 'setupTabs')
    .addItem('2. Add an admin user', 'addAdminFromMenu')
    .addItem('Test AI writing key', 'testAI')
    .addToUi();
}

function setupTabs() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    var sh = book.getSheetByName(name) || book.insertSheet(name);
    var head = TABS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#ffe600');
    sh.setFrozenRows(1);
  });
  ['Salt', 'Hash'].forEach(function (c) {
    var sh = book.getSheetByName('Students');
    sh.hideColumns(TABS.Students.indexOf(c) + 1);
  });
  book.getSheetByName('Admins').hideColumns(3, 2);
  book.getSheetByName('Sessions').hideSheet();
  try { SpreadsheetApp.getUi().alert('Tabs are ready. Next: DMI Hub → 2. Add an admin user.'); } catch (e) {}
}

function addAdminFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var e = ui.prompt('Admin email', 'Email the admin will sign in with:', ui.ButtonSet.OK_CANCEL);
  if (e.getSelectedButton() !== ui.Button.OK) return;
  var n = ui.prompt('Admin name', 'Name shown in the panel:', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  var p = ui.prompt('Admin password', 'At least 8 characters. (Typed text is visible here – clear the screen after.)', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  var email = lower_(e.getResponseText()), pw = p.getResponseText();
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 8) { ui.alert('Not saved: check the email and use 8+ characters.'); return; }
  var sh = sheet_('Admins'), rows = read_('Admins');
  var found = rows.filter(function (r) { return lower_(r.Email) === email; })[0];
  var salt = random_(16), hash = hash_(pw, salt);
  if (found) setRow_('Admins', found._row, { Name: clean_(n.getResponseText()), Salt: salt, Hash: hash, Active: 'Yes' });
  else sh.appendRow([email, clean_(n.getResponseText()), salt, hash, 'Yes', new Date()]);
  ui.alert('Admin saved: ' + email);
}

function testAI() {
  var r = gemini_('Reply with the single word OK.');
  SpreadsheetApp.getUi().alert(r.ok ? 'AI is working: ' + r.text.slice(0, 60) : 'AI not working: ' + r.error);
}

// ---------------- web entry ----------------
function doGet() { return out_({ ok: true, service: 'DMI Diploma English Hub' }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var a = String(p.action || '');
    if (!lock.tryLock(20000)) return out_({ ok: false, error: 'The server is busy. Please try again.' });
    if (a === 'apply') return out_(apply_(p));
    if (a === 'login') return out_(login_(p));
    if (a === 'adminLogin') return out_(adminLogin_(p));
    var s = session_(p.token);
    if (!s) return out_({ ok: false, code: 'AUTH', error: 'Please sign in again.' });
    if (a === 'logout') { endSession_(p.token); return out_({ ok: true }); }
    if (s.role === 'student') {
      var st = student_(s.key);
      var why = blocked_(st);
      if (why) { endSession_(p.token); return out_({ ok: false, code: 'AUTH', error: why }); }
      switch (a) {
        case 'me': return out_({ ok: true, user: publicStudent_(st) });
        case 'saveResult': return out_(saveResult_(st, p));
        case 'myResults': return out_(myResults_(st));
        case 'submitWriting': return out_(submitWriting_(st, p));
        case 'changePassword': return out_(changePassword_(st, p));
      }
    } else if (s.role === 'admin') {
      var admin = read_('Admins').filter(function (r) { return lower_(r.Email) === s.key && r.Active === 'Yes'; })[0];
      if (!admin) return out_({ ok: false, code: 'AUTH', error: 'Please sign in again.' });
      switch (a) {
        case 'adminMe': return out_({ ok: true, user: { name: admin.Name, email: admin.Email } });
        case 'listStudents': return out_({ ok: true, data: read_('Students').map(adminStudent_) });
        case 'approve': return out_(approve_(p, admin));
        case 'reject': return out_(setStatus_(p, 'Rejected', admin));
        case 'block': return out_(setStatus_(p, 'Blocked', admin));
        case 'renew': return out_(renew_(p, admin));
        case 'resetPassword': return out_(resetPassword_(p));
        case 'listResults': return out_({ ok: true, data: read_('Results').map(stripRow_) });
        case 'listWriting': return out_({ ok: true, data: read_('Writing').map(stripRow_) });
        case 'markWriting': return out_(markWriting_(p, admin));
      }
    }
    return out_({ ok: false, error: 'Unknown request.' });
  } catch (err) {
    console.error(err);
    return out_({ ok: false, error: 'Something went wrong. Please try again or contact DMI.' });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// ---------------- students ----------------
function apply_(p) {
  var name = clean_(p.name).replace(/\s+/g, ' '), mobile = mobile_(p.mobile), email = lower_(p.email),
      reg = clean_(p.regNo).toUpperCase(), branch = clean_(p.branch), course = clean_(p.course), pw = String(p.password || '');
  if (name.length < 3) return bad_('Please enter your full name.');
  if (!mobile) return bad_('Please enter a valid mobile number (e.g. 0771234567).');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return bad_('Please check your email address.');
  if (BRANCHES.indexOf(branch) < 0) return bad_('Please select your branch.');
  if (pw.length < 6) return bad_('Your password must have at least 6 characters.');
  var cache = CacheService.getScriptCache(), ck = 'apply_' + mobile;
  if (cache.get(ck)) return bad_('Please wait a minute before applying again.');
  cache.put(ck, '1', 60);
  var existing = read_('Students').filter(function (r) { return mobile_(r.Mobile) === mobile; })[0];
  var salt = random_(16), hash = hash_(pw, salt);
  if (existing) {
    // Never let a new application overwrite an existing account's password.
    if (existing.Status === 'Pending') return bad_('You have already applied with this mobile number. Please wait for approval.');
    if (existing.Status === 'Blocked') return bad_('This account is blocked. Please contact your DMI branch.');
    if (existing.Status === 'Active') return bad_('This mobile number already has an account. Please sign in, or contact your branch to renew.');
    setRow_('Students', existing._row, { Name: name, Email: email, RegNo: reg, Branch: branch, Course: course,
      Status: 'Pending', AppliedOn: new Date(), Note: 'Re-applied', Salt: salt, Hash: hash });
    return { ok: true, status: 'Pending' };
  }
  sheet_('Students').appendRow(rowFor_('Students', { ID: 'S' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    Name: name, Mobile: "'" + mobile, Email: email, RegNo: reg, Branch: branch, Course: course, Status: 'Pending',
    AppliedOn: new Date(), Salt: salt, Hash: hash }));
  return { ok: true, status: 'Pending' };
}

function login_(p) {
  var mobile = mobile_(p.mobile), st = mobile && read_('Students').filter(function (r) { return mobile_(r.Mobile) === mobile; })[0];
  if (!st || !st.Hash || !same_(hash_(String(p.password || ''), st.Salt), st.Hash))
    return bad_('Mobile number or password is wrong.');
  if (st.Status === 'Pending') return { ok: false, code: 'PENDING', error: 'Your application is waiting for approval by DMI. Please check again later.' };
  var why = blocked_(st);
  if (why) return { ok: false, code: 'BLOCKED', error: why };
  setRow_('Students', st._row, { LastLogin: new Date() });
  return { ok: true, token: newSession_('student', st.ID, STUDENT_SESSION_DAYS * 24), user: publicStudent_(st) };
}

function blocked_(st) {
  if (!st) return 'Account not found.';
  if (st.Status === 'Rejected') return 'Your application was not approved. Please contact your DMI branch.';
  if (st.Status === 'Blocked') return 'Your account is blocked. Please contact your DMI branch.';
  if (st.Status === 'Pending') return 'Your application is waiting for approval.';
  if (expired_(st.Expiry)) return 'Your access has expired. Please contact your DMI branch to renew.';
  return '';
}

function saveResult_(st, p) {
  var score = Number(p.score), max = Number(p.max);
  if (!isFinite(score) || !isFinite(max) || max <= 0 || max > 1000 || score < 0 || score > max) return bad_('Invalid score.');
  var skill = clean_(p.skill), test = clean_(p.test);
  if (!skill || !test) return bad_('Missing test name.');
  sheet_('Results').appendRow(rowFor_('Results', { ID: 'R' + Date.now().toString(36).toUpperCase(), Time: new Date(),
    StudentID: st.ID, Name: st.Name, RegNo: st.RegNo, Branch: st.Branch, Skill: skill, Level: clean_(p.level),
    Test: test, Score: score, Max: max, Percent: Math.round(score / max * 100), Minutes: Number(p.minutes) || 0,
    Detail: clean_(String(p.detail || '').slice(0, 3000)) }));
  return { ok: true };
}

function myResults_(st) {
  var r = read_('Results').filter(function (x) { return x.StudentID === st.ID; }).map(function (x) {
    return { time: x.Time, skill: x.Skill, level: x.Level, test: x.Test, score: x.Score, max: x.Max, percent: x.Percent };
  });
  var w = read_('Writing').filter(function (x) { return x.StudentID === st.ID; }).map(function (x) {
    return { time: x.Time, level: x.Level, taskId: x.TaskID, task: x.Task, words: x.Words, aiBand: x.AIBand,
             aiFeedback: x.AIFeedback, mark: x.TeacherMark, comment: x.TeacherComment };
  });
  return { ok: true, results: r, writing: w };
}

function submitWriting_(st, p) {
  var text = String(p.text || '').slice(0, 6000), words = (text.trim().match(/\S+/g) || []).length;
  if (words < 10) return bad_('Please write at least a few sentences.');
  var ai = { band: '', feedback: '' };
  if (p.wantAI) {
    var cache = CacheService.getScriptCache(), k = 'ai_' + st.ID + '_' + Utilities.formatDate(new Date(), 'Asia/Colombo', 'yyyyMMdd');
    var used = Number(cache.get(k) || 0);
    if (used >= AI_PER_DAY) ai.feedback = JSON.stringify({ note: 'Daily AI limit reached. Your teacher will still mark this.' });
    else {
      cache.put(k, String(used + 1), 21600);
      var r = gemini_(writingPrompt_(clean_(p.level), String(p.prompt || '').slice(0, 800), text));
      if (r.ok) {
        var j = parseJson_(r.text);
        if (j) { ai.band = clean_(j.estimatedBand || ''); ai.feedback = JSON.stringify(j).slice(0, 45000); }
      }
      if (!ai.feedback) ai.feedback = JSON.stringify({ note: 'AI feedback is not available right now. Your teacher will mark this.' });
    }
  }
  sheet_('Writing').appendRow(rowFor_('Writing', { ID: 'W' + Date.now().toString(36).toUpperCase(), Time: new Date(),
    StudentID: st.ID, Name: st.Name, RegNo: st.RegNo, Branch: st.Branch, Level: clean_(p.level), TaskID: clean_(p.taskId),
    Task: clean_(p.task), Words: words, Text: clean_(text), AIBand: ai.band, AIFeedback: ai.feedback }));
  return { ok: true, aiBand: ai.band, aiFeedback: ai.feedback };
}

function changePassword_(st, p) {
  if (!same_(hash_(String(p.oldPassword || ''), st.Salt), st.Hash)) return bad_('Your current password is wrong.');
  if (String(p.newPassword || '').length < 6) return bad_('New password must have at least 6 characters.');
  var salt = random_(16);
  setRow_('Students', st._row, { Salt: salt, Hash: hash_(String(p.newPassword), salt) });
  return { ok: true };
}

// ---------------- admin ----------------
function adminLogin_(p) {
  var email = lower_(p.email), a = read_('Admins').filter(function (r) { return lower_(r.Email) === email && r.Active === 'Yes'; })[0];
  if (!a || !same_(hash_(String(p.password || ''), a.Salt), a.Hash)) return bad_('Email or password is wrong.');
  return { ok: true, token: newSession_('admin', email, ADMIN_SESSION_HOURS), user: { name: a.Name, email: a.Email } };
}

function approve_(p, admin) {
  var st = student_(p.id); if (!st) return bad_('Student not found.');
  var days = Math.min(366, Math.max(1, Number(p.days) || ACCESS_DAYS));
  setRow_('Students', st._row, { Status: 'Active', ApprovedOn: new Date(), Expiry: addDays_(new Date(), days),
    ApprovedBy: admin.Name || admin.Email, RegNo: p.regNo != null ? clean_(p.regNo).toUpperCase() : st.RegNo,
    Note: p.note != null ? clean_(p.note) : st.Note });
  return { ok: true };
}

function renew_(p, admin) {
  var st = student_(p.id); if (!st) return bad_('Student not found.');
  var days = Math.min(366, Math.max(1, Number(p.days) || ACCESS_DAYS));
  var base = (st.Expiry && !expired_(st.Expiry)) ? new Date(st.Expiry) : new Date();
  setRow_('Students', st._row, { Status: 'Active', Expiry: addDays_(base, days), ApprovedBy: admin.Name || admin.Email });
  return { ok: true };
}

function setStatus_(p, status, admin) {
  var st = student_(p.id); if (!st) return bad_('Student not found.');
  setRow_('Students', st._row, { Status: status, ApprovedBy: admin.Name || admin.Email, Note: p.note != null ? clean_(p.note) : st.Note });
  if (status !== 'Active') endUserSessions_(st.ID);
  return { ok: true };
}

function resetPassword_(p) {
  var st = student_(p.id); if (!st) return bad_('Student not found.');
  var pw = String(Math.floor(100000 + Math.random() * 900000)), salt = random_(16);
  setRow_('Students', st._row, { Salt: salt, Hash: hash_(pw, salt) });
  endUserSessions_(st.ID);
  return { ok: true, password: pw };
}

function markWriting_(p, admin) {
  var w = read_('Writing').filter(function (r) { return r.ID === p.id; })[0];
  if (!w) return bad_('Writing not found.');
  setRow_('Writing', w._row, { TeacherMark: clean_(p.mark), TeacherComment: clean_(String(p.comment || '').slice(0, 2000)),
    MarkedBy: admin.Name || admin.Email });
  return { ok: true };
}

// ---------------- AI (key stays in Script Properties) ----------------
function writingPrompt_(level, task, text) {
  return 'You are a kind, careful Cambridge ESOL / IELTS examiner marking a Sri Lankan learner\'s English writing for DMI Computer Education.\n' +
    'Target CEFR level: ' + level + '\nTask: "' + task + '"\nStudent writing:\n"""\n' + text + '\n"""\n' +
    'Return ONLY valid JSON with this shape: {"estimatedBand":"Band 4.5","cefrLevel":"' + level + '",' +
    '"taskAchievement":"one or two sentences","strengths":["..."],' +
    '"corrections":[{"original":"...","corrected":"...","rule":"short reason"}],' +
    '"vocabularyTips":[{"word":"...","insteadOf":"...","example":"..."}],' +
    '"teacherAdvice":"two encouraging sentences"}. Give 2-4 corrections taken from the student\'s own text.';
}

function gemini_(prompt) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'GEMINI_API_KEY is not set in Script properties.' };
  var model = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  try {
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } })
    });
    var j = JSON.parse(res.getContentText());
    if (res.getResponseCode() !== 200) return { ok: false, error: (j.error && j.error.message) || ('HTTP ' + res.getResponseCode()) };
    var t = j.candidates && j.candidates[0] && j.candidates[0].content.parts.map(function (x) { return x.text || ''; }).join('');
    return t ? { ok: true, text: t } : { ok: false, error: 'Empty AI reply' };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function parseJson_(t) {
  try { return JSON.parse(String(t).replace(/```json|```/gi, '').trim()); } catch (e) { return null; }
}

// ---------------- sessions ----------------
function newSession_(role, key, hours) {
  var token = random_(32);
  sheet_('Sessions').appendRow([hash_(token, 'session', 1), role, key, new Date(Date.now() + hours * 3600000)]);
  if (Math.random() < 0.05) pruneSessions_();
  return token;
}

function session_(token) {
  if (!token || String(token).length < 20) return null;
  var h = hash_(String(token), 'session', 1);
  var r = read_('Sessions').filter(function (x) { return x.TokenHash === h; })[0];
  if (!r || new Date(r.Expires) < new Date()) return null;
  return { role: r.Role, key: r.UserKey };
}

function endSession_(token) {
  if (!token) return;
  var h = hash_(String(token), 'session', 1);
  read_('Sessions').filter(function (x) { return x.TokenHash === h; }).reverse()
    .forEach(function (x) { sheet_('Sessions').deleteRow(x._row); });
}

function endUserSessions_(key) {
  read_('Sessions').filter(function (x) { return x.UserKey === key; }).reverse()
    .forEach(function (x) { sheet_('Sessions').deleteRow(x._row); });
}

function pruneSessions_() {
  var now = new Date();
  read_('Sessions').filter(function (x) { return new Date(x.Expires) < now; }).reverse()
    .forEach(function (x) { sheet_('Sessions').deleteRow(x._row); });
}

// ---------------- helpers ----------------
function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Missing tab ' + name + ' – run DMI Hub → Set up the sheet tabs');
  return sh;
}
function read_(name) {
  var v = sheet_(name).getDataRange().getValues(), head = v.shift() || [];
  return v.map(function (r, i) { var o = { _row: i + 2 }; head.forEach(function (h, j) { o[h] = r[j]; }); return o; });
}
function rowFor_(name, obj) { return TABS[name].map(function (h) { return obj[h] == null ? '' : obj[h]; }); }
function setRow_(name, row, fields) {
  var sh = sheet_(name), head = TABS[name];
  Object.keys(fields).forEach(function (k) { var c = head.indexOf(k); if (c >= 0) sh.getRange(row, c + 1).setValue(fields[k]); });
}
function student_(id) { return read_('Students').filter(function (r) { return r.ID === id; })[0]; }
function publicStudent_(r) {
  return { id: r.ID, name: r.Name, mobile: mobile_(r.Mobile), email: r.Email, regNo: r.RegNo, branch: r.Branch,
           course: r.Course, expiry: r.Expiry };
}
function adminStudent_(r) {
  var o = stripRow_(r); delete o.Salt; delete o.Hash; o.Mobile = mobile_(r.Mobile);
  o.State = r.Status === 'Active' && expired_(r.Expiry) ? 'Expired' : r.Status; return o;
}
function stripRow_(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o; }
function mobile_(m) {
  var d = String(m || '').replace(/\D/g, '');
  if (d.length === 11 && d.indexOf('94') === 0) d = '0' + d.slice(2);
  if (d.length === 9) d = '0' + d;
  return /^0\d{9}$/.test(d) ? d : '';
}
function lower_(s) { return String(s || '').trim().toLowerCase(); }
function clean_(s) { s = String(s == null ? '' : s).trim().slice(0, 6000); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function expired_(d) { return !d || new Date(d).getTime() < Date.now(); }
function addDays_(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); x.setHours(23, 59, 0, 0); return x; }
function random_(n) { var s = ''; while (s.length < n * 2) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, n * 2); }
function hash_(pw, salt, rounds) {
  var v = salt + '|' + pw;
  for (var i = 0; i < (rounds || HASH_ROUNDS); i++) {
    v = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v + salt, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  return v;
}
function same_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function bad_(msg) { return { ok: false, error: msg }; }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
