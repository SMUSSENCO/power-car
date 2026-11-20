#!/usr/bin/env python3
"""Включает запланированные статьи в data/articles.json.

Статья включается, если у неё published=false, autoPublish=true и publishedAt не позже сегодняшней даты по Москве.
Запускается из .github/workflows/build-pages.yml (ежедневно в 08:00 МСК и при каждом пуше), после этого workflow собирает страницы.
Если пропущено несколько дней, включатся все просроченные сразу. Сообщает в GITHUB_OUTPUT: changed=true/false и urls.
"""
import json, os
from datetime import datetime, timedelta, timezone

PATH = "data/articles.json"
BASE = "https://power-car.ru/articles/"

today = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
articles = json.load(open(PATH, encoding="utf-8"))
done = []
for a in articles:
    if a.get("autoPublish") and a.get("published") is False and a.get("publishedAt", "9999-12-31") <= today:
        a["published"] = True
        a.pop("autoPublish")
        done.append(a["slug"])

if done:
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Опубликовано:", ", ".join(done))
else:
    print(f"На {today} запланированных статей нет.")

out = os.environ.get("GITHUB_OUTPUT")
if out:
    with open(out, "a", encoding="utf-8") as f:
        f.write(f"changed={'true' if done else 'false'}\n")
        f.write("urls=" + " ".join(f"{BASE}{s}.html" for s in done) + "\n")
