import { CONST } from './data.js';
import { distance, randomPointInRing } from './geo.js';

function makeSpawn(r, pos, now, rng) {
  return {
    id: `${r.id}-${now}-${Math.floor(rng() * 1e6)}`,
    ruetherId: r.id,
    lat: pos.lat,
    lon: pos.lon,
    expires: now + CONST.SPAWN_LIFETIME,
  };
}

// Reine Funktion. Gibt die neue Spawn-Liste zurück.
export function updateSpawns({ spawns, player, arenas, ruethers, now, rng }) {
  if (!player) return [];
  const list = spawns.filter(s => s.expires > now && distance(player, s) <= CONST.SPAWN_FORGET);
  const target = CONST.SPAWN_MIN + Math.floor(rng() * (CONST.SPAWN_MAX - CONST.SPAWN_MIN + 1));

  const anywhere = ruethers.filter(r => r.spawn === 'anywhere');
  // ortsgebundene Rüthers, deren Arena in Reichweite ist
  const local = ruethers
    .filter(r => r.spawn !== 'anywhere')
    .map(r => ({ r, arena: arenas.find(a => a.id === r.spawn) }))
    .filter(x => x.arena && distance(player, x.arena) <= CONST.LOCAL_ZONE);

  const place = (r) => {
    const loc = local.find(x => x.r.id === r.id);
    const center = loc ? loc.arena : player;
    const ring = loc ? CONST.LOCAL_SPAWN_RING : CONST.SPAWN_RING;
    return makeSpawn(r, randomPointInRing(center, ring[0], ring[1], rng), now, rng);
  };

  // mindestens ein Spawn pro ortsgebundenem Rüther in der Zone; bei voller Liste weicht der älteste Anywhere-Spawn
  for (const { r } of local) {
    if (list.some(s => s.ruetherId === r.id)) continue;
    if (list.length >= CONST.SPAWN_MAX) {
      const i = list.findIndex(s => anywhere.some(a => a.id === s.ruetherId));
      if (i >= 0) list.splice(i, 1);
    }
    list.push(place(r));
  }
  const pool = [...anywhere, ...local.map(x => x.r)];
  while (list.length < target) {
    list.push(place(pool[Math.floor(rng() * pool.length)]));
  }
  return list;
}
