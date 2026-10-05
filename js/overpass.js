import { CONST, OVERPASS_URLS } from './data.js';
import { overpassQuery, parseOverpass, cacheCell } from './stops.js';

const cache = new Map();

async function ask(url, body) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

// Stops im Umkreis; Cache pro Rasterzelle 10 Minuten; probiert die Server der Reihe nach; alles fehlgeschlagen → []
export async function fetchStops(player) {
  const key = cacheCell(player);
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CONST.STOP_CACHE_MS) return hit.stops;
  const body = 'data=' + encodeURIComponent(overpassQuery(player));
  for (const url of OVERPASS_URLS) {
    const json = await ask(url, body);
    if (!json) continue;
    const stops = parseOverpass(json, player);
    cache.set(key, { at: Date.now(), stops });
    return stops;
  }
  return [];
}
