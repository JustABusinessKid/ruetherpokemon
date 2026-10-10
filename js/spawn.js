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

// v8 §3: Lockmodul-Welle (alle LURE_INTERVAL, die erste sofort beim Kauf). Alle alten Spawns weg außer keep
// (der Spawn, der gerade im Fang- oder Kampf-Screen offen ist), dafür LURE_SPAWN_MIN..MAX neue im LURE_RING
// direkt um den Spieler, also in Fangreichweite. Rein.
// Verteilt statt Klumpen: jeder Spawn bekommt seinen eigenen Winkel-Sektor (plus wenig Zufall) und abwechselnd den
// inneren bzw. äußeren Ring (ungerade n: i = 0 und n-1 liegen beide außen, dort ist Platz). Zusammen mit Zoom 17
// während des Lockmoduls (map.setLure) liegen Nachbarn ≥ 44 m ≈ 60 px auseinander: die 48-px-Gesichter decken sich
// nicht und bleiben vom Spieler-Punkt frei. Bei Zoom 16 passen 8 Gesichter gar nicht in 90 m.
const LURE_NEAR = [45, 52], LURE_FAR = [80, 90]; // m, innerhalb CONST.LURE_RING
export function lureWave({ player, ruethers, arenas, now, rng, keep = null, featured = null }) {
  const list = keep ? [keep] : [];
  if (!player) return list;
  const { pool } = spawnPool(player, arenas, ruethers, featured);
  const n = CONST.LURE_SPAWN_MIN + Math.floor(rng() * (CONST.LURE_SPAWN_MAX - CONST.LURE_SPAWN_MIN + 1));
  const rot = rng() * 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    const r = pool[Math.floor(rng() * pool.length)];
    const [a, b] = i % 2 ? LURE_NEAR : LURE_FAR;
    const ang = rot + ((i + rng() * 0.3) / n) * 2 * Math.PI, d = a + rng() * (b - a);
    list.push(makeSpawn(r, offsetPoint(player, d * Math.cos(ang), d * Math.sin(ang)), now, rng));
  }
  return list;
}
