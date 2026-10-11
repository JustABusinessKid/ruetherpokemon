import { CONST } from './data.js';
import { distance, offsetPoint, randomPointInRing } from './geo.js';
import { rollRarity } from './progress.js';

function makeSpawn(r, pos, now, rng, forceRarity) {
  return {
    id: `${r.id}-${now}-${Math.floor(rng() * 1e6)}`,
    ruetherId: r.id,
    lat: pos.lat,
    lon: pos.lon,
    expires: now + CONST.SPAWN_LIFETIME,
    rarity: forceRarity || rollRarity(rng),
  };
}

// Wer hier auftauchen darf: Anywhere-Rüther überall, ortsgebundene nur in LOCAL_ZONE ihrer Arena.
// pool: Ziehliste, der Rüther des Tages (featured) liegt FEATURED_WEIGHT-fach drin.
function spawnPool(player, arenas, ruethers, featured) {
  const anywhere = ruethers.filter(r => r.spawn === 'anywhere');
  const local = ruethers
    .filter(r => r.spawn !== 'anywhere')
    .map(r => ({ r, arena: arenas.find(a => a.id === r.spawn) }))
    .filter(x => x.arena && distance(player, x.arena) <= CONST.LOCAL_ZONE);
  const pool = [...anywhere, ...local.map(x => x.r)].flatMap(r => (r.id === featured ? Array(CONST.FEATURED_WEIGHT).fill(r) : [r]));
  return { anywhere, local, pool };
}

// Reine Funktion. lure: Lockmodul aktiv (mehr Spawns). forceRarity: der erste neu erzeugte Spawn bekommt diese Stufe (Debug).
// featured: dieser Rüther liegt FEATURED_WEIGHT-fach im Pool (Rüther des Tages).
export function updateSpawns({ spawns, player, arenas, ruethers, now, rng, lure = false, forceRarity = null, featured = null }) {
  if (!player) return [];
  const list = spawns.filter(s => s.expires > now && distance(player, s) <= CONST.SPAWN_FORGET);
  const min = lure ? CONST.LURE_SPAWN_MIN : CONST.SPAWN_MIN;
  const max = lure ? CONST.LURE_SPAWN_MAX : CONST.SPAWN_MAX;
  const target = min + Math.floor(rng() * (max - min + 1));
  const { anywhere, local, pool } = spawnPool(player, arenas, ruethers, featured);

  const place = (r) => {
    const loc = local.find(x => x.r.id === r.id);
    const center = loc ? loc.arena : player;
    const ring = loc ? CONST.LOCAL_SPAWN_RING : CONST.SPAWN_RING;
    const s = makeSpawn(r, randomPointInRing(center, ring[0], ring[1], rng), now, rng, forceRarity);
    forceRarity = null; // nur der erste neue Spawn
    return s;
  };

  for (const { r } of local) {
    if (list.some(s => s.ruetherId === r.id)) continue;
    if (list.length >= max) {
      const i = list.findIndex(s => anywhere.some(a => a.id === s.ruetherId));
      if (i >= 0) list.splice(i, 1);
    }
    list.push(place(r));
  }
  while (list.length < target) {
    list.push(place(pool[Math.floor(rng() * pool.length)]));
  }
  return list;
}

// v9 §1: Lockmodul additiv. Jede Welle (sofort beim Kauf, dann alle LURE_INTERVAL) bringt LURE_WAVE neue Rüther dazu,
// die vorhandenen bleiben mit ihrer normalen Lebensdauer. lureTrim macht vorher Platz, lureWave liefert NUR die neuen,
// die App hängt sie an: spawns = [...alt, ...lureWave({ ..., spawns: alt })] mit alt = lureTrim(...).

// Was vor einer Welle liegen bleibt: Abgelaufene und vergessene (SPAWN_FORGET) fallen raus, danach höchstens
// LURE_MAX − LURE_WAVE, die ältesten (kleinstes expires) zuerst. keep (offen im Fang- oder Kampf-Screen) bleibt immer.
export function lureTrim({ spawns, player, now, keep = null }) {
  const open = s => !!keep && s.id === keep.id;
  const list = spawns.filter(s => open(s) || (s.expires > now && (!player || distance(player, s) <= CONST.SPAWN_FORGET)));
  const over = list.length - (CONST.LURE_MAX - CONST.LURE_WAVE);
  if (over <= 0) return list;
  const drop = new Set(list.filter(s => !open(s)).sort((a, b) => a.expires - b.expires).slice(0, over));
  return list.filter(s => !drop.has(s));
}

// Platz auf einem genordeten Raster um den Spieler: Schritt LURE_STEP (bzw. gap, falls größer) je Achse, Zellen bis
// LURE_RING[1] = 90 m, die Mitte ist der Spieler. Das sind 20 Zellen, so passen alle 15 (LURE_MAX) gleichzeitig ins Bild
// (map.js lureZoom); zufällig gestreut passten nur 9–13. Zellen in zufälliger Reihenfolge. Frei ist eine Zelle, wenn kein
// Gesicht (alt oder neu) je Achse näher als gap liegt (die Quadrate decken sich nicht) und sie in keinem Sperrquadrat aus
// avoid liegt (Arena-Schilder samt Besitzer-Foto, Knöpfe; beides map.js lureRoom). Ist nichts frei, kommen weniger: direkt
// an einer Arena passen 14, auf 336 px breiten Karten 11–12. Seltenheit normal gewürfelt (rollRarity). Rein.
const LURE_STEP = 40, LURE_GAP = 33; // m; LURE_GAP gilt ohne lureRoom (≈ 52 px bei Zoom 17 in Hagen)
// Sperrquadrat b = { lat, lon, r }: halbe Kantenlänge r in m, die Karte ist genordet
const inBlock = (b, p) => distance(b, { lat: p.lat, lon: b.lon }) < b.r && distance(b, { lat: b.lat, lon: p.lon }) < b.r;
export function lureWave({ player, ruethers, arenas, now, rng, spawns = [], featured = null, avoid = [], gap = LURE_GAP }) {
  if (!player) return [];
  const { pool } = spawnPool(player, arenas, ruethers, featured);
  const step = Math.max(LURE_STEP, gap + 0.5), n = Math.floor(CONST.LURE_RING[1] / step), cells = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) if ((i || j) && Math.hypot(i, j) * step <= CONST.LURE_RING[1]) cells.push([i, j]);
  for (let k = cells.length - 1; k > 0; k--) { const m = Math.floor(rng() * (k + 1)); [cells[k], cells[m]] = [cells[m], cells[k]]; }
  const taken = [...spawns], out = [];
  for (const [i, j] of cells) {
    if (out.length >= CONST.LURE_WAVE) break;
    const p = offsetPoint(player, i * step, j * step);
    if (taken.some(s => inBlock({ ...s, r: gap }, p)) || avoid.some(b => inBlock(b, p))) continue;
    const s = { ...makeSpawn(pool[Math.floor(rng() * pool.length)], p, now, rng), lure: true }; // lure: Karte hält den Lock-Zoom
    out.push(s);
    taken.push(s);
  }
  return out;
}
