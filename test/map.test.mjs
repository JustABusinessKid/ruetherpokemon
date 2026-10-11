import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lureZoom } from '../js/map.js';
import { CONST, ARENAS } from '../js/data.js';

const mPerPx = (lat, z) => (156543 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

test('v8: lureZoom passt den 90-m-Ring auf jeder Breite ins Bild, die Gesichter der Welle (≥ 44 m) decken sich nicht', () => {
  for (let lat = -80; lat <= 80; lat += 0.5) {
    for (const side of [320, 360, 375, 390, 414, 430]) {
      const z = lureZoom(lat, side), m = mPerPx(lat, z);
      assert.ok(z >= 15 && z <= 18 && z * 4 === Math.round(z * 4), `Zoom ${z}`);
      assert.ok(CONST.LURE_RING[1] / m <= 0.4 * side + 1e-9, `Ring zu groß bei ${lat}°/${side}px: ${CONST.LURE_RING[1] / m} px`);
      assert.ok(44 / m >= 48, `Gesichter decken sich bei ${lat}°/${side}px: ${44 / m} px`);
    }
  }
});

test('v8: lureZoom: Hagen enger als Neuschwabenland, Grenzen 15–18', () => {
  const ns = ARENAS.find(a => a.id === 'neuschwabenland');
  assert.equal(lureZoom(51.36, 375), 17.25);
  assert.equal(lureZoom(ns.lat, 375), 16.25);
  assert.equal(lureZoom(ns.lat, 390), 16.25);
  assert.equal(lureZoom(0, 3000), 18);
  assert.equal(lureZoom(89, 375), 15);
});
