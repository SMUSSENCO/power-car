#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
POWER Car — генератор статических индексируемых страниц.
Создаёт по отдельному HTML-файлу на каждую статью и каждое авто, с УНИКАЛЬНЫМИ
title / description / canonical / schema — чтобы поисковик не склеивал их в дубли.

Запуск из КОРНЯ репозитория:
    python3 scripts/build.py

Читает:  data/articles.json, data/cars.json, article.html, car.html
Пишет:   articles/<slug>.html, auto/<slug>.html, sitemap.xml
Удаляет: устаревшие файлы в articles/ и auto/, которых больше нет в JSON.
"""
import json, os, re, html, glob
from datetime import date, timedelta
from urllib.parse import quote
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
BASE = "https://power-car.ru/"
# Use today's date for <lastmod> in generated sitemap (was hardcoded to a stale value)
TODAY = date.today().isoformat()
PRICE_VALID_UNTIL = (date.today() + timedelta(days=45)).isoformat()   # цены фиксированы до продажи, но курс плавает: подтверждаем раз в неделю (cron в build-pages.yml)
TODAY_RU = date.today().strftime("%d.%m.%Y")

def read(p):
    with open(p, encoding="utf-8") as f: return f.read()

def extract_style(src):
    m = re.search(r"<style>(.*?)</style>", src, re.S)
    return m.group(1) if m else ""

def slugify(s):
    return re.sub(r"[^A-Za-z0-9_-]+", "-", s).strip("-")

def fmt_price(n):
    return f"{int(n):,}".replace(",", " ") + " ₽"

def fmt_date(d):
    months = ["января","февраля","марта","апреля","мая","июня","июля","августа",
              "сентября","октября","ноября","декабря"]
    try:
        y, m, day = d.split("-")
        return f"{int(day)} {months[int(m)-1]} {y}"
    except Exception:
        return d or ""

METRIKA = """<script type="text/javascript">
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=109736434","ym");
ym(109736434,'init',{ssr:true,webvisor:true,clickmap:true,accurateTrackBounce:true,trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/109736434" style="position:absolute;left:-9999px;" alt=""/></div></noscript>"""

ART_STYLE = extract_style(read("article.html"))
MAX_URL = "https://max.ru/u/f9LHodD0cOI15ISW65cZM-troopdVYCICi0eYXIWSilu6SCKonmcc0CqZZM"
TG_URL = "https://t.me/PowerCar_msk"
PHONE_TEL = "tel:+79138533305"
ART_STYLE += """
.art-mid{margin:30px 0;padding:18px 20px;border-radius:16px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.28)}
.art-mid b{display:block;font-size:1.02rem;margin-bottom:4px}.art-mid span{display:block;color:var(--text-muted);font-size:.92rem;margin-bottom:12px}
.art-mid-row{display:flex;gap:10px;flex-wrap:wrap}
.art-q{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
a.art-qb{display:flex;align-items:center;justify-content:center;gap:6px;padding:13px 10px;border-radius:999px;font-weight:700;font-size:.95rem;text-decoration:none;color:#fff}
a.art-qb.max{background:linear-gradient(135deg,#6366F1,#8B5CF6)}a.art-qb.tg{background:linear-gradient(135deg,#2AABEE,#229ED9)}
a.art-qb.call{background:linear-gradient(180deg,var(--accent-2),var(--accent));color:#002417}
.art-cta a.art-cta-btn-secondary{background:rgba(255,255,255,.06);color:var(--text);border:1px solid rgba(255,255,255,.14);box-shadow:none}
.art-sticky{display:none}
@media(max-width:700px){.art-q{grid-template-columns:1fr}
.art-sticky{position:fixed;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));z-index:60;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:6px;border-radius:999px;background:rgba(10,10,10,.88);border:1px solid var(--border-2);backdrop-filter:blur(20px)}
.art-sticky a.art-qb{padding:10px 4px;font-size:.78rem;white-space:nowrap;min-width:0}body{padding-bottom:76px}}
"""
DRIVE = {"fwd":"передний","rwd":"задний","awd":"полный"}
CAR_STYLE = extract_style(read("car.html"))

# ---------------------------------------------------------------- ARTICLES
def _qb(cls, href, label, goal, place, slug, blank=True):
    t = ' target="_blank" rel="noopener"' if blank else ''
    return f'<a class="art-qb {cls}" href="{href}"{t} data-goal="{goal}" data-place="{place}" data-slug="{slug}">{label}</a>'

def QUICK(place, slug):
    return ('<div class="art-q">'
            + _qb("max", MAX_URL, "💬 MAX", "messenger_clicked", place, slug)
            + _qb("tg", TG_URL, "✈️ Telegram", "messenger_clicked", place, slug)
            + _qb("call", PHONE_TEL, "📞 Позвонить", "phone_clicked", place, slug, blank=False)
            + '</div>')

def STICKY(slug):
    return (_qb("max", MAX_URL, "MAX", "messenger_clicked", "article_sticky", slug)
            + _qb("tg", TG_URL, "Telegram", "messenger_clicked", "article_sticky", slug)
            + _qb("call", PHONE_TEL, "Позвонить", "phone_clicked", "article_sticky", slug, blank=False))

ART_TRACK_JS = """document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-goal],a[data-place]');if(!a||!window.ym)return;var g=a.getAttribute('data-goal');var p={place:a.getAttribute('data-place')||'',slug:a.getAttribute('data-slug')||location.pathname};try{if(g)ym(109736434,'reachGoal',g,p);ym(109736434,'params',{cta:p.place})}catch(_){}});"""

def insert_mid_cta(body, slug):
    """Компактный CTA перед третьим подзаголовком (≈ 40% статьи); если подзаголовков меньше трёх — не вставляем."""
    heads = [m.start() for m in re.finditer(r'<h2[ >]', body)]
    if len(heads) < 3: return body
    blk = ('<aside class="art-mid"><b>Хотите узнать цену под ваш бюджет?</b>'
           '<span>Посчитайте растаможку сами или напишите менеджеру — ответим в течение рабочего дня.</span>'
           '<div class="art-mid-row">'
           + _qb("max", MAX_URL, "💬 Написать в MAX", "messenger_clicked", "article_mid", slug)
           + _qb("call", "/kalkulyator-rastamozhki.html", "🧮 Калькулятор под ключ", "", "article_mid", slug, blank=False)
           + '</div></aside>')
    i = heads[2]
    return body[:i] + blk + body[i:]

# ---------- Подборки автомобилей внутри статей: маркеры {{cars:...}} разворачиваются в карточки из data/cars.json ----------
CARDS_CSS = """
.cc-nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px}
.cc-nav a{padding:7px 14px;border-radius:999px;border:1px solid var(--border-2);color:var(--text-muted);font-size:.88rem;text-decoration:none}
.cc-nav a:hover{border-color:var(--accent);color:var(--text)}
.cc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0 26px}
@media(max-width:700px){.cc-grid{grid-template-columns:1fr}}
.cc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.cc-img{display:block;aspect-ratio:4/3;background:rgba(255,255,255,.05);overflow:hidden}
.cc-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .35s}
.cc:hover .cc-img img{transform:scale(1.03)}
.cc-info{padding:14px 16px 6px}
.cc-info h3{font-size:1.02rem;line-height:1.3;margin:0 0 6px}
.art-body .cc-info h3 a{color:var(--text);text-decoration:none}.art-body .cc-info h3 a:hover{color:var(--accent-2)}
.cc-price{font-weight:800;font-size:1.15rem;color:var(--accent-2)}
.cc-price small{display:block;font-weight:500;font-size:.74rem;color:var(--text-dim)}
.cc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cc-chips span{background:rgba(255,255,255,.07);border-radius:999px;padding:3px 10px;font-size:.78rem;color:var(--text-muted)}
.cc-more{padding:0 16px 14px;margin-top:auto}
.cc-more summary{cursor:pointer;color:var(--accent-2);font-weight:600;font-size:.9rem;padding:10px 0}
.cc-thumbs{display:flex;gap:8px;overflow-x:auto;margin:4px 0 10px}.cc-thumbs img{height:84px;border-radius:10px;flex:none}
.cc-more p{color:var(--text-muted);font-size:.9rem;line-height:1.6;margin:8px 0}
.art-body ul.cc-calc{list-style:none;padding:0;margin:10px 0;font-size:.86rem}
.cc-calc li{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);color:var(--text-muted)}
.cc-calc li b{color:var(--text);white-space:nowrap}
.art-body ul.cc-eq{list-style:none;padding:0;margin:8px 0;columns:1;font-size:.88rem}.cc-eq li{padding:3px 0 3px 18px;position:relative}.cc-eq li:before{content:'✓';position:absolute;left:0;color:var(--accent)}
.art-body a.cc-open{display:inline-flex;margin-top:8px;padding:9px 18px;border-radius:999px;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#002417;font-weight:700;font-size:.88rem;text-decoration:none}
"""
ART_STYLE += CARDS_CSS

EURO_BRANDS = {"Volkswagen", "Mercedes-Benz", "Audi", "BMW", "Renault", "Fiat", "Peugeot", "Skoda", "Opel", "Mini", "Volvo"}
CARS_EXCLUDE = {"toyota-sienta-1.5-109hp"}   # в каталоге год 2025 при пробеге 105 тыс. км — пока не публикуем в подборках, пока данные не уточнены
BUDGET_MAX = 1500000

def _budget_cars():
    cs = [c for c in json.load(open("data/cars.json", encoding="utf-8"))
          if c.get("published") is not False and c.get("price") and c["price"] <= BUDGET_MAX
          and c.get("type", "auto") == "auto" and c["id"] not in CARS_EXCLUDE]
    cs.sort(key=lambda c: -c["price"])
    return cs

CHINA_LOCAL_BRANDS = {"Haval", "Chery", "Geely", "Changan", "Jetour", "BYD", "Great Wall", "GAC", "Zeekr", "Lynk & Co", "Exeed", "Omoda",
                      "Jaecoo", "Tank", "MG", "Hongqi", "Voyah", "Li Auto", "Xpeng", "Nio", "Kaiyi", "JAC", "FAW", "Dongfeng", "Wuling", "Baojun"}

def _group_of(c):
    if c.get("country") == "Japan":
        return "japan-europe" if c.get("brand") in EURO_BRANDS else "japan-asia"
    if c.get("country") == "China":
        return "china-local" if c.get("brand") in CHINA_LOCAL_BRANDS else "china-global"
    return {"Korea": "korea"}.get(c.get("country"), "other")

def auto_description(c):
    """Запасное описание из характеристик, если в cars.json нет своего текста (ничего не выдумываем сверх данных)."""
    parts = [f'{c["brand"]} {c["model"]}, {c["year"]} год' + (f', пробег {int(c["mileage"]):,}'.replace(",", " ") + " км." if c.get("mileage") else ".")]
    eng = str(c.get("engine") or "").replace(",", ".").strip()
    tech = [f"двигатель {eng}" if eng else "", f'{c["power"]} л.с.' if c.get("power") else "", c.get("transmission") or "",
            DRIVE[c["drive"]] + " привод" if c.get("drive") in DRIVE else "", {"left": "левый руль", "right": "правый руль"}.get(c.get("wheel"), "")]
    tech = [t for t in tech if t]
    if tech:
        s = ", ".join(tech); parts.append(s[0].upper() + s[1:] + ".")
    parts.append("Подробную комплектацию, состояние и дополнительные фото пришлём по запросу — напишите менеджеру.")
    return " ".join(parts)

def car_card(c):
    slug = slugify(c["id"]); url = f"/auto/{slug}.html"
    name = f'{c["brand"]} {c["model"]} {c["year"]}'
    photos = c.get("photos") or []
    img = (f'<a class="cc-img" href="{url}"><img src="/{html.escape(photos[0])}" alt="{html.escape(name)} из {CMAP.get(c.get("country"),"")} под ключ" loading="lazy"></a>'
           if photos else f'<a class="cc-img" href="{url}"></a>')
    chips = []
    if c.get("mileage"): chips.append(f'{int(c["mileage"]):,}'.replace(",", " ") + " км")
    eng = str(c.get("engine") or "").replace(",", ".").strip()
    if eng: chips.append(eng + (f', {c["power"]} л.с.' if c.get("power") else ""))
    if c.get("transmission"): chips.append(c["transmission"])
    if c.get("drive") in DRIVE: chips.append(DRIVE[c["drive"]] + " привод")
    if c.get("wheel"): chips.append(WHEEL.get(c["wheel"], c["wheel"]) + " руль")
    if c.get("body") in BODY: chips.append(BODY[c["body"]])
    if c.get("color"): chips.append(c["color"])
    chips_html = "".join(f"<span>{html.escape(x)}</span>" for x in chips)
    thumbs = "".join(f'<img src="/{html.escape(p)}" alt="{html.escape(name)}" loading="lazy">' for p in photos[1:5])
    more = ""
    if thumbs: more += f'<div class="cc-thumbs">{thumbs}</div>'
    desc = (c.get("description") or "").strip() or auto_description(c)
    for para in [p for p in desc.split("\n") if p.strip()]: more += f"<p>{html.escape(para)}</p>"
    eq = [x for x in (c.get("equipment") or []) if x]
    if eq: more += '<ul class="cc-eq">' + "".join(f"<li>{html.escape(x)}</li>" for x in eq) + "</ul>"
    bd = c.get("breakdown") or {}
    rows = [("Автомобиль", bd.get("auction")), ("Логистика и доставка до Владивостока", (bd.get("domestic") or 0) + (bd.get("delivery") or 0)),
            ("Пошлина и утильсбор", bd.get("customs")), ("СБКТС и оформление", bd.get("docs")), ("Комиссия POWER Car", bd.get("commission"))]
    rows = [(k, v) for k, v in rows if v]
    if rows:
        more += '<ul class="cc-calc">' + "".join(f"<li><span>{html.escape(k)}</span><b>{fmt_price(v)}</b></li>" for k, v in rows) + f'<li><span><b>Итого под ключ</b></span><b>{fmt_price(c["price"])}</b></li></ul>'
    more += f'<a class="cc-open" href="{url}">Открыть карточку →</a>'
    return (f'<article class="cc" id="car-{slug}">{img}<div class="cc-info"><h3><a href="{url}">{c.get("flag","")} {html.escape(name)}</a></h3>'
            f'<div class="cc-price">{fmt_price(c["price"])}<small>под ключ до Владивостока</small></div><div class="cc-chips">{chips_html}</div></div>'
            f'<details class="cc-more"><summary>Развернуть</summary>{more}</details></article>')

def expand_car_markers(body):
    """{{cars:group}} → сетка карточек; {{n_total}}, {{n_<group>}}, {{china_min}} → числа из каталога. Возвращает (html, список авто в порядке показа)."""
    cs = _budget_cars(); shown = []
    groups = {}
    for c in cs: groups.setdefault(_group_of(c), []).append(c)
    # объединённая группа «china» (все китайские по убыванию цены) для статей, которым нужен общий список
    groups["china"] = sorted(groups.get("china-local", []) + groups.get("china-global", []), key=lambda c: -c["price"])
    # «japan-1m»: все японские до 1 млн ₽ (правый руль и кей-кары), по убыванию цены
    # «japan-german-plus»: праворукие немцы из Японии чуть выше потолка бюджета (1,5–2,5 млн ₽), по убыванию цены
    _all = [c for c in json.load(open("data/cars.json", encoding="utf-8"))
            if c.get("published") is not False and c.get("type", "auto") == "auto" and c["id"] not in CARS_EXCLUDE]
    groups["japan-german-plus"] = sorted([c for c in _all if c.get("country") == "Japan" and c.get("brand") in {"Mercedes-Benz", "BMW", "Audi", "Volkswagen"}
                                          and BUDGET_MAX < c["price"] <= 2500000], key=lambda c: -c["price"])
    groups["japan-1m"] = [c for c in cs if c.get("country") == "Japan" and c["price"] <= 1000000]
    def grid(m):
        g = groups.get(m.group(1), [])
        shown.extend(g)
        return '<div class="cc-grid">' + "".join(car_card(c) for c in g) + "</div>" if g else ""
    body = re.sub(r"\{\{cars:([a-z0-9-]+)\}\}", grid, body)
    def table(m):
        g = groups.get(m.group(1), [])
        if not g: return ""
        rows = ""
        for c in sorted(g, key=lambda c: c["price"]):
            eng = html.escape(str(c.get("engine") or "")) + (f' · {c["power"]} л.с.' if c.get("power") else "")
            km = f'{c["mileage"]:,}'.replace(",", "\u00a0") + "\u00a0км" if c.get("mileage") is not None else "—"
            rows += (f'<tr><td><a href="/auto/{slugify(c["id"])}.html">{html.escape(c["brand"])} {html.escape(c["model"])}</a></td>'
                     f'<td>{c.get("year","")}</td><td>{eng}</td><td>{km}</td><td>{"правый" if c.get("wheel") == "right" else "левый"}</td><td class="num">{fmt_price(c["price"])}</td></tr>')
        return ('<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Модель</th><th>Год</th><th>Двигатель</th><th>Пробег</th><th>Руль</th><th>Под ключ</th></tr></thead><tbody>'
                + rows + '</tbody></table></div>')
    body = re.sub(r"\{\{table:([a-z0-9-]+)\}\}", table, body)
    body = body.replace("{{n_total}}", str(len(cs)))
    for g, lst in groups.items(): body = body.replace("{{n_" + g.replace("-", "_") + "}}", str(len(lst)))
    cm = min([c["price"] for c in groups.get("china", [])] or [0])
    body = body.replace("{{china_min}}", fmt_price(cm) if cm else "")
    return body, shown


# ---------- Страница «Отзывы и кейсы»: статический HTML из data/cases.json (чтобы тексты видели и поисковики, и ИИ-краулеры) ----------
REVIEWS_CSS = """
.rv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0 28px}
@media(max-width:700px){.rv-grid{grid-template-columns:1fr}}
.rv{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.rv-img{aspect-ratio:4/3;background:rgba(255,255,255,.05)}.rv-img img{width:100%;height:100%;object-fit:cover;display:block}
.rv-body{padding:14px 16px 14px;display:flex;flex-direction:column;gap:6px}
.rv-body h3{font-size:1.02rem;line-height:1.3;margin:0}
.rv-who{color:var(--text-muted);font-size:.88rem}
.rv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.rv-chips span{background:rgba(255,255,255,.07);border-radius:999px;padding:3px 10px;font-size:.78rem;color:var(--text-muted)}
.rv-price{font-weight:800;color:var(--accent-2)}
.art-body blockquote.rv-q{margin:8px 0 0;padding:10px 14px;border-left:3px solid var(--accent);background:rgba(16,185,129,.07);border-radius:0 10px 10px 0;color:var(--text);font-size:.93rem;line-height:1.55}
.rv details{margin-top:6px}.rv details summary{cursor:pointer;color:var(--accent-2);font-weight:600;font-size:.9rem;padding:6px 0}
.rv details p{color:var(--text-muted);font-size:.9rem;line-height:1.6;margin:6px 0}
.rv-thumbs{display:flex;gap:8px;overflow-x:auto;margin:6px 0}.rv-thumbs img{height:80px;border-radius:10px;flex:none}
.art-body a.rv-video{display:inline-flex;margin-top:6px;color:var(--accent-2);font-weight:600;font-size:.88rem}
"""
ART_STYLE += REVIEWS_CSS
ART_STYLE += """
.cc-table-wrap{overflow-x:auto;margin:16px 0 26px;border:1px solid rgba(255,255,255,.09);border-radius:14px}
.cc-table{width:100%;border-collapse:collapse;font-size:.9rem;min-width:520px}
.cc-table th{background:rgba(255,255,255,.05);text-align:left;font-weight:600;color:var(--text-muted);padding:10px 14px;white-space:nowrap}
.cc-table td{padding:10px 14px;border-top:1px solid rgba(255,255,255,.07)}
.cc-table td.num{font-weight:700;color:var(--accent-2);white-space:nowrap}
.cc-table a{color:var(--text);text-decoration:underline;text-decoration-color:rgba(255,255,255,.25)}
.cc-table a:hover{color:var(--accent-2)}
"""

def _plural(n, one, few, many):
    n = abs(n) % 100
    if 10 < n < 20: return many
    return {1: one, 2: few, 3: few, 4: few}.get(n % 10, many)

def _case_card(c):
    title = c.get("carTitle", "")
    photos = c.get("photos") or []
    img = (f'<div class="rv-img"><img src="/{html.escape(photos[0][:-5] + "-card.webp" if photos[0].endswith(".webp") else photos[0])}" alt="{html.escape(title)} — {c.get("clientCity","")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'/{html.escape(photos[0])}\'"></div>' if photos else "")
    _n = (c.get("clientName") or "").strip(); _city = c.get("clientCity") or ""
    who = (f'{html.escape(_n)}, {html.escape(_city)}' if _n and _n != "Клиент" else (f'клиент из города {html.escape(_city)}' if _city and not str(_city).isdigit() else "клиент"))
    chips = [f'{c.get("flag","")} {html.escape(c.get("country",""))}'.strip()]
    if c.get("year"): chips.append(f'{c["year"]} г.')
    if c.get("deliveryDays"): chips.append(f'{c["deliveryDays"]} дн. доставка')
    chips_html = "".join(f"<span>{x}</span>" for x in chips if x)
    price = f'<div class="rv-price">{fmt_price(c["finalPrice"])} под ключ</div>' if c.get("showPrice") and c.get("finalPrice") else ""
    quote = f'<blockquote class="rv-q">«{html.escape(c["quote"].strip())}» — {who}</blockquote>' if (c.get("quote") or "").strip() else ""
    story = (c.get("story") or "").replace("🏳", "•").strip()
    more = ""
    thumbs = "".join(f'<img src="/{html.escape(p)}" alt="{html.escape(title)}" loading="lazy">' for p in photos[1:5])
    if thumbs: more += f'<div class="rv-thumbs">{thumbs}</div>'
    for para in [p.strip() for p in story.split("\n") if p.strip()]: more += f"<p>{html.escape(para)}</p>"
    video = c.get("videoUrl") or ""
    if video.startswith("https://"): more += f'<a class="rv-video" href="{html.escape(video)}" target="_blank" rel="noopener nofollow">Видео выдачи автомобиля →</a>'
    details = f'<details><summary>Подробнее о заказе</summary>{more}</details>' if more else ""
    return f'<article class="rv" id="case-{slugify(c["id"])}">{img}<div class="rv-body"><h3>{html.escape(title)}</h3><div class="rv-who">{who[0].upper() + who[1:]}</div><div class="rv-chips">{chips_html}</div>{price}{quote}{details}</div></article>'

def reviews_article():
    cs = [c for c in json.load(open("data/cases.json", encoding="utf-8")) if c.get("published") is not False]
    cs.sort(key=lambda c: -(c.get("priority") or 0))
    days = [c["deliveryDays"] for c in cs if c.get("deliveryDays")]
    cnt = {}
    for c in cs: cnt[c.get("country", "")] = cnt.get(c.get("country", ""), 0) + 1
    by_country = ", ".join(f"{k} — {v}" for k, v in sorted(cnt.items(), key=lambda x: -x[1]) if k)
    cities = sorted({c.get("clientCity") for c in cs if c.get("clientCity") and not str(c.get("clientCity")).isdigit()})
    intro = (f'<p><strong>Коротко:</strong> здесь собрано {len(cs)} {_plural(len(cs), 'реальный заказ', 'реальных заказа', 'реальных заказов')} клиентов POWER Car: автомобили из Японии, Кореи и Китая, которые мы подобрали, выкупили, доставили и растаможили. '
             f'Страны: {by_country}. Города клиентов: {", ".join(cities)}. Срок доставки в этих заказах — от {min(days)} до {max(days)} дней.</p>'
             '<p>Показываю не только красивые итоги, но и цену под ключ там, где клиент разрешил её публиковать: так видно, из чего складывается стоимость. '
             'Если захотите разобраться в своей ситуации, посчитайте автомобиль в <a href="/kalkulyator-rastamozhki.html">калькуляторе «под ключ»</a> или посмотрите актуальные <a href="/#selector">автомобили в каталоге</a>. '
             'Как мы работаем с оплатой, разобрано в статье <a href="/articles/swift-oplata-invoice-2026.html">про оплату инвойса</a>, а на что смотреть в листе — в <a href="/articles/reading-japanese-auction-sheet.html">разборе аукционных листов</a>.</p>')
    body = intro + '<h2>Заказы клиентов</h2><div class="rv-grid">' + "".join(_case_card(c) for c in cs) + "</div>" + \
           '<h2>Хотите так же?</h2><p>Напишите менеджеру в MAX или Telegram, расскажите бюджет и задачи, и мы подберём варианты. Подбор бесплатный, предоплаты за подбор нет.</p>'
    ld_list = {"@context": "https://schema.org", "@type": "ItemList", "name": "Отзывы и кейсы клиентов POWER Car",
               "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": c.get("carTitle", ""), "url": BASE + "otzyvy.html#case-" + slugify(c["id"])} for i, c in enumerate(cs)]}
    art = {"slug": "otzyvy", "title": "Отзывы и кейсы клиентов POWER Car: автомобили из Японии, Кореи и Китая",
           "seoTitle": "Отзывы клиентов и кейсы POWER Car: авто из Азии под ключ", "description": f"{len(cs)} реальных заказов клиентов POWER Car: автомобили из Японии, Кореи и Китая с фото, сроками и ценой под ключ.",
           "seoDescription": f"{len(cs)} реальных заказов клиентов POWER Car: автомобили из Японии, Кореи и Китая с фото, сроками доставки и ценой под ключ. Томск, Новосибирск, Москва.",
           "publishedAt": "2026-10-12", "updatedAt": "2026-10-12", "author": "POWER Car", "readTime": max(3, len(cs) // 4), "body": body}
    return art, [ld_list]

def article_page(a, all_articles, path=None, crumb=("Статьи", "/#articles"), back=("← К статьям", "/#articles"), extra_ld=None):
    slug = a["slug"]
    body_raw, listed_cars = expand_car_markers(a.get("body", ""))
    body_with_mid = insert_mid_cta(body_raw, slug)
    url = BASE + (path or f"articles/{slug}.html")
    base_title = a.get("seoTitle") or a.get("title")
    title = base_title if "POWER Car" in base_title else base_title + " — POWER Car"
    desc = a.get("seoDescription") or a.get("description") or ""
    cover = a.get("cover") or ""
    cover_abs = (BASE + cover) if cover and not cover.startswith("http") else (cover or BASE + "og-cover.jpg")
    cover_html = f'<div class="art-cover"><img src="/{html.escape(cover)}" alt="{html.escape(a["title"])}"></div>' if cover else ""

    others = [x for x in all_articles if x["slug"] != slug and x.get("published") is not False]
    same = [x for x in others if a.get("category") and x.get("category") == a["category"]]
    fresh = [x for x in others if x not in same]
    related = (same + fresh)[:3]
    rcards = ""
    for x in related:
        rc = f'<div class="art-related-cover"><img src="/{html.escape(x.get("cover",""))}" alt="{html.escape(x["title"])}" loading="lazy" decoding="async"></div>' if x.get("cover") else ""
        cat = f'<span class="art-related-cat">{html.escape(x["category"])}</span>' if x.get("category") else ""
        rt = f'<span class="art-related-meta">⏱ {x["readTime"]} мин</span>' if x.get("readTime") else ""
        rcards += f'<a class="art-related-card" href="/articles/{html.escape(x["slug"])}.html">{rc}{cat}<h4 class="art-related-title">{html.escape(x["title"])}</h4>{rt}</a>'
    related_html = f'<section class="art-related-block" aria-label="Связанные статьи"><h2 class="art-related-heading">Читайте также</h2><div class="art-related-grid">{rcards}</div></section>' if related else ""

    cat_pill = f'<span class="art-category-pill">{html.escape(a["category"])}</span>' if a.get("category") else ""
    meta_row = f'<span>{fmt_date(a.get("publishedAt",""))}</span>'
    updated_at = a.get("updatedAt")
    if updated_at and updated_at != a.get("publishedAt"):
        meta_row += f'<span>Обновлено: {fmt_date(updated_at)}</span>'
    if a.get("readTime"): meta_row += f'<span>⏱ {a["readTime"]} мин чтения</span>'
    if a.get("author"): meta_row += f'<span>✍️ {html.escape(a["author"])}</span>'

    ld_article = {"@context":"https://schema.org","@type":"Article","headline":a["title"],
        "description":a.get("description",""),"datePublished":a.get("publishedAt",""),
        "dateModified":a.get("updatedAt") or a.get("publishedAt",""),
        "image":cover_abs,"mainEntityOfPage":url,
        "author":{"@type":"Organization","name":a.get("author") or "POWER Car"},
        "publisher":{"@type":"Organization","name":"POWER Car","logo":{"@type":"ImageObject","url":BASE+"android-chrome-512x512.png"}}}
    ld_bc = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":"Главная","item":BASE},
        {"@type":"ListItem","position":2,"name":crumb[0],"item":BASE+crumb[1].lstrip("/")},
        {"@type":"ListItem","position":3,"name":a["title"],"item":url}]}
    ld_items = [ld_article, ld_bc] + list(extra_ld or [])
    if listed_cars:
        ld_items.append({"@context": "https://schema.org", "@type": "ItemList", "name": a["title"],
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": BASE + "auto/" + slugify(c["id"]) + ".html",
                                 "name": f'{c["brand"]} {c["model"]} {c["year"]}'} for i, c in enumerate(listed_cars)]})
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x,ensure_ascii=False)}</script>' for x in ld_items)

    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#10B981">
<meta property="og:type" content="article">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{html.escape(cover_abs)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png"><link rel="icon" type="image/png" sizes="120x120" href="/favicon-120x120.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="preconnect" href="https://mc.yandex.ru">
<link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,500,600&display=swap" rel="stylesheet">
<style>{ART_STYLE}</style>
{ld}
</head>
<body>
<header class="art-header">
  <a href="/" class="art-logo"><img src="/images/logo/logo-50.svg" alt="POWER Car" width="50" height="23" style="height:36px;width:auto;display:block;"></a>
  <a href="{back[1]}" class="art-back">{back[0]}</a>
</header>
<main class="art-content" id="articleContent">
  <nav class="art-breadcrumbs"><a href="/">Главная</a> › <a href="{crumb[1]}">{crumb[0]}</a> › <span>{html.escape(a["title"])}</span></nav>
  {cat_pill}
  <h1 class="art-title">{html.escape(a["title"])}</h1>
  <div class="art-meta">{meta_row}</div>
  {cover_html}
  <div class="art-body">{body_with_mid}</div>
  {related_html}
  <div class="art-cta">
    <h3>Готовы заказать авто из Азии?</h3>
    <p>Напишите нам — подберём 3 варианта под ваш бюджет бесплатно и ответим в течение рабочего дня.</p>
    {QUICK("article_end", slug)}
    <div class="art-cta-buttons">
      <a href="/#selector" class="art-cta-btn art-cta-btn-secondary" data-goal="car_opened" data-place="article_end">🔍 Посмотреть каталог</a>
      <a href="/kalkulyator-rastamozhki.html" class="art-cta-btn art-cta-btn-secondary" data-place="article_end">🧮 Калькулятор под ключ</a>
    </div>
  </div>
</main>
<footer class="art-footer" role="contentinfo">
  <div class="art-footer-inner">
    <nav class="art-footer-nav" aria-label="Документы">
      <a href="/docs/privacy.html">Политика конфиденциальности</a><span class="art-footer-sep">·</span>
      <a href="/docs/terms.html">Пользовательское соглашение</a><span class="art-footer-sep">·</span>
      <a href="/docs/agreement.html">Договор-оферта</a>
    </nav>
    <div class="art-footer-meta">© 2026 POWER Car · ИП Степанов Александр Васильевич · ИНН 702205795181</div>
  </div>
</footer>
<nav class="art-sticky" aria-label="Быстрые контакты">{STICKY(slug)}</nav>
<script>{ART_TRACK_JS}</script>
{METRIKA}
</body>
</html>'''

# ---------------------------------------------------------------- CARS
CMAP = {"Japan":"Японии","Korea":"Кореи","China":"Китая"}
COUNTRY = {"Japan":"Япония","Korea":"Корея","China":"Китай"}
BODY = {"crossover":"кроссовер","sedan":"седан","hatchback":"хэтчбек","suv":"внедорожник","minivan":"минивэн","wagon":"универсал"}
WHEEL = {"left":"левый","right":"правый"}

def related_articles_for_car(c, articles):
    """Подбирает до 3 статей: сперва по упоминанию страны авто в заголовке/описании, затем — самые свежие."""
    country_kw = CMAP.get(c.get("country"), "").lower()
    def score(a):
        text = (a.get("title", "") + " " + a.get("description", "")).lower()
        return 1 if country_kw and country_kw in text else 0
    ranked = sorted(articles, key=lambda a: (score(a), a.get("publishedAt", "")), reverse=True)
    return ranked[:3]

def car_page(c, articles):
    cid = slugify(c["id"]); brand=c["brand"]; model=c["model"]; year=c["year"]
    name = f"{brand} {model} {year}"; country = CMAP.get(c.get("country"),"")
    url = f"{BASE}auto/{cid}.html"
    title = f"{name} из {country} под ключ — {fmt_price(c['price'])} | POWER Car"
    desc = f"{name}, {c.get('engine','')}, {c.get('transmission','')}. Импорт из {country} под ключ за 25–40 дней. Цена под ключ {fmt_price(c['price'])}, прозрачный расчёт. POWER Car."
    if (c.get("description") or "").strip():
        d0 = " ".join(c["description"].split())
        desc = (d0[:150].rsplit(" ",1)[0] + "…" if len(d0)>150 else d0) + f" Под ключ {fmt_price(c['price'])}. POWER Car."
    photos = c.get("photos") or []
    main_img = f'<img id="cm" src="/{html.escape(photos[0])}" alt="{html.escape(name)} — импорт из {country} под ключ">' if photos else '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-weight:700">POWER Car</div>'
    thumbs = "".join(f'<img src="/{html.escape(p)}" alt="{html.escape(name)} фото {i+2}" loading="lazy" onclick="document.getElementById(\'cm\').src=this.src">' for i,p in enumerate(photos[1:6]))
    pm = c.get("priceMarket") or 0
    market = f'<span class="market">{fmt_price(pm)}</span>' if pm>c["price"] else ""
    save = f'<div class="save">Выгода ≈ {fmt_price(pm-c["price"])} к рынку РФ</div>' if pm>c["price"] else ""
    specs = [("Год выпуска",year),("Пробег",(f"{int(c['mileage']):,}".replace(',',' ')+" км") if c.get("mileage") is not None else "—"),
             ("Двигатель",c.get("engine","—")),("Коробка",c.get("transmission","—")),
             ("Кузов",BODY.get(c.get("body"),c.get("body","—"))),("Руль",WHEEL.get(c.get("wheel"),c.get("wheel","—"))),
             ("Страна вывоза",COUNTRY.get(c.get("country"),"—"))]
    if c.get("trim"): specs.insert(2, ("Комплектация", c["trim"]))
    if c.get("drive") in DRIVE: specs.append(("Привод", DRIVE[c["drive"]]))
    if c.get("color"): specs.append(("Цвет", c["color"]))
    specs_html = "".join(f"<tr><td>{html.escape(str(k))}</td><td>{html.escape(str(v))}</td></tr>" for k,v in specs)
    eq = [x for x in (c.get("equipment") or []) if x]
    desc_text = (c.get("description") or "").strip() or auto_description(c)
    desc_paras = "".join(f"<p>{html.escape(p)}</p>" for p in desc_text.split("\n") if p.strip())
    eq_html = ('<ul class="eq">' + "".join(f"<li>{html.escape(x)}</li>" for x in eq) + '</ul>') if eq else ""
    desc_block = (f'<section><h2 class="sec-h">Описание и комплектация</h2><div class="card desc">{desc_paras}{eq_html}</div></section>') if (desc_paras or eq_html) else ""
    b = c.get("breakdown") or {}
    rows = [("Стоимость на аукционе",b.get("auction")),("Логистика внутри страны",b.get("domestic")),("Доставка до РФ",b.get("delivery")),
            ("Таможенная пошлина",b.get("customs")),("Оформление документов / СБКТС",b.get("docs")),("Комиссия POWER Car",b.get("commission"))]
    bd = "".join(f'<tr><td>{html.escape(k)}</td><td>{fmt_price(v)}</td></tr>' for k,v in rows if v)
    breakdown = (f'<section><h2 class="sec-h">Расчёт стоимости под ключ</h2>'
                 f'<p class="sec-sub">Прозрачно, без скрытых платежей. Все суммы фиксируются в договоре.</p>'
                 f'<div class="card"><table class="bd">{bd}<tr class="total"><td>Итого под ключ</td><td>{fmt_price(c["price"])}</td></tr></table>'
                 f'<p class="note">Расчёт ориентировочный, актуальные курс и ставки уточняются на момент заказа.</p></div></section>') if bd else ""

    related = related_articles_for_car(c, articles)
    rel_cards = ""
    for a in related:
        cat_span = f'<span class="rel-cat">{html.escape(a["category"])}</span>' if a.get("category") else ""
        rt_span = f'<span class="rel-meta">⏱ {a["readTime"]} мин</span>' if a.get("readTime") else ""
        rel_cards += (f'<a class="rel-card" href="/articles/{html.escape(a["slug"])}.html">'
                      f'{cat_span}<h4>{html.escape(a["title"])}</h4>{rt_span}</a>')
    related_block = (f'<section><h2 class="sec-h">Читайте также</h2>'
                     f'<div class="rel-grid">{rel_cards}</div></section>') if rel_cards else ""

    img0 = ("/"+photos[0]) if photos else (BASE+"og-cover.jpg")
    ld_car = {"@context":"https://schema.org","@type":"Car","name":name,"url":url,
        "brand":{"@type":"Brand","name":brand},"model":model,"vehicleModelDate":str(year),
        "bodyType":BODY.get(c.get("body"),c.get("body","")),
        "steeringPosition":"RightHandDriving" if c.get("wheel")=="right" else "LeftHandDriving",
        "image":(BASE+photos[0]) if photos else BASE+"og-cover.jpg",
        "offers":{"@type":"Offer","price":c["price"],"priceCurrency":"RUB","availability":"https://schema.org/InStock",
                  "itemCondition":"https://schema.org/UsedCondition","priceValidUntil":PRICE_VALID_UNTIL,
                  "url":url,"seller":{"@type":"AutoDealer","name":"POWER Car","url":BASE}}}
    if desc_text: ld_car["description"]=desc_text
    if c.get("color"): ld_car["color"]=c["color"]
    if c.get("trim"): ld_car["vehicleConfiguration"]=c["trim"]
    if c.get("mileage") is not None:
        ld_car["mileageFromOdometer"]={"@type":"QuantitativeValue","value":c["mileage"],"unitCode":"KMT"}
    ld_bc = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":"Главная","item":BASE},
        {"@type":"ListItem","position":2,"name":"Каталог","item":BASE+"#selector"},
        {"@type":"ListItem","position":3,"name":name,"item":url}]}
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x,ensure_ascii=False)}</script>' for x in (ld_car, ld_bc))

    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0A0A0A">
<meta property="og:type" content="product">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{html.escape(img0 if img0.startswith('http') else BASE+img0.lstrip('/'))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png"><link rel="icon" type="image/png" sizes="120x120" href="/favicon-120x120.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="preconnect" href="https://mc.yandex.ru">
<link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,600&display=swap" rel="stylesheet">
<style>{CAR_STYLE}</style>
{ld}
</head>
<body>
<header class="gh">
  <a href="/" class="gh-logo">POWER <b>Car</b></a>
  <a href="/#selector" class="btn btn-primary">Подобрать авто</a>
</header>
<main class="wrap">
  <nav class="bc"><a href="/">Главная</a> → <a href="/#selector">Каталог</a> → {html.escape(name)}</nav>
  <div class="top">
    <div class="gallery"><div class="main">{main_img}</div><div class="thumbs">{thumbs}</div></div>
    <div>
      <span class="flag">{c.get('flag','')}</span>
      <h1>{html.escape(name)}</h1>
      <div class="sub">Импорт из {country} под ключ · доставка 25–40 дней</div>
      <div class="price">{fmt_price(c['price'])}{market}</div>{save}
      <div class="price-date">Цена под ключ на {TODAY_RU}, фиксируется в договоре</div>
      <table class="specs">{specs_html}</table>
      <div class="cta-box">
        <a href="/#cta" class="btn btn-primary">Обсудить авто</a>
        <a href="tel:+79138533305" class="btn btn-ghost">Позвонить</a>
      </div>
    </div>
  </div>
  {desc_block}
  {breakdown}
  {related_block}
  <section><div class="cta" id="cta">
    <h2>Обсудить {html.escape(brand)} {html.escape(model)} с менеджером</h2>
    <p>Бесплатный расчёт и сопровождение до выдачи. Без предоплаты за подбор. Доставка в Томск, Новосибирск, Москву и другие регионы.</p>
    <a href="/#selector" class="btn btn-primary">Перейти в подборщик</a>
  </div></section>
</main>
<footer class="gf"><div class="wrap">
  <a href="/" class="gh-logo">POWER <b>Car</b></a>
  <div class="slogan">Надёжность, рождённая в Сибири</div>
  <div class="gf-links"><a href="/">Главная</a><a href="/#selector">Каталог</a>
    <a href="/import-avto-tomsk.html">Томск</a><a href="/import-avto-novosibirsk.html">Новосибирск</a><a href="/import-avto-moskva.html">Москва</a></div>
  <p style="margin-top:12px">ИП Степанов А.В., ИНН 702205795181.</p>
</div></footer>
{METRIKA}
</body>
</html>'''

# ---------------------------------------------------------------- BUILD
def sync_dir(folder, wanted):
    """Записать нужные файлы, удалить лишние (проданные/снятые)."""
    os.makedirs(folder, exist_ok=True)
    for name, content in wanted.items():
        with open(os.path.join(folder, name), "w", encoding="utf-8") as f:
            f.write(content)
    keep = set(wanted)
    removed = 0
    for p in glob.glob(os.path.join(folder, "*.html")):
        if os.path.basename(p) not in keep:
            os.remove(p); removed += 1
    return len(wanted), removed

articles = [a for a in json.load(open("data/articles.json", encoding="utf-8")) if a.get("published") is not False]
cars = [c for c in json.load(open("data/cars.json", encoding="utf-8")) if c.get("published")]

art_files = {a["slug"] + ".html": article_page(a, articles) for a in articles}
car_files = {slugify(c["id"]) + ".html": car_page(c, articles) for c in cars}
rv_art, rv_ld = reviews_article()
with open("otzyvy.html", "w", encoding="utf-8") as _f:
    _f.write(article_page(rv_art, articles, path="otzyvy.html", crumb=("Отзывы", "/otzyvy.html"), back=("← На главную", "/"), extra_ld=rv_ld))
na, ra = sync_dir("articles", art_files)
nc, rc = sync_dir("auto", car_files)

# sitemap
def u(loc, pri, freq):
    return f"  <url>\n    <loc>{escape(loc)}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>{freq}</changefreq>\n    <priority>{pri}</priority>\n  </url>"
urls = [u(BASE, "1.0", "daily")]
urls.append(u(BASE+"quiz.html", "0.9", "weekly"))
urls.append(u(BASE+"kalkulyator-rastamozhki.html", "0.9", "weekly"))
urls.append(u(BASE+"kalkulyator-utilsbora.html", "0.8", "weekly"))
urls.append(u(BASE+"dostavka-po-rossii.html", "0.85", "weekly"))
urls.append(u(BASE+"otzyvy.html", "0.8", "weekly"))
# Страновые SEO-лендинги (scripts/gen_countries.py)
for s in ["avto-iz-yaponii","avto-iz-korei","avto-iz-kitaya","moto-iz-yaponii"]:
    urls.append(u(BASE+s+".html", "0.85", "weekly"))
# Городские SEO-лендинги (scripts/gen_geo.py)
for s in ["import-avto-tomsk","import-avto-novosibirsk","import-avto-moskva"]:
    urls.append(u(BASE+s+".html", "0.8", "weekly"))
for a in articles:
    urls.append(u(BASE+"articles/"+a["slug"]+".html", "0.7", "weekly"))
for c in cars:
    urls.append(u(BASE+"auto/"+slugify(c["id"])+".html", "0.6", "weekly"))
for d in ["docs/privacy.html","docs/terms.html","docs/agreement.html"]:
    urls.append(u(BASE+d, "0.3", "monthly"))
sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n"
open("sitemap.xml", "w", encoding="utf-8").write(sitemap)

print(f"articles: {na} written, {ra} removed")
print(f"cars:     {nc} written, {rc} removed")
print(f"sitemap:  {sitemap.count('<loc>')} urls")
