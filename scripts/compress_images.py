#!/usr/bin/env python3
"""Сжимает фото авто и кейсов: ширина не больше 1200 px, webp quality 68. Заменяет файл, только если стало меньше минимум на 10%.
Запуск: python3 scripts/compress_images.py [папка ...]   (по умолчанию images/cars и images/cases)"""
import os, sys
from PIL import Image
roots = sys.argv[1:] or ["images/cars", "images/cases"]
MAXW, Q, MIN_KB = 1200, 68, 70
before = after = n = 0
for root in roots:
    for r, _, files in os.walk(root):
        for f in files:
            if not f.lower().endswith((".webp", ".jpg", ".jpeg")): continue
            p = os.path.join(r, f); s = os.path.getsize(p)
            if s < MIN_KB * 1024: continue
            try:
                im = Image.open(p); im.load()
                if im.width > MAXW: im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
                im = im.convert("RGB"); tmp = p + ".tmp"
                if f.lower().endswith(".webp"): im.save(tmp, "WEBP", quality=Q, method=6)
                else: im.save(tmp, "JPEG", quality=76, optimize=True, progressive=True)
                ns = os.path.getsize(tmp)
                if ns < s * 0.9: os.replace(tmp, p); before += s; after += ns; n += 1
                else: os.remove(tmp)
            except Exception as e:
                print("skip", p, e)
print(f"сжато файлов: {n}, было {before/1e6:.1f} МБ, стало {after/1e6:.1f} МБ, экономия {(before-after)/1e6:.1f} МБ")
