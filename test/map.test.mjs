import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lureZoom, createMap, signRoom } from '../js/map.js';
import { updateSpawns } from '../js/spawn.js';
import { distance } from '../js/geo.js';
import { sell, sellDuplicates, buyAbility, upgradeAbility, emptySaveV3 } from '../js/progress.js';
import { FIXED, POOLS } from '../js/quest/abilities.js';
import { CONST, ARENAS, RUETHERS } from '../js/data.js';

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

// Nr. 3: Leaflet ordnet Marker nach y + zIndexOffset. Fake-L merkt sich die Optionen jedes Markers.
test('createMap: Arena-Schilder liegen über den Spawn-Gesichtern, die eigene Position ganz oben', () => {
  const made = [];
  const layer = () => { const o = new Proxy({}, { get: () => () => o }); return o; }; // jede Methode gibt sich selbst zurück
  globalThis.L = { map: layer, tileLayer: layer, circle: layer, layerGroup: layer, divIcon: o => o, marker: (ll, opts) => (made.push(opts), layer()) };
  Object.assign(globalThis, { ResizeObserver: class { observe() {} }, innerWidth: 390, innerHeight: 844 });
  try {
    const api = createMap({ el: { clientWidth: 0 }, arenas: ARENAS, onSpawnTap() {}, onArenaTap() {} });
    api.setSpawns([{ id: 's', ruetherId: 'ramona', rarity: 'normal', lat: ARENAS[0].lat, lon: ARENAS[0].lon }]);
    const z = cls => made.filter(o => o.icon.className.includes(cls)).map(o => o.zIndexOffset || 0);
    const arena = z('arena-icon'), spawn = z('spawn-icon'), player = z('player-');
    assert.equal(arena.length, ARENAS.length);
    assert.ok(Math.min(...arena) - Math.max(...spawn) >= 300, `Arena ${arena} über Spawn ${spawn}`); // Abstand > Höhenversatz zweier Marker
    assert.ok(Math.min(...player) > Math.max(...arena), `Spieler ${player} über Arena ${arena}`);
  } finally { for (const k of ['L', 'ResizeObserver', 'innerWidth', 'innerHeight']) delete globalThis[k]; }
});

// Nr. 3: weil die Schilder oben liegen, dürfen neue Spawns nicht darunter landen (map.js signRoom als avoid in updateSpawns)
const mulberry = a => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const inBlock = (b, p) => distance(b, { lat: p.lat, lon: b.lon }) < b.r && distance(b, { lat: b.lat, lon: p.lon }) < b.r;
test('updateSpawns: an Worringen/Keller landet kein Gesicht unter einem Arena-Schild', () => {
  const room = signRoom(ARENAS), home = { lat: 51.0625, lon: 6.8715 };
  const blocked = avoid => {
    let n = 0, bad = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const s of updateSpawns({ spawns: [], player: home, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: mulberry(seed), ...(avoid && { avoid }) })) {
        n++; if (room.some(b => inBlock(b, s))) bad++;
      }
    }
    return bad / n;
  };
  assert.ok(blocked([]) > 0.1, `ohne Sperre lägen ${blocked([])} unter Schildern`); // Gegenprobe: die Stelle ist eng
  assert.ok(blocked() < 0.005, `mit Sperre ${blocked()}`);
  // Keller-Schild ist rechts versetzt (map.js arenaAnchor): Sperrquadrat östlich des Kellers
  const k = ARENAS.find(a => a.id === 'keller'), kb = room[ARENAS.indexOf(k)];
  assert.ok(kb.lon > k.lon && distance(k, kb) > 50, 'Keller-Sperre liegt am versetzten Schild');
});

// Nr. 12: screens.js prüft Verkaufen/Kaufen/Upgrade mit flachen Kopien (dry) statt structuredClone(save) je Zeile. Das geht nur, solange
// diese Regeln keine Exemplare, kein Team und nichts außer box/sats/questAbilities anfassen. Eingefroren wirft jeder andere Schreibzugriff.
const dry = (save, fn, ...a) => fn({ ...save, box: [...save.box], team: [...save.team], questAbilities: structuredClone(save.questAbilities || {}) }, ...a); // wie js/screens.js
const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
test('Sammlung: Proben über flache Kopien ändern den Spielstand nicht und rechnen wie das Original', () => {
  const s = emptySaveV3();
  s.sats = 2500;
  s.box = [1, 2, 3, 4].map(uid => ({ uid, id: 'christian', rarity: uid < 4 ? 'normal' : 'selten', level: uid, caughtAt: 0 }));
  s.team = [1];
  const before = structuredClone(s);
  deepFreeze(s);
  const pool = POOLS.christian[0], fixed = FIXED.christian[0];
  const probes = [[sell, 1], [sell, 2], [sell, 4], [sell, 99], [sellDuplicates, 'christian'], [buyAbility, 'christian', pool], [upgradeAbility, 'christian', fixed]];
  for (const [fn, ...a] of probes) assert.deepEqual(dry(s, fn, ...a), fn(structuredClone(before), ...a), `${fn.name}(${a})`);
  assert.deepEqual(s, before);
});
