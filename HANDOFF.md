# HANDOFF — POWER Car (chat context ran out)

Открой новый чат в директории `/Users/urijsmusenko/Documents/GitHub/power-car` и вставь этот файл целиком первым сообщением.

---

## 🎯 Что за проект

**power-car.ru** — статический сайт компании POWER Car (импорт авто/мото из Японии, Кореи, Китая в РФ).
3 офиса: Томск (Кирова 58), Новосибирск (К. Маркса 57), Москва.
Стек: чистый HTML + JSON + Python-скрипты для генерации + GitHub Pages деплой.

**Директория:** `/Users/urijsmusenko/Documents/GitHub/power-car`

**Ключевые файлы:**
- `index.html` — главная (huge single file)
- `scripts/build.py` — генератор всего: `articles/<slug>.html`, `auto/<slug>.html`, `sitemap.xml`
- `scripts/gen_geo.py` — генератор 3 городских лендингов
- `scripts/gen_countries.py` — генератор 4 страновых лендингов
- `data/cars.json`, `data/cases.json`, `data/articles.json`, `data/offices.json` — источники правды

---

## 📌 Текущая задача (в середине выполнения)

**SEO-миграция URL городских лендингов:**
`avto-iz-yaponii-{tomsk,novosibirsk,moskva}.html` → `import-avto-{tomsk,novosibirsk,moskva}.html`

**Зачем:** URL говорил «из Японии», но контент — про Японию/Корею/Китай (для Москвы — вообще BMW китайской сборки). Рассинхрон URL↔контент, Яндекс пометил Москву как «малоценную». Универсальный URL `import-avto-*` матчит реальный контент.

---

## ✅ Что уже сделано в этой сессии

Правки в исходниках (проверь через `git diff`):

1. **`scripts/gen_geo.py`** — обновлено:
   - строки 254-256: footer-ссылки на 3 города → `/import-avto-*.html`
   - строка 665: `"slug": "import-avto-tomsk"`
   - строка 700: `"slug": "import-avto-novosibirsk"`
   - строка 735: `"slug": "import-avto-moskva"`

2. **`scripts/gen_countries.py`** — обновлено:
   - строки 247-249: footer-ссылки → `/import-avto-*.html`

3. **`scripts/build.py`** — обновлено:
   - строка 259: footer в car_page → `/import-avto-*.html`
   - строка 297: sitemap URL список → `["import-avto-tomsk","import-avto-novosibirsk","import-avto-moskva"]`

---

## ❌ Что осталось доделать

### 1. Обновить `car.html` (шаблон, ЕЩЁ НЕ ТРОНУТ — Read → Edit нужно)

**Файл:** `/Users/urijsmusenko/Documents/GitHub/power-car/car.html`, строка 70

**Замена:**
```
old: <a href="/avto-iz-yaponii-tomsk.html">Томск</a><a href="/avto-iz-yaponii-novosibirsk.html">Новосибирск</a><a href="/avto-iz-yaponii-moskva.html">Москва</a></div>
new: <a href="/import-avto-tomsk.html">Томск</a><a href="/import-avto-novosibirsk.html">Новосибирск</a><a href="/import-avto-moskva.html">Москва</a></div>
```

### 2. Регенерировать HTML-файлы

```bash
cd /Users/urijsmusenko/Documents/GitHub/power-car
python3 scripts/gen_geo.py       # создаст import-avto-*.html (3 файла)
python3 scripts/gen_countries.py  # обновит 4 страновых лендинга с новым футером
python3 scripts/build.py          # обновит все auto/*.html + sitemap.xml
```

### 3. Создать 3 файла-редиректа для СТАРЫХ URL

Старые файлы `avto-iz-yaponii-{tomsk,novosibirsk,moskva}.html` **надо перезаписать** редирект-заглушками (GitHub Pages не умеет server-side 301 — используем HTML meta refresh + `<link rel="canonical">` на новый URL — Google/Яндекс это понимают как 301).

**Шаблон каждого файла** (заменить `CITY` на нужный слаг):
```html
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Переезд страницы — POWER Car</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://power-car.ru/import-avto-CITY.html">
<meta http-equiv="refresh" content="0; url=/import-avto-CITY.html">
<script>location.replace("/import-avto-CITY.html");</script>
</head>
<body>
<p>Страница переехала: <a href="/import-avto-CITY.html">/import-avto-CITY.html</a></p>
</body>
</html>
```

Три файла с редиректами:
- `avto-iz-yaponii-tomsk.html` → `/import-avto-tomsk.html`
- `avto-iz-yaponii-novosibirsk.html` → `/import-avto-novosibirsk.html`
- `avto-iz-yaponii-moskva.html` → `/import-avto-moskva.html`

### 4. Smoke-check и коммит

```bash
grep -c "import-avto-tomsk" sitemap.xml   # ожидаем 1
grep -c "avto-iz-yaponii-tomsk" sitemap.xml # ожидаем 0
ls import-avto-*.html                       # ожидаем 3 файла
git add -A && git commit -m "seo: rename city landings to universal URL (avto-iz-yaponii-* → import-avto-*)"
git push
```

### 5. После деплоя

- В Яндекс.Вебмастере отправить 6 URL на переобход:
  - 3 новых `import-avto-*`
  - 3 старых `avto-iz-yaponii-*` (чтобы Яндекс увидел redirect)

---

## 📎 Контекст, который важно помнить

### Копия городских лендингов (утверждена пользователем — НЕ МЕНЯТЬ):
- **Томск:** «База выгодных авто от 570к ₽ и мото от 250к ₽» + офис Кирова 58
- **НСК:** «База лотов авто и мото из Азии» + автовоз от 25 000 ₽ (**НЕ упоминать** «скидка 50 000», «актуальных»)
- **Москва:** «BMW, Mercedes, Audi из Азии — от 1,8 млн ₽» (китайская сборка; **НЕ упоминать** электрокары/Zeekr/Lixiang)

### Стилевые правила (глобальные, из auto-memory)
- Тёмная тема, `--accent: #10B981`, glass-morphism, Bricolage Grotesque + Manrope
- При удалении/переименовании секций — grep-ай ВСЕ ссылки, обновляй `sitemap.xml lastmod`
- Перед задачей типа «удалить X» — прогоняй по всему репо

### Не делать
- НЕ рушь копию 3 городских лендингов
- НЕ трогай `index.html` без причины (там нет старых слагов)
- НЕ забудь про `car.html` шаблон — он не автогенерится

---

## 🔮 Что было в SEO-плане после этой задачи

Дальнейшие пункты, если пользователь спросит «а что дальше»:
- **#3:** внутренняя перелинковка статьи ↔ каталог (блок «Полезные статьи» на страницах авто)
- **#4:** брендовые хабы (`/brand/honda.html`, `/brand/bmw.html` и т.д.)
- **#6:** Product schema с `offers.priceValidUntil` на страницах авто

---

## ⚡ Первая команда, которую выполнит новый Claude

```bash
cd /Users/urijsmusenko/Documents/GitHub/power-car && git status && grep -c "avto-iz-yaponii-tomsk" car.html scripts/gen_geo.py scripts/gen_countries.py scripts/build.py
```

Должно показать что car.html = 1 (не тронут), остальные = 0 (уже обновлены).
