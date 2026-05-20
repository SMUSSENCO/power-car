# POWER Car — Промт для генерации лендинга

> **Как использовать:** скопируй разделы 1–11 в Cursor (Cmd+K → Generate) или в Claude. Раздел 12 (Деплой) — это инструкция для тебя, не для ИИ.
>
> **Стратегия запросов в Cursor:** не проси всё за раз — ИИ обрежет код. Запрашивай по 2–3 файла за итерацию в порядке, указанном в разделе «Порядок генерации» ниже.

---

## 1. Контекст и цель

Создай одностраничный лендинг для компании **POWER Car** — доставка автомобилей из Китая, Японии и Кореи для физических лиц в РФ.

**Главная цель:** максимальная конверсия в заявку. Путь клиента ≤ 3 кликов: открыл → посчитал → отправил заявку.

**Ключевые блоки:** Header → Hero → Калькулятор + Виджет рекомендаций (модальное окно) → Этапы работы → Оплата → Кейсы → FAQ → Финальный CTA → Footer.

---

## 2. Стек (обязательный, не отклоняться)

- **Next.js 14** (App Router) с **TypeScript** (strict mode)
- **Tailwind CSS** (никаких UI-библиотек: ни MUI, ни AntD, ни shadcn — только Tailwind)
- **Decap CMS** для управления контентом (конфиг в `public/admin/`)
- **next/image** для всех изображений, **next/font** для шрифтов
- **CSS transitions + Intersection Observer** для анимаций (НЕ framer-motion — лишний вес)
- **hCaptcha** на форме заявки
- Output: `standalone` build (для деплоя на Timeweb/Selectel/Yandex Cloud)

В `next.config.js` обязательно:
```js
module.exports = {
  output: 'standalone',
  images: { formats: ['image/avif', 'image/webp'] },
}
```

---

## 3. Структура проекта

```
power-car/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── robots.ts
│   ├── sitemap.ts
│   └── api/
│       └── lead/
│           └── route.ts
├── components/
│   ├── Header.tsx
│   ├── Hero.tsx
│   ├── Calculator.tsx
│   ├── CalculatorModal.tsx
│   ├── RecommendationWidget.tsx
│   ├── Steps.tsx
│   ├── PaymentBlock.tsx
│   ├── Cases.tsx
│   ├── FAQ.tsx
│   ├── FinalCTA.tsx
│   ├── Footer.tsx
│   ├── LeadForm.tsx
│   ├── MobileTelegramFab.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Select.tsx
├── lib/
│   ├── calculator.ts        // формула расчёта
│   ├── cms.ts               // загрузка данных из /content
│   ├── analytics.ts         // обёртка над Я.Метрикой
│   └── rateLimit.ts         // in-memory rate limit для API
├── content/                 // редактируется через Decap CMS
│   ├── settings/
│   │   ├── brand.json       // оффер, цифры, контакты
│   │   └── rates.json       // ставки калькулятора
│   ├── cars/                // папка с авто (по файлу на каждое)
│   ├── cases/               // кейсы клиентов
│   └── faq/                 // вопросы FAQ
├── config/
│   └── brand.ts             // цвета, шрифты, типизация
├── public/
│   ├── admin/
│   │   ├── index.html       // вход в Decap CMS
│   │   └── config.yml       // конфиг Decap (см. раздел 5)
│   └── images/
└── types/
    └── index.ts             // общие типы TS
```

---

## 4. Брендинг (`config/brand.ts`)

```ts
export const BRAND = {
  name: 'POWER Car',
  tagline: 'Авто из Китая, Японии и Кореи под ключ',

  colors: {
    bg: '#0A0A0A',          // основной фон (тёмный)
    bgAlt: '#141414',       // фон секций
    surface: '#1F1F1F',     // карточки
    border: '#2A2A2A',
    text: '#F5F5F5',
    textMuted: '#A1A1AA',
    accent: '#10B981',      // изумрудный (CTA, акценты)
    accentHover: '#059669',
    danger: '#EF4444',
  },

  fonts: {
    body: 'var(--font-inter)',
    heading: 'var(--font-manrope)',
  },
} as const
```

В `app/layout.tsx` подключи через `next/font/google`:
```ts
import { Inter, Manrope } from 'next/font/google'
const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-inter' })
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope' })
```

В `tailwind.config.ts` заведи цвета через `theme.extend.colors` так, чтобы в JSX можно было писать `bg-bg`, `text-accent`, `border-border` и т.п.

---

## 5. Decap CMS — полная конфигурация

### `public/admin/index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>POWER Car — Admin</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
  </body>
</html>
```

### `public/admin/config.yml`

```yaml
backend:
  name: github
  repo: USERNAME/power-car           # TODO: заменить на реальный репо
  branch: main
  base_url: https://oauth-proxy.example.workers.dev   # TODO: см. раздел деплоя
  auth_endpoint: auth

media_folder: "public/images/uploads"
public_folder: "/images/uploads"

locale: 'ru'

collections:
  - name: "settings"
    label: "⚙️ Настройки сайта"
    files:
      - name: "brand"
        label: "Главная и контакты"
        file: "content/settings/brand.json"
        fields:
          - { label: "Заголовок Hero", name: "heroTitle", widget: "string" }
          - { label: "Подзаголовок Hero", name: "heroSubtitle", widget: "text" }
          - { label: "Цифра 1 — значение", name: "stat1Value", widget: "string", hint: "Например: 500+" }
          - { label: "Цифра 1 — подпись", name: "stat1Label", widget: "string", hint: "Например: автомобилей доставлено" }
          - { label: "Цифра 2 — значение", name: "stat2Value", widget: "string" }
          - { label: "Цифра 2 — подпись", name: "stat2Label", widget: "string" }
          - { label: "Цифра 3 — значение", name: "stat3Value", widget: "string" }
          - { label: "Цифра 3 — подпись", name: "stat3Label", widget: "string" }
          - { label: "Телефон", name: "phone", widget: "string" }
          - { label: "Telegram (ник менеджера)", name: "telegram", widget: "string", hint: "Без @" }
          - { label: "Email", name: "email", widget: "string" }
          - { label: "Юр. название", name: "legalName", widget: "string" }
          - { label: "ИНН", name: "inn", widget: "string" }

      - name: "rates"
        label: "Ставки калькулятора"
        file: "content/settings/rates.json"
        fields:
          - { label: "Фиксированная комиссия (₽)", name: "fixedCommission", widget: "number", default: 120000 }
          - { label: "СБКТС (₽)", name: "sbkts", widget: "number" }
          - label: "Утильсбор (физлица, личное пользование)"
            name: "recyclingFee"
            widget: "list"
            summary: "{{fields.ageGroup}} / {{fields.engineMin}}–{{fields.engineMax}} см³ → {{fields.amount}} ₽"
            fields:
              - { label: "Возраст", name: "ageGroup", widget: "select", options: ["до 3 лет", "3–7 лет", "более 7 лет", "электро"] }
              - { label: "Объём двигателя от (см³)", name: "engineMin", widget: "number" }
              - { label: "Объём двигателя до (см³)", name: "engineMax", widget: "number" }
              - { label: "Сумма (₽)", name: "amount", widget: "number" }
          - label: "Таможенная пошлина"
            name: "customsDuty"
            widget: "list"
            summary: "{{fields.priceMin}}–{{fields.priceMax}} EUR → {{fields.percent}}% (мин {{fields.minPerCC}} EUR/см³)"
            fields:
              - { label: "Стоимость авто от (EUR)", name: "priceMin", widget: "number" }
              - { label: "Стоимость авто до (EUR)", name: "priceMax", widget: "number" }
              - { label: "Процент от стоимости", name: "percent", widget: "number" }
              - { label: "Минимум за см³ (EUR)", name: "minPerCC", widget: "number" }
          - label: "Доставка по странам"
            name: "delivery"
            widget: "list"
            summary: "{{fields.country}} → {{fields.city}}: {{fields.amount}} ₽"
            fields:
              - { label: "Страна", name: "country", widget: "select", options: ["Китай", "Япония", "Корея"] }
              - { label: "Город РФ", name: "city", widget: "string" }
              - { label: "Сумма (₽)", name: "amount", widget: "number" }

  - name: "cars"
    label: "🚗 Автомобили (виджет)"
    folder: "content/cars"
    create: true
    slug: "{{slug}}"
    extension: "json"
    format: "json"
    summary: "{{brand}} {{model}} {{year}} — {{price}} ₽"
    fields:
      - { label: "Бренд", name: "brand", widget: "string" }
      - { label: "Модель", name: "model", widget: "string" }
      - { label: "Год", name: "year", widget: "number" }
      - { label: "Страна", name: "country", widget: "select", options: ["Китай", "Япония", "Корея"] }
      - { label: "Цена под ключ (₽)", name: "price", widget: "number" }
      - { label: "Фото", name: "image", widget: "image" }
      - { label: "Статус", name: "status", widget: "select", options: ["В наличии", "Под заказ"] }
      - { label: "Приоритет", name: "priority", widget: "number", default: 50, hint: "Чем больше — тем выше в выдаче" }
      - { label: "Опубликовано", name: "published", widget: "boolean", default: true }

  - name: "cases"
    label: "📸 Кейсы клиентов"
    folder: "content/cases"
    create: true
    slug: "{{slug}}"
    extension: "json"
    format: "json"
    fields:
      - { label: "Имя клиента", name: "clientName", widget: "string" }
      - { label: "Авто", name: "car", widget: "string" }
      - { label: "История", name: "story", widget: "text" }
      - { label: "Фото", name: "photo", widget: "image" }
      - { label: "Срок доставки (дни)", name: "deliveryDays", widget: "number" }
      - { label: "Опубликовано", name: "published", widget: "boolean", default: true }

  - name: "faq"
    label: "❓ FAQ"
    folder: "content/faq"
    create: true
    slug: "{{slug}}"
    extension: "json"
    format: "json"
    fields:
      - { label: "Вопрос", name: "q", widget: "string" }
      - { label: "Ответ", name: "a", widget: "text" }
      - { label: "Порядок", name: "order", widget: "number", default: 0 }
```

---

## 6. Общие технические требования

1. **Mobile-first**, адаптив от 320px. CTA-кнопки минимум 44×44 px (touch target).
2. **TypeScript strict.** Все типы экспортируются из `types/index.ts`. Никаких `any`.
3. **Загрузка контента из CMS:** в `lib/cms.ts` — функции `getBrand()`, `getRates()`, `getCars()`, `getCases()`, `getFAQ()`, читающие из `content/`. Используй `fs.promises` + `path` (server-only). На клиент данные передаются через props из server components.
4. **Кэширование:** все CMS-функции `cache()` из `react`. Ревалидация — через `revalidate = 60` в страницах.
5. **Accessibility:** все `<button>`, `<input>`, `<select>` с `aria-label` или связанным `<label htmlFor>`. Модалка калькулятора с `role="dialog"`, `aria-modal="true"`, focus trap, закрытие по Esc.
6. **Аналитика:** в `lib/analytics.ts` обёртка `track(event, payload)` для Яндекс.Метрики. События: `calculator_open`, `calculator_calculate`, `recommendation_click`, `lead_submit`, `phone_click`, `telegram_click`. ID счётчика — из `process.env.NEXT_PUBLIC_YM_ID`.
7. **SEO:**
   - `generateMetadata` в `app/page.tsx` — title, description, OpenGraph, twitter card.
   - JSON-LD в `app/layout.tsx`: `LocalBusiness` + `FAQPage` (генерируется из CMS).
   - `app/robots.ts` и `app/sitemap.ts` — статические.
8. **Производительность:**
   - Lazy-load: `RecommendationWidget`, `Cases`, `FAQ`, `FinalCTA` через `dynamic()` с `ssr: true`.
   - Картинки только через `next/image` с `sizes` и `priority` только на Hero.
   - Шрифты через `next/font` с `display: 'swap'`.
9. **Безопасность:**
   - hCaptcha v3 на форме заявки (site-key в `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, secret в `HCAPTCHA_SECRET`).
   - Rate limit на `/api/lead` — 5 заявок с одного IP в 10 минут (in-memory `Map` на старте, потом Redis).
   - Honeypot-поле `website` в форме (если заполнено — отбрасываем).
   - Валидация телефона: `/^(\+7|7|8)?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$/`.

---

## 7. Компоненты — спецификации

### 7.1 `Header.tsx`

- Sticky, прозрачный фон с `backdrop-blur` при скролле.
- Логотип «POWER Car» (текстовый, шрифт Manrope 700, акцентом цвет `accent` на «POWER»).
- Десктоп: меню (Калькулятор, Этапы, Кейсы, FAQ) + телефон + кнопка «Написать в Telegram».
- Мобайл: бургер, в выдвижной панели — то же меню. Закрытие по клику вне.

### 7.2 `Hero.tsx`

- Полная высота экрана (`min-h-[100svh]`) на мобиле, ≥ 720px на десктопе.
- Заголовок (`heroTitle` из CMS), подзаголовок (`heroSubtitle`).
- 3 цифры в ряд (или 1×3 на мобиле): значение + подпись из `stat1/2/3` CMS.
- Главная CTA-кнопка «Рассчитать стоимость» — открывает `CalculatorModal`.
- Вторичная кнопка «Посмотреть авто» — скролл к виджету (или открывает модалку с виджетом).
- Фоновое изображение или градиент `from-bg via-bg to-bg-alt`.

### 7.3 `Calculator.tsx` + `CalculatorModal.tsx`

**Поля формы:**
- `country`: select (Китай / Япония / Корея)
- `brand`: текстовое поле (autocomplete необязателен)
- `model`: текстовое поле
- `year`: число (1990–текущий год), валидация
- `engineCC`: число (объём двигателя в см³)
- `priceEUR`: число (стоимость авто за рубежом, в EUR)
- `city`: select (города из `rates.delivery`)

**Расчёт** — в `lib/calculator.ts`:

```ts
export interface CalculatorInput { /* поля выше */ }
export interface CalculatorBreakdown {
  carPrice: number          // priceEUR × курс EUR/RUB
  delivery: number          // из rates.delivery по country+city
  customsDuty: number       // TODO: формула по rates.customsDuty
  recyclingFee: number      // TODO: по rates.recyclingFee (возраст × объём)
  sbkts: number             // rates.sbkts
  commission: number        // rates.fixedCommission
  total: number             // сумма всего
}
export function calculate(input: CalculatorInput, rates: Rates, eurRate: number): CalculatorBreakdown {
  // TODO: реализовать после уточнения формулы у владельца
  // Сейчас — заглушка с базовой суммой и комментариями для каждой статьи
}
```

> **ВАЖНО:** оставить TODO в формуле. Владелец проекта подставит точные ставки сам. Не выдумывать цифры.

**Курс EUR/RUB:** запрос на `https://www.cbr-xml-daily.ru/daily_json.js` (server-side, кэш 1 час). Фолбэк — фиксированное значение 100 при ошибке.

**Результат:** разбивка по статьям + ИТОГО «под ключ». Под результатом две кнопки:
- «Получить подборку в Telegram» → отображает `LeadForm` в правой части модалки (на десктопе) или ниже (на мобиле).
- «Закрыть» → закрытие модалки.

При нажатии «Рассчитать» — параллельно с показом результата вызывается `RecommendationWidget` (см. 7.4).

### 7.4 `RecommendationWidget.tsx`

- Появляется в правой части модалки **после** успешного расчёта.
- На мобиле — под результатом, не справа.
- Берёт массив авто из `getCars()`, фильтрует:
  - `published === true`
  - `price >= budget × 0.85 && price <= budget × 1.15` (где `budget` = total из калькулятора)
- **Сортировка:** по `priority` DESC, потом по `price` ASC. **НЕ рандом.**
- Берёт первые 5.
- **Empty state:** если ни одно авто не подошло — показывает блок «В вашем бюджете готовых вариантов нет — оставьте заявку, подберём индивидуально» с кнопкой «Оставить заявку».
- Карточка авто: фото (next/image), бренд + модель + год, цена, бейдж статуса, кнопка «Подробнее».
- Клик «Подробнее» → скролл к `LeadForm` + предзаполнение скрытого поля `interestedCarId` ID этого авто.

### 7.5 `Steps.tsx`

5–6 шагов работы (например: «Заявка → Подбор → Договор → Покупка → Доставка → Передача»). Иконки (lucide-react допустим **только** для иконок, ничего больше). На мобиле — вертикально, на десктопе — горизонтально.

### 7.6 `PaymentBlock.tsx`

Описание схемы оплаты: предоплата фикс. комиссии при заключении договора, остальное по факту (тексты — заглушка с TODO в комментариях, владелец заменит).

### 7.7 `Cases.tsx`

Слайдер кейсов из `getCases()`. Использовать `<div>` с `scroll-snap` (CSS), без сторонних слайдер-библиотек. Карточка: фото клиента + авто, имя, история (text), срок доставки.

### 7.8 `FAQ.tsx`

Аккордеон. Использовать `<details>`/`<summary>` (нативные, доступные). Стилизовать через `[&_summary]` селекторы Tailwind. Данные из `getFAQ()`, отсортированные по `order`.

### 7.9 `FinalCTA.tsx`

Полноширинный блок с заголовком «Готовы заказать авто?» + `LeadForm`.

### 7.10 `Footer.tsx`

Юр. название, ИНН, контакты, ссылка на `/privacy` (политика конфиденциальности — отдельная статичная страница, шаблон 152-ФЗ — TODO для владельца).

### 7.11 `LeadForm.tsx`

Поля: `name`, `phone`, `telegram` (опционально), `budget` (число), `comment` (textarea). Скрытые: `source` (`'calculator'` / `'final_cta'` / `'widget'`), `interestedCarId?`.

- Чекбокс «Согласен с обработкой персональных данных» (152-ФЗ), ссылка на `/privacy`.
- hCaptcha widget.
- Honeypot: скрытое поле `website` с `tabindex="-1"` и `aria-hidden`.
- Состояния: idle / loading / success / error.
- При success — заменяется на блок «Спасибо! Менеджер напишет в течение 10 минут».

### 7.12 `MobileTelegramFab.tsx`

Фиксированная кнопка внизу экрана **только на мобайле** (`md:hidden`). «📱 Написать в Telegram» → ведёт на `https://t.me/{telegram}` из CMS. Не перекрывает контент: padding-bottom у `<main>` равен высоте FAB.

---

## 8. API `/api/lead/route.ts`

```ts
export async function POST(req: Request) {
  // 1. Rate limit (5 запросов / 10 мин с IP)
  // 2. Парсинг body
  // 3. Honeypot: если website заполнен — return 200 (тихо игнорируем)
  // 4. Валидация: name (2-50), phone (regex), telegram (опц.), budget (>0), consent === true
  // 5. Проверка hCaptcha: POST на https://api.hcaptcha.com/siteverify
  // 6. Telegram: fetch https://api.telegram.org/bot{TOKEN}/sendMessage
  //    chat_id из TG_CHAT_ID, parse_mode: 'HTML'
  //    Текст: <b>Новая заявка</b>\nИмя: ...\nТелефон: ...\nБюджет: ...\nИсточник: ...\nАвто: ...
  // 7. Google Sheets: POST на GOOGLE_SHEETS_WEBHOOK_URL (Apps Script)
  //    Payload: { timestamp, name, phone, telegram, budget, source, carId }
  //    Если упало — НЕ блокирует ответ, только логируем.
  // 8. Возврат: { ok: true, message: 'Заявка принята...' }
  // 9. На любую ошибку — { ok: false, error: 'human-readable' } со статусом 400/500
}
```

**Rate limit (`lib/rateLimit.ts`):** простая `Map<ip, { count, resetAt }>`. Очистка lazy при каждом запросе.

**ENV переменные** (создай `.env.example`):
```
TG_BOT_TOKEN=
TG_CHAT_ID=
HCAPTCHA_SECRET=
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=
GOOGLE_SHEETS_WEBHOOK_URL=
NEXT_PUBLIC_YM_ID=
NEXT_PUBLIC_SITE_URL=https://power-car.ru
```

---

## 9. SEO + Аналитика

- `app/layout.tsx`: подключить Я.Метрику через `<Script strategy="afterInteractive">` (только если `NEXT_PUBLIC_YM_ID` задан).
- JSON-LD `LocalBusiness`: name, telephone, address (TODO в CMS — добавить поле, либо хардкод ИП + город).
- JSON-LD `FAQPage`: генерируется из `getFAQ()` в `app/page.tsx`.
- `app/robots.ts`: разрешить всё, указать `sitemap`.
- `app/sitemap.ts`: одна запись `/`.

---

## 10. Порядок генерации (для запросов в Cursor)

Запрашивай файлы пачками в этом порядке:

1. `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.env.example`
2. `types/index.ts`, `config/brand.ts`, `app/globals.css`
3. `lib/cms.ts`, `lib/calculator.ts`, `lib/analytics.ts`, `lib/rateLimit.ts`
4. `app/layout.tsx`, `app/page.tsx`, `app/robots.ts`, `app/sitemap.ts`
5. `components/ui/*` (Button, Input, Select)
6. `components/Header.tsx`, `components/Hero.tsx`, `components/Footer.tsx`, `components/MobileTelegramFab.tsx`
7. `components/Calculator.tsx`, `components/CalculatorModal.tsx`
8. `components/RecommendationWidget.tsx`, `components/LeadForm.tsx`
9. `components/Steps.tsx`, `components/PaymentBlock.tsx`, `components/Cases.tsx`, `components/FAQ.tsx`, `components/FinalCTA.tsx`
10. `app/api/lead/route.ts`
11. `public/admin/index.html`, `public/admin/config.yml`
12. Seed-данные: 2–3 файла в `content/cars/`, 1 в `content/cases/`, 3 в `content/faq/`, заполненные `content/settings/brand.json` и `content/settings/rates.json` с TODO-комментариями

---

## 11. Чек-лист после генерации

- [ ] `npm install` проходит без ошибок
- [ ] `npm run dev` запускает сайт на localhost:3000
- [ ] `npm run build` проходит без TS-ошибок
- [ ] Калькулятор открывается и принимает ввод (даже с TODO-формулой не падает)
- [ ] Виджет рекомендаций показывает empty state при пустом `content/cars/`
- [ ] Форма на сабмит вызывает `/api/lead` (можно с моком в dev)
- [ ] hCaptcha рендерится при заданном `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
- [ ] Мобильный Telegram FAB виден на ≤768px и не перекрывает контент
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95
- [ ] `/admin` открывается (но требует OAuth proxy — см. деплой)

---

## 12. Деплой на Timeweb Cloud (для тебя, не для ИИ)

### 12.1 Подготовка

1. Залей проект на GitHub (приватный репо ок).
2. Зарегистрируйся на Timeweb Cloud → раздел **Apps**.
3. Создай новое приложение → Next.js → подключи GitHub-репо.
4. В env-переменных задай все из `.env.example`.
5. Build command: `npm run build`. Start command: `node .next/standalone/server.js`.

### 12.2 Decap CMS — OAuth proxy (одно из двух)

Decap требует OAuth провайдера, чтобы редакторы логинились через GitHub. На Timeweb его нет. Варианты:

**Вариант A — Cloudflare Workers (рекомендую, 5 минут):**
1. Создай GitHub OAuth App: Settings → Developer settings → OAuth Apps → New
2. Authorization callback URL: `https://oauth-proxy.<твой-аккаунт>.workers.dev/callback`
3. Сохрани Client ID и Client Secret
4. Деплой готового воркера: https://github.com/sterlp/cf-worker-github-oauth (форкни, поменяй ENV в `wrangler.toml`, `wrangler deploy`)
5. В `public/admin/config.yml` замени `base_url` на адрес воркера.

**Вариант B — Sveltia CMS (drop-in замена Decap):**
1. В `public/admin/index.html` замени скрипт на:
   ```html
   <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js" type="module"></script>
   ```
2. Конфиг `config.yml` тот же (Sveltia совместима с Decap).
3. OAuth proxy не нужен — Sveltia использует GitHub Device Flow.

### 12.3 Telegram Bot

1. Через @BotFather создай бота → получи `TG_BOT_TOKEN`.
2. Добавь бота в личный чат / групповой чат менеджера.
3. Узнай chat_id: отправь сообщение боту, потом открой `https://api.telegram.org/bot{TOKEN}/getUpdates`, найди `chat.id`.
4. Подставь в env Timeweb.

### 12.4 Google Sheets

1. Создай таблицу с колонками: timestamp, name, phone, telegram, budget, source, carId.
2. Расширения → Apps Script:
   ```js
   function doPost(e) {
     const sheet = SpreadsheetApp.getActiveSheet()
     const data = JSON.parse(e.postData.contents)
     sheet.appendRow([new Date(), data.name, data.phone, data.telegram, data.budget, data.source, data.carId || ''])
     return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON)
   }
   ```
3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
4. URL → в env `GOOGLE_SHEETS_WEBHOOK_URL`.

### 12.5 hCaptcha

Регистрация на hcaptcha.com → новый сайт → получи site key + secret.

### 12.6 Домен

В Timeweb Cloud Apps → раздел «Домены» → привяжи домен. SSL автоматически (Let's Encrypt).

### 12.7 152-ФЗ

- Хостинг РФ — ✅ (Timeweb).
- Уведомление в Роскомнадзор о начале обработки ПД — обязательно (через Госуслуги, занимает ~неделю).
- Политика конфиденциальности на `/privacy` — обязательна.
- Чекбокс согласия в форме — есть.
- Шаблон политики: https://eipd.ru/policy-template (адаптируй под свои данные).
