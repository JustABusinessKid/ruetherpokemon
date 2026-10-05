import { CONST, OVERPASS_AMENITIES, OVERPASS_SHOPS, STOP_REWARDS } from './data.js';
import { distance, randomPointInRing } from './geo.js';

export function overpassQuery(player) {
  const a = OVERPASS_AMENITIES.join('|'), s = OVERPASS_SHOPS.join('|');
  const around = `around:${CONST.STOP_RADIUS},${player.lat},${player.lon}`;
  return `[out:json][timeout:10];(node["amenity"~"^(${a})$"](${around});node["shop"~"^(${s})$"](${around}););out body;`;
}
// Overpass-Antwort → Stops (nur Nodes mit Koordinaten), nach Entfernung, max STOP_MAX
export function parseOverpass(json, player) {
  const els = Array.isArray(json?.elements) ? json.elements : [];
  return els
    .filter(e => e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map(e => ({ id: 'osm' + e.id, name: e.tags?.name || 'Dosenbier-Stop', kind: e.tags?.amenity || e.tags?.shop || 'stop', lat: e.lat, lon: e.lon, dist: distance(player, e) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, CONST.STOP_MAX);
}
export function spinReward(rng) {
  const total = STOP_REWARDS.reduce((s, r) => s + r.w, 0);
  let x = rng() * total;
  let sats = STOP_REWARDS[STOP_REWARDS.length - 1].sats;
  for (const r of STOP_REWARDS) { if (x < r.w) { sats = r.sats; break; } x -= r.w; }
  return { sats, superCoin: rng() < CONST.STOP_SUPERCOIN_CHANCE, xp: CONST.XP_STOP };
}
export const stopReady = (save, id, now) => !((save.stopCooldowns || {})[id] > now);
export function useStop(save, id, now) {
  save.stopCooldowns = save.stopCooldowns || {};
  for (const [k, v] of Object.entries(save.stopCooldowns)) if (v <= now) delete save.stopCooldowns[k];
  save.stopCooldowns[id] = now + CONST.STOP_COOLDOWN;
  save.stats.stops = (save.stats.stops || 0) + 1;
}
// Rasterzelle für den Cache (ca. STOP_CACHE_CELL Meter)
export const cacheCell = p => `${Math.round((p.lat * 111320) / CONST.STOP_CACHE_CELL)}:${Math.round((p.lon * 111320 * Math.cos((p.lat * Math.PI) / 180)) / CONST.STOP_CACHE_CELL)}`;
export function fakeStops(player, rng) {
  return ['Kiosk Müller', 'Zum goldenen Dosenbier', 'Trinkhalle Hagen'].map((name, i) => {
    const p = i === 0 ? randomPointInRing(player, 15, 35, rng) : randomPointInRing(player, 45, 120, rng);
    return { id: 'fake' + i, name, kind: 'kiosk', lat: p.lat, lon: p.lon, dist: distance(player, p) };
  });
}
