"""boss-goebbels als PIL-Pixelart (Stil wie boss-hitler.py): hagerer Lakai mit Riesenkopf und Segelohren,
bruellt uebereifrig in ein gelbes Megafon. 64x64-Raster, 1-px Flaschengruen-Kontur, NEAREST x4 -> 256.
Schlichter grauer Mantel, keine Abzeichen, keine Symbole. Aufruf: python art/boss-goebbels.py art/boss-goebbels.png"""
import sys
from PIL import Image, ImageDraw

OL = (4, 62, 45, 255)                     # Flaschengruen-Kontur wie im Stil-Satz
FACE, FACE_D, CHEEK = (246, 200, 162, 255), (214, 156, 122, 255), (240, 132, 112, 255)
HAIR, HAIR_L = (24, 24, 30, 255), (88, 92, 108, 255)
COAT, COAT_D, COAT_L = (138, 142, 152, 255), (102, 106, 116, 255), (176, 180, 188, 255)
PANT, SHOE, SHOE_L = (58, 56, 62, 255), (28, 26, 28, 255), (80, 80, 88, 255)
WHITE, MOUTH, TONGUE = (250, 246, 236, 255), (70, 18, 24, 255), (236, 120, 120, 255)
MEGA, MEGA_D, MEGA_L, MEGA_IN = (252, 200, 40, 255), (226, 132, 28, 255), (255, 236, 140, 255), (120, 52, 30, 255)
LINE = (184, 186, 194, 255)

im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(im)

# Beine: duenn, hopst eifrig (Fuesse in der Luft)
for x0 in (27, 33):
    d.rectangle((x0, 51, x0 + 3, 57), fill=PANT, outline=OL)
    d.rectangle((x0 - 2, 56, x0 + 4, 59), fill=SHOE, outline=OL)
    d.line((x0 - 1, 57, x0, 57), fill=SHOE_L)
for x0 in (20, 40):                                                       # Hopser-Striche
    d.line((x0, 61, x0 + 2, 61), fill=LINE)

# Mantel: lang und schmal, schlichtes Revers, zwei Knoepfe
d.polygon([(26, 34), (38, 34), (40, 52), (24, 52)], fill=COAT, outline=OL)
d.line((25, 51, 39, 51), fill=COAT_D)
d.line((32, 46, 32, 51), fill=COAT_D)                                     # Mantelschlitz
d.polygon([(29, 34), (32, 39), (35, 34)], fill=COAT_L, outline=OL)
for y in (41, 44):
    d.point((32, y), fill=COAT_D)

# Linker Arm: Faust schuettelt eifrig auf Brusthoehe (Ellbogen unten, kein erhobener Arm)
d.polygon([(26, 35), (27, 41), (20, 44), (17, 40)], fill=COAT, outline=OL)
d.ellipse((12, 35, 19, 42), fill=FACE, outline=OL)
d.line((14, 37, 14, 39), fill=FACE_D)
d.line((16, 37, 16, 39), fill=FACE_D)
for x0, y0, x1, y1 in [(9, 34, 10, 32), (8, 38, 9, 38), (9, 42, 10, 44)]:  # Schuettel-Striche
    d.line((x0, y0, x1, y1), fill=LINE)
# Rechter Arm zum Megafon-Griff
d.polygon([(38, 35), (37, 41), (43, 39), (44, 34)], fill=COAT, outline=OL)

# Duenner Hals
d.rectangle((30, 31, 34, 35), fill=FACE, outline=OL)

# Segelohren (gross, abstehend) + Riesenkopf
for x0, a0, a1 in ((9, 90, 270), (46, 270, 90)):
    d.ellipse((x0, 10, x0 + 9, 23), fill=FACE, outline=OL)
    d.arc((x0 + 2, 12, x0 + 7, 21), a0, a1, fill=FACE_D)                  # Ohrmuschel aussen
d.ellipse((17, 3, 47, 33), fill=FACE, outline=OL)
d.arc((18, 4, 46, 32), 40, 140, fill=FACE_D)                              # Schatten am Kinn
for x in (21, 43):
    d.line((x, 23, x, 26), fill=FACE_D)                                   # hohle Wangen

# Haare: glatt nach hinten gekaemmt, glaenzend
d.chord((17, 3, 47, 22), 180, 360, fill=HAIR, outline=OL)
d.polygon([(20, 13), (24, 9), (28, 12)], fill=FACE)                       # Geheimratsecken
d.polygon([(36, 12), (40, 9), (44, 13)], fill=FACE)
for x0, y0, x1, y1 in [(26, 10, 24, 6), (32, 10, 32, 6), (38, 10, 40, 6), (21, 10, 20, 8), (43, 10, 44, 8)]:
    d.line((x0, y0, x1, y1), fill=HAIR_L)                                 # Glanzstraehnen, nach hinten gekaemmt

# Augen weit aufgerissen, Brauen hochgezogen
for x0 in (22, 37):
    d.rectangle((x0, 16, x0 + 5, 20), fill=WHITE, outline=OL)
    d.line((x0, 14, x0 + 1, 13), fill=HAIR); d.line((x0 + 2, 13, x0 + 3, 13), fill=HAIR)
    d.line((x0 + 4, 13, x0 + 5, 14), fill=HAIR)                           # hochgezogener Bogen
d.rectangle((25, 17, 26, 18), fill=HAIR)
d.rectangle((40, 17, 41, 18), fill=HAIR)
d.point((22, 22), fill=CHEEK); d.point((23, 22), fill=CHEEK)
d.point((41, 22), fill=CHEEK); d.point((42, 22), fill=CHEEK)

# Nase + aufgerissener Bruellmund
d.rectangle((31, 20, 33, 22), fill=FACE_D)
d.ellipse((25, 23, 35, 31), fill=MOUTH, outline=OL)
d.line((27, 24, 33, 24), fill=WHITE)
d.rectangle((28, 28, 32, 29), fill=TONGUE)

# Megafon: Mundstueck am Mund, Trichter nach rechts unten, Rand als schmale Ellipse
d.polygon([(34, 25), (34, 29), (53, 38), (53, 20)], fill=MEGA, outline=OL)
d.polygon([(35, 28), (53, 37), (53, 31), (35, 27)], fill=MEGA_D)          # Schatten unten
d.line((36, 25, 51, 21), fill=MEGA_L)                                     # Glanzkante
d.ellipse((50, 19, 56, 39), fill=MEGA_D, outline=OL)
d.ellipse((52, 22, 55, 36), fill=MEGA_IN)
d.rectangle((40, 30, 42, 35), fill=MEGA_D, outline=OL)                    # Griff
d.ellipse((39, 33, 44, 38), fill=FACE, outline=OL)                        # Hand am Griff
# Schallstriche
for x0, y0, x1, y1 in [(58, 24, 61, 22), (58, 29, 61, 29), (58, 34, 61, 36)]:
    d.line((x0, y0, x1, y1), fill=MEGA)

# Aussenkontur fuer alles, was noch keine hat (Striche)
src = im.copy(); px, sp = im.load(), src.load()
for y in range(64):
    for x in range(64):
        if sp[x, y][3] == 0 and any(0 <= x + dx < 64 and 0 <= y + dy < 64 and sp[x + dx, y + dy][3]
                                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OL

im.resize((256, 256), Image.NEAREST).save(sys.argv[1], optimize=True)
