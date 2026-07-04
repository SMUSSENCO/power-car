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
from datetime import date
from urllib.parse import quote
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
BASE = "https://power-car.ru/"
# Use today's date for <lastmod> in generated sitemap (was hardcoded to a stale value)
TODAY = date.today().isoformat()

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
CAR_STYLE = extract_style(read("car.html"))

# ---------------------------------------------------------------- ARTICLES
def article_page(a, all_articles):
    slug = a["slug"]
    url = f"{BASE}articles/{slug}.html"
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
    if a.get("readTime"): meta_row += f'<span>⏱ {a["readTime"]} мин чтения</span>'
    if a.get("author"): meta_row += f'<span>✍️ {html.escape(a["author"])}</span>'

    ld_article = {"@context":"https://schema.org","@type":"Article","headline":a["title"],
        "description":a.get("description",""),"datePublished":a.get("publishedAt",""),
        "image":cover_abs,"mainEntityOfPage":url,
        "author":{"@type":"Organization","name":a.get("author") or "POWER Car"},
        "publisher":{"@type":"Organization","name":"POWER Car","logo":{"@type":"ImageObject","url":BASE+"android-chrome-512x512.png"}}}
    ld_bc = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
        {"@type":"ListItem","position":1,"name":"Главная","item":BASE},
        {"@type":"ListItem","position":2,"name":"Статьи","item":BASE+"#articles"},
        {"@type":"ListItem","position":3,"name":a["title"],"item":url}]}
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x,ensure_ascii=False)}</script>' for x in (ld_article, ld_bc))

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
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="preconnect" href="https://mc.yandex.ru">
<link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,500,600&display=swap" rel="stylesheet">
<style>{ART_STYLE}</style>
{ld}
</head>
<body>
<header class="art-header">
  <a href="/" class="art-logo"><img src="/images/logo/logo-50.svg" alt="POWER Car" width="50" height="23" style="height:36px;width:auto;display:block;"></a>
  <a href="/#articles" class="art-back">← К статьям</a>
</header>
<main class="art-content" id="articleContent">
  <nav class="art-breadcrumbs"><a href="/">Главная</a> › <a href="/#articles">Статьи</a> › <span>{html.escape(a["title"])}</span></nav>
  {cat_pill}
  <h1 class="art-title">{html.escape(a["title"])}</h1>
  <div class="art-meta">{meta_row}</div>
  {cover_html}
  <div class="art-body">{a.get("body","")}</div>
  {related_html}
  <div class="art-cta">
    <h3>Готовы заказать авто из Азии?</h3>
    <p>Получите 3 варианта под ваш бюджет — бесплатно. Менеджер свяжется в течение рабочего дня.</p>
    <div class="art-cta-buttons">
      <a href="/#selector" class="art-cta-btn art-cta-btn-secondary">🔍 Подобрать авто</a>
      <a href="/#cta" class="art-cta-btn art-cta-btn-primary">Связаться с менеджером →</a>
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
{METRIKA}
</body>
</html>'''

# ---------------------------------------------------------------- CARS
CMAP = {"Japan":"Японии","Korea":"Кореи","China":"Китая"}
COUNTRY = {"Japan":"Япония","Korea":"Корея","China":"Китай"}
BODY = {"crossover":"кроссовер","sedan":"седан","hatchback":"хэтчбек","suv":"внедорожник","minivan":"минивэн","wagon":"универсал"}
WHEEL = {"left":"левый","right":"правый"}

def car_page(c):
    cid = slugify(c["id"]); brand=c["brand"]; model=c["model"]; year=c["year"]
    name = f"{brand} {model} {year}"; country = CMAP.get(c.get("country"),"")
    url = f"{BASE}auto/{cid}.html"
    title = f"{name} из {country} под ключ — {fmt_price(c['price'])} | POWER Car"
    desc = f"{name}, {c.get('engine','')}, {c.get('transmission','')}. Импорт из {country} под ключ за 25–40 дней. Цена под ключ {fmt_price(c['price'])}, прозрачный расчёт. POWER Car."
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
    specs_html = "".join(f"<tr><td>{html.escape(str(k))}</td><td>{html.escape(str(v))}</td></tr>" for k,v in specs)
    b = c.get("breakdown") or {}
    rows = [("Стоимость на аукционе",b.get("auction")),("Доставка до РФ",b.get("delivery")),
            ("Таможенная пошлина",b.get("customs")),("Оформление документов / СБКТС",b.get("docs")),("Комиссия POWER Car",b.get("commission"))]
    bd = "".join(f'<tr><td>{html.escape(k)}</td><td>{fmt_price(v)}</td></tr>' for k,v in rows if v)
    breakdown = (f'<section><h2 class="sec-h">Расчёт стоимости под ключ</h2>'
                 f'<p class="sec-sub">Прозрачно, без скрытых платежей. Все суммы фиксируются в договоре.</p>'
                 f'<div class="card"><table class="bd">{bd}<tr class="total"><td>Итого под ключ</td><td>{fmt_price(c["price"])}</td></tr></table>'
                 f'<p class="note">Расчёт ориентировочный, актуальные курс и ставки уточняются на момент заказа.</p></div></section>') if bd else ""

    img0 = ("/"+photos[0]) if photos else (BASE+"og-cover.jpg")
    ld_car = {"@context":"https://schema.org","@type":"Car","name":name,"url":url,
        "brand":{"@type":"Brand","name":brand},"model":model,"vehicleModelDate":str(year),
        "bodyType":BODY.get(c.get("body"),c.get("body","")),
        "steeringPosition":"RightHandDriving" if c.get("wheel")=="right" else "LeftHandDriving",
        "image":(BASE+photos[0]) if photos else BASE+"og-cover.jpg",
        "offers":{"@type":"Offer","price":c["price"],"priceCurrency":"RUB","availability":"https://schema.org/InStock",
                  "url":url,"seller":{"@type":"AutoDealer","name":"POWER Car","url":BASE}}}
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
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
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
      <table class="specs">{specs_html}</table>
      <div class="cta-box">
        <a href="/#cta" class="btn btn-primary">Обсудить авто</a>
        <a href="tel:+79138533305" class="btn btn-ghost">Позвонить</a>
      </div>
    </div>
  </div>
  {breakdown}
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
car_files = {slugify(c["id"]) + ".html": car_page(c) for c in cars}
na, ra = sync_dir("articles", art_files)
nc, rc = sync_dir("auto", car_files)

# sitemap
def u(loc, pri, freq):
    return f"  <url>\n    <loc>{escape(loc)}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>{freq}</changefreq>\n    <priority>{pri}</priority>\n  </url>"
urls = [u(BASE, "1.0", "daily")]
urls.append(u(BASE+"quiz.html", "0.9", "weekly"))
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
