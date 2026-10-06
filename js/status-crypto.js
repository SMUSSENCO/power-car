/* Общие функции шифрования для страницы статуса (status.html) и локальной админки заказов.
   AES-GCM через WebCrypto. Ключ клиента живёт только во фрагменте ссылки (#id.ключ) и на сервер не уходит. */
(function (g) {
  'use strict';
  var enc = new TextEncoder(), dec = new TextDecoder();

  function toB64u(buf) {
    var s = ''; new Uint8Array(buf).forEach(function (x) { s += String.fromCharCode(x); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64u(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function aesKey(raw, usage) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [usage]); }

  async function seal(keyBytes, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, await aesKey(keyBytes, 'encrypt'), enc.encode(JSON.stringify(obj)));
    return { v: 1, iv: toB64u(iv), ct: toB64u(ct) };
  }
  async function open(keyBytes, box) {
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(box.iv) }, await aesKey(keyBytes, 'decrypt'), fromB64u(box.ct));
    return JSON.parse(dec.decode(pt));
  }
  // ключ команды из общего пароля (PBKDF2, 600 000 итераций)
  async function teamKey(pass, saltB64u) {
    var base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64u(saltB64u), iterations: 600000, hash: 'SHA-256' }, base, 256);
    return new Uint8Array(bits);
  }
  function randomKey() { return crypto.getRandomValues(new Uint8Array(16)); }
  function randomId() {
    var a = crypto.getRandomValues(new Uint8Array(12)), s = '';
    a.forEach(function (x) { s += ('0' + x.toString(16)).slice(-2); });
    return s;
  }

  g.StatusCrypto = { toB64u: toB64u, fromB64u: fromB64u, seal: seal, open: open, teamKey: teamKey, randomKey: randomKey, randomId: randomId };
})(window);
