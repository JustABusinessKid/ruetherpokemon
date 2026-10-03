# Rüther GO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pokémon-GO-Parodie als Web-App: Rüthers per GPS in der echten Welt fangen und drei Arenen an echten Adressen besiegen.

**Architecture:** Reine Browser-App ohne Build. Reine Logik (Daten, Kampf, Spawns, Geo) liegt in testbaren ES-Modulen ohne DOM; die DOM-Schichten (Karte, Fang-, Team-, Arena-, Kampf-Screen) sind dünne Adapter, `app.js` verdrahtet alles. Spielstand in `localStorage`.

**Tech Stack:** HTML/CSS/JS (ES-Module), Leaflet 1.9.4 + OpenStreetMap, Browser-Geolocation, Node 22 `node:test` für Tests, Python 3 + Pillow für die Sprite-Erzeugung.

**Spec:** `docs/superpowers/specs/2026-10-03-ruether-go-design.md` — bei Zweifel gilt die Spec.

**Allgemeine Regeln für alle Tasks:**
- Alle Dateien UTF-8 ohne BOM, LF.
- Kein Commit aus parallel laufenden Agenten; Commits macht der Orchestrator nach jeder abgeschlossenen Task-Gruppe (sonst `index.lock`-Konflikte).
- Tests laufen mit `node --test test/` im Projektordner `D:\GPTDev\ruetherpokemon`.
- Lokaler Server zum Prüfen: `python -m http.server 8000` → `http://localhost:8000/?debug=1`.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `index.html` | Alle Screens als `<section class="screen">`, lädt Leaflet + `js/app.js` |
| `style.css` | Mobile-first Layout, Pixel-Rendering, Animationen |
| `manifest.json` | Homescreen-Install |
| `js/data.js` | Rüthers, Bosse, Arenen, Konstanten. Keine Logik. |
| `js/storage.js` | `load()/save()/clear()` mit try/catch |
| `js/geo.js` | `distance`, `randomPointInRing`, `offsetPoint`, `createLocator` (GPS + Fake) |
| `js/spawn.js` | `updateSpawns` (reine Logik) |
| `js/battle.js` | `makeFighter`, `createBattle`, `playerAttack`, `playerSwitch` (reine Logik) |
| `js/map.js` | Leaflet-Adapter: Spieler, Spawn-Marker, Arena-Marker |
| `js/catch.js` | Fang-Screen (DOM) |
| `js/screens.js` | Team-, Arena-, Kampf-, Sieg-Screen (DOM) |
| `js/app.js` | Verdrahtung, Screen-Wechsel, HUD, Debug-Panel |
| `tools/pixelate.py` | erzeugt `sprites/*.png` |
| `test/battle.test.mjs`, `test/spawn.test.mjs` | Tests |

---

### Task 1: Daten, Speicher, Grundgerüst

**Files:**
- Create: `js/data.js`
- Create: `js/storage.js`
- Create: `manifest.json`

- [ ] **Step 1: `js/data.js` anlegen**

```js
// Reine Daten. Lebensenergie heißt BTC.
export const CONST = {
  SPAWN_INTERVAL: 60_000,
  SPAWN_LIFETIME: 600_000,
  SPAWN_MIN: 2,
  SPAWN_MAX: 4,
  SPAWN_RING: [30, 250],
  LOCAL_ZONE: 500,
  LOCAL_SPAWN_RING: [30, 150],
  SPAWN_FORGET: 1000,
  CATCH_RANGE: 50,
  ARENA_RANGE: 100,
  THROWS: 3,
  HIT_CHANCE: 0.9,
  DUP_BONUS: 10,
  DUP_CAP: 50,
  TEAM_SIZE: 3,
  SUMMON_TURNS: 3,
};

export const ARENAS = [
  { id: 'worringen', name: 'Rütherschanze Worringen', address: 'Langeler Weg 23, 50769 Köln', lat: 51.0631420, lon: 6.8722528, boss: 'satoshi' },
  { id: 'huettenberg', name: 'Hüttenbergstraße', address: 'Hüttenbergstraße 55, 58091 Hagen', lat: 51.3440710, lon: 7.4877959, boss: 'schanze' },
  { id: 'pcsale', name: 'PC Sale', address: 'Augustastraße 1, 58089 Hagen', lat: 51.3589214, lon: 7.4631893, boss: 'ps3' },
];

// spawn: 'anywhere' oder die id der Arena, um die der Rüther auftaucht
export const RUETHERS = [
  {
    id: 'christian', name: 'Christian', title: 'Herr der Netzwerke', btc: 100, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Handelt mit Bitcoin, bei ihm steigt der Kurs immer um 70 %. Ex-Vice-President der Deutschen Bank.',
    attacks: [
      { name: 'Plus 70 Prozent', damage: 30, alwaysHit: true },
      { name: 'Vice-President-Handschlag', damage: 10, weaken: 3 },
      { name: 'Werfen mit Dosenbier', damage: 20 },
    ],
  },
  {
    id: 'hildegard', name: 'Hildegard', title: 'Herrscherin der Schanze', btc: 120, catchChance: 0.35, spawn: 'huettenberg',
    desc: 'Herrscht über die Rütherschanze. Ruft die Familie zu Hilfe.',
    attacks: [
      { name: 'Familientreffen', damage: 0, once: true, summon: [{ name: 'Christian', damage: 10 }, { name: 'Onkel Micha', damage: 10 }] },
      { name: 'Handtaschen-Hieb', damage: 20 },
    ],
  },
  {
    id: 'micha', name: 'Onkel Micha', title: 'Herrscher des PC Sale', btc: 100, catchChance: 0.35, spawn: 'pcsale',
    desc: 'Hat eine PS3 und baut sie zur Hardware-Wallet um.',
    attacks: [
      { name: 'Hardware-Wallet-Umbau', damage: 20, drain: true },
      { name: 'Controllerwurf', damage: 25 },
    ],
  },
  {
    id: 'viktor', name: 'Viktor', title: 'Möchtegern-Herrscher der Börse', btc: 90, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Stinkt stark. Hat vor der Börse in New York gestanden.',
    attacks: [
      { name: 'Giftgas', damage: 10, poison: { perTurn: 10, turns: 3 } },
      { name: 'Ungeschlagene Argumentationslogik', damage: 10, skip: true, flavour: 'Deutsche Bank ist kein Geringverdiener.' },
    ],
  },
  {
    id: 'ramona', name: 'Ramona Rüther', title: 'Herrscherin der Arbeitslosigkeit', btc: 90, catchChance: 0.35, spawn: 'worringen',
    desc: 'Frau von Christian. Hat seit sieben Jahren offene M&Ms.',
    attacks: [
      { name: 'Abgelaufene M&Ms', damage: 15, poison: { perTurn: 8, turns: 3 } },
      { name: 'Unlimited Credits', damage: 0, heal: 40 },
    ],
  },
];

export const BOSSES = {
  ps3: {
    id: 'ps3', name: 'Playstation 3', btc: 130,
    attacks: [
      { name: 'Blu-ray-Wurf', damage: 25 },
      { name: 'Yellow Light of Death', damage: 20, poison: { perTurn: 5, turns: 3 } },
      { name: 'Firmware-Update', damage: 0, skip: true },
    ],
  },
  schanze: {
    id: 'schanze', name: 'Herr der Rütherschanze', btc: 180,
    attacks: [
      { name: 'Kurssturz', damage: 30 },
      { name: 'Mining', damage: 0, heal: 25 },
      { name: 'Blockchain-Kette', damage: 15, poison: { perTurn: 10, turns: 3 } },
    ],
  },
  satoshi: {
    id: 'satoshi', name: 'Satoshi Nakamoto', btc: 220,
    attacks: [
      { name: 'Genesis Block', damage: 25 },
      { name: 'Halving', damage: 35, everyN: 3 },
      { name: 'Private Key verloren', damage: 0, heal: 30 },
    ],
  },
};

export const RUETHER_BY_ID = Object.fromEntries(RUETHERS.map(r => [r.id, r]));
export const ARENA_BY_ID = Object.fromEntries(ARENAS.map(a => [a.id, a]));
```

- [ ] **Step 2: `js/storage.js` anlegen**

```js
const KEY = 'ruether-go';

export const emptySave = () => ({ version: 1, caught: {}, team: [], arenasBeaten: [], victoryShown: false });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return emptySave();
    return { ...emptySave(), ...d };
  } catch {
    return emptySave();
  }
}

// true = gespeichert, false = localStorage gesperrt/voll
export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
```

- [ ] **Step 3: `manifest.json` anlegen**

```json
{
  "name": "Rüther GO",
  "short_name": "Rüther GO",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#1b1b1f",
  "theme_color": "#f7931a",
  "icons": [{ "src": "sprites/coin.png", "sizes": "256x256", "type": "image/png" }]
}
```

- [ ] **Step 4: Syntax prüfen**

Run: `node --input-type=module -e "import('./js/data.js').then(m => console.log(m.RUETHERS.length, Object.keys(m.BOSSES).length, m.ARENAS.length))"`
Expected: `5 3 3`

---

### Task 2: Geo und Spawns (TDD)

**Files:**
- Create: `js/geo.js`
- Create: `js/spawn.js`
- Test: `test/spawn.test.mjs`

- [ ] **Step 1: Failing Test schreiben `test/spawn.test.mjs`**

```js
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

test('bestehende Spawns werden nicht verdoppelt, wenn Zielzahl erreicht', () => {
  const have = [1, 2, 3, 4].map(i => ({ id: 's' + i, ruetherId: 'viktor', ...offsetPoint(HAGEN, 50 * i, 0), expires: 99999 }));
  const list = updateSpawns({ spawns: have, player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0.99) });
  assert.equal(list.length, 4);
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `node --test test/spawn.test.mjs`
Expected: FAIL mit `Cannot find module` für `js/geo.js`

- [ ] **Step 3: `js/geo.js` schreiben**

```js
const R = 6371000;
const toRad = d => (d * Math.PI) / 180;
const M_PER_DEG_LAT = 111320;

// Haversine, Meter. a/b: {lat, lon}
export function distance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Punkt metersNorth/metersEast von center entfernt
export function offsetPoint(center, metersNorth, metersEast) {
  return {
    lat: center.lat + metersNorth / M_PER_DEG_LAT,
    lon: center.lon + metersEast / (M_PER_DEG_LAT * Math.cos(toRad(center.lat))),
  };
}

// Zufälliger Punkt im Ring [minM, maxM] um center. rng: () => [0,1)
export function randomPointInRing(center, minM, maxM, rng) {
  const d = minM + rng() * (maxM - minM);
  const ang = rng() * 2 * Math.PI;
  return offsetPoint(center, d * Math.cos(ang), d * Math.sin(ang));
}

// GPS mit Fake-Position für den Test-Modus.
// onPosition({lat, lon}) bei jeder Änderung; onError(err) wenn Ortung nicht geht.
export function createLocator({ onPosition, onError }) {
  let fake = null;
  let last = null;
  if (!navigator.geolocation) {
    onError(new Error('Keine Ortung verfügbar'));
  } else {
    navigator.geolocation.watchPosition(
      p => {
        last = { lat: p.coords.latitude, lon: p.coords.longitude };
        if (!fake) onPosition(last);
      },
      e => { if (!fake) onError(e); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  return {
    setFake(pos) { fake = pos; onPosition(pos); },
    clearFake() { fake = null; if (last) onPosition(last); },
    get current() { return fake || last; },
    get isFake() { return fake !== null; },
  };
}
```

- [ ] **Step 4: `js/spawn.js` schreiben**

```js
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

  // mindestens ein Spawn pro ortsgebundenem Rüther in der Zone
  for (const { r } of local) {
    if (!list.some(s => s.ruetherId === r.id)) list.push(place(r));
  }
  const pool = [...anywhere, ...local.map(x => x.r)];
  while (list.length < target) {
    list.push(place(pool[Math.floor(rng() * pool.length)]));
  }
  return list;
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `node --test test/spawn.test.mjs`
Expected: alle 8 Tests PASS

---

### Task 3: Kampf-Engine (TDD)

**Files:**
- Create: `js/battle.js`
- Test: `test/battle.test.mjs`

- [ ] **Step 1: Failing Test schreiben `test/battle.test.mjs`**

Aufrufmuster des Zufalls pro Runde (wichtig für die Folgen unten): 1. Spieler-Trefferwurf
(nur bei `damage > 0` ohne `alwaysHit`), 2. Gegner wählt Attacke, 3. Gegner-Trefferwurf
(nur bei `damage > 0` ohne `alwaysHit`). Der Dummy-Gegner hat deshalb `alwaysHit`, damit
pro Runde genau zwei Aufrufe passieren.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFighter, createBattle, playerAttack, playerSwitch } from '../js/battle.js';
import { RUETHER_BY_ID, BOSSES } from '../js/data.js';

// feste Folge, danach wiederholt sich der letzte Wert
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
// feste Folge, die sich zyklisch wiederholt
const cycle = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const HIT = 0.1;   // < 0.9 → Treffer
const MISS = 0.95; // >= 0.9 → verfehlt
const F = (id, bonus = 0) => makeFighter(RUETHER_BY_ID[id], bonus);
// Dummy-Gegner: 1 Schaden, trifft immer (verbraucht keinen Trefferwurf)
const dummy = (btc = 500) => ({ id: 'dummy', name: 'Dummy', btc, maxBtc: btc, attacks: [{ name: 'Piks', damage: 1, alwaysHit: true }], status: { poison: null, skip: false, weakened: 0 }, used: {} });
const battle = (team, enemy, rng) => createBattle({ team, enemy, rng });

test('makeFighter: BTC = Basis + Bonus', () => {
  const f = F('christian', 20);
  assert.equal(f.btc, 120);
  assert.equal(f.maxBtc, 120);
  assert.deepEqual(f.status, { poison: null, skip: false, weakened: 0 });
});

test('Treffer macht Schaden, Fehlschlag nicht', () => {
  let s = battle([F('christian')], dummy(), seq(HIT, HIT));
  s = playerAttack(s, 2); // Dosenbier 20
  assert.equal(s.enemy.btc, 480);
  let m = battle([F('christian')], dummy(), seq(MISS, HIT));
  m = playerAttack(m, 2);
  assert.equal(m.enemy.btc, 500);
  assert.ok(m.log.some(l => l.includes('verfehlt')));
});

test('alwaysHit trifft auch bei rng 0.99', () => {
  let s = battle([F('christian')], dummy(), seq(0.99, HIT));
  s = playerAttack(s, 0); // Plus 70 Prozent 30
  assert.equal(s.enemy.btc, 470);
});

test('Gegner-Attacke trifft den aktiven Rüther', () => {
  let s = battle([F('christian')], dummy(), seq(HIT, 0, HIT));
  s = playerAttack(s, 2);
  assert.equal(s.team[0].btc, 99);
  assert.equal(s.turn, 2);
});

test('Gift: 3 Runden Schaden, dann weg; überschreibt statt stapelt', () => {
  let s = battle([F('viktor')], dummy(), seq(HIT, 0, HIT, 0, MISS, 0, MISS, 0, MISS, 0));
  s = playerAttack(s, 0); // Runde 1: Giftgas trifft: 10 + Gift-Tick 10
  assert.equal(s.enemy.btc, 480);
  assert.deepEqual(s.enemy.status.poison, { perTurn: 10, turns: 2 });
  s = playerAttack(s, 0); // Runde 2: trifft wieder, Gift überschrieben auf 3, Tick → 2
  assert.equal(s.enemy.btc, 460);
  assert.equal(s.enemy.status.poison.turns, 2);
  s = playerAttack(s, 0); // Runde 3: verfehlt, Tick → 1
  assert.equal(s.enemy.btc, 450);
  s = playerAttack(s, 0); // Runde 4: verfehlt, Tick → 0, Gift weg
  assert.equal(s.enemy.btc, 440);
  assert.equal(s.enemy.status.poison, null);
  s = playerAttack(s, 0); // Runde 5: verfehlt, kein Gift mehr
  assert.equal(s.enemy.btc, 440);
});

test('Aussetzen: Gegner handelt in dieser Runde nicht', () => {
  let s = battle([F('viktor')], dummy(), seq(HIT, 0));
  s = playerAttack(s, 1); // Argumentationslogik 10 + skip
  assert.equal(s.team[0].btc, 90); // Dummy hat nicht zugeschlagen
  assert.ok(s.log.some(l => l.includes('setzt aus')));
  assert.ok(s.log.some(l => l.includes('Geringverdiener')));
  assert.equal(s.enemy.status.skip, false);
  s = playerAttack(s, 0); // Runde 2: Giftgas, Dummy darf wieder
  assert.equal(s.team[0].btc, 89);
});

test('Weaken: Gegner macht 3 Runden lang floor(×0.75)', () => {
  const big = dummy(500);
  big.attacks = [{ name: 'Hieb', damage: 10, alwaysHit: true }];
  let s = battle([F('christian', 100)], big, seq(HIT, 0, HIT));
  s = playerAttack(s, 1); // Handschlag: Gegner weakened=3 → Hieb macht 7
  assert.equal(s.team[0].btc, 200 - 7);
  s = playerAttack(s, 2); // weakened 2 → 7
  assert.equal(s.team[0].btc, 200 - 14);
  s = playerAttack(s, 2); // weakened 1 → 7
  assert.equal(s.team[0].btc, 200 - 21);
  s = playerAttack(s, 2); // weakened 0 → 10
  assert.equal(s.team[0].btc, 200 - 31);
});

test('Drain heilt, aber nicht über maxBtc', () => {
  let s = battle([F('micha')], dummy(), seq(HIT, 0));
  s = playerAttack(s, 0); // Wallet-Umbau 20, voll → keine Heilung, dann Piks 1
  assert.equal(s.team[0].btc, 99);
  s = playerAttack(s, 0); // 20 Schaden, heilt 1 (auf 100), dann Piks → 99
  assert.equal(s.team[0].btc, 99);
  assert.equal(s.enemy.btc, 460);
});

test('Heal nicht über maxBtc', () => {
  let s = battle([F('ramona')], dummy(), seq(HIT, 0));
  s = playerAttack(s, 1); // Unlimited Credits bei vollen BTC → +0, dann Piks
  assert.equal(s.team[0].btc, 89);
  s = playerAttack(s, 1); // +1 → 90, Piks → 89
  assert.equal(s.team[0].btc, 89);
});

test('Familientreffen: 3 Runden je 10+10, zweiter Einsatz tut nichts', () => {
  let s = battle([F('hildegard')], dummy(), seq(0));
  s = playerAttack(s, 0); // Summon, dann greifen beide an: 20
  assert.equal(s.enemy.btc, 480);
  assert.equal(s.summons.length, 2);
  s = playerAttack(s, 0); // zweiter Einsatz: nichts, Summons 20
  assert.ok(s.log.some(l => l.includes('schon da')));
  assert.equal(s.enemy.btc, 460);
  s = playerAttack(s, 0); // dritter: Summons letzter Schlag 20
  assert.equal(s.enemy.btc, 440);
  assert.equal(s.summons.length, 0);
  s = playerAttack(s, 0);
  assert.equal(s.enemy.btc, 440);
});

test('Halving nur in Runden 3, 6, 9; Boss heilt nur unter 50 %', () => {
  const satoshi = makeFighter(BOSSES.satoshi);
  // pro Runde drei Aufrufe: Spieler-Wurf trifft, Boss wählt letzten Kandidaten, Boss-Wurf trifft
  let s = battle([F('hildegard', 50)], satoshi, cycle(HIT, 0.99, HIT));
  const picks = [];
  for (let i = 0; i < 6; i++) {
    s = playerAttack(s, 1); // Handtaschen-Hieb 20
    picks.push(s.log.find(l => l.startsWith('Satoshi Nakamoto setzt')));
  }
  // Runden 1,2: Kandidaten [Genesis] (Boss > 50 %), Runde 3: [Genesis, Halving] → Halving
  assert.match(picks[0], /Genesis Block/);
  assert.match(picks[1], /Genesis Block/);
  assert.match(picks[2], /Halving/);
  assert.match(picks[3], /Genesis Block/);
  assert.match(picks[4], /Genesis Block/);
  // Runde 6: Boss hat 220-120=100 < 110 → [Genesis, Halving, Private Key] → letzter = heilt
  assert.match(picks[5], /Private Key verloren/);
});

test('Wechsel kostet die Runde', () => {
  let s = battle([F('christian'), F('viktor')], dummy(), seq(0));
  s = playerSwitch(s, 1);
  assert.equal(s.active, 1);
  assert.equal(s.enemy.btc, 500);
  assert.equal(s.team[1].btc, 89); // Dummy hat Viktor getroffen
  assert.equal(s.turn, 2);
});

test('Wechsel auf pleite oder aktiven Rüther ist ungültig', () => {
  const s = battle([F('christian'), F('viktor')], dummy(), seq(0));
  assert.throws(() => playerSwitch(s, 0));
  s.team[1].btc = 0;
  assert.throws(() => playerSwitch(s, 1));
});

test('Spieler-Rüther setzt aus, wenn der Boss ihn dazu zwingt', () => {
  const ps3 = makeFighter(BOSSES.ps3);
  // Boss wählt Index 2 (Firmware-Update) mit rng 0.99
  let s = battle([F('christian')], ps3, seq(HIT, 0.99, HIT, 0));
  s = playerAttack(s, 2);
  assert.equal(s.team[0].status.skip, true);
  s = playerAttack(s, 0); // sollte aussetzen, Plus 70 Prozent passiert nicht
  assert.equal(s.enemy.btc, 130 - 20);
  assert.equal(s.team[0].status.skip, false);
});

test('Team-Wechsel bei 0 BTC, Niederlage wenn alle pleite', () => {
  const killer = dummy(500);
  killer.attacks = [{ name: 'Rugpull', damage: 1000 }];
  let s = battle([F('christian'), F('viktor')], killer, seq(HIT, 0));
  s = playerAttack(s, 2);
  assert.equal(s.team[0].btc, 0);
  assert.equal(s.active, 1);
  assert.equal(s.over, false);
  assert.ok(s.log.some(l => l.includes('pleite')));
  s = playerAttack(s, 0);
  assert.equal(s.over, true);
  assert.equal(s.won, false);
});

test('Sieg wenn Gegner pleite, Rest der Runde entfällt', () => {
  let s = battle([F('christian')], dummy(25), seq(HIT, 0));
  s = playerAttack(s, 0); // 30 → Gegner 0
  assert.equal(s.over, true);
  assert.equal(s.won, true);
  assert.equal(s.enemy.btc, 0);
  assert.equal(s.team[0].btc, 100); // Dummy kam nicht mehr dran
});

test('Input-State wird nicht mutiert', () => {
  const s0 = battle([F('christian')], dummy(), seq(HIT, 0));
  const snapshot = JSON.stringify({ ...s0, rng: undefined });
  playerAttack(s0, 0);
  assert.equal(JSON.stringify({ ...s0, rng: undefined }), snapshot);
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `node --test test/battle.test.mjs`
Expected: FAIL mit `Cannot find module` für `js/battle.js`

- [ ] **Step 3: `js/battle.js` schreiben**

```js
import { CONST } from './data.js';

export function makeFighter(def, bonusBtc = 0) {
  const max = def.btc + bonusBtc;
  return {
    id: def.id,
    name: def.name,
    btc: max,
    maxBtc: max,
    attacks: def.attacks,
    status: { poison: null, skip: false, weakened: 0 },
    used: {},
  };
}

export function createBattle({ team, enemy, rng = Math.random }) {
  return {
    team: structuredClone(team),
    active: 0,
    enemy: structuredClone(enemy),
    turn: 1,
    summons: [],
    log: [],
    over: false,
    won: null,
    rng,
  };
}

function cloneState(state) {
  const { rng, ...rest } = state;
  return { ...structuredClone(rest), rng, log: [] };
}

function heal(f, amount, log, verb) {
  const h = Math.max(0, Math.min(amount, f.maxBtc - f.btc));
  f.btc += h;
  log.push(`${f.name} ${verb} ${h} BTC.`);
}

function resolveAttack(s, attacker, target, attack) {
  const log = s.log;
  const needsRoll = attack.damage > 0 && !attack.alwaysHit;
  if (needsRoll && s.rng() >= CONST.HIT_CHANCE) {
    log.push(`${attacker.name} setzt ${attack.name} ein... und verfehlt!`);
    return;
  }
  if (attack.once && attacker.used[attack.name]) {
    log.push('Die Familie ist schon da.');
    return;
  }
  if (attack.once) attacker.used[attack.name] = true;

  let dealt = 0;
  if (attack.damage > 0) {
    dealt = Math.floor(attack.damage * (attacker.status.weakened > 0 ? 0.75 : 1));
    target.btc = Math.max(0, target.btc - dealt);
    log.push(`${attacker.name} setzt ${attack.name} ein! ${dealt} BTC Schaden.`);
  } else {
    log.push(`${attacker.name} setzt ${attack.name} ein!`);
  }
  if (attack.flavour) log.push(`"${attack.flavour}"`);
  if (attack.summon) {
    s.summons = attack.summon.map(x => ({ ...x, turns: CONST.SUMMON_TURNS }));
    log.push(`${attack.summon.map(x => x.name).join(' und ')} eilen herbei!`);
  }
  if (attack.weaken) { target.status.weakened = attack.weaken; log.push(`${target.name} ist geschwächt.`); }
  if (attack.poison) { target.status.poison = { ...attack.poison }; log.push(`${target.name} ist vergiftet.`); }
  if (attack.skip) { target.status.skip = true; log.push(`${target.name} muss aussetzen.`); }
  if (attack.drain && dealt > 0) heal(attacker, dealt, log, 'schreibt sich gut:');
  if (attack.heal) heal(attacker, attack.heal, log, 'heilt sich um');
}

function chooseEnemyAttack(s) {
  const e = s.enemy;
  const candidates = e.attacks.filter(a =>
    !(a.everyN && s.turn % a.everyN !== 0) &&
    !(a.heal && e.btc >= 0.5 * e.maxBtc));
  return candidates[Math.floor(s.rng() * candidates.length)];
}

function tickStatus(f, log) {
  if (f.status.poison) {
    f.btc = Math.max(0, f.btc - f.status.poison.perTurn);
    log.push(`${f.name} verliert ${f.status.poison.perTurn} BTC durch Gift.`);
    f.status.poison.turns -= 1;
    if (f.status.poison.turns <= 0) f.status.poison = null;
  }
  if (f.status.weakened > 0) f.status.weakened -= 1;
}

function end(s, won) {
  s.over = true;
  s.won = won;
  s.log.push(won ? `${s.enemy.name} ist pleite! Gewonnen!` : 'Alle Rüthers sind pleite. Verloren.');
  return s;
}

function finishRound(s) {
  // 2. Herbeigerufene greifen an
  for (const su of s.summons) {
    s.enemy.btc = Math.max(0, s.enemy.btc - su.damage);
    s.log.push(`${su.name} greift an! ${su.damage} BTC Schaden.`);
    su.turns -= 1;
  }
  s.summons = s.summons.filter(x => x.turns > 0);
  // 3. Gegner schon pleite?
  if (s.enemy.btc <= 0) return end(s, true);
  // 4. Gegner-Aktion
  const me = s.team[s.active];
  if (s.enemy.status.skip) {
    s.enemy.status.skip = false;
    s.log.push(`${s.enemy.name} setzt aus.`);
  } else {
    resolveAttack(s, s.enemy, me, chooseEnemyAttack(s));
  }
  // 5. Gift und Schwächung ticken
  tickStatus(me, s.log);
  tickStatus(s.enemy, s.log);
  // 6. Ausgang
  if (s.enemy.btc <= 0) return end(s, true);
  if (me.btc <= 0) {
    const next = s.team.findIndex(f => f.btc > 0);
    if (next === -1) return end(s, false);
    s.log.push(`${me.name} ist pleite! ${s.team[next].name}, du bist dran!`);
    s.active = next;
  }
  s.turn += 1;
  return s;
}

// Führt eine komplette Runde aus. Gibt neuen State zurück.
export function playerAttack(state, attackIndex) {
  if (state.over) return state;
  const s = cloneState(state);
  const me = s.team[s.active];
  if (me.status.skip) {
    me.status.skip = false;
    s.log.push(`${me.name} setzt aus.`);
  } else {
    resolveAttack(s, me, s.enemy, me.attacks[attackIndex]);
  }
  return finishRound(s);
}

// Wechsel des aktiven Rüthers, kostet die Runde.
export function playerSwitch(state, teamIndex) {
  if (state.over) return state;
  if (teamIndex === state.active || !state.team[teamIndex] || state.team[teamIndex].btc <= 0) {
    throw new Error('Ungültiger Wechsel');
  }
  const s = cloneState(state);
  s.active = teamIndex;
  s.log.push(`${s.team[teamIndex].name}, du bist dran!`);
  return finishRound(s);
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/`
Expected: alle Tests in beiden Dateien PASS (16 in battle, 8 in spawn)

---

### Task 4: Sprites erzeugen

**Files:**
- Create: `tools/pixelate.py`
- Create: `sprites/*.png` (generiert)

- [ ] **Step 1: `tools/pixelate.py` schreiben**

```python
"""Erzeugt sprites/*.png: Fotos pixeln, Platzhalter und Bosse zeichnen.
Aufruf im Projektordner: python tools/pixelate.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sprites"
SIZE = 32          # Pixel-Raster
SCALE = 8          # → 256×256
COLORS = 16

# Datei → (id, Crop-Box left, top, right, bottom)
PHOTOS = {
    "christian.jpg": ("christian", (56, 16, 200, 160)),
    "Hildegard.jpeg": ("hildegard", (20, 20, 180, 180)),
    "Onkel Micha.jpg": ("micha", (80, 60, 300, 280)),
    "viktor.png": ("viktor", (80, 110, 340, 370)),   # Rückansicht, gewollt
}


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # altes Pillow
        return ImageFont.load_default()


def finish(img, name):
    """32×32 → quantisieren → ×8 NEAREST → speichern"""
    img = img.convert("RGB").quantize(COLORS, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    big = img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST)
    big.save(OUT / f"{name}.png")
    print("ok", name)


def pixelate_photo(file, name, box):
    img = Image.open(ROOT / file).convert("RGB").crop(box)
    small = img.resize((SIZE, SIZE), Image.LANCZOS)
    finish(small, name)


def canvas(bg):
    img = Image.new("RGBA", (SIZE, SIZE), bg)
    return img, ImageDraw.Draw(img)


def draw_ramona():
    img, d = canvas((255, 182, 213))
    d.ellipse((9, 4, 23, 20), fill=(240, 200, 170))          # Kopf
    d.pieslice((8, 2, 24, 18), 180, 360, fill=(120, 70, 40))  # Haare
    d.rectangle((7, 10, 9, 20), fill=(120, 70, 40))
    d.rectangle((23, 10, 25, 20), fill=(120, 70, 40))
    d.point([(13, 11), (19, 11)], fill=(30, 30, 30))          # Augen
    d.line((14, 16, 18, 16), fill=(150, 60, 60))              # Mund
    d.rectangle((8, 21, 24, 31), fill=(200, 40, 80))          # Oberteil
    d.text((24, 22), "R", fill=(255, 255, 255), font=font(10))
    finish(img, "ramona")


def draw_unknown():
    img, d = canvas((60, 60, 70))
    d.ellipse((10, 4, 22, 16), fill=(30, 30, 36))
    d.ellipse((4, 17, 28, 40), fill=(30, 30, 36))
    d.text((7, 10), "???", fill=(200, 200, 210), font=font(9))
    finish(img, "unknown")


def draw_satoshi():
    img, d = canvas((20, 24, 40))
    d.polygon([(16, 2), (4, 18), (4, 31), (28, 31), (28, 18)], fill=(40, 40, 60))  # Kapuze
    d.ellipse((9, 8, 23, 22), fill=(5, 5, 10))                                      # Schatten-Gesicht
    d.text((12, 8), "?", fill=(255, 255, 255), font=font(13))
    finish(img, "satoshi")


def draw_schanze():
    img, d = canvas((230, 230, 240))
    d.rectangle((5, 20, 27, 31), fill=(30, 30, 40))      # Anzug
    d.polygon([(13, 20), (19, 20), (16, 27)], fill=(255, 255, 255))  # Hemd
    d.line((16, 21, 16, 26), fill=(200, 30, 30))           # Krawatte
    d.ellipse((7, 2, 25, 20), fill=(247, 147, 26))         # Bitcoin-Kopf
    d.ellipse((9, 4, 23, 18), outline=(200, 110, 10))
    d.text((12, 4), "B", fill=(255, 255, 255), font=font(12))
    d.line((15, 3, 15, 5), fill=(255, 255, 255))
    d.line((15, 17, 15, 19), fill=(255, 255, 255))
    finish(img, "schanze")


def draw_ps3():
    img, d = canvas((70, 70, 80))
    d.rounded_rectangle((2, 9, 29, 23), radius=3, fill=(10, 10, 12))
    d.rounded_rectangle((4, 11, 27, 21), radius=2, outline=(40, 40, 45))
    d.line((5, 15, 26, 15), fill=(60, 220, 90))             # Lichtleiste
    d.text((7, 16), "PS3", fill=(220, 220, 220), font=font(7))
    finish(img, "ps3")


def draw_coin():
    img, d = canvas((0, 0, 0, 0))
    d.ellipse((2, 2, 29, 29), fill=(247, 147, 26))
    d.ellipse((5, 5, 26, 26), outline=(255, 200, 100), width=1)
    d.text((11, 7), "B", fill=(255, 255, 255), font=font(15))
    d.line((16, 5, 16, 8), fill=(255, 255, 255))
    d.line((16, 24, 16, 27), fill=(255, 255, 255))
    # Transparenz erhalten: nicht quantisieren
    img.resize((SIZE * SCALE, SIZE * SCALE), Image.NEAREST).save(OUT / "coin.png")
    print("ok coin")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for file, (name, box) in PHOTOS.items():
        pixelate_photo(file, name, box)
    draw_ramona()
    draw_unknown()
    draw_satoshi()
    draw_schanze()
    draw_ps3()
    draw_coin()
```

- [ ] **Step 2: Ausführen**

Run: `python tools/pixelate.py`
Expected: zehn Zeilen `ok <name>`, Ordner `sprites/` enthält `christian hildegard micha viktor ramona unknown satoshi schanze ps3 coin`.png, jede 256×256.

- [ ] **Step 3: Sichtprüfung**

Die vier Foto-Sprites mit dem Read-Tool ansehen. Gesicht muss erkennbar und zentriert sein. Wenn ein Crop daneben liegt: Box in `PHOTOS` anpassen und erneut ausführen. Viktor zeigt Rücken und Hinterkopf, das ist richtig so.

---

### Task 5: HTML, CSS, Karte, Fang-Screen

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `js/map.js`
- Create: `js/catch.js`

- [ ] **Step 1: `index.html` anlegen**

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>Rüther GO</title>
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#f7931a">
<link rel="icon" href="sprites/coin.png">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="style.css">
</head>
<body>

<section id="screen-map" class="screen active">
  <header class="topbar">
    <h1 id="title">Rüther GO</h1>
    <span id="badge" class="badge hidden" title="Herrscher aller Rüthers">👑</span>
  </header>
  <div id="banner" class="banner hidden"></div>
  <div id="map"></div>
  <div id="toast" class="toast hidden"></div>
  <nav class="bottombar">
    <span id="hud-caught">0/5 gefangen</span>
    <button id="btn-team" class="primary">Team</button>
    <span id="hud-arenas">0/3 Arenen</span>
  </nav>
  <div id="debug" class="debug hidden">
    <strong>Test-Modus</strong>
    <button data-beam="worringen">Beamen: Worringen</button>
    <button data-beam="huettenberg">Beamen: Hüttenbergstraße</button>
    <button data-beam="pcsale">Beamen: PC Sale</button>
    <button id="dbg-gps">GPS wieder an</button>
    <button id="dbg-respawn">Spawns neu würfeln</button>
    <button id="dbg-catchall">Alle Rüthers fangen</button>
    <button id="dbg-reset">Spielstand löschen</button>
    <button id="dbg-close">Schließen</button>
  </div>
</section>

<section id="screen-catch" class="screen">
  <button class="back">✕</button>
  <div class="catch-stage">
    <img class="sprite wobble" alt="">
    <h2 class="name"></h2>
    <p class="title"></p>
    <p class="desc"></p>
  </div>
  <p class="msg"></p>
  <p class="throws"></p>
  <img class="coin" src="sprites/coin.png" alt="Bitcoin werfen">
  <p class="hint">Nach oben wischen oder Münze antippen</p>
</section>

<section id="screen-team" class="screen">
  <header class="topbar"><button class="back">‹ Karte</button><h2>Team</h2></header>
  <p class="hint">Bis zu drei antippen. Reihenfolge = Einsatzreihenfolge.</p>
  <div class="slots"></div>
</section>

<section id="screen-arena" class="screen">
  <header class="topbar"><button class="back">‹ Karte</button><h2 class="arena-name"></h2></header>
  <div class="arena-body">
    <img class="sprite" alt="">
    <h3 class="boss-name"></h3>
    <p class="address"></p>
    <p class="distance"></p>
    <p class="status"></p>
    <button class="fight primary">Kämpfen</button>
  </div>
</section>

<section id="screen-battle" class="screen">
  <div class="fighter enemy">
    <img class="sprite" alt="">
    <div class="info">
      <div class="fname"></div>
      <div class="bar"><div class="fill"></div></div>
      <div class="btc"></div>
      <div class="status"></div>
    </div>
  </div>
  <div class="fighter me">
    <img class="sprite" alt="">
    <div class="info">
      <div class="fname"></div>
      <div class="bar"><div class="fill"></div></div>
      <div class="btc"></div>
      <div class="status"></div>
    </div>
  </div>
  <div class="log"></div>
  <div class="actions"></div>
  <div class="switch hidden"></div>
</section>

<section id="screen-victory" class="screen">
  <div class="victory">
    <div class="crown">👑</div>
    <h2>Du bist der Herrscher aller Rüthers.</h2>
    <button class="back primary">Zurück zur Karte</button>
  </div>
</section>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `style.css` anlegen**

```css
:root {
  --orange: #f7931a;
  --bg: #1b1b1f;
  --panel: #2a2a31;
  --text: #f2f2f2;
  --muted: #a0a0ab;
  --green: #3ddc84;
  --red: #ff5252;
  --purple: #b36bff;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; overflow: hidden; }
img.sprite, .spawn-icon img, .slot img { image-rendering: pixelated; }
button { font: inherit; border: 0; border-radius: 10px; padding: 10px 14px; background: var(--panel); color: var(--text); }
button.primary { background: var(--orange); color: #111; font-weight: 700; }
button:disabled { opacity: .4; }
.hidden { display: none !important; }

.screen { position: fixed; inset: 0; display: none; flex-direction: column; }
.screen.active { display: flex; }

.topbar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; padding-top: calc(10px + env(safe-area-inset-top)); background: var(--panel); z-index: 1000; }
.topbar h1, .topbar h2 { margin: 0; font-size: 20px; flex: 1; user-select: none; }
.topbar .back { padding: 6px 10px; }
.badge { font-size: 22px; }

#map { flex: 1; background: #333; }
.bottombar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; padding-bottom: calc(10px + env(safe-area-inset-bottom)); background: var(--panel); z-index: 1000; font-size: 14px; }
.banner { background: var(--red); color: #fff; padding: 8px 14px; font-size: 14px; z-index: 1000; }
.toast { position: absolute; left: 50%; bottom: 90px; transform: translateX(-50%); background: rgba(0,0,0,.85); padding: 10px 16px; border-radius: 12px; z-index: 1100; font-size: 14px; white-space: nowrap; }

.spawn-icon img { width: 48px; height: 48px; border-radius: 8px; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.arena-icon { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: var(--purple); color: #fff; font-size: 22px; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
.arena-icon.beaten { background: #d4a017; }

.debug { position: absolute; top: 60px; right: 10px; z-index: 1200; display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,.9); padding: 10px; border-radius: 12px; font-size: 13px; }
.debug button { padding: 8px 10px; font-size: 13px; }

/* Fangen */
#screen-catch { background: radial-gradient(circle at 50% 30%, #3a3a48, var(--bg)); align-items: center; justify-content: space-between; padding: 20px; padding-top: calc(20px + env(safe-area-inset-top)); text-align: center; }
#screen-catch .back { position: absolute; top: calc(10px + env(safe-area-inset-top)); left: 10px; }
.catch-stage .sprite { width: 160px; height: 160px; border-radius: 12px; }
.catch-stage h2 { margin: 8px 0 0; }
.catch-stage .title { color: var(--orange); margin: 2px 0; }
.catch-stage .desc { color: var(--muted); font-size: 14px; margin: 4px 0; }
.msg { font-size: 18px; min-height: 24px; margin: 0; }
.throws { color: var(--muted); margin: 0; }
.coin { width: 96px; height: 96px; transition: transform .6s cubic-bezier(.2,.8,.3,1), opacity .6s; }
.coin.thrown { transform: translateY(-320px) scale(.4) rotate(540deg); opacity: 0; }
.hint { color: var(--muted); font-size: 13px; }
@keyframes wobble { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
.wobble { animation: wobble 1.6s ease-in-out infinite; }

/* Team */
#screen-team .hint { padding: 0 14px; }
.slots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 14px; overflow: auto; }
.slot { background: var(--panel); border-radius: 12px; padding: 10px; text-align: center; border: 3px solid transparent; position: relative; }
.slot.in-team { border-color: var(--orange); }
.slot.unknown { opacity: .5; }
.slot img { width: 96px; height: 96px; border-radius: 8px; }
.slot .order { position: absolute; top: 6px; left: 6px; background: var(--orange); color: #111; font-weight: 700; border-radius: 50%; width: 24px; height: 24px; line-height: 24px; }
.slot .sub { color: var(--muted); font-size: 13px; }

/* Arena */
.arena-body { padding: 20px; text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.arena-body .sprite { width: 160px; height: 160px; border-radius: 12px; }
.arena-body p { margin: 0; color: var(--muted); }
.arena-body .fight { margin-top: 12px; font-size: 18px; padding: 14px 32px; }

/* Kampf */
#screen-battle { padding: 10px; padding-top: calc(10px + env(safe-area-inset-top)); gap: 10px; }
.fighter { display: flex; gap: 12px; align-items: center; background: var(--panel); border-radius: 12px; padding: 10px; }
.fighter.me { flex-direction: row-reverse; }
.fighter .sprite { width: 96px; height: 96px; border-radius: 8px; }
.fighter .info { flex: 1; }
.fighter .fname { font-weight: 700; }
.bar { height: 12px; background: #111; border-radius: 6px; overflow: hidden; margin: 4px 0; }
.bar .fill { height: 100%; background: var(--green); transition: width .4s; }
.bar .fill.low { background: var(--red); }
.fighter .btc { font-size: 13px; color: var(--muted); }
.fighter .status { font-size: 13px; min-height: 18px; }
.log { flex: 1; overflow: auto; background: #111; border-radius: 12px; padding: 10px; font-size: 14px; line-height: 1.5; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-bottom: env(safe-area-inset-bottom); }
.actions button { padding: 12px 8px; font-size: 14px; }
.switch { display: grid; gap: 8px; }

/* Sieg */
#screen-victory { align-items: center; justify-content: center; text-align: center; padding: 20px; background: radial-gradient(circle, #5a4a10, var(--bg)); }
.crown { font-size: 96px; }
```

- [ ] **Step 3: `js/map.js` anlegen**

```js
/* global L */
// Leaflet-Adapter. Erwartet das globale L aus dem Leaflet-Script.

const HAGEN = [51.36, 7.47];

function spriteIcon(id) {
  return L.divIcon({ className: 'spawn-icon', html: `<img src="sprites/${id}.png" alt="">`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon(beaten) {
  return L.divIcon({ className: 'arena-icon' + (beaten ? ' beaten' : ''), html: beaten ? '✓' : '⚔', iconSize: [40, 40], iconAnchor: [20, 20] });
}

export function createMap({ el, arenas, onSpawnTap, onArenaTap }) {
  const map = L.map(el, { zoomControl: false }).setView(HAGEN, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const player = L.circleMarker(HAGEN, { radius: 8, color: '#fff', fillColor: '#2a7fff', fillOpacity: 1, weight: 2 });
  const spawnLayer = L.layerGroup().addTo(map);
  const arenaMarkers = {};
  for (const a of arenas) {
    arenaMarkers[a.id] = L.marker([a.lat, a.lon], { icon: arenaIcon(false) }).addTo(map).on('click', () => onArenaTap(a));
  }
  let centered = false;
  return {
    setPlayer(pos) {
      player.setLatLng([pos.lat, pos.lon]);
      if (!map.hasLayer(player)) player.addTo(map);
      if (!centered) { map.setView([pos.lat, pos.lon], 16); centered = true; }
    },
    center(pos) { map.setView([pos.lat, pos.lon], 16); centered = true; },
    setSpawns(spawns) {
      spawnLayer.clearLayers();
      for (const s of spawns) {
        L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId) }).addTo(spawnLayer).on('click', () => onSpawnTap(s));
      }
    },
    setArenaBeaten(id, beaten) { arenaMarkers[id].setIcon(arenaIcon(beaten)); },
    invalidate() { map.invalidateSize(); },
  };
}
```

- [ ] **Step 4: `js/catch.js` anlegen**

```js
import { CONST } from './data.js';

// el = section#screen-catch. onDone({ spawn, caught }) nach Fang oder Flucht. onCancel() bei ✕.
export function createCatchScreen({ el, onDone, onCancel }) {
  const sprite = el.querySelector('.sprite');
  const name = el.querySelector('.name');
  const title = el.querySelector('.title');
  const desc = el.querySelector('.desc');
  const msg = el.querySelector('.msg');
  const throwsEl = el.querySelector('.throws');
  const coin = el.querySelector('.coin');
  let spawn = null, def = null, throwsLeft = 0, busy = false, rng = Math.random;

  function render(text) {
    msg.textContent = text;
    throwsEl.textContent = `Würfe übrig: ${throwsLeft}`;
  }

  function throwCoin() {
    if (busy || throwsLeft <= 0 || !def) return;
    busy = true;
    coin.classList.add('thrown');
    render('...');
    setTimeout(() => {
      coin.classList.remove('thrown');
      if (rng() < def.catchChance) {
        render(`${def.name} gefangen!`);
        sprite.classList.remove('wobble');
        setTimeout(() => { busy = false; onDone({ spawn, caught: true }); }, 900);
        return;
      }
      throwsLeft -= 1;
      if (throwsLeft === 0) {
        render(`${def.name} ist abgehauen.`);
        setTimeout(() => { busy = false; onDone({ spawn, caught: false }); }, 900);
      } else {
        render(`${def.name} ist ausgewichen.`);
        busy = false;
      }
    }, 600);
  }

  let touchY = null;
  el.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (touchY !== null && touchY - e.changedTouches[0].clientY > 40) throwCoin();
    touchY = null;
  });
  coin.addEventListener('click', throwCoin);
  el.querySelector('.back').addEventListener('click', () => { if (!busy) onCancel(); });

  return {
    start(s, d, r = Math.random) {
      spawn = s; def = d; rng = r; throwsLeft = CONST.THROWS; busy = false;
      sprite.src = `sprites/${d.id}.png`;
      sprite.classList.add('wobble');
      name.textContent = d.name;
      title.textContent = d.title;
      desc.textContent = d.desc;
      render('Wirf einen Bitcoin!');
    },
  };
}
```

---

### Task 6: Team-, Arena-, Kampf- und Sieg-Screen

**Files:**
- Create: `js/screens.js`

- [ ] **Step 1: `js/screens.js` anlegen**

```js
import { CONST, RUETHERS, RUETHER_BY_ID } from './data.js';
import { playerAttack, playerSwitch } from './battle.js';

// ---------- Team ----------
// onChange(teamIds) bei jeder Änderung, onBack() beim Zurück.
export function createTeamScreen({ el, onChange, onBack }) {
  const slots = el.querySelector('.slots');
  el.querySelector('.back').addEventListener('click', onBack);
  let save = null;

  function render() {
    slots.innerHTML = '';
    for (const r of RUETHERS) {
      const c = save.caught[r.id];
      const div = document.createElement('div');
      const idx = save.team.indexOf(r.id);
      div.className = 'slot' + (c ? '' : ' unknown') + (idx >= 0 ? ' in-team' : '');
      div.innerHTML = `
        ${idx >= 0 ? `<div class="order">${idx + 1}</div>` : ''}
        <img src="sprites/${c ? r.id : 'unknown'}.png" alt="">
        <div><strong>${c ? r.name : '???'}</strong></div>
        <div class="sub">${c ? r.title : 'Noch nicht gefangen'}</div>
        <div class="sub">${c ? `${r.btc + c.bonusBtc} BTC · ${c.count}× gefangen` : ''}</div>`;
      if (c) div.addEventListener('click', () => toggle(r.id));
      slots.appendChild(div);
    }
  }
  function toggle(id) {
    const i = save.team.indexOf(id);
    if (i >= 0) save.team.splice(i, 1);
    else if (save.team.length < CONST.TEAM_SIZE) save.team.push(id);
    onChange(save.team);
    render();
  }
  return { show(s) { save = s; render(); } };
}

// ---------- Arena-Info ----------
export function createArenaScreen({ el, bosses, onFight, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const fight = el.querySelector('.fight');
  let arena = null;
  fight.addEventListener('click', () => onFight(arena));
  return {
    show(a, { distanceM, teamSize, beaten }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.sprite').src = `sprites/${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} (${boss.btc} BTC)`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${Math.round(distanceM)} m`;
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (beaten) status = 'Bereits besiegt. Nochmal?';
      else if (!inRange) status = `Du musst näher als ${CONST.ARENA_RANGE} m ran.`;
      else if (teamSize === 0) status = 'Du brauchst mindestens einen Rüther im Team.';
      el.querySelector('.status').textContent = status;
      fight.disabled = !(inRange && teamSize > 0);
    },
  };
}

// ---------- Kampf ----------
const statusText = f => [
  f.status.poison ? '☠ Gift' : '',
  f.status.weakened > 0 ? '↓ geschwächt' : '',
  f.status.skip ? '⏸ setzt aus' : '',
].filter(Boolean).join(' · ');

// onEnd(won) wenn der Spieler nach Kampfende auf Weiter tippt.
export function createBattleScreen({ el, onEnd }) {
  const enemyEl = el.querySelector('.enemy');
  const meEl = el.querySelector('.me');
  const log = el.querySelector('.log');
  const actions = el.querySelector('.actions');
  const sw = el.querySelector('.switch');
  let state = null;

  function panel(p, f, summons) {
    p.querySelector('.sprite').src = `sprites/${f.id}.png`;
    p.querySelector('.fname').textContent = f.name;
    const pct = Math.max(0, Math.round((f.btc / f.maxBtc) * 100));
    const fill = p.querySelector('.fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('low', pct <= 25);
    p.querySelector('.btc').textContent = `${f.btc} / ${f.maxBtc} BTC`;
    const extra = summons && summons.length ? ` · 👥 ${summons.map(s => s.name).join(', ')}` : '';
    p.querySelector('.status').textContent = statusText(f) + extra;
  }

  function render() {
    panel(enemyEl, state.enemy, null);
    panel(meEl, state.team[state.active], state.summons);
    log.innerHTML = state.log.map(l => `<div>${l}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    sw.classList.add('hidden');
    actions.innerHTML = '';
    if (state.over) {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = state.won ? 'Gewonnen! Weiter' : 'Verloren. Zurück';
      b.addEventListener('click', () => onEnd(state.won));
      actions.appendChild(b);
      return;
    }
    const me = state.team[state.active];
    if (me.status.skip) {
      const b = document.createElement('button');
      b.textContent = `${me.name} setzt aus...`;
      b.addEventListener('click', () => { state = playerAttack(state, 0); render(); });
      actions.appendChild(b);
    } else {
      me.attacks.forEach((a, i) => {
        const b = document.createElement('button');
        b.textContent = a.damage > 0 ? `${a.name} (${a.damage})` : a.name;
        b.addEventListener('click', () => { state = playerAttack(state, i); render(); });
        actions.appendChild(b);
      });
    }
    const others = state.team.map((f, i) => ({ f, i })).filter(x => x.i !== state.active && x.f.btc > 0);
    if (others.length) {
      const b = document.createElement('button');
      b.textContent = 'Wechseln';
      b.addEventListener('click', () => {
        sw.innerHTML = '';
        for (const { f, i } of others) {
          const o = document.createElement('button');
          o.textContent = `${f.name} (${f.btc} BTC)`;
          o.addEventListener('click', () => { state = playerSwitch(state, i); render(); });
          sw.appendChild(o);
        }
        sw.classList.remove('hidden');
      });
      actions.appendChild(b);
    }
  }

  return { start(battleState) { state = battleState; render(); } };
}

// ---------- Sieg ----------
export function createVictoryScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  return {};
}
```

---

### Task 7: `app.js` verdrahten

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: `js/app.js` anlegen**

```js
import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import { createTeamScreen, createArenaScreen, createBattleScreen, createVictoryScreen } from './screens.js';
import { createBattle, makeFighter } from './battle.js';

const $ = s => document.querySelector(s);
let save = storage.load();
let spawns = [];
let pos = null;

// ---------- Screens ----------
const screens = [...document.querySelectorAll('section.screen')];
function show(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-map') map.invalidate();
}

// ---------- Banner / Toast / HUD ----------
function banner(text) { const b = $('#banner'); b.textContent = text; b.classList.toggle('hidden', !text); }
let toastTimer = null;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}
function persist() {
  if (!storage.save(save)) banner('Spielstand kann nicht gespeichert werden.');
  updateHud();
}
function updateHud() {
  $('#hud-caught').textContent = `${Object.keys(save.caught).length}/${RUETHERS.length} gefangen`;
  $('#hud-arenas').textContent = `${save.arenasBeaten.length}/${ARENAS.length} Arenen`;
  $('#badge').classList.toggle('hidden', save.arenasBeaten.length < ARENAS.length);
  for (const a of ARENAS) map.setArenaBeaten(a.id, save.arenasBeaten.includes(a.id));
}

// ---------- Karte ----------
const map = createMap({
  el: $('#map'),
  arenas: ARENAS,
  onSpawnTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.CATCH_RANGE) return toast(`Zu weit weg: ${Math.round(d)} m`);
    catchScreen.start(s, RUETHER_BY_ID[s.ruetherId]);
    show('screen-catch');
  },
  onArenaTap(a) {
    arenaScreen.show(a, {
      distanceM: pos ? distance(pos, a) : null,
      teamSize: save.team.length,
      beaten: save.arenasBeaten.includes(a.id),
    });
    show('screen-arena');
  },
});

// ---------- Spawns ----------
function refreshSpawns() {
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random });
  map.setSpawns(spawns);
}
setInterval(refreshSpawns, CONST.SPAWN_INTERVAL);

// ---------- Ortung ----------
const locator = createLocator({
  onPosition(p) {
    const first = !pos;
    pos = p;
    map.setPlayer(p);
    banner('');
    if (first) refreshSpawns();
  },
  onError() {
    banner('Ortung aus. Erlaube sie in den Browser-Einstellungen oder nutze den Test-Modus.');
  },
});

// ---------- Fangen ----------
const catchScreen = createCatchScreen({
  el: $('#screen-catch'),
  onDone({ spawn, caught }) {
    spawns = spawns.filter(s => s.id !== spawn.id);
    map.setSpawns(spawns);
    if (caught) {
      const c = save.caught[spawn.ruetherId];
      if (c) { c.count += 1; c.bonusBtc = Math.min(CONST.DUP_CAP, c.bonusBtc + CONST.DUP_BONUS); }
      else {
        save.caught[spawn.ruetherId] = { count: 1, bonusBtc: 0 };
        if (save.team.length < CONST.TEAM_SIZE) save.team.push(spawn.ruetherId);
      }
      persist();
    }
    show('screen-map');
  },
  onCancel() { show('screen-map'); },
});

// ---------- Team ----------
const teamScreen = createTeamScreen({
  el: $('#screen-team'),
  onChange(team) { save.team = team; persist(); },
  onBack() { show('screen-map'); },
});
$('#btn-team').addEventListener('click', () => { teamScreen.show(save); show('screen-team'); });

// ---------- Arena + Kampf ----------
let currentArena = null;
const arenaScreen = createArenaScreen({
  el: $('#screen-arena'),
  bosses: BOSSES,
  onBack() { show('screen-map'); },
  onFight(a) {
    currentArena = a;
    const team = save.team.map(id => makeFighter(RUETHER_BY_ID[id], save.caught[id]?.bonusBtc ?? 0));
    const enemy = makeFighter(BOSSES[a.boss]);
    battleScreen.start(createBattle({ team, enemy, rng: Math.random }));
    show('screen-battle');
  },
});
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEnd(won) {
    if (won && !save.arenasBeaten.includes(currentArena.id)) {
      save.arenasBeaten.push(currentArena.id);
      persist();
      if (save.arenasBeaten.length === ARENAS.length && !save.victoryShown) {
        save.victoryShown = true;
        persist();
        return show('screen-victory');
      }
    }
    show('screen-map');
  },
});
createVictoryScreen({ el: $('#screen-victory'), onBack() { show('screen-map'); } });

// ---------- Debug ----------
const debug = $('#debug');
let taps = 0, tapTimer = null;
$('#title').addEventListener('click', () => {
  taps += 1; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 2000);
  if (taps >= 7) { taps = 0; debug.classList.remove('hidden'); }
});
if (new URLSearchParams(location.search).get('debug') === '1') debug.classList.remove('hidden');
debug.querySelectorAll('[data-beam]').forEach(b => b.addEventListener('click', () => {
  const a = ARENA_BY_ID[b.dataset.beam];
  const p = offsetPoint(a, 40, 0);
  locator.setFake(p);
  map.center(p);
  refreshSpawns();
  toast(`Gebeamt: ${a.name}`);
}));
$('#dbg-gps').addEventListener('click', () => { locator.clearFake(); toast('GPS wieder an'); });
$('#dbg-respawn').addEventListener('click', () => { spawns = []; refreshSpawns(); toast('Spawns neu'); });
$('#dbg-catchall').addEventListener('click', () => {
  for (const r of RUETHERS) save.caught[r.id] ??= { count: 1, bonusBtc: 0 };
  if (!save.team.length) save.team = RUETHERS.slice(0, CONST.TEAM_SIZE).map(r => r.id);
  persist(); toast('Alle gefangen');
});
$('#dbg-reset').addEventListener('click', () => { storage.clear(); save = storage.emptySave(); persist(); toast('Spielstand gelöscht'); });
$('#dbg-close').addEventListener('click', () => debug.classList.add('hidden'));

// ---------- Start ----------
updateHud();
```

- [ ] **Step 2: Im Browser prüfen**

Run: `python -m http.server 8000` im Projektordner, dann `http://localhost:8000/?debug=1` öffnen.

Checkliste:
1. Karte lädt, Debug-Panel sichtbar, HUD zeigt `0/5 gefangen`, `0/3 Arenen`.
2. "Beamen: PC Sale" → Karte springt nach Hagen, blauer Punkt, Arena-Marker ⚔, 2–4 Spawn-Marker, darunter sicher Onkel Micha.
3. Spawn weiter als 50 m antippen → Toast "Zu weit weg: … m". (Marker nahe am Punkt antippen; wenn keiner nah ist, "Spawns neu würfeln".)
4. Nahen Spawn antippen → Fang-Screen, Münze antippen → Animation → nach max. 3 Würfen gefangen oder abgehauen. Zurück auf Karte, HUD aktualisiert.
5. "Team" → Slot sichtbar, Antippen toggelt Orange-Rahmen und Nummer.
6. Arena-Marker antippen → Arena-Info mit Entfernung ~40 m, "Kämpfen" aktiv. Kampf: Attacken-Buttons, Balken, Log. Bis Sieg oder Niederlage spielen, "Weiter" → Karte, Arena-Marker ✓ und HUD `1/3 Arenen`.
7. "Alle Rüthers fangen", dann alle drei Arenen beamen und besiegen → Sieg-Screen, danach 👑 im Titel.
8. Seite neu laden → Spielstand bleibt. "Spielstand löschen" → alles auf 0.
9. Browser-Devtools auf Handy-Größe (375×812): nichts läuft über, Buttons erreichbar.

---

### Task 8: Commit und README

**Files:**
- Create: `README.md`

- [ ] **Step 1: `README.md` anlegen**

```markdown
# Rüther GO

Pokémon GO, aber man fängt Rüthers. Handy-Web-App, kein Server.

## Starten

    python -m http.server 8000

Dann `http://localhost:8000` öffnen. Auf dem Handy braucht die Ortung HTTPS,
also auf einen statischen Host (z.B. GitHub Pages) legen.

## Test-Modus

`?debug=1` an die URL hängen oder siebenmal auf den Titel tippen. Dann kann
man sich an die drei Arenen beamen.

## Tests

    node --test test/

## Sprites neu erzeugen

    python tools/pixelate.py

Fotos liegen im Projektordner (nicht im Git). Ramona hat noch kein Foto und
einen Platzhalter.
```

- [ ] **Step 2: Alles committen**

```bash
git add -A
git commit -m "Rüther GO: Karte, Fangen, Team, Arenen, Kampf, Sprites, Tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Daten §3 → Task 1. Screens §4 → Tasks 5–7. Spawns §5 → Task 2. Fangen §6 → Task 5 + app.js. Engine §7 → Task 3. Arenen §8 → Tasks 6–7. Test-Modus §9 → Task 7. Sprites §10 → Task 4. Speichern §11 → Task 1 + app.js. Fehler §12 → app.js (Banner), map.js (Tiles fehlen ist Leaflet-Standard). Tests §13 → Tasks 2–3.

**Abweichung zur Spec, bewusst:** Der Spieler-Rüther kann durch Boss-Attacken (Firmware-Update) selbst aussetzen. Die Spec §7 Schritt 1 erwähnt das nicht explizit; Engine und UI behandeln es wie beim Gegner (Runde verfällt, `skip` wird gelöscht). Spec um diesen Satz ergänzen.

**Type consistency:** `createMap` liefert `setPlayer/center/setSpawns/setArenaBeaten/invalidate`, alle in app.js genutzt. `createCatchScreen.start(spawn, def, rng)`, `createTeamScreen.show(save)`, `createArenaScreen.show(arena, {distanceM, teamSize, beaten})`, `createBattleScreen.start(state)` stimmen mit app.js überein. Spawn-Felder `id, ruetherId, lat, lon, expires` überall gleich.
