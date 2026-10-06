/* Страница статуса заказа. Данные приходят зашифрованными; ключ — во фрагменте ссылки (#id.ключ). */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var DAY = 86400000;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function svg(tag, attrs, text) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }
  function fail(title, text) {
    app.replaceChildren(el('div', { 'class': 'msg' }, [
      el('h2', { text: title }), el('p', { text: text }),
      el('a', { 'class': 'btn', href: 'tel:+79138533305', text: 'Позвонить в POWER Car' })
    ]));
  }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(d) { return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }
  function fmtFull(d) { return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function daysWord(n) { var m = n % 100, k = n % 10; return (m > 10 && m < 15) ? 'дней' : k === 1 ? 'день' : (k > 1 && k < 5) ? 'дня' : 'дней'; }

  // --- проекция: долгота/широта → координаты схемы 800×300 (восток справа, как на карте)
  function proj(lon, lat) { return [40 + (lon - 28) * 6, 30 + (62 - lat) * 7.06]; }

  async function main() {
    var h = (location.hash || '').replace(/^#/, '').split('.');
    if (h.length !== 2 || !/^[0-9a-f]{24}$/.test(h[0]) || !/^[A-Za-z0-9_-]{22}$/.test(h[1])) {
      return fail('Нужна полная ссылка', 'Откройте ссылку на статус целиком — ту, что прислал менеджер. Если не получается, позвоните нам.');
    }
    var cfg, box;
    try {
      var r = await Promise.all([
        fetch('/data/status-config.json', { cache: 'no-store' }),
        fetch('/data/status/' + h[0] + '.json?t=' + Date.now(), { cache: 'no-store' })
      ]);
      if (!r[1].ok) return fail('Ссылка недействительна', 'Возможно, заказ уже завершён или ссылка была заменена. Свяжитесь с менеджером — он пришлёт новую.');
      cfg = await r[0].json(); box = await r[1].json();
    } catch (e) { return fail('Не удалось загрузить', 'Проверьте интернет и обновите страницу.'); }

    var o;
    try { o = await StatusCrypto.open(StatusCrypto.fromB64u(h[1]), box); }
    catch (e) { return fail('Ссылка повреждена', 'Скопируйте ссылку полностью или запросите новую у менеджера.'); }
    render(cfg, o);
  }

  function render(cfg, o) {
    var country = o.car.country, avg = (cfg.avgDays[country] || cfg.avgDays.Japan);
    var done = {}; (o.stages || []).forEach(function (s) { if (s.at) done[s.k] = s; });
    var created = parseDate(o.created), now = new Date(); now.setHours(0, 0, 0, 0);
    var stages = cfg.stages;
    var daysFor = function (k) { return (k === 'home' && typeof o.daysToCity === 'number') ? o.daysToCity : (avg[k] || 0); };
    var cur = stages.findIndex(function (s) { return !done[s.k]; }); // -1 = всё выполнено
    var finished = cur === -1;

    // начало текущего этапа = дата завершения предыдущего
    var start = created;
    if (!finished) for (var i = cur - 1; i >= 0; i--) if (done[stages[i].k]) { start = parseDate(done[stages[i].k].at); break; }
    var elapsed = finished ? 0 : Math.max(0, (now - start) / DAY);
    var curAvg = finished ? 0 : daysFor(stages[cur].k);
    var frac = curAvg > 0 ? Math.min(0.95, elapsed / curAvg) : 0;

    // оценка срока
    var remaining = 0, total = 0, passed = 0;
    stages.forEach(function (s, idx) {
      var d = daysFor(s.k); total += d;
      if (finished || idx < cur) passed += d;
      else if (idx === cur) { passed += d * frac; remaining += Math.max(d - elapsed, 1); }
      else remaining += d;
    });
    var pct = finished ? 100 : Math.round(100 * passed / (total || 1));
    var eta = new Date(now.getTime() + Math.ceil(remaining) * DAY);

    // --- шапка
    var hero = el('div', { 'class': 'hero' });
    if (o.car.photo && /^images\/[\w\-./]+$/.test(o.car.photo)) hero.appendChild(el('img', { src: '/' + o.car.photo, alt: o.car.title }));
    hero.appendChild(el('div', {}, [
      el('div', { 'class': 'eyebrow', text: 'Статус заказа' }),
      el('h1', { text: o.car.title }),
      el('div', { 'class': 'meta', text: (o.car.flag || '') + ' ' + (cfg.origins[country] ? cfg.origins[country].name : '') + ' → ' + o.city.name })
    ]));

    // --- сводка
    var sum = el('div', { 'class': 'card' });
    var row = el('div', { 'class': 'eta' });
    if (finished) {
      row.appendChild(el('div', {}, [el('div', { 'class': 'lbl', text: 'Заказ завершён' }), el('div', { 'class': 'big', text: 'Автомобиль выдан' })]));
    } else {
      row.appendChild(el('div', {}, [el('div', { 'class': 'lbl', text: 'Ориентировочная выдача' }), el('div', { 'class': 'big', text: '≈ ' + fmt(eta) })]));
      row.appendChild(el('div', {}, [el('div', { 'class': 'lbl', text: 'Сейчас' }), el('div', { 'class': 'big', text: stages[cur].title })]));
    }
    sum.appendChild(row);
    var barFill = el('i'); sum.appendChild(el('div', { 'class': 'bar' }, [barFill]));
    setTimeout(function () { barFill.style.width = pct + '%'; }, 80);

    // --- карта-схема
    var mapCard = el('div', { 'class': 'card' });
    var s = svg('svg', { 'class': 'map', viewBox: '0 30 800 240', role: 'img', 'aria-label': 'Схема маршрута автомобиля' });
    for (var lon = 40; lon <= 140; lon += 20) { var x = proj(lon, 40)[0]; s.appendChild(svg('line', { x1: x, y1: 20, x2: x, y2: 285, 'class': 'grat' })); }
    for (var lat = 35; lat <= 60; lat += 5) { var y = proj(100, lat)[1]; s.appendChild(svg('line', { x1: 30, y1: y, x2: 770, y2: y, 'class': 'grat' })); }

    var og = cfg.origins[country] || cfg.origins.Japan;
    var P0 = proj(og.lon, og.lat), P1 = proj(cfg.hub.lon, cfg.hub.lat), P2 = proj(o.city.lon, o.city.lat);
    var sameHub = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) < 12;
    function arc(a, b, lift) { var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - lift; return 'M' + a[0] + ' ' + a[1] + ' Q' + mx + ' ' + my + ' ' + b[0] + ' ' + b[1]; }
    var pts = sameHub ? [P0, P1] : [P0, P1, P2];
    var minX = Math.min.apply(null, pts.map(function (p) { return p[0]; })), maxX = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
    var minY = Math.min.apply(null, pts.map(function (p) { return p[1]; })) - 70, maxY = Math.max.apply(null, pts.map(function (p) { return p[1]; })) + 62;
    var vw = Math.max(380, maxX - minX + 150), vh = Math.max(200, maxY - minY), vx = (minX + maxX) / 2 - vw / 2, vy = (minY + maxY) / 2 - vh / 2;
    s.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
    s.style.setProperty('--fs', Math.max(19, vw / 20) + 'px');
    var d1 = arc(P0, P1, 34), d2 = sameHub ? null : arc(P1, P2, 46);
    var rest1 = svg('path', { d: d1, 'class': 'rest' }); s.appendChild(rest1);
    var rest2 = d2 ? svg('path', { d: d2, 'class': 'rest' }) : null; if (rest2) s.appendChild(rest2);
    var L1 = rest1.getTotalLength(), L2 = rest2 ? rest2.getTotalLength() : 0;

    // целевая позиция по пути (в длине)
    var idxK = finished ? stages.length : cur, kCur = finished ? 'handed' : stages[cur].k, target;
    if (finished || kCur === 'handed') target = L1 + L2;
    else if (kCur === 'home') target = L1 + L2 * frac;
    else if (kCur === 'customs') target = L1;
    else if (kCur === 'transit') target = L1 * frac;
    else target = 0;

    var g1 = svg('path', { d: d1, 'class': 'done' }), g2 = d2 ? svg('path', { d: d2, 'class': 'done' }) : null;
    g1.style.strokeDasharray = L1; g1.style.strokeDashoffset = L1; s.appendChild(g1);
    if (g2) { g2.style.strokeDasharray = L2; g2.style.strokeDashoffset = L2; s.appendChild(g2); }

    function node(p, label, strong, anchor, above) {
      s.appendChild(svg('circle', { cx: p[0], cy: p[1], r: 7, fill: '#0A0A0A', stroke: strong ? '#10B981' : 'rgba(255,255,255,.5)', 'stroke-width': 3 }));
      var t = svg('text', { x: p[0], y: above ? p[1] - 16 : p[1] + 34, 'text-anchor': anchor || 'middle', 'class': strong ? 'city' : '' }, label);
      s.appendChild(t);
    }
    node(P0, og.flag + ' ' + og.port, true, 'middle');
    node(P1, cfg.hub.name, false, 'middle', true);
    if (!sameHub) node(P2, o.city.name, true, 'middle');

    var mk = svg('g', {});
    var pulse = svg('circle', { r: 16, 'class': 'pulse' });
    var body = svg('circle', { r: 13, fill: '#10B981', stroke: '#04130d', 'stroke-width': 3 });
    var car = svg('path', { d: 'M-7 3 L-7 -1 L-4 -5 L4 -5 L7 -1 L7 3 Z M-5 3 a1.8 1.8 0 1 0 .01 0 M5 3 a1.8 1.8 0 1 0 .01 0', fill: '#04130d', transform: 'translate(0,0.5)' });
    mk.appendChild(pulse); mk.appendChild(body); mk.appendChild(car); s.appendChild(mk);
    function place(dist) {
      var p, q;
      if (dist <= L1 || !rest2) { p = rest1.getPointAtLength(Math.min(dist, L1)); g1.style.strokeDashoffset = L1 - Math.min(dist, L1); }
      else { p = rest2.getPointAtLength(Math.min(dist - L1, L2)); g1.style.strokeDashoffset = 0; if (g2) g2.style.strokeDashoffset = L2 - Math.min(dist - L1, L2); }
      mk.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
    }
    place(0);
    var t0 = performance.now(), dur = target > 0 ? 2200 : 1;
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      place(target * e); if (k < 1) requestAnimationFrame(step);
    })(t0);

    mapCard.appendChild(s);
    mapCard.appendChild(el('div', { 'class': 'note-map', text: 'Схема маршрута, положение автомобиля примерное — рассчитано по этапу и средним срокам.' }));

    // --- таймлайн
    var tlCard = el('div', { 'class': 'card' });
    var ol = el('ol', { 'class': 'tl' });
    stages.forEach(function (st, idx) {
      var d = done[st.k], cls = d ? 'done' : (idx === cur ? 'now' : 'future');
      var li = el('li', { 'class': cls });
      li.appendChild(el('span', { 'class': 'dot', text: d ? '✓' : String(idx + 1) }));
      li.appendChild(el('h3', { text: st.title }));
      li.appendChild(el('div', { 'class': 'd', text: st.desc }));
      if (d) li.appendChild(el('div', { 'class': 'when', text: 'Завершено ' + fmtFull(parseDate(d.at)) }));
      else if (idx === cur) li.appendChild(el('div', { 'class': 'when', text: 'Сейчас · обычно около ' + Math.max(1, Math.round(daysFor(st.k))) + ' ' + daysWord(Math.max(1, Math.round(daysFor(st.k)))) }));
      else if (daysFor(st.k) > 0) li.appendChild(el('div', { 'class': 'when', text: 'Обычно около ' + daysFor(st.k) + ' ' + daysWord(daysFor(st.k)) }));
      var note = (o.stages || []).filter(function (x) { return x.k === st.k && x.note; })[0];
      if (note) li.appendChild(el('div', { 'class': 'pub', text: note.note }));
      ol.appendChild(li);
    });
    tlCard.appendChild(ol);

    app.replaceChildren(hero, sum, mapCard, tlCard,
      el('div', { 'class': 'foot', text: 'Обновлено ' + (o.upd ? fmtFull(new Date(o.upd)) : '') + '. Срок ориентировочный и может меняться из-за погоды, очередей на таможне и логистики. Вопросы — +7 913 853-33-05.' }));
  }

  window.addEventListener('hashchange', function () { location.reload(); });
  main();
})();
