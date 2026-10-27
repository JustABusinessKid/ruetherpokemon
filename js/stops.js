import { CONST, OVERPASS_AMENITIES, OVERPASS_SHOPS, STOP_REWARDS } from './data.js';
import { distance, offsetPoint, randomPointInRing } from './geo.js';
import { hashStr, seededRng } from './quests.js';

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
// Rasterzelle (ca. STOP_CACHE_CELL Meter): [Zeile, Spalte], Cache-Schlüssel "Zeile:Spalte"
const M = 111320;
const cellOf = p => [Math.round((p.lat * M) / CONST.STOP_CACHE_CELL), Math.round((p.lon * M * Math.cos((p.lat * Math.PI) / 180)) / CONST.STOP_CACHE_CELL)];
export const cacheCell = p => cellOf(p).join(':');
// Dosenbier-Stops ohne Netz: je Rasterzelle 2 feste Stops (Lage und Name aus der Zelle gewürfelt), die 3×3 Zellen um den Spieler,
// bis STOP_RADIUS. Die ids sind stabil, daran hängt die Abkühlung. Echte Läden aus OSM (overpass.js) kommen per mergeStops obendrauf;
// vorher gab es ohne Overpass (406/429/Timeout, Flugzeug, offline) gar keine Stops
const STOP_NAMES = ['Kiosk Müller', 'Trinkhalle Hagen', 'Zum goldenen Dosenbier', 'Büdchen am Eck', 'Getränke Hoffmann', 'Tankstelle Nachtschicht',
  'Späti Rüther', 'Kiosk Pils & Pommes', 'Trinkhalle Dreifaltigkeit', 'Büdchen Blaue Stunde', 'Eck-Kiosk Ewige Treue', 'Getränkemarkt Vollrausch'];
export function generatedStops(player) {
  const [cy, cx] = cellOf(player), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const y = cy + dy, x = cx + dx, rng = seededRng(hashStr(`stop:${y}:${x}`)), lat = (y * CONST.STOP_CACHE_CELL) / M;
    const center = { lat, lon: (x * CONST.STOP_CACHE_CELL) / (M * Math.cos((lat * Math.PI) / 180)) }; // nur aus der Zelle, nie aus dem Spieler
    const n0 = Math.floor(rng() * STOP_NAMES.length), n1 = (n0 + 1 + Math.floor(rng() * (STOP_NAMES.length - 1))) % STOP_NAMES.length;
    [n0, n1].forEach((n, i) => {
      const p = offsetPoint(center, (rng() - 0.5) * CONST.STOP_CACHE_CELL, (rng() - 0.5) * CONST.STOP_CACHE_CELL);
      out.push({ id: `gen:${y}:${x}:${i}`, name: STOP_NAMES[n], kind: 'kiosk', lat: p.lat, lon: p.lon, dist: distance(player, p) });
    });
  }
  return out.filter(s => s.dist <= CONST.STOP_RADIUS).sort((a, b) => a.dist - b.dist).slice(0, CONST.STOP_MAX);
}
// echte Stops zuerst; generierte, die auf einem echten liegen würden (< 60 m), fallen weg
export const mergeStops = (real, gen) => [...real, ...gen.filter(g => real.every(r => distance(g, r) >= 60))].sort((a, b) => a.dist - b.dist).slice(0, CONST.STOP_MAX);
export function fakeStops(player, rng) {
  return ['Kiosk Müller', 'Zum goldenen Dosenbier', 'Trinkhalle Hagen'].map((name, i) => {
    const p = i === 0 ? randomPointInRing(player, 15, 35, rng) : randomPointInRing(player, 45, 120, rng);
    return { id: 'fake' + i, name, kind: 'kiosk', lat: p.lat, lon: p.lon, dist: distance(player, p) };
  });
}
