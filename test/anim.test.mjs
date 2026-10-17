import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMap, lureZoom, faceGap, signRoom } from '../js/map.js';
import { updateSpawns } from '../js/spawn.js';
import { distance } from '../js/geo.js';
import { countText } from '../js/format.js';
import { CONST, ARENAS, RUETHERS } from '../js/data.js';

// Fixes Animationen/Karte (Runde nach v10): Lande-Animation, Punkt ohne Ortung, Lockmodul-Ring, Spawn-Abstand, Einzahl

// Fake-L: Marker mit classList und style, merkt sich, ob er auf der Karte liegt
function fakeMap() {
  const markers = [];
  const layer = () => { const o = new Proxy({}, { get: () => () => o }); return o; };
  const map = { hasLayer: m => m.onMap, setView: () => map, panTo: () => map, getZoom: () => 16, on: () => map, off: () => map, invalidateSize() {} };
  const marker = (ll, opts) => {
    const cl = new Set(), props = {};
    const el = { offsetWidth: 0, style: { setProperty: (k, v) => { props[k] = v; } },
      classList: { add: c => cl.add(c), remove: c => cl.delete(c), contains: c => cl.has(c), toggle: (c, on = !cl.has(c)) => (on ? cl.add(c) : cl.delete(c), on) } };
    let pos = ll;
    const m = { opts, cl, props, onMap: false, el, setLatLng(p) { pos = p; return m; }, getLatLng: () => ({ lat: pos[0], lng: pos[1] }),
      addTo() { m.onMap = true; return m; }, remove() { m.onMap = false; return m; }, getElement: () => el, on: () => m, setIcon: () => m };
    markers.push(m);
    return m;
  };
  Object.assign(globalThis, { L: { map: () => map, tileLayer: layer, circle: layer, layerGroup: layer, divIcon: o => o, marker },
    ResizeObserver: class { observe() {} }, innerWidth: 390, innerHeight: 844 });
  const api = createMap({ el: { clientWidth: 390, clientHeight: 626 }, arenas: ARENAS, onSpawnTap() {}, onArenaTap() {} });
  const find = cls => markers.find(m => m.opts.icon.className.startsWith(cls));
  return { api, player: find('player-dot'), pulse: find('player-pulse') };
}
const cleanup = () => { for (const k of ['L', 'ResizeObserver', 'innerWidth', 'innerHeight']) delete globalThis[k]; };

test('Haunebu-Flug: nach der Landung bleibt keine .land am Punkt (fl-land startete sonst bei jeder Rückkehr zur Karte neu)', () => {
  const { api, player, pulse } = fakeMap();
  try {
    api.setPlayer({ lat: 51.36, lon: 7.47 });
    api.liftPlayer(true); // Abholen
    assert.ok(player.cl.has('lift') && !player.cl.has('land'));
    api.liftPlayer(false, { lat: 51.359, lon: 7.463 }); // Absetzen am Ziel
    assert.ok(player.cl.has('land') && pulse.cl.has('land') && !player.cl.has('lift'), 'Landung läuft');
    api.liftPlayer(false); // Flugende (finally in flight.js)
    assert.ok(!player.cl.has('land') && !pulse.cl.has('land'), 'Lande-Klasse wieder weg');
    assert.deepEqual(player.getLatLng(), { lat: 51.359, lng: 7.463 });
  } finally { cleanup(); }
});

test('Ohne Ortung: setPlayer(null) nimmt Punkt und Puls von der Karte, eine neue Position bringt sie zurück', () => {
  const { api, player, pulse } = fakeMap();
  try {
    api.setPlayer({ lat: 51.36, lon: 7.47 });
    assert.ok(player.onMap && pulse.onMap);
    api.setPlayer(null);
    assert.ok(!player.onMap && !pulse.onMap);
    api.setPlayer({ lat: 51.37, lon: 7.48 });
    assert.ok(player.onMap && pulse.onMap);
  } finally { cleanup(); }
});

test('Lockmodul-Welle: der Ring reicht bis über die äußersten Wellen-Gesichter (90 m + halbes Gesicht beim Lock-Zoom)', () => {
  const { api, pulse } = fakeMap();
  try {
    api.setPlayer({ lat: 51.36, lon: 7.47 });
    api.wave();
    const d = parseFloat(pulse.props['--wave']), m = (156543 * Math.cos((51.36 * Math.PI) / 180)) / 2 ** lureZoom(51.36, 390);
    assert.equal(d, Math.round(2 * (CONST.LURE_RING[1] / m + 26)));
    assert.ok(d / 2 > CONST.LURE_RING[1] / m, `Radius ${d / 2} px, äußere Zellen bei ${CONST.LURE_RING[1] / m} px`);
    assert.ok(pulse.cl.has('wave'));
  } finally { cleanup(); }
});

const mulberry = a => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
test('updateSpawns: normale Gesichter decken sich nicht (je Achse mindestens faceGap), auch in der Rüther-Stunde kaum', () => {
  const home = ARENAS.find(a => a.id === 'huettenberg'), g = faceGap(home.lat), room = signRoom(ARENAS);
  const near = (a, b) => distance(a, { lat: b.lat, lon: a.lon }) < g && distance(a, { lat: a.lat, lon: b.lon }) < g;
  const run = (lure, gap) => {
    let bad = 0, sign = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const l = updateSpawns({ spawns: [], player: home, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: mulberry(seed), lure, gap });
      if (l.some((a, i) => l.some((b, j) => j > i && near(a, b)))) bad++;
      sign += l.filter(s => room.some(b => distance(b, { lat: s.lat, lon: b.lon }) < b.r && distance(b, { lat: b.lat, lon: s.lon }) < b.r)).length;
    }
    return { bad: bad / 500, sign };
  };
  assert.ok(g > 70 && g < 85, `faceGap ${g}`); // 2 × 26 px bei Zoom 16 in Hagen
  assert.ok(run(false, 0).bad > 0.25 && run(true, 0).bad > 0.7, 'Gegenprobe ohne Abstand: Gesichter liegen übereinander');
  assert.ok(run(false).bad < 0.01, `normal ${run(false).bad}`);
  assert.ok(run(true).bad < 0.05, `Rüther-Stunde ${run(true).bad}`);
  assert.equal(run(true).sign, 0, 'die Schilder gehen weiter vor');
});

test('countText: Einzahl bei genau 1 („1 Baum“), sonst Mehrzahl', () => {
  assert.equal(countText(1, ['Baum', 'Bäume']), '1 Baum');
  assert.equal(countText(0, ['Baum', 'Bäume']), '0 Bäume');
  assert.equal(countText(3, ['Anschluss', 'Anschlüsse']), '3 Anschlüsse');
  assert.equal(countText(1, ['Münze', 'Münzen']), '1 Münze');
});
