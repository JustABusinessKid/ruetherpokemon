"""boss-hitler als PIL-Pixelart (beide Bildmodelle haben abgelehnt): kleiner tobender Diktator,
64x64-Raster, 1-px Flaschengruen-Kontur, NEAREST x4 -> 256. Keine Abzeichen, keine Symbole.
Aufruf: python art/boss-hitler.py art/boss-hitler.png"""
import sys
from PIL import Image, ImageDraw

OL = (4, 62, 45, 255)                     # Flaschengruen-Kontur wie im Stil-Satz
FACE, FACE_D = (222, 78, 60, 255), (176, 48, 44, 255)
HAIR, HAIR_L = (24, 24, 30, 255), (70, 72, 84, 255)
JACK, JACK_D, JACK_L = (122, 106, 58, 255), (92, 79, 44, 255), (156, 140, 84, 255)
PANT, BOOT, BOOT_L = (58, 52, 46, 255), (28, 26, 28, 255), (80, 80, 88, 255)
WHITE, MOUTH, TONGUE = (250, 246, 236, 255), (70, 18, 24, 255), (236, 120, 120, 255)
STEAM, STEAM_D = (238, 238, 240, 255), (184, 186, 194, 255)

im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(im)

# Dampfwolken aus den Ohren
for sx in (1, -1):                       # links normal, rechts gespiegelt
    for x0, y0, x1, y1 in [(13, 14, 16, 17), (3, 6, 9, 11), (7, 3, 13, 9), (9, 7, 15, 12)]:
        if sx < 0:
            x0, x1 = 63 - x1, 63 - x0
        d.ellipse((x0, y0, x1, y1), fill=STEAM, outline=STEAM_D)

# Beine: links steht, rechts stampft hoch
d.rectangle((26, 47, 31, 57), fill=PANT, outline=OL)
d.polygon([(33, 47), (38, 47), (42, 52), (38, 55), (33, 51)], fill=PANT, outline=OL)
d.rectangle((23, 56, 32, 60), fill=BOOT, outline=OL)
d.rectangle((24, 57, 27, 57), fill=BOOT_L)
d.polygon([(38, 52), (44, 50), (47, 54), (41, 57)], fill=BOOT, outline=OL)
# Stampf-Striche
for x0, y0 in [(18, 61), (34, 61), (36, 59)]:
    d.line((x0, y0, x0 + 2, y0), fill=STEAM_D)

# Jacke (schlicht, ohne alles) + Aermel nach oben zu den Faeusten
d.polygon([(23, 35), (41, 35), (40, 48), (24, 48)], fill=JACK, outline=OL)
d.line((24, 47, 39, 47), fill=JACK_D)
d.polygon([(28, 35), (32, 40), (36, 35)], fill=JACK_L, outline=OL)       # schlichter Kragen
for y in (42, 45):
    d.point((32, y), fill=JACK_D)                                         # zwei Knoepfe
d.polygon([(23, 35), (27, 41), (16, 33), (11, 29)], fill=JACK, outline=OL)
d.polygon([(41, 35), (37, 41), (48, 33), (53, 29)], fill=JACK, outline=OL)

# Faeuste
for x0 in (9, 48):
    d.ellipse((x0, 24, x0 + 7, 31), fill=FACE, outline=OL)
    d.line((x0 + 2, 26, x0 + 2, 28), fill=FACE_D)                         # Fingerfugen
    d.line((x0 + 4, 26, x0 + 4, 28), fill=FACE_D)
    d.line((x0 + 2, 29, x0 + 5, 29), fill=FACE_D)                         # Daumen
# Zitter-Striche neben den Faeusten
for x0, y0, x1, y1 in [(6, 24, 7, 22), (5, 28, 6, 28), (57, 24, 58, 22), (58, 28, 59, 28)]:
    d.line((x0, y0, x1, y1), fill=STEAM_D)

# Ohren + Kopf (zu gross, knallrot)
d.ellipse((16, 18, 21, 25), fill=FACE, outline=OL)
d.ellipse((43, 18, 48, 25), fill=FACE, outline=OL)
d.ellipse((18, 6, 46, 35), fill=FACE, outline=OL)
d.arc((19, 7, 45, 34), 30, 150, fill=FACE_D)                              # Schatten am Kinn

# Haare: schwarz mit Seitenscheitel rechts, Tolle quer ueber die Stirn nach links
d.chord((18, 6, 46, 26), 180, 360, fill=HAIR, outline=OL)
d.polygon([(37, 10), (20, 12), (19, 20), (23, 21), (29, 16), (36, 14)], fill=HAIR)   # Tolle ueber die Stirn
d.line((38, 7, 39, 12), fill=HAIR_L)                                      # Scheitel
d.line((24, 9, 33, 8), fill=HAIR_L)
d.line((21, 14, 26, 13), fill=HAIR_L)

# Augen: weiss, Pupillen zur Mitte, Brauen wuetend nach unten
for x0 in (24, 36):
    d.rectangle((x0, 21, x0 + 4, 23), fill=WHITE, outline=OL)
d.rectangle((27, 22, 28, 23), fill=HAIR)
d.rectangle((36, 22, 37, 23), fill=HAIR)
d.line((22, 17, 29, 20), fill=HAIR, width=2)
d.line((42, 17, 35, 20), fill=HAIR, width=2)

# Nase, Zweifingerbart, schreiender Mund
d.rectangle((31, 23, 33, 25), fill=FACE_D)
d.rectangle((30, 26, 34, 27), fill=HAIR)
d.ellipse((27, 28, 37, 33), fill=MOUTH, outline=OL)
d.line((29, 29, 35, 29), fill=WHITE)
d.rectangle((30, 31, 34, 32), fill=TONGUE)

# Aussenkontur fuer alles, was noch keine hat (Dampf)
src = im.copy(); px, sp = im.load(), src.load()
for y in range(64):
    for x in range(64):
        if sp[x, y][3] == 0 and any(0 <= x + dx < 64 and 0 <= y + dy < 64 and sp[x + dx, y + dy][3]
                                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OL

im.resize((256, 256), Image.NEAREST).save(sys.argv[1], optimize=True)
