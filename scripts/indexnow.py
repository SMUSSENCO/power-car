#!/usr/bin/env python3
"""Сообщает поисковым системам (Bing, Яндекс и другим, поддерживающим IndexNow) об обновлённых страницах.

Запуск:
    python3 scripts/indexnow.py            # отправить все адреса из sitemap.xml
    python3 scripts/indexnow.py URL [URL…] # отправить конкретные адреса

Ключ лежит в корне сайта: https://power-car.ru/5080cd202c153a4fc4a8e64de83cccb2.txt (файл должен быть опубликован до отправки).
Отправляйте только то, что реально изменилось: массовые повторные отправки одних и тех же адресов поисковики не любят.
"""
import json, re, subprocess, sys

HOST = "power-car.ru"
KEY = "5080cd202c153a4fc4a8e64de83cccb2"
ENDPOINT = "https://api.indexnow.org/IndexNow"

def sitemap_urls():
    s = open("sitemap.xml", encoding="utf-8").read()
    return re.findall(r"<loc>([^<]+)</loc>", s)

def main():
    urls = sys.argv[1:] or sitemap_urls()
    urls = [u for u in urls if u.startswith("https://" + HOST + "/") or u == "https://" + HOST + "/"]
    payload = {"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls[:10000]}
    r = subprocess.run(["curl", "-s", "-m", "30", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", ENDPOINT,
                        "-H", "Content-Type: application/json; charset=utf-8", "-d", json.dumps(payload)],
                       capture_output=True, text=True)
    code = r.stdout.strip()
    meaning = {"200": "принято", "202": "принято, ключ будет проверен позже", "400": "неверный запрос", "403": "ключ не найден на сайте (опубликуйте файл ключа)",
                "422": "адреса не относятся к сайту/ключу", "429": "слишком много запросов"}.get(code, "неожиданный ответ")
    print(f"IndexNow: HTTP {code} — {meaning}; отправлено адресов: {len(payload['urlList'])}")

if __name__ == "__main__":
    main()
