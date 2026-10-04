"""Key-color removal for AI-generated pixel-art assets (Ruether GO).

Usage:
  python keying.py IN.png OUT.png [--key FF00FF] [--tol 90] [--size 256] [--margin 0.06]
                                  [--sheet 4x4] [--nocrop]

Pipeline: tolerance mask on the key color -> flood-fill from the four corners
(connected background) -> any enclosed key-colored island above --min-island px
is cleared too (donut holes) -> edge de-spill (key tint pulled out of boundary
pixels) -> crop to subject bbox, pad to square with --margin -> NEAREST resize.
--sheet CxR skips the crop, cuts the full image into equal cells, resizes each
cell to --size and reassembles the grid.
"""
import argparse, sys
from collections import deque
from PIL import Image

def key_mask(px, w, h, key, tol):
    kr, kg, kb = key
    t2 = tol * tol
    m = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i][:3]
        if (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2 <= t2:
            m[i] = 1
    return m

def components(m, w, h):
    """Label 4-connected components of mask; return labels array, list of (size, touches_border)."""
    lab = [0] * (w * h)
    info = []
    n = 0
    for s in range(w * h):
        if not m[s] or lab[s]:
            continue
        n += 1
        size, border = 0, False
        q = deque([s]); lab[s] = n
        while q:
            i = q.popleft(); size += 1
            y, x = divmod(i, w)
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                border = True
            for j in (i - 1 if x > 0 else -1, i + 1 if x < w - 1 else -1, i - w if y > 0 else -1, i + w if y < h - 1 else -1):
                if j >= 0 and m[j] and not lab[j]:
                    lab[j] = n; q.append(j)
        info.append((size, border))
    return lab, info

def despill(img, key):
    """Pull key tint out of boundary pixels: channels that are high in the key but low
    in the other key channel(s) get clamped toward the non-key channel (keeps 70% of the excess off)."""
    kr, kg, kb = key
    hi = [c > 127 for c in key]                 # which channels the key is "high" in
    px = img.load(); w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            ch = [r, g, b]
            lows = [ch[i] for i in range(3) if not hi[i]]
            ref = max(lows) if lows else 0
            if all(ch[i] > ref for i in range(3) if hi[i]):
                lim = ref + (max(ch[i] for i in range(3) if hi[i]) - ref) * 0.3
                ch = [min(ch[i], int(lim)) if hi[i] else ch[i] for i in range(3)]
                px[x, y] = (ch[0], ch[1], ch[2], a)
    return img

def key_out(img, key, tol, min_island=12, soft=40):
    img = img.convert("RGBA"); w, h = img.size
    px = list(img.getdata())
    m = key_mask(px, w, h, key, tol)
    lab, info = components(m, w, h)
    clear = {i + 1 for i, (sz, border) in enumerate(info) if border or sz >= min_island}
    out = []
    kr, kg, kb = key
    for i, p in enumerate(px):
        r, g, b, a = p
        if lab[i] in clear:
            out.append((r, g, b, 0))
        else:
            # soft edge: pixels close (but beyond tol) to key get partial alpha
            d = ((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2) ** 0.5
            if d < tol + soft:
                a = int(255 * (d - tol) / soft)
                out.append((r, g, b, max(0, min(255, a))))
            else:
                out.append((r, g, b, 255))
    img.putdata(out)
    return despill(img, key)

def fit_square(img, size, margin):
    bbox = img.getbbox()
    if not bbox:
        sys.exit("empty image after keying")
    sub = img.crop(bbox)
    side = int(max(sub.size) * (1 + 2 * margin))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(sub, ((side - sub.width) // 2, (side - sub.height) // 2))
    return canvas.resize((size, size), Image.NEAREST)

def sheet(img, cols, rows, size):
    w, h = img.size
    cw, ch = w // cols, h // rows
    out = Image.new("RGBA", (cols * size, rows * size), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            cell = img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)).resize((size, size), Image.NEAREST)
            out.paste(cell, (c * size, r * size))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--key", default="FF00FF"); ap.add_argument("--tol", type=int, default=90)
    ap.add_argument("--size", type=int, default=256); ap.add_argument("--margin", type=float, default=0.06)
    ap.add_argument("--sheet", default=None, help="COLSxROWS: keep grid, resize cells to --size")
    ap.add_argument("--nocrop", action="store_true", help="keep full canvas, just resize to --size square")
    a = ap.parse_args()
    key = tuple(int(a.key[i:i + 2], 16) for i in (0, 2, 4))
    img = key_out(Image.open(a.inp), key, a.tol)
    if a.sheet:
        c, r = map(int, a.sheet.lower().split("x"))
        img = sheet(img, c, r, a.size)
    elif a.nocrop:
        img = img.resize((a.size, a.size), Image.NEAREST)
    else:
        img = fit_square(img, a.size, a.margin)
    img.save(a.out, optimize=True)
    print(a.out, img.size)

def _selfcheck():
    """python keying.py --test : donut on magenta, hole must become transparent."""
    im = Image.new("RGB", (64, 64), (255, 0, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(im); d.ellipse((8, 8, 56, 56), fill=(200, 160, 40)); d.ellipse((24, 24, 40, 40), fill=(250, 5, 250))
    out = key_out(im, (255, 0, 255), 90)
    assert out.getpixel((2, 2))[3] == 0, "corner not keyed"
    assert out.getpixel((32, 32))[3] == 0, "enclosed hole not keyed"
    assert out.getpixel((16, 32))[3] == 255, "subject eaten"
    assert fit_square(out, 32, 0.1).size == (32, 32)
    print("keying selfcheck ok")

if __name__ == "__main__":
    if "--test" in sys.argv:
        _selfcheck()
    else:
        main()
