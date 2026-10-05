import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overpassQuery, parseOverpass, spinReward, stopReady, useStop, cacheCell, fakeStops } from '../js/stops.js';
import { emptySaveV3 } from '../js/progress.js';
import { CONST } from '../js/data.js';
import { offsetPoint } from '../js/geo.js';

const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const P = { lat: 51.37, lon: 7.48 };

test('overpassQuery enthält Umkreis und Filter', () => {
  const q = overpassQuery(P);
  assert.ok(q.includes('around:600,51.37,7.48'));
  assert.ok(q.includes('amenity') && q.includes('pub') && q.includes('kiosk'));
});

test('parseOverpass: nur Nodes, Name-Fallback, sortiert, Limit 25', () => {
  const far = offsetPoint(P, 500, 0), near = offsetPoint(P, 50, 0);
  const json = { elements: [
    { type: 'node', id: 1, lat: far.lat, lon: far.lon, tags: { amenity: 'pub', name: 'Zum Löwen' } },
    { type: 'node', id: 2, lat: near.lat, lon: near.lon, tags: { shop: 'kiosk' } },
    { type: 'way', id: 3, tags: { amenity: 'bar', name: 'Weg' } },
    { type: 'node', id: 4, tags: { amenity: 'bar' } },
  ] };
  const stops = parseOverpass(json, P);
  assert.deepEqual(stops.map(s => s.id), ['osm2', 'osm1']);
  assert.equal(stops[0].name, 'Dosenbier-Stop');
  assert.equal(stops[0].kind, 'kiosk');
  assert.ok(stops[0].dist > 45 && stops[0].dist < 55);
  const many = { elements: Array.from({ length: 40 }, (_, i) => ({ type: 'node', id: i, lat: P.lat + i * 0.0001, lon: P.lon, tags: {} })) };
  assert.equal(parseOverpass(many, P).length, CONST.STOP_MAX);
  assert.deepEqual(parseOverpass(null, P), []);
});

test('spinReward: Gewichte und Super-Münze über rng', () => {
  assert.deepEqual(spinReward(seq(0, 0.5)), { sats: 20, superCoin: false, xp: 10 });
  assert.deepEqual(spinReward(seq(0.95, 0.1)), { sats: 60, superCoin: true, xp: 10 });
  assert.equal(spinReward(seq(0.45, 0.9)).sats, 30);
  assert.equal(spinReward(seq(0.75, 0.9)).sats, 40);
});

test('stopReady/useStop: Abkühlung und Aufräumen', () => {
  const s = emptySaveV3();
  assert.equal(stopReady(s, 'osm1', 1000), true);
  useStop(s, 'osm1', 1000);
  assert.equal(stopReady(s, 'osm1', 1000 + CONST.STOP_COOLDOWN - 1), false);
  assert.equal(stopReady(s, 'osm1', 1000 + CONST.STOP_COOLDOWN), true);
  assert.equal(s.stats.stops, 1);
  useStop(s, 'osm2', 1000 + CONST.STOP_COOLDOWN + 5);
  assert.equal('osm1' in s.stopCooldowns, false);
  assert.equal(s.stats.stops, 2);
});

test('cacheCell und fakeStops', () => {
  assert.equal(cacheCell(P), cacheCell(offsetPoint(P, 40, 0)));
  assert.notEqual(cacheCell(P), cacheCell(offsetPoint(P, 400, 0)));
  const f = fakeStops(P, seq(0.5));
  assert.equal(f.length, 3);
  assert.ok(f.every(x => x.dist >= 14 && x.dist <= 121 && x.id.startsWith('fake')));
  assert.ok(f[0].dist <= 36, `erster Fake-Stop in Reichweite: ${f[0].dist}`);
});
