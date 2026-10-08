"""boss-himmler als PIL-Pixelart (Stil wie boss-hitler.py): nervoes schwitzender Lakai mit kleiner runder Brille,
fliehendem Kinn und Baertchen, klammert sich an ein Klemmbrett. 64x64-Raster, 1-px Flaschengruen-Kontur, NEAREST x4 -> 256.
Schlichter dunkelgrauer Mantel, keine Abzeichen, keine Symbole. Aufruf: python art/boss-himmler.py art/boss-himmler.png"""
import sys
from PIL import Image, ImageDraw

OL = (4, 62, 45, 255)                     # Flaschengruen-Kontur wie im Stil-Satz
FACE, FACE_D = (244, 204, 170, 255), (212, 160, 128, 255)
HAIR, HAIR_L, STUBBLE = (62, 46, 36, 255), (110, 86, 66, 255), (206, 172, 144, 255)
COAT, COAT_D, COAT_L = (74, 78, 90, 255), (52, 55, 64, 255), (106, 110, 124, 255)
PANT, SHOE, SHOE_L = (104, 108, 122, 255), (28, 26, 28, 255), (80, 80, 88, 255)
WHITE, LENS, RIM = (250, 246, 236, 255), (196, 232, 244, 255), (150, 156, 170, 255)
BOARD, BOARD_D, CLIP, INK = (214, 120, 44, 255), (168, 84, 30, 255), (200, 204, 214, 255), (150, 156, 170, 255)
SWEAT, SWEAT_L = (96, 186, 246, 255), (220, 244, 255, 255)
LINE = (184, 186, 194, 255)

im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(im)

# Schweisstropfen fliegen vom Kopf
for x0, y0 in [(10, 7), (52, 5), (55, 17), (8, 19)]:
    d.polygon([(x0 + 1, y0), (x0 + 4, y0 + 4), (x0 + 3, y0 + 6), (x0, y0 + 6), (x0 - 2, y0 + 4)], fill=SWEAT)
    d.rectangle((x0, y0 + 3, x0, y0 + 4), fill=SWEAT_L)

# Beine: eng zusammen, schlottern
d.rectangle((26, 51, 31, 57), fill=PANT, outline=OL)
d.rectangle((33, 51, 38, 57), fill=PANT, outline=OL)
d.rectangle((22, 56, 31, 60), fill=SHOE, outline=OL)
d.rectangle((33, 56, 42, 60), fill=SHOE, outline=OL)
d.line((23, 57, 25, 57), fill=SHOE_L)
d.line((39, 57, 41, 57), fill=SHOE_L)
for x0, y0, x1, y1 in [(20, 52, 21, 54), (18, 55, 19, 57), (44, 52, 43, 54), (46, 55, 45, 57)]:  # Schlotter-Striche
    d.line((x0, y0, x1, y1), fill=LINE)

# Mantel (schlicht, ohne alles)
d.polygon([(22, 34), (42, 34), (43, 52), (21, 52)], fill=COAT, outline=OL)
d.line((22, 51, 42, 51), fill=COAT_D)
d.polygon([(28, 34), (32, 38), (36, 34)], fill=COAT_L, outline=OL)       # schlichter Kragen
# Aermel zu den Haenden am Klemmbrett
d.polygon([(22, 35), (18, 40), (21, 45), (25, 42)], fill=COAT, outline=OL)
d.polygon([(42, 35), (46, 40), (43, 45), (39, 42)], fill=COAT, outline=OL)

# Klemmbrett vor der Brust, Papier mit Kritzel-Zeilen (keine Schrift)
d.rectangle((25, 37, 39, 52), fill=BOARD, outline=OL)
d.line((26, 51, 38, 51), fill=BOARD_D)
d.rectangle((27, 40, 37, 50), fill=WHITE, outline=OL)
for y, x1 in [(42, 35), (44, 33), (46, 36), (48, 32)]:
    d.line((29, y, x1, y), fill=INK)
d.rectangle((29, 36, 35, 39), fill=CLIP, outline=OL)
d.line((31, 37, 33, 37), fill=WHITE)
# Haende klammern seitlich
d.ellipse((20, 41, 26, 47), fill=FACE, outline=OL)
d.ellipse((38, 41, 44, 47), fill=FACE, outline=OL)

# Ohren + Kopf: oben breit, unten schmal ins fliehende Kinn
d.ellipse((15, 16, 21, 24), fill=FACE, outline=OL)
d.ellipse((43, 16, 49, 24), fill=FACE, outline=OL)
d.ellipse((23, 16, 41, 36), fill=FACE, outline=OL)                        # schmales Untergesicht
d.ellipse((18, 5, 46, 31), fill=FACE, outline=OL)
d.ellipse((24, 17, 40, 35), fill=FACE)                                    # Naht zwischen beiden Ovalen weg
d.arc((24, 22, 40, 35), 30, 150, fill=FACE_D)                             # Kinn verlaeuft in den Hals

# Haare: kurz, Seitenscheitel links, Seiten ausrasiert
d.chord((18, 5, 46, 24), 180, 360, fill=HAIR, outline=OL)
d.polygon([(19, 14), (19, 11), (24, 9), (30, 11), (44, 11), (45, 14)], fill=HAIR)
d.rectangle((19, 14, 20, 17), fill=STUBBLE)
d.rectangle((44, 14, 45, 17), fill=STUBBLE)
d.line((25, 6, 26, 10), fill=HAIR_L)                                      # Scheitel
for x0, y0, x1, y1 in [(28, 8, 38, 7), (31, 10, 41, 9)]:
    d.line((x0, y0, x1, y1), fill=HAIR_L)
# Schweiss auf der Stirn
d.polygon([(39, 12), (40, 14), (39, 15), (38, 14)], fill=SWEAT)
d.point((38, 14), fill=SWEAT_L)

# Brauen besorgt (innen hoch), kleine runde Brille, Pupillen huschen zur Seite
d.line((22, 16, 27, 14), fill=HAIR)
d.line((37, 14, 42, 16), fill=HAIR)
for x0 in (22, 36):
    d.ellipse((x0, 17, x0 + 6, 23), fill=LENS, outline=RIM)
    d.point((x0 + 4, 18), fill=WHITE)                                     # Glanz
d.line((29, 20, 35, 20), fill=RIM)                                        # Steg
d.line((19, 19, 21, 19), fill=RIM)
d.line((43, 19, 45, 19), fill=RIM)
d.rectangle((23, 20, 24, 21), fill=HAIR)
d.rectangle((37, 20, 38, 21), fill=HAIR)

# Nase, Baertchen, zusammengebissenes Angst-Grinsen
d.rectangle((31, 22, 32, 24), fill=FACE_D)
d.rectangle((30, 25, 33, 25), fill=HAIR)
d.rectangle((27, 27, 36, 30), fill=WHITE, outline=OL)
d.line((28, 28, 35, 28), fill=FACE_D)
for x in (29, 31, 33):
    d.line((x, 28, x, 29), fill=FACE_D)

# Aussenkontur fuer alles, was noch keine hat (Striche, Brillenbuegel)
src = im.copy(); px, sp = im.load(), src.load()
for y in range(64):
    for x in range(64):
        if sp[x, y][3] == 0 and any(0 <= x + dx < 64 and 0 <= y + dy < 64 and sp[x + dx, y + dy][3]
                                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = OL

im.resize((256, 256), Image.NEAREST).save(sys.argv[1], optimize=True)
