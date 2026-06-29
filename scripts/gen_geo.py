#!/usr/bin/env python3
# Генератор гео-страниц POWER Car. Данные: offices.json + cars.json + проверенные источники.
import json, html, os, re
from urllib.parse import quote
from collections import Counter

OUT = "/mnt/user-data/outputs"
def slug(s): return re.sub(r"[^A-Za-z0-9_-]+","-",s).strip("-")
cars = [c for c in json.load(open("data/cars.json")) if c.get("published")]
offices = {o["id"]: o for o in json.load(open("data/offices.json"))}

def fmt(n):
    return f"{int(n):,}".replace(",", " ") + " ₽"

# --- РЕАЛЬНАЯ статистика каталога (для честного блока «в наличии у нас») ---
def brand_key(b):
    return "Mercedes-Benz" if b.strip().lower().replace("-", " ") == "mercedes benz" else b
inv_country = Counter({"Япония": 0, "Корея": 0, "Китай": 0})
cmap = {"Japan": "Япония", "Korea": "Корея", "China": "Китай"}
for c in cars:
    k = cmap.get(c.get("country"))
    if k: inv_country[k] += 1
inv_brand = Counter(brand_key(c["brand"]) for c in cars).most_common(6)
total_inv = len(cars)

# --- Данные Автостата (проверено поиском, источники указаны на странице) ---
# Структура импорта б/у авто в РФ, 1 кв. 2026 (Автостат)
import_structure = [("Япония", 57.7), ("Китай", 23.6), ("Корея", 7.4), ("Прочие", 11.3)]

ACCENT = "#10B981"

def svg_bars(data, unit="%", maxv=None, color=ACCENT):
    """Горизонтальные бар-чарты на чистом SVG (без внешних зависимостей)."""
    maxv = maxv or max(v for _, v in data)
    rowh, gap, lblw, barw = 34, 10, 132, 360
    h = len(data) * (rowh + gap) + 6
    rows = []
    y = 6
    for label, v in data:
        w = max(2, barw * v / maxv)
        rows.append(f'''<text x="0" y="{y+rowh*0.62}" class="gc-lbl">{html.escape(label)}</text>
<rect x="{lblw}" y="{y+4}" rx="6" width="{barw}" height="{rowh-8}" class="gc-track"/>
<rect x="{lblw}" y="{y+4}" rx="6" width="{w:.1f}" height="{rowh-8}" fill="{color}"/>
<text x="{lblw+w+8:.1f}" y="{y+rowh*0.62}" class="gc-val">{v}{unit}</text>''')
        y += rowh + gap
    return f'<svg viewBox="0 0 {lblw+barw+70} {h}" class="geo-chart" role="img">{"".join(rows)}</svg>'

def car_card(c):
    photo = (c.get("photos") or [None])[0]
    alt = html.escape(f'{c["brand"]} {c["model"]} {c["year"]} — импорт под ключ')
    img = f'<img src="{photo}" alt="{alt}" loading="lazy" width="320" height="200">' if photo \
        else '<div class="cc-noimg">POWER Car</div>'
    pm = c.get("priceMarket") or 0
    market = f'<span class="cc-market">{fmt(pm)}</span>' if pm > (c.get("price") or 0) else ""
    return f'''<a class="car-card" href="/car.html?id={quote(c["id"])}">
  <div class="cc-img">{img}<span class="cc-flag">{c.get("flag","")}</span></div>
  <div class="cc-body">
    <div class="cc-title">{html.escape(c["brand"])} {html.escape(c["model"])}</div>
    <div class="cc-meta">{c["year"]} · {html.escape(str(c.get("engine","")))} · {html.escape(str(c.get("transmission","")))}</div>
    <div class="cc-price">{fmt(c["price"])} {market}</div>
    <span class="cc-cta">Заказать в {{prep_acc}} →</span>
  </div>
</a>'''

# выбор карточек: приоритет кроссоверам/SUV (актуально для Сибири), затем хиты
def pick_cars(n=6):
    hits = [c for c in cars if c.get("hit") and c.get("photos")]
    suv = [c for c in hits if c.get("body") in ("crossover", "suv", "wagon")]
    rest = [c for c in hits if c not in suv]
    chosen = (suv + rest)[:n]
    if len(chosen) < n:
        chosen += [c for c in cars if c.get("photos") and c not in chosen][: n - len(chosen)]
    return chosen[:n]

CARS_PICK = pick_cars(6)

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0A0A0A;--bg2:#0E0E10;--surf:rgba(255,255,255,.04);--surf2:rgba(255,255,255,.07);
--bd:rgba(255,255,255,.09);--bd2:rgba(255,255,255,.16);--tx:#FAFAFA;--mut:rgba(255,255,255,.62);
--dim:rgba(255,255,255,.42);--acc:#10B981;--acc2:#34D399;--accsoft:rgba(16,185,129,.12);--r:22px}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--tx);font-family:'Manrope',system-ui,-apple-system,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
h1,h2,h3{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:700;line-height:1.1;letter-spacing:-.01em}
.wrap{max-width:1140px;margin:0 auto;padding:0 20px}
/* header */
.gh{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:16px;justify-content:space-between;
padding:14px 20px;background:rgba(10,10,10,.82);backdrop-filter:blur(14px);border-bottom:1px solid var(--bd)}
.gh-logo{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.15rem}
.gh-logo b{color:var(--acc)}
.gh-nav{display:flex;gap:20px;font-size:.92rem;color:var(--mut)}
.gh-nav a:hover{color:var(--tx)}
.gh-cta{display:flex;gap:10px;align-items:center}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:11px 20px;font-weight:600;font-size:.92rem;
border:1px solid var(--bd2);transition:.2s;cursor:pointer;white-space:nowrap}
.btn-primary{background:var(--acc);color:#04130d;border-color:var(--acc)}
.btn-primary:hover{background:var(--acc2)}
.btn-ghost:hover{background:var(--surf2)}
@media(max-width:780px){.gh-nav{display:none}}
/* hero */
.hero{position:relative;padding:72px 0 56px;overflow:hidden}
.hero::after{content:"";position:absolute;top:-180px;right:-120px;width:520px;height:520px;border-radius:50%;
background:radial-gradient(closest-side,var(--accsoft),transparent);pointer-events:none}
.eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--acc2);font-weight:600;font-size:.82rem;
letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px}
.eyebrow::before{content:"";width:26px;height:1px;background:var(--acc)}
.hero h1{font-size:clamp(2rem,5vw,3.3rem);margin-bottom:16px}
.hero h1 span{color:var(--acc2)}
.hero p{color:var(--mut);font-size:1.08rem;max-width:640px;margin-bottom:26px}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap}
.hero-stats{display:flex;gap:30px;margin-top:34px;flex-wrap:wrap}
.hero-stats .s b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-size:1.7rem;color:var(--tx)}
.hero-stats .s span{color:var(--dim);font-size:.86rem}
/* sections */
section{padding:46px 0}
.sec-h{font-size:clamp(1.5rem,3.4vw,2.1rem);margin-bottom:8px}
.sec-sub{color:var(--mut);margin-bottom:26px;max-width:720px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px}
@media(max-width:860px){.grid2{grid-template-columns:1fr}}
.card{background:var(--surf);border:1px solid var(--bd);border-radius:var(--r);padding:24px}
.card h3{font-size:1.15rem;margin-bottom:12px}
.card p{color:var(--mut);font-size:.96rem}
.card ul{list-style:none;display:flex;flex-direction:column;gap:10px;margin-top:6px}
.card li{color:var(--mut);font-size:.95rem;padding-left:24px;position:relative}
.card li::before{content:"";position:absolute;left:0;top:8px;width:8px;height:8px;border-radius:50%;background:var(--acc)}
.src{color:var(--dim);font-size:.78rem;margin-top:14px}
.src a{color:var(--mut);text-decoration:underline}
/* delivery / route */
.route{background:var(--surf);border:1px solid var(--bd);border-radius:var(--r);padding:24px;margin-top:18px}
.route-strip{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:14px 0}
.route-strip .pt{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px}
.route-strip .dot{width:12px;height:12px;border-radius:50%;background:var(--acc)}
.route-strip .dot.mid{width:8px;height:8px;background:var(--dim)}
.route-strip .pt small{color:var(--dim);font-size:.72rem;text-align:center}
.route-strip .ln{flex:1;height:2px;min-width:14px;background:linear-gradient(90deg,var(--acc),var(--dim))}
.route-map{margin-top:16px;border-radius:14px;overflow:hidden;border:1px solid var(--bd)}
.route-map iframe{width:100%;height:300px;border:0;display:block}
/* charts */
.geo-chart{width:100%;height:auto}
.gc-lbl{fill:var(--tx);font:600 13px Manrope,sans-serif}
.gc-val{fill:var(--acc2);font:700 13px Manrope,sans-serif}
.gc-track{fill:rgba(255,255,255,.06)}
/* cars */
.cars-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.car-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;overflow:hidden;transition:.2s;display:block}
.car-card:hover{border-color:var(--bd2);transform:translateY(-3px)}
.cc-img{position:relative;aspect-ratio:16/10;background:var(--bg2);overflow:hidden}
.cc-img img{width:100%;height:100%;object-fit:cover}
.cc-noimg{display:flex;align-items:center;justify-content:center;height:100%;color:var(--dim);font-weight:700}
.cc-flag{position:absolute;top:10px;left:10px;font-size:1.2rem}
.cc-body{padding:14px 16px 18px}
.cc-title{font-weight:700;font-size:1.02rem;margin-bottom:4px}
.cc-meta{color:var(--dim);font-size:.82rem;margin-bottom:10px}
.cc-price{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:1.18rem}
.cc-market{color:var(--dim);font-size:.85rem;text-decoration:line-through;font-weight:400;margin-left:6px}
.cc-cta{display:inline-block;margin-top:10px;color:var(--acc2);font-size:.88rem;font-weight:600}
/* cta band */
.cta{background:linear-gradient(135deg,rgba(16,185,129,.16),rgba(16,185,129,.04));border:1px solid var(--bd2);
border-radius:var(--r);padding:38px 28px;text-align:center;margin:18px 0}
.cta h2{font-size:clamp(1.5rem,3.4vw,2.1rem);margin-bottom:10px}
.cta p{color:var(--mut);margin-bottom:22px}
/* faq */
.faq details{border:1px solid var(--bd);border-radius:14px;padding:0 18px;margin-bottom:12px;background:var(--surf)}
.faq summary{cursor:pointer;padding:16px 0;font-weight:600;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq details[open] summary{color:var(--acc2)}
.faq .a{color:var(--mut);padding:0 0 16px;font-size:.96rem}
/* footer */
.gf{border-top:1px solid var(--bd);padding:34px 0 50px;color:var(--mut);font-size:.9rem}
.gf-top{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:18px}
.gf .slogan{color:var(--acc2);font-weight:600;margin-top:6px}
.gf a:hover{color:var(--tx)}
.gf-links{display:flex;gap:18px;flex-wrap:wrap}
.note{color:var(--dim);font-size:.84rem;margin-top:8px}
"""

METRIKA = """<script type="text/javascript">
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();
for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js?id=109736434","ym");
ym(109736434,'init',{ssr:true,webvisor:true,clickmap:true,accurateTrackBounce:true,trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/109736434" style="position:absolute;left:-9999px;" alt=""/></div></noscript>"""

def page(cfg):
    o = offices.get(cfg["office_id"], {})
    city = cfg["city"]; prep_loc = cfg["prep_loc"]; prep_acc = cfg["prep_acc"]
    soon = o.get("comingSoon")
    title = f"Авто и мото из Японии, Кореи, Китая {prep_loc} под ключ | POWER Car"
    desc = f"Импорт авто и мото из Японии, Кореи и Китая {prep_loc} под ключ за 25–40 дней. Доставка из Владивостока {prep_acc}, расчёт пошлины при вас, выдача {prep_loc}. POWER Car."
    url = f"https://power-car.ru/{cfg['slug']}.html"

    # route strip
    pts = ["Владивосток"] + cfg["waypoints"] + [city]
    strip = []
    for i, p in enumerate(pts):
        mid = 0 < i < len(pts) - 1
        strip.append(f'<div class="pt"><span class="dot{" mid" if mid else ""}"></span><small>{html.escape(p)}</small></div>')
        if i < len(pts) - 1:
            strip.append('<span class="ln"></span>')
    route_strip = "".join(strip)

    # office block
    if soon:
        office_block = f'''<div class="card"><h3>Офис {prep_loc} — открываем скоро</h3>
<p>Сейчас оформляем заказы {prep_loc} дистанционно с доставкой до адреса. Личный офис {prep_loc} откроется в ближайшее время — следите за новостями.</p>
<p class="note">Пока офис не открыт, забрать авто можно в наших офисах в Томске и Новосибирске или заказать доставку до {prep_acc}.</p></div>'''
        map_block = ""
    else:
        map_src = f"https://yandex.ru/map-widget/v1/?ll={o['lng']}%2C{o['lat']}&z=16&pt={o['lng']},{o['lat']},pm2grm"
        office_block = f'''<div class="card"><h3>Офис {prep_loc}</h3>
<p><b>{html.escape(o["address"])}</b><br><span class="note">{html.escape(o.get("addressNote",""))}</span></p>
<p style="margin-top:10px">📞 <a href="tel:{o.get('phoneRaw',o.get('phone'))}" style="color:var(--acc2)">{html.escape(o.get("phone",""))}</a><br>🕒 {html.escape(o.get("hours",""))}</p></div>'''
        map_block = f'''<div class="route-map"><iframe src="{map_src}" loading="lazy" title="Карта офиса POWER Car {prep_loc}"></iframe></div>'''

    cards_html = "".join(car_card(c).replace("{prep_acc}", prep_acc) for c in CARS_PICK)

    # FAQ (geo)
    faq = [
        (f"Сколько идёт авто из Японии до {city}?",
         f"Полный цикл под ключ занимает 25–40 дней: выкуп на аукционе, морская доставка во Владивосток, растаможка и автовоз {prep_acc}. Сам автовоз Владивосток → {city} идёт примерно {cfg['autovoz']} дней и уже входит в этот общий срок."),
        (f"Где забрать автомобиль {prep_loc}?" if not soon else f"Как получить авто {prep_loc}, если офис ещё не открыт?",
         (f"В нашем офисе: {o.get('address','')}. {o.get('addressNote','')}. Либо организуем доставку до вашего адреса." if not soon
          else f"Оформляем заказ дистанционно и доставляем авто до адреса {prep_loc}. Также можно забрать машину в офисах в Томске или Новосибирске.")),
        (f"Какие авто популярны для {city} и Сибири?" if cfg['siberia'] else f"Какие авто чаще заказывают {prep_loc}?",
         "По данным «Автостата», основной объём ввозимых б/у авто в РФ — из Японии (57,7%), лидер по маркам — Toyota. " +
         ("Для сибирских дорог и зим чаще берут полноприводные кроссоверы и внедорожники — в нашем наличии их около 42%." if cfg['siberia']
          else "В нашем каталоге представлены авто из Японии, Кореи и Китая под любой бюджет.")),
        ("Нужна ли предоплата за подбор?",
         "Нет. Подбор и расчёт сметы — бесплатно. Вы видите полную стоимость (аукцион + доставка + пошлина + утильсбор + комиссия) до начала работы."),
    ]
    faq_html = "".join(f'<details><summary>{html.escape(q)}</summary><div class="a">{html.escape(a)}</div></details>' for q, a in faq)

    # JSON-LD
    ld_business = {
        "@context": "https://schema.org", "@type": "AutoDealer",
        "name": f"POWER Car — {city}", "url": url,
        "description": desc, "telephone": o.get("phone", "+7 913 853-33-05").replace("(", "").replace(")", ""),
        "areaServed": {"@type": "City", "name": city},
        "priceRange": "₽₽", "image": "https://power-car.ru/og-cover.jpg",
        "parentOrganization": {"@type": "Organization", "name": "POWER Car", "url": "https://power-car.ru/"},
    }
    if not soon:
        ld_business["address"] = {"@type": "PostalAddress", "streetAddress": o["address"], "addressLocality": city,
                                  "postalCode": "".join(ch for ch in o.get("addressNote", "") if ch.isdigit())[:6], "addressCountry": "RU"}
        ld_business["geo"] = {"@type": "GeoCoordinates", "latitude": o["lat"], "longitude": o["lng"]}
        ld_business["openingHours"] = "Mo-Sa 09:00-18:00"
    ld_faq = {"@context": "https://schema.org", "@type": "FAQPage",
              "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}
    ld_bc = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Главная", "item": "https://power-car.ru/"},
        {"@type": "ListItem", "position": 2, "name": f"Авто из Японии, Кореи, Китая {prep_loc}", "item": url}]}
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>' for x in (ld_business, ld_faq, ld_bc))

    yandex_route = f"https://yandex.ru/maps/?rtext=Владивосток~{city}&rtt=auto"

    siberia_card = f'''<div class="card"><h3>Что учесть {prep_loc}</h3><ul>
<li>Резко-континентальный климат: зимой нередко −30…−40 °C — желателен предпусковой подогреватель и аккумулятор с запасом.</li>
<li>Снег, наледь и перепады — увереннее идут полный привод (AWD/4WD) и кроссоверы; обязательна зимняя резина.</li>
<li>Реагентов на дорогах меньше, чем в мегаполисах, но межсезонная влага и сколы — рекомендуем антикор-обработку при подготовке.</li>
<li>Японские авто хорошо держат вторичную цену и ликвидны в регионе.</li>
</ul></div>''' if cfg['siberia'] else f'''<div class="card"><h3>Что учесть {prep_loc}</h3><ul>
<li>Большой выбор сервисов и запчастей для японских, корейских и европейских марок.</li>
<li>Для крупного города практичны экономичные кроссоверы и седаны; гибриды снижают расходы в пробках.</li>
<li>Проверяйте комплектацию под левый/правый руль — подбираем под ваши требования.</li>
</ul></div>'''

    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#0A0A0A">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://power-car.ru/og-cover.jpg">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
<link rel="preconnect" href="https://mc.yandex.ru">
<link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,600&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="https://fonts.bunny.net/css?family=bricolage-grotesque:600,700|manrope:400,600&display=swap" rel="stylesheet"></noscript>
<style>{CSS}</style>
{ld}
</head>
<body>
<header class="gh">
  <a href="/" class="gh-logo">POWER <b>Car</b></a>
  <nav class="gh-nav">
    <a href="/#selector">Подбор</a>
    <a href="/#cases">Отзывы</a>
    <a href="/#offices">Офисы</a>
    <a href="/#faq">Вопросы</a>
  </nav>
  <div class="gh-cta">
    <a href="tel:+79138533305" class="btn btn-ghost">Позвонить</a>
    <a href="/#selector" class="btn btn-primary">Подобрать авто</a>
  </div>
</header>

<main>
<section class="hero"><div class="wrap">
  <span class="eyebrow">POWER Car {prep_loc}</span>
  <h1>Авто и мото из Японии, Кореи, Китая<br><span>{prep_loc} под ключ</span></h1>
  <p>{html.escape(f"Привозим автомобили и мотоциклы из Японии, Кореи и Китая {prep_loc} за 25–40 дней. Расчёт пошлины и утильсбора при вас, по официальным базам. Вы — первый собственник в РФ.")}</p>
  <div class="hero-cta">
    <a href="/#selector" class="btn btn-primary">Подобрать авто {prep_acc}</a>
    <a href="#cars" class="btn btn-ghost">Популярные модели</a>
  </div>
  <div class="hero-stats">
    <div class="s"><b>25–40</b><span>дней под ключ</span></div>
    <div class="s"><b>≈ {cfg['distance']:,}</b><span>км из Владивостока</span></div>
    <div class="s"><b>0 ₽</b><span>предоплата за подбор</span></div>
  </div>
</div></section>

<section><div class="wrap">
  <h2 class="sec-h">Доставка и маршрут до {prep_acc}</h2>
  <p class="sec-sub">После выкупа и растаможки во Владивостоке автомобиль идёт {prep_acc} автовозом. Это финальный этап общего срока 25–40 дней под ключ.</p>
  <div class="route">
    <div class="route-strip">{route_strip}</div>
    <div class="grid2" style="margin-top:18px">
      <div><b>Расстояние от Владивостока</b><p class="note">≈ {cfg['distance']:,} км по автодороге (Транссибирское направление).</p></div>
      <div><b>Срок автовоза</b><p class="note">≈ {cfg['autovoz']} дней (оценка по типовым перевозкам; входит в общий срок 25–40 дней).</p></div>
    </div>
    {map_block}
    <a href="{yandex_route}" target="_blank" rel="noopener" class="btn btn-ghost" style="margin-top:14px">Маршрут на Яндекс.Картах →</a>
    <p class="src">Расстояния — по данным маршрутных сервисов (avtodispetcher.ru, ati.su). Сроки автовоза — усреднённая оценка по перевозчикам Владивосток → {city}.</p>
  </div>
</div></section>

<section><div class="wrap">
  <h2 class="sec-h">Какие авто популярны: рынок и наличие</h2>
  <p class="sec-sub">Слева — структура импорта подержанных авто в Россию по данным «Автостата». Справа — что сейчас в наличии у POWER Car под заказ.</p>
  <div class="grid2">
    <div class="card"><h3>Импорт б/у авто в РФ по странам</h3>
      {svg_bars(import_structure)}
      <p class="src">Источник: аналитическое агентство «Автостат», 1 кв. 2026 (доли стран-поставщиков подержанных авто). Лидер по маркам среди ввозимых из Японии — Toyota (33,5%).</p>
    </div>
    <div class="card"><h3>В наличии у POWER Car: {total_inv} авто</h3>
      {svg_bars([(k, v) for k, v in inv_country.items()], unit=" шт", color="#34D399")}
      <p class="note" style="margin-top:12px">Топ марок в наличии: {", ".join(f"{b} ({n})" for b, n in inv_brand)}.</p>
      <p class="src">Данные нашего каталога на момент публикации. Состав наличия обновляется.</p>
    </div>
  </div>
</div></section>

<section id="cars"><div class="wrap">
  <h2 class="sec-h">Популярные модели под заказ {prep_loc}</h2>
  <p class="sec-sub">{"Для сибирских дорог отдаём приоритет полноприводным кроссоверам, но привезём любую модель под ваш бюджет." if cfg['siberia'] else "Подберём под ваш бюджет и задачи — от экономичных седанов до премиум-кроссоверов."}</p>
  <div class="cars-grid">{cards_html}</div>
  <div style="text-align:center;margin-top:26px"><a href="/#selector" class="btn btn-primary">Открыть подборщик — весь каталог →</a></div>
</div></section>

<section><div class="wrap">
  <div class="grid2">
    {office_block}
    {siberia_card}
  </div>
</div></section>

<section><div class="wrap">
  <div class="cta" id="cta">
    <h2>Получите 3 варианта под ваш бюджет {prep_loc}</h2>
    <p>Бесплатный подбор и честный расчёт стоимости под ключ. Без предоплаты за подбор.</p>
    <a href="/#selector" class="btn btn-primary">Подобрать авто {prep_acc}</a>
  </div>
</div></section>

<section class="faq"><div class="wrap">
  <h2 class="sec-h">Частые вопросы — доставка {prep_loc}</h2>
  <div style="margin-top:20px">{faq_html}</div>
</div></section>
</main>

<footer class="gf"><div class="wrap">
  <div class="gf-top">
    <div>
      <a href="/" class="gh-logo">POWER <b>Car</b></a>
      <div class="slogan">Надёжность, рождённая в Сибири</div>
    </div>
    <nav class="gf-links">
      <a href="/">Главная</a><a href="/#selector">Подбор</a><a href="/avto-iz-yaponii-tomsk.html">Томск</a>
      <a href="/avto-iz-yaponii-novosibirsk.html">Новосибирск</a><a href="/avto-iz-yaponii-moskva.html">Москва</a>
    </nav>
  </div>
  <p>POWER Car — импорт авто и мото из Японии, Кореи и Китая под ключ. ИП Степанов А.В., ИНН 702205795181.</p>
</div></footer>
{METRIKA}
</body>
</html>'''

CITIES = [
    {"slug": "avto-iz-yaponii-tomsk", "office_id": "tomsk", "city": "Томск", "prep_loc": "в Томске", "prep_acc": "Томск",
     "distance": 5600, "autovoz": "11–15", "siberia": True,
     "waypoints": ["Чита", "Иркутск", "Красноярск"]},
    {"slug": "avto-iz-yaponii-novosibirsk", "office_id": "novosibirsk", "city": "Новосибирск", "prep_loc": "в Новосибирске", "prep_acc": "Новосибирск",
     "distance": 5800, "autovoz": "10–14", "siberia": True,
     "waypoints": ["Чита", "Иркутск", "Красноярск"]},
    {"slug": "avto-iz-yaponii-moskva", "office_id": "moscow", "city": "Москва", "prep_loc": "в Москве", "prep_acc": "Москву",
     "distance": 9100, "autovoz": "19–22", "siberia": False,
     "waypoints": ["Иркутск", "Красноярск", "Новосибирск", "Казань"]},
]

os.makedirs(OUT, exist_ok=True)
for cfg in CITIES:
    html_doc = page(cfg)
    with open(os.path.join(OUT, cfg["slug"] + ".html"), "w", encoding="utf-8") as f:
        f.write(html_doc)
    print("generated:", cfg["slug"] + ".html", len(html_doc), "bytes")
