import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, randomPointInRing, offsetPoint } from '../js/geo.js';
import { updateSpawns } from '../js/spawn.js';
import { CONST, ARENAS, RUETHERS } from '../js/data.js';

// rng, der eine feste Folge liefert und danach den letzten Wert wiederholt
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
// Punkt in Hagen, der von allen Arenen weiter als 500 m entfernt ist
const HAGEN = { lat: 51.37, lon: 7.48 };
const PCSALE = ARENAS.find(a => a.id === 'pcsale');

test('distance: Hüttenbergstraße nach PC Sale ca. 2.3 km', () => {
  const a = ARENAS.find(x => x.id === 'huettenberg');
  const d = distance(a, PCSALE);
  assert.ok(d > 2200 && d < 2500, `got ${d}`);
});

test('randomPointInRing liegt im Ring', () => {
  for (const r of [0, 0.5, 0.999]) {
    const p = randomPointInRing(HAGEN, 30, 250, seq(r, 0.3));
    const d = distance(HAGEN, p);
    assert.ok(d >= 29 && d <= 251, `got ${d}`);
  }
});

test('offsetPoint 40 m nach Norden', () => {
  const p = offsetPoint(HAGEN, 40, 0);
  const d = distance(HAGEN, p);
  assert.ok(d > 39 && d < 41, `got ${d}`);
});

test('ohne Spielerposition keine Spawns', () => {
  assert.deepEqual(updateSpawns({ spawns: [], player: null, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0.5) }), []);
});

test('irgendwo in Hagen: nur Christian und Viktor, 2-4 Stück, im Ring', () => {
  const list = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 1000, rng: seq(0.99, 0.2, 0.7, 0.1, 0.9, 0.5, 0.3, 0.8) });
  assert.ok(list.length >= CONST.SPAWN_MIN && list.length <= CONST.SPAWN_MAX, `got ${list.length}`);
  for (const s of list) {
    assert.ok(['christian', 'viktor'].includes(s.ruetherId), s.ruetherId);
    const d = distance(HAGEN, s);
    assert.ok(d >= CONST.SPAWN_RING[0] - 1 && d <= CONST.SPAWN_RING[1] + 1, `got ${d}`);
    assert.equal(s.expires, 1000 + CONST.SPAWN_LIFETIME);
  }
});

test('am PC Sale ist Onkel Micha garantiert dabei, nahe der Arena', () => {
  const near = offsetPoint(PCSALE, 100, 0);
  const list = updateSpawns({ spawns: [], player: near, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0, 0.1) });
  const micha = list.filter(s => s.ruetherId === 'micha');
  assert.equal(micha.length, 1);
  const d = distance(PCSALE, micha[0]);
  assert.ok(d >= 29 && d <= 151, `got ${d}`);
});

test('abgelaufene und zu weit entfernte Spawns fallen weg', () => {
  const old = [
    { id: 'a', ruetherId: 'christian', lat: HAGEN.lat, lon: HAGEN.lon, expires: 5 },
    { id: 'b', ruetherId: 'christian', ...offsetPoint(HAGEN, 1500, 0), expires: 99999 },
    { id: 'c', ruetherId: 'viktor', ...offsetPoint(HAGEN, 100, 0), expires: 99999 },
  ];
  const list = updateSpawns({ spawns: old, player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 10, rng: seq(0) });
  assert.ok(list.some(s => s.id === 'c'));
  assert.ok(!list.some(s => s.id === 'a'));
  assert.ok(!list.some(s => s.id === 'b'));
});

test('Pflicht-Spawn des ortsgebundenen Rüthers überschreitet SPAWN_MAX nicht', () => {
  const near = offsetPoint(PCSALE, 100, 0);
  const have = [1, 2, 3, 4].map(i => ({ id: 's' + i, ruetherId: 'viktor', ...offsetPoint(near, 50 * i, 0), expires: 99999 }));
  const list = updateSpawns({ spawns: have, player: near, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0.99) });
  assert.equal(list.length, CONST.SPAWN_MAX);
  assert.ok(list.some(s => s.ruetherId === 'micha'));
  assert.ok(!list.some(s => s.id === 's1'), 'ältester Anywhere-Spawn weicht');
});

test('bestehende Spawns werden nicht verdoppelt, wenn Zielzahl erreicht', () => {
  const have = [1, 2, 3, 4].map(i => ({ id: 's' + i, ruetherId: 'viktor', ...offsetPoint(HAGEN, 50 * i, 0), expires: 99999 }));
  const list = updateSpawns({ spawns: have, player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0.99) });
  assert.equal(list.length, 4);
});

test('v3: jeder Spawn hat eine Seltenheit, forceRarity erzwingt sie, Lockmodul erhöht die Zielzahl', () => {
  const a = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0) });
  assert.ok(a.every(s => s.rarity === 'normal'));
  const b = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0), forceRarity: 'legendaer' });
  assert.equal(b[0].rarity, 'legendaer', 'nur der erste neue Spawn wird erzwungen (Spec §9)');
  assert.ok(b.length > 1 && b.slice(1).every(s => s.rarity === 'normal'));
  const c = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0.99, 0.5), lure: true });
  assert.equal(c.length, CONST.LURE_SPAWN_MAX);
});
