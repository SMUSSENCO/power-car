#!/usr/bin/env python3
"""Вырезает спрайты для анимации карты маршрутов из исходных 3D-картинок (светлый фон -> прозрачность).

Запуск: python3 scripts/cut_route_sprites.py <папка_с_исходниками>
Результат: images/route/*.webp (затемнены под тёмную тему сайта; автовоз и паром развёрнуты носом вправо).
"""
import sys, glob, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "images", "route")
os.makedirs(OUT, exist_ok=True)

def cutout(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    chroma = mx - mn
    # фон: почти нейтральный (бледно-серый/белый, включая мягкую тень)
    bg = (chroma < 14) & (mn > 150)
    lab, n = ndi.label(bg)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(border))
    fg = ~bgmask
    fg = ndi.binary_opening(fg, iterations=2)
    lab2, n2 = ndi.label(fg)
    if n2:
        sizes = ndi.sum(fg, lab2, range(1, n2 + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s > 4000]
        fg = np.isin(lab2, keep)
    fg = ndi.binary_fill_holes(fg)
    fg = ndi.binary_erosion(fg, iterations=1)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    out = im.copy(); out.putalpha(alpha)
    return out, fg

def darken(im, k=0.78, sat=1.05):
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    rgb = rgb * k
    g = rgb.mean(2, keepdims=True)
    rgb = g + (rgb - g) * sat
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    out.putalpha(im.getchannel("A"))
    return out

def crop_save(im, name, width, flip=False):
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bbox)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    h = round(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".webp"), quality=86, method=6)
    print(name, im.size, os.path.getsize(os.path.join(OUT, name + ".webp")))

files = {os.path.basename(p): p for p in glob.glob(os.path.join(SRC, "Gemini_Generated_Image_*.jpeg"))}
def by(sub): return [p for n, p in files.items() if sub in n][0]

# 1) ряд иконок: папка, ПТС, гаишник, рукопожатие, лайк
im, fg = cutout(by("3tf0wb"))
im = darken(im)
lab, n = ndi.label(ndi.binary_dilation(fg, iterations=25))
objs = ndi.find_objects(lab)
objs = sorted(objs, key=lambda s: s[1].start)
names = ["folder", "pts", "officer", "handshake", "like"]
assert len(objs) == 5, len(objs)
for nm, sl in zip(names, objs):
    box = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
    sub = im.crop(box)
    # маска: пересечение с исходным альфа (расширение было только для группировки)
    crop_save(sub, "icon-" + nm, 220)

# 2) автовоз (в исходнике кабина слева, едет влево) -> разворот вправо
im, _ = cutout(by("4l8ju4"))
crop_save(darken(im), "truck", 420, flip=True)
# 3) паром (нос слева) -> разворот вправо
im, _ = cutout(by("6rgwo9"))
crop_save(darken(im), "ferry", 420, flip=True)
