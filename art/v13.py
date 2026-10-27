"""v13 Moshe spielbar: Portraet sprites/moshe.png und fuenf Faehigkeits-Icons als PIL-Pixelart (Muster moshe.py,
Farben, Kontur und Raster von dort). Portraet: Kopf aus boss-moshe.png ausgeschnitten (48er-Raster, Buch-Rand
rechts geloescht), NEAREST x5, mittig auf 256x256, Palette wie das Original. Icons 64 px direkt wie q-sack,
1-px Flaschengruen-Kontur, kein Text, keine Symbole. Aufruf: python art/v13.py"""
import pathlib
from PIL import Image, ImageDraw
from moshe import (P, OL, canvas, outlined, save, cover, BEARD, SKIN, INK, CREAM, CREAM_D, PAGE, GREY, GREY_L,
                   GOLD, GOLD_D, GOLD_L, TEAL, GREEN, RED, RED_L, RED_D, NAVY_L, TRUNK, WHITE)

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKY = (120, 200, 230, 255)


# ---------------------------------------------------------------- Portraet aus boss-moshe.png
def portrait():
    src = Image.open(ROOT / "art" / "boss-moshe.png").convert("RGBA").resize((64, 64), Image.NEAREST)   # 64er-Raster zurueck
    px = src.load()
    for y in range(15, 34):                                   # goldenes Buch samt Funkeln rechts (ragt in den Ausschnitt)
        for x in range(48, 64):
            px[x, y] = (0, 0, 0, 0)
    head = canvas(48, 48)
    head.paste(src.crop((9, 0, 54, 48)), (1, 0))               # Hut bis Krawattenknoten, Haende bleiben draussen
    out = canvas(256, 256)
    out.paste(head.resize((240, 240), Image.NEAREST), (8, 8))
    out.save(ROOT / "sprites" / "moshe.png", optimize=True)
    print("sprites/moshe.png", out.size, out.mode)


# ---------------------------------------------------------------- Icons (64 px direkt)
def ab_buch(d):
    cover(P(d, 1, 8, 0))                                      # dasselbe Buch wie ad-cover, Goldrahmen, Raute, Skyline
    for x, y in ((4, 10), (60, 6), (3, 40), (61, 50)):
        d.rectangle((x, y, x + 1, y + 1), fill=GOLD_L)


def ab_neuesvideo(d):
    p = P(d)
    d.rounded_rectangle((18, 2, 46, 61), radius=4, fill=INK, outline=OL)
    p.rect((21, 8, 43, 52), CREAM); p.rect((21, 8, 43, 9), CREAM_D)
    p.rect((29, 4, 35, 5), GREY)                              # Hoerer-Schlitz
    p.line([(28, 57), (36, 57)], GREY)
    p.ell((24, 22, 40, 38), RED, OL)                           # Play-Knopf
    p.poly([(30, 26), (37, 30), (30, 34)], WHITE)
    p.line([(24, 44), (40, 44)], GREY_L, 2); p.rect((24, 43, 30, 45), TEAL)   # Fortschrittsbalken
    for b, a0, a1 in (((4, 14, 20, 36), 110, 250), ((8, 19, 20, 31), 110, 250),
                      ((44, 14, 60, 36), 290, 70), ((44, 19, 56, 31), 290, 70)):   # Ton aus dem Handy
        p.arc(b, a0, a1, TEAL)
    for x, y in ((2, 8), (61, 8), (2, 44), (61, 44)):
        p.rect((x, y, x, y), GOLD)


def ab_schlange(d):
    p = P(d)
    for i, (col, dark) in enumerate(((NAVY_L, (24, 36, 86, 255)), (TEAL, (30, 150, 140, 255)), (RED, RED_D))):
        ox, oy = 6 + i * 17, 6 - i * 2                      # hinten links, vorne rechts
        p.ell((ox + 4, oy + 2, ox + 15, oy + 13), col, OL)                                   # Kopf
        p.poly([(ox + 2, oy + 24), (ox + 5, oy + 15), (ox + 14, oy + 15), (ox + 17, oy + 24),
                (ox + 18, oy + 50), (ox + 1, oy + 50)], col, OL)                            # Rumpf
        p.line([(ox + 4, oy + 20), (ox + 4, oy + 48)], dark)
        p.poly([(ox + 2, oy + 24), (ox - 2, oy + 36), (ox + 1, oy + 37), (ox + 4, oy + 28)], col, OL)   # Arm nach unten
        p.rect((ox - 3, oy + 36, ox + 3, oy + 46), dark, OL)                                 # Einkaufstasche
        p.line([(ox - 1, oy + 35), (ox + 1, oy + 35)], dark)
        p.rect((ox + 2, oy + 50, ox + 8, oy + 54), INK, OL); p.rect((ox + 11, oy + 50, ox + 17, oy + 54), INK, OL)


def ab_zinseszins(d):
    p = P(d)
    for i, n in enumerate((2, 4, 7)):                         # drei Stapel, nach rechts hoeher
        x0 = 4 + i * 20
        for k in range(n):
            y = 58 - k * 4
            p.ell((x0, y - 5, x0 + 15, y), GOLD, OL)
            p.line([(x0 + 3, y - 1), (x0 + 12, y - 1)], GOLD_D)
        p.ell((x0 + 3, 58 - (n - 1) * 4 - 4, x0 + 12, 58 - (n - 1) * 4 - 1), None, GOLD_D)   # Rand obenauf
    p.line([(8, 44), (30, 30), (46, 20)], GREEN, 3)           # Pfeil nach oben
    p.poly([(40, 8), (56, 8), (56, 24)], GREEN, OL)
    p.line([(10, 42), (30, 30)], (120, 230, 140, 255))
    for x, y in ((2, 22), (24, 6), (60, 34)):
        p.rect((x, y, x, y), GOLD_L)


def ab_geschenk(d):
    p = P(d)
    for x0, x1, top, wall in ((3, 21, 30, CREAM_D), (21, 43, 24, CREAM), (43, 61, 30, CREAM_D)):   # drei Haeuser in Reihe
        p.rect((x0, top + 8, x1, 58), wall, OL)
        p.poly([(x0 - 1, top + 9), ((x0 + x1) // 2, top), (x1 + 1, top + 9)], RED, OL)       # Giebel
        p.line([(x0 + 2, top + 7), (x1 - 2, top + 7)], RED_D)
    p.rect((2, 58, 62, 60), TRUNK, OL)                                                       # Gehweg
    for x0, top in ((6, 38), (47, 38), (25, 34), (35, 34)):                                 # Fenster
        p.rect((x0, top, x0 + 6, top + 6), SKY, OL); p.line([(x0 + 3, top), (x0 + 3, top + 6)], WHITE)
    p.rect((29, 46, 35, 57), TRUNK, OL); p.rect((33, 52, 33, 52), GOLD)                        # Tuer mit Klinke
    p.rect((10, 48, 16, 57), TRUNK, OL); p.rect((50, 48, 56, 57), TRUNK, OL)
    p.rect((30, 16, 34, 32), GOLD, OL)                                                         # Schleifenband ueber dem Giebel
    p.ell((18, 12, 31, 22), GOLD, OL); p.ell((33, 12, 46, 22), GOLD, OL)                        # Schleife
    p.ell((21, 15, 28, 19), None, GOLD_D); p.ell((36, 15, 43, 19), None, GOLD_D)
    p.poly([(26, 20), (22, 29), (26, 27)], GOLD, OL); p.poly([(38, 20), (42, 29), (38, 27)], GOLD, OL)   # Baender
    p.rect((29, 14, 35, 20), GOLD_D, OL); p.rect((31, 16, 33, 18), GOLD_L)                      # Knoten
    for x, y in ((6, 6), (58, 4), (2, 20), (61, 22)):
        p.rect((x, y, x, y), GOLD_L)


if __name__ == "__main__":
    portrait()
    for fn, name in ((ab_buch, "ab-buch.png"), (ab_neuesvideo, "ab-neuesvideo.png"), (ab_schlange, "ab-schlange.png"),
                     (ab_zinseszins, "ab-zinseszins.png"), (ab_geschenk, "ab-geschenk.png")):
        im = canvas(64, 64); fn(ImageDraw.Draw(im)); save(outlined(im), name)
