import { CONST } from './data.js';
import { distance, randomPointInRing } from './geo.js';
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

// Reine Funktion. lure: Lockmodul aktiv (mehr Spawns). forceRarity: der erste neu erzeugte Spawn bekommt diese Stufe (Debug).
// featured: dieser Rüther liegt FEATURED_WEIGHT-fach im Pool (Rüther des Tages).
export function updateSpawns({ spawns, player, arenas, ruethers, now, rng, lure = false, forceRarity = null, featured = null }) {
  if (!player) return [];
  const list = spawns.filter(s => s.expires > now && distance(player, s) <= CONST.SPAWN_FORGET);
  const min = lure ? CONST.LURE_SPAWN_MIN : CONST.SPAWN_MIN;
  const max = lure ? CONST.LURE_SPAWN_MAX : CONST.SPAWN_MAX;
  const target = min + Math.floor(rng() * (max - min + 1));

  const anywhere = ruethers.filter(r => r.spawn === 'anywhere');
  const local = ruethers
    .filter(r => r.spawn !== 'anywhere')
    .map(r => ({ r, arena: arenas.find(a => a.id === r.spawn) }))
    .filter(x => x.arena && distance(player, x.arena) <= CONST.LOCAL_ZONE);

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
  const pool = [...anywhere, ...local.map(x => x.r)].flatMap(r => (r.id === featured ? Array(CONST.FEATURED_WEIGHT).fill(r) : [r]));
  while (list.length < target) {
    list.push(place(pool[Math.floor(rng() * pool.length)]));
  }
  return list;
}
