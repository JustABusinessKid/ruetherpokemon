"""Erzeugt sprites/*.png: Fotos pixeln, Platzhalter und Bosse zeichnen.
Aufruf im Projektordner: python tools/pixelate.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sprites"
SIZE = 32          # Pixel-Raster
SCALE = 8          # → 256×256
COLORS = 16

# Datei → (id, Crop-Box left, top, right, bottom)
PHOTOS = {
    "christian.jpg": ("christian", (44, 28, 216, 200)),
    "Hildegard.jpeg": ("hildegard", (30, 20, 160, 150)),
    "Onkel Micha.jpg": ("micha", (80, 60, 300, 280)),
    "viktor.png": ("viktor", (80, 110, 340, 370)),   # Rückansicht, gewollt
}


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # altes Pillow
        return ImageFont.load_default()


def finish(img, name):
    """32×32 → quantisieren → ×8 NEAREST → speichern"""
    img = img.convert("RGB").quantize(COLORS, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    big = img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)
    big.save(OUT / f"{name}.png")
    print("ok", name)


def pixelate_photo(file, name, box):
    img = Image.open(ROOT / file).convert("RGB").crop(box)
    small = img.resize((SIZE, SIZE), Image.LANCZOS)
    finish(small, name)


def canvas(bg):
    img = Image.new("RGBA", (SIZE, SIZE), bg)
    return img, ImageDraw.Draw(img)


def draw_ramona():
    img, d = canvas((255, 182, 213))
    d.ellipse((9, 4, 23, 20), fill=(240, 200, 170))          # Kopf
    d.pieslice((8, 2, 24, 18), 180, 360, fill=(120, 70, 40))  # Haare
    d.rectangle((7, 10, 9, 20), fill=(120, 70, 40))
    d.rectangle((23, 10, 25, 20), fill=(120, 70, 40))
    d.point([(13, 11), (19, 11)], fill=(30, 30, 30))          # Augen
    d.line((14, 16, 18, 16), fill=(150, 60, 60))              # Mund
    d.rectangle((8, 21, 24, 31), fill=(200, 40, 80))          # Oberteil
    d.text((13, 21), "R", fill=(255, 255, 255), font=font(10))
    finish(img, "ramona")


def draw_unknown():
    img, d = canvas((60, 60, 70))
    d.ellipse((10, 4, 22, 16), fill=(30, 30, 36))
    d.ellipse((4, 17, 28, 40), fill=(30, 30, 36))
    d.text((7, 10), "???", fill=(200, 200, 210), font=font(9))
    finish(img, "unknown")


def draw_satoshi():
    img, d = canvas((20, 24, 40))
    d.polygon([(16, 2), (4, 18), (4, 31), (28, 31), (28, 18)], fill=(40, 40, 60))  # Kapuze
    d.ellipse((9, 8, 23, 22), fill=(5, 5, 10))                                      # Schatten-Gesicht
    d.text((12, 8), "?", fill=(255, 255, 255), font=font(13))
    finish(img, "satoshi")


def draw_schanze():
    img, d = canvas((230, 230, 240))
    d.rectangle((5, 20, 27, 31), fill=(30, 30, 40))      # Anzug
    d.polygon([(13, 20), (19, 20), (16, 27)], fill=(255, 255, 255))  # Hemd
    d.line((16, 21, 16, 26), fill=(200, 30, 30))           # Krawatte
    d.ellipse((7, 2, 25, 20), fill=(247, 147, 26))         # Bitcoin-Kopf
    d.ellipse((9, 4, 23, 18), outline=(200, 110, 10))
    d.text((12, 4), "B", fill=(255, 255, 255), font=font(12))
    d.line((15, 3, 15, 5), fill=(255, 255, 255))
    d.line((15, 17, 15, 19), fill=(255, 255, 255))
    finish(img, "schanze")


def draw_ps3():
    img, d = canvas((70, 70, 80))
    d.rounded_rectangle((2, 9, 29, 23), radius=3, fill=(10, 10, 12))
    d.rounded_rectangle((4, 11, 27, 21), radius=2, outline=(40, 40, 45))
    d.line((5, 15, 26, 15), fill=(60, 220, 90))             # Lichtleiste
    d.text((7, 16), "PS3", fill=(220, 220, 220), font=font(7))
    finish(img, "ps3")


def draw_coin():
    img, d = canvas((0, 0, 0, 0))
    d.ellipse((2, 2, 29, 29), fill=(247, 147, 26))
    d.ellipse((5, 5, 26, 26), outline=(255, 200, 100), width=1)
    d.text((11, 7), "B", fill=(255, 255, 255), font=font(15))
    d.line((16, 5, 16, 8), fill=(255, 255, 255))
    d.line((16, 24, 16, 27), fill=(255, 255, 255))
    # Transparenz erhalten: nicht quantisieren
    img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST).save(OUT / "coin.png")
    print("ok coin")


def draw_icons():
    """PWA-Icons: Münze auf dunklem Grund mit 12 % Rand, 192 und 512 px."""
    coin = Image.open(OUT / "coin.png").convert("RGBA")
    for size in (192, 512):
        pad = round(size * 0.12)
        inner = size - 2 * pad
        img = Image.new("RGBA", (size, size), (27, 27, 31, 255))  # #1b1b1f
        img.alpha_composite(coin.resize((inner, inner), Image.NEAREST), (pad, pad))
        img.save(OUT / f"icon-{size}.png")
        print("ok", f"icon-{size}")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for file, (name, box) in PHOTOS.items():
        pixelate_photo(file, name, box)
    draw_ramona()
    draw_unknown()
    draw_satoshi()
    draw_schanze()
    draw_ps3()
    draw_coin()
    draw_icons()
