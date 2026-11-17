// Talks to the Apps Script backend.
(function () {
  var C = window.DMI_CONFIG, KEY = 'dmi_de_token', UKEY = 'dmi_de_user';
  function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  window.DMI_API = {
    ready: function () { return !!C.API_URL; },
    token: token,
    user: function () { try { return JSON.parse(localStorage.getItem(UKEY) || 'null'); } catch (e) { return null; } },
    setSession: function (t, u) { try { localStorage.setItem(KEY, t); localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) {} },
    setUser: function (u) { try { localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(KEY); localStorage.removeItem(UKEY); } catch (e) {} },
    call: function (action, data) {
      if (!C.API_URL) return Promise.resolve({ ok: false, error: 'The hub is not connected yet. Please contact DMI.' });
      var body = Object.assign({}, data || {}, { action: action, token: token() });
      return fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .catch(function () { return { ok: false, error: 'No connection. Please check your internet and try again.' }; });
    }
  };
})();
