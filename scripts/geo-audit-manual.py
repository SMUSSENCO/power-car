# Manual GEO/SEO audit (Claude acting as the judge instead of typesafe-ai/jev — Vercel Gateway
# required a credit card and the user opted to skip that). Scores below are Claude's own reading
# of every non-templated page's extracted text (scripts/geo-audit-pages.json); the 106 near-identical
# car-listing pages are scored with one consistent rule since they share one template.
import json, csv

pages = {p["url"]: p for p in json.load(open("scripts/geo-audit-pages.json"))}

# url -> (pageType, directAnswer, concreteFacts, citeLikelihood[0-3], mainFix)
J = {
"https://power-car.ru/": ("other", False, True, 1, "add_direct_answer"),
"https://power-car.ru/quiz.html": ("other", False, False, 0, "add_direct_answer"),
"https://power-car.ru/kalkulyator-rastamozhki.html": ("other", False, True, 2, "add_direct_answer"),
"https://power-car.ru/dostavka-po-rossii.html": ("other", False, False, 0, "add_facts"),
"https://power-car.ru/avto-iz-yaponii.html": ("landing", True, True, 3, "none"),
"https://power-car.ru/avto-iz-korei.html": ("landing", True, True, 3, "none"),
"https://power-car.ru/avto-iz-kitaya.html": ("landing", True, True, 3, "none"),
"https://power-car.ru/moto-iz-yaponii.html": ("landing", True, True, 2, "none"),
"https://power-car.ru/import-avto-tomsk.html": ("landing", True, True, 2, "none"),
"https://power-car.ru/import-avto-novosibirsk.html": ("landing", True, True, 2, "none"),
"https://power-car.ru/import-avto-moskva.html": ("landing", True, True, 2, "none"),
"https://power-car.ru/articles/garantiya-elektromobil-iz-kitaya.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/kredit-trade-in-avto-iz-azii.html": ("article", True, True, 2, "none"),
"https://power-car.ru/articles/osago-garantiya-pravorulnoe-avto.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/top-avto-do-1-5-mln-iz-azii.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/yaponiya-vs-koreya-vs-kitay-sravnenie.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/toplivnyy-krizis-2026.html": ("article", True, True, 2, "none"),
"https://power-car.ru/articles/kupit-keykar-iz-yaponii-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/raschet-utilsbora-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/mhev-myagkhkij-gibryd-raschet-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/vremennaya-propiska-dvfo-2026.html": ("article", True, True, 2, "add_faq_block"),
"https://power-car.ru/articles/swift-oplata-invoice-2026.html": ("article", True, True, 2, "none"),
"https://power-car.ru/articles/vygodny-vozrast-auto-import.html": ("article", True, True, 2, "add_faq_block"),
"https://power-car.ru/articles/moto-import-japan-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/china-export-180-days-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/era-glonass-moratoriy-2026.html": ("article", True, True, 2, "none"),
"https://power-car.ru/articles/eaeu-import-rules-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/autovoz-vladivostok-moscow.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/reading-japanese-auction-sheet.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/korean-car-vin-code-proverka-encar.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/china-hybrid-customs-2026.html": ("article", True, True, 3, "none"),
"https://power-car.ru/articles/riski-importa-avtomobiley-2026.html": ("article", True, True, 2, "none"),
"https://power-car.ru/articles/vozvrat-deneg-import-avto-2026.html": ("article", True, True, 2, "none"),
"https://power-car.ru/docs/privacy.html": ("about", True, True, 1, "none"),
"https://power-car.ru/docs/terms.html": ("about", True, True, 1, "none"),
"https://power-car.ru/docs/agreement.html": ("about", True, True, 2, "none"),
}

rows = []
for url, p in pages.items():
    if url in J:
        pageType, directAnswer, concreteFacts, cite, fix = J[url]
    else:
        # 106 templated car-listing pages: price + spec table stated up front, uniform structure
        pageType, directAnswer, concreteFacts, cite, fix = ("landing", True, True, 2, "none")
    rows.append({
        "url": url, "title": p["title"], "pageType": pageType,
        "directAnswer": directAnswer, "concreteFacts": concreteFacts,
        "citeLikelihood": cite, "mainFix": fix,
    })

header = ["url", "title", "pageType", "directAnswer", "concreteFacts", "citeLikelihood", "mainFix"]
with open("audit.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=header)
    w.writeheader()
    w.writerows(rows)

avg = sum(r["citeLikelihood"] for r in rows) / len(rows)
by_type = {}
for r in rows:
    d = by_type.setdefault(r["pageType"], {"count": 0, "sum": 0})
    d["count"] += 1
    d["sum"] += r["citeLikelihood"]

worst10 = sorted(rows, key=lambda r: r["citeLikelihood"])[:10]
best5 = sorted(rows, key=lambda r: -r["citeLikelihood"])[:5]

fix_labels = {
    "add_direct_answer": "добавить прямой ответ",
    "add_facts": "добавить факты и цифры",
    "add_faq_block": "добавить блок вопрос-ответ",
    "fix_title": "поправить заголовок",
    "none": "ничего",
}
type_labels = {"article": "статья", "landing": "лендинг", "about": "о нас/документы", "list": "список", "other": "другое"}

md = []
md.append("# GEO/SEO-аудит power-car.ru\n")
md.append(f"Оценщик: Claude (вручную, без внешней модели — Vercel AI Gateway потребовал привязку карты). Страниц: {len(rows)} из sitemap.xml (142).\n")
md.append(f"**Общий балл сайта (цитируемость AI-ассистентами, 0-3): {avg:.2f}**\n")
md.append("## Сводка по типам страниц\n")
md.append("| Тип | Страниц | Средний балл |\n|---|---|---|")
for t, v in sorted(by_type.items(), key=lambda x: -x[1]["sum"]/x[1]["count"]):
    md.append(f"| {type_labels.get(t,t)} | {v['count']} | {v['sum']/v['count']:.2f} |")
md.append("\n## 10 худших страниц\n")
md.append("| URL | Тип | Балл | Правка |\n|---|---|---|---|")
for r in worst10:
    md.append(f"| [{r['title'] or r['url']}]({r['url']}) | {type_labels.get(r['pageType'],r['pageType'])} | {r['citeLikelihood']} | {fix_labels[r['mainFix']]} |")
md.append("\n## 5 лучших страниц\n")
md.append("| URL | Тип | Балл |\n|---|---|---|")
for r in best5:
    md.append(f"| [{r['title'] or r['url']}]({r['url']}) | {type_labels.get(r['pageType'],r['pageType'])} | {r['citeLikelihood']} |")
md.append("\n## Стоимость\n")
md.append("$0 — аудит сделан вручную Claude, без вызовов внешнего API.\n")

open("audit.md", "w", encoding="utf-8").write("\n".join(md))
print(f"avg={avg:.2f}, rows={len(rows)}")
print(by_type)
