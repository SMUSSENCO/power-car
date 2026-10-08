/* Кабинет клиента POWER Car. Данные приходят зашифрованными; ключ — во фрагменте ссылки (#id.ключ) и на сервер не уходит. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var DAY = 86400000;
  var MAX_URL = 'https://max.ru/u/f9LHodD0cOI15ISW65cZM-troopdVYCICi0eYXIWSilu6SCKonmcc0CqZZM';
  var TG_URL = 'https://t.me/PowerCar_msk';
  var BODY = { crossover: 'кроссовер', sedan: 'седан', hatchback: 'хэтчбек', suv: 'внедорожник', minivan: 'минивэн', wagon: 'универсал', coupe: 'купе' };
  var DRIVE = { fwd: 'передний привод', rwd: 'задний привод', awd: 'полный привод' };
  var WHEEL = { left: 'левый руль', right: 'правый руль' };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); });
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
    app.replaceChildren(el('div', { 'class': 'msg' }, [el('h2', { text: title }), el('p', { text: text }),
      el('a', { 'class': 'btn', href: 'tel:+79138533305', text: 'Позвонить в POWER Car' })]));
  }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmt(d) { return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }
  function fmtFull(d) { return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function rub(n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; }
  function daysWord(n) { var m = n % 100, k = n % 10; return (m > 10 && m < 15) ? 'дней' : k === 1 ? 'день' : (k > 1 && k < 5) ? 'дня' : 'дней'; }
  function safeImg(p) { return typeof p === 'string' && /^images\/[\w\-./%]+$/.test(p) ? '/' + p : null; }
  function safeUrl(p) { return typeof p === 'string' && /^\/auto\/[\w\-.]+\.html$/.test(p) ? p : null; }
  function toast(t) {
    var n = document.getElementById('toast');
    if (!n) { n = el('div', { id: 'toast', 'class': 'toast' }); document.body.appendChild(n); }
    n.textContent = t; n.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { n.classList.remove('show'); }, 3200);
  }

  // проекция широта/долгота → схема (восток справа, как на карте)
  function proj(lon, lat) { return [40 + (lon - 28) * 6, 30 + (62 - lat) * 7.06]; }

  async function main() {
    var h = (location.hash || '').replace(/^#/, '').split('.');
    if (h.length !== 2 || !/^[0-9a-f]{24}$/.test(h[0]) || !/^[A-Za-z0-9_-]{22}$/.test(h[1])) {
      return fail('Нужна полная ссылка', 'Откройте ссылку на кабинет целиком — ту, что прислал менеджер. Если не получается, позвоните нам.');
    }
    var cfg, box;
    try {
      var r = await Promise.all([fetch('/data/status-config.json', { cache: 'no-store' }), fetch('/data/status/' + h[0] + '.json?t=' + Date.now(), { cache: 'no-store' })]);
      if (!r[1].ok) return fail('Ссылка недействительна', 'Возможно, ссылка была заменена. Свяжитесь с менеджером — он пришлёт новую.');
      cfg = await r[0].json(); box = await r[1].json();
    } catch (e) { return fail('Не удалось загрузить', 'Проверьте интернет и обновите страницу.'); }
    var data;
    try { data = await StatusCrypto.open(StatusCrypto.fromB64u(h[1]), box); }
    catch (e) { return fail('Ссылка повреждена', 'Скопируйте ссылку полностью или запросите новую у менеджера.'); }
    render(cfg, StatusModel.normalizeCabinet(data));
  }

  // ---------- кабинет ----------
  function render(cfg, cab) {
    var orders = cab.orders || [];
    var head = el('div', { 'class': 'cab-head' }, [
      el('div', { 'class': 'eyebrow', text: 'Ваш кабинет POWER Car' }),
      el('div', { 'class': 'meta', text: 'Здесь сохраняются все ваши заказы: подборы автомобилей, их описания и этапы доставки.' })
    ]);
    var tabs = el('div', { 'class': 'tabs', role: 'tablist' });
    var body = el('div', { id: 'orderBody' });
    function show(i) {
      Array.prototype.forEach.call(tabs.children, function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      body.replaceChildren(renderOrder(cfg, cab, orders[i], i));
    }
    // по умолчанию — последний незавершённый заказ
    var def = orders.length - 1;
    for (var k = orders.length - 1; k >= 0; k--) { if (!orderFinished(cfg, orders[k])) { def = k; break; } }
    if (orders.length > 1) {
      orders.forEach(function (o, i) {
        var b = el('button', { type: 'button', role: 'tab', 'class': 'tab', text: 'Заказ ' + (i + 1) + ' · ' + shorten(StatusModel.orderTitle(o), 26) });
        b.addEventListener('click', function () { show(i); });
        tabs.appendChild(b);
      });
    }
    var more = el('div', { 'class': 'more-order' }, [
      el('span', { text: 'Хотите оформить ещё один заказ?' }),
      el('a', { 'class': 'btn', href: TG_URL + '?text=' + encodeURIComponent('Здравствуйте! Хочу оформить ещё один заказ (я клиент POWER Car, у меня есть кабинет).'), target: '_blank', rel: 'noopener', text: 'Написать менеджеру' })
    ]);
    var foot = el('div', { 'class': 'foot', text: 'Обновлено ' + (cab.upd ? fmtFull(new Date(cab.upd)) : '') + '. Сроки ориентировочные и могут меняться из-за погоды, очередей на таможне и логистики. Вопросы — +7 913 853-33-05.' });
    app.replaceChildren(head, orders.length > 1 ? tabs : null, body, more, foot);
    show(Math.max(0, def));
    window.addEventListener('hashchange', function () { location.reload(); });
  }
  function shorten(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function stageDone(order) { var d = {}; (order.stages || []).forEach(function (s) { if (s.at) d[s.k] = s; }); return d; }
  function orderFinished(cfg, order) { var d = stageDone(order); return cfg.stages.every(function (s) { return d[s.k]; }); }

  // ---------- заказ ----------
  function renderOrder(cfg, cab, order) {
    var wrap = el('div', {});
    var chosen = order.chosen != null ? order.offers[order.chosen] : null;
    if (!chosen) {
      wrap.appendChild(el('div', { 'class': 'card sel-head' }, [
        el('div', { 'class': 'eyebrow', text: 'Подбор автомобиля' }),
        el('h1', { text: order.offers.length ? 'Автомобили, которые мы вам предложили' : 'Подбираем автомобили под вас' }),
        el('div', { 'class': 'meta', text: 'Доставка в ' + order.city.name + (order.offers.length ? ' · вариантов: ' + order.offers.length : '') }),
        el('p', { 'class': 'hint', text: order.offers.length
          ? 'Откройте карточку, чтобы увидеть полное описание. Понравился вариант — нажмите «Выбрать этот вариант» и отправьте нам сообщение: мы согласуем условия.'
          : 'Менеджер скоро добавит сюда варианты с описанием и стоимостью под ключ. Все они останутся в этом кабинете.' })
      ]));
      if (order.offers.length) wrap.appendChild(offersList(order, true));
      wrap.appendChild(stagesCard(cfg, order, null));
      return wrap;
    }
    wrap.appendChild(heroOf(chosen, order, cfg));
    var est = estimate(cfg, order);
    wrap.appendChild(summaryOf(est));
    var country = order.country || chosen.snap.country;
    if (country && cfg.origins[country]) wrap.appendChild(mapOf(cfg, order, est, country));
    wrap.appendChild(stagesCard(cfg, order, est));
    if (order.offers.length > 1) {
      var det = el('details', { 'class': 'card offers-fold' }, [el('summary', { text: 'Все варианты подбора (' + order.offers.length + ')' })]);
      det.appendChild(offersList(order, false));
      wrap.appendChild(det);
    }
    return wrap;
  }

  function heroOf(chosen, order, cfg) {
    var s = chosen.snap, hero = el('div', { 'class': 'hero' });
    var src = safeImg(s.photos && s.photos[0]);
    if (src) hero.appendChild(el('img', { src: src, alt: s.title }));
    var og = cfg.origins[order.country || s.country];
    hero.appendChild(el('div', {}, [
      el('div', { 'class': 'eyebrow', text: 'Ваш заказ' }),
      el('h1', { text: s.title }),
      el('div', { 'class': 'meta', text: (og ? og.flag + ' ' + (order.originCity ? order.originCity.name + ', ' : '') + og.name + ' → ' : '') + order.city.name })
    ]));
    return hero;
  }

  // оценка срока и положение на маршруте
  function estimate(cfg, order) {
    var country = order.country || (order.offers[order.chosen] && order.offers[order.chosen].snap.country) || 'Japan';
    var avg = cfg.avgDays[country] || cfg.avgDays.Japan;
    var done = stageDone(order), stages = cfg.stages;
    var daysFor = function (k) { return (k === 'home' && typeof order.daysToCity === 'number') ? order.daysToCity : (avg[k] || 0); };
    var cur = stages.findIndex(function (s) { return !done[s.k]; });
    var finished = cur === -1;
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var start = parseDate(order.created);
    if (!finished) for (var i = cur - 1; i >= 0; i--) if (done[stages[i].k] && done[stages[i].k].at) { start = parseDate(done[stages[i].k].at); break; }
    var elapsed = finished ? 0 : Math.max(0, (now - start) / DAY);
    var curAvg = finished ? 0 : daysFor(stages[cur].k);
    var frac = curAvg > 0 ? Math.min(0.95, elapsed / curAvg) : 0;
    var remaining = 0, total = 0, passed = 0;
    stages.forEach(function (s, idx) {
      var d = daysFor(s.k); total += d;
      if (finished || idx < cur) passed += d;
      else if (idx === cur) { passed += d * frac; remaining += Math.max(d - elapsed, 1); }
      else remaining += d;
    });
    var byManager = order.eta ? parseDate(order.eta) : null;
    return { cur: cur, curTitle: finished ? '' : stages[cur].title, finished: finished, frac: frac, daysFor: daysFor, done: done, country: country,
      pct: finished ? 100 : Math.round(100 * passed / (total || 1)),
      eta: byManager || new Date(now.getTime() + Math.ceil(remaining) * DAY), etaByManager: !!byManager, now: now };
  }

  function summaryOf(est) {
    var sum = el('div', { 'class': 'card' }), row = el('div', { 'class': 'eta' });
    if (est.finished) {
      row.appendChild(el('div', {}, [el('div', { 'class': 'lbl', text: 'Заказ завершён' }), el('div', { 'class': 'big', text: 'Автомобиль выдан' })]));
    } else {
      row.appendChild(el('div', {}, [el('div', { 'class': 'lbl', text: est.etaByManager ? 'Дата выдачи (согласована)' : 'Ориентировочная выдача' }), el('div', { 'class': 'big', text: (est.etaByManager ? '' : '≈ ') + fmt(est.eta) })]));
      row.appendChild(el('div', {}, [el('div', { 'class': 'lbl', text: 'Сейчас' }), el('div', { 'class': 'big', id: 'curStage', text: est.curTitle || '' })]));
    }
    sum.appendChild(row);
    var fill = el('i'); sum.appendChild(el('div', { 'class': 'bar' }, [fill]));
    setTimeout(function () { fill.style.width = est.pct + '%'; }, 80);
    sum._est = est;
    return sum;
  }

  function mapOf(cfg, order, est, country) {
    var card = el('div', { 'class': 'card' });
    var s = svg('svg', { 'class': 'map', viewBox: '0 30 800 240', role: 'img', 'aria-label': 'Схема маршрута автомобиля' });
    for (var lon = 40; lon <= 140; lon += 20) { var x = proj(lon, 40)[0]; s.appendChild(svg('line', { x1: x, y1: 20, x2: x, y2: 285, 'class': 'grat' })); }
    for (var lat = 35; lat <= 60; lat += 5) { var y = proj(100, lat)[1]; s.appendChild(svg('line', { x1: 30, y1: y, x2: 770, y2: y, 'class': 'grat' })); }
    var og = cfg.origins[country];
    var oc = order.originCity, P0 = proj(oc ? oc.lon : og.lon, oc ? oc.lat : og.lat), P1 = proj(cfg.hub.lon, cfg.hub.lat), P2 = proj(order.city.lon, order.city.lat);
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
    var kCur = est.finished ? 'handed' : cfg.stages[est.cur].k, target;
    if (est.finished || kCur === 'handed') target = L1 + L2;
    else if (kCur === 'home') target = L1 + L2 * est.frac;
    else if (kCur === 'customs') target = L1;
    else if (kCur === 'transit') target = L1 * est.frac;
    else target = 0;
    var g1 = svg('path', { d: d1, 'class': 'done' }), g2 = d2 ? svg('path', { d: d2, 'class': 'done' }) : null;
    g1.style.strokeDasharray = L1; g1.style.strokeDashoffset = L1; s.appendChild(g1);
    if (g2) { g2.style.strokeDasharray = L2; g2.style.strokeDashoffset = L2; s.appendChild(g2); }
    function node(p, label, strong, above) {
      s.appendChild(svg('circle', { cx: p[0], cy: p[1], r: 7, fill: '#0A0A0A', stroke: strong ? '#10B981' : 'rgba(255,255,255,.5)', 'stroke-width': 3 }));
      s.appendChild(svg('text', { x: p[0], y: above ? p[1] - 16 : p[1] + 34, 'text-anchor': 'middle', 'class': strong ? 'city' : '' }, label));
    }
    node(P0, og.flag + ' ' + (oc ? oc.name : og.port), true, false);
    node(P1, cfg.hub.name, false, true);
    if (!sameHub) node(P2, order.city.name, true, false);
    var mk = svg('g', {});
    mk.appendChild(svg('circle', { r: 16, 'class': 'pulse' }));
    mk.appendChild(svg('circle', { r: 13, fill: '#10B981', stroke: '#04130d', 'stroke-width': 3 }));
    mk.appendChild(svg('path', { d: 'M-7 3 L-7 -1 L-4 -5 L4 -5 L7 -1 L7 3 Z M-5 3 a1.8 1.8 0 1 0 .01 0 M5 3 a1.8 1.8 0 1 0 .01 0', fill: '#04130d', transform: 'translate(0,0.5)' }));
    s.appendChild(mk);
    function place(dist) {
      var p;
      if (dist <= L1 || !rest2) { p = rest1.getPointAtLength(Math.min(dist, L1)); g1.style.strokeDashoffset = L1 - Math.min(dist, L1); }
      else { p = rest2.getPointAtLength(Math.min(dist - L1, L2)); g1.style.strokeDashoffset = 0; if (g2) g2.style.strokeDashoffset = L2 - Math.min(dist - L1, L2); }
      mk.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
    }
    place(0);
    var t0 = performance.now(), dur = target > 0 ? 2200 : 1;
    (function step(t) { var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); place(target * e); if (k < 1) requestAnimationFrame(step); })(t0);
    card.appendChild(s);
    card.appendChild(el('div', { 'class': 'note-map', text: 'Схема маршрута, положение автомобиля примерное — рассчитано по этапу и средним срокам.' }));
    return card;
  }

  function stagesCard(cfg, order, est) {
    var done = stageDone(order), stages = cfg.stages;
    var cur = stages.findIndex(function (s) { return !done[s.k]; });
    var avgCountry = order.country || (order.offers[order.chosen] && order.offers[order.chosen].snap.country) || null;
    var avg = (avgCountry && cfg.avgDays[avgCountry]) || null;
    var daysFor = function (k) { return avg ? ((k === 'home' && typeof order.daysToCity === 'number') ? order.daysToCity : (avg[k] || 0)) : 0; };
    var chosen = order.chosen != null ? order.offers[order.chosen] : null;
    var card = el('div', { 'class': 'card' }), ol = el('ol', { 'class': 'tl' });
    stages.forEach(function (st, idx) {
      var d = done[st.k], cls = d ? 'done' : (idx === cur ? 'now' : 'future');
      var li = el('li', { 'class': cls });
      li.appendChild(el('span', { 'class': 'dot', text: d ? '✓' : String(idx + 1) }));
      li.appendChild(el('h3', { text: st.title }));
      var descr = st.desc;
      if (st.k === 'selection' && d && chosen) descr = 'Выбран автомобиль: ' + chosen.snap.title;
      li.appendChild(el('div', { 'class': 'd', text: descr }));
      if (d) li.appendChild(el('div', { 'class': 'when', text: 'Завершено ' + fmtFull(parseDate(d.at)) }));
      else if (idx === cur && daysFor(st.k) > 0) { var n = Math.max(1, Math.round(daysFor(st.k))); li.appendChild(el('div', { 'class': 'when', text: 'Сейчас · обычно около ' + n + ' ' + daysWord(n) })); }
      else if (idx === cur) li.appendChild(el('div', { 'class': 'when', text: 'Сейчас' }));
      else if (daysFor(st.k) > 0) li.appendChild(el('div', { 'class': 'when', text: 'Обычно около ' + daysFor(st.k) + ' ' + daysWord(daysFor(st.k)) }));
      if (st.k === 'handed' && order.eta && !d) li.appendChild(el('div', { 'class': 'when', text: 'Дата выдачи: ' + fmtFull(parseDate(order.eta)) }));
      var note = (order.stages || []).filter(function (x) { return x.k === st.k && x.note; })[0];
      if (note) li.appendChild(el('div', { 'class': 'pub', text: note.note }));
      ol.appendChild(li);
    });
    card.appendChild(ol);
    return card;
  }

  // ---------- карточки предложенных автомобилей ----------
  function offersList(order, selectable) {
    var box = el('div', { 'class': 'offers' });
    order.offers.forEach(function (of, i) { box.appendChild(offerCard(of, order, i, selectable)); });
    return box;
  }

  function offerCard(of, order, i, selectable) {
    var s = of.snap, isChosen = order.chosen === i;
    var card = el('article', { 'class': 'offer' + (isChosen ? ' chosen' : '') });
    var src = safeImg(s.photos && s.photos[0]);
    card.appendChild(src ? el('img', { 'class': 'offer-img', src: src, alt: s.title, loading: 'lazy' }) : el('div', { 'class': 'offer-img ph', text: 'POWER Car' }));
    var info = el('div', { 'class': 'offer-info' });
    info.appendChild(el('h3', { text: (s.flag ? s.flag + ' ' : '') + s.title }));
    if (isChosen) info.appendChild(el('span', { 'class': 'badge', text: 'Выбран вами' }));
    if (s.price) info.appendChild(el('div', { 'class': 'price', text: rub(s.price) + ' под ключ' }));
    var chips = [];
    if (s.trim) chips.push(s.trim);
    if (s.mileage != null && s.mileage !== '') chips.push(Number(s.mileage).toLocaleString('ru-RU') + ' км');
    if (s.engine) chips.push(String(s.engine) + (s.power ? ', ' + s.power + ' л.с.' : ''));
    if (s.transmission) chips.push(s.transmission);
    if (s.drive && DRIVE[s.drive]) chips.push(DRIVE[s.drive]);
    if (s.body && BODY[s.body]) chips.push(BODY[s.body]);
    if (s.wheel && WHEEL[s.wheel]) chips.push(WHEEL[s.wheel]);
    if (s.color) chips.push(s.color);
    if (chips.length) info.appendChild(el('div', { 'class': 'chips' }, chips.map(function (c) { return el('span', { text: c }); })));
    if (of.note) info.appendChild(el('div', { 'class': 'pub', text: of.note }));
    card.appendChild(info);

    var det = el('details', { 'class': 'offer-more' }, [el('summary', { text: 'Подробнее' })]);
    var inner = el('div', { 'class': 'offer-detail' });
    var photos = (s.photos || []).map(safeImg).filter(Boolean).slice(1);
    if (photos.length) inner.appendChild(el('div', { 'class': 'thumbs' }, photos.map(function (p) { return el('img', { src: p, alt: s.title, loading: 'lazy' }); })));
    (s.description || '').split(/\n+/).filter(Boolean).forEach(function (p) { inner.appendChild(el('p', { text: p })); });
    if (s.equipment && s.equipment.length) inner.appendChild(el('ul', { 'class': 'eq' }, s.equipment.map(function (x) { return el('li', { text: x }); })));
    var url = safeUrl(s.url);
    if (url) inner.appendChild(el('a', { 'class': 'lnk', href: url, target: '_blank', rel: 'noopener', text: 'Страница автомобиля на сайте →' }));
    if (!s.description && !(s.equipment && s.equipment.length) && !photos.length && !url) inner.appendChild(el('p', { 'class': 'hint', text: 'Подробности по этому варианту уточните у менеджера.' }));
    det.appendChild(inner);
    card.appendChild(det);

    if (selectable) {
      var txt = 'Здравствуйте! Выбираю вариант: ' + s.title + (s.price ? ' (' + rub(s.price) + ' под ключ)' : '') + '. Город доставки: ' + order.city.name + '.';
      var act = el('div', { 'class': 'offer-act' });
      var max = el('a', { 'class': 'btn btn-max', href: MAX_URL, target: '_blank', rel: 'noopener', text: 'Выбрать этот вариант — MAX' });
      max.addEventListener('click', function () { try { navigator.clipboard.writeText(txt); toast('Текст скопирован — вставьте его в чат MAX'); } catch (e) { /* нет доступа к буферу */ } });
      act.appendChild(max);
      act.appendChild(el('a', { 'class': 'btn btn-tg', href: TG_URL + '?text=' + encodeURIComponent(txt), target: '_blank', rel: 'noopener', text: 'Telegram' }));
      card.appendChild(act);
    }
    return card;
  }

  main();
})();
