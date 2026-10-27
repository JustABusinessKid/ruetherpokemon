"""v12 Moshe Hillel: alle 11 Grafiken als PIL-Pixelart (das Bildmodell stand nicht zur Verfuegung: 0 Credits),
wie boss-hitler.py von Hand: kleines Raster, 1-px Flaschengruen-Kontur, NEAREST hochskaliert. Nirgends Text,
keine Symbole; Moshe nah an den Fotos (Hut mit breiter Krempe, weisser Vollbart, Nadelstreifen, rote Krawatte).
Aufruf: python art/moshe.py  (schreibt boss-moshe, bg-anzeige, bg-video, ad-cover, ad-car, fx-book, fx-contract,
fx-phone, q-berater, q-moshe, q-sack nach art/)"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent
OL = (4, 62, 45, 255)                                   # Flaschengruen-Kontur wie im Stil-Satz
HAT, HAT_L = (22, 22, 28, 255), (62, 62, 76, 255)
SKIN, SKIN_D = (238, 200, 168, 255), (204, 156, 124, 255)
BEARD, BEARD_D = (246, 244, 238, 255), (196, 196, 192, 255)
SUIT, SUIT_L, SUIT_D = (54, 56, 72, 255), (92, 94, 112, 255), (34, 36, 48, 255)
SILVER, SILVER_L, SILVER_D = (176, 180, 198, 255), (228, 230, 240, 255), (118, 122, 140, 255)
SHIRT, WHITE = (250, 248, 240, 255), (252, 252, 252, 255)
TIE, TIE_L, BLUE = (178, 36, 40, 255), (218, 74, 74, 255), (44, 84, 180, 255)
GOLD, GOLD_D, GOLD_L = (244, 196, 48, 255), (176, 128, 24, 255), (255, 238, 160, 255)
NAVY, NAVY_L, NAVY_D = (24, 36, 86, 255), (42, 60, 128, 255), (14, 22, 56, 255)
CREAM, CREAM_D, PAGE = (250, 236, 200, 255), (224, 204, 158, 255), (244, 240, 232, 255)
INK, GREY, GREY_L = (40, 40, 48, 255), (150, 150, 156, 255), (204, 204, 208, 255)
RED, RED_L, RED_D = (198, 32, 40, 255), (240, 92, 92, 255), (132, 18, 26, 255)
TEAL, GREEN, AMBER = (60, 220, 210, 255), (60, 180, 90, 255), (240, 180, 60, 255)
EYE, MOUTH, BURG = (36, 36, 44, 255), (96, 40, 40, 255), (120, 30, 42, 255)
TAN, TAN_D, TAN_L, ROPE = (206, 164, 98, 255), (152, 112, 60, 255), (232, 200, 140, 255), (118, 80, 40, 255)
PALM, PALM_D, TRUNK = (56, 140, 70, 255), (30, 96, 48, 255), (124, 86, 46, 255)


def canvas(w, h, fill=(0, 0, 0, 0)):
    return Image.new("RGBA", (w, h), fill)


def outlined(im, k=1):
    """k-px Kontur um alles, was noch keine hat (wie boss-hitler.py)."""
    for _ in range(k):
        src = im.copy(); px, sp = im.load(), src.load(); w, h = im.size
        for y in range(h):
            for x in range(w):
                if sp[x, y][3] == 0 and any(0 <= x + dx < w and 0 <= y + dy < h and sp[x + dx, y + dy][3]
                                             for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    px[x, y] = OL
    return im


def save(im, name, scale=1, rgb=False):
    out = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    if rgb:
        out = out.convert("RGB")
    out.save(OUT / name, optimize=True)
    print(name, out.size, out.mode)


class P:
    """Zeichnet ein Motiv in k-fach vergroessertem Raster an Versatz (ox, oy): dasselbe Moshe-Motiv fuer den Boss
    (k=1, 64er-Raster) und die Videoszene (k=2), dasselbe Buch fuer ad-cover und bg-anzeige, dasselbe Auto fuer
    ad-car und bg-video. Boxen sind einschliesslich (x0, y0, x1, y1) wie bei ImageDraw."""
    def __init__(s, d, k=1, ox=0, oy=0):
        s.d, s.k, s.ox, s.oy = d, k, ox, oy

    def _box(s, b):
        x0, y0, x1, y1 = b; k = s.k
        return (s.ox + x0 * k, s.oy + y0 * k, s.ox + (x1 + 1) * k - 1, s.oy + (y1 + 1) * k - 1)

    def _pts(s, pts):
        return [(s.ox + x * s.k + s.k // 2, s.oy + y * s.k + s.k // 2) for x, y in pts]

    def rect(s, b, fill, outline=None):
        s.d.rectangle(s._box(b), fill=fill, outline=outline, width=s.k)

    def ell(s, b, fill, outline=None):
        s.d.ellipse(s._box(b), fill=fill, outline=outline, width=s.k)

    def poly(s, pts, fill, outline=None):
        s.d.polygon(s._pts(pts), fill=fill, outline=outline, width=s.k)

    def line(s, pts, fill, w=1):
        s.d.line(s._pts(pts), fill=fill, width=w * s.k)

    def arc(s, b, a0, a1, fill, w=1):
        s.d.arc(s._box(b), a0, a1, fill=fill, width=w * s.k)


# ---------------------------------------------------------------- Moshe (64er-Raster, ganze Figur)
def moshe(p, book=True):
    """Hut mit breiter Krempe, weisser Vollbart, Nadelstreifen, rote Krawatte, offene Haende, goldenes Buch."""
    # Beine, Schuhe
    for x0 in (19, 35):
        p.rect((x0, 55, x0 + 9, 60), SUIT, OL)
        p.line([(x0 + 3, 56), (x0 + 3, 59)], SUIT_L)
        p.line([(x0 + 7, 56), (x0 + 7, 59)], SUIT_L)
    p.rect((17, 59, 29, 62), HAT, OL); p.rect((34, 59, 46, 62), HAT, OL)
    # Torso mit Nadelstreifen, Revers, Hemd, Krawatte
    p.poly([(14, 34), (23, 31), (40, 31), (49, 34), (51, 56), (12, 56)], SUIT, OL)
    for x in range(16, 49, 4):
        p.line([(x, 35), (x, 55)], SUIT_L)
    p.poly([(23, 31), (30, 31), (29, 45), (24, 41)], SUIT_D, OL)
    p.poly([(33, 31), (40, 31), (39, 41), (34, 45)], SUIT_D, OL)
    p.poly([(29, 31), (34, 31), (32, 44)], SHIRT)
    p.poly([(30, 40), (34, 40), (35, 50), (32, 54), (29, 50)], TIE, OL)
    p.line([(31, 42), (31, 50)], TIE_L)
    # Arme: Oberarm nach unten, Unterarm hoch, offene Hand (links Handflaeche, rechts traegt das Buch)
    for m in (1, -1):                                     # m=1 links, m=-1 gespiegelt rechts
        X = (lambda x: x) if m == 1 else (lambda x: 63 - x)
        p.poly([(X(13), 34), (X(20), 35), (X(13), 48), (X(6), 46)], SUIT, OL)
        p.poly([(X(6), 46), (X(13), 48), (X(11), 40), (X(5), 37)], SUIT, OL)
        p.line([(X(7), 44), (X(11), 45)], SUIT_L)
        p.ell((min(X(1), X(9)), 31, max(X(1), X(9)), 39), SKIN, OL)
        for fx in (3, 5, 7):
            p.line([(X(fx), 33), (X(fx), 36)], SKIN_D)
        p.ell((min(X(7), X(10)), 36, max(X(7), X(10)), 39), SKIN, OL)   # Daumen
    if book:                                              # goldenes Buch auf der rechten Hand
        p.rect((51, 22, 62, 31), GOLD, OL)
        p.rect((53, 24, 60, 29), None, GOLD_D)
        p.line([(52, 23), (59, 23)], GOLD_L)
        p.line([(61, 24), (61, 30)], CREAM)
        for x, y in ((49, 20), (62, 18), (50, 33)):
            p.rect((x, y, x, y), GOLD_L)
    # Kopf: Haar seitlich, Ohren, Gesicht
    p.ell((20, 12, 25, 21), BEARD, OL); p.ell((38, 12, 43, 21), BEARD, OL)
    p.ell((21, 17, 24, 22), SKIN, OL); p.ell((39, 17, 42, 22), SKIN, OL)
    p.ell((23, 9, 40, 30), SKIN, OL)
    p.line([(25, 15), (29, 15)], BEARD_D); p.line([(34, 15), (38, 15)], BEARD_D)       # weisse Brauen
    for x0 in (26, 34):                                   # freundliche Augen
        p.line([(x0, 16), (x0 + 3, 16)], EYE)
        p.rect((x0, 17, x0 + 3, 19), WHITE)
        p.rect((x0 + 1, 18, x0 + 2, 19), EYE)
    p.rect((25, 21, 25, 21), SKIN_D); p.rect((38, 21, 38, 21), SKIN_D)                 # Lachfaeltchen
    p.line([(31, 18), (31, 23)], SKIN_D); p.line([(30, 24), (33, 24)], SKIN_D)         # Nase
    p.poly([(22, 20), (23, 32), (26, 41), (32, 45), (38, 41), (41, 32), (42, 20), (40, 27), (37, 28), (27, 28), (24, 27)], BEARD, OL)
    for a, b in (((27, 32), (28, 40)), ((32, 31), (32, 43)), ((36, 32), (35, 40)), ((24, 24), (25, 30)), ((40, 24), (39, 30))):
        p.line([a, b], BEARD_D)
    p.ell((26, 24, 37, 27), BEARD)                                                     # Schnauzbart ohne Kontur, geht in den Bart ueber
    p.line([(27, 27), (36, 27)], BEARD_D)
    p.line([(31, 28), (33, 28)], MOUTH)                                                # Mund: schmaler Strich im Bart
    # Hut: flacher Kopf, breite Krempe
    p.rect((21, 1, 42, 9), HAT, OL)
    p.line([(22, 2), (41, 2)], HAT_L)
    p.ell((12, 8, 51, 13), HAT, OL)
    p.line([(14, 9), (49, 9)], HAT_L)
    p.line([(22, 7), (41, 7)], HAT_L)


def mini_head(p, cx, top):
    """Kleines Moshe-Portraet (Hut, Bart, Anzug) fuer das Buchcover, ~28 Raster breit."""
    p.poly([(cx - 15, top + 30), (cx - 8, top + 24), (cx + 8, top + 24), (cx + 15, top + 30), (cx + 15, top + 36), (cx - 15, top + 36)], SUIT, OL)
    for x in range(cx - 13, cx + 14, 3):
        p.line([(x, top + 29), (x, top + 35)], SUIT_L)
    p.rect((cx - 1, top + 24, cx + 1, top + 31), TIE)
    p.ell((cx - 11, top + 6, cx - 7, top + 13), BEARD, OL); p.ell((cx + 7, top + 6, cx + 11, top + 13), BEARD, OL)
    p.ell((cx - 8, top + 4, cx + 8, top + 17), SKIN, OL)
    p.line([(cx - 5, top + 9), (cx - 3, top + 9)], BEARD_D); p.line([(cx + 3, top + 9), (cx + 5, top + 9)], BEARD_D)
    p.rect((cx - 5, top + 10, cx - 3, top + 11), WHITE); p.rect((cx + 3, top + 10, cx + 5, top + 11), WHITE)
    p.rect((cx - 4, top + 11, cx - 4, top + 11), EYE); p.rect((cx + 4, top + 11, cx + 4, top + 11), EYE)
    p.line([(cx, top + 10), (cx, top + 13)], SKIN_D)
    p.rect((cx - 4, top + 14, cx + 4, top + 15), BEARD)
    p.poly([(cx - 8, top + 12), (cx - 7, top + 19), (cx - 3, top + 25), (cx, top + 27), (cx + 3, top + 25), (cx + 7, top + 19), (cx + 8, top + 12), (cx + 6, top + 16), (cx, top + 16), (cx - 6, top + 16)], BEARD, OL)
    p.rect((cx - 9, top, cx + 9, top + 5), HAT, OL)
    p.ell((cx - 14, top + 4, cx + 14, top + 7), HAT, OL)
    p.line([(cx - 12, top + 5), (cx + 12, top + 5)], HAT_L)


# ---------------------------------------------------------------- Buchcover (48x64-Raster)
def cover(p):
    """Der Investment-Code: dunkelblau, goldener Rahmen, Skyline, kleines Portraet. Kein Text, nur Zierlinien."""
    p.poly([(2, 4), (8, 2), (8, 62), (2, 60)], NAVY_D, OL)                # Ruecken
    p.line([(4, 7), (4, 58)], GOLD_D); p.line([(6, 5), (6, 60)], GOLD_D)
    p.rect((44, 4, 46, 62), CREAM, OL)                                     # Seiten rechts
    p.line([(45, 5), (45, 61)], CREAM_D)
    p.rect((8, 2, 44, 62), NAVY, OL)                                       # Vorderseite
    p.rect((10, 4, 42, 60), None, GOLD)                                    # Goldrahmen
    p.rect((12, 6, 40, 58), None, GOLD_D)
    p.line([(16, 10), (36, 10)], GOLD); p.poly([(26, 8), (28, 10), (26, 12), (24, 10)], GOLD_L)   # Zierlinie oben
    p.line([(18, 13), (34, 13)], GOLD_D)
    for y in range(32, 52):                                                # Abendhimmel hinter der Skyline
        t = (y - 32) / 20
        p.line([(13, y), (39, y)], (int(24 + 150 * t), int(36 + 100 * t), int(86 - 20 * t), 255))
    for x0, h in ((13, 12), (17, 18), (21, 8), (25, 22), (30, 14), (34, 19), (38, 10)):    # Skyline
        p.rect((x0, 52 - h, x0 + 3, 52), NAVY_D)
        for yy in range(54 - h, 51, 3):
            p.rect((x0 + 1, yy, x0 + 1, yy), GOLD_L)
    p.line([(13, 52), (39, 52)], NAVY_D)
    mini_head(p, 26, 15)
    p.line([(16, 55), (36, 55)], GOLD); p.line([(20, 57), (32, 57)], GOLD_D)   # Zierlinie unten


# ---------------------------------------------------------------- roter Sportwagen (64x32-Raster, Seitenansicht nach links)
def car(p, note=True):
    p.poly([(3, 21), (4, 15), (20, 12), (26, 6), (44, 6), (52, 11), (60, 12), (61, 21), (57, 23), (7, 23)], RED, OL)
    p.poly([(21, 12), (27, 7), (43, 7), (50, 12)], INK, OL)                # Scheiben
    p.line([(29, 8), (41, 8)], (150, 200, 230, 255))
    p.line([(6, 15), (19, 13)], RED_L); p.line([(8, 18), (58, 18)], RED_D)
    p.line([(34, 13), (34, 22)], RED_D); p.line([(36, 15), (38, 15)], GREY_L)   # Tuer, Griff
    p.rect((4, 15, 7, 17), AMBER, OL); p.rect((58, 14, 60, 17), RED_D, OL)      # Scheinwerfer, Ruecklicht
    for x0 in (10, 42):                                                     # Raeder
        p.ell((x0, 18, x0 + 11, 29), HAT, OL)
        p.ell((x0 + 3, 21, x0 + 8, 26), GREY, OL)
        p.rect((x0 + 5, 23, x0 + 6, 24), GREY_L)
    if note:                                                                # Zettel an der Scheibe
        p.rect((24, 8, 30, 13), CREAM, OL)
        p.line([(25, 10), (29, 10)], GREY); p.line([(25, 12), (28, 12)], GREY)


# ---------------------------------------------------------------- Hilfsfiguren fuer die Quest (64 px direkt)
def berater(d):
    p = P(d)
    for x0 in (24, 34):
        p.rect((x0, 44, x0 + 5, 55), SILVER_D, OL)
    p.rect((22, 54, 30, 57), INK, OL); p.rect((33, 54, 41, 57), INK, OL)
    p.poly([(18, 29), (26, 25), (38, 25), (46, 29), (47, 46), (17, 46)], SILVER, OL)
    p.line([(21, 30), (21, 45)], SILVER_L, 2)                               # Glanz
    p.poly([(26, 25), (31, 25), (29, 37), (25, 33)], SILVER_D, OL)
    p.poly([(33, 25), (38, 25), (39, 33), (35, 37)], SILVER_D, OL)
    p.poly([(30, 25), (34, 25), (32, 33)], WHITE)
    p.poly([(31, 31), (33, 31), (34, 40), (32, 42), (30, 40)], BLUE, OL)
    p.poly([(18, 29), (23, 30), (24, 42), (19, 43)], SILVER, OL)            # Aermel zu den Haenden
    p.poly([(46, 29), (41, 30), (40, 42), (45, 43)], SILVER, OL)
    p.rect((25, 37, 39, 47), INK, OL); p.rect((27, 39, 37, 45), (120, 200, 230, 255))   # Tablet
    p.line([(29, 41), (35, 41)], WHITE); p.line([(29, 43), (33, 43)], WHITE)
    p.ell((21, 40, 26, 45), SKIN, OL); p.ell((38, 40, 43, 45), SKIN, OL)
    p.ell((24, 8, 40, 26), SKIN, OL)                                        # Kopf
    p.poly([(24, 14), (26, 8), (34, 6), (40, 10), (40, 14), (36, 11), (28, 12)], (70, 46, 30, 255), OL)   # gegeltes Haar
    for x0 in (27, 35):
        p.rect((x0, 15, x0 + 2, 17), WHITE); p.rect((x0 + 1, 16, x0 + 1, 17), EYE)
    p.rect((28, 20, 36, 22), WHITE, OL)                                     # Verkaeufer-Grinsen
    p.line([(29, 21), (35, 21)], GREY_L)
    p.arc((23, 5, 41, 23), 180, 360, GREY_L, 2)                             # Headset: heller Buegel auf dunklem Haar
    p.rect((22, 15, 25, 19), GREY_L, OL)
    p.line([(24, 19), (27, 23)], INK); p.ell((26, 22, 29, 25), INK, OL)


def sack(d):
    p = P(d)
    p.poly([(22, 22), (42, 22), (50, 32), (52, 48), (46, 58), (18, 58), (12, 48), (14, 32)], TAN, OL)   # Sack mit flachem Boden
    p.poly([(22, 22), (42, 22), (38, 14), (26, 14)], TAN, OL)
    p.ell((25, 10, 39, 17), TAN_D, OL)                                      # Oeffnung
    p.ell((27, 9, 33, 15), GOLD, OL); p.ell((32, 8, 38, 14), GOLD, OL)      # Muenzen obenauf
    p.rect((30, 12, 30, 12), GOLD_D); p.rect((35, 11, 35, 11), GOLD_D)
    p.rect((23, 19, 41, 22), ROPE, OL); p.ell((38, 18, 44, 24), ROPE, OL)   # Kordel mit Knoten
    p.line([(42, 23), (46, 28)], ROPE, 2)
    p.line([(20, 30), (24, 50)], TAN_D); p.line([(44, 30), (40, 50)], TAN_D); p.line([(17, 30), (18, 42)], TAN_L)
    p.ell((27, 36, 37, 46), GOLD, OL); p.ell((29, 38, 35, 44), None, GOLD_D)   # Goldplakette ohne Zeichen


# ---------------------------------------------------------------- Kampf-Requisiten (48er-Raster -> 192)
def fx_book(d):
    p = P(d)
    p.poly([(6, 10), (10, 8), (14, 38), (10, 40)], GOLD_D, OL)              # Ruecken
    p.poly([(36, 4), (40, 4), (44, 33), (40, 34)], CREAM, OL)               # Seiten
    p.line([(39, 6), (42, 32)], CREAM_D)
    p.poly([(10, 8), (36, 4), (40, 34), (14, 38)], NAVY, OL)                # Deckel
    p.poly([(13, 10), (34, 7), (37, 32), (16, 35)], None, GOLD)
    p.poly([(24, 16), (29, 21), (24, 26), (19, 21)], GOLD, OL)              # Zierraute
    for a, b, c in (((1, 13), (5, 12), TEAL), ((1, 21), (5, 21), GOLD), ((1, 29), (5, 30), TEAL), ((44, 38), (46, 42), GOLD)):
        p.line([a, b], c)


def fx_contract(d):
    p = P(d)
    p.poly([(10, 4), (34, 4), (40, 10), (40, 44), (10, 44)], CREAM, OL)
    p.poly([(34, 4), (40, 10), (34, 10)], CREAM_D, OL)                      # Eselsohr
    for y, x1 in ((14, 34), (18, 30), (22, 34), (26, 28), (30, 32)):       # Zeilen als Balken, keine Schrift
        p.line([(14, y), (x1, y)], GREY)
    p.line([(22, 39), (36, 39)], GREY_L)
    p.line([(23, 38), (25, 35), (27, 39), (29, 35), (31, 38), (33, 36), (35, 38)], NAVY_L)   # Unterschrift-Gekritzel
    p.ell((12, 32, 20, 40), RED, OL); p.ell((14, 34, 18, 38), None, RED_D)  # Siegel
    for x, y in ((4, 8), (44, 20), (6, 40), (46, 6)):
        p.rect((x, y, x, y), GOLD)


def fx_phone(d):
    p = P(d)
    d.rounded_rectangle((14, 2, 34, 46), radius=3, fill=INK, outline=OL)
    p.rect((16, 6, 32, 40), CREAM); p.rect((16, 6, 32, 7), CREAM_D)
    p.rect((22, 3, 26, 4), GREY)                                            # Hoerer-Schlitz
    p.ell((20, 11, 28, 19), GREY_L); p.ell((22, 12, 26, 16), GREY)          # Anrufer-Silhouette
    p.line([(19, 23), (29, 23)], GREY); p.line([(21, 26), (27, 26)], GREY_L)
    p.ell((17, 30, 23, 36), GREEN, OL); p.rect((19, 32, 21, 34), WHITE)     # annehmen
    p.ell((25, 30, 31, 36), RED, OL); p.rect((27, 32, 29, 34), WHITE)       # ablehnen
    p.line([(21, 43), (27, 43)], GREY)
    for b in ((2, 2, 14, 14), (5, 5, 14, 14), (34, 2, 46, 14), (34, 5, 43, 14)):   # Klingel-Boegen
        p.arc(b, 190 if b[0] < 20 else 260, 280 if b[0] < 20 else 350, TEAL)


# ---------------------------------------------------------------- Kulissen (320x180 -> 1280x720)
def bg_anzeige():
    im = canvas(320, 180, PAGE); d = ImageDraw.Draw(im); p = P(d)
    p.rect((0, 0, 319, 23), (18, 18, 22, 255))                              # schwarzer Balken mit Countdown
    p.rect((16, 9, 66, 14), CREAM_D)
    for x in (84, 124, 164, 204):
        p.rect((x, 5, x + 9, 16), CREAM); p.rect((x + 12, 5, x + 21, 16), CREAM)
        p.rect((x + 4, 18, x + 18, 19), GREY)
        if x < 204:
            p.rect((x + 28, 8, x + 29, 9), CREAM); p.rect((x + 28, 12, x + 29, 13), CREAM)
    p.rect((0, 24, 319, 37), (34, 34, 40, 255))
    for x in (24, 100):                                                     # Sanduhren als Formen
        p.poly([(x, 26), (x + 6, 26), (x + 3, 30)], AMBER); p.poly([(x, 35), (x + 6, 35), (x + 3, 31)], AMBER)
    p.rect((34, 29, 94, 32), CREAM_D); p.rect((230, 29, 300, 32), CREAM_D)
    for y in (45, 49, 53):                                                  # Menue, Krone/Wappen, Suche, Tasche
        p.line([(10, y), (22, y)], INK)
    p.ell((132, 41, 148, 57), GOLD, OL); p.ell((135, 44, 145, 54), BURG)
    p.poly([(137, 51), (140, 46), (143, 51)], GOLD_L)
    p.rect((154, 44, 204, 48), BURG); p.rect((154, 51, 196, 54), GREY_L)
    p.ell((268, 43, 278, 53), None, INK); p.line([(277, 52), (282, 57)], INK, 2)
    p.rect((292, 47, 304, 57), None, INK); p.arc((294, 42, 302, 50), 180, 360, INK)
    p.line([(0, 61), (319, 61)], GREY_L)
    cover(P(d, 2, 110, 66))                                                 # das Buch, mittig (Handy-Ausschnitt)
    p.arc((214, 56, 300, 100), 200, 340, INK, 5)                             # schwarzes Band "2 Geschenke" ohne Text
    for i, (col, col2) in enumerate(((INK, GOLD), (TRUNK, GOLD), (GREEN, GREY_L))):   # Geschenk, Truhe, Geld
        y = 82 + i * 32
        p.ell((224, y, 250, y + 26), WHITE, GREY)
        if i == 0:
            p.rect((230, y + 9, 244, y + 20), col, OL); p.line([(237, y + 9), (237, y + 20)], col2); p.line([(230, y + 13), (244, y + 13)], col2)
        elif i == 1:
            p.rect((230, y + 10, 244, y + 20), col, OL); p.arc((230, y + 5, 244, y + 15), 180, 360, col, 2); p.rect((236, y + 13, 238, y + 15), col2)
        else:
            for k in range(3):
                p.rect((229 + k, y + 16 - k * 3, 243 + k, y + 19 - k * 3), col, OL)
        p.rect((256, y + 8, 300, y + 11), GREY); p.rect((256, y + 15, 290, y + 18), GREY_L)
    for k in range(5):                                                      # Sterne links unter den Textbalken
        x = 14 + k * 12
        p.poly([(x + 4, 96), (x + 5, 100), (x + 9, 100), (x + 6, 102), (x + 7, 106), (x + 4, 104), (x + 1, 106), (x + 2, 102), (x - 1, 100), (x + 3, 100)], GOLD, GOLD_D)
    p.rect((14, 112, 90, 115), GREY)
    p.rect((10, 70, 100, 74), GREY_L); p.rect((10, 80, 90, 84), GREY_L); p.rect((10, 150, 100, 154), GREY_L)
    return im


def bg_video():
    im = canvas(320, 180); d = ImageDraw.Draw(im); p = P(d)
    for y in range(0, 72):                                                  # Himmel
        t = y / 72
        p.line([(0, y), (319, y)], (int(110 + 100 * t), int(180 + 50 * t), int(235 + 10 * t), 255))
    p.ell((250, 10, 274, 34), GOLD_L)
    p.rect((0, 72, 319, 94), (40, 120, 190, 255))                            # Meer
    for y in (78, 84, 90):
        for x in range(4, 320, 14):
            p.line([(x, y), (x + 6, y)], (100, 180, 225, 255))
    for x0, w, h in ((0, 36, 14), (40, 24, 10), (270, 50, 16)):             # weisse Haeuser am Ufer
        p.rect((x0, 72 - h, x0 + w, 72), WHITE, OL)
        for xx in range(x0 + 3, x0 + w - 2, 5):
            p.rect((xx, 76 - h, xx + 1, 78 - h), (120, 170, 220, 255))
    p.rect((0, 94, 319, 179), (196, 190, 178, 255))                          # Promenade
    p.rect((0, 94, 319, 96), (150, 146, 136, 255))
    for x in range(0, 320, 24):
        p.line([(x, 97), (x, 179)], (182, 176, 164, 255))
    for cx, m in ((22, 1), (298, -1)):                                      # Palmen
        p.line([(cx, 100), (cx - 4 * m, 46)], TRUNK, 4)
        for ex, ey in ((cx - 24 * m, 36), (cx - 14 * m, 24), (cx + 4 * m, 22), (cx + 18 * m, 30), (cx + 24 * m, 48)):
            p.poly([(cx - 4 * m, 46), (ex, ey), (ex + 4 * m, ey + 8)], PALM, PALM_D)
    car(P(d, 3, 64, 10), note=False)                                        # steht hinten an der Promenade
    layer = canvas(128, 128); moshe(P(ImageDraw.Draw(layer), 2), book=False)
    im.alpha_composite(outlined(layer, 2), (96, 70))                        # Brustbild, Beine unter dem Bildrand
    return im


if __name__ == "__main__":
    im = canvas(64, 64); moshe(P(ImageDraw.Draw(im))); save(outlined(im), "boss-moshe.png", 4)
    im = canvas(64, 64); moshe(P(ImageDraw.Draw(im)), book=False); save(outlined(im), "q-moshe.png")
    im = canvas(64, 64); berater(ImageDraw.Draw(im)); save(outlined(im), "q-berater.png")
    im = canvas(64, 64); sack(ImageDraw.Draw(im)); save(outlined(im), "q-sack.png")
    im = canvas(48, 64); cover(P(ImageDraw.Draw(im))); save(outlined(im), "ad-cover.png", 4)
    im = canvas(64, 32); car(P(ImageDraw.Draw(im))); save(outlined(im), "ad-car.png", 4)
    for fn, name in ((fx_book, "fx-book.png"), (fx_contract, "fx-contract.png"), (fx_phone, "fx-phone.png")):
        im = canvas(48, 48); fn(ImageDraw.Draw(im)); save(outlined(im), name, 4)
    save(bg_anzeige(), "bg-anzeige.png", 4, rgb=True)
    save(bg_video(), "bg-video.png", 4, rgb=True)
