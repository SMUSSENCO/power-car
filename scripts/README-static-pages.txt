СТАТИЧЕСКИЕ СТРАНИЦЫ (решение проблемы дублей в Яндексе)

scripts/build.py — генератор. Создаёт по файлу на каждую статью (articles/<slug>.html)
и каждое авто (auto/<slug>.html) с уникальными title/description/canonical/schema,
и пересобирает sitemap.xml. Проданные/снятые позиции — удаляет автоматически.

АВТОМАТ (GitHub Action): .github/workflows/build-pages.yml
При пуше с изменением data/cars.json, data/articles.json, scripts/build.py,
article.html или car.html — Action сам запускает генератор и коммитит готовые
страницы. От тебя — только обычный пуш.

ОДНА РАЗОВАЯ НАСТРОЙКА: в GitHub → Settings → Actions → General →
"Workflow permissions" → выбрать "Read and write permissions" → Save.
Без этого Action не сможет закоммитить страницы.

Вручную (если нужно): из корня репозитория  ->  python3 scripts/build.py
