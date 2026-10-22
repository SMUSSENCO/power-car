// Анимация карты маршрутов в hero: паромы (Сеул, Токио) и автовоз (Шанхай) идут во Владивосток,
// там появляются документы, ПТС, ГАИ и лайк, потом автовозы расходятся в Москву, Томск и Новосибирск,
// где вылетает лайк. Всё случайно и вперемешку. Работает только пока карта на экране.
(function () {
  var map = document.getElementById('routesMap');
  var fx = document.getElementById('routeFx');
  if (!map || !fx) return;
  var NS = 'http://www.w3.org/2000/svg';
  var IMG = 'images/route/';
  if (window.matchMedia && !window.matchMedia('(min-width: 768px)').matches) return;   // на телефонах карту и анимацию не показываем
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HUB = { x: 270, y: 210 };
  var BASE = 35;   // в исходных картинках нос смотрит под 35° вправо-вниз; при движении влево картинку зеркалим (нос тогда на 145°)

  function P(id) { var p = document.getElementById(id); return { el: p, len: p.getTotalLength() }; }
  // источник -> путь к хабу; тип транспорта: Китай автовозом, остальные паромом
  var IN = [
    { path: P('r1'), kind: 'ferry' },   // Сеул
    { path: P('r2'), kind: 'ferry' },   // Токио
    { path: P('r3'), kind: 'truck' }    // Шанхай
  ];
  var OUT = [
    { path: P('r4'), x: 70, y: 70 },   // Москва
    { path: P('r5'), x: 100, y: 240 },  // Томск
    { path: P('r6'), x: 70, y: 400 }   // Новосибирск
  ];
  var SIZE = { ferry: [54, 0.833], truck: [50, 0.893] };  // ширина, отношение высоты к ширине
  function img(name, w, ratio) {
    var im = document.createElementNS(NS, 'image');
    im.setAttribute('href', IMG + name + '.webp');
    im.setAttribute('width', w);
    im.setAttribute('height', w * ratio);
    im.style.opacity = '0';
    fx.appendChild(im);
    return im;
  }
  // sx/sy — масштаб по осям (для «дыхания» автовоза), rot — наклон вокруг центра
  function place(im, x, y, w, ratio, sx, rot, op, sy) {
    var h = w * ratio;
    im.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + (rot || 0).toFixed(2) + ') scale(' + sx.toFixed(3) + ' ' + (sy == null ? sx : sy).toFixed(3) + ') translate(' + (-w / 2) + ' ' + (-h / 2) + ')');
    im.style.opacity = op;
  }
  var ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  // Статичная картинка для prefers-reduced-motion: по одному транспорту на каждой линии, носом по курсу
  if (reduce) {
    var still = function (route, kind) {
      var q = route.el.getPointAtLength(route.len * 0.5), q2 = route.el.getPointAtLength(route.len * 0.5 + 4), s = SIZE[kind];
      var im = img(kind, s[0], s[1]), a = Math.atan2(q2.y - q.y, q2.x - q.x) * 180 / Math.PI;
      place(im, q.x, q.y, s[0], s[1], -0.9, a - (180 - BASE), 1, 0.9);
    };
    IN.forEach(function (r) { still(r.path, r.kind); });
    OUT.forEach(function (o) { still(o.path, 'truck'); });
    return;
  }

  var jobs = [];
  var nextSpawn = 0;

  function spawn(now) {
    var src = IN[Math.floor(Math.random() * IN.length)];
    var s = SIZE[src.kind];
    jobs.push({
      phase: 'in', t0: now, dur: rnd(5200, 7200), route: src.path, kind: src.kind,
      im: img(src.kind, s[0], s[1]), size: s, ph: rnd(0, 6.28), dx: rnd(-18, 18), dy: rnd(-62, -46)
    });
  }

  var HUBFX = [
    { name: 'icon-folder', w: 40, off: -38 },
    { name: 'icon-pts', w: 34, off: 0 },
    { name: 'icon-officer', w: 42, off: 38 }
  ];
  var ICON_H = { 'icon-folder': 0.986, 'icon-pts': 1.436, 'icon-officer': 1.286, 'icon-like': 1.05 };
  var effects = [];

  // Круги по воде от Владивостока и искорки
  function ring(x, y, now, delay, maxR) {
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 4); c.setAttribute('fill', 'none');
    c.setAttribute('stroke', '#34D399'); c.setAttribute('stroke-width', '1.6'); c.style.opacity = '0';
    fx.insertBefore(c, fx.firstChild);
    effects.push({ type: 'ring', el: c, t0: now + delay, dur: 1500, maxR: maxR || 54 });
  }
  function sparks(x, y, now, n) {
    for (var i = 0; i < n; i++) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', rnd(1.2, 2.4)); c.setAttribute('fill', i % 2 ? '#bff0d6' : '#34D399'); c.style.opacity = '0';
      fx.appendChild(c);
      effects.push({ type: 'spark', el: c, t0: now + rnd(0, 250), dur: rnd(900, 1500), x: x, y: y, a: rnd(0, 6.28), r0: rnd(14, 24), r1: rnd(40, 66) });
    }
  }
  function startCustoms(job, now) {
    var ims = HUBFX.map(function (f) { return img(f.name, f.w, ICON_H[f.name]); });
    job.cs = { t0: now, dur: 1700, ims: ims };
    ring(HUB.x, HUB.y, now, 0, 56); ring(HUB.x, HUB.y, now, 260, 70);
    sparks(HUB.x, HUB.y - 40, now, 9);
  }
  var backOut = function (x) { var c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  function frame(now) {
    if (!running) return;
    if (now >= nextSpawn && jobs.length < 6) { spawn(now); nextSpawn = now + rnd(1500, 3300); }
    for (var i = jobs.length - 1; i >= 0; i--) {
      var j = jobs[i], t = (now - j.t0) / j.dur;
      if (j.phase === 'in' || j.phase === 'out') {
        var tt = clamp(t, 0, 1), e = ease(tt);
        var pos = j.route.el.getPointAtLength(j.route.len * e);
        var ahead = j.route.el.getPointAtLength(Math.min(j.route.len, j.route.len * e + 4));
        var ang = Math.atan2(ahead.y - pos.y, ahead.x - pos.x) * 180 / Math.PI;
        var env = clamp(Math.min(tt / 0.3, (1 - tt) / 0.3), 0, 1);   // 0 в точках, 1 на основной части пути
        var grow = 0.04 + 0.96 * env * env * (3 - 2 * env);       // растёт из точки до полного размера и «входит» в следующую точку
        var left = ahead.x < pos.x;
        var ph = j.ph, base = ang - (left ? 180 - BASE : BASE), dy = 0, sx = left ? -grow : grow, sy = grow;
        if (j.kind === 'ferry') {
          // паром: покачивается с борта на борт и мягко ныряет на волне
          base += Math.sin(now / 520 + ph) * 3.4;   // качка вокруг курса
          dy = Math.sin(now / 340 + ph) * 1.7;
          sy *= 1 + Math.sin(now / 340 + ph + 1.2) * 0.012;
        } else {
          // автовоз: на ходу «дышит» — чуть сжимается и разжимается, подпрыгивает на неровностях
          var c = Math.sin(now / 135 + ph);
          sy *= 1 - c * 0.04; sx *= 1 + c * 0.028;
          dy = -Math.abs(Math.sin(now / 135 + ph)) * 1.4;
          base += Math.sin(now / 410 + ph) * 0.9;
        }
        var fade = Math.min(1, tt * 25, (1 - tt) * 25);
        place(j.im, pos.x, pos.y + dy, j.size[0], j.size[1], sx, base, clamp(fade, 0, 1), sy);
        if (t >= 1) {
          fx.removeChild(j.im);
          if (j.phase === 'in') { j.phase = 'customs'; startCustoms(j, now); }
          else { j.phase = 'like'; j.t0 = now; j.im = img('icon-like', 46, ICON_H['icon-like']); j.cx = j.dest.x; j.cy = j.dest.y; }
        }
      } else if (j.phase === 'customs') {
        var cs = j.cs, u = clamp((now - cs.t0) / cs.dur, 0, 1);
        var pop = backOut(clamp(u / 0.28, 0, 1));
        var rise = ease(u) * 26;
        var op = Math.min(1, u * 9, (1 - u) * 3.5);
        for (var q = 0; q < cs.ims.length; q++) {
          var f = HUBFX[q];
          place(cs.ims[q], HUB.x + f.off, HUB.y - 62 - rise + Math.sin(now / 280 + q) * 1.2, f.w, ICON_H[f.name], 0.15 + 0.85 * pop, 0, clamp(op, 0, 1));
        }
        if (u >= 1) {
          cs.ims.forEach(function (im) { fx.removeChild(im); });
          var d = OUT[Math.floor(Math.random() * OUT.length)];
          j.phase = 'out'; j.t0 = now; j.dur = rnd(4800, 6400); j.route = d.path; j.dest = d; j.kind = 'truck';
          j.size = SIZE.truck; j.ph = rnd(0, 6.28); j.im = img('truck', j.size[0], j.size[1]);
        }
      } else if (j.phase === 'like') {
        var lt = (now - j.t0) / 2600, lu = clamp(lt, 0, 1);
        var fly = 1 - Math.pow(1 - clamp(lu * 4, 0, 1), 3);
        var sc = 0.2 + 0.8 * fly + (lu < 0.35 ? Math.sin(lu / 0.35 * Math.PI) * 0.15 : 0);
        place(j.im, j.cx, j.cy - 66 - fly * 14 + Math.sin(now / 300) * 1.2, 46, ICON_H['icon-like'], sc, 0, clamp(Math.min(lu * 8, (1 - lu) * 5), 0, 1));
        if (lt >= 1) { fx.removeChild(j.im); jobs.splice(i, 1); }
      }
    }
    for (var k = effects.length - 1; k >= 0; k--) {
      var ef = effects[k], p = (now - ef.t0) / ef.dur;
      if (p < 0) continue;
      if (p >= 1) { fx.removeChild(ef.el); effects.splice(k, 1); continue; }
      if (ef.type === 'ring') {
        ef.el.setAttribute('r', (4 + (ef.maxR - 4) * (1 - Math.pow(1 - p, 2.2))).toFixed(1));
        ef.el.style.opacity = ((1 - p) * 0.75).toFixed(2);
      } else {
        var rr = ef.r0 + (ef.r1 - ef.r0) * p;
        ef.el.setAttribute('cx', (ef.x + Math.cos(ef.a) * rr).toFixed(1));
        ef.el.setAttribute('cy', (ef.y + Math.sin(ef.a) * rr * 0.8 - p * 10).toFixed(1));
        ef.el.style.opacity = (Math.sin(p * Math.PI) * 0.9).toFixed(2);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  var running = false, raf = 0;
  function start() { if (running || document.hidden) return; running = true; nextSpawn = performance.now() + 300; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  var visible = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.1 }).observe(map);
  } else { visible = true; start(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (visible) start(); });
})();
