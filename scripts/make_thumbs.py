#!/usr/bin/env python3
"""Лёгкие превью (480 px) для карточек каталога и топ-10.

Для первого фото каждого автомобиля и мотоцикла создаётся images/thumbs/<тот же путь>.webp.
Полные фото остаются для страницы автомобиля и галереи. Готовые превью пропускаются.
Запуск: python3 scripts/make_thumbs.py   (нужен Pillow: pip install pillow)
"""
import json, os
from PIL import Image

W = 480

def thumb_path(p):
    base, _ = os.path.splitext(p)
    return "images/thumbs/" + base[len("images/"):] + ".webp"

def main():
    made = skipped = missing = 0
    saved = 0
    for fname in ("cars", "motorcycles"):
        path = f"data/{fname}.json"
        if not os.path.exists(path):
            continue
        for rec in json.load(open(path, encoding="utf-8")):
            photos = rec.get("photos") or []
            if not photos:
                continue
            src = photos[0]
            if not src.startswith("images/") or not os.path.exists(src):
                missing += 1
                continue
            dst = thumb_path(src)
            if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                skipped += 1
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im = Image.open(src).convert("RGB")
            if im.width > W:
                im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
            im.save(dst, "WEBP", quality=72, method=6)
            made += 1
            saved += max(0, os.path.getsize(src) - os.path.getsize(dst))
    print(f"thumbs: создано {made}, пропущено {skipped}, нет исходника {missing}; экономия ≈ {saved/1024:.0f} КБ")

if __name__ == "__main__":
    main()
