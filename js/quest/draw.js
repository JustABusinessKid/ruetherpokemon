// Haunebu-Quests: Zeichen-Bausteine für view.js. Kacheln prozedural im Pixel-Stil (16×16-Raster je 32-px-Kachel),
// einmal pro Start in ein Offscreen-Canvas gemalt; Türen, Objekte, Figuren und Effekte zeichnet view.js pro Bild darüber.
// Bilder: Cache mit Promise, Tönungen/Graustufen einmal pro Bild vorberechnet. Keine Symbole, nur Eis, Beton, Regale, Ziegel.
import { tileAt } from './engine.js';

export const TILE = 32;
const P = 2; // ein Kunst-Pixel = 2 px
export const INK = '#1E2A22', PAPER = '#F4E8C8', GOLD = '#F2C94C';
export const RARITY_COLOR = { normal: '#9AA0A6', selten: '#3F8EF5', episch: '#A24FE0', legendaer: '#F2C94C' };

// Paletten je Handlungsort (Spec §5.5): f Boden, w Wand (oben, Front, dunkel, Licht), v Deckung, d Tür
export const THEMES = {
  neuschwabenland: { bg: '#14223a', floor: 'snow', wall: 'ice', cover: 'ice', f1: '#dfe9f1', f2: '#d1dee9', fd: '#adc2d6', w1: '#86afd6', w2: '#4f7aa6', w3: '#2d4b70', wl: '#c3e0f6', v1: '#c4ebf7', v2: '#86cbe4', v3: '#3f86ad', d1: '#7b8794', d2: '#4a545e' },
  hangar: { bg: '#15181d', floor: 'concrete', wall: 'steel', cover: 'crate', f1: '#8f949a', f2: '#868b91', fd: '#6c7177', w1: '#6a7380', w2: '#3d4550', w3: '#262c34', wl: '#8e98a5', v1: '#b07a3e', v2: '#8a5a2b', v3: '#4e3218', d1: '#8b939c', d2: '#565e67' },
  pcsale: { bg: '#2a2218', floor: 'lino', wall: 'shelf', cover: 'box', f1: '#d8c9a3', f2: '#cbb991', fd: '#ad9d77', w1: '#8a5d36', w2: '#5a3a1e', w3: '#3d2612', wl: '#a87a4c', v1: '#c99f68', v2: '#a47b48', v3: '#5e4426', d1: '#9aa3ab', d2: '#5f676f' },
  keller: { bg: '#1c1512', floor: 'stone', wall: 'brick', cover: 'crate', f1: '#7a6d60', f2: '#6c6055', fd: '#4f453d', w1: '#5e3a2c', w2: '#8a4832', w3: '#4a2418', wl: '#b0664a', v1: '#8d6a44', v2: '#6b4e30', v3: '#3a2817', d1: '#7d7468', d2: '#4d463e' },
};
const BOXES = ['#B03B2B', '#3F8EF5', '#2F6B4F', '#E0A52B', '#3FC1B0', '#F4E8C8'];

// deterministisches Rauschen je Kachel
export const hash = (x, y, k = 0) => {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(k + 3, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------- Bilder ----------
const imgs = new Map();
export function loadImg(src) {
  if (!imgs.has(src)) {
    const im = new Image();
    im.decoding = 'async';
    const p = new Promise(res => { im.onload = () => res(im); im.onerror = () => res(null); });
    im.src = src;
    imgs.set(src, { im, p });
  }
  return imgs.get(src).p;
}
// geladenes Bild oder null (noch nicht da / fehlt)
export const img = src => { const e = imgs.get(src); return e && e.im.complete && e.im.naturalWidth ? e.im : null; };

// Getönte bzw. graue Kopie (einmal je Bild und Art): 'grey' Graustufen, sonst Farbe mit Deckkraft über den Pixeln
const variants = new Map();
export function variant(src, kind, color = '#5BB55A', alpha = 0.45) {
  const key = `${src}|${kind}|${color}|${alpha}`;
  if (variants.has(key)) return variants.get(key);
  const im = img(src);
  if (!im) return null;
  const s = Math.min(128, im.naturalWidth), c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0, s, s);
  if (kind === 'grey') {
    const d = g.getImageData(0, 0, s, s), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * 0.8 + 30; a[i] = a[i + 1] = a[i + 2] = l; }
    g.putImageData(d, 0, 0);
  } else {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, s, s);
  }
  variants.set(key, c);
  return c;
}

// ---------- Karte ----------
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x * P, y * P, w * P, h * P); };

function floor(g, t, x, y) {
  const r = (k) => hash(x, y, k);
  if (t.floor === 'lino') {
    px(g, (x + y) % 2 ? t.f1 : t.f2, 0, 0, 16, 16);
    px(g, t.fd, 0, 0, 16, 1); px(g, t.fd, 0, 0, 1, 16);
    if (r(1) < 0.15) px(g, t.fd, 4 + Math.floor(r(2) * 8), 4 + Math.floor(r(3) * 8), 2, 1); // Schuhabdruck
    return;
  }
  if (t.floor === 'stone') {
    for (let k = 0; k < 4; k++) px(g, r(k) < 0.5 ? t.f1 : t.f2, (k % 2) * 8, (k >> 1) * 8, 8, 8);
    px(g, t.fd, 0, 0, 16, 1); px(g, t.fd, 0, 8, 16, 1); px(g, t.fd, (y % 2) * 4, 0, 1, 8); px(g, t.fd, 8 + (y % 2) * 4, 8, 1, 8);
    if (r(5) < 0.2) px(g, t.fd, 3 + Math.floor(r(6) * 10), 3 + Math.floor(r(7) * 10), 1, 1);
    return;
  }
  px(g, t.f1, 0, 0, 16, 16);
  if (t.floor === 'concrete') {
    if (x % 3 === 0) px(g, t.fd, 0, 0, 1, 16);
    if (y % 3 === 0) px(g, t.fd, 0, 0, 16, 1);
    if (r(1) < 0.12) { px(g, t.f2, 5, 6, 5, 3); px(g, t.fd, 6, 7, 3, 1); } // Ölfleck
    for (let k = 0; k < 3; k++) px(g, t.f2, Math.floor(r(k + 2) * 16), Math.floor(r(k + 5) * 16));
    return;
  }
  // Schnee: Flocken und kleine Verwehungen
  for (let k = 0; k < 5; k++) px(g, r(k + 9) < 0.5 ? t.f2 : t.fd, Math.floor(r(k) * 16), Math.floor(r(k + 20) * 16));
  if (r(40) < 0.18) px(g, t.f2, 2 + Math.floor(r(41) * 9), 3 + Math.floor(r(42) * 9), 5, 1);
}

function wall(g, t, st, x, y) {
  const isW = (dx, dy) => tileAt(st, x + dx, y + dy) === '#';
  const front = y + 1 < st.h && !isW(0, 1); // darunter offen: Vorderseite zeigen
  const r = k => hash(x, y, k);
  px(g, t.w1, 0, 0, 16, 16);
  // Oberseite
  if (t.wall === 'ice') { for (let k = 0; k < 3; k++) px(g, t.wl, Math.floor(r(k) * 14), Math.floor(r(k + 3) * 9), 2, 1); }
  else if (t.wall === 'steel') { px(g, t.w2, 0, 7, 16, 1); px(g, t.wl, 2, 2); px(g, t.wl, 13, 2); px(g, t.wl, 2, 11); px(g, t.wl, 13, 11); }
  else if (t.wall === 'shelf') { px(g, t.w2, 0, 4, 16, 1); px(g, t.w2, 0, 10, 16, 1); px(g, t.wl, Math.floor(r(1) * 12), 1, 3, 1); }
  else { px(g, t.w3, 0, 5, 16, 1); px(g, t.w3, 0, 11, 16, 1); px(g, t.w3, (y % 2) * 6 + 3, 0, 1, 5); px(g, t.w3, (y % 2) * 6 + 9, 6, 1, 5); }
  if (front) {
    px(g, t.w2, 0, 10, 16, 6);
    if (t.wall === 'ice') { px(g, t.wl, 0, 10, 16, 1); px(g, t.w3, (x % 2) * 8, 11, 1, 5); px(g, t.w3, 0, 13, 16, 1); }
    else if (t.wall === 'steel') { for (let k = 1; k < 16; k += 4) px(g, t.w3, k, 11, 1, 5); px(g, '#E0A52B', 0, 15, 16, 1); for (let k = 0; k < 16; k += 4) px(g, INK, k, 15, 2, 1); }
    else if (t.wall === 'shelf') { // Regalbrett mit Waren
      px(g, t.w3, 0, 15, 16, 1);
      for (let k = 0; k < 3; k++) { const c = BOXES[Math.floor(r(k + 10) * BOXES.length)], w = 3 + Math.floor(r(k + 13) * 2); px(g, c, 1 + k * 5, 15 - 3, w, 3); px(g, INK, 1 + k * 5, 11, w, 1); }
    } else { for (let row = 0; row < 2; row++) { px(g, t.w3, 0, 12 + row * 2, 16, 1); for (let k = (row + x) % 2 * 2; k < 16; k += 4) px(g, t.w3, k, 10 + row * 2, 1, 2); } px(g, t.wl, 0, 10, 16, 1); }
    px(g, t.w3, 0, 15, 16, 1);
  }
  // harte Ink-Kanten zum Boden hin
  if (!isW(0, -1)) px(g, INK, 0, 0, 16, 1);
  if (!isW(-1, 0)) px(g, INK, 0, 0, 1, 16);
  if (!isW(1, 0)) px(g, INK, 15, 0, 1, 16);
  if (front) px(g, INK, 0, 15, 16, 1);
}

function cover(g, t, x, y) {
  const r = k => hash(x, y, k + 50);
  g.fillStyle = 'rgba(30,42,34,.28)'; g.fillRect(6, 24, 22, 4); // harter Schatten
  if (t.cover === 'ice') { // Eiskristalle mit Spitze, auf einer Schneewehe
    const shard = (ox, h) => {
      for (let c = 0; c < 5; c++) {
        const ch = h - Math.abs(c - 2) * 2, top = 13 - ch;
        px(g, t.v3, ox + c, top - 1, 1, ch + 1);
        if (c > 0 && c < 4) px(g, c === 1 ? PAPER : c === 3 ? t.v2 : t.v1, ox + c, top, 1, ch);
      }
    };
    shard(1, 6 + Math.floor(r(1) * 3)); shard(5, 9 + Math.floor(r(2) * 3)); shard(9, 5 + Math.floor(r(3) * 3));
    px(g, t.f2, 1, 13, 14, 2); px(g, t.fd, 2, 15, 12, 1);
    return;
  }
  if (t.cover === 'box') { // Kartons, gestapelt
    const box = (ox, oy, w, h) => { px(g, t.v3, ox, oy, w, h); px(g, t.v1, ox + 1, oy + 1, w - 2, h - 2); px(g, t.v2, ox + 1, oy + h - 3, w - 2, 1); px(g, PAPER, ox + Math.floor(w / 2) - 1, oy + 1, 2, h - 2); };
    box(1, 6, 8, 8); box(8, 7, 7, 7); if (r(1) < 0.6) box(4, 1, 7, 6);
    return;
  }
  // Holzkiste mit Strebe
  px(g, t.v3, 2, 2, 12, 12); px(g, t.v1, 3, 3, 10, 10); px(g, t.v2, 3, 6, 10, 1); px(g, t.v2, 3, 9, 10, 1);
  for (let k = 0; k < 10; k++) px(g, t.v3, 3 + k, r(1) < 0.5 ? 3 + k : 12 - k);
  px(g, t.v3, 2, 2, 12, 1);
}

// Statische Karte: Boden, Wände, Deckung, Plattform (q-pad über dem P-Block). Türen und Objekte zeichnet view.js.
export function paintMap(st, t) {
  const c = document.createElement('canvas');
  c.width = st.w * TILE; c.height = st.h * TILE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const ch = st.tiles[y * st.w + x];
    g.save(); g.translate(x * TILE, y * TILE);
    if (ch === '#') wall(g, t, st, x, y);
    else { floor(g, t, x, y); if (ch === '~') cover(g, t, x, y); }
    g.restore();
  }
  if (st.pads.length) {
    const xs = st.pads.map(p => p.x), ys = st.pads.map(p => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
    const pad = img('art/q-pad.png');
    if (pad) g.drawImage(pad, x0 * TILE - 4, y0 * TILE - 4, w * TILE + 8, h * TILE + 8);
    else { g.fillStyle = '#9aa0a6'; g.fillRect(x0 * TILE, y0 * TILE, w * TILE, h * TILE); }
  }
  return c;
}

// Tür in waagrechter Wand (Wand links/rechts)?
export const doorHoriz = (st, d) => tileAt(st, d.x - 1, d.y) === '#' || tileAt(st, d.x + 1, d.y) === '#';

// Tür: k = 0 zu … 1 offen; locked zeigt die rote Lampe, öffnend blinkt sie gelb, offen grün
export function drawDoor(g, t, d, horiz, k, locked, now) {
  g.save();
  g.translate(d.x * TILE, d.y * TILE);
  if (!horiz) { g.translate(TILE, 0); g.rotate(Math.PI / 2); }
  const half = Math.round(8 * (1 - k)); // Flügelbreite in Kunst-Pixeln
  px(g, INK, 0, 5, 1, 6); px(g, INK, 15, 5, 1, 6); // Zarge
  if (half > 0) {
    for (const [x0, w] of [[0, half], [16 - half, half]]) {
      px(g, INK, x0, 5, w, 6); px(g, t.d1, x0, 6, w, 3); px(g, t.d2, x0, 9, w, 1);
      if (w > 2) px(g, t.d2, x0 + (x0 ? 1 : w - 2), 7, 1, 2);
    }
  }
  const lamp = locked && k === 0 ? '#E0634C' : k < 1 ? (Math.floor(now / 120) % 2 ? GOLD : '#7a6a2a') : '#5BB55A';
  if (locked || k < 1) { px(g, INK, 7, 3, 2, 2); px(g, lamp, 7, 3, 2, 2); }
  g.restore();
}

// Echtes Gesicht im Seltenheitsrahmen (eckig): Mitte x/y, size = Außenmaß in Weltpixeln
export function faceFrame(g, face, x, y, size, rarity, { grey = false, src = '' } = {}) {
  const s = Math.round(size), x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2);
  g.fillStyle = INK; g.fillRect(x0 - 1, y0 - 1, s + 2, s + 2);
  g.fillStyle = RARITY_COLOR[rarity] || RARITY_COLOR.normal; g.fillRect(x0, y0, s, s);
  const im = grey ? variant(src, 'grey') : face;
  g.fillStyle = '#E8D7A8'; g.fillRect(x0 + 2, y0 + 2, s - 4, s - 4);
  if (im) { g.imageSmoothingEnabled = true; g.drawImage(im, x0 + 2, y0 + 2, s - 4, s - 4); g.imageSmoothingEnabled = false; }
}

// Pixel-Bitmaps für Herzen und Sterne (1 = Pixel)
const BITMAPS = { heart: ['01010', '11111', '11111', '01110', '00100'], star: ['00100', '01110', '11011', '01110', '00100'], spark: ['10001', '01010', '00100', '01010', '10001'], plus: ['00100', '00100', '11111', '00100', '00100'] };
export function bitmap(g, kind, x, y, s, color) {
  const b = BITMAPS[kind];
  g.fillStyle = color;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (b[r][c] === '1') g.fillRect(Math.round(x + (c - 2.5) * s), Math.round(y + (r - 2.5) * s), Math.ceil(s), Math.ceil(s));
}

// Sprechblase im Bildschirmraum: Papier, Ink-Rand, Zipfel unten mittig auf (x,y); head = Kopf-Oberkante des Sprechers (y)
// avoid: Gesichter und schon gezeichnete Blasen; überlappt die neue, rutscht sie darüber (nie über den oberen Rand)
// und zeigt statt des Zipfels einen Pixel-Stiel bis zum Sprecher, damit sie nicht wie der Spruch eines anderen aussieht.
export function bubble(g, x, y, text, { maxW = 170, font = '800 12px Nunito, system-ui, sans-serif', bg = PAPER, fg = INK, vw = 9999, avoid = [], head = y } = {}) {
  g.font = font;
  const words = String(text).split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t2 = cur ? `${cur} ${w}` : w; if (g.measureText(t2).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t2; }
  if (cur) lines.push(cur);
  const lh = 15, w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width))) + 14, h = lines.length * lh + 8;
  const bx = Math.round(Math.max(4, Math.min(vw - w - 4, x - w / 2))), by0 = Math.round(y - h - 8);
  let by = by0;
  for (let k = 0; k < 6; k++) {
    const hit = avoid.find(r => bx < r.x + r.w + 4 && bx + w + 4 > r.x && by < r.y + r.h + 4 && by + h + 4 > r.y);
    if (!hit) break;
    by = hit.y - h - 6;
  }
  by = Math.max(4, by);
  avoid.push({ x: bx, y: by, w, h });
  const tx = Math.round(Math.max(bx + 6, Math.min(bx + w - 10, x - 2)));
  const sh = Math.round(head - by - h);
  if (by !== by0 && sh > 4) { // Stiel bis auf den Kopf (Ink außen, Papier innen), seitlich an fremden Gesichtern vorbei
    const f = avoid.find(r => r.y + r.h > by + h && r.y < head - 4 && tx + 3 > r.x && tx - 1 < r.x + r.w);
    const sx = !f ? tx : Math.round(Math.max(bx + 2, Math.min(bx + w - 6, x < f.x + f.w / 2 ? f.x - 5 : f.x + f.w + 2)));
    const fy = by + h + sh - 4, x0 = Math.min(sx, tx), x1 = Math.max(sx, tx);
    g.fillStyle = INK; g.fillRect(sx - 1, by + h, 4, sh); g.fillRect(x0 - 3, fy, x1 - x0 + 8, 4);
    g.fillStyle = bg; g.fillRect(sx, by + h, 2, sh - 3); g.fillRect(x0 - 1, fy + 1, x1 - x0 + 4, 2);
  }
  g.fillStyle = INK; g.fillRect(bx - 2, by - 2, w + 4, h + 4); g.fillRect(bx + 2, by + 2, w + 4, h + 4);
  g.fillStyle = bg; g.fillRect(bx, by, w, h);
  if (by === by0) {
    g.fillStyle = INK; g.fillRect(tx - 2, by + h, 8, 4); g.fillRect(tx, by + h + 4, 4, 4);
    g.fillStyle = bg; g.fillRect(tx, by + h, 4, 4);
  }
  g.fillStyle = fg; g.textBaseline = 'top'; g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, bx + 7, by + 5 + i * lh));
}

// Gedithertes Muster (2 Farben im 2-px-Schachbrett) für Gas und Kegel-Kanten
export function dither(g, a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 4, 4);
  x.fillStyle = b; x.fillRect(0, 0, 2, 2); x.fillRect(2, 2, 2, 2);
  return g.createPattern(c, 'repeat');
}
