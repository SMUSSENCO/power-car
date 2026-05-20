// Functional test suite for POWER Car v2 landing
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Pre-load JSON data files to mock fetch
const dataFiles = {};
['cars','motorcycles','cases','team','offices','articles'].forEach(name => {
  const filePath = path.join(__dirname, 'data', `${name}.json`);
  if (fs.existsSync(filePath)) {
    dataFiles[`data/${name}.json`] = fs.readFileSync(filePath, 'utf8');
  }
});

// Polyfills needed for jsdom (no IO/matchMedia/raf)
const setup = async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://power-car.test/'
  });
  const { window } = dom;
  // Polyfills
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = () => ({ matches: false, addListener:()=>{}, removeListener:()=>{}, addEventListener:()=>{}, removeEventListener:()=>{} });
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollBy = () => {};
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollBy = function () {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  // requestSubmit polyfill (jsdom doesn't implement it)
  if (!window.HTMLFormElement.prototype.requestSubmit) {
    window.HTMLFormElement.prototype.requestSubmit = function(btn) {
      const submitEvent = new window.Event('submit', { bubbles: true, cancelable: true });
      this.dispatchEvent(submitEvent);
    };
  }
  // Mock fetch to return our JSON data
  window.fetch = (url) => {
    // Normalize: strip query, leading slash
    const key = url.replace(/^.*?\/data\//, 'data/').split('?')[0];
    if (dataFiles[key]) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(JSON.parse(dataFiles[key]))
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  };

  // Extract and run script content
  const scripts = dom.window.document.querySelectorAll('script');
  scripts.forEach(s => {
    const code = s.textContent;
    if (!code || !code.trim()) return;
    if (code.includes('"@context"')) return; // JSON-LD
    try {
      window.eval(code);
    } catch (e) {
      console.error('Script error:', e.message);
    }
  });

  // Manually trigger DOMContentLoaded since runScripts:outside-only doesn't auto-fire
  const evt = new window.Event('DOMContentLoaded');
  window.document.dispatchEvent(evt);

  // Wait for async init (fetch + render) to complete
  await new Promise(resolve => setTimeout(resolve, 50));

  return { dom, window, document: window.document };
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// ============ STRUCTURE TESTS ============
test('Has DOCTYPE', async () => {
  assert(html.startsWith('<!DOCTYPE html>'), 'Missing DOCTYPE');
});

test('Has viewport meta with viewport-fit=cover', async () => {
  assert(/viewport-fit=cover/.test(html), 'Missing viewport-fit=cover for iOS safe areas');
});

test('Russian lang attribute', async () => {
  assert(/<html\s+lang="ru"/.test(html), 'Missing lang="ru"');
});

test('Has Open Graph tags', async () => {
  assert(/og:title/.test(html) && /og:description/.test(html), 'Missing OG tags');
});

test('Has JSON-LD AutoDealer schema', async () => {
  assert(/"@type":\s*"AutoDealer"/.test(html), 'Missing AutoDealer schema');
});

test('Header structure', async () => {
  const { document } = await setup();
  assert(document.querySelector('#header'), 'Missing #header');
  assert(document.querySelector('#announce'), 'Missing announcement bar');
});

test('City silhouettes REMOVED from header', async () => {
  const { document } = await setup();
  assert(!document.querySelector('.cities-strip'), 'Cities strip should be removed');
});

test('Announcement bar text', async () => {
  assert(/Подбор и консультация — бесплатно/.test(html), 'Missing announcement text');
});

test('Mobile FAB has 3 buttons', async () => {
  const { document } = await setup();
  const fabBtns = document.querySelectorAll('.fab .fab-btn');
  assert(fabBtns.length === 3, `Expected 3 FAB buttons, got ${fabBtns.length}`);
});

test('Header has animated buttons', async () => {
  assert(/btn-pulse/.test(html), 'Missing pulse animation class');
  assert(/btn-shine/.test(html), 'Missing shine animation class');
});

test('Hero has routes-map SVG', async () => {
  const { document } = await setup();
  assert(document.querySelector('.routes-map svg'), 'Missing routes map');
});

test('Country rotator initial state', async () => {
  const { document } = await setup();
  assert(document.querySelector('#rotator'), 'Missing rotator');
});

test('Stats section has 3 items', async () => {
  const { document } = await setup();
  const stats = document.querySelectorAll('.stat');
  assert(stats.length === 3, `Expected 3 stats, got ${stats.length}`);
});

// ============ ADVANTAGES ============
test('Advantages section has 6 cards', async () => {
  const { document } = await setup();
  const advs = document.querySelectorAll('.adv');
  assert(advs.length === 6, `Expected 6 advantages, got ${advs.length}`);
});

test('Advantages: до 45 дней (not just 45)', async () => {
  assert(/До 45 дней/.test(html) || /до 45 дней/.test(html), 'Missing "до 45 дней"');
});

// ============ TOP-5 CAROUSEL ============
test('Top-5 renders cards', async () => {
  const { document } = await setup();
  const cards = document.querySelectorAll('#top5Track .car-card');
  assert(cards.length === 5, `Expected 5 top cards, got ${cards.length}`);
});

test('Top-5 ribbons present', async () => {
  const { document } = await setup();
  const ribbons = document.querySelectorAll('#top5Track .car-top-ribbon');
  assert(ribbons.length === 5, `Expected 5 ribbons, got ${ribbons.length}`);
});

test('Top-5 prev/next buttons exist', async () => {
  const { document } = await setup();
  assert(document.querySelector('#top5Prev'), 'Missing #top5Prev');
  assert(document.querySelector('#top5Next'), 'Missing #top5Next');
});

// ============ SELECTOR ============
test('Selector: type toggle', async () => {
  const { document } = await setup();
  const toggle = document.querySelector('#typeToggle');
  assert(toggle, 'Missing typeToggle');
  assert(toggle.dataset.type === 'auto', 'Initial type should be auto');
});

test('Selector: auto budget chips (7 ranges + All)', async () => {
  const { document } = await setup();
  const chips = document.querySelectorAll('#budgetChips .chip');
  assert(chips.length === 8, `Expected 8 budget chips for auto, got ${chips.length}`);
});

test('Selector: age chips (4 ranges + All = 5)', async () => {
  const { document } = await setup();
  const chips = document.querySelectorAll('#ageChips .chip');
  assert(chips.length === 5, `Expected 5 age chips, got ${chips.length}`);
});

test('Selector: age chip "3-5 лет" has "Выгодно" promo label', async () => {
  const { document } = await setup();
  const promoChip = document.querySelector('#ageChips .chip-promo');
  assert(promoChip, 'Should have chip with .chip-promo class');
  assert(/Выгодно/.test(promoChip.textContent), 'Promo chip should contain "Выгодно"');
  assert(/3.5 лет/.test(promoChip.textContent), 'Promo chip should be 3-5 years');
});

test('Selector: NEW age ranges (0-3, 3-5, 5-10, 10-19) — no old ranges', async () => {
  const { document } = await setup();
  const datas = Array.from(document.querySelectorAll('#ageChips .chip')).map(c => c.dataset.age);
  assert(datas.includes('all'), 'Missing "all"');
  assert(datas.includes('0-3'), 'Missing 0-3 range');
  assert(datas.includes('3-5'), 'Missing 3-5 range');
  assert(datas.includes('5-10'), 'Missing 5-10 range');
  assert(datas.includes('10-19'), 'Missing 10-19 range');
  // Old ranges should be gone
  assert(!datas.includes('3-7'), 'Old 3-7 range should be removed');
  assert(!datas.includes('7-12'), 'Old 7-12 range should be removed');
  assert(!datas.includes('12-17'), 'Old 12-17 range should be removed');
});

// ============ PAGINATION ============
test('Pagination: load-more container present', async () => {
  const { document } = await setup();
  assert(document.querySelector('#loadMoreWrap'), 'Missing #loadMoreWrap container');
});

test('Pagination: PAGE_INITIAL is 6, PAGE_STEP is 3', async () => {
  assert(/PAGE_INITIAL\s*=\s*6/.test(html), 'PAGE_INITIAL should be 6');
  assert(/PAGE_STEP\s*=\s*3/.test(html), 'PAGE_STEP should be 3');
});

test('Pagination: resetPagination function exists and is called', async () => {
  assert(/function resetPagination/.test(html), 'resetPagination function should exist');
  assert((html.match(/resetPagination\(\)/g) || []).length >= 4, 'resetPagination should be called on filter changes');
});

test('Selector: more filters details element', async () => {
  const { document } = await setup();
  assert(document.querySelector('.more-filters'), 'Missing .more-filters');
});

test('Selector: country filter chips', async () => {
  const { document } = await setup();
  const chips = document.querySelectorAll('#countryChips .chip');
  assert(chips.length === 4, `Expected 4 country chips, got ${chips.length}`);
});

test('Selector: results note text', async () => {
  assert(/Авто взяты из базы самых выгодных предложений/.test(html), 'Missing results note');
});

test('Selector: results rendered on load', async () => {
  const { document } = await setup();
  const results = document.querySelectorAll('#resultsGrid .car-card');
  assert(results.length > 0, `Expected results, got ${results.length}`);
});

test('Selector: individual CTA button', async () => {
  assert(/Подобрать индивидуально/.test(html), 'Missing individual CTA');
});

test('Switching to moto changes budget chips count', async () => {
  const { document, window } = await setup();
  const motoBtn = document.querySelector('#typeToggle button[data-type="moto"]');
  motoBtn.click();
  // give event loop
  const chips = document.querySelectorAll('#budgetChips .chip');
  assert(chips.length === 6, `Expected 6 moto budget chips, got ${chips.length}`);
});

test('Moto mode: extra filters appear', async () => {
  const { document } = await setup();
  const motoBtn = document.querySelector('#typeToggle button[data-type="moto"]');
  motoBtn.click();
  const motoExtra = document.querySelector('#motoExtraFilters');
  assert(motoExtra.style.display === 'block', 'Moto extra filters not visible');
});

// ============ CREDIT (compact strip, before footer) ============
test('Credit: compact strip with VTB + Sberbank pills', async () => {
  const { document } = await setup();
  assert(document.querySelector('.credit-strip'), 'Missing .credit-strip');
  assert(/bank-pill-vtb/.test(html) && /bank-pill-sber/.test(html), 'Missing bank pills');
});

test('Credit: positioned just before footer', async () => {
  const { document } = await setup();
  const credit = document.querySelector('#credit');
  const footer = document.querySelector('footer');
  // credit's next section sibling should be footer
  let next = credit ? credit.nextElementSibling : null;
  while (next && next.tagName !== 'FOOTER') next = next.nextElementSibling;
  assert(next === footer, 'Credit should be immediately before footer');
});

test('Credit: link leads to CTA', async () => {
  const { document } = await setup();
  const creditLink = document.querySelector('#credit a[href="#cta"]');
  assert(creditLink, 'Credit should link to #cta');
});

test('Credit: no big credit-card or credit-visual', async () => {
  const { document } = await setup();
  assert(!document.querySelector('.credit-card'), 'Old big credit-card should be removed');
  assert(!document.querySelector('.credit-visual'), 'Old credit-visual should be removed');
});

// ============ STEPS ============
test('Steps has 4 cards', async () => {
  const { document } = await setup();
  const steps = document.querySelectorAll('.step');
  assert(steps.length === 4, `Expected 4 steps, got ${steps.length}`);
});

test('Steps: photo-report and diagnostics highlight', async () => {
  assert(/Фото-отчёт \+ протокол диагностики/.test(html), 'Missing photo-report + diagnostics text');
});

test('Steps: tracking in real time', async () => {
  assert(/Отслеживание в реальном времени/.test(html), 'Missing tracking text');
});

// ============ LEGAL ============
test('Legal protection has 4 items', async () => {
  const { document } = await setup();
  const legals = document.querySelectorAll('.legal');
  assert(legals.length === 4, `Expected 4 legal items, got ${legals.length}`);
});

// ============ CASES ============
test('Cases render on load', async () => {
  const { document } = await setup();
  const cases = document.querySelectorAll('#casesTrack .case');
  assert(cases.length >= 3, `Expected at least 3 cases, got ${cases.length}`);
});

test('Cases use scroll-padding-inline-end (right edge fix)', async () => {
  assert(/scroll-padding-inline-(start|end)/.test(html), 'Missing scroll-padding-inline (right-edge fix)');
});

test('Cases: car title as main heading', async () => {
  const { document } = await setup();
  const firstCase = document.querySelector('#casesTrack .case');
  const title = firstCase.querySelector('.case-title');
  assert(title && title.textContent.trim().length > 3, 'Case title missing or empty');
});

test('Cases: client name as subtitle', async () => {
  const { document } = await setup();
  const firstCase = document.querySelector('#casesTrack .case');
  assert(firstCase.querySelector('.case-client'), 'Missing client subtitle');
});

test('Cases: photo count badge', async () => {
  const { document } = await setup();
  const firstCase = document.querySelector('#casesTrack .case');
  assert(firstCase.querySelector('.car-photo-count'), 'Missing photo count');
});

test('Cases: opening case opens modal', async () => {
  const { document, window } = await setup();
  const firstCase = document.querySelector('#casesTrack .case');
  firstCase.click();
  const backdrop = document.querySelector('#modalBackdrop');
  assert(backdrop.classList.contains('open'), 'Modal did not open on case click');
});

// ============ VIDEO ============
test('Video placeholder with 3 channels (YT/Rutube/VK)', async () => {
  const { document } = await setup();
  const channels = document.querySelectorAll('.video-channel');
  assert(channels.length === 3, `Expected 3 video channels, got ${channels.length}`);
});

// ============ TEAM ============
test('Team has 4 members', async () => {
  const { document } = await setup();
  const members = document.querySelectorAll('.member');
  assert(members.length === 4, `Expected 4 team members, got ${members.length}`);
});

// ============ OFFICES ============
test('Offices: 3 cities', async () => {
  const { document } = await setup();
  const offices = document.querySelectorAll('.office');
  assert(offices.length === 3, `Expected 3 offices, got ${offices.length}`);
});

test('Offices: non-coming-soon offices have phone + MAX button', async () => {
  const { document } = await setup();
  const offices = document.querySelectorAll('.office:not(.office-coming-soon)');
  assert(offices.length >= 2, `Expected 2+ active offices, got ${offices.length}`);
  offices.forEach((o, i) => {
    assert(o.querySelector('.office-phone'), `Active office ${i} missing phone`);
    assert(o.querySelector('.office-max'), `Active office ${i} missing MAX button`);
  });
});

// ============ FAQ ============
test('FAQ has 6 questions', async () => {
  const { document } = await setup();
  const faqs = document.querySelectorAll('.faq-item');
  assert(faqs.length === 6, `Expected 6 FAQ items, got ${faqs.length}`);
});

test('FAQ: native details element', async () => {
  const { document } = await setup();
  const faq = document.querySelector('.faq-item');
  assert(faq.tagName === 'DETAILS', 'FAQ should use <details>');
});

// ============ CTA ============
test('CTA: new headline', async () => {
  assert(/Получите 3 варианта под ваш бюджет/.test(html), 'Missing new CTA headline');
});

test('CTA: new subtitle (about reports)', async () => {
  assert(/Сегодня менеджер подберёт лучшие варианты/.test(html), 'Missing new CTA subtitle');
});

test('CTA: only 1 anchor plaque (Подбор бесплатно)', async () => {
  const { document } = await setup();
  const anchors = document.querySelectorAll('.cta-anchor');
  assert(anchors.length === 1, `Expected 1 CTA anchor, got ${anchors.length}`);
});

test('CTA: anchor "Подбор бесплатно" is present', async () => {
  const { document } = await setup();
  const anchor = document.querySelector('.cta-anchor');
  assert(anchor && /Подбор и консультация — бесплатно/.test(anchor.textContent), 'Missing main anchor text');
});

test('CTA: anchors "Фото-отчёт" and "Логистика" REMOVED', async () => {
  const { document } = await setup();
  const ctaSection = document.querySelector('#cta');
  const ctaHtml = ctaSection ? ctaSection.innerHTML : '';
  assert(!/Фото-отчёт на каждом этапе/.test(ctaHtml), 'Фото-отчёт anchor should be removed');
  assert(!/Отчёт о логистике в реальном времени/.test(ctaHtml), 'Logistics anchor should be removed');
});

test('CTA: no "10 минут" promise', async () => {
  // we removed this text below the submit button
  // Make sure it's not in the cta-form area
  const ctaIdx = html.indexOf('id="cta"');
  const ctaEnd = html.indexOf('</section>', ctaIdx);
  const ctaSection = html.slice(ctaIdx, ctaEnd);
  // FAQ has it elsewhere maybe; check just cta section
  assert(!/10 минут/.test(ctaSection), '10 минут promise should not be in CTA');
});

test('CTA: channel chips (4 options)', async () => {
  const { document } = await setup();
  const chips = document.querySelectorAll('#channelChips .channel-chip');
  assert(chips.length === 4, `Expected 4 channel chips, got ${chips.length}`);
});

test('CTA: consent checkbox unchecked by default (152-ФЗ)', async () => {
  const { document } = await setup();
  const consent = document.querySelector('#consent');
  assert(consent && !consent.checked, 'Consent must be unchecked by default');
});

test('CTA: form has phone field with inputmode=tel', async () => {
  const { document } = await setup();
  const phone = document.querySelector('#lf-phone');
  assert(phone && phone.getAttribute('inputmode') === 'tel', 'Phone field needs inputmode=tel');
});

test('CTA: input font-size 16px (iOS no-zoom)', async () => {
  // Check CSS rule presence
  assert(/font-size:\s*16px/i.test(html), 'Inputs need 16px to prevent iOS zoom');
});

// ============ FOOTER ============
test('Footer: 7 social icons', async () => {
  const { document } = await setup();
  const socials = document.querySelectorAll('.social-grid .social-icon');
  assert(socials.length === 7, `Expected 7 social icons, got ${socials.length}`);
});

test('Footer has 3 office contacts', async () => {
  const { document } = await setup();
  const offices = document.querySelectorAll('.footer-office');
  assert(offices.length === 3, `Expected 3 footer offices, got ${offices.length}`);
});

// ============ MODAL ============
test('Modal opens on car details click', async () => {
  const { document } = await setup();
  const detailsBtn = document.querySelector('#top5Track .car-card [data-action="details"]');
  detailsBtn.click();
  const backdrop = document.querySelector('#modalBackdrop');
  assert(backdrop.classList.contains('open'), 'Modal did not open');
});

test('Modal: car details has price breakdown', async () => {
  const { document } = await setup();
  const detailsBtn = document.querySelector('#top5Track .car-card [data-action="details"]');
  detailsBtn.click();
  assert(document.querySelector('.modal-breakdown'), 'Missing price breakdown in modal');
});

test('Modal: car details has disclaimer about price', async () => {
  const { document } = await setup();
  const detailsBtn = document.querySelector('#top5Track .car-card [data-action="details"]');
  detailsBtn.click();
  const disc = document.querySelector('.modal-disclaimer');
  assert(disc && /не являются публичной офертой/.test(disc.textContent), 'Missing price disclaimer');
});

test('Modal closes on Escape', async () => {
  const { document, window } = await setup();
  const detailsBtn = document.querySelector('#top5Track .car-card [data-action="details"]');
  detailsBtn.click();
  const backdrop = document.querySelector('#modalBackdrop');
  assert(backdrop.classList.contains('open'), 'Modal should be open');
  const event = new window.KeyboardEvent('keydown', { key: 'Escape' });
  document.dispatchEvent(event);
  assert(!backdrop.classList.contains('open'), 'Modal should close on Escape');
});

// ============ FORM SUBMISSION ============
test('Form submit blocks without consent', async () => {
  const { document, window } = await setup();
  const form = document.querySelector('#leadForm');
  const name = document.querySelector('#lf-name');
  const phone = document.querySelector('#lf-phone');
  name.value = 'Тест';
  phone.value = '+7 (999) 123-45-67';
  // Override alert to capture
  let alerted = false;
  window.alert = () => { alerted = true; };
  // Submit (consent is unchecked by default)
  const submitEvent = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(submitEvent);
  assert(alerted, 'Should alert about missing consent');
});

test('Form submit succeeds with consent', async () => {
  const { document, window } = await setup();
  const form = document.querySelector('#leadForm');
  const name = document.querySelector('#lf-name');
  const phone = document.querySelector('#lf-phone');
  const consent = document.querySelector('#consent');
  name.value = 'Тест';
  phone.value = '+7 (999) 123-45-67';
  consent.checked = true;
  const btn = form.querySelector('button[type=submit]');
  form.requestSubmit ? form.requestSubmit(btn) : btn.click();
  assert(/принята/i.test(btn.innerHTML) || btn.disabled, 'Submit should change button text');
});

// ============ BADGES (all removed in this version) ============
test('No badges on car cards', async () => {
  const { document } = await setup();
  const cards = document.querySelectorAll('.car-card');
  let found = false;
  cards.forEach(c => {
    const badges = c.querySelectorAll('.car-badges .car-badge');
    if (badges.length > 0) found = true;
  });
  assert(!found, 'All car badges should be removed');
});

test('No badge text remains in rendered cards', async () => {
  const { document } = await setup();
  const cards = document.querySelectorAll('.car-card');
  let found = false;
  cards.forEach(c => {
    if (/Низкая таможня|Хит|Новинка|Цена снижена|Срочно/.test(c.innerHTML)) found = true;
  });
  assert(!found, 'No badge text should remain in cards');
});

// ============ NEW: HERO 2-LINE + МОТО ============
test('Hero: mentions Авто и мото', async () => {
  assert(/Авто и мото/.test(html), 'Hero should mention Авто и мото');
});

test('Hero: subtitle mentions мотоцикл', async () => {
  assert(/мотоцикл/i.test(html), 'Subtitle should mention motorcycle');
});

test('Hero: rotator has min-width 6ch (locked width)', async () => {
  assert(/min-width:\s*6ch/.test(html), 'Rotator min-width should be 6ch to fit Японии');
});

test('Hero: smaller h1 clamp', async () => {
  assert(/clamp\(2rem,\s*6\.5vw,\s*4\.75rem\)/.test(html), 'h1 should be downscaled to fit mobile');
});

// ============ NEW: iOS FIX ============
test('Hero: no global min-height: 100vh that breaks iOS', async () => {
  // The bare ".hero { min-height: 100vh" rule should not exist outside of @media
  // We allow it only inside @media (min-width: 1024px)
  const heroBlock = html.match(/\.hero\s*\{[^}]*\}/);
  assert(heroBlock, 'Should find .hero block');
  assert(!/min-height:\s*100vh/.test(heroBlock[0]), '.hero base rule should not set 100vh');
});

// ============ NEW: FONTS — Bunny instead of Google ============
test('Fonts: uses Bunny Fonts, not Google', async () => {
  assert(/fonts\.bunny\.net/.test(html), 'Should use Bunny Fonts');
  assert(!/fonts\.googleapis\.com/.test(html), 'Should not use Google Fonts');
  assert(!/fonts\.gstatic\.com/.test(html), 'Should not preconnect to Google');
});

// ============ NEW: CTA mobile fixes ============
test('CTA: glow ::before hidden on mobile (display:none default)', async () => {
  // Look for the rule: .cta-card::before { ... display: none; }
  // followed by media query that enables it on 1024+
  const ctaBefore = html.match(/\.cta-card::before\s*\{[^}]*\}/);
  assert(ctaBefore, 'Should find .cta-card::before rule');
  assert(/display:\s*none/.test(ctaBefore[0]), '.cta-card::before should be display:none by default');
});

test('CTA: anchor about logistics has no subtitle anymore', async () => {
  // The dropped <br> with grey text about "На каком этапе ваше авто прямо сейчас" should be gone
  assert(!/На каком этапе ваше авто прямо сейчас/.test(html), 'Logistics anchor subtitle should be removed');
});

// ============ NEW: DATA SOURCE / JSON-driven ============
test('Data: DataSource module present in code', async () => {
  assert(/const\s+DataSource\s*=/.test(html), 'DataSource module should be defined');
});

test('Data: fetches data from data/ directory', async () => {
  assert(/data\/cars\.json/.test(html), 'Should fetch cars.json');
  assert(/data\/motorcycles\.json/.test(html), 'Should fetch motorcycles.json');
  assert(/data\/cases\.json/.test(html), 'Should fetch cases.json');
  assert(/data\/team\.json/.test(html), 'Should fetch team.json');
  assert(/data\/offices\.json/.test(html), 'Should fetch offices.json');
});

test('Data: cars are loaded and rendered from JSON', async () => {
  const { document } = await setup();
  const cards = document.querySelectorAll('#top5Track .car-card');
  assert(cards.length >= 1, `Top-5 should render cards from cars.json, got ${cards.length}`);
});

test('Data: team is rendered from JSON', async () => {
  const { document } = await setup();
  const members = document.querySelectorAll('#team .member');
  assert(members.length === 4, `Team should render 4 members from team.json, got ${members.length}`);
});

test('Data: offices are rendered from JSON', async () => {
  const { document } = await setup();
  const offices = document.querySelectorAll('#offices .office');
  assert(offices.length === 3, `Offices should render 3 from offices.json, got ${offices.length}`);
});

test('Data: cases are rendered from JSON', async () => {
  const { document } = await setup();
  const cases = document.querySelectorAll('#casesTrack .case');
  assert(cases.length >= 3, `Cases should render from cases.json, got ${cases.length}`);
});

test('Data: localStorage cache mechanism present', async () => {
  assert(/localStorage\.setItem\(CACHE_KEY/.test(html), 'Should have localStorage caching');
});

test('Data: no hardcoded CARS / MOTOS / CASES arrays anymore', async () => {
  // Should be empty initial arrays, not hardcoded data
  // Check: no Toyota Camry hardcoded line with id property
  assert(!/const CARS = \[\s*\{[^}]*id:'kia-rio'/.test(html), 'CARS array should not contain hardcoded data');
});

// ============ NEW: FOOTER fixes ============
test('Footer: social grid uses flex (no holes)', async () => {
  const sgBlock = html.match(/\.social-grid\s*\{[^}]*\}/);
  assert(sgBlock, 'Should find .social-grid');
  assert(/display:\s*flex/.test(sgBlock[0]), '.social-grid should be flex');
});

test('Footer: no "Навигация" column (removed)', async () => {
  assert(!/<h4>Навигация<\/h4>/.test(html), 'Навигация column should be removed');
});

test('Footer: docs in inline paragraph (compact)', async () => {
  const { document } = await setup();
  assert(document.querySelector('.footer-docs-inline'), 'Should have footer-docs-inline');
});

// ============ v2.3: TEAM TG removed ============
test('Team: NO Telegram buttons rendered', async () => {
  const { document } = await setup();
  const tgBtns = document.querySelectorAll('#team .member-tg');
  assert(tgBtns.length === 0, `Expected 0 telegram buttons in team, got ${tgBtns.length}`);
});

// ============ v2.3: ARTICLES section ============
test('Articles: section exists on main page', async () => {
  const { document } = await setup();
  assert(document.querySelector('#articles'), 'Missing #articles section');
});

test('Articles: track and carousel buttons present', async () => {
  const { document } = await setup();
  assert(document.querySelector('#articlesTrack'), 'Missing #articlesTrack');
  assert(document.querySelector('#articlesPrev'), 'Missing #articlesPrev');
  assert(document.querySelector('#articlesNext'), 'Missing #articlesNext');
});

test('Articles: render from articles.json (3+ cards)', async () => {
  const { document } = await setup();
  const cards = document.querySelectorAll('#articlesTrack .article-card');
  assert(cards.length >= 3, `Expected 3+ article cards, got ${cards.length}`);
});

test('Articles: cards link to article.html with slug param', async () => {
  const { document } = await setup();
  const firstCard = document.querySelector('#articlesTrack .article-card');
  assert(firstCard, 'No article cards');
  const href = firstCard.getAttribute('href');
  assert(href && href.includes('article.html?slug='), `Card href should be article.html?slug=..., got: ${href}`);
});

// ============ v2.3: DOCUMENTS ============
test('Docs: footer links point to real HTML pages', async () => {
  const { document } = await setup();
  const docLinks = document.querySelectorAll('.footer-docs-inline a');
  assert(docLinks.length === 3, `Expected 3 doc links in footer, got ${docLinks.length}`);
  const hrefs = Array.from(docLinks).map(l => l.getAttribute('href'));
  assert(hrefs.includes('docs/privacy.html'), 'Should link to docs/privacy.html');
  assert(hrefs.includes('docs/terms.html'), 'Should link to docs/terms.html');
  assert(hrefs.includes('docs/agreement.html'), 'Should link to docs/agreement.html (макет договора)');
});

test('Docs: consent checkbox links to real privacy.html', async () => {
  const { document } = await setup();
  const consentLink = document.querySelector('.consent-text a, .cta-form a[href*="privacy"]');
  assert(consentLink, 'Consent should link to privacy doc');
  assert(/docs\/privacy\.html/.test(consentLink.getAttribute('href')), 'Should link to docs/privacy.html');
});

// ============ v2.3: OFFICES — Yandex map + Moscow placeholder ============
test('Offices: 3 cards rendered (including Moscow placeholder)', async () => {
  const { document } = await setup();
  const offices = document.querySelectorAll('#offices .office');
  assert(offices.length === 3, `Expected 3 offices, got ${offices.length}`);
});

test('Offices: Moscow is marked as coming-soon', async () => {
  const { document } = await setup();
  const comingSoon = document.querySelectorAll('#offices .office-coming-soon');
  assert(comingSoon.length === 1, `Expected 1 coming-soon office (Moscow), got ${comingSoon.length}`);
});

test('Offices: Yandex Map iframe present for Tomsk and Novosibirsk', async () => {
  const { document } = await setup();
  const maps = document.querySelectorAll('#offices .office-map iframe');
  assert(maps.length === 2, `Expected 2 yandex maps (Tomsk + Novosibirsk), got ${maps.length}`);
  const allYandex = Array.from(maps).every(m => /yandex\.ru\/map-widget/.test(m.src));
  assert(allYandex, 'All maps should be yandex.ru/map-widget');
});

test('Offices: Tomsk has real address (Кирова, 58)', async () => {
  const { document } = await setup();
  const officesHtml = document.querySelector('#offices').innerHTML;
  assert(/Кирова.*58/.test(officesHtml), 'Tomsk address Кирова, 58 should be present');
});

test('Offices: Novosibirsk has real address (Карла Маркса, 57)', async () => {
  const { document } = await setup();
  const officesHtml = document.querySelector('#offices').innerHTML;
  assert(/Карла Маркса.*57/.test(officesHtml), 'Novosibirsk address should be present');
});

// ============ v2.3: REAL LOGO ============
test('Logo: header uses real SVG image', async () => {
  const { document } = await setup();
  const headerLogo = document.querySelector('header .logo img');
  assert(headerLogo, 'Header should have <img> logo');
  assert(/logo-50\.svg/.test(headerLogo.src), 'Header logo should be logo-50.svg');
});

test('Logo: footer uses real SVG image', async () => {
  const { document } = await setup();
  const footerLogo = document.querySelector('.footer-brand .logo img');
  assert(footerLogo, 'Footer should have <img> logo');
  assert(/logo-180\.svg/.test(footerLogo.src), 'Footer logo should be logo-180.svg');
});

test('Logo: favicon points to logo-32.svg', async () => {
  const { document } = await setup();
  const icon = document.querySelector('link[rel="icon"]');
  assert(icon && /logo-32\.svg/.test(icon.href), 'Favicon should be logo-32.svg');
});

test('Logo: apple-touch-icon points to logo-180.svg', async () => {
  const { document } = await setup();
  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  assert(apple && /logo-180\.svg/.test(apple.href), 'apple-touch-icon should be logo-180.svg');
});

test('Logo: OG image uses logo-og.svg', async () => {
  assert(/og:image[^>]*logo-og\.svg/.test(html), 'OG image should be logo-og.svg');
});

// ============ v2.3: SEO files ============
// (these tests are file-based, not DOM)
test('SEO: sitemap.xml exists in repo', async () => {
  assert(fs.existsSync(path.join(__dirname, 'sitemap.xml')), 'sitemap.xml should exist');
});

test('SEO: robots.txt exists in repo', async () => {
  assert(fs.existsSync(path.join(__dirname, 'robots.txt')), 'robots.txt should exist');
});

test('SEO: docs/ folder has 3 HTML pages', async () => {
  ['privacy', 'terms', 'agreement'].forEach(name => {
    const p = path.join(__dirname, 'docs', `${name}.html`);
    assert(fs.existsSync(p), `docs/${name}.html should exist`);
  });
});

test('SEO: article.html template exists', async () => {
  assert(fs.existsSync(path.join(__dirname, 'article.html')), 'article.html template should exist');
});

// ============ RUN ============
let passed = 0, failed = 0;
const failedNames = [];
console.log('=== POWER Car v2 Functional Tests ===\n');
(async () => {
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    try {
      await t.fn();
    passed++;
    console.log(`✓ ${i+1}. ${t.name}`);
  } catch (e) {
    failed++;
    failedNames.push({ name: t.name, msg: e.message });
    console.log(`✗ ${i+1}. ${t.name}\n    ${e.message}`);
  }
  }
  console.log(`
=== Results: ${passed}/${tests.length} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('\nFailures:');
  failedNames.forEach(f => console.log(`  - ${f.name}: ${f.msg}`));
  process.exit(1);
}

})();
