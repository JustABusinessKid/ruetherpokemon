import { CONST } from './data.js';

export const MIN_FLICK = 0.6;   // px/ms nach oben
export const MAX_FLICK = 4;     // px/ms, schneller zählt nicht mehr (Deckel für die Wurfweite)

export function ringBonus(scale) {
  if (scale < 0.5) return { label: 'Super!', bonus: 0.25 };
  if (scale < 0.75) return { label: 'Gut!', bonus: 0.12 };
  return { label: '', bonus: 0 };
}

export function catchChance(base, scale) {
  return Math.min(CONST.MAX_CATCH_CHANCE, Math.round((base + ringBonus(scale).bonus) * 100) / 100);
}

export function isFlick(vy) { return vy <= -MIN_FLICK; }

// Wurfweite = 160 px + 100 px je px/ms, in Flick-Richtung. Normale Daumen-Flicks (1–3 px/ms) landen damit
// 260–460 px über der Ruheposition der Münze – das Trefferfenster des Rüthers (Sprite 160 px + 20 px Rand,
// Mitte ~360 px drüber). Schwächer fällt davor runter, stärker schießt drüber.
// (Geschwindigkeit × Flugzeit traf nur zwischen 0,6 und 0,9 px/ms.)
export function landing(start, vx, vy) {
  const speed = Math.hypot(vx, vy), reach = 160 + 100 * Math.min(speed, MAX_FLICK);
  return { x: start.x + vx * reach / speed, y: start.y + vy * reach / speed };
}

export function isHit(p, rect, pad = 20) {
  return p.x >= rect.left - pad && p.x <= rect.right + pad && p.y >= rect.top - pad && p.y <= rect.bottom + pad;
}

// Ergebnis eines Treffers: gefangen nach 3 Wacklern, sonst Ausbruch nach 1–3
export function rollCatch(chance, rng) {
  const caught = rng() < chance;
  return { caught, wobbles: caught ? 3 : 1 + Math.floor(rng() * 3) };
}
