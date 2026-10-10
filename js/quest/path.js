// Raster-Hilfen für die Quests: A* (8 Richtungen, keine Eckenschnitte) und Sichtstrahlen.
// Kachel (x,y) deckt [x,x+1)×[y,y+1), ihr Mittelpunkt ist (x+0.5, y+0.5). Außerhalb des Rasters = Wand.

const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
const octile = (dx, dy) => { dx = Math.abs(dx); dy = Math.abs(dy); return dx + dy + (SQ2 - 2) * Math.min(dx, dy); };

// passable(x,y) → bool. Ziel: jede begehbare Kachel, deren Mitte ≤ near Kacheln von der Zielkachel entfernt ist
// (near=1.5: daneben, auch diagonal).
// Liefert die Kacheln ohne Start bis einschließlich Ziel ([] = schon da) oder null, wenn unerreichbar.
export function findPath(w, h, passable, sx, sy, tx, ty, near = 0) {
  const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && passable(x, y);
  const goal = (x, y) => Math.hypot(x - tx, y - ty) <= near + 1e-9 && ok(x, y);
  if (goal(sx, sy)) return [];
  const n = w * h, g = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const hf = (x, y) => Math.max(0, octile(x - tx, y - ty) - near * 1.0824); // octile ≤ 1,0824 × euklidisch: zulässig
  // Binärer Heap über [f, idx]
  const hk = [], hi = [];
  const push = (f, i) => {
    let k = hk.length; hk.push(f); hi.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hk[p] <= f) break; hk[k] = hk[p]; hi[k] = hi[p]; k = p; }
    hk[k] = f; hi[k] = i;
  };
  const pop = () => {
    const top = hi[0], f = hk.pop(), i = hi.pop();
    if (hk.length) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1; if (c >= hk.length) break;
        if (c + 1 < hk.length && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= f) break;
        hk[k] = hk[c]; hi[k] = hi[c]; k = c;
      }
      hk[k] = f; hi[k] = i;
    }
    return top;
  };
  const s = sy * w + sx;
  g[s] = 0; push(hf(sx, sy), s);
  while (hk.length) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur - cx) / w;
    if (goal(cx, cy)) {
      const out = [];
      for (let k = cur; k !== s; k = prev[k]) out.push({ x: k % w, y: Math.floor(k / w) });
      return out.reverse();
    }
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!ok(nx, ny)) continue;
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue; // keine Ecken schneiden
      const ni = ny * w + nx, ng = g[cur] + c;
      if (ng < g[ni]) { g[ni] = ng; prev[ni] = cur; push(ng + hf(nx, ny), ni); }
    }
  }
  return null;
}

// Strahl ab (x0,y0) in Richtung (dx,dy) bis Parameter maxT. Liefert t, bei dem er die erste blockierende Kachel
// betritt (Startkachel zählt nicht), sonst maxT. Läuft der Strahl exakt durch eine Ecke, blockiert jede der beiden
// Nachbarkacheln, damit nichts durch diagonale Wandlücken späht.
export function castRay(blocks, x0, y0, dx, dy, maxT) {
  let cx = Math.floor(x0), cy = Math.floor(y0);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx ? Math.abs(1 / dx) : Infinity, ddy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = dx > 0 ? (cx + 1 - x0) * ddx : dx < 0 ? (x0 - cx) * ddx : Infinity;
  let ty = dy > 0 ? (cy + 1 - y0) * ddy : dy < 0 ? (y0 - cy) * ddy : Infinity;
  for (;;) {
    const t = Math.min(tx, ty);
    if (t >= maxT) return maxT;
    if (tx === ty) {
      if (blocks(cx + sx, cy) || blocks(cx, cy + sy)) return t;
      cx += sx; cy += sy; tx += ddx; ty += ddy;
    } else if (tx < ty) { cx += sx; tx += ddx; } else { cy += sy; ty += ddy; }
    if (blocks(cx, cy)) return t;
  }
}

// Freie Sicht von a nach b? Die Zielkachel zählt mit: wer in Deckung oder Gas steht, ist unsichtbar.
export const lineOfSight = (blocks, x0, y0, x1, y1) => castRay(blocks, x0, y0, x1 - x0, y1 - y0, 1) >= 1;
