/* Общая модель кабинета клиента (страница status.html и локальная админка заказов).
   Кабинет = одна ссылка клиента. Внутри — заказы; у заказа: подбор (offers), выбранный вариант (chosen), этапы (stages). */
(function (g) {
  'use strict';

  var ORDER = ['selection', 'agreed', 'diag', 'bought', 'port', 'transit', 'customs', 'home', 'handed'];

  function slugOf(id) { return String(id).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function randomOid() {
    var a = crypto.getRandomValues(new Uint8Array(4)), s = '';
    a.forEach(function (x) { s += ('0' + x.toString(16)).slice(-2); });
    return s;
  }

  // Снимок автомобиля из каталога на момент предложения клиенту: цена и описание остаются теми, что видел клиент.
  function snapFromCar(c) {
    return {
      id: c.id, title: [c.brand, c.model, c.year].filter(Boolean).join(' '),
      flag: c.flag || '', country: c.country || null, price: c.price || null,
      year: c.year || null, mileage: c.mileage == null ? null : c.mileage, engine: c.engine || '', power: c.power || null,
      transmission: c.transmission || '', body: c.body || '', wheel: c.wheel || '', trim: c.trim || '', color: c.color || '', drive: c.drive || '',
      description: c.description || '', equipment: Array.isArray(c.equipment) ? c.equipment.slice(0, 20) : [],
      photos: Array.isArray(c.photos) ? c.photos.slice(0, 4) : [],
      url: '/auto/' + slugOf(c.id) + '.html'
    };
  }

  function emptyOrder(city, daysToCity) {
    return { oid: randomOid(), created: today(), country: null, originCity: null, city: city, daysToCity: daysToCity, eta: null, chosen: null, offers: [], stages: [] };
  }

  // Этапы идут строго по порядку: если отмечен более поздний, более ранние считаются пройденными той же датой.
  function fixStages(stages) {
    var by = {}; (stages || []).forEach(function (s) { by[s.k] = s; });
    var last = -1; ORDER.forEach(function (k, i) { if (by[k] && by[k].at) last = i; });
    var at = last >= 0 ? by[ORDER[last]].at : null;
    for (var i = last - 1; i >= 0; i--) {
      var s = by[ORDER[i]];
      if (!s) { s = { k: ORDER[i], at: at, note: '' }; stages.push(s); by[ORDER[i]] = s; }
      else if (!s.at) s.at = at;
    }
    return stages;
  }

  function fixOrder(o) {
    o.offers = o.offers || []; o.stages = o.stages || [];
    if (o.chosen != null && !o.offers[o.chosen]) o.chosen = null;
    if (o.eta === undefined) o.eta = null;
    if (o.country === undefined) o.country = null;
    if (o.originCity === undefined) o.originCity = null;
    fixStages(o.stages);
    return o;
  }

  // Приводит запись любой версии к виду кабинета v2. Версия 1 — один заказ с уже выбранным автомобилем.
  function normalizeCabinet(rec) {
    if (rec && rec.v === 2) { (rec.orders || []).forEach(fixOrder); return rec; }
    var car = rec.car || {};
    var order = {
      oid: 'o1', created: rec.created, country: car.country || null, originCity: null, city: rec.city, daysToCity: rec.daysToCity, eta: null, chosen: 0,
      offers: [{ snap: { title: car.title || 'Автомобиль', flag: car.flag || '', country: car.country || null, photos: car.photo ? [car.photo] : [] }, note: '', addedAt: rec.created }],
      stages: (rec.stages || []).map(function (s) { return { k: s.k, at: s.at || null, note: s.note || '' }; })
    };
    if (!order.stages.some(function (s) { return s.k === 'selection'; })) order.stages.push({ k: 'selection', at: rec.created, note: '' });
    fixOrder(order);
    return { v: 2, id: rec.id, key: rec.key, label: rec.label, created: rec.created, upd: rec.upd, orders: [order] };
  }

  function publicOf(cab) { return { v: 2, created: cab.created, upd: cab.upd, orders: cab.orders }; }
  function orderTitle(o) { return o.chosen != null && o.offers[o.chosen] ? o.offers[o.chosen].snap.title : 'Подбор автомобиля'; }

  g.StatusModel = { ORDER: ORDER, slugOf: slugOf, today: today, snapFromCar: snapFromCar, emptyOrder: emptyOrder, fixStages: fixStages, fixOrder: fixOrder,
    normalizeCabinet: normalizeCabinet, publicOf: publicOf, orderTitle: orderTitle };
})(window);
