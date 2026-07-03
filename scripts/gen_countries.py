#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор страновых SEO-лендингов POWER Car (v2 — премиум-стиль главной).

Отличия от v1:
  - Стиль 1:1 с index.html (ambient bg, glass-cards, btn-primary с градиентом,
    Bricolage Grotesque + Manrope, FAQ с шевроном)
  - Карточки авто и отзывов грузятся ДИНАМИЧЕСКИ через fetch(cars.json/cases.json).
    Добавили новую машину в Decap CMS → страна-лендинг сам подхватит.
  - Убран расчётный блок (курс меняется)
  - Убран акцент на гибриды из Японии

Запуск: python3 scripts/gen_countries.py
"""
import json, os, html, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
BASE = "https://power-car.ru/"

def read_json(p):
    with open(p, encoding="utf-8") as f: return json.load(f)


# ============================================================
#   CSS — извлечены ключевые токены и паттерны из index.html
# ============================================================
CSS = r"""
:root{
  --bg:#0A0A0A;--bg-alt:#0E0E10;--bg-elevated:#131316;
  --surface:rgba(255,255,255,0.035);--surface-2:rgba(255,255,255,0.06);--surface-3:rgba(255,255,255,0.10);
  --border:rgba(255,255,255,0.08);--border-2:rgba(255,255,255,0.14);
  --text:#FAFAFA;--text-muted:rgba(255,255,255,0.62);--text-dim:rgba(255,255,255,0.42);
  --accent:#10B981;--accent-2:#34D399;--accent-dark:#047857;
  --accent-glow:rgba(16,185,129,0.35);--accent-soft:rgba(16,185,129,0.12);
  --r-sm:14px;--r-md:22px;--r-lg:32px;
  --font-display:'Bricolage Grotesque',system-ui,-apple-system,sans-serif;
  --font-body:'Manrope',system-ui,-apple-system,sans-serif;
  --ease-out:cubic-bezier(0.22,1,0.36,1);
  --sat:env(safe-area-inset-top);--sab:env(safe-area-inset-bottom);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--font-body);background:var(--bg);color:var(--text);line-height:1.5;overflow-x:hidden;-webkit-font-smoothing:antialiased;min-height:100%;position:relative}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4{font-family:var(--font-display);font-weight:600;letter-spacing:-0.025em;line-height:1.1}

/* AMBIENT (as main) */
.ambient{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;transform:translateZ(0)}
.ambient::before,.ambient::after{content:'';position:absolute;width:60vw;height:60vw;border-radius:50%;filter:blur(120px);opacity:0.4}
.ambient::before{top:-20%;left:-10%;background:radial-gradient(circle,var(--accent) 0%,transparent 60%);animation:drift1 22s var(--ease-out) infinite alternate}
.ambient::after{bottom:-30%;right:-20%;width:70vw;height:70vw;background:radial-gradient(circle,#064E3B 0%,transparent 60%);animation:drift2 28s var(--ease-out) infinite alternate}
@keyframes drift1{to{transform:translate(20vw,10vh) scale(1.15)}}
@keyframes drift2{to{transform:translate(-15vw,-10vh) scale(1.1)}}
@media (prefers-reduced-motion:reduce){.ambient::before,.ambient::after{animation:none}}

/* CONTAINER */
.container{max-width:1200px;margin:0 auto;padding:0 20px;position:relative;z-index:2}
@media(min-width:768px){.container{padding:0 40px}}
section{position:relative;padding:64px 0}
@media(min-width:768px){section{padding:96px 0}}

/* HEADER — glass pill */
.header-wrap{position:sticky;top:0;left:0;right:0;z-index:100;padding-top:calc(20px + var(--sat));padding-bottom:20px}
.header{margin:0 16px;border-radius:999px;padding:8px 8px 8px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(10,10,10,0.78);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%)}
@media(min-width:768px){.header{margin:0 32px;padding:10px 10px 10px 22px}}
.logo{display:flex;align-items:center;color:var(--text);font-family:var(--font-display);font-weight:700;font-size:1.05rem;letter-spacing:-0.02em}
.logo b{color:var(--accent-2)}
.nav{display:none;gap:2px;align-items:center}
@media(min-width:1024px){.nav{display:flex}}
.nav a{color:var(--text-muted);font-size:0.88rem;font-weight:500;padding:8px 14px;border-radius:999px;transition:all 0.3s var(--ease-out)}
.nav a:hover{color:var(--text);background:var(--surface-2)}
.header-cta{display:flex;gap:6px;align-items:center}

/* BUTTON — как в главной, с градиентом и glow */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--font-body);font-weight:600;font-size:0.95rem;padding:13px 22px;border-radius:999px;border:1px solid transparent;cursor:pointer;text-decoration:none;transition:all 0.3s var(--ease-out);white-space:nowrap;min-height:46px;position:relative;overflow:hidden;-webkit-tap-highlight-color:transparent}
.btn-primary{background:linear-gradient(180deg,var(--accent-2),var(--accent));color:#002417;box-shadow:0 1px 0 rgba(255,255,255,0.4) inset,0 -1px 0 rgba(0,0,0,0.2) inset,0 12px 28px -8px var(--accent-glow)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 1px 0 rgba(255,255,255,0.4) inset,0 -1px 0 rgba(0,0,0,0.2) inset,0 18px 40px -8px var(--accent-glow)}
.btn-primary:active{transform:translateY(0)}
.btn-ghost{background:var(--surface-2);color:var(--text);border-color:var(--border-2);backdrop-filter:blur(12px)}
.btn-ghost:hover{background:var(--surface-3)}
.btn-sm{padding:9px 16px;font-size:0.85rem;min-height:40px}
.btn-icon{padding:12px;min-width:46px;min-height:46px;border-radius:50%}
.btn-call{background:var(--accent-soft);color:var(--accent-2);border-color:rgba(16,185,129,0.3)}
.btn-call:hover{background:var(--accent-glow);color:var(--text)}
/* Shine */
.btn-shine::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);transform:translateX(-100%);animation:btnShine 4.5s var(--ease-out) infinite}
@keyframes btnShine{0%{transform:translateX(-100%)}18%,100%{transform:translateX(100%)}}

/* EYEBROW & HEADS */
.eyebrow{font-family:var(--font-body);font-size:0.78rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--accent);display:inline-flex;align-items:center;gap:8px}
.eyebrow::before{content:'';width:28px;height:1px;background:var(--accent)}
.section-head{max-width:720px;margin-bottom:40px}
.section-head h2{margin-top:16px;font-size:clamp(1.75rem,4.5vw,2.75rem)}
.section-head p{margin-top:14px;font-size:clamp(0.95rem,1.7vw,1.1rem);color:var(--text-muted)}
.glow-text{background:linear-gradient(120deg,#fff 0%,var(--accent-2) 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:shine 6s linear infinite}
@keyframes shine{to{background-position:200% center}}
.muted{color:var(--text-muted)}

/* HERO */
.hero{padding-top:56px;padding-bottom:24px}
@media(min-width:768px){.hero{padding-top:72px;padding-bottom:56px}}
.hero-inner{display:grid;gap:32px;align-items:center}
@media(min-width:1024px){.hero-inner{grid-template-columns:1.2fr 1fr;gap:48px}}
.hero h1{margin-top:18px;font-size:clamp(1.85rem,4.8vw,3.5rem);font-weight:700;letter-spacing:-0.04em;line-height:1.08}
.hero h1 .accent{background:linear-gradient(120deg,var(--accent-2),var(--accent));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero-sub{margin-top:20px;font-size:clamp(0.95rem,1.9vw,1.15rem);color:var(--text-muted);max-width:540px;line-height:1.55}
.hero-cta-row{margin-top:28px;display:flex;gap:10px;flex-wrap:wrap}
.hero-flag{font-size:clamp(4rem,10vw,8rem);text-align:center;line-height:1;filter:drop-shadow(0 8px 40px var(--accent-glow));position:relative;z-index:1}
.hero-flag-frame{aspect-ratio:1;display:grid;place-items:center;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);max-width:420px;margin:0 auto;padding:32px}
.stats{margin-top:36px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:18px;border-radius:var(--r-md);background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%)}
.stat{text-align:left;padding:0 10px;position:relative}
.stat+.stat::before{content:'';position:absolute;left:0;top:12%;bottom:12%;width:1px;background:var(--border)}
.stat-value{font-family:var(--font-display);font-size:clamp(1.3rem,3vw,2rem);font-weight:700;letter-spacing:-0.04em;line-height:1;background:linear-gradient(180deg,#fff,#aaa);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{margin-top:6px;font-size:0.75rem;color:var(--text-muted);line-height:1.3}

/* WHY-CARDS — glass carrousel */
.why-grid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:640px){.why-grid{grid-template-columns:1fr 1fr}}
@media(min-width:1024px){.why-grid{grid-template-columns:repeat(4,1fr)}}
.why{padding:24px;border-radius:var(--r-md);background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);transition:all 0.4s var(--ease-out);display:flex;flex-direction:column;gap:12px}
.why:hover{border-color:var(--border-2);background:var(--surface-2);transform:translateY(-2px)}
.why-icon{width:44px;height:44px;border-radius:var(--r-sm);background:var(--accent-soft);border:1px solid rgba(16,185,129,0.25);display:grid;place-items:center;color:var(--accent-2);flex-shrink:0}
.why-icon svg{width:22px;height:22px}
.why h3{font-size:1rem;font-weight:600;letter-spacing:-0.01em}
.why p{color:var(--text-muted);font-size:0.9rem;line-height:1.5}

/* CARS — grid of glass cards */
.cars-grid{display:grid;gap:16px;grid-template-columns:1fr}
@media(min-width:640px){.cars-grid{grid-template-columns:1fr 1fr}}
@media(min-width:1024px){.cars-grid{grid-template-columns:1fr 1fr 1fr}}
.car-card{position:relative;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);overflow:hidden;transition:all 0.4s var(--ease-out);display:flex;flex-direction:column;color:var(--text)}
.car-card:hover{border-color:var(--border-2);background:var(--surface-2);transform:translateY(-4px)}
.car-img{position:relative;aspect-ratio:4/3;background:linear-gradient(135deg,#0d2a23,#0a1a16);overflow:hidden}
.car-img img{width:100%;height:100%;object-fit:cover;display:block;position:relative;z-index:1}
.car-flag-badge{position:absolute;top:12px;left:12px;padding:5px 10px;border-radius:999px;background:rgba(0,0,0,0.55);border:1px solid var(--border-2);backdrop-filter:blur(20px);font-size:0.72rem;font-weight:600;display:flex;align-items:center;gap:6px;z-index:2}
.car-body{padding:18px;display:flex;flex-direction:column;gap:10px;flex:1}
.car-title{font-family:var(--font-display);font-weight:600;font-size:1.1rem;letter-spacing:-0.02em;line-height:1.15;color:var(--text)}
.car-meta{display:flex;gap:6px;flex-wrap:wrap;font-size:0.78rem;color:var(--text-muted)}
.car-meta-item{display:inline-flex;align-items:center;gap:4px}
.car-meta-item::after{content:'·';margin-left:6px;opacity:0.5}
.car-meta-item:last-child::after{display:none}
.car-price-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.car-price{font-family:var(--font-display);font-weight:700;font-size:1.35rem;letter-spacing:-0.03em;color:var(--text)}
.car-price-market{font-size:0.85rem;color:var(--text-dim);text-decoration:line-through}
.car-actions{display:flex;gap:8px;margin-top:auto;padding-top:6px}
.car-actions .btn{flex:1;padding:11px 14px;font-size:0.85rem;min-height:42px}

/* CASE cards (отзывы) */
.cases-scroll{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-inline-start:20px;padding:4px 20px 24px;margin:0 -20px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.cases-scroll::-webkit-scrollbar{display:none}
@media(min-width:768px){.cases-scroll{margin:0 -40px;padding:4px 40px 24px}}
.case{flex:0 0 auto;width:min(340px,82vw);scroll-snap-align:start;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);overflow:hidden;transition:all 0.4s var(--ease-out);display:flex;flex-direction:column}
.case:hover{border-color:var(--border-2);background:var(--surface-2);transform:translateY(-4px)}
.case-photo{position:relative;aspect-ratio:4/3;background:linear-gradient(135deg,#0d2a23,#0a1a16);overflow:hidden}
.case-photo img{width:100%;height:100%;object-fit:cover;display:block}
.case-photo-overlay{position:absolute;inset:auto 0 0 0;padding:50px 16px 16px;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%);display:flex;flex-direction:column;gap:2px}
.case-client{color:#FAFAFA;font-weight:700;font-size:0.98rem;letter-spacing:-0.01em}
.case-city{color:rgba(255,255,255,0.75);font-size:0.82rem}
.case-flag{position:absolute;top:12px;right:12px;padding:5px 10px;border-radius:999px;background:rgba(0,0,0,0.55);border:1px solid var(--border-2);backdrop-filter:blur(20px);font-size:0.72rem;font-weight:600;z-index:2}
.case-body{padding:18px;display:flex;flex-direction:column;gap:10px;flex:1}
.case-title{font-family:var(--font-display);font-weight:600;font-size:1.05rem;letter-spacing:-0.02em;line-height:1.2}
.case-quote{color:var(--text-muted);font-size:0.9rem;line-height:1.5;font-style:italic;position:relative;padding-left:12px;border-left:2px solid var(--accent);margin-top:4px}
.case-meta{display:flex;gap:14px;color:var(--text-muted);font-size:0.82rem;flex-wrap:wrap;margin-top:auto;padding-top:8px;border-top:1px solid var(--border)}
.case-meta b{color:var(--accent-2)}

/* FAQ — с шевроном */
.faq-list{display:flex;flex-direction:column;gap:10px}
.faq-item{border-radius:var(--r-md);background:var(--surface);border:1px solid var(--border);backdrop-filter:blur(24px) saturate(140%);-webkit-backdrop-filter:blur(24px) saturate(140%);overflow:hidden;transition:all 0.4s var(--ease-out)}
.faq-item[open]{border-color:var(--border-2);background:var(--surface-2)}
.faq-item summary{list-style:none;cursor:pointer;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px;font-family:var(--font-display);font-weight:600;font-size:1rem;letter-spacing:-0.01em;-webkit-tap-highlight-color:transparent}
.faq-item summary::-webkit-details-marker{display:none}
.faq-chev{width:36px;height:36px;border-radius:50%;background:var(--accent-soft);border:1px solid rgba(16,185,129,0.28);display:grid;place-items:center;color:var(--accent-2);flex-shrink:0;transition:transform 0.3s var(--ease-out)}
.faq-chev svg{width:16px;height:16px;transition:transform 0.3s var(--ease-out)}
.faq-item[open] .faq-chev{background:var(--accent);color:#002417}
.faq-item[open] .faq-chev svg{transform:rotate(180deg)}
.faq-content{padding:0 24px 22px;color:var(--text-muted);font-size:0.95rem;line-height:1.6}
.faq-content a{color:var(--accent-2);text-decoration:underline;text-decoration-color:rgba(52,211,153,0.4);text-underline-offset:3px}
.faq-content a:hover{text-decoration-color:var(--accent-2)}

/* CTA band */
.cta-card{position:relative;overflow:hidden;padding:40px 28px;border-radius:var(--r-lg);background:linear-gradient(135deg,rgba(16,185,129,0.14),rgba(16,185,129,0.03));border:1px solid rgba(16,185,129,0.28);backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);text-align:center}
@media(min-width:768px){.cta-card{padding:56px 48px}}
.cta-card h2{font-size:clamp(1.5rem,3.4vw,2.25rem);margin-bottom:12px}
.cta-card p{color:var(--text-muted);margin-bottom:24px;max-width:520px;margin-left:auto;margin-right:auto}

/* FOOTER — упрощён под гео-лендинги */
.footer{padding:40px 0 24px;border-top:1px solid var(--border);margin-top:40px;position:relative;z-index:2}
.footer-grid{display:grid;gap:24px;grid-template-columns:1fr}
@media(min-width:768px){.footer-grid{grid-template-columns:1.6fr 1fr 1fr;gap:40px}}
.footer .logo{font-size:1.15rem}
.footer-slogan{margin-top:10px;color:var(--accent);font-size:0.82rem;font-weight:600;letter-spacing:0.04em}
.footer p{margin-top:12px;color:var(--text-muted);font-size:0.82rem;max-width:360px;line-height:1.5}
.footer h4{font-family:var(--font-body);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:10px;margin-top:14px;font-weight:700}
.footer a{color:var(--text);display:block;padding:3px 0;font-size:0.85rem;transition:color 0.3s var(--ease-out)}
.footer a:hover{color:var(--accent-2)}
.footer-legal{margin-top:32px;padding-top:24px;border-top:1px solid var(--border);color:var(--text-dim);font-size:0.78rem;line-height:1.6}

/* SKELETON / LOADING */
.skel{background:linear-gradient(90deg,var(--surface) 0%,var(--surface-2) 50%,var(--surface) 100%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:var(--r-lg);aspect-ratio:4/3}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.empty-state{padding:40px 20px;text-align:center;color:var(--text-muted);background:var(--surface);border:1px dashed var(--border-2);border-radius:var(--r-md)}
"""


# ============================================================
#   HEADER / FOOTER (общие)
# ============================================================
HEADER = """<div class="ambient" aria-hidden="true"></div>
<header class="header-wrap">
  <div class="header">
    <a href="/" class="logo">POWER <b>Car</b></a>
    <nav class="nav" aria-label="Главное меню">
      <a href="/#selector">Подбор</a>
      <a href="/#cases">Отзывы</a>
      <a href="/#offices">Офисы</a>
      <a href="/#faq">Вопросы</a>
      <a href="/#articles">Статьи</a>
    </nav>
    <div class="header-cta">
      <a href="tel:+79138533305" class="btn btn-call btn-sm btn-icon" aria-label="Позвонить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </a>
      <a href="/#cta" class="btn btn-primary btn-sm btn-shine">Получить расчёт</a>
    </div>
  </div>
</header>"""

FOOTER = """<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <a href="/" class="logo">POWER <b>Car</b></a>
        <div class="footer-slogan">Надёжность, рождённая в Сибири</div>
        <p>Импорт автомобилей и мотоциклов из Японии, Кореи и Китая под ключ. Прозрачные расчёты и сопровождение на каждом этапе.</p>
      </div>
      <div>
        <h4>Страны</h4>
        <a href="/avto-iz-yaponii.html">Авто из Японии</a>
        <a href="/avto-iz-korei.html">Авто из Кореи</a>
        <a href="/moto-iz-yaponii.html">Мото из Японии</a>
      </div>
      <div>
        <h4>Города</h4>
        <a href="/avto-iz-yaponii-tomsk.html">🏔 Томск</a>
        <a href="/avto-iz-yaponii-novosibirsk.html">🌆 Новосибирск</a>
        <a href="/avto-iz-yaponii-moskva.html">🏛 Москва</a>
      </div>
    </div>
    <div class="footer-legal">
      © 2026 POWER Car · ИП Степанов А. В. · ИНН 702205795181<br>
      Информация на сайте носит информационный характер и не является публичной офертой (ст. 437 ГК РФ).
    </div>
  </div>
</footer>
<script type="text/javascript">
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=109736434","ym");
ym(109736434,'init',{ssr:true,webvisor:true,clickmap:true,accurateTrackBounce:true,trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/109736434" style="position:absolute;left:-9999px" alt=""/></div></noscript>"""


# ============================================================
#   JS — динамическая загрузка cars.json + cases.json
# ============================================================
def build_js(country_en, country_ru, catalog_type, ru_cases_country):
    """
    country_en: 'Japan' | 'Korea' — для фильтра cars.json
    catalog_type: 'auto' | 'moto' — что грузить: cars.json или motorcycles.json
    ru_cases_country: 'Япония' | 'Корея' | None — для фильтра cases.json (None если нет)
    """
    return f"""
<script>
const COUNTRY_EN = {json.dumps(country_en)};
const CASES_COUNTRY = {json.dumps(ru_cases_country)};
const CATALOG_TYPE = {json.dumps(catalog_type)};
const CATALOG_URL = CATALOG_TYPE === 'moto' ? '/data/motorcycles.json' : '/data/cars.json';

const fmt = n => new Intl.NumberFormat('ru-RU').format(n);
const fmtPrice = n => fmt(n) + ' ₽';
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));

function slugify(s) {{ return String(s||'').replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,''); }}

function carCard(car) {{
  const slug = slugify(car.id);
  const brand = esc(car.brand || '');
  const model = esc(car.model || '');
  const title = `${{brand}} ${{model}}`.trim();
  const flag = esc(car.flag || '');
  const country = esc(car.country || '');
  const photo = (car.photos && car.photos[0])
    ? `<img src="/${{esc(car.photos[0])}}" alt="${{title}} — импорт под ключ" loading="lazy" width="320" height="240">`
    : `<div style="display:grid;place-items:center;height:100%;color:var(--text-dim);font-weight:700">POWER Car</div>`;
  const meta = [
    car.year && `<span class="car-meta-item">${{car.year}}</span>`,
    car.engine && `<span class="car-meta-item">${{esc(car.engine)}}</span>`,
    car.transmission && `<span class="car-meta-item">${{esc(car.transmission)}}</span>`
  ].filter(Boolean).join('');
  const market = (car.priceMarket && car.priceMarket > car.price)
    ? `<span class="car-price-market">${{fmtPrice(car.priceMarket)}}</span>` : '';
  const price = car.price ? `<div class="car-price-row"><span class="car-price">${{fmtPrice(car.price)}}</span>${{market}}</div>` : '';
  return `
    <article class="car-card">
      <div class="car-img">
        ${{photo}}
        ${{flag ? `<span class="car-flag-badge">${{flag}} ${{country}}</span>` : ''}}
      </div>
      <div class="car-body">
        <div class="car-title">${{title}}</div>
        <div class="car-meta">${{meta}}</div>
        ${{price}}
        <div class="car-actions">
          <a class="btn btn-primary" href="/auto/${{slug}}.html">Подробнее</a>
        </div>
      </div>
    </article>`;
}}

function caseCard(c) {{
  const photo = (c.photos && c.photos[0])
    ? `<img src="/${{esc(c.photos[0])}}" alt="Кейс ${{esc(c.carTitle || '')}}" loading="lazy">`
    : `<div style="display:grid;place-items:center;height:100%;color:var(--text-dim);font-weight:700">${{esc(c.carTitle || 'POWER Car')}}</div>`;
  const q = (c.quote && c.quote !== 'ДОПОЛНИТЬ') ? c.quote : (c.story || '').slice(0, 180);
  const quote = q ? `<div class="case-quote">${{esc(q).slice(0, 200)}}${{q.length > 200 ? '…' : ''}}</div>` : '';
  const meta = [];
  if (c.deliveryDays) meta.push(`⏱ <b>${{c.deliveryDays}}</b> дней`);
  if (c.showPrice && c.finalPrice) meta.push(`💰 <b>${{fmtPrice(c.finalPrice)}}</b>`);
  if (c.photoCount) meta.push(`📷 ${{c.photoCount}} фото`);
  return `
    <article class="case">
      <div class="case-photo">
        ${{photo}}
        ${{c.flag ? `<span class="case-flag">${{esc(c.flag)}} ${{esc(c.country || '')}}</span>` : ''}}
        <div class="case-photo-overlay">
          <div class="case-client">${{esc(c.clientName || 'Клиент')}}</div>
          <div class="case-city">${{esc(c.clientCity || '')}}</div>
        </div>
      </div>
      <div class="case-body">
        <div class="case-title">${{esc(c.carTitle || '')}}</div>
        ${{quote}}
        <div class="case-meta">${{meta.join('')}}</div>
      </div>
    </article>`;
}}

async function loadCatalog() {{
  const wrap = document.getElementById('carsGrid');
  const countLabel = document.getElementById('carsCount');
  if (!wrap) return;
  try {{
    const res = await fetch(CATALOG_URL, {{cache:'no-cache'}});
    const all = await res.json();
    // Фильтр: страна + published, сортировка: newest first
    const pool = all.filter(c =>
      (c.published !== false) &&
      (CATALOG_TYPE === 'moto' ? true : c.country === COUNTRY_EN)
    );
    pool.sort((a, b) => {{
      const da = a.addedAt || '', db = b.addedAt || '';
      if (db !== da) return db.localeCompare(da);
      return (a.price || 0) - (b.price || 0);
    }});
    if (countLabel) countLabel.textContent = pool.length;
    const top = pool.slice(0, 6);
    if (!top.length) {{
      wrap.innerHTML = '<div class="empty-state">Сейчас нет активных предложений — оставьте заявку, подберём под запрос.</div>';
      return;
    }}
    wrap.innerHTML = top.map(carCard).join('');
  }} catch (e) {{
    wrap.innerHTML = '<div class="empty-state">Ошибка загрузки каталога. Обновите страницу или напишите нам.</div>';
    console.warn('catalog load failed', e);
  }}
}}

async function loadCases() {{
  const wrap = document.getElementById('casesTrack');
  if (!wrap || !CASES_COUNTRY) return;
  try {{
    const res = await fetch('/data/cases.json', {{cache:'no-cache'}});
    const all = await res.json();
    const pool = all.filter(c => (c.published !== false) && c.country === CASES_COUNTRY);
    pool.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const top = pool.slice(0, 6);
    if (!top.length) {{
      wrap.parentElement.parentElement.style.display = 'none';
      return;
    }}
    wrap.innerHTML = top.map(caseCard).join('');
  }} catch (e) {{
    console.warn('cases load failed', e);
  }}
}}

loadCatalog();
loadCases();
</script>"""


# ============================================================
#   ГЕНЕРАЦИЯ СТРАНИЦЫ
# ============================================================
def build_page(cfg):
    slug = cfg["slug"]
    url = BASE + slug + ".html"

    why_html = "".join(
        f'''<div class="why">
  <div class="why-icon">{svg}</div>
  <h3>{html.escape(t)}</h3>
  <p>{html.escape(d)}</p>
</div>''' for svg, t, d in cfg["why"]
    )

    faq_items = "".join(
        f'''<details class="faq-item">
  <summary>{html.escape(q)}<span class="faq-chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span></summary>
  <div class="faq-content">{a}</div>
</details>''' for q, a in cfg["faq"]
    )
    faq_ld = {
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": re.sub(r'<[^>]+>', '', a)}}
            for q, a in cfg["faq"]
        ]
    }
    breadcrumb_ld = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Главная", "item": BASE},
            {"@type": "ListItem", "position": 2, "name": cfg["breadcrumb"], "item": url}
        ]
    }

    cases_section = f'''<section id="cases">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Отзывы</span>
      <h2>Клиенты про импорт <span class="glow-text">из {cfg["country_rod"]}</span></h2>
      <p>Реальные истории клиентов POWER Car: сроки, итоговые цены и впечатления от процесса.</p>
    </div>
  </div>
  <div class="container">
    <div class="cases-scroll" id="casesTrack"><!-- fetch from cases.json --></div>
  </div>
</section>''' if cfg["cases_country_ru"] else ''

    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(cfg["title"])}</title>
<meta name="description" content="{html.escape(cfg["desc"])}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0A0A0A">
<meta property="og:type" content="website">
<meta property="og:title" content="{html.escape(cfg["title"])}">
<meta property="og:description" content="{html.escape(cfg["desc"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}og-cover.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="preconnect" href="https://mc.yandex.ru">
<link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,600&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,600&display=swap" rel="stylesheet"></noscript>
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(faq_ld, ensure_ascii=False)}</script>
<script type="application/ld+json">{json.dumps(breadcrumb_ld, ensure_ascii=False)}</script>
</head>
<body>
{HEADER}

<main>

<section class="hero">
  <div class="container">
    <div class="hero-inner">
      <div>
        <span class="eyebrow">{html.escape(cfg["eyebrow"])}</span>
        <h1>{html.escape(cfg["h1_top"])}<br><span class="accent">{html.escape(cfg["h1_bot"])}</span></h1>
        <p class="hero-sub">{html.escape(cfg["hero_p"])}</p>
        <div class="hero-cta-row">
          <a href="#cars" class="btn btn-primary btn-shine">Смотреть каталог</a>
          <a href="/#cta" class="btn btn-ghost">Оставить заявку</a>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value" id="carsCount">…</div>
            <div class="stat-label">{html.escape(cfg["stat_label"])}</div>
          </div>
          <div class="stat">
            <div class="stat-value">25–40</div>
            <div class="stat-label">дней под&nbsp;ключ</div>
          </div>
          <div class="stat">
            <div class="stat-value">0&nbsp;₽</div>
            <div class="stat-label">предоплата за&nbsp;подбор</div>
          </div>
        </div>
      </div>
      <div class="hero-flag-frame">
        <div class="hero-flag">{cfg["hero_flag"]}</div>
      </div>
    </div>
  </div>
</section>

<section id="why">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Преимущества</span>
      <h2>Почему авто из <span class="glow-text">{cfg["country_rod"]}</span></h2>
      <p>{html.escape(cfg["why_sub"])}</p>
    </div>
    <div class="why-grid">{why_html}</div>
  </div>
</section>

<section id="cars">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Каталог</span>
      <h2>{html.escape(cfg["cars_h2_top"])} <span class="glow-text">{html.escape(cfg["cars_h2_bot"])}</span></h2>
      <p>Свежие предложения, обновляются автоматически при пополнении базы. Полный подборщик — на главной.</p>
    </div>
    <div class="cars-grid" id="carsGrid">
      <div class="skel"></div><div class="skel"></div><div class="skel"></div>
    </div>
    <div style="text-align:center;margin-top:32px">
      <a href="/#selector" class="btn btn-primary btn-shine">Открыть подборщик — весь каталог</a>
    </div>
  </div>
</section>

{cases_section}

<section id="cta-band">
  <div class="container">
    <div class="cta-card">
      <span class="eyebrow">Готовы заказать?</span>
      <h2 style="margin-top:14px">Получите 3 варианта из {cfg["country_rod"]} <span class="glow-text">под ваш бюджет</span></h2>
      <p>Бесплатный подбор и честный расчёт стоимости под ключ. Без предоплаты за подбор.</p>
      <a href="/#cta" class="btn btn-primary btn-shine">Оставить заявку</a>
    </div>
  </div>
</section>

<section id="faq">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">FAQ</span>
      <h2>Частые <span class="glow-text">вопросы</span></h2>
    </div>
    <div class="faq-list">{faq_items}</div>
  </div>
</section>

</main>

{FOOTER}
{build_js(cfg["country_en"], cfg["country_rod"], cfg["catalog_type"], cfg["cases_country_ru"])}
</body>
</html>"""


# ============================================================
#   SVG-ИКОНКИ (без эмодзи)
# ============================================================
ICO_FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
ICO_COIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>'
ICO_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'
ICO_SHIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M4 10h16l-2 8H6z"/><circle cx="12" cy="6" r="2"/></svg>'
ICO_ENG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="10" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12h-2M22 12h-2M9 22h6"/></svg>'
ICO_BOLT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
ICO_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
ICO_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'


# ============================================================
#   MAIN
# ============================================================
def main():
    # Считаем — сколько машин каждой страны для static-cache в hero
    cars = read_json("data/cars.json")

    # ==================== ЯПОНИЯ ====================
    japan = {
        "slug": "avto-iz-yaponii",
        "country_en": "Japan",
        "country_rod": "Японии",
        "catalog_type": "auto",
        "cases_country_ru": "Япония",
        "title": "Авто из Японии под заказ: дешёвый правый руль и кей-кары от 570 тыс ₽",
        "desc": "Привезём недорогие автомобили из Японии напрямую с аукционов JBA, USS, TAA. Кей-кары от 570 тыс ₽, минивэны, семейные универсалы. Растаможка без поездки в порт.",
        "eyebrow": "Авто из Японии",
        "breadcrumb": "Авто из Японии",
        "hero_flag": "🇯🇵",
        "h1_top": "Недорогие авто",
        "h1_bot": "из Японии под заказ",
        "hero_p": "Кей-кары от 570 000 ₽, минивэны, семейные универсалы. Прямой выкуп на аукционах JBA / USS / TAA, доставка во Владивосток за 25–35 дней.",
        "stat_label": "авто в наличии",
        "cars_h2_top": "Авто из Японии",
        "cars_h2_bot": "в наличии сейчас",
        "why_sub": "Япония — крупнейший экспортёр б/у авто в РФ (57,7% по данным «Автостата»).",
        "why": [
            (ICO_FLAG, "Крупнейший рынок Азии", "Более 5 000 лотов в день на аукционах JBA, USS, TAA, HAA. Огромный выбор моделей, состояний и комплектаций."),
            (ICO_COIN, "Кей-кары — самые дешёвые", "Объём двигателя до 660 см³ = пошлина всего 990 € (~94 000 ₽) + льготный утильсбор 5 200 ₽. Итого под ключ — от 570 000 ₽."),
            (ICO_DOC, "Прозрачный аукционный лист", "Оценка 4B и выше — гарантия отсутствия серьёзных дефектов кузова. Все повреждения указаны схематично."),
            (ICO_SHIP, "Быстрая морская доставка", "Япония → Владивосток за 12–18 дней. Общий срок под ключ — 25–35 дней с растаможкой и оформлением."),
        ],
        "faq": [
            ("Правый руль — это законно и удобно?",
             "Да, полностью законно. По статистике «Автостата», ~57% ввозимых в РФ авто — правый руль. Первые 2–3 недели непривычно, потом мышечная память включается, и водитель перестаёт замечать разницу."),
            ("Что такое аукционный лист и как его читать?",
             "Аукционный лист — официальный протокол оценки авто на японском аукционе. Оценка от S (новый) до R (аварийный). 4B — отличное состояние. Мы предоставляем перевод и объясняем каждый значок. Подробно — в <a href='/articles/reading-japanese-auction-sheet.html'>нашей статье</a>."),
            ("Сколько идёт авто из Японии до Владивостока?",
             "Морская доставка Япония → Владивосток занимает 12–18 дней. Плюс 2–5 дней на выкуп после торгов и 4–7 дней на растаможку. Общий срок под ключ — 25–35 дней."),
            ("Какие модели я могу заказать до 700 000 ₽?",
             "Кей-кары (660 см³): Honda N-BOX, Suzuki Alto, Daihatsu Move, Nissan Dayz. Малолитражки 2015–2018 г.в.: Toyota Passo, Honda Fit, Nissan Note. Полный расчёт — в <a href='/articles/kupit-keykar-iz-yaponii-2026.html'>статье про кей-кары</a>."),
            ("Какие цены доставки автовозом до моего города?",
             "Автовоз Владивосток → Томск ~30–35 тыс ₽, → Новосибирск ~25–30 тыс ₽, → Москва ~50–60 тыс ₽. Точная цена — на день загрузки, зависит от габаритов авто."),
            ("Нужна ли предоплата за подбор?",
             "Нет. Подбор и расчёт сметы — бесплатно. Депозит 100 000 ₽ вносится только при одобрении конкретного лота и на 100% возвращается до оплаты инвойса.")
        ]
    }

    # ==================== КОРЕЯ ====================
    korea = {
        "slug": "avto-iz-korei",
        "country_en": "Korea",
        "country_rod": "Кореи",
        "catalog_type": "auto",
        "cases_country_ru": "Корея",
        "title": "Леворульные кроссоверы и авто из Кореи под ключ: 1.5–2.5 млн ₽",
        "desc": "Доставка леворульных авто из Южной Кореи. Kia Sportage, Hyundai Tucson, Genesis GV70 от 1.5 млн ₽ под ключ. Прозрачная растаможка, честный дилерский пробег.",
        "eyebrow": "Авто из Кореи",
        "breadcrumb": "Авто из Кореи",
        "hero_flag": "🇰🇷",
        "h1_top": "Кроссоверы из Кореи",
        "h1_bot": "до 2.5 млн ₽ под ключ",
        "hero_p": "Kia Sportage, Hyundai Tucson, Genesis GV70 напрямую от корейских дилеров через Encar. Только левый руль, оригинальный пробег, полный пакет документов.",
        "stat_label": "авто в наличии",
        "cars_h2_top": "Авто из Кореи",
        "cars_h2_bot": "в наличии сейчас",
        "why_sub": "Корея — быстрорастущий сегмент импорта, +40% г/г.",
        "why": [
            (ICO_CHECK, "Только левый руль", "Никакой адаптации, все привычки европейского водителя работают. Ликвидность на вторичке в РФ выше правого руля."),
            (ICO_DOC, "Encar — прозрачность 100%", "Крупнейшая корейская площадка, дилерский пробег с электронной сервисной книжкой. Скрутка практически невозможна."),
            (ICO_STAR, "Свежие кроссоверы 2020–2023", "Основной импорт — Kia Sportage, Hyundai Tucson, Genesis GV70/GV80. Средний пробег — 40–60 тыс км."),
            (ICO_BOLT, "Родные комплектации", "Полная электрика, панорамная крыша, вентиляция сидений, HUD — в базе. В российских дилерских версиях этих опций нет."),
        ],
        "faq": [
            ("Encar — что это и как выбрать лот?",
             "Encar (encar.com) — крупнейшая корейская онлайн-площадка б/у авто. Все лоты от лицензированных дилеров с проверенной историей. Мы отслеживаем нужные модели, показываем видео-обзор и полный отчёт по VIN. Подробно — в <a href='/articles/korean-car-vin-code-proverka-encar.html'>статье про VIN-проверку</a>."),
            ("Дилерский пробег vs аукционный — в чём разница?",
             "Дилерский пробег (Корея) фиксируется в электронной сервисной книжке через ODO-log. Скрутка требует взлома данных производителя — практически невозможно. Аукционный лист (Япония) — визуальная оценка, пробег указывается со слов продавца, скрутка встречается чаще."),
            ("Сколько идёт авто из Кореи до Владивостока?",
             "Морская доставка Корея (Пусан) → Владивосток занимает всего 3–5 дней. Плюс 3–7 дней на выкуп и 4–7 дней на растаможку. Общий срок под ключ — 20–30 дней (быстрее чем из Японии)."),
            ("Можно ли заказать корейский электромобиль (EV6, Ioniq 5)?",
             "Да. Более того, EV освобождены от таможенной пошлины (0%), платится только утильсбор + НДС. Kia EV6 под ключ во Владивосток — от 2.2 млн ₽. Работаем с Genesis GV60, Hyundai Ioniq 5/6, Kia EV6/EV9."),
            ("Какие модели дешевле 1.5 млн ₽?",
             "Hyundai Elantra 2020–2021, Kia K5 2019–2020, Renault Samsung SM6, Chevrolet Malibu. Минимальный порог входа в корейский сегмент — от 900 000 ₽."),
            ("В РФ Kia/Hyundai собирают — зачем везти из Кореи?",
             "Российская сборка была прекращена в 2022 г. Новые Kia/Hyundai в РФ — это параллельный импорт с ОАЭ или Казахстана с наценкой 40–80%. Прямой импорт из Кореи — на 25–40% дешевле дилерских цен.")
        ]
    }

    # ==================== МОТО ИЗ ЯПОНИИ ====================
    moto = {
        "slug": "moto-iz-yaponii",
        "country_en": "Japan",
        "country_rod": "Японии",
        "catalog_type": "moto",
        "cases_country_ru": None,
        "title": "Купить б/у японский мотоцикл с аукционов BDS, JBA под заказ дёшево",
        "desc": "Подбор и доставка б/у мотоциклов напрямую с аукционов Японии без наценок. Honda CB400SF, Yamaha, Kawasaki, Suzuki — от 300 тыс ₽ под ключ. Прозрачный договор.",
        "eyebrow": "Мото из Японии",
        "breadcrumb": "Мотоциклы из Японии",
        "hero_flag": "🏍",
        "h1_top": "Японские мотоциклы",
        "h1_bot": "с аукционов под ключ",
        "hero_p": "Honda CB400SF, Kawasaki Ninja, Yamaha Serow, Suzuki GSX — от 300 000 ₽ под ключ. Прямой выкуп на BDS/JBA, полный техпаспорт, помощь с постановкой на учёт.",
        "stat_label": "мотоциклов в наличии",
        "cars_h2_top": "Мотоциклы",
        "cars_h2_bot": "в наличии сейчас",
        "why_sub": "Япония — родина Honda, Yamaha, Kawasaki, Suzuki.",
        "why": [
            (ICO_STAR, "Родные японские мотики", "Низкий пробег (10–30 тыс км), регулярное дилерское ТО, оригинальные запчасти без проблем."),
            (ICO_COIN, "От 300 000 ₽ под ключ", "Классика Honda Steed, Yamaha Virago. Городские CB400SF, ZR-7. Спорт-туризм VFR, Bandit S."),
            (ICO_DOC, "Полный пакет документов", "Экспортный сертификат, ГТД, СБКТС, ПТС. Регистрация в ГИБДД без проблем."),
            (ICO_ENG, "Классика и современный спорт", "От легендарных CB400 и XJR1300 до свежих R1, GSX-R, ZX-10R. Выбор под любой стиль езды."),
        ],
        "faq": [
            ("Что такое BDS, JBA, Yahoo Auctions?",
             "BDS — крупнейший в Японии моно-аукцион мотоциклов, около 300 лотов в неделю. JBA — универсальный аукцион с мото-разделом. Yahoo Auctions — маркетплейс частных объявлений, цены ниже, но проверка сложнее. Работаем с BDS/JBA."),
            ("Сроки доставки мотоцикла из Японии?",
             "30–40 дней под ключ: выкуп на аукционе (3–5 дней), доставка морем в контейнере (18–24 дня), растаможка (5–7 дней), автовоз до вашего города (7–14 дней в зависимости от региона)."),
            ("Растаможка мотоциклов — какая пошлина в 2026?",
             "Для мотоциклов физлиц: пошлина 15% от инвойсной стоимости + утильсбор 3 400 ₽ (до 40 л.с.) или 7 000 ₽ (свыше 40 л.с.). Точный расчёт для конкретной модели — по запросу."),
            ("Можно ли привезти спортбайк без документов?",
             "Нет. Только техника с полным пакетом японских документов. Спортбайки для трека без экспортного сертификата ввозить невозможно — не пройдут растаможку. Для трека покупаем гоночные модификации с документами."),
            ("Помогаете ли с постановкой на учёт в ГИБДД?",
             "Да, полное сопровождение до получения СТС. Наш брокер работает напрямую с ГИБДД во Владивостоке. Если нужна регистрация в другом городе — присылаем полный пакет документов для самостоятельной постановки."),
            ("Какие мотоциклы популярнее всего у клиентов?",
             "Топ-5: Honda CB400SF (универсальный городской), Yamaha XJR1300 (классика с большим мотором), Kawasaki Ninja 400/650 (спорт для начинающих), Suzuki V-Strom (турэндуро), Honda VTR250 (лёгкий город).")
        ]
    }

    for cfg in [japan, korea, moto]:
        page = build_page(cfg)
        outfile = f"{cfg['slug']}.html"
        with open(outfile, "w", encoding="utf-8") as f:
            f.write(page)
        print(f"  ✓ {outfile}  ({len(page):,} байт)")

    print()
    print("Done. Машины и отзывы теперь грузятся из /data/*.json на клиенте — обновятся автоматически при пополнении базы.")


if __name__ == "__main__":
    main()
