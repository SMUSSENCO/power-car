#!/usr/bin/env python3
"""Обновляет в data/settings.json курс евро для расчёта таможенной пошлины по официальному курсу ЦБ РФ.
Пошлина считается по курсу ЦБ на дату декларации (так же считает калькулятор tks.ru). Остальные курсы (юань, иена, вона) — рабочие, вручную.
Запуск: python3 scripts/update_eur.py  (в CI: .github/workflows/update-rates.yml, раз в сутки)"""
import json, re, subprocess, sys, urllib.request
SETTINGS = "data/settings.json"

def get(url):
    """urllib, а если на машине нет корневых сертификатов (локальный Python на Mac), то curl"""
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read()
    except Exception:
        return subprocess.run(["curl", "-s", "-m", "30", url], capture_output=True, check=True).stdout

def fetch_json():
    d = json.loads(get("https://www.cbr-xml-daily.ru/daily_json.js"))
    e = d["Valute"]["EUR"]
    return round(e["Value"] / e["Nominal"], 4), d["Date"][:10]

def fetch_xml():
    x = get("https://www.cbr.ru/scripts/XML_daily.asp").decode("windows-1251")
    m = re.search(r'<CharCode>EUR</CharCode>.*?<VunitRate>([\d,]+)</VunitRate>', x, re.S)
    return round(float(m.group(1).replace(",", ".")), 4), re.search(r'Date="([\d.]+)"', x).group(1)

def main():
    for f in (fetch_json, fetch_xml):
        try:
            rate, day = f(); break
        except Exception as e:
            print("источник недоступен:", f.__name__, e, file=sys.stderr)
    else:
        sys.exit(1)
    s = json.load(open(SETTINGS, encoding="utf-8"))
    if s.get("rateEUR") == rate and s.get("rateEURDate") == day:
        print("без изменений:", rate); return
    s["rateEUR"] = rate; s["rateEURDate"] = day; s["rateEURSource"] = "ЦБ РФ"
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(SETTINGS, "a").write("\n")
    print("rateEUR =", rate, "на", day)

main()
