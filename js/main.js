
'use strict';

// ============ ANALYTICS HELPER ============
// Безопасный вызов Метрики — работает даже если ym() ещё не загрузился
const YM_COUNTER = 109736434;
const trackedFlags = {}; // защита от повторного отсчёта одной и той же цели за визит
function track(goalName, params) {
  if (!goalName) return;
  try {
    if (typeof window.ym === 'function') {
      if (params) {
        window.ym(YM_COUNTER, 'reachGoal', goalName, params);
      } else {
        window.ym(YM_COUNTER, 'reachGoal', goalName);
      }
    } else {
      // Метрика ещё не загружена — отложить
      setTimeout(() => { try { if (typeof window.ym === 'function') window.ym(YM_COUNTER, 'reachGoal', goalName, params || {}); } catch(e){} }, 1500);
    }
  } catch (e) {
    console.warn('track() error:', e);
  }
}
// trackOnce — событие только один раз за визит (для form_viewed и подобных)
function trackOnce(goalName, params) {
  if (trackedFlags[goalName]) return;
  trackedFlags[goalName] = true;
  track(goalName, params);
}
if (typeof window !== 'undefined') {
  window.track = track;
  window.trackOnce = trackOnce;
}


// ============ DATA SOURCE ============
// Architecture: data loaded from JSON files in /data/.
// Migrating to NocoDB API later → just swap fetchers.
// Cache in localStorage as fallback if network fails.

const DataSource = (() => {
  const CACHE_KEY = 'pc_cache_v1';
  const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h
  const ENDPOINTS = {
    cars: 'data/cars.json',
    motorcycles: 'data/motorcycles.json',
    cases: 'data/cases.json',
    team: 'data/team.json',
    offices: 'data/offices.json',
    articles: 'data/articles.json',
    videos: 'data/videos.json'
  };

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.t > CACHE_TTL) return null;
      return c.d;
    } catch (e) { return null; }
  }
  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data }));
    } catch (e) {}
  }

  async function fetchOne(name) {
    try {
      const res = await fetch(ENDPOINTS[name], { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`Failed to fetch ${name}:`, e.message);
      return null;
    }
  }

  // Filter only published records and sort
  function normalize(name, items) {
    if (!Array.isArray(items)) return [];
    let filtered = items.filter(it => it.published !== false);
    if (name === 'team' || name === 'offices') {
      filtered.sort((a, b) => (a.order || 0) - (b.order || 0));
    } else if (name === 'cases') {
      filtered.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    } else if (name === 'articles') {
      // Сортировка по дате добавления (publishedAt) — новые сверху
      filtered.sort((a, b) => {
        const da = Date.parse(a.publishedAt || a.date || '') || 0;
        const db = Date.parse(b.publishedAt || b.date || '') || 0;
        return db - da;
      });
    }
    return filtered;
  }

  async function loadAll() {
    const names = Object.keys(ENDPOINTS);
    const results = await Promise.all(names.map(n => fetchOne(n)));
    const data = {};
    let anyMissed = false;
    names.forEach((n, i) => {
      if (results[i]) {
        data[n] = normalize(n, results[i]);
      } else {
        anyMissed = true;
      }
    });
    // If everything loaded, cache it
    if (!anyMissed && names.every(n => data[n] && data[n].length >= 0)) {
      writeCache(data);
      return { data, source: 'network' };
    }
    // Otherwise try cache
    const cached = readCache();
    if (cached) {
      console.info('Using cached data');
      names.forEach(n => { if (!data[n]) data[n] = cached[n] || []; });
      return { data, source: 'cache' };
    }
    // Nothing — return empty arrays
    names.forEach(n => { if (!data[n]) data[n] = []; });
    return { data, source: 'empty' };
  }

  return { loadAll };
})();

// Will be populated after init
let CARS = [];
let MOTOS = [];
let CASES = [];
let TEAM = [];
let OFFICES = [];
let ARTICLES = [];
let VIDEOS = [];

// ============ FILTER CONFIG ============
const BUDGETS_AUTO = [
  { id:'all', label:'Все', min:0, max:Infinity },
  { id:'lt700k', label:'до 700к', min:0, max:700000 },
  { id:'700k-1m', label:'700к–1 млн', min:700000, max:1000000 },
  { id:'1-1.5m', label:'1–1,5 млн', min:1000000, max:1500000 },
  { id:'1.5-2.5m', label:'1,5–2,5 млн', min:1500000, max:2500000 },
  { id:'2.5-4m', label:'2,5–4 млн', min:2500000, max:4000000 },
  { id:'4-6m', label:'4–6 млн', min:4000000, max:6000000 },
  { id:'6-10m', label:'6–10 млн', min:6000000, max:10000000 },
  { id:'10m+', label:'10 млн+', min:10000000, max:Infinity }
];
const BUDGETS_MOTO = [
  { id:'all', label:'Все', min:0, max:Infinity },
  { id:'lt400k', label:'до 400к', min:0, max:400000 },
  { id:'400-700k', label:'400–700к', min:400000, max:700000 },
  { id:'700k-1.2m', label:'700к–1,2 млн', min:700000, max:1200000 },
  { id:'1.2-2m', label:'1,2–2 млн', min:1200000, max:2000000 },
  { id:'2m+', label:'2 млн+', min:2000000, max:Infinity }
];

// ============ STATE ============
const state = {
  type: 'auto',
  budget: 'all',
  age: 'all',
  country: 'all',
  brand: 'all',      // фильтр по марке из caталога (динамически)
  mototype: 'all',
  power: 500,        // max л.с. (500 = без фильтра)
  drive: 'all',      // FWD | RWD | 4WD | all
  sortBy: 'priceAsc',
  channel: 'call'
};

// ============ UTILS ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmt = (n) => new Intl.NumberFormat('ru-RU').format(n);
const fmtPrice = (n) => fmt(n) + ' ₽';
const ageOf = (year) => 2026 - year;
const daysSince = (dateStr) => {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// ============ ANNOUNCEMENT BAR ============
function initAnnounce() {
  const bar = $('#announce');
  const hwrap = $('#headerWrap');
  const closeBtn = $('#announceClose');
  if (!bar || !closeBtn) return;

  try {
    if (localStorage.getItem('announceClosed') === '1') {
      bar.classList.add('hidden');
      if (hwrap) hwrap.classList.add('announce-hidden');
    }
  } catch(e) {}

  closeBtn.addEventListener('click', () => {
    bar.classList.add('hidden');
    if (hwrap) hwrap.classList.add('announce-hidden');
    try { localStorage.setItem('announceClosed', '1'); } catch(e) {}
  });
}

// ============ HEADER SCROLLED ============
function initHeader() {
  const header = $('#header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 20) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// ============ COUNTRY ROTATOR ============
function initRotator() {
  const el = $('#rotator');
  if (!el) return;
  const items = ['Кореи', 'Японии', 'Китая'];
  let i = 0;
  setInterval(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      i = (i + 1) % items.length;
      el.textContent = items[i];
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 400);
  }, 3000);
}

// ============ STAT COUNTERS ============
function initStats() {
  const els = $$('.stat-value[data-target]');
  let played = false;
  const animate = () => {
    if (played) return;
    played = true;
    els.forEach(el => {
      const target = +el.dataset.target;
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      const duration = 1600;
      const start = performance.now();
      const initial = 0;
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const v = Math.floor(initial + (target - initial) * ease);
        el.textContent = prefix + v + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) animate();
    }, { threshold: 0.3 });
    if (els[0]) io.observe(els[0]);
  } else {
    animate();
  }
}

// ============ REVEAL ON SCROLL ============
function initReveal() {
  const els = $$('.reveal, .reveal-stagger');
  if (!('IntersectionObserver' in window)) {
    els.forEach(e => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
}

// ============ CAR CARD RENDERING ============
function carImageSvg(brand) {
  // Generic stylized car silhouette
  return `<div class="car-img-svg"><svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 75 Q 10 65 20 60 L 50 50 Q 70 38 90 38 L 130 38 Q 150 38 165 50 L 185 60 Q 192 65 190 75 L 190 80 Q 188 85 180 85 L 20 85 Q 12 85 10 80 Z"
      fill="rgba(16,185,129,0.12)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M55 50 L 70 42 L 130 42 L 145 50" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>
    <line x1="100" y1="42" x2="100" y2="50" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>
    <circle cx="55" cy="82" r="9" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
    <circle cx="145" cy="82" r="9" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
  </svg></div>`;
}
function motoImageSvg() {
  return `<div class="car-img-svg"><svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="75" r="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
    <circle cx="160" cy="75" r="14" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
    <path d="M40 75 L 70 50 L 100 50 L 115 35 L 140 35 L 160 75" fill="rgba(16,185,129,0.12)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M115 35 L 130 25 L 145 30" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" fill="none"/>
  </svg></div>`;
}
function caseImageSvg() {
  return `<div class="case-img-svg"><svg viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 75 Q 10 65 20 60 L 50 50 Q 70 38 90 38 L 130 38 Q 150 38 165 50 L 185 60 Q 192 65 190 75 L 190 80 Q 188 85 180 85 L 20 85 Q 12 85 10 80 Z"
      fill="rgba(16,185,129,0.18)" stroke="rgba(255,255,255,0.92)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M55 50 L 70 42 L 130 42 L 145 50" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.75)" stroke-width="1.2"/>
    <circle cx="55" cy="82" r="9" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
    <circle cx="145" cy="82" r="9" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>
  </svg></div>`;
}

function badgesFor(car) {
  // Plashki removed per user request — keep function for backward compat in modal
  return [];
}

function renderCarCard(car, opts = {}) {
  const badges = badgesFor(car);
  const badgesHtml = badges.map(b => `<span class="car-badge ${b.cls}">${b.text}</span>`).join('');
  const topRibbon = opts.topRank ? `<div class="car-top-ribbon">TOP ${opts.topRank}</div>` : '';
  const wheelBadge = car.wheel === 'right' ? `<span class="car-wheel-right">Правый руль</span>` : '';
  const hasPhotos = Array.isArray(car.photos) && car.photos.length > 0;
  const photoCount = hasPhotos ? `<div class="car-photo-count">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
    ${car.photos.length} фото
  </div>` : '';
  const imageContent = hasPhotos ? `<img src="${car.photos[0]}" alt="${car.brand} ${car.model}" loading="lazy">` : (car.type === 'moto' ? motoImageSvg() : carImageSvg(car.brand));

  const card = document.createElement('article');
  card.className = 'car-card';
  card.dataset.id = car.id;
  card.innerHTML = `
    <div class="car-img">
      ${imageContent}
      <div class="car-flag-badge">${car.flag} ${car.country === 'Japan' ? 'Япония' : car.country === 'China' ? 'Китай' : 'Корея'}</div>
      ${topRibbon}
      <div class="car-badges">${badgesHtml}</div>
      ${photoCount}
    </div>
    <div class="car-body">
      <a class="car-title" href="/auto/${car.id.replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')}.html">${car.brand} ${car.model}</a>
      <div class="car-meta">
        <span class="car-meta-item">${car.year} г.</span>
        <span class="car-meta-item">${fmt(car.mileage)} км</span>
        <span class="car-meta-item">${car.engine}</span>
        ${wheelBadge ? `<span class="car-meta-item">${wheelBadge}</span>` : ''}
      </div>
      <div class="car-price-row">
        <span class="car-price">${fmtPrice(car.price)}</span>
        ${car.priceMarket > car.price ? `<span class="car-price-market">${fmtPrice(car.priceMarket)}</span>` : ''}
      </div>
      <div class="car-delivery">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Доставка ${car.deliveryMin}–${car.deliveryMax} дней
      </div>
      <div class="car-actions">
        <button class="btn btn-ghost btn-sm" data-action="details">Подробнее</button>
        <a href="#cta" class="btn btn-primary btn-sm" data-action="order">Обсудить авто</a>
      </div>
    </div>
  `;
  card.querySelector('[data-action="details"]').addEventListener('click', () => openCarModal(car));
  // Click on photo also opens the modal (with details)
  const imgArea = card.querySelector('.car-img');
  if (imgArea) {
    imgArea.style.cursor = 'pointer';
    imgArea.addEventListener('click', () => openCarModal(car));
  }
  return card;
}

// ============ TOP-5 ============
function renderTop5() {
  const track = $('#top5Track');
  if (!track) return;
  // All cars marked as hit, sorted by weight (smaller = higher). No limit.
  const hits = CARS.filter(c => c.hit).sort((a, b) => {
    const wa = (a.weight === undefined || a.weight === null || a.weight === '') ? 9999 : Number(a.weight);
    const wb = (b.weight === undefined || b.weight === null || b.weight === '') ? 9999 : Number(b.weight);
    return wa - wb;
  });
  // If no hits at all, fall back to showing first few cars so the section isn't empty
  const all = hits.length > 0 ? hits : CARS.slice(0, 5);
  track.innerHTML = '';
  all.forEach((car, i) => {
    track.appendChild(renderCarCard(car, { topRank: i + 1 }));
  });
}

function initTop5Carousel() {
  const track = $('#top5Track');
  const prev = $('#top5Prev');
  const next = $('#top5Next');
  if (!track || !prev || !next) return;
  const cardWidth = () => {
    const first = track.querySelector('.car-card');
    return first ? first.offsetWidth + 16 : 320;
  };
  prev.addEventListener('click', () => {
    track.scrollBy({ left: -cardWidth(), behavior: 'smooth' });
  });
  next.addEventListener('click', () => {
    track.scrollBy({ left: cardWidth(), behavior: 'smooth' });
  });
}

function initCasesCarousel() {
  const track = $('#casesTrack');
  const prev = $('#casesPrev');
  const next = $('#casesNext');
  if (!track || !prev || !next) return;
  const cardWidth = () => {
    const first = track.querySelector('.case');
    return first ? first.offsetWidth + 16 : 360;
  };
  prev.addEventListener('click', () => {
    track.scrollBy({ left: -cardWidth(), behavior: 'smooth' });
  });
  next.addEventListener('click', () => {
    track.scrollBy({ left: cardWidth(), behavior: 'smooth' });
  });
}

// ============ SELECTOR (Подборщик) ============
function renderBudgetChips() {
  const container = $('#budgetChips');
  if (!container) return;
  const list = state.type === 'auto' ? BUDGETS_AUTO : BUDGETS_MOTO;
  // Reset to 'all' if previous selection doesn't exist
  if (!list.find(b => b.id === state.budget)) state.budget = 'all';
  container.innerHTML = '';
  list.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.budget === b.id ? ' active' : '');
    btn.dataset.budget = b.id;
    btn.textContent = b.label;
    btn.addEventListener('click', () => {
      trackOnce('calc_used');
      state.budget = b.id;
      container.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.budget === b.id));
      resetPagination();
      renderResults();
    });
    container.appendChild(btn);
  });
}

function getBudgetRange() {
  const list = state.type === 'auto' ? BUDGETS_AUTO : BUDGETS_MOTO;
  return list.find(b => b.id === state.budget) || list[0];
}

// Алиасы марок: в cars.json иногда модель попадает в поле brand («AUDI A1» вместо «Audi»).
// Приводим к канонической марке — используется и в чипах, и в фильтре, чтобы клики совпадали.
const BRAND_ALIAS = { 'audi a1': 'Audi' };
function normalizeBrand(b) {
  const raw = String(b || '').trim();
  const aliased = BRAND_ALIAS[raw.toLowerCase()];
  return aliased || raw;
}

// Динамически собираем уникальные марки из текущего пула (auto / moto)
// Дедуп case-insensitively — в данных бывает "Honda" и "HONDA"; предпочитаем не-капс для отображения.
function renderBrandChips() {
  const container = $('#brandChips');
  if (!container) return;
  const pool = state.type === 'auto' ? CARS : MOTOS;
  const map = new Map();
  pool.forEach(car => {
    if (!car || !car.brand) return;
    const raw = normalizeBrand(car.brand);
    const key = raw.toLowerCase();
    const cur = map.get(key);
    // Если в map уже All-Caps, а текущий не All-Caps — заменяем на более читаемое
    if (!cur || (cur === cur.toUpperCase() && raw !== raw.toUpperCase())) {
      map.set(key, raw);
    }
  });
  const brands = Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'ru'));
  // Сброс state.brand если выбранная марка отсутствует в новом пуле
  if (state.brand !== 'all' && !brands.find(b => b.toLowerCase() === state.brand.toLowerCase())) {
    state.brand = 'all';
  }
  container.innerHTML = '';
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (state.brand === 'all' ? ' active' : '');
  all.dataset.brand = 'all';
  all.textContent = 'Все';
  container.appendChild(all);
  brands.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.brand.toLowerCase() === b.toLowerCase() ? ' active' : '');
    btn.dataset.brand = b;
    btn.textContent = b;
    container.appendChild(btn);
  });
  // Делегированный клик: один слушатель на контейнер вместо привязки к каждому чипу
  if (!container.dataset.wired) {
    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      trackOnce('calc_used');
      state.brand = chip.dataset.brand;
      container.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
      resetPagination();
      renderResults();
    });
    container.dataset.wired = '1';
  }
}

function getAgeRange() {
  if (state.age === 'all') return { min: 0, max: 100 };
  const [min, max] = state.age.split('-').map(Number);
  return { min, max };
}

// Pagination state
const PAGE_INITIAL = 6;
const PAGE_STEP = 3;
let visibleCount = PAGE_INITIAL;

function filterCars() {
  const pool = state.type === 'auto' ? CARS : MOTOS;
  const budget = getBudgetRange();
  const age = getAgeRange();
  // Soft filter: items matching get a score
  const scored = pool.map(car => {
    let score = 0;
    let matches = true;
    if (car.price < budget.min || car.price > budget.max) { matches = false; }
    const carAge = ageOf(car.year);
    if (carAge < age.min || carAge > age.max) { matches = false; }
    if (state.country !== 'all' && car.country !== state.country) { matches = false; }
    if (state.brand !== 'all' && normalizeBrand(car.brand).toLowerCase() !== state.brand.toLowerCase()) { matches = false; }
    // Точная мощность (фильтр активен только если двинут со значения по умолчанию = 500)
    if (state.power < 500) {
      const p = Number(car.power);
      if (!p || p > state.power) { matches = false; }
    }
    // Привод (фильтрует только лоты с заполненным car.drive)
    if (state.drive !== 'all') {
      if (!car.drive || car.drive !== state.drive) { matches = false; }
    }
    if (state.type === 'moto' && state.mototype !== 'all' && car.mototype !== state.mototype) { matches = false; }
    if (matches) score += 100;
    if (car.hit) score += 5;
    if (daysSince(car.addedAt) < 14) score += 2;
    return { car, score, matches };
  });
  scored.sort((a, b) => b.score - a.score);
  // Apply user-selected sort to matching results
  const matching = scored.filter(s => s.matches).map(s => s.car);
  const sortBy = state.sortBy || 'priceAsc';
  if (sortBy === 'priceAsc') matching.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sortBy === 'priceDesc') matching.sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (sortBy === 'yearDesc') matching.sort((a, b) => (b.year || 0) - (a.year || 0));
  else if (sortBy === 'newest') matching.sort((a, b) => {
    const da = a.addedAt ? new Date(a.addedAt).getTime() : 0;
    const db = b.addedAt ? new Date(b.addedAt).getTime() : 0;
    return db - da;
  });
  return matching;
}

function renderResults() {
  const grid = $('#resultsGrid');
  const loadMoreWrap = $('#loadMoreWrap');
  const countEl = $('#resultsCount');
  if (!grid) return;
  const allResults = filterCars();
  if (countEl) {
    countEl.textContent = allResults.length === 0 ? '' : `Найдено: ${allResults.length}`;
  }
  grid.innerHTML = '';
  if (allResults.length === 0) {
    grid.innerHTML = `<div class="results-empty" style="grid-column: 1 / -1;">
      <h3>Под эти параметры в базе пусто</h3>
      <p>Это не значит, что мы не можем привезти такое авто. База содержит самые популярные предложения — расширьте параметры или свяжитесь с менеджером для индивидуального поиска.</p>
      <a href="#cta" class="btn btn-primary">Подобрать индивидуально</a>
    </div>`;
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }
  const visible = allResults.slice(0, visibleCount);
  visible.forEach(car => grid.appendChild(renderCarCard(car)));

  // Show/hide "load more" button
  if (loadMoreWrap) {
    if (visibleCount < allResults.length) {
      const remaining = allResults.length - visibleCount;
      const nextChunk = Math.min(PAGE_STEP, remaining);
      loadMoreWrap.style.display = 'flex';
      loadMoreWrap.innerHTML = `
        <button class="btn btn-ghost btn-load-more" id="btnLoadMore">
          Показать ещё ${nextChunk} ${nextChunk === 1 ? 'авто' : (nextChunk < 5 ? 'авто' : 'авто')}
          <span class="load-more-count">(ещё ${remaining})</span>
        </button>
      `;
      $('#btnLoadMore').addEventListener('click', () => {
        visibleCount += PAGE_STEP;
        renderResults();
      });
    } else {
      loadMoreWrap.style.display = 'none';
    }
  }
}

// Reset pagination when filters change
function resetPagination() {
  visibleCount = PAGE_INITIAL;
}

function initSelector() {
  const toggle = $('#typeToggle');
  if (!toggle) return;
  toggle.querySelectorAll('button[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      trackOnce('calc_used'); // Цель Метрики: первое использование подборщика
      state.type = btn.dataset.type;
      toggle.dataset.type = state.type;
      toggle.querySelectorAll('button').forEach(b => {
        const active = b.dataset.type === state.type;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      // toggle moto-only filters
      const motoExtra = $('#motoExtraFilters');
      if (motoExtra) motoExtra.style.display = state.type === 'moto' ? 'block' : 'none';
      // re-render
      resetPagination();
      renderBudgetChips();
      renderBrandChips();
      renderResults();
    });
  });

  // Age chips
  $$('#ageChips .chip').forEach(c => {
    c.addEventListener('click', () => {
      trackOnce('calc_used');
      state.age = c.dataset.age;
      $$('#ageChips .chip').forEach(x => x.classList.toggle('active', x === c));
      resetPagination();
      renderResults();
    });
  });

  // Country chips
  $$('#countryChips .chip').forEach(c => {
    c.addEventListener('click', () => {
      trackOnce('calc_used');
      state.country = c.dataset.country;
      $$('#countryChips .chip').forEach(x => x.classList.toggle('active', x === c));
      resetPagination();
      renderResults();
    });
  });

  // Power slider (точная мощность)
  const powerSlider = $('#powerSlider');
  const powerValue  = $('#powerValue');
  const powerWarn   = $('#powerWarn');
  if (powerSlider) {
    powerSlider.addEventListener('input', () => {
      const v = Number(powerSlider.value);
      state.power = v;
      if (powerValue) powerValue.textContent = String(v);
      if (powerWarn)  powerWarn.classList.toggle('show', v > 160);
      trackOnce('calc_used');
      resetPagination();
      renderResults();
    });
  }

  // Drive chips
  $$('#driveChips .chip').forEach(c => {
    c.addEventListener('click', () => {
      trackOnce('calc_used');
      state.drive = c.dataset.drive;
      $$('#driveChips .chip').forEach(x => x.classList.toggle('active', x === c));
      resetPagination();
      renderResults();
    });
  });

  // Moto type chips
  $$('#motoTypeChips .chip').forEach(c => {
    c.addEventListener('click', () => {
      trackOnce('calc_used');
      state.mototype = c.dataset.mototype;
      $$('#motoTypeChips .chip').forEach(x => x.classList.toggle('active', x === c));
      resetPagination();
      renderResults();
    });
  });

  // Sort dropdown
  const sortSel = $('#sortBy');
  if (sortSel) {
    sortSel.value = state.sortBy || 'priceAsc';
    sortSel.addEventListener('change', () => {
      state.sortBy = sortSel.value;
      resetPagination();
      renderResults();
    });
  }

  renderBudgetChips();
  renderBrandChips();
  renderResults();
}

// ============ MODAL: CAR DETAILS ============
function openCarModal(car) {
  const content = $('#modalContent');
  const backdrop = $('#modalBackdrop');
  if (!content || !backdrop) return;

  // Цель Метрики: открыта карточка авто
  track('car_opened', { name: (car && car.name) || 'unknown', price: (car && car.priceRub) || 0 });

  const badges = badgesFor(car);
  const badgesHtml = badges.map(b => `<span class="car-badge ${b.cls}">${b.text}</span>`).join('');
  const wheelBadge = car.wheel === 'right' ? `<span class="car-wheel-right">Правый руль</span>` : '';

  // Photo gallery from car.photos array
  const hasPhotos = Array.isArray(car.photos) && car.photos.length > 0;
  let galleryContent;
  if (hasPhotos) {
    const slides = car.photos.map((p, i) =>
      `<img src="${p}" alt="${car.brand} ${car.model} — фото ${i+1}" loading="${i === 0 ? 'eager' : 'lazy'}" />`
    ).join('');
    const dots = car.photos.length > 1
      ? `<div class="gallery-dots">${car.photos.map((_, i) => `<button class="gallery-dot${i === 0 ? ' active' : ''}" data-dot="${i}" aria-label="Фото ${i+1}"></button>`).join('')}</div>`
      : '';
    const arrows = car.photos.length > 1 ? `
      <button class="gallery-arrow gallery-arrow-prev" aria-label="Предыдущее фото">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="gallery-arrow gallery-arrow-next" aria-label="Следующее фото">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>` : '';
    galleryContent = `
      <div class="car-gallery">
        <div class="car-gallery-scroll">${slides}</div>
        ${arrows}
        ${dots}
        <div class="gallery-counter">1 / ${car.photos.length}</div>
        <button class="gallery-zoom-hint" aria-label="Открыть на весь экран" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
      </div>`;
  } else {
    galleryContent = `<div class="modal-gallery-inner">${car.type === 'moto' ? motoImageSvg() : carImageSvg(car.brand)}</div>`;
  }

  // Price breakdown — manual values from car data (no auto-calculation)
  const bd = car.breakdown || {};
  const hasBreakdown = bd.auction || bd.domestic || bd.delivery || bd.customs || bd.docs || bd.commission;
  let breakdownHtml = '';
  if (hasBreakdown) {
    const rows = [
      { label: 'Цена авто на аукционе', value: bd.auction },
      { label: 'Логистика внутри страны', value: bd.domestic },
      { label: 'Доставка морем + автовоз', value: bd.delivery },
      { label: 'Утильсбор и таможня', value: bd.customs },
      { label: 'СБКТС, оформление', value: bd.docs },
      { label: 'Комиссия POWER Car', value: bd.commission }
    ].filter(r => r.value);
    const sum = rows.reduce((acc, r) => acc + Number(r.value || 0), 0);
    breakdownHtml = `
      <div class="modal-breakdown">
        <h4>Из чего складывается цена</h4>
        ${rows.map(r => `<div class="modal-breakdown-row"><span class="l">${r.label}</span><span>${fmtPrice(r.value)}</span></div>`).join('')}
        <div class="modal-breakdown-total"><span>Итого под ключ</span><span class="v">${fmtPrice(sum)}</span></div>
      </div>`;
  }

  content.innerHTML = `
    <div class="modal-gallery">
      <div class="car-flag-badge">${car.flag} ${car.country === 'Japan' ? 'Япония' : car.country === 'China' ? 'Китай' : 'Корея'}</div>
      <div class="car-badges">${badgesHtml}</div>
      ${galleryContent}
    </div>
    <div class="modal-body">
      <div class="modal-title-row">
        <div>
          <h2 class="modal-title" id="modalTitle">${car.brand} ${car.model}</h2>
          <div style="color:var(--text-muted);margin-top:6px;">${car.year} г. · ${fmt(car.mileage)} км · ${car.engine}</div>
        </div>
        <div class="modal-price-block">
          <div class="modal-price">${fmtPrice(car.price)}</div>
          ${car.priceMarket > car.price ? `<div class="modal-price-market">${fmtPrice(car.priceMarket)}</div><div class="modal-price-save">Экономия ${fmtPrice(car.priceMarket - car.price)}</div>` : ''}
        </div>
      </div>

      <div class="modal-specs">
        <div class="modal-spec-item"><span class="modal-spec-label">Год</span><span class="modal-spec-value">${car.year}</span></div>
        <div class="modal-spec-item"><span class="modal-spec-label">Пробег</span><span class="modal-spec-value">${fmt(car.mileage)} км</span></div>
        <div class="modal-spec-item"><span class="modal-spec-label">Двигатель</span><span class="modal-spec-value">${car.engine}</span></div>
        ${car.power ? `<div class="modal-spec-item"><span class="modal-spec-label">Мощность</span><span class="modal-spec-value">${car.power} л.с.</span></div>` : ''}
        ${car.transmission ? `<div class="modal-spec-item"><span class="modal-spec-label">Коробка</span><span class="modal-spec-value">${car.transmission}</span></div>` : ''}
        ${car.body ? `<div class="modal-spec-item"><span class="modal-spec-label">Кузов</span><span class="modal-spec-value">${car.body}</span></div>` : ''}
        <div class="modal-spec-item"><span class="modal-spec-label">Руль</span><span class="modal-spec-value">${car.wheel === 'right' ? 'Правый' : 'Левый'}</span></div>
        <div class="modal-spec-item"><span class="modal-spec-label">Страна</span><span class="modal-spec-value">${car.flag} ${car.country === 'Japan' ? 'Япония' : car.country === 'China' ? 'Китай' : 'Корея'}</span></div>
        <div class="modal-spec-item"><span class="modal-spec-label">Доставка</span><span class="modal-spec-value">${car.deliveryMin}–${car.deliveryMax} дней</span></div>
      </div>

      ${breakdownHtml}

      <div class="modal-disclaimer">
        Цены не являются публичной офертой. Цена может меняться в обе стороны в зависимости от курса валют на дату подписания договора.
      </div>

      <div class="modal-actions">
        <a href="#cta" class="btn btn-primary btn-shine" data-close-modal>Обсудить авто</a>
        <a href="#cta" class="btn btn-ghost" data-close-modal>Узнать детали</a>
      </div>
    </div>
  `;

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  // close handlers
  content.querySelectorAll('[data-close-modal]').forEach(b => {
    b.addEventListener('click', closeCarModal);
  });

  // Gallery navigation (arrows + dots + counter sync)
  if (hasPhotos && car.photos.length > 1) {
    const scroll = content.querySelector('.car-gallery-scroll');
    const dots = content.querySelectorAll('.gallery-dot');
    const counter = content.querySelector('.gallery-counter');
    const prevBtn = content.querySelector('.gallery-arrow-prev');
    const nextBtn = content.querySelector('.gallery-arrow-next');
    const total = car.photos.length;

    const goTo = (i) => {
      const idx = Math.max(0, Math.min(total - 1, i));
      const slideWidth = scroll.clientWidth;
      scroll.scrollTo({ left: slideWidth * idx, behavior: 'smooth' });
    };

    const currentIndex = () => {
      const slideWidth = scroll.clientWidth || 1;
      return Math.round(scroll.scrollLeft / slideWidth);
    };

    const sync = () => {
      const idx = currentIndex();
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      if (counter) counter.textContent = `${idx + 1} / ${total}`;
    };

    if (prevBtn) prevBtn.addEventListener('click', () => goTo(currentIndex() - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => goTo(currentIndex() + 1));
    dots.forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.dot))));
    scroll.addEventListener('scroll', () => {
      window.requestAnimationFrame(sync);
    });
    // Click on photo → open fullscreen lightbox at current photo
    scroll.querySelectorAll('img').forEach((img, i) => {
      img.addEventListener('click', () => openLightbox(car.photos, i));
    });
    const zoomBtn = content.querySelector('.gallery-zoom-hint');
    if (zoomBtn) zoomBtn.addEventListener('click', () => openLightbox(car.photos, currentIndex()));
  } else if (hasPhotos && car.photos.length === 1) {
    // Single photo — still allow fullscreen
    const onlyImg = content.querySelector('.car-gallery-scroll img');
    if (onlyImg) onlyImg.addEventListener('click', () => openLightbox(car.photos, 0));
  }
}

function closeCarModal() {
  const backdrop = $('#modalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  document.body.style.overflow = '';
}

// ============ LIGHTBOX (fullscreen photo viewer) ============
const lightboxState = { photos: [], index: 0 };

function openLightbox(photos, startIndex) {
  if (!Array.isArray(photos) || photos.length === 0) return;
  lightboxState.photos = photos;
  lightboxState.index = startIndex || 0;

  const lb = $('#lightbox');
  const stage = $('#lightboxStage');
  const dotsWrap = $('#lightboxDots');
  const prevBtn = $('.lightbox-prev');
  const nextBtn = $('.lightbox-next');
  if (!lb || !stage) return;

  // Build slides
  stage.innerHTML = photos.map((p, i) =>
    `<img src="${p}" alt="Фото ${i+1}" data-lb-idx="${i}" loading="lazy" decoding="async" />`
  ).join('');

  // Build dots (only if more than 1)
  if (photos.length > 1) {
    dotsWrap.innerHTML = photos.map((_, i) =>
      `<button class="lightbox-dot${i === lightboxState.index ? ' active' : ''}" data-lbdot="${i}" aria-label="Фото ${i+1}"></button>`
    ).join('');
    dotsWrap.style.display = '';
    if (prevBtn) prevBtn.style.display = '';
    if (nextBtn) nextBtn.style.display = '';
  } else {
    dotsWrap.innerHTML = '';
    dotsWrap.style.display = 'none';
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  }

  lb.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Jump to start index (after render)
  requestAnimationFrame(() => {
    if (typeof stage.scrollTo === 'function') {
      try { stage.scrollTo({ left: stage.clientWidth * lightboxState.index, behavior: 'auto' }); }
      catch (e) { stage.scrollLeft = stage.clientWidth * lightboxState.index; }
    } else {
      stage.scrollLeft = stage.clientWidth * lightboxState.index;
    }
    syncLightbox();
  });

  // Click on image closes (zoom-out)
  stage.querySelectorAll('img').forEach(img => {
    img.addEventListener('click', closeLightbox);
  });
  // Dot navigation
  dotsWrap.querySelectorAll('.lightbox-dot').forEach(d => {
    d.addEventListener('click', () => lightboxGoTo(Number(d.dataset.lbdot)));
  });
}

function lightboxGoTo(i) {
  const stage = $('#lightboxStage');
  if (!stage) return;
  const total = lightboxState.photos.length;
  const idx = Math.max(0, Math.min(total - 1, i));
  if (typeof stage.scrollTo === 'function') {
    try { stage.scrollTo({ left: stage.clientWidth * idx, behavior: 'smooth' }); }
    catch (e) { stage.scrollLeft = stage.clientWidth * idx; }
  } else {
    stage.scrollLeft = stage.clientWidth * idx;
  }
}

function lightboxCurrentIndex() {
  const stage = $('#lightboxStage');
  if (!stage) return 0;
  return Math.round(stage.scrollLeft / (stage.clientWidth || 1));
}

function syncLightbox() {
  const idx = lightboxCurrentIndex();
  lightboxState.index = idx;
  const total = lightboxState.photos.length;
  const counter = $('#lightboxCounter');
  if (counter) counter.textContent = `${idx + 1} / ${total}`;
  $('#lightboxDots').querySelectorAll('.lightbox-dot').forEach((d, i) =>
    d.classList.toggle('active', i === idx)
  );
}

function closeLightbox() {
  const lb = $('#lightbox');
  if (!lb) return;
  lb.classList.remove('open');
  // Restore body scroll only if car/case modal is still open
  const modalOpen = $('#modalBackdrop') && $('#modalBackdrop').classList.contains('open');
  document.body.style.overflow = modalOpen ? 'hidden' : '';
}

function initLightbox() {
  const lb = $('#lightbox');
  if (!lb) return;
  const stage = $('#lightboxStage');
  $('#lightboxClose').addEventListener('click', closeLightbox);
  $('.lightbox-prev').addEventListener('click', () => lightboxGoTo(lightboxCurrentIndex() - 1));
  $('.lightbox-next').addEventListener('click', () => lightboxGoTo(lightboxCurrentIndex() + 1));
  stage.addEventListener('scroll', () => requestAnimationFrame(syncLightbox));
  // Click on dark background (not image) closes
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target === stage) closeLightbox();
  });
  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lightboxGoTo(lightboxCurrentIndex() - 1);
    else if (e.key === 'ArrowRight') lightboxGoTo(lightboxCurrentIndex() + 1);
  });
}

function initModal() {
  const backdrop = $('#modalBackdrop');
  const close = $('#modalClose');
  if (!backdrop || !close) return;
  close.addEventListener('click', closeCarModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeCarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCarModal();
  });
}

// ============ CASES ============
function renderCases() {
  const track = $('#casesTrack');
  if (!track) return;
  track.innerHTML = '';
  CASES.forEach(c => {
    const card = document.createElement('article');
    card.className = 'case';
    card.dataset.id = c.id;
    const hasPhotos = Array.isArray(c.photos) && c.photos.length > 0;
    const hasVideo = !!c.videoUrl;
    const imgContent = hasPhotos
      ? `<img src="${c.photos[0]}" alt="${c.carTitle}" loading="lazy">`
      : caseImageSvg();
    const countBadge = hasPhotos
      ? `<div class="car-photo-count">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          ${c.photos.length} фото
        </div>`
      : '';
    const videoBadge = hasVideo
      ? `<div class="case-video-badge">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          С видео
        </div>`
      : '';
    card.innerHTML = `
      <div class="case-img${hasPhotos ? ' has-photo' : ''}">
        <div class="car-flag-badge">${c.flag} ${c.country}</div>
        ${videoBadge}
        ${countBadge}
        ${imgContent}
      </div>
      <div class="case-body">
        <div class="case-title">${c.carTitle}</div>
        <div class="case-client">— ${c.clientName}, ${c.clientCity}</div>
        <div class="case-quote">${c.quote}</div>
        <div class="case-meta">
          <span><b>${c.year}</b> г. · <b>${c.deliveryDays}</b> дней</span>
          ${c.showPrice ? `<span><b>${fmtPrice(c.finalPrice)}</b> под ключ</span>` : ''}
        </div>
      </div>
    `;
    card.addEventListener('click', () => openCaseModal(c));
    track.appendChild(card);
  });
}

// ============ TEAM ============
function memberPhotoSvg() {
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><circle cx="50" cy="38" r="16"/><path d="M20 90c0-17 13-30 30-30s30 13 30 30"/></svg>`;
}
function tgIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m9.417 15.181-.397 5.584c.568 0 .814-.244 1.109-.537l2.663-2.545 5.518 4.041c1.012.564 1.725.267 1.998-.931L23.93 3.821c.42-1.747-.518-2.459-1.499-2.077L1.114 9.515C-.295 10.052-.272 10.801.873 11.157l5.617 1.747L19.27 4.74c.612-.366 1.169-.165.711.219z"/></svg>`;
}
function renderTeam() {
  const grid = document.querySelector('#team .team-grid');
  if (!grid) return;
  if (!TEAM.length) { grid.style.display = 'none'; return; }
  grid.innerHTML = '';
  TEAM.forEach(m => {
    const el = document.createElement('div');
    el.className = 'member';
    const photoHtml = m.photo ? `<img src="${m.photo}" alt="${m.name}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;">` : memberPhotoSvg();
    el.innerHTML = `
      <div class="member-photo">${photoHtml}</div>
      <div class="member-body">
        <div class="member-name">${m.name}</div>
        <div class="member-role">${m.role || ''}</div>
        <div class="member-exp">${m.experience || ''}</div>
      </div>
    `;
    grid.appendChild(el);
  });
}

// ============ OFFICES ============
function phoneIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
}
function clockIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
}
function maxIconSvg() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
}
function renderOffices() {
  const grid = document.querySelector('#offices .offices-grid');
  if (!grid) return;
  if (!OFFICES.length) { grid.style.display = 'none'; return; }
  grid.innerHTML = '';
  OFFICES.forEach(o => {
    const el = document.createElement('div');
    el.className = 'office' + (o.comingSoon ? ' office-coming-soon' : '');

    // Map embed via Yandex Maps iframe (only if coordinates present)
    let mapHtml = '';
    if (!o.comingSoon && o.lat && o.lng) {
      const mapSrc = `https://yandex.ru/map-widget/v1/?ll=${o.lng}%2C${o.lat}&z=16&pt=${o.lng},${o.lat},pm2grm`;
      const cityLabel = o.city || 'офис';
      mapHtml = `
        <div class="office-map">
          <iframe src="${mapSrc}" loading="lazy" frameborder="0" allowfullscreen="true" title="Карта офиса в городе ${cityLabel}"></iframe>
          ${o.yandexMapUrl ? `<a href="${o.yandexMapUrl}" target="_blank" rel="noopener" class="office-map-link" aria-label="Открыть карту офиса в Яндекс.Картах: ${cityLabel}">Открыть в Яндекс.Картах →</a>` : ''}
        </div>
      `;
    }

    // Phone link only if real number
    const phoneHtml = o.comingSoon ? '' : `<a href="tel:${o.phoneRaw || o.phone}" class="office-phone">${phoneIconSvg()} ${o.phone}</a>`;
    // Hours
    const hoursHtml = `<div class="office-hours">${clockIconSvg()} ${o.hours || ''}</div>`;
    // MAX button
    const maxHtml = o.maxUrl && !o.comingSoon ? `<a href="${o.maxUrl}" class="office-max" target="_blank" rel="noopener">${maxIconSvg()} Написать в MAX</a>` : '';
    // Ссылка на гео-страницу города (доставка/маршрут/популярные авто)
    const geoHtml = o.geoUrl ? `<a href="${o.geoUrl}" class="office-geo-link">Доставка авто в ${o.city} — подробнее →</a>` : '';

    el.innerHTML = `
      <span class="office-flag">${o.emoji || ''} ${o.city} · ${o.timezone || ''}</span>
      <h3>${o.city}</h3>
      <div class="office-address">${o.address}${o.addressNote ? '<br/><span class="office-address-note">' + o.addressNote + '</span>' : ''}</div>
      ${mapHtml}
      ${phoneHtml}
      ${hoursHtml}
      ${maxHtml}
      ${geoHtml}
    `;
    grid.appendChild(el);
  });
}

// ============ ARTICLES ============
function renderArticles() {
  const track = $('#articlesTrack');
  if (!track) return;
  if (!ARTICLES.length) {
    const section = document.querySelector('#articles');
    if (section) section.style.display = 'none';
    return;
  }
  track.innerHTML = '';
  ARTICLES.forEach(a => {
    const card = document.createElement('a');
    card.className = 'article-card';
    card.href = `/articles/${a.slug}.html`;
    const coverHtml = a.cover
      ? `<img src="${a.cover}" alt="${a.title}" loading="lazy">`
      : `<div class="article-cover-placeholder">${(a.category || '📝').charAt(0)}</div>`;
    const date = a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    card.innerHTML = `
      <div class="article-cover">
        ${a.category ? `<span class="article-category">${a.category}</span>` : ''}
        ${coverHtml}
      </div>
      <div class="article-body">
        <div class="article-title">${a.title}</div>
        <div class="article-desc">${a.description || ''}</div>
        <div class="article-meta">
          <span>${date}</span>
          ${a.readTime ? `<span>⏱ ${a.readTime} мин</span>` : ''}
        </div>
      </div>
    `;
    track.appendChild(card);
  });
}

function initArticlesCarousel() {
  const track = $('#articlesTrack');
  const prev = $('#articlesPrev');
  const next = $('#articlesNext');
  if (!track || !prev || !next) return;
  const cardWidth = () => {
    const first = track.querySelector('.article-card');
    return first ? first.offsetWidth + 16 : 320;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -cardWidth(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: cardWidth(), behavior: 'smooth' }));
}

// Convert any video URL (YouTube/Rutube/VK Video/direct mp4) to an embed-ready iframe HTML
function videoEmbedHtml(url) {
  if (!url) return '';
  const u = String(url).trim();

  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (m) {
    return `<iframe src="https://www.youtube.com/embed/${m[1]}?rel=0" style="width:100%;height:100%;border:0;" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }

  // Rutube: rutube.ru/video/ID/ or rutube.ru/play/embed/ID
  m = u.match(/rutube\.ru\/(?:video\/|play\/embed\/)([\w]+)/);
  if (m) {
    return `<iframe src="https://rutube.ru/play/embed/${m[1]}" style="width:100%;height:100%;border:0;" allow="clipboard-write; autoplay" allowfullscreen></iframe>`;
  }

  // VK Video / VK Clips: vk.com or vkvideo.ru, formats video-OID_ID or clip-OID_ID
  m = u.match(/(?:vk\.com|vkvideo\.ru)\/(?:video|clip)(-?\d+)_(\d+)/);
  if (m) {
    return `<iframe src="https://vkvideo.ru/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&autoplay=0" style="width:100%;height:100%;border:0;" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;" frameborder="0" allowfullscreen></iframe>`;
  }
  // Already an ext-style URL (vk.com or vkvideo.ru)
  if (/(?:vk\.com|vkvideo\.ru)\/video_ext\.php/.test(u)) {
    return `<iframe src="${u}" style="width:100%;height:100%;border:0;" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" frameborder="0" allowfullscreen></iframe>`;
  }

  // Direct mp4/webm/ogg
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(u)) {
    return `<video src="${u}" controls style="width:100%;height:100%;background:#000;"></video>`;
  }

  // Fallback: assume it's already an embed URL
  return `<iframe src="${u}" style="width:100%;height:100%;border:0;" allowfullscreen></iframe>`;
}

function openCaseModal(c) {
  const content = $('#modalContent');
  const backdrop = $('#modalBackdrop');
  if (!content || !backdrop) return;

  const hasVideo = Boolean(c.videoUrl);
  const hasPhotos = Array.isArray(c.photos) && c.photos.length > 0;
  // Default tab: video first if available, otherwise photos
  const defaultTab = hasVideo ? 'video' : 'photos';

  // Build tabs only if we have both
  const tabsHtml = (hasVideo && hasPhotos) ? `
    <div class="media-tabs" role="tablist">
      <button class="media-tab active" data-mtab="video" role="tab" aria-selected="true">▶ Видео</button>
      <button class="media-tab" data-mtab="photos" role="tab" aria-selected="false">📷 Фото${c.photoCount ? ' · ' + c.photoCount : ''}</button>
    </div>
  ` : '';

  // Photos panel — gallery with arrows + dots (same as car gallery)
  let photosPanelHtml;
  if (hasPhotos) {
    const slides = c.photos.map((p, i) =>
      `<img src="${p}" alt="${c.carTitle} — фото ${i+1}" loading="${i === 0 ? 'eager' : 'lazy'}" />`
    ).join('');
    const dots = c.photos.length > 1
      ? `<div class="gallery-dots">${c.photos.map((_, i) => `<button class="gallery-dot${i === 0 ? ' active' : ''}" data-dot="${i}" aria-label="Фото ${i+1}"></button>`).join('')}</div>`
      : '';
    const arrows = c.photos.length > 1 ? `
      <button class="gallery-arrow gallery-arrow-prev" aria-label="Предыдущее фото">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="gallery-arrow gallery-arrow-next" aria-label="Следующее фото">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>` : '';
    photosPanelHtml = `
      <div class="car-gallery">
        <div class="car-gallery-scroll">${slides}</div>
        ${arrows}
        ${dots}
        <div class="gallery-counter">1 / ${c.photos.length}</div>
        <button class="gallery-zoom-hint" aria-label="Открыть на весь экран" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
      </div>`;
  } else {
    photosPanelHtml = `<div class="modal-gallery-inner">${caseImageSvg()}</div>`;
  }

  // Video panel
  const videoPanelHtml = hasVideo
    ? `<div class="media-video-wrap">${videoEmbedHtml(c.videoUrl)}</div>`
    : '';

  // Decide which panel is visible by default
  const showVideoPanel = defaultTab === 'video';

  content.innerHTML = `
    <div class="modal-gallery">
      <div class="car-flag-badge">${c.flag} ${c.country}</div>
      ${tabsHtml}
      <div class="media-panel media-panel-video" ${showVideoPanel ? '' : 'hidden'}>${videoPanelHtml}</div>
      <div class="media-panel media-panel-photos" ${showVideoPanel ? 'hidden' : ''}>${photosPanelHtml}</div>
    </div>
    <div class="modal-body">
      <div class="modal-title-row">
        <div>
          <h2 class="modal-title" id="modalTitle">${c.carTitle}</h2>
          <div style="color:var(--text-muted);margin-top:6px;">${c.clientName}, ${c.clientCity} · ${c.year} г.</div>
        </div>
        ${c.showPrice ? `<div class="modal-price-block"><div class="modal-price">${fmtPrice(c.finalPrice)}</div><div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">под ключ за ${c.deliveryDays} дней</div></div>` : ''}
      </div>

      <p style="font-size:0.95rem;line-height:1.6;color:var(--text);margin-top:6px;">${c.story}</p>

      ${c.showPrice && c.breakdown ? `<div class="modal-breakdown">
        <h4>Разбивка стоимости</h4>
        ${c.breakdown.map(b => `<div class="modal-breakdown-row"><span class="l">${b.label}</span><span>${fmtPrice(b.value)}</span></div>`).join('')}
        <div class="modal-breakdown-total"><span>Итого</span><span class="v">${fmtPrice(c.finalPrice)}</span></div>
      </div>` : ''}

      <div class="modal-actions">
        <a href="#cta" class="btn btn-primary btn-shine" data-close-modal>Хочу такое же</a>
      </div>
    </div>
  `;

  // Media tabs switching
  const tabs = content.querySelectorAll('.media-tab');
  const videoPanel = content.querySelector('.media-panel-video');
  const photosPanel = content.querySelector('.media-panel-photos');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => {
        const active = x === t;
        x.classList.toggle('active', active);
        x.setAttribute('aria-selected', String(active));
      });
      const showVideo = t.dataset.mtab === 'video';
      if (videoPanel) videoPanel.hidden = !showVideo;
      if (photosPanel) photosPanel.hidden = showVideo;
      // Pause video when switching to photos by clearing src then restoring
      if (!showVideo && videoPanel) {
        const iframe = videoPanel.querySelector('iframe');
        if (iframe) {
          const src = iframe.src; iframe.src = ''; iframe.src = src;
        }
        const video = videoPanel.querySelector('video');
        if (video) video.pause();
      }
    });
  });

  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  content.querySelectorAll('[data-close-modal]').forEach(b => {
    b.addEventListener('click', closeCarModal);
  });

  // Photo gallery navigation (arrows + dots + counter)
  if (hasPhotos && c.photos.length > 1) {
    const scroll = content.querySelector('.media-panel-photos .car-gallery-scroll');
    if (scroll) {
      const dots = content.querySelectorAll('.media-panel-photos .gallery-dot');
      const counter = content.querySelector('.media-panel-photos .gallery-counter');
      const prevBtn = content.querySelector('.media-panel-photos .gallery-arrow-prev');
      const nextBtn = content.querySelector('.media-panel-photos .gallery-arrow-next');
      const total = c.photos.length;
      const goTo = (i) => {
        const idx = Math.max(0, Math.min(total - 1, i));
        scroll.scrollTo({ left: scroll.clientWidth * idx, behavior: 'smooth' });
      };
      const currentIndex = () => Math.round(scroll.scrollLeft / (scroll.clientWidth || 1));
      const sync = () => {
        const idx = currentIndex();
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
        if (counter) counter.textContent = `${idx + 1} / ${total}`;
      };
      if (prevBtn) prevBtn.addEventListener('click', () => goTo(currentIndex() - 1));
      if (nextBtn) nextBtn.addEventListener('click', () => goTo(currentIndex() + 1));
      dots.forEach((d) => d.addEventListener('click', () => goTo(Number(d.dataset.dot))));
      scroll.addEventListener('scroll', () => window.requestAnimationFrame(sync));
      // Fullscreen lightbox
      scroll.querySelectorAll('img').forEach((img, i) => {
        img.addEventListener('click', () => openLightbox(c.photos, i));
      });
      const zoomBtn = content.querySelector('.media-panel-photos .gallery-zoom-hint');
      if (zoomBtn) zoomBtn.addEventListener('click', () => openLightbox(c.photos, currentIndex()));
    }
  } else if (hasPhotos && c.photos.length === 1) {
    const onlyImg = content.querySelector('.media-panel-photos .car-gallery-scroll img');
    if (onlyImg) onlyImg.addEventListener('click', () => openLightbox(c.photos, 0));
    const zoomBtn = content.querySelector('.media-panel-photos .gallery-zoom-hint');
    if (zoomBtn) zoomBtn.addEventListener('click', () => openLightbox(c.photos, 0));
  }
}

// ============ FORM ============

// Telegram bot settings — REPLACE TOKEN with your fresh one from @BotFather
const TG_BOT_TOKEN = '8770272916:AAG9yb0n27jMWezctjyPTvOLYekunoor8Wc';
const TG_CHAT_ID   = '-1003891049696';

// Наши контакты для клиента (показываются в подсказке под полем формы)
const OUR_CONTACT_WA_MAX = '+7 913 853 33 05';   // для WhatsApp, MAX, звонка
const OUR_CONTACT_TG_PHONE = '+7 983 238 79 57'; // номер для Telegram-направления
const OUR_CONTACT_TG_USER = '@PowerCar_msk';      // ник в Telegram (для написать менеджеру)

// Channel meta: какой контакт собираем при выборе способа
const CHANNEL_META = {
  call:     { label: 'Номер телефона',  type: 'tel',  placeholder: '+7 (___) ___-__-__', hint: '',                                          mask: 'phone', name: 'Звонок',   ourContact: 'Или позвоните нам: ' + OUR_CONTACT_WA_MAX },
  whatsapp: { label: 'Номер WhatsApp',  type: 'tel',  placeholder: '+7 (___) ___-__-__', hint: '',                                          mask: 'phone', name: 'WhatsApp', ourContact: 'Или напишите нам в WhatsApp: ' + OUR_CONTACT_WA_MAX },
  max:      { label: 'Номер MAX',       type: 'tel',  placeholder: '+7 (___) ___-__-__', hint: 'MAX работает по номеру телефона',           mask: 'phone', name: 'MAX',      ourContact: 'Или напишите нам в MAX: ' + OUR_CONTACT_WA_MAX },
  telegram: { label: 'Ник в Telegram',  type: 'text', placeholder: '@username',          hint: 'Если не знаете свой ник — отправьте текущий номер телефона', mask: 'tg', name: 'Telegram', ourContact: 'Или напишите нам в Telegram: ' + OUR_CONTACT_TG_USER }
};

function initForm() {
  const form = $('#leadForm');
  if (!form) return;
  const phone = $('#lf-phone');
  const contactLabel = $('#contactLabel');
  const contactHint = $('#contactHint');

  // Phone mask
  const applyPhoneMask = (e) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.startsWith('8')) v = '7' + v.slice(1);
    if (!v.startsWith('7') && v) v = '7' + v;
    let out = '+7';
    if (v.length > 1) out += ' (' + v.slice(1, 4);
    if (v.length >= 5) out += ') ' + v.slice(4, 7);
    if (v.length >= 8) out += '-' + v.slice(7, 9);
    if (v.length >= 10) out += '-' + v.slice(9, 11);
    e.target.value = out;
  };

  let currentMask = 'phone';
  const setMask = (mask) => {
    currentMask = mask;
    // Remove old listener by cloning
    const newInput = phone.cloneNode(true);
    phone.parentNode.replaceChild(newInput, phone);
    if (mask === 'phone') {
      newInput.addEventListener('input', applyPhoneMask);
    }
    // Re-assign reference
    return newInput;
  };

  // Apply channel-specific UI to input
  const applyChannelUI = (channel) => {
    const meta = CHANNEL_META[channel] || CHANNEL_META.call;
    const input = $('#lf-phone');
    if (!input) return;
    contactLabel.textContent = meta.label;
    input.type = meta.type;
    input.placeholder = meta.placeholder;
    input.inputMode = meta.type === 'tel' ? 'tel' : 'text';
    input.autocomplete = meta.type === 'tel' ? 'tel' : 'off';
    input.value = ''; // reset when switching
    if (meta.hint) {
      contactHint.textContent = meta.hint;
      contactHint.style.display = 'block';
    } else {
      contactHint.style.display = 'none';
    }
    // Показ нашего контакта под полем
    const ourInfo = $('#contactOurInfo');
    if (ourInfo) {
      if (meta.ourContact) {
        ourInfo.textContent = meta.ourContact;
        ourInfo.style.display = 'block';
      } else {
        ourInfo.style.display = 'none';
      }
    }
    // Сброс ошибки
    clearFieldError();
    setMask(meta.mask);
  };

  // Скрыть/показать ошибку поля контакта
  const showFieldError = (msg) => {
    const err = $('#contactError');
    const inp = $('#lf-phone');
    if (err) { err.textContent = msg; err.style.display = 'block'; }
    if (inp) inp.style.borderColor = '#F87171';
  };
  const clearFieldError = () => {
    const err = $('#contactError');
    const inp = $('#lf-phone');
    if (err) err.style.display = 'none';
    if (inp) inp.style.borderColor = '';
  };
  const showConsentError = () => {
    const err = $('#consentError');
    if (err) err.style.display = 'block';
  };
  const clearConsentError = () => {
    const err = $('#consentError');
    if (err) err.style.display = 'none';
  };

  // Initial mask
  if (phone) phone.addEventListener('input', applyPhoneMask);

  // Channel chips
  $$('#channelChips .channel-chip').forEach(c => {
    c.addEventListener('click', () => {
      state.channel = c.dataset.channel;
      $$('#channelChips .channel-chip').forEach(x => {
        const active = x === c;
        x.classList.toggle('active', active);
        x.setAttribute('aria-pressed', String(active));
      });
      applyChannelUI(state.channel);
    });
  });

  // Очистка ошибки контакта при вводе
  const phoneInpLive = $('#lf-phone');
  if (phoneInpLive) {
    phoneInpLive.addEventListener('input', clearFieldError);
  }
  // Очистка ошибки согласия при изменении чекбокса
  const consentInp = $('#consent');
  if (consentInp) {
    consentInp.addEventListener('change', () => { if (consentInp.checked) clearConsentError(); });
  }

  // Стартовая инициализация подсказки с нашим контактом
  applyChannelUI(state.channel || 'call');

  // Цель Метрики: пользователь дошёл до формы
  if (typeof IntersectionObserver !== 'undefined') {
    const formObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          trackOnce('form_viewed');
          formObserver.disconnect();
        }
      });
    }, { threshold: 0.3 });
    formObserver.observe(form);
  }

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot — if filled, silently ignore (likely a bot)
    const hp = $('#lf-honeypot');
    if (hp && hp.value) {
      console.warn('Honeypot triggered, dropping submission');
      return;
    }

    // Consent check (inline error instead of alert)
    const consent = $('#consent');
    if (consent && !consent.checked) {
      const toggle = consent.nextElementSibling;
      if (toggle) {
        toggle.style.outline = '2px solid #F87171';
        toggle.style.outlineOffset = '3px';
        setTimeout(() => { toggle.style.outline = ''; toggle.style.outlineOffset = ''; }, 2400);
      }
      showConsentError();
      // Прокрутить к чекбоксу
      if (consent.scrollIntoView) consent.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    clearConsentError();

    // Collect data
    const name = ($('#lf-name') && $('#lf-name').value || '').trim();
    let contact = ($('#lf-phone') && $('#lf-phone').value || '').trim();
    const channel = state.channel || 'call';
    const channelMeta = CHANNEL_META[channel] || CHANNEL_META.call;

    // Validate name
    if (!name || name.length < 2) {
      const nameInp = $('#lf-name');
      if (nameInp) {
        nameInp.style.borderColor = '#F87171';
        nameInp.focus();
        setTimeout(() => { nameInp.style.borderColor = ''; }, 2500);
      }
      return;
    }

    // Validate contact based on channel
    if (channelMeta.mask === 'phone') {
      // Подсчитать только цифры — должно быть ровно 11 (русский номер)
      const digits = contact.replace(/\D/g, '');
      if (digits.length !== 11) {
        showFieldError('Введите полный номер из 11 цифр (например, +7 999 123 45 67)');
        const inp = $('#lf-phone');
        if (inp) inp.focus();
        return;
      }
    } else if (channelMeta.mask === 'tg') {
      // Telegram-ник: минимум 4 символа. Если без @ — добавить
      if (!contact || contact.length < 4) {
        showFieldError('Укажите ник в Telegram (например, @username) или номер телефона');
        const inp = $('#lf-phone');
        if (inp) inp.focus();
        return;
      }
      // Если выглядит как ник, но без @ — добавим
      if (!/^[+\d]/.test(contact) && !contact.startsWith('@')) {
        contact = '@' + contact;
      }
    }
    clearFieldError();

    const submitBtn = form.querySelector('button[type=submit]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Отправляем...';
    }

    // Build Telegram message
    const ts = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tomsk' });
    const url = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
    const text = [
      '🚗 <b>НОВАЯ ЗАЯВКА — POWER Car</b>',
      '',
      `👤 <b>Имя:</b> ${escapeTg(name)}`,
      `📞 <b>${escapeTg(channelMeta.label)}:</b> ${escapeTg(contact)}`,
      `💬 <b>Способ связи:</b> ${escapeTg(channelMeta.name)}`,
      '',
      `🕒 ${escapeTg(ts)} (Томск)`,
      `🔗 ${escapeTg(url)}`
    ].join('\n');

    try {
      const sent = await sendToTelegram(text);
      if (sent) {
        // Цель Метрики: заявка успешно отправлена
        track('lead_submitted', { channel: channelMeta.name });
      }
      if (submitBtn) {
        submitBtn.disabled = !sent;
        submitBtn.innerHTML = sent ? '✓ Заявка принята' : '⚠ Не удалось отправить';
        if (sent) submitBtn.style.background = 'linear-gradient(180deg, #34D399, #10B981)';
      }
      if (sent) {
        setTimeout(() => {
          form.reset();
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml || 'Отправить';
            submitBtn.style.background = '';
          }
        }, 3500);
      } else {
        // Restore button after 2.5s so user can retry
        setTimeout(() => {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml || 'Отправить';
          }
        }, 2500);
        alert('Не удалось отправить заявку. Позвоните нам напрямую или попробуйте позже.');
      }
    } catch (err) {
      console.error('Form submit error:', err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml || 'Отправить';
      }
      alert('Не удалось отправить заявку. Позвоните нам напрямую или попробуйте позже.');
    }
  });
}

// Escape Telegram HTML special chars
function escapeTg(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Send message to Telegram bot
async function sendToTelegram(text) {
  if (!TG_BOT_TOKEN || TG_BOT_TOKEN.indexOf('PASTE_YOUR') === 0) {
    console.warn('TG_BOT_TOKEN is not set yet — submission would normally go to Telegram');
    return false;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!r.ok) {
      console.error('Telegram API error:', r.status, await r.text());
      return false;
    }
    const data = await r.json();
    return !!data.ok;
  } catch (e) {
    console.error('Telegram fetch failed:', e);
    return false;
  }
}

// ============ INIT ============
async function initApp() {
  // Always available UI
  initAnnounce();
  initHeader();
  initRotator();
  initStats();
  initReveal();
  initModal();
  initLightbox();
  initForm();

  // Load data from JSON files
  const { data, source } = await DataSource.loadAll();
  CARS = data.cars || [];
  MOTOS = data.motorcycles || [];
  CASES = data.cases || [];
  TEAM = data.team || [];
  OFFICES = data.offices || [];
  ARTICLES = data.articles || [];
  VIDEOS = data.videos || [];

  if (source === 'cache') {
    console.info('Data loaded from cache');
  } else if (source === 'empty') {
    console.warn('No data loaded — JSON files unreachable, no cache');
  }

  // Render data-driven sections
  renderTop5();
  initTop5Carousel();
  initSelector();
  renderCases();
  initCasesCarousel();
  renderTeam();
  renderOffices();
  renderArticles();
  initArticlesCarousel();
  renderVideos();
  initVideosCarousel();
  initVideoModal();
  initMobileMenu();
  initQuiz();

  // Счётчик кейсов рядом с пунктом "Отзывы" в бургер-меню
  const menuCount = document.getElementById('menuCasesCount');
  if (menuCount && CASES.length) {
    menuCount.textContent = String(CASES.length);
  }

  // Сворачиваемый блок "Как это работает": открыт на desktop, закрыт на mobile
  const stepsCollapse = document.getElementById('stepsCollapse');
  if (stepsCollapse) {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    stepsCollapse.open = isDesktop;
    stepsCollapse.addEventListener('toggle', () => {
      track(stepsCollapse.open ? 'steps_expanded' : 'steps_collapsed');
    });
  }
}

// ============ QUIZ (5-step car selector) ============
// Бюджетные диапазоны (₽) для фильтра по price
const QUIZ_BUDGETS = {
  b1: [0,        700000],
  b2: [700000,   1000000],
  b3: [1000000,  1500000],
  b4: [1500000,  2500000],
  b5: [2500000,  4000000],
  b6: [4000000,  Infinity]
};
// Маппинг квиз-кузова → реальные body в cars.json
const QUIZ_BODY_MAP = {
  kei:   ['hatchback'],               // примерное соответствие (мини-хэтч)
  sedan: ['sedan', 'hatchback'],
  suv:   ['crossover', 'suv'],
  wagon: ['wagon'],
  van:   ['minivan']
};
// Подпись для body
const QUIZ_BODY_LABEL = {
  crossover:'Кроссовер', sedan:'Седан', hatchback:'Хэтчбек',
  suv:'Внедорожник', wagon:'Универсал', minivan:'Минивэн'
};

const QUIZ_LABELS = {
  budget: {
    b1: 'до 700 000 ₽', b2: '700к – 1 млн ₽', b3: '1 – 1,5 млн ₽',
    b4: '1,5 – 2,5 млн ₽', b5: '2,5 – 4 млн ₽', b6: 'свыше 4 млн ₽'
  },
  steering: { right: 'правый руль', left: 'левый руль', both: 'оба варианта' },
  bodyTypes: {
    kei: 'кей-кар', sedan: 'хэтчбек/седан', suv: 'кроссовер/внедорожник',
    wagon: 'универсал', van: 'минивэн'
  },
  power: { low: 'до 160 л.с.', high: 'свыше 160 л.с.' },
  age: { '3-5': '3–5 лет', '5+': 'старше 5 лет', '<3': 'младше 3 лет' }
};

const QUIZ_TG  = 'https://t.me/PowerCar_msk';
const QUIZ_WA  = 'https://wa.me/79138533305';
const QUIZ_LS_KEY = 'pc_quiz_v1';

let QUIZ_STATE = {
  currentStep: 0, // 0 = start
  userSelection: { budget: '', steering: '', bodyTypes: [], power: '', age: '' }
};

function quizLoadState() {
  try {
    const raw = localStorage.getItem(QUIZ_LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        QUIZ_STATE = Object.assign(QUIZ_STATE, saved);
        QUIZ_STATE.userSelection = Object.assign({budget:'',steering:'',bodyTypes:[],power:'',age:''}, saved.userSelection || {});
      }
    }
  } catch (e) {}
}
function quizSaveState() {
  try { localStorage.setItem(QUIZ_LS_KEY, JSON.stringify(QUIZ_STATE)); } catch (e) {}
}

function quizCarSvgIcon() {
  return `<svg class="quiz-car-img-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10 38 L14 26 C15 23 17 22 20 22 L44 22 C47 22 49 23 50 26 L54 38"/>
    <line x1="8" y1="38" x2="56" y2="38"/>
    <rect x="8" y="38" width="48" height="10" rx="2"/>
    <circle cx="18" cy="48" r="4" fill="currentColor"/>
    <circle cx="46" cy="48" r="4" fill="currentColor"/>
    <line x1="22" y1="30" x2="42" y2="30"/>
  </svg>`;
}

function quizBuildSummaryText() {
  const s = QUIZ_STATE.userSelection;
  const lines = [];
  lines.push('Здравствуйте! Я прошёл квиз на сайте POWER Car. Параметры:');
  if (s.budget)    lines.push('• Бюджет: ' + (QUIZ_LABELS.budget[s.budget] || s.budget));
  if (s.steering)  lines.push('• Руль: ' + (QUIZ_LABELS.steering[s.steering] || s.steering));
  if (s.bodyTypes && s.bodyTypes.length) {
    lines.push('• Кузов: ' + s.bodyTypes.map(b => QUIZ_LABELS.bodyTypes[b] || b).join(', '));
  }
  if (s.power)     lines.push('• Мощность: ' + (QUIZ_LABELS.power[s.power] || s.power));
  if (s.age)       lines.push('• Возраст: ' + (QUIZ_LABELS.age[s.age] || s.age));
  lines.push('');
  lines.push('Прошу прислать расчёт пошлины и купон на скидку 10 000 ₽.');
  return lines.join('\n');
}

function quizUpdateSubmitLinks() {
  const text = encodeURIComponent(quizBuildSummaryText());
  const tg = document.getElementById('quizTgBtn');
  const wa = document.getElementById('quizWaBtn');
  if (tg) tg.href = QUIZ_TG + '?text=' + text;
  if (wa) wa.href = QUIZ_WA + '?text=' + text;
}

function quizFilterCatalog() {
  if (!Array.isArray(CARS) || !CARS.length) return [];
  const s = QUIZ_STATE.userSelection;

  // Budget → price
  const [pMin, pMax] = QUIZ_BUDGETS[s.budget] || [0, Infinity];

  // Steering → wheel
  const wheelMap = { right: 'right', left: 'left', both: null };
  const wheelWanted = wheelMap[s.steering];

  // Body types (multi) → set of catalog body keys
  let wantedBodies = null;
  if (Array.isArray(s.bodyTypes) && s.bodyTypes.length) {
    wantedBodies = new Set();
    s.bodyTypes.forEach(t => (QUIZ_BODY_MAP[t] || []).forEach(b => wantedBodies.add(b)));
  }

  // Power: low ≤160, high >160 (cars with no power data: leave in for low, exclude for high)
  const powerLow  = s.power === 'low';
  const powerHigh = s.power === 'high';

  // Age (NOW = 2026, как в остальном коде)
  const NOW = 2026;
  let yearMin = -Infinity, yearMax = Infinity;
  if (s.age === '3-5')      { yearMin = NOW - 5; yearMax = NOW - 3; }
  else if (s.age === '5+')  { yearMax = NOW - 5; }
  else if (s.age === '<3')  { yearMin = NOW - 2; }

  const result = CARS.filter(car => {
    if (typeof car.price === 'number' && (car.price < pMin || car.price > pMax)) return false;
    if (wheelWanted && car.wheel !== wheelWanted) return false;
    if (wantedBodies && !wantedBodies.has(car.body)) return false;
    if (powerLow  && car.power && car.power > 160) return false;
    if (powerHigh && (!car.power || car.power <= 160)) return false;
    if (car.year < yearMin || car.year > yearMax) return false;
    return true;
  });

  // Sort: хиты вперёд, потом по цене возрастанию
  result.sort((a, b) => {
    if (a.hit && !b.hit) return -1;
    if (!a.hit && b.hit) return 1;
    return (a.price || 0) - (b.price || 0);
  });

  return result.slice(0, 5);
}

function quizCarBadge(car) {
  if (car.hit) return 'Хит каталога';
  if (car.power && car.power <= 160) return 'Минимальный акциз';
  if (car.year >= 2021 && car.year <= 2023) return 'Проходной возраст';
  if (car.country === 'China') return 'Низкая пошлина (КНР)';
  return 'Подходит под параметры';
}

function quizRenderCars() {
  const wrap = document.getElementById('quizCars');
  if (!wrap) return;
  const list = quizFilterCatalog();

  if (!list.length) {
    wrap.innerHTML = `
      <div class="quiz-cars-empty">
        <div class="quiz-cars-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h4>В каталоге пока нет точных совпадений</h4>
        <p>Найдём авто под ваши параметры на аукционе — пришлите ответы в Telegram, подберём индивидуально.</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = list.map(car => {
    const title = `${escapeHtml(car.brand)} ${escapeHtml(car.model)} ${car.year}`;
    const specParts = [];
    if (car.engine) specParts.push(escapeHtml(car.engine));
    specParts.push(car.wheel === 'right' ? 'Правый руль' : 'Левый руль');
    if (QUIZ_BODY_LABEL[car.body]) specParts.push(QUIZ_BODY_LABEL[car.body]);
    const spec = specParts.join(' · ');
    const photo = (car.photos && car.photos[0])
      ? `<img src="${escapeHtml(car.photos[0])}" alt="${title}" loading="lazy" />`
      : quizCarSvgIcon();
    // Цена крупно (как в каталоге) + зачёркнутая рыночная если есть
    const priceFmt = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
    const priceMarket = (car.priceMarket && car.priceMarket > car.price)
      ? `<span class="quiz-car-price-market">${priceFmt(car.priceMarket)}</span>` : '';
    const priceBlock = car.price ? `<div class="quiz-car-price">${priceFmt(car.price)}${priceMarket}</div>` : '';
    // Ссылка на страницу авто (slugify как в build.py: [^A-Za-z0-9_-] → -)
    const slug = String(car.id || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    const href = slug ? `/auto/${slug}.html` : '#cta';
    return `
    <article class="quiz-car" data-car-id="${escapeHtml(car.id || '')}">
      <div class="quiz-car-img">${photo}</div>
      <div class="quiz-car-body">
        <div class="quiz-car-name">${title}</div>
        <div class="quiz-car-spec">${spec}</div>
        ${priceBlock}
        <a class="quiz-car-btn" href="${href}" data-quiz-car-cta="${escapeHtml(car.brand)} ${escapeHtml(car.model)}">
          Узнать подробности
        </a>
      </div>
    </article>`;
  }).join('');
}

function quizShowScreen(step) {
  const shell = document.getElementById('quizShell');
  if (!shell) return;
  shell.querySelectorAll('.quiz-screen').forEach(el => el.classList.remove('active'));
  let target;
  if (step === 0) target = shell.querySelector('[data-quiz-screen="start"]');
  else if (step === 'result') target = shell.querySelector('[data-quiz-screen="result"]');
  else target = shell.querySelector('[data-quiz-screen="' + step + '"]');
  if (target) target.classList.add('active');

  // Progress bar visibility + state
  const prog = document.getElementById('quizProgress');
  if (prog) {
    if (step === 0) {
      prog.hidden = true;
    } else {
      prog.hidden = false;
      const stepNum = step === 'result' ? 6 : Number(step);
      prog.querySelectorAll('.quiz-progress-seg').forEach(seg => {
        const n = Number(seg.dataset.seg);
        seg.classList.remove('done', 'current');
        if (n < stepNum) seg.classList.add('done');
        else if (n === stepNum) seg.classList.add('current');
      });
    }
  }

  QUIZ_STATE.currentStep = step;
  quizSaveState();
}

function quizPaintSelections() {
  const shell = document.getElementById('quizShell');
  if (!shell) return;
  shell.querySelectorAll('.quiz-options').forEach(group => {
    const key = group.dataset.quizGroup;
    const multi = group.dataset.quizMulti === 'true';
    const val = QUIZ_STATE.userSelection[key];
    group.querySelectorAll('.quiz-opt').forEach(opt => {
      const v = opt.dataset.quizValue;
      let selected = false;
      if (multi && Array.isArray(val)) selected = val.includes(v);
      else selected = (val === v);
      opt.classList.toggle('selected', selected);
    });
  });
}

function initQuiz() {
  const shell = document.getElementById('quizShell');
  if (!shell) return;

  quizLoadState();
  quizPaintSelections();

  // Start from saved step if user reloads mid-quiz; restart on result if they don't reopen
  quizShowScreen(QUIZ_STATE.currentStep || 0);
  if (QUIZ_STATE.currentStep === 'result') {
    quizRenderCars();
    quizUpdateSubmitLinks();
  }

  // Option clicks
  shell.addEventListener('click', (e) => {
    const opt = e.target.closest('.quiz-opt');
    if (opt) {
      const group = opt.closest('.quiz-options');
      const key = group.dataset.quizGroup;
      const multi = group.dataset.quizMulti === 'true';
      const value = opt.dataset.quizValue;

      if (multi) {
        const arr = Array.isArray(QUIZ_STATE.userSelection[key]) ? QUIZ_STATE.userSelection[key] : [];
        const i = arr.indexOf(value);
        if (i >= 0) arr.splice(i, 1); else arr.push(value);
        QUIZ_STATE.userSelection[key] = arr;
        quizPaintSelections();
        quizSaveState();
      } else {
        QUIZ_STATE.userSelection[key] = value;
        quizPaintSelections();
        quizSaveState();
        // Auto-advance on single-select
        setTimeout(() => {
          const cur = QUIZ_STATE.currentStep;
          if (cur === 5) {
            quizShowScreen('result');
            quizRenderCars();
            quizUpdateSubmitLinks();
            track('quiz_completed', { budget: QUIZ_STATE.userSelection.budget });
          } else if (typeof cur === 'number' && cur >= 1 && cur < 5) {
            quizShowScreen(cur + 1);
            track('quiz_step_' + (cur + 1));
          }
        }, 220);
      }
      return;
    }

    const action = e.target.closest('[data-quiz-action]');
    if (action) {
      const a = action.dataset.quizAction;
      if (a === 'start') {
        quizShowScreen(1);
        track('quiz_started');
      } else if (a === 'back') {
        const cur = QUIZ_STATE.currentStep;
        if (cur === 'result') quizShowScreen(5);
        else if (typeof cur === 'number' && cur > 1) quizShowScreen(cur - 1);
        else if (cur === 1) quizShowScreen(0);
      } else if (a === 'next') {
        const cur = QUIZ_STATE.currentStep;
        // Multi-select step 3: require at least 1 body type
        if (cur === 3) {
          const arr = QUIZ_STATE.userSelection.bodyTypes;
          if (!arr || arr.length === 0) {
            // light error: shake the options
            const grp = shell.querySelector('[data-quiz-group="bodyTypes"]');
            if (grp) {
              grp.animate(
                [{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],
                {duration: 280}
              );
            }
            return;
          }
          quizShowScreen(4);
          track('quiz_step_4');
        } else if (typeof cur === 'number' && cur >= 1 && cur < 5) {
          quizShowScreen(cur + 1);
        } else if (cur === 5) {
          quizShowScreen('result');
          quizRenderCars();
          quizUpdateSubmitLinks();
          track('quiz_completed', { budget: QUIZ_STATE.userSelection.budget });
        }
      } else if (a === 'restart') {
        QUIZ_STATE = {
          currentStep: 0,
          userSelection: { budget: '', steering: '', bodyTypes: [], power: '', age: '' }
        };
        quizSaveState();
        quizPaintSelections();
        quizShowScreen(0);
        track('quiz_restarted');
      }
    }
  });

  // Track car-card clicks
  shell.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quiz-car-cta]');
    if (btn) track('quiz_car_cta', { car: btn.dataset.quizCarCta });
  });
}

// ============ MOBILE MENU ============
function initMobileMenu() {
  const menu = $('#mobileMenu');
  const burger = $('#headerBurger');
  const closeBtn = $('#mobileMenuClose');
  const backdrop = $('#mobileMenuBackdrop');
  if (!menu || !burger) return;

  const open = () => {
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-open');
    track('menu_opened'); // Цель Метрики
  };
  const close = () => {
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  };

  burger.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  // Закрыть при клике на пункт меню
  menu.querySelectorAll('.mobile-menu-link').forEach(link => {
    link.addEventListener('click', close);
  });
  // Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) close();
  });
}

// Prevent browser from restoring/jumping scroll position on load (mobile bug fix)
if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

function safeInit() {
  try { initApp(); } catch (e) { console.error('Init error:', e); }
  // Force scroll to top on load UNLESS the URL has a real anchor (#section)
  try {
    var hash = window.location.hash;
    if (!hash || hash === '#' || hash.length < 2) {
      // Defer to after layout/reveal so it sticks
      window.scrollTo(0, 0);
      requestAnimationFrame(function () { window.scrollTo(0, 0); });
      setTimeout(function () { window.scrollTo(0, 0); }, 60);
    }
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit);
} else {
  safeInit();
}

// Expose modal openers (used by tests and potential deep-linking)
if (typeof window !== 'undefined') {
  window.openCarModal = openCarModal;
  window.openLightbox = openLightbox;
  window.openCaseModal = openCaseModal;
}

// ============ COOKIE CONSENT ============
// ============ VIDEOS SECTION ============
function renderVideos() {
  const track = $('#videosTrack');
  if (!track) return;
  const list = (VIDEOS || []).filter(v => v.active !== false);
  track.innerHTML = '';
  if (!list.length) {
    // Если совсем нет видео — скрываем секцию
    const section = $('#videos');
    if (section) section.style.display = 'none';
    return;
  }
  list.forEach((v, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'video-card';
    card.dataset.idx = String(idx);
    card.setAttribute('aria-label', 'Открыть видео-обзор');
    let thumbHtml;
    if (v.thumbnail && v.thumbnail.trim()) {
      thumbHtml = `<img class="video-card-thumb" src="${escapeHtml(v.thumbnail)}" alt="" loading="lazy" />`;
    } else {
      // Заглушка для видео без обложки
      thumbHtml = `<div class="video-card-placeholder"><div style="font-size:2rem;margin-bottom:6px;">🎬</div><div>Видео ${idx + 1}</div></div>`;
    }
    card.innerHTML = `
      ${thumbHtml}
      <div class="video-card-overlay">
        <div class="video-card-play">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openVideoModal(idx));
    track.appendChild(card);
  });
}

// escape для безопасной вставки в HTML
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function initVideosCarousel() {
  const track = $('#videosTrack');
  const prev = $('#videosPrev');
  const next = $('#videosNext');
  if (!track || !prev || !next) return;
  const scrollBy = () => Math.round(track.clientWidth * 0.85);
  prev.addEventListener('click', () => track.scrollBy({ left: -scrollBy(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: scrollBy(), behavior: 'smooth' }));
}

let videoModalCurrentIdx = 0;
function openVideoModal(idx) {
  const modal = $('#videoModal');
  const frame = $('#videoModalFrame');
  const empty = $('#videoModalEmpty');
  if (!modal || !frame || !empty) return;
  const list = (VIDEOS || []).filter(v => v.active !== false);
  if (!list.length) return;
  videoModalCurrentIdx = Math.max(0, Math.min(idx, list.length - 1));
  const v = list[videoModalCurrentIdx];
  // Цель Метрики
  track('video_opened', { idx: videoModalCurrentIdx, title: (v && v.title) || '' });
  // Если есть ссылка — рендерим iframe, иначе показываем заглушку
  if (v && v.vkEmbedUrl && v.vkEmbedUrl.trim()) {
    let url = v.vkEmbedUrl.trim();
    // Добавим autoplay=1 если ещё не передан
    if (!/[?&]autoplay=/.test(url)) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'autoplay=1';
    if (!/[?&]js_api=/.test(url)) url += '&js_api=1';
    frame.innerHTML = `<iframe src="${escapeHtml(url)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;" frameborder="0" allowfullscreen></iframe>`;
    frame.style.display = 'block';
    empty.style.display = 'none';
  } else {
    frame.innerHTML = '';
    frame.style.display = 'none';
    empty.style.display = 'grid';
  }
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('menu-open'); // блокируем скролл фона
}

function closeVideoModal() {
  const modal = $('#videoModal');
  const frame = $('#videoModalFrame');
  if (!modal || !frame) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  // Очищаем iframe чтобы остановить видео
  frame.innerHTML = '';
  document.body.classList.remove('menu-open');
}

function videoModalNav(direction) {
  const list = (VIDEOS || []).filter(v => v.active !== false);
  if (!list.length) return;
  let next = videoModalCurrentIdx + direction;
  if (next < 0) next = list.length - 1;
  if (next >= list.length) next = 0;
  openVideoModal(next);
}

function initVideoModal() {
  const modal = $('#videoModal');
  if (!modal) return;
  const closeBtn = $('#videoModalClose');
  const backdrop = $('#videoModalBackdrop');
  const prev = $('#videoModalPrev');
  const next = $('#videoModalNext');
  if (closeBtn) closeBtn.addEventListener('click', closeVideoModal);
  if (backdrop) backdrop.addEventListener('click', closeVideoModal);
  if (prev) prev.addEventListener('click', () => videoModalNav(-1));
  if (next) next.addEventListener('click', () => videoModalNav(1));
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') closeVideoModal();
    if (e.key === 'ArrowLeft') videoModalNav(-1);
    if (e.key === 'ArrowRight') videoModalNav(1);
  });
  // Свайпы на мобильном
  let touchStartX = 0;
  let touchStartY = 0;
  modal.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  modal.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      videoModalNav(dx > 0 ? -1 : 1);
    } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
      closeVideoModal();
    }
  }, { passive: true });
}

// ============ GLOBAL CLICK TRACKING (Метрика) ============
document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';

  // Звонок — tel:
  if (href.startsWith('tel:')) {
    track('phone_clicked', { number: href.replace('tel:', '') });
    return;
  }

  // WhatsApp / MAX мессенджеры (по содержимому ссылки)
  if (/wa\.me|whatsapp/i.test(href) || /max\.ru/i.test(href)) {
    track('messenger_clicked', { service: /wa\.me|whatsapp/i.test(href) ? 'whatsapp' : 'max' });
    return;
  }

  // Соцсети
  if (/instagram\.com/i.test(href)) { track('social_clicked', { network: 'instagram' }); return; }
  if (/vk\.com/i.test(href))       { track('social_clicked', { network: 'vk' }); return; }
  if (/t\.me|telegram/i.test(href)){ track('social_clicked', { network: 'telegram' }); return; }

  // Статьи (article.html?slug=... или внутренние якоря на статьи)
  if (/article\.html|\/articles\//i.test(href) || href === '#articles') {
    track('articles_visited');
    return;
  }

  // Документы — политика / соглашение / договор
  if (/docs\/privacy|docs\/terms|docs\/agreement|^privacy\.html|^terms\.html|^agreement\.html/i.test(href)) {
    let docType = 'other';
    if (/privacy/i.test(href)) docType = 'privacy';
    else if (/terms/i.test(href)) docType = 'terms';
    else if (/agreement/i.test(href)) docType = 'agreement';
    track('doc_opened', { type: docType });
    return;
  }
}, { capture: false });

function initCookieConsent() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (localStorage.getItem('powercar_cookie_consent') === 'yes') return;
  } catch (e) { /* ignore */ }
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Уведомление об использовании cookies');
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <div class="cookie-banner-text">
        Мы используем файлы cookie для удобства работы сайта и улучшения сервиса.
        Продолжая использовать сайт, вы соглашаетесь с этим.
        Подробнее в <a href="docs/privacy.html" target="_blank" rel="noopener">политике конфиденциальности</a>.
      </div>
      <button type="button" class="cookie-banner-btn" id="cookieAccept">Понятно</button>
    </div>
  `;
  document.body.appendChild(banner);
  // Анимация появления
  requestAnimationFrame(() => banner.classList.add('show'));
  const accept = document.getElementById('cookieAccept');
  if (accept) {
    accept.addEventListener('click', () => {
      try { localStorage.setItem('powercar_cookie_consent', 'yes'); } catch (e) {}
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 350);
    });
  }
}
// run as soon as DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieConsent);
} else {
  initCookieConsent();
}