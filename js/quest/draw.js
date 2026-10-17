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
  // v9 §5: edge = Kartenrand als Hecke/Wald; cone/coneK = Farbe und Stärke ruhiger Kegel (grün auf Gras wäre unsichtbar); fl Blüten/Laub, q Wasser, k Kies, s Ufer, t Baumkrone (ta Herbst), h Hecke, p Holzsteg, c Wohnwagen
  mosel: { bg: '#1b2e1c', floor: 'grass', wall: 'camp', cover: 'tent', edge: true, cone: '#F4E8C8', coneK: 1.8, f1: '#86b552', f2: '#7aa94a', fd: '#5f8f3a', fl: '#F4E8C8', w1: '#b8573d', w2: '#e8dcc0', w3: '#7e3426', wl: '#d98366', wf: '#bfae8c', v1: '#4e8a35', v2: '#b07a20', v3: '#6b3a7a', d1: '#9a8a70', d2: '#5e5240', q1: '#2f6f9f', q2: '#3a7fb2', q3: '#5c9fcf', ql: '#bfe3f5', k1: '#cfc4a6', k2: '#b8ab8a', k3: '#8f8468', s1: '#e2cf98', s2: '#cdb87e', t1: '#6aa845', t2: '#3f7a34', t3: '#25521f', tr: '#6b4423', h1: '#3f7a34', h2: '#2f6128', h3: '#1d461b', hl: '#5c9a45', p1: '#b08250', p2: '#7d5530', c1: '#f1ece0', c2: '#cfc8b6', c3: '#9a9384' },
  bruch: { bg: '#141f17', floor: 'moss', wall: 'wood', cover: 'reed', edge: true, cone: '#F4E8C8', coneK: 1.8, f1: '#5f8a45', f2: '#567f3f', fd: '#3f6630', fl: '#c8902f', w1: '#5e4a2a', w2: '#8a5d36', w3: '#3a2c18', wl: '#7d6640', wf: '#5a3a1e', v1: '#a8b85a', v2: '#6f8f3a', v3: '#8a7a3a', d1: '#8a6a44', d2: '#5a4128', q1: '#1f4a48', q2: '#2a5c58', q3: '#3d7a70', ql: '#9ccfb8', lily: '#5BB55A', k1: '#8a7a58', k2: '#76684a', k3: '#5a4f38', s1: '#6b5a3a', s2: '#574a30', t1: '#7ab04a', t2: '#467a30', t3: '#264a1c', ta: '#c8902f', tr: '#5a3a1e', h1: '#2f5a26', h2: '#24491f', h3: '#163316', hl: '#467a30', p1: '#9a7046', p2: '#6b4a2a' },
};
// Rückfall für neue Kacheln (W, T) in alten Paletten
const T0 = { fl: '#F4E8C8', q1: '#2f6f9f', q2: '#3a7fb2', q3: '#5c9fcf', ql: '#bfe3f5', k1: '#cfc4a6', k2: '#b8ab8a', k3: '#8f8468', s1: '#e2cf98', s2: '#cdb87e', t1: '#6aa845', t2: '#3f7a34', t3: '#25521f', tr: '#6b4423', h1: '#3f7a34', h2: '#2f6128', h3: '#1d461b', hl: '#5c9a45', p1: '#b08250', p2: '#7d5530', c1: '#f1ece0', c2: '#cfc8b6', c3: '#9a9384' };
const BOXES = ['#B03B2B', '#3F8EF5', '#2F6B4F', '#E0A52B', '#3FC1B0', '#F4E8C8'];
const TENTS = ['#E0A52B', '#3F8EF5', '#B03B2B', '#5BB55A', '#3FC1B0', '#F2C94C'];
const STRIPES = ['#3FC1B0', '#E0A52B', '#B03B2B', '#3F8EF5'];

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

function floor(g, t, st, x, y) {
  const r = (k) => hash(x, y, k);
  if (t.floor === 'grass' || t.floor === 'moss') return ground(g, t, st, x, y);
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

// ---------- v9: Mosel und Bruch ----------
const inner = (st, x, y) => x > 0 && y > 0 && x < st.w - 1 && y < st.h - 1; // Rand-# = Hecke/Wald, innen = Gebäude
const near4 = (st, x, y, f) => f(tileAt(st, x - 1, y), x - 1, y) || f(tileAt(st, x + 1, y), x + 1, y) || f(tileAt(st, x, y - 1), x, y - 1) || f(tileAt(st, x, y + 1), x, y + 1);
// Steg: Boden zwischen zwei Wasserkanten, höchstens 2 Kacheln breit. 'v' = Steg läuft senkrecht, 'h' = waagrecht, '' = kein Steg
function steg(st, x, y) {
  const run = (dx, dy) => {
    let a = 0, b = 0;
    while (a < 2 && tileAt(st, x - dx * (a + 1), y - dy * (a + 1)) === '.') a++;
    while (b < 2 && tileAt(st, x + dx * (b + 1), y + dy * (b + 1)) === '.') b++;
    return a + b < 2 && tileAt(st, x - dx * (a + 1), y - dy * (a + 1)) === 'W' && tileAt(st, x + dx * (b + 1), y + dy * (b + 1)) === 'W';
  };
  return run(1, 0) ? 'v' : run(0, 1) ? 'h' : '';
}

// Gras (Mosel) bzw. Moos (Bruch); am Wasser Sand/Matsch, an Gebäuden Kies, zwischen Wasser ein Holzsteg
function ground(g, t, st, x, y) {
  const r = k => hash(x, y, k), s = steg(st, x, y);
  if (s) {
    px(g, t.p2, 0, 0, 16, 16);
    for (let k = 0; k < 4; k++) { if (s === 'v') px(g, t.p1, 0, k * 4, 16, 3); else px(g, t.p1, k * 4, 0, 3, 16); }
    for (let k = 0; k < 4; k++) if (s === 'v') { px(g, t.p2, 2, k * 4 + 1); px(g, t.p2, 13, k * 4 + 1); } else { px(g, t.p2, k * 4 + 1, 2); px(g, t.p2, k * 4 + 1, 13); }
    if (tileAt(st, x - 1, y) === 'W') px(g, INK, 0, 0, 1, 16);
    if (tileAt(st, x + 1, y) === 'W') px(g, INK, 15, 0, 1, 16);
    if (tileAt(st, x, y + 1) === 'W') px(g, INK, 0, 15, 16, 1);
    return;
  }
  if (near4(st, x, y, c => c === 'W')) {
    px(g, t.s1, 0, 0, 16, 16);
    for (let k = 0; k < 6; k++) px(g, t.s2, Math.floor(r(k) * 15), Math.floor(r(k + 9) * 15), 2, 1);
    return;
  }
  if (near4(st, x, y, (c, nx, ny) => c === 'D' || c === 'L' || (c === '#' && inner(st, nx, ny)))) {
    px(g, t.k1, 0, 0, 16, 16);
    for (let k = 0; k < 10; k++) px(g, r(k + 30) < 0.5 ? t.k2 : t.k3, Math.floor(r(k) * 16), Math.floor(r(k + 12) * 16));
    return;
  }
  px(g, t.f1, 0, 0, 16, 16);
  for (let k = 0; k < 4; k++) if (r(k + 40) < 0.4) px(g, t.f2, (k % 2) * 8, (k >> 1) * 8, 8, 8);
  for (let k = 0; k < 5; k++) { const hx = Math.floor(r(k) * 15), hy = 2 + Math.floor(r(k + 5) * 13); px(g, t.fd, hx, hy, 1, 2); px(g, t.fd, hx + 1, hy - 1); }
  if (r(60) < 0.16) { const fx = 2 + Math.floor(r(61) * 11), fy = 2 + Math.floor(r(62) * 11); px(g, t.fl, fx, fy); px(g, t.fl, fx + 2, fy + 1); px(g, GOLD, fx + 1, fy + 3); }
}

function water(g, t, st, x, y) {
  const r = k => hash(x, y, k), land = (dx, dy) => { const c = tileAt(st, x + dx, y + dy); return c !== 'W' && c !== 'V'; };
  px(g, t.q2, 0, 0, 16, 16);
  for (let k = 0; k < 3; k++) { const wx = Math.floor(r(k) * 12), wy = 2 + Math.floor(r(k + 3) * 12); px(g, t.q3, wx, wy, 3, 1); px(g, t.q1, wx + 1, wy + 1, 3, 1); }
  if (t.lily && r(20) < 0.1) { const lx = 3 + Math.floor(r(21) * 8), ly = 3 + Math.floor(r(22) * 8); px(g, INK, lx - 1, ly, 6, 3); px(g, t.lily, lx, ly, 4, 2); px(g, t.q2, lx + 2, ly, 1, 1); }
  if (land(0, -1)) { px(g, t.ql, 0, 0, 16, 1); px(g, t.q3, 0, 1, 16, 1); }
  if (land(0, 1)) px(g, t.q1, 0, 15, 16, 1);
  if (land(-1, 0)) px(g, t.ql, 0, 0, 1, 16);
  if (land(1, 0)) px(g, t.ql, 15, 0, 1, 16);
}

// Hecke (T-Reihen, dark = Kartenrand): Blattbüschel, Ink nur an offenen Seiten
function hedge(g, t, x, y, same, dark) {
  const r = k => hash(x, y, k + 70), c1 = dark ? t.h2 : t.h1, c2 = dark ? t.h3 : t.h2, cl = dark ? t.h1 : t.hl;
  px(g, c1, 0, 0, 16, 16);
  for (let k = 0; k < 7; k++) px(g, r(k) < 0.5 ? c2 : cl, Math.floor(r(k + 10) * 13), Math.floor(r(k + 20) * 13), 3, 2);
  if (!same(0, -1)) { px(g, cl, 0, 0, 16, 2); px(g, INK, 0, 0, 16, 1); }
  if (!same(0, 1)) { px(g, c2, 0, 13, 16, 2); px(g, INK, 0, 15, 16, 1); }
  if (!same(-1, 0)) px(g, INK, 0, 0, 1, 16);
  if (!same(1, 0)) px(g, INK, 15, 0, 1, 16);
}

// Einzelner Baum (T ohne T-Nachbarn): runde Krone mit Ink-Rand, im Bruch ab und zu Herbstlaub
const CROWN = [[5, 6], [3, 10], [2, 12], [1, 14], [1, 14], [1, 14], [2, 12], [3, 10], [5, 6]];
function tree(g, t, x, y) {
  const r = k => hash(x, y, k + 90), c = t.ta && r(1) < 0.3 ? t.ta : t.t1;
  g.fillStyle = 'rgba(30,42,34,.3)'; g.fillRect(6, 24, 24, 6);
  px(g, INK, 6, 9, 4, 6); px(g, t.tr, 7, 9, 2, 6);
  CROWN.forEach(([x0, w], i) => px(g, INK, x0 - 1, i, w + 2, 1));
  CROWN.forEach(([x0, w], i) => { if (i) px(g, t.t2, x0, i, w, 1); });
  CROWN.slice(1, 5).forEach(([x0, w], i) => px(g, c, x0 + 1, i + 1, Math.ceil(w / 2), 1));
  CROWN.slice(5, 8).forEach(([x0, w], i) => px(g, t.t3, x0 + Math.floor(w / 2), i + 5, Math.floor(w / 2) - 1, 1));
  for (let k = 0; k < 3; k++) px(g, k % 2 ? c : t.t3, 3 + Math.floor(r(k + 2) * 9), 2 + Math.floor(r(k + 5) * 5));
  px(g, INK, 5, 8, 6, 1);
}

// Haus (Ziegel- bzw. Schindeldach, Fassade unten) oder Wohnwagen (van: weißes Dach, Farbstreifen, Fenster)
function house(g, t, st, x, y, van, comp) {
  const isW = (dx, dy) => tileAt(st, x + dx, y + dy) === '#' && inner(st, x + dx, y + dy);
  const front = !isW(0, 1), r = k => hash(x, y, k);
  if (van) {
    px(g, t.c1, 0, 0, 16, 16); px(g, t.c2, 0, 7, 16, 1);
    if (r(1) < 0.3) { px(g, t.c3, 6, 2, 4, 3); px(g, t.c2, 7, 3, 2, 1); }
    if (front) {
      px(g, t.c2, 0, 9, 16, 7); px(g, t.c1, 0, 9, 16, 5); px(g, STRIPES[comp % STRIPES.length], 0, 12, 16, 2);
      if (r(2) < 0.6) { px(g, INK, 4, 9, 7, 3); px(g, '#9fd0ea', 5, 9, 5, 2); }
    }
  } else if (t.wall === 'camp') {
    px(g, t.w1, 0, 0, 16, 16);
    for (let row = 0; row < 4; row++) { px(g, t.w3, 0, row * 4 + 3, 16, 1); px(g, t.wl, (row % 2) * 4 + 1, row * 4, 2, 1); px(g, t.wl, (row % 2) * 4 + 9, row * 4, 2, 1); }
    if (front) {
      px(g, t.w2, 0, 9, 16, 7); px(g, t.wf, 0, 9, 16, 1); px(g, t.wf, 0, 15, 16, 1);
      if (r(2) < 0.5) { px(g, INK, 5, 11, 6, 3); px(g, '#9fd0ea', 6, 11, 4, 2); px(g, PAPER, 6, 11, 1, 1); }
    }
  } else {
    px(g, t.w1, 0, 0, 16, 16);
    for (let row = 0; row < 5; row++) { px(g, t.w3, 0, row * 3 + 2, 16, 1); for (let k = (row % 2) * 2; k < 16; k += 4) px(g, t.w3, k, row * 3, 1, 2); }
    for (let k = 0; k < 3; k++) if (r(k + 4) < 0.5) px(g, t.h1, Math.floor(r(k + 7) * 13), Math.floor(r(k + 9) * 7), 3, 2); // Moos
    if (front) { px(g, t.w2, 0, 9, 16, 7); for (let k = 1; k < 16; k += 3) px(g, t.wf, k, 9, 1, 7); px(g, t.wl, 0, 9, 16, 1); }
  }
  if (!isW(0, -1)) px(g, INK, 0, 0, 16, 1);
  if (!isW(-1, 0)) px(g, INK, 0, 0, 1, 16);
  if (!isW(1, 0)) px(g, INK, 15, 0, 1, 16);
  if (front) px(g, INK, 0, 15, 16, 1);
}

// zusammenhängende innere #-Blöcke: Größe ≤ 8 Kacheln = Wohnwagen (nur Mosel)
function blocks(st) {
  const comp = new Int32Array(st.w * st.h).fill(-1), size = [];
  for (let i = 0; i < comp.length; i++) {
    if (comp[i] >= 0 || st.tiles[i] !== '#' || !inner(st, i % st.w, Math.floor(i / st.w))) continue;
    const id = size.length, todo = [i];
    comp[i] = id; size.push(0);
    while (todo.length) {
      const j = todo.pop(), x = j % st.w, y = Math.floor(j / st.w);
      size[id]++;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const k = ny * st.w + nx;
        if (inner(st, nx, ny) && comp[k] < 0 && st.tiles[k] === '#') { comp[k] = id; todo.push(k); }
      }
    }
  }
  return { comp, size };
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

// Im Gebäude: in allen 4 Richtungen kommt innerhalb von 12 Kacheln eine Gebäudewand (inneres #, Tür) vor Baum, Wasser oder Kartenrand
function indoor(st, x, y) {
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => {
    for (let k = 1; k <= 12; k++) {
      const X = x + dx * k, Y = y + dy * k, c = tileAt(st, X, Y);
      if ('#DL'.includes(c)) return inner(st, X, Y);
      if ('TWB'.includes(c)) return false;
    }
    return false;
  });
}

// Duschkabine (~ im Sanitärgebäude): Fliesen, Brause mit Tropfen, Vorhang an der Stange
function shower(g, t, x, y) {
  const r = k => hash(x, y, k + 70), c = STRIPES[Math.floor(r(1) * STRIPES.length)];
  px(g, t.c1, 0, 0, 16, 16);
  for (let k = 0; k < 16; k += 4) { px(g, t.c2, 0, k, 16, 1); px(g, t.c2, k, 0, 1, 16); } // Fugen
  px(g, t.c3, 4, 13, 3, 1); // Abfluss
  px(g, INK, 2, 1, 1, 3); px(g, INK, 2, 3, 6, 2); px(g, t.c3, 3, 3, 4, 1); // Brause
  for (const [dx, dy] of [[3, 6], [6, 7], [4, 9], [6, 11]]) px(g, t.q3, dx, dy + Math.floor(r(2) * 2));
  px(g, INK, 0, 0, 16, 1); // Stange
  px(g, INK, 9, 1, 7, 15); px(g, c, 10, 1, 6, 14);
  g.fillStyle = 'rgba(30,42,34,.25)'; for (let k = 11; k < 16; k += 2) g.fillRect(k * P, P, P, 14 * P); // Falten
  px(g, INK, 0, 15, 16, 1);
}

function cover(g, t, st, x, y) {
  const r = k => hash(x, y, k + 50);
  if (t.cover === 'tent' && indoor(st, x, y)) return shower(g, t, x, y);
  const cv = dx => tileAt(st, x + dx, y) === '~', ch = dy => tileAt(st, x, y + dy) === '~';
  if (t.cover === 'tent' && !cv(-1) && !cv(1) && (ch(-1) || ch(1))) { // senkrechte ~-Reihe: Rebzeile mit Pfahl und Trauben
    px(g, t.p2, 7, 0, 2, 16);
    for (let k = 0; k < 4; k++) { const lx = k % 2 ? 9 : 2; px(g, INK, lx - 1, k * 4, 7, 4); px(g, t.v1, lx, k * 4, 5, 3); px(g, t.t1, lx, k * 4, 2, 1); }
    if (r(3) < 0.7) { const gx = r(4) < 0.5 ? 4 : 10, gy = 2 + Math.floor(r(5) * 10); px(g, INK, gx - 1, gy - 1, 4, 4); px(g, t.v3, gx, gy, 2, 2); }
    return;
  }
  g.fillStyle = 'rgba(30,42,34,.28)'; g.fillRect(6, 24, 22, 4); // harter Schatten
  if (t.cover === 'tent') { // Zelt von vorn: Dreieck in Zeltfarbe, rechte Hälfte schattiert, dunkler Eingang
    const c = TENTS[Math.floor(r(1) * TENTS.length)];
    for (let i = 0; i <= 10; i++) {
      const h = Math.round(i * 0.7);
      px(g, INK, 7 - h, 3 + i, 2 * h + 2, 1);
      if (h) { px(g, c, 8 - h, 3 + i, 2 * h, 1); g.fillStyle = 'rgba(30,42,34,.22)'; g.fillRect(16, (3 + i) * P, h * P, P); }
      if (i >= 5) { const d = Math.round((i - 5) * 0.45); px(g, '#3a2c18', 7 - d, 3 + i, 2 + 2 * d, 1); }
    }
    px(g, INK, 0, 14, 16, 1); px(g, PAPER, 7, 2, 2, 1);
    return;
  }
  if (t.cover === 'reed') { // Schilf mit Rohrkolben auf Matsch
    px(g, t.s2, 0, 12, 16, 4); px(g, t.s1, 2, 13, 12, 1);
    for (let k = 0; k < 11; k++) {
      const bx = 1 + Math.floor(r(k) * 14), h = 6 + Math.floor(r(k + 8) * 8), c = [t.v2, t.v1, t.v3][k % 3], lean = r(k + 30) < 0.3 ? (bx < 8 ? -1 : 1) : 0;
      px(g, c, bx, 15 - Math.ceil(h / 2), 1, Math.ceil(h / 2));
      px(g, c, bx + lean, 15 - h, 1, Math.floor(h / 2));
      if (k % 3 === 1) px(g, t.v1, bx + lean, 15 - h, 1, 1);
      if (r(k + 20) < 0.3) { px(g, INK, bx + lean, 11 - h, 1, 1); px(g, t.tr, bx + lean, 12 - h, 1, 3); }
    }
    return;
  }
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
// Große Karten (64×48) passen als ein Offscreen-Canvas (2048×1536); view.js kopiert pro Bild nur den sichtbaren Ausschnitt.
export function paintMap(st, t) {
  t = { ...T0, ...t };
  const c = document.createElement('canvas');
  c.width = st.w * TILE; c.height = st.h * TILE;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const b = t.edge ? blocks(st) : null;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const i = y * st.w + x, ch = st.tiles[i], same = k => (dx, dy) => tileAt(st, x + dx, y + dy) === k;
    g.save(); g.translate(x * TILE, y * TILE);
    if (ch === '#') {
      if (!b) wall(g, t, st, x, y);
      else if (!inner(st, x, y)) hedge(g, t, x, y, same('#'), true);
      else house(g, t, st, x, y, t.wall === 'camp' && b.size[b.comp[i]] <= 8, b.comp[i]);
    } else if (ch === 'W' || (ch === 'V' && [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => tileAt(st, x + dx, y + dy) === 'W').length >= 2)) water(g, t, st, x, y);
    else if (ch === 'T' && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => same('T')(dx, dy))) hedge(g, t, x, y, same('T'), false);
    else {
      floor(g, t, st, x, y);
      if (ch === '~') cover(g, t, st, x, y);
      else if (ch === 'T') tree(g, t, x, y);
    }
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

// Echte Gesichter auffächern (§0): Punkte ps (Kacheln), die sich in x UND y näher als S sind, rücken entlang ihrer
// Verbindungslinie auseinander, bis max(|dx|, |dy|) = S (Gesicht 28 px); jeder bleibt auf seiner Seite, nichts springt durch.
// Genau übereinander: kleinerer Index links. Mehrere Runden, damit auch drei dicht an dicht frei stehen. Ändert und liefert ps
export function fan(ps, S) {
  for (let n = 0; n < 8; n++) for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
    const dx = ps[b].x - ps[a].x, dy = ps[b].y - ps[a].y, m = Math.max(Math.abs(dx), Math.abs(dy));
    if (m >= S) continue;
    if (m < 1e-6) { ps[a].x -= S / 2; ps[b].x += S / 2; continue; }
    const k = (S / m - 1) / 2;
    ps[a].x -= dx * k; ps[a].y -= dy * k; ps[b].x += dx * k; ps[b].y += dy * k;
  }
  return ps;
}

// Pixel-Bitmaps für Herzen und Sterne (1 = Pixel)
const BITMAPS = { heart: ['01010', '11111', '11111', '01110', '00100'], star: ['00100', '01110', '11011', '01110', '00100'], spark: ['10001', '01010', '00100', '01010', '10001'], plus: ['00100', '00100', '11111', '00100', '00100'], vein: ['01010', '11011', '00000', '11011', '01010'] };
export function bitmap(g, kind, x, y, s, color) {
  const b = BITMAPS[kind];
  g.fillStyle = color;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (b[r][c] === '1') g.fillRect(Math.round(x + (c - 2.5) * s), Math.round(y + (r - 2.5) * s), Math.ceil(s), Math.ceil(s));
}

// Sprechblase im Bildschirmraum: Papier, Ink-Rand, Zipfel unten mittig auf (x,y); head = Kopf-Oberkante des Sprechers (y)
// avoid: Gesichter und schon gezeichnete Blasen; überlappt die neue, rutscht sie darüber (nie über den oberen Rand)
// und zeigt statt des Zipfels einen Pixel-Stiel bis zum Sprecher, damit sie nicht wie der Spruch eines anderen aussieht.
// phase 'stem' | 'box': nur Stiel bzw. nur Kasten zeichnen (Anordnung und avoid wie sonst), view.js malt erst alle Stiele
export function bubble(g, x, y, text, { maxW = 170, font = '800 12px Nunito, system-ui, sans-serif', bg = PAPER, fg = INK, vw = 9999, avoid = [], head = y, phase = '' } = {}) {
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
  if (phase !== 'box' && by !== by0 && sh > 4) { // Stiel bis auf den Kopf (Ink außen, Papier innen), seitlich an fremden Gesichtern vorbei
    const f = avoid.find(r => r.y + r.h > by + h && r.y < head - 4 && tx + 3 > r.x && tx - 1 < r.x + r.w);
    const sx = !f ? tx : Math.round(Math.max(bx + 2, Math.min(bx + w - 6, x < f.x + f.w / 2 ? f.x - 5 : f.x + f.w + 2)));
    const fy = by + h + sh - 4, x0 = Math.min(sx, tx), x1 = Math.max(sx, tx);
    g.fillStyle = INK; g.fillRect(sx - 1, by + h, 4, sh); g.fillRect(x0 - 3, fy, x1 - x0 + 8, 4);
    g.fillStyle = bg; g.fillRect(sx, by + h, 2, sh - 3); g.fillRect(x0 - 1, fy + 1, x1 - x0 + 4, 2);
  }
  if (phase === 'stem') return;
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

// ---------- v9: Minikarte und animierte Requisiten (t = Zeit in ms) ----------
// Minikarte: eine Farbe je Kachel, s px pro Kachel; Ziele, Figuren und Kamera malt view.js darüber
export function paintMini(st, t, s) {
  t = { ...T0, ...t };
  const c = document.createElement('canvas');
  c.width = st.w * s; c.height = st.h * s;
  const g = c.getContext('2d');
  const col = { '#': t.w3, W: t.q2, T: t.h2, '~': t.v2, P: '#c9ced3', D: t.d1, L: '#E0634C' };
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const ch = st.tiles[y * st.w + x];
    g.fillStyle = ch === '#' && t.edge && !inner(st, x, y) ? t.h3 : col[ch] || ((x + y) % 2 ? t.f1 : t.f2);
    g.fillRect(x * s, y * s, s, s);
  }
  return c;
}

// Pixel-Flammen über (x, y): k = Stärke 0…1, flackern in 90-ms-Schritten; pal = [außen, Mitte, Kern] (Firewall: BLUE_FIRE)
const FIRE = ['#B03B2B', '#E0A52B', GOLD];
export const BLUE_FIRE = ['#1F5E8A', '#3FC1B0', '#BFF5EC'];
export function flames(g, x, y, t, k = 1, n = 8, spread = 26, pal = FIRE) {
  const f = Math.floor(t / 90);
  for (let j = 0; j < n; j++) {
    const fx = Math.round(x + (hash(j, 3) - 0.5) * spread), fy = Math.round(y + (hash(j, 4) - 0.5) * spread * 0.5);
    const h = Math.round((8 + hash(j, f) * 11) * k), sw = hash(j, f, 1) < 0.5 ? -1 : 1, lo = Math.ceil(h * 0.55); // sw: Spitze flackert seitlich
    if (h < 3) continue;
    g.fillStyle = INK; g.fillRect(fx - 4, fy - lo - 1, 8, lo + 2); g.fillRect(fx - 3 + sw, fy - h - 1, 6, h - lo + 1);
    g.fillStyle = pal[0]; g.fillRect(fx - 3, fy - lo, 6, lo); g.fillRect(fx - 2 + sw, fy - h, 4, h - lo);
    g.fillStyle = pal[1]; g.fillRect(fx - 2, fy - Math.round(h * 0.45), 4, Math.round(h * 0.45)); g.fillRect(fx - 1 + sw, fy - Math.round(h * 0.72), 2, Math.round(h * 0.27));
    g.fillStyle = pal[2]; g.fillRect(fx - 1, fy - Math.round(h * 0.3), 2, Math.round(h * 0.3));
  }
}
// Rauchsäule und Funken über einem brennenden Baum
export function smoke(g, x, y, t, k = 1) {
  for (let j = 0; j < 10; j++) {
    const ph = (t / 2600 + j / 10) % 1, s = Math.round(5 + ph * 14);
    g.globalAlpha = 0.6 * (1 - ph) * k;
    g.fillStyle = ['#8a8a8a', '#a8a8a8', '#5a5a5a'][j % 3];
    g.fillRect(Math.round(x + Math.sin(ph * 5 + j) * 5 + ph * 14 - s / 2), Math.round(y - ph * 96 - s / 2), s, s);
  }
  g.globalAlpha = k;
  g.fillStyle = GOLD;
  for (let j = 0; j < 5; j++) {
    const ph = (t / 760 + j / 5) % 1;
    g.fillRect(Math.round(x + (hash(j, 6) - 0.5) * 22 + Math.sin(ph * 9 + j) * 3), Math.round(y + 6 - ph * 44), 2, 2);
  }
  g.globalAlpha = 1;
}
// Kaffeebecher mit Dampf (Stefan beim Bulletproof Coffee)
export function mug(g, x, y, t) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = INK; g.fillRect(x - 5, y - 6, 10, 11); g.fillRect(x + 4, y - 3, 4, 6);
  g.fillStyle = PAPER; g.fillRect(x - 4, y - 5, 8, 9); g.fillRect(x + 5, y - 2, 2, 4);
  g.fillStyle = '#E0A52B'; g.fillRect(x - 4, y - 5, 8, 2); // Butter oben drauf
  g.fillStyle = PAPER;
  for (let j = 0; j < 3; j++) {
    const ph = (t / 900 + j / 3) % 1;
    g.globalAlpha = 1 - ph;
    g.fillRect(Math.round(x - 3 + j * 3 + Math.sin(ph * 7 + j) * 2), Math.round(y - 8 - ph * 14), 2, 2);
  }
  g.globalAlpha = 1;
}
// Wasserfontäne aus dem Hahn: k = 1 sprudelt … 0 versiegt
export function fountain(g, x, y, t, k = 1) {
  if (k <= 0) return;
  const n = Math.ceil(9 * k);
  for (let j = 0; j < n; j++) {
    const ph = (t / 650 + hash(j, 8)) % 1, side = j % 2 ? 1 : -0.4, h = 18 * k;
    const dx = x + side * ph * 14, dy = y - Math.sin(ph * Math.PI) * h + ph * 6;
    g.fillStyle = INK; g.fillRect(Math.round(dx) - 1, Math.round(dy) - 1, 4, 4);
    g.fillStyle = j % 3 ? '#9fd0ea' : PAPER; g.fillRect(Math.round(dx), Math.round(dy), 2, 2);
  }
}
// Feuerpatsche: Stiel mit Gummilappen, a = Winkel (Radiant)
export function swatter(g, x, y, a) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(a);
  g.fillStyle = INK; g.fillRect(-1, -2, 18, 4); g.fillRect(14, -6, 10, 12);
  g.fillStyle = '#8a5a2b'; g.fillRect(0, -1, 16, 2);
  g.fillStyle = '#3a3a3a'; g.fillRect(15, -5, 8, 10);
  g.fillStyle = '#5a5a5a'; g.fillRect(15, -5, 8, 2);
  g.restore();
}

// ---------- v10: Requisiten der Quest-Fähigkeiten (t = Zeit in ms) ----------
// Zickzack-Blitz von (x0,y0) nach (x1,y1), alle 50 ms neu gewürfelt (Hack-Blitz, Streit-Blitze)
export function zigzag(g, x0, y0, x1, y1, t, color, n = 8, amp = 12) {
  const seed = Math.floor(t / 50);
  g.beginPath(); g.moveTo(x0, y0);
  for (let k = 1; k < n; k++) g.lineTo(x0 + (x1 - x0) * k / n + (hash(seed, k) - 0.5) * amp, y0 + (y1 - y0) * k / n + (hash(seed, k, 1) - 0.5) * amp);
  g.lineTo(x1, y1);
  g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
  g.strokeStyle = color; g.lineWidth = 2; g.stroke();
}
// Handy in der Hand: Chart steigt (up, grün) oder stürzt ab (rot)
export function phone(g, x, y, up, t) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = INK; g.fillRect(x - 4, y - 6, 9, 13);
  g.fillStyle = up ? '#E3F4D8' : '#F6DCD5'; g.fillRect(x - 3, y - 5, 7, 10);
  g.fillStyle = up ? '#2F9E44' : '#B03B2B';
  const k = Math.floor(t / 180) % 2, pts = up ? [[-3, 3], [-1, 1], [1, 2], [2, -2 - k]] : [[-3, -3], [-1, -1], [1, -2], [2, 2 + k]];
  for (const [dx, dy] of pts) g.fillRect(x + dx, y + dy, 2, 2);
}
// Spitzel-Auge (Unlimited Credits Stufe 3), blinzelt ab und zu; s = Kunst-Pixel
export function eye(g, x, y, t, s = 2) {
  x = Math.round(x); y = Math.round(y);
  const shut = (t / 2600) % 1 < 0.06;
  g.fillStyle = INK; g.fillRect(x - 4 * s, y - 2 * s, 8 * s, 4 * s); g.fillRect(x - 3 * s, y - 3 * s, 6 * s, 6 * s);
  if (shut) { g.fillStyle = '#C77DFF'; g.fillRect(x - 3 * s, y, 6 * s, s); return; }
  g.fillStyle = PAPER; g.fillRect(x - 3 * s, y - s, 6 * s, 2 * s); g.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s);
  g.fillStyle = '#C77DFF'; g.fillRect(x - s, y - s, 2 * s, 2 * s);
  g.fillStyle = INK; g.fillRect(x - Math.ceil(s / 2), y - Math.ceil(s / 2), s, s);
}
// Anzug unterm echten Gesicht (Vice-President-Auftritt): Schultern und Brust mit Hemd, roter Krawatte und Goldknöpfen
export function suit(g, x, y) {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = INK; g.fillRect(x - 19, y + 3, 38, 23);
  g.fillStyle = '#22305A'; g.fillRect(x - 18, y + 4, 36, 21);
  g.fillStyle = '#34477F'; g.fillRect(x - 18, y + 4, 3, 21); g.fillRect(x + 15, y + 4, 3, 21);
  g.fillStyle = PAPER; g.fillRect(x - 5, y + 14, 10, 4); g.fillRect(x - 3, y + 18, 6, 3); g.fillRect(x - 1, y + 21, 2, 2);
  g.fillStyle = '#B03B2B'; g.fillRect(x - 1, y + 14, 3, 9);
  g.fillStyle = GOLD; g.fillRect(x - 9, y + 20, 2, 2); g.fillRect(x + 7, y + 20, 2, 2);
}
// Raubkopie: echtes Gesicht im Rahmen, halbtransparent, mit Glitch-Streifen und Farbversatz; k = Sichtbarkeit 0…1
export function glitchFace(g, face, x, y, size, rarity, t, k = 1, src = '') {
  const s = Math.round(size), x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2), f = Math.floor(t / 70);
  g.save();
  g.globalAlpha = 0.8 * k;
  faceFrame(g, face, x + (hash(f, 1) < 0.2 ? 2 : 0), y, size, rarity, { src });
  if (face) { // versetzte Zeilen aus dem Foto
    const iw = face.naturalWidth || face.width, ih = face.naturalHeight || face.height;
    g.imageSmoothingEnabled = true;
    for (let j = 0; j < 3; j++) {
      if (hash(f, j, 2) < 0.35) continue;
      const h = 2 + Math.floor(hash(f, j, 4) * 5), sy = Math.floor(hash(f, j, 3) * (s - 4 - h)), dx = Math.round((hash(f, j, 5) - 0.5) * 10);
      g.drawImage(face, 0, sy / (s - 4) * ih, iw, h / (s - 4) * ih, x0 + 2 + dx, y0 + 2 + sy, s - 4, h);
    }
    g.imageSmoothingEnabled = false;
  }
  g.globalAlpha = 0.45 * k; // Farbversatz und Streifen
  g.fillStyle = '#3FC1B0'; g.fillRect(x0 - 3, y0 + Math.floor(hash(f, 6) * s), s, 2);
  g.fillStyle = '#E0559B'; g.fillRect(x0 + 3, y0 + Math.floor(hash(f, 7) * s), s, 2);
  g.globalAlpha = 0.16 * k; g.fillStyle = INK;
  for (let r = 1; r < s; r += 3) g.fillRect(x0, y0 + r, s, 1); // Zeilenraster
  g.restore();
}
// WLAN-Symbol mit Störung: Bögen gehen nacheinander aus, roter Schrägstrich
export function wifi(g, x, y, t) {
  const on = Math.floor(t / 260) % 4;
  for (let k = 0; k < on; k++) {
    g.beginPath(); g.arc(x, y, 5 + k * 5, -Math.PI * 0.78, -Math.PI * 0.22);
    g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#3FC1B0'; g.lineWidth = 3; g.stroke();
  }
  g.fillStyle = INK; g.fillRect(Math.round(x) - 3, Math.round(y) - 2, 6, 5); g.fillStyle = '#3FC1B0'; g.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
  g.beginPath(); g.moveTo(x - 13, y - 16); g.lineTo(x + 13, y + 4);
  g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#B03B2B'; g.lineWidth = 3; g.stroke();
}
// Schimpf-Blase: zackige rote Wolke mit Kritzel (Hildegard schimpft)
export function scold(g, x, y, t) {
  const n = 9, f = Math.floor(t / 160);
  g.beginPath();
  for (let k = 0; k <= 2 * n; k++) { const a = k / (2 * n) * 2 * Math.PI, r = k % 2 ? 9 : 14 + (hash(f, k) < 0.3 ? 2 : 0); g.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 0.8); }
  g.closePath();
  g.fillStyle = '#B03B2B'; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(x - 9, y);
  for (let k = 1; k < 7; k++) g.lineTo(x - 9 + k * 3, y + (hash(f, k, 9) - 0.5) * 9);
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
}
// Bierpfütze: Pixel-Lache mit Schaum; k = Größe 0…1
export function puddle(g, x, y, t, k = 1) {
  x = Math.round(x); y = Math.round(y);
  const w = Math.round(17 * k), h = Math.round(6 * k);
  if (w < 6) return;
  g.fillStyle = INK; g.fillRect(x - w - 1, y - h + 1, 2 * w + 2, 2 * h); g.fillRect(x - w + 4, y - h - 2, 2 * w - 8, 2 * h + 6);
  g.fillStyle = '#C98A1E'; g.fillRect(x - w, y - h + 2, 2 * w, 2 * h - 2); g.fillRect(x - w + 5, y - h - 1, 2 * w - 10, 2 * h + 4);
  g.fillStyle = GOLD; g.fillRect(x - w + 6, y - h, Math.round(w * 0.6), 2);
  g.fillStyle = PAPER;
  for (let j = 0; j < 4; j++) if ((t / 700 + hash(j, 11)) % 1 < 0.6) g.fillRect(x - w + 4 + Math.floor(hash(j, 12) * (2 * w - 8)), y - 1 + Math.floor(hash(j, 13) * h), 2, 2);
}
