# Rüther GO v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echtzeit-Kämpfe wie in Pokémon GO mit eigener Animation pro Attacke, Fangen mit Schnippen/Ring/Wackeln, Karte folgt dem Spieler, Arena-Eroberung mit Belohnung.

**Architecture:** Reine Logik bleibt DOM-frei und getestet (`js/battle.js` als Tick-Simulation mit Event-Liste, `js/catch-logic.js`). Die DOM-Schichten (`js/battle-ui.js`, `js/catch.js`) konsumieren Events bzw. Logik-Funktionen und machen daraus CSS-Animationen (`css/battle.css`, `css/catch.css`). `js/app.js` verdrahtet, `js/map.js` kennt Folgen-Modus und Besitz-Marker.

**Tech Stack:** wie v1 (HTML/CSS/ES-Module, Leaflet, Node 22 `node:test`). Pointer-Events für Finger und Maus.

**Spec:** `docs/superpowers/specs/2026-10-03-ruether-go-v2-design.md` (gilt bei Zweifel), darunter v1 `2026-10-03-ruether-go-design.md`.

**Schon erledigt (nicht anfassen):** `js/data.js` (neue Zahlen, `cost`/`fx`, Boss-`fast`/`charged`) und `index.html` (neue Sektionen für Fangen und Kampf, `#btn-locate`, `#dbg-weakboss`, lädt `css/catch.css` und `css/battle.css`).

**Allgemeine Regeln:** UTF-8 ohne BOM, LF. Keine Commits aus Agenten. Tests: `node --test test/*.test.mjs`. Lokal prüfen: `python -m http.server 8000` → `http://localhost:8000/?debug=1`. Agenten ändern nur die ihnen zugewiesenen Dateien.

---

## Dateistruktur

| Datei | Besitzer | Verantwortung |
|---|---|---|
| `js/battle.js` | A | Tick-Engine, Events (vollständiger Code unten) |
| `test/battle.test.mjs` | A | Engine-Tests (vollständiger Code unten) |
| `js/catch-logic.js`, `test/catch.test.mjs` | A | Fang-Rechnung + Tests (vollständiger Code unten) |
| `js/battle-ui.js`, `css/battle.css` | B | Kampf-Bildschirm, Eingabe, Animationen, End-Overlay (Vertrag unten) |
| `js/catch.js`, `css/catch.css` | C | Fang-Bildschirm: Schnippen, Ring, Wackeln, Ausbruch (Vertrag unten) |
| `js/geo.js`, `js/map.js`, `js/app.js`, `js/screens.js`, `js/storage.js`, `style.css`, `README.md` | D | Ortung/Folgen, Besitz-Marker, Verdrahtung (vollständiger Code unten) |

---

### Task 2: Kampf-Engine (TDD) — Agent A

**Files:** Create `test/battle.test.mjs` (ersetzt die v1-Datei komplett), Create `js/battle.js` (ersetzt v1 komplett).

- [ ] **Step 1: `test/battle.test.mjs` schreiben**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFighter, makeBoss, createBattle, tick } from '../js/battle.js';
import { RUETHER_BY_ID, BOSSES } from '../js/data.js';

const F = (id, bonus = 0) => makeFighter(RUETHER_BY_ID[id], bonus);
const B = (team, bossId, opts = {}) => createBattle({ team, enemy: makeBoss(BOSSES[bossId]), rng: () => 0.5, ...opts });
// tickt in 50-ms-Schritten; input nur im ersten Schritt
function run(s, ms, input = {}, dt = 50) {
  const ev = [];
  for (let t = 0; t < ms; t += dt) ev.push(...tick(s, dt, t === 0 ? input : {}));
  return ev;
}
const has = (ev, type) => ev.some(e => e.type === type);
const find = (ev, type) => ev.find(e => e.type === type);

test('Tipp: 3 Schaden, +10 Energie, Cooldown 250 ms', () => {
  const s = B([F('christian')], 'ps3');
  let ev = tick(s, 16, { taps: 1 });
  assert.equal(s.enemy.btc, 257);
  assert.equal(s.team[0].energy, 10);
  assert.ok(has(ev, 'fast'));
  ev = tick(s, 16, { taps: 1 }); // Cooldown läuft noch
  assert.equal(s.enemy.btc, 257);
  assert.ok(!has(ev, 'fast'));
  ev = tick(s, 250, { taps: 1 }); // Cooldown abgelaufen
  assert.equal(s.enemy.btc, 254);
  assert.equal(s.team[0].energy, 20);
});

test('Spezial: ohne Energie verweigert, mit 100 Energie 40 Schaden', () => {
  const s = B([F('christian')], 'ps3');
  let ev = tick(s, 16, { special: 0 });
  assert.ok(has(ev, 'specialDenied'));
  assert.equal(s.enemy.btc, 260);
  s.team[0].energy = 100;
  ev = tick(s, 16, { special: 0 });
  const sp = find(ev, 'special');
  assert.equal(sp.attack.name, 'Plus 70 Prozent');
  assert.equal(sp.damage, 40);
  assert.equal(s.enemy.btc, 220);
  assert.equal(s.team[0].energy, 0);
});

test('Warnung 600 ms vor dem schnellen Angriff, Ausweichen im Fenster = 25 % Schaden', () => {
  const s = B([F('christian')], 'ps3');
  let ev = run(s, 1850);
  assert.ok(!has(ev, 'warn'));
  ev = run(s, 50); // t = 1900
  const w = find(ev, 'warn');
  assert.equal(w.kind, 'fast');
  assert.equal(w.ms, 600);
  ev = tick(s, 50, { dodge: true });
  assert.ok(has(ev, 'dodge'));
  ev = run(s, 550); // t = 2500
  const a = find(ev, 'enemyAttack');
  assert.equal(a.dodged, true);
  assert.equal(a.damage, 3); // floor(12 × 0,25)
  assert.equal(s.team[0].btc, 97);
});

test('Ausweichen außerhalb der Warnung tut nichts, voller Schaden 12', () => {
  const s = B([F('christian')], 'ps3');
  let ev = tick(s, 50, { dodge: true });
  assert.ok(!has(ev, 'dodge'));
  ev = run(s, 2450); // t = 2500
  const a = find(ev, 'enemyAttack');
  assert.equal(a.dodged, false);
  assert.equal(a.damage, 12);
  assert.equal(s.team[0].btc, 88);
});

test('Gift auf dem Boss: 8 Ticks je 5, dann vorbei', () => {
  const s = B([F('viktor')], 'ps3');
  s.team[0].energy = 100;
  tick(s, 50, { special: 0 }); // Giftgas: 10 Schaden, Gift 5/s bis 8050
  assert.equal(s.enemy.btc, 250);
  const enemyPoison = ev => ev.filter(e => e.type === 'poison' && e.target === 'enemy').length;
  let ev = run(s, 1000);
  assert.equal(enemyPoison(ev), 1);
  assert.equal(s.enemy.btc, 245);
  ev = run(s, 7000);
  assert.equal(enemyPoison(ev), 7);
  assert.equal(s.enemy.btc, 210);
  assert.equal(s.enemy.status.poison, null);
  ev = run(s, 1000);
  assert.equal(enemyPoison(ev), 0);
  assert.equal(s.enemy.btc, 210);
});

test('Betäubung: Boss greift 3 s nicht an, Warnung abgebrochen, Timer verschoben', () => {
  const s = B([F('viktor')], 'ps3');
  s.team[0].energy = 50;
  run(s, 1900); // Warnung läuft
  assert.ok(s.enemy.warning);
  let ev = tick(s, 50, { special: 1 }); // Argumentationslogik: 10 Schaden, Boss betäubt bis 4950
  assert.ok(has(ev, 'stun'));
  assert.equal(s.enemy.warning, null);
  assert.equal(s.enemy.btc, 250);
  ev = run(s, 3000); // bis 4950
  assert.ok(!has(ev, 'enemyAttack'));
  assert.equal(s.team[0].btc, 90);
  ev = run(s, 1100); // Angriff bei 5550
  assert.ok(has(ev, 'enemyAttack'));
});

test('Betäubter Spieler: Tipps ignoriert', () => {
  const s = B([F('christian')], 'ps3');
  s.team[0].status.stunUntil = 1000;
  let ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'stunnedTap'));
  assert.equal(s.enemy.btc, 260);
  run(s, 1000);
  ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'fast'));
});

test('Familientreffen: 20 Schläge je 4 in 10 s, nur einmal', () => {
  const s = B([F('hildegard', 100)], 'ps3');
  s.team[0].energy = 100;
  let ev = tick(s, 50, { special: 0 });
  assert.ok(has(ev, 'summoned'));
  assert.equal(s.summons.length, 2);
  ev = run(s, 10000);
  assert.equal(ev.filter(e => e.type === 'summon').length, 20);
  assert.equal(s.enemy.btc, 180);
  assert.equal(s.summons.length, 0);
  s.team[0].energy = 100;
  ev = tick(s, 50, { special: 0 });
  assert.ok(has(ev, 'specialDenied'));
});

test('Schwächung: 12 → 9', () => {
  const s = B([F('christian')], 'ps3');
  s.team[0].energy = 50;
  run(s, 1900);
  tick(s, 50, { special: 1 }); // Handschlag: 10 Schaden, Boss 8 s geschwächt
  const ev = run(s, 550);
  assert.equal(find(ev, 'enemyAttack').damage, 9);
  assert.equal(s.enemy.btc, 250);
});

test('Drain heilt um den Schaden, Heilung nicht über maxBtc', () => {
  const s = B([F('micha')], 'ps3');
  s.team[0].energy = 100;
  s.team[0].btc = 50;
  let ev = tick(s, 50, { special: 0 });
  assert.equal(s.enemy.btc, 230);
  assert.equal(s.team[0].btc, 80);
  assert.equal(find(ev, 'heal').amount, 30);
  const r = B([F('ramona')], 'ps3');
  r.team[0].energy = 50;
  ev = tick(r, 50, { special: 1 });
  assert.equal(find(ev, 'heal').amount, 0);
  assert.equal(r.team[0].btc, 90);
});

test('Pleite → Wechsel, alle pleite → verloren', () => {
  const s = B([F('christian'), F('viktor')], 'ps3');
  s.team[0].btc = 5;
  let ev = run(s, 2500);
  assert.ok(has(ev, 'faint'));
  assert.equal(find(ev, 'switch').to, 1);
  assert.equal(s.active, 1);
  assert.equal(s.over, false);
  s.team[1].btc = 5;
  ev = run(s, 2500);
  assert.equal(s.over, true);
  assert.equal(s.won, false);
  assert.equal(s.reason, 'wiped');
  assert.equal(find(ev, 'lose').reason, 'wiped');
});

test('Zeit abgelaufen → verloren', () => {
  const s = B([F('christian')], 'ps3', { duration: 1000 });
  const ev = run(s, 1000);
  assert.equal(s.over, true);
  assert.equal(s.reason, 'timeout');
  assert.ok(has(ev, 'lose'));
});

test('Boss pleite → Sieg, danach keine Events mehr', () => {
  const s = B([F('christian')], 'ps3');
  s.enemy.btc = 3;
  let ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'win'));
  assert.equal(s.won, true);
  assert.equal(s.enemy.btc, 0);
  ev = tick(s, 50, { taps: 1 });
  assert.deepEqual(ev, []);
});

test('Lade-Attacken wechseln: Blockchain-Kette, dann Mining heilt 40', () => {
  const s = B([F('hildegard', 200)], 'schanze');
  s.enemy.btc = 100;
  let ev = run(s, 10000);
  const c1 = ev.filter(e => e.type === 'enemyAttack' && e.kind === 'charged');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].attack.name, 'Blockchain-Kette');
  ev = run(s, 10000);
  const c2 = ev.filter(e => e.type === 'enemyAttack' && e.kind === 'charged');
  assert.equal(c2.length, 1);
  assert.equal(c2[0].attack.name, 'Mining');
  assert.equal(s.enemy.btc, 140);
});

test('Wechsel per Eingabe', () => {
  const s = B([F('christian'), F('viktor')], 'ps3');
  const ev = tick(s, 50, { switchTo: 1 });
  assert.equal(find(ev, 'switch').to, 1);
  assert.equal(s.active, 1);
  assert.ok(!has(tick(s, 50, { switchTo: 1 }), 'switch'));
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `node --test test/battle.test.mjs`
Expected: FAIL (`makeBoss`/`tick` nicht exportiert bzw. v1-Engine ohne diese Funktionen)

- [ ] **Step 3: `js/battle.js` schreiben**

```js
import { CONST } from './data.js';

// Echtzeit-Engine. tick() mutiert den State und liefert Events für die Animationen.

const freshStatus = () => ({ poison: null, stunUntil: 0, weakenedUntil: 0 });

export function makeFighter(def, bonusBtc = 0) {
  const max = def.btc + bonusBtc;
  return { id: def.id, name: def.name, btc: max, maxBtc: max, attacks: def.attacks, energy: 0, used: {}, status: freshStatus() };
}

export function makeBoss(def) {
  return {
    id: def.id, name: def.name, btc: def.btc, maxBtc: def.btc,
    fast: def.fast, charged: def.charged, chargedIndex: 0,
    nextFastAt: def.fast.every, nextChargedAt: CONST.CHARGED_EVERY, warning: null,
    status: freshStatus(),
  };
}

export function createBattle({ team, enemy, rng = Math.random, duration = CONST.BATTLE_DURATION }) {
  return {
    team: structuredClone(team), active: 0, enemy: structuredClone(enemy),
    time: 0, duration, summons: [], tapCooldown: 0, over: false, won: null, reason: null, rng,
  };
}

const alive = f => f.btc > 0;
const stunned = (f, t) => f.status.stunUntil > t;

function heal(f, n) { const h = Math.max(0, Math.min(n, f.maxBtc - f.btc)); f.btc += h; return h; }
function hurt(f, n) { const d = Math.max(0, Math.min(Math.floor(n), f.btc)); f.btc -= d; return d; }
function poison(f, p, t) { f.status.poison = { perSec: p.perSec, until: t + p.ms, acc: 0 }; }

function stunEnemy(s, ms, ev) {
  const e = s.enemy;
  e.status.stunUntil = s.time + ms;
  e.warning = null;
  e.nextFastAt = Math.max(e.nextFastAt, e.status.stunUntil + CONST.STUN_GRACE);
  e.nextChargedAt = Math.max(e.nextChargedAt, e.status.stunUntil + CONST.STUN_GRACE);
  ev.push({ type: 'stun', target: 'enemy', ms });
}

function applySpecial(s, me, atk, ev) {
  const e = s.enemy;
  const dealt = atk.damage > 0 ? hurt(e, atk.damage) : 0;
  ev.push({ type: 'special', attack: atk, damage: dealt });
  if (atk.poison) { poison(e, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'enemy', ms: atk.poison.ms }); }
  if (atk.stun) stunEnemy(s, atk.stun, ev);
  if (atk.weaken) { e.status.weakenedUntil = s.time + atk.weaken; ev.push({ type: 'weaken', ms: atk.weaken }); }
  if (atk.drain && dealt > 0) ev.push({ type: 'heal', target: 'me', amount: heal(me, dealt) });
  if (atk.heal) ev.push({ type: 'heal', target: 'me', amount: heal(me, atk.heal) });
  if (atk.summon) {
    s.summons = atk.summon.map(x => ({ id: x.id, name: x.name, damage: x.damage, nextAt: s.time + CONST.SUMMON_INTERVAL, until: s.time + atk.summonMs }));
    ev.push({ type: 'summoned', names: atk.summon.map(x => x.name), ids: atk.summon.map(x => x.id), ms: atk.summonMs });
  }
}

function resolveEnemyAttack(s, me, ev) {
  const e = s.enemy, w = e.warning, atk = w.attack;
  let factor = 1;
  if (e.status.weakenedUntil > s.time) factor *= CONST.WEAKEN_FACTOR;
  if (w.dodged) factor *= CONST.DODGE_FACTOR;
  const dealt = atk.damage > 0 ? hurt(me, atk.damage * factor) : 0;
  ev.push({ type: 'enemyAttack', kind: w.kind, attack: atk, damage: dealt, dodged: w.dodged });
  if (!w.dodged) {
    if (atk.poison) { poison(me, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'me', ms: atk.poison.ms }); }
    if (atk.stun) { me.status.stunUntil = s.time + atk.stun; ev.push({ type: 'stun', target: 'me', ms: atk.stun }); }
  }
  if (atk.heal) ev.push({ type: 'heal', target: 'enemy', amount: heal(e, atk.heal) });
  e.warning = null;
  if (w.kind === 'fast') {
    e.nextFastAt = s.time + e.fast.every;
  } else {
    e.nextChargedAt = s.time + CONST.CHARGED_EVERY;
    e.chargedIndex = (e.chargedIndex + 1) % e.charged.length;
    e.nextFastAt = Math.max(e.nextFastAt, s.time + 1000);
  }
}

function enemyStep(s, me, ev) {
  const e = s.enemy;
  if (stunned(e, s.time)) return;
  if (!e.warning) {
    const chargedFirst = e.nextChargedAt <= e.nextFastAt;
    const kind = chargedFirst ? 'charged' : 'fast';
    const attack = chargedFirst ? e.charged[e.chargedIndex] : e.fast;
    const dueAt = chargedFirst ? e.nextChargedAt : e.nextFastAt;
    if (s.time >= dueAt - attack.warn) {
      e.warning = { kind, attack, firesAt: Math.max(dueAt, s.time + attack.warn), dodged: false };
      ev.push({ type: 'warn', kind, attack, ms: e.warning.firesAt - s.time });
    }
  }
  if (e.warning && s.time >= e.warning.firesAt) resolveEnemyAttack(s, me, ev);
}

function summonStep(s, ev) {
  for (const su of s.summons) {
    while (su.nextAt <= s.time && su.nextAt <= su.until) {
      ev.push({ type: 'summon', id: su.id, name: su.name, damage: hurt(s.enemy, su.damage) });
      su.nextAt += CONST.SUMMON_INTERVAL;
    }
  }
  s.summons = s.summons.filter(su => su.nextAt <= su.until);
}

function poisonStep(s, f, who, ev, dt) {
  const p = f.status.poison;
  if (!p) return;
  p.acc += dt;
  while (p.acc >= 1000 && alive(f)) {
    p.acc -= 1000;
    ev.push({ type: 'poison', target: who, damage: hurt(f, p.perSec) });
  }
  if (s.time >= p.until) f.status.poison = null;
}

function finish(s, won, reason, ev) {
  s.over = true; s.won = won; s.reason = reason;
  ev.push(won ? { type: 'win' } : { type: 'lose', reason });
  return ev;
}

// input: { taps?: n, dodge?: bool, special?: index, switchTo?: index }
export function tick(s, dt, input = {}) {
  const ev = [];
  if (s.over) return ev;
  s.time += dt;
  s.tapCooldown = Math.max(0, s.tapCooldown - dt);
  let me = s.team[s.active];

  // 2. Eingabe
  const sw = input.switchTo;
  if (sw != null && sw !== s.active && s.team[sw] && alive(s.team[sw])) {
    s.active = sw; me = s.team[sw];
    ev.push({ type: 'switch', to: sw, fighter: me });
  }
  const meStunned = stunned(me, s.time);
  for (let i = 0; i < (input.taps || 0); i++) {
    if (meStunned) { ev.push({ type: 'stunnedTap' }); break; }
    if (s.tapCooldown > 0) break;
    const d = hurt(s.enemy, CONST.FAST_DAMAGE);
    me.energy = Math.min(CONST.MAX_ENERGY, me.energy + CONST.FAST_ENERGY);
    s.tapCooldown = CONST.FAST_COOLDOWN;
    ev.push({ type: 'fast', damage: d });
  }
  if (input.dodge && s.enemy.warning && !s.enemy.warning.dodged) {
    s.enemy.warning.dodged = true;
    ev.push({ type: 'dodge' });
  }
  if (input.special != null) {
    const atk = me.attacks[input.special];
    if (atk && !meStunned && me.energy >= atk.cost && !(atk.once && me.used[atk.name])) {
      me.energy -= atk.cost;
      if (atk.once) me.used[atk.name] = true;
      applySpecial(s, me, atk, ev);
    } else {
      ev.push({ type: 'specialDenied', index: input.special });
    }
  }

  // 3.–5.
  summonStep(s, ev);
  if (alive(s.enemy)) enemyStep(s, me, ev);
  poisonStep(s, me, 'me', ev, dt);
  poisonStep(s, s.enemy, 'enemy', ev, dt);

  // 6. Ausgang
  if (!alive(s.enemy)) return finish(s, true, 'ko', ev);
  if (!alive(me)) {
    ev.push({ type: 'faint', fighter: me });
    const next = s.team.findIndex(alive);
    if (next === -1) return finish(s, false, 'wiped', ev);
    s.active = next;
    ev.push({ type: 'switch', to: next, fighter: s.team[next] });
  }
  if (s.time >= s.duration) return finish(s, false, 'timeout', ev);
  return ev;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `node --test test/battle.test.mjs`
Expected: 15 Tests PASS. Schlägt einer fehl, zuerst die Zeitrechnung im Testkommentar gegen die Engine nachrechnen (dt = 50 ms, Warnung = fällig − warn, Stun verschiebt Timer auf stunUntil + 500).

---

### Task 3: Fang-Logik (TDD) — Agent A

**Files:** Create `js/catch-logic.js`, Create `test/catch.test.mjs`.

- [ ] **Step 1: `test/catch.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringBonus, catchChance, landing, isHit, rollCatch, isFlick, FLIGHT_MS } from '../js/catch-logic.js';

test('ringBonus-Stufen', () => {
  assert.deepEqual(ringBonus(0.4), { label: 'Super!', bonus: 0.25 });
  assert.deepEqual(ringBonus(0.6), { label: 'Gut!', bonus: 0.12 });
  assert.deepEqual(ringBonus(0.9), { label: '', bonus: 0 });
});

test('catchChance addiert Bonus und kappt bei 0,95', () => {
  assert.equal(catchChance(0.5, 0.6), 0.62);
  assert.equal(catchChance(0.8, 0.4), 0.95);
});

test('landing: Start plus Geschwindigkeit × Flugzeit', () => {
  assert.deepEqual(landing({ x: 100, y: 600 }, 0.1, -1), { x: 100 + 0.1 * FLIGHT_MS, y: 600 - FLIGHT_MS });
});

test('isHit mit 20 px Rand', () => {
  const rect = { left: 100, top: 100, right: 200, bottom: 200 };
  assert.equal(isHit({ x: 150, y: 150 }, rect), true);
  assert.equal(isHit({ x: 215, y: 150 }, rect), true);
  assert.equal(isHit({ x: 225, y: 150 }, rect), false);
  assert.equal(isHit({ x: 150, y: 75 }, rect), false);
});

test('isFlick: nur schnell genug nach oben', () => {
  assert.equal(isFlick(-0.7), true);
  assert.equal(isFlick(-0.2), false);
  assert.equal(isFlick(1), false);
});

test('rollCatch: gefangen = 3 Wackler, sonst 1–3', () => {
  assert.deepEqual(rollCatch(0.5, () => 0.1), { caught: true, wobbles: 3 });
  const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
  assert.deepEqual(rollCatch(0.5, seq(0.9, 0.0)), { caught: false, wobbles: 1 });
  assert.deepEqual(rollCatch(0.5, seq(0.9, 0.99)), { caught: false, wobbles: 3 });
});
```

- [ ] **Step 2: `js/catch-logic.js`**

```js
import { CONST } from './data.js';

export const FLIGHT_MS = 450;   // Zielpunkt = Start + Geschwindigkeit × FLIGHT_MS
export const MIN_FLICK = 0.6;   // px/ms nach oben

export function ringBonus(scale) {
  if (scale < 0.5) return { label: 'Super!', bonus: 0.25 };
  if (scale < 0.75) return { label: 'Gut!', bonus: 0.12 };
  return { label: '', bonus: 0 };
}

export function catchChance(base, scale) {
  return Math.min(CONST.MAX_CATCH_CHANCE, Math.round((base + ringBonus(scale).bonus) * 100) / 100);
}

export function isFlick(vy) { return vy <= -MIN_FLICK; }

export function landing(start, vx, vy) {
  return { x: start.x + vx * FLIGHT_MS, y: start.y + vy * FLIGHT_MS };
}

export function isHit(p, rect, pad = 20) {
  return p.x >= rect.left - pad && p.x <= rect.right + pad && p.y >= rect.top - pad && p.y <= rect.bottom + pad;
}

// Ergebnis eines Treffers: gefangen nach 3 Wacklern, sonst Ausbruch nach 1–3
export function rollCatch(chance, rng) {
  const caught = rng() < chance;
  return { caught, wobbles: caught ? 3 : 1 + Math.floor(rng() * 3) };
}
```

- [ ] **Step 3: Tests**

Run: `node --test test/catch.test.mjs`
Expected: 6 PASS

---

### Task 4: Kampf-Bildschirm mit Animationen — Agent B

**Files:** Create `js/battle-ui.js`, Create `css/battle.css`. Nur diese beiden. Das DOM steht fest in `index.html` (Sektion `#screen-battle`), die Engine in `js/battle.js` (Task 2; falls noch nicht da, gegen die Spec §3 Engine-Signatur programmieren).

**Vertrag (muss exakt so sein, `app.js` verlässt sich darauf):**

```js
import { createBattle, tick } from './battle.js';
export function createBattleScreen({ el, onEnd }) -> { start({ team, enemy, rng }), stop() }
// onEnd({ won: boolean, retry: boolean }) wird genau einmal pro Kampf aufgerufen,
// wenn der Spieler im End-Overlay "Weiter" (retry false) oder "Nochmal" (retry true) tippt.
```

**DOM in `#screen-battle` (vorhanden):** `.flash` (Vollbild-Overlay zum Blinken), `.battle-top .fighter.enemy` mit `.fname .bar.hp .fill .btc .status .timer`, `.stage` mit `img.enemy-sprite`, `.helpers` (für Familientreffen-Sprites), `.fx` (Effekt-Ebene), `.stage-hint`; `.fighter.me` mit `img.sprite .fname .bar.hp .fill .btc .bar.energy .fill .status`; `.specials` (Buttons werden per JS erzeugt); `.switch.hidden` (Liste zum Wechseln); `.overlay.hidden` mit `img.boss .trophy .title .sub .retry .done`.

**Verhalten:**
1. `start()` baut den State mit `createBattle`, setzt Sprites (`sprites/<id>.png`), erzeugt die Spezial-Buttons des aktiven Rüthers (Name, `⚡cost`, Schaden), startet die `requestAnimationFrame`-Schleife. `dt` auf 100 ms begrenzen. Eingaben zwischen zwei Frames sammeln (`taps` addieren, `dodge`/`special`/`switchTo` setzen) und als ein `input` an `tick` geben, dann Events verarbeiten und rendern.
2. Eingabe auf `.stage` per Pointer-Events (`pointerdown`/`pointerup`/`pointercancel`, `touch-action: none` im CSS): horizontale Bewegung > 40 px = `dodge` (Richtung merken für die Animation), sonst `taps: 1`. Pfeiltasten links/rechts am Desktop = `dodge`. Spezial-Buttons per `click` → `special: i`. „Wechseln" klappt `.switch` mit Buttons aller lebenden anderen Rüthers auf → `switchTo: i`.
3. Rendern pro Frame: Namen, Balken-Breiten (HP grün, unter 25 % rot; Energie orange), BTC-Text `btc / maxBtc`, Energie-Text, Status-Icons (`☠ Gift`, `💤 betäubt`, `↓ geschwächt`), Timer `Math.ceil((duration - time)/1000)` (unter 10 s rot und pulsierend). Spezial-Buttons: `disabled` wenn Energie < cost, Rüther betäubt oder `once` verbraucht; mit genug Energie Klasse `ready` (pulsiert). Nach `switch`-Event Buttons neu bauen und `.me .sprite` wechseln.
4. Events → Animationen (jede Zeile ist Pflicht und muss sichtbar unterscheidbar sein). Effekt-Elemente werden in `.fx` erzeugt (`div.fx-item` + Klasse), per CSS-Keyframes animiert und nach Ablauf entfernt (`animationend` oder Timeout). Positionen: Klasse `at-enemy` (über dem Boss-Sprite) oder `at-me` (unten über dem eigenen Rüther).
   - `fast`: Boss-Sprite `shake` + schwebende Zahl `-n` + kurzes 💥.
   - `special`: Animation nach `attack.fx` (Tabelle unten) + Zahl, wenn Schaden.
   - `specialDenied`: `.specials` wackelt.
   - `stunnedTap`: über dem eigenen Rüther „betäubt" kurz einblenden.
   - `warn`: `.flash` blinkt `ms` lang (`yellow` bei fast, `red` bei charged, pulsierend), Boss-Sprite `windup` (wächst, kippt nach hinten).
   - `dodge`: eigener Sprite `dodge-left`/`dodge-right` (rutscht 60 px zur Seite und zurück), Text „Ausgewichen!".
   - `enemyAttack`: Boss-Animation nach `attack.fx`; bei `kind === 'charged'` bebt `.stage` (`quake`); Schaden > 0 und nicht ausgewichen: eigener Sprite `shake` + rote Zahl; ausgewichen: grüne kleine Zahl.
   - `poisoned`: Ziel bekommt Klasse `poisoned` (grüne Tönung) solange `status.poison` gesetzt ist (im Render prüfen); beim Event kleine grüne Wolke.
   - `poison`: kleine grüne Zahl über dem Ziel.
   - `stun` (enemy): Boss-Sprite Klasse `stunned` (grau, 15° gekippt) solange `stunUntil > time`, dazu 💤 steigt auf. `stun` (me): Fortschrittsbalken „Firmware-Update" über dem eigenen Rüther, der in `ms` von 0 auf 100 % läuft.
   - `weaken`: Pfeil ↓ fällt über dem Boss; Boss-Sprite Klasse `weak` (blasser) solange `weakenedUntil > time`.
   - `heal`: Ziel-Panel leuchtet grün, Zahl `+n` grün.
   - `summoned`: `.helpers` einblenden mit `img` Sprites der `ids`, rutschen von links rein; nach `ms` ausblenden.
   - `summon`: der passende Helfer hüpft, Zahl über dem Boss.
   - `faint`: eigener Sprite `ko` (kippt um, verblasst), Text „<Name> ist pleite!".
   - `switch`: neuer Sprite kommt mit `slide-in`, Text „<Name>, du bist dran!".
   - `win`: Boss-Sprite `ko`; `lose`: nichts extra. Nach 900 ms Overlay zeigen.
5. Spezial-Animationen nach `fx` (alle per CSS-Keyframes, Emoji erlaubt):

| fx | Pflicht-Bild |
|---|---|
| chart-up | grüne Kurslinie (inline-SVG `polyline`, wird gezeichnet via `stroke-dasharray`) zieht über den Boss nach oben rechts, großes „+70 %", 8–10 Bitcoin-Münzen (`sprites/coin.png`) regnen versetzt herunter |
| handshake | 🤝 wächst pulsierend vor dem Boss, Boss wird blass (`weak`) |
| can | 🍺 fliegt im Bogen von unten zum Boss, dreht sich 2×, Boss `shake` beim Einschlag |
| family | „📣 Familie!" beim eigenen Rüther; die Helfer-Sprites kommen über `summoned` |
| handbag | 👜 schwingt von rechts in den Boss (Rotation −60° → 20°) |
| wallet | 🎮 erscheint beim eigenen Rüther, klappt (rotateY) zu ₿ um; danach fliegen 6 Münzen vom Boss zum Rüther |
| controller | 🎮 fliegt rotierend zum Boss |
| gas | große grüne Wolke (radial-gradient, blur) breitet sich über dem Boss aus und verblasst (1,6 s) |
| speech | Sprechblase mit „Deutsche Bank ist kein Geringverdiener." beim eigenen Rüther (2 s), Boss kippt über `stunned` + 💤 |
| mms | 14 bunte Punkte prasseln versetzt auf den Boss |
| bags | 🛍️🛍️🛍️ hüpfen nacheinander beim eigenen Rüther, HP-Balken leuchtet |

Boss-`fx`: `disc` 💿 fliegt von oben auf den Spieler · `yellow` gelbes Leuchten um den Boss-Sprite · `firmware` Text „Firmware-Update…" (der Balken kommt über `stun` me) · `crash` rote fallende Kurslinie (inline-SVG) über dem Spieler · `chain` ⛓️⛓️⛓️ rasselt vor dem Spieler · `mining` ⛏️ schwingt beim Boss + grünes Leuchten · `block` 🧱 fällt auf den Spieler und hüpft · `half` riesiges „½" skaliert ein und verblasst · `key` 🔑 steigt beim Boss auf + grünes Leuchten.

6. End-Overlay: `.title` „Arena erobert!" bzw. „Verloren"; `.sub` „<Boss> ist pleite. Die Arena gehört jetzt <team[0].name>." bzw. „Die Zeit ist um." / „Alle Rüthers sind pleite."; `.boss` zeigt den Boss-Sprite, bei Sieg Klasse `fall` (kippt um und verblasst); `.trophy` springt bei Sieg groß rein (bei Niederlage versteckt); `.retry` nur bei Niederlage. Buttons rufen `onEnd` auf und stoppen die Schleife.
7. Layout `css/battle.css`: Vollbild-Spalte, `.stage` nimmt `flex: 1`, Boss-Sprite ca. 45 % der Breite, mittig; alles passt auf 375×812 ohne Scroll; Safe-Areas oben/unten; `.specials` als Grid mit 2 Spalten; `.fx` absolut über der Bühne, `pointer-events: none`, `overflow: hidden`.

**Prüfen (Agent B selbst):** `node --check js/battle-ui.js`; jeder Selektor aus Punkt „DOM" existiert in `index.html`; jedes `fx` aus `js/data.js` (`grep -o "fx: '[a-z-]*'" js/data.js | sort -u`) hat eine Animation; jede Event-Art aus der Engine wird behandelt.

---

### Task 5: Fang-Bildschirm v2 — Agent C

**Files:** Create `js/catch.js` (ersetzt v1 komplett), Create `css/catch.css`. Nur diese beiden. Logik aus `js/catch-logic.js` (Task 3) importieren, nicht nachbauen.

**Vertrag (unverändert zu v1, `app.js` verlässt sich darauf):**
```js
export function createCatchScreen({ el, onDone, onCancel }) -> { start(spawn, def, rng = Math.random) }
// onDone({ spawn, caught }) genau einmal pro Fang; onCancel() beim ✕
```

**DOM in `#screen-catch` (vorhanden):** `button.back`, `.catch-stage` mit `.target > img.sprite + .ring`, `.catch-fx`, `.catch-msg`, `img.coin`; `.catch-info` mit `.name .title .desc .throws .hint`.

**Verhalten (Spec §2):**
1. `start()` setzt Sprite/Texte, `throws` = „Ausbrüche übrig: 3", Münze unten mittig, Zustand `idle`. Der Rüther bekommt die CSS-Animationen `roam` (±40 px, 4 s, endlos) und alle 3–6 s zufällig einmal `hop`. Alle 5–9 s (zufällig, `setTimeout`-Kette) 1,2 s lang Klasse `angry` (rotes Wackeln). Beim Verlassen des Screens alle Timer löschen.
2. Ring: `.ring` schrumpft per CSS-Keyframe endlos von Skalierung 1,0 auf 0,3 in 2,4 s (linear, dann Sprung zurück). Aktuelle Skalierung beim Treffer aus `getComputedStyle(ring).transform` (Matrix `a`-Wert) lesen.
3. Münze ziehen: `pointerdown` auf der Münze startet, `pointermove` verschiebt sie (transform), dabei Positionen mit Zeitstempel sammeln (letzte 100 ms). `pointerup`: Geschwindigkeit `vx, vy` in px/ms aus dem ältesten Sample innerhalb 100 ms. `isFlick(vy)` falsch → Münze gleitet zurück (Transition), Zustand bleibt `idle`. Sonst `flying`: Zielpunkt `landing(start, vx, vy)`; Flug 700 ms per `requestAnimationFrame`: x linear, y linear plus Bogen `-120 * sin(π·t)`, Rotation 720°, Skalierung 1 → 0,5. Trefferprüfung am Ende mit `isHit(ziel, spriteRect)`.
4. Daneben: Münze fällt weiter nach unten aus dem Bild (300 ms), `.catch-msg` „Daneben!", nach 500 ms Münze wieder unten, `idle`. Trifft während `angry`: Münze prallt ab (fliegt zurück nach unten, 400 ms), „Abgewehrt!", `idle`.
5. Treffer: Ring-Bewertung (`ringBonus(scale).label`, falls nicht leer) als Text über dem Rüther einblenden. Rüther-Animation `suck` (skaliert zur Münzposition auf 0, 400 ms), Münze fällt auf den Boden (`drop`, 200 ms). `rollCatch(catchChance(def.catchChance, scale), rng)` entscheidet. Dann `wobbles`-mal `wobble` (je 600 ms, ±20°, nacheinander). Danach:
   - gefangen: Münze `glow`, 8 `.star` fliegen sternförmig auseinander (Keyframe mit je eigener Richtung über CSS-Variable `--dx/--dy`), „Gefangen!", nach 1 s `onDone({ spawn, caught: true })`.
   - Ausbruch: Münze `burst` (kurz groß, dann weg), Rüther erscheint mit `pop` (von 0 auf 1 mit Überschwingen), „Rausgehauen!", Ausbrüche −1. Bei 0: Rüther `flee` (rennt nach rechts aus dem Bild, 700 ms), „<Name> ist abgehauen.", nach 1 s `onDone({ spawn, caught: false })`. Sonst nach 600 ms `idle`, Münze wieder unten.
6. Während `flying`/Treffer-Sequenz keine neue Eingabe. ✕ nur in `idle`.
7. `css/catch.css`: Bühne nimmt oben ca. 60 % der Höhe, Hintergrund radialer Verlauf, Sprite 160 px, Ring als Kreis mit orangem Rand 4 px um den Sprite (Mitte am Sprite), Münze 96 px unten mittig; Keyframes `roam hop angry ring-shrink suck drop wobble glow star burst pop flee`; `.catch-msg` groß, mittig über der Münze; `touch-action: none` auf der Bühne.

**Prüfen (Agent C selbst):** `node --check js/catch.js`; alle Selektoren existieren in `index.html`; die Münze lässt sich mit der Maus ziehen (Pointer-Events funktionieren mit Maus genauso).

---

### Task 6: Ortung, Karte, Verdrahtung — Agent D

**Files:** Modify `js/geo.js`, `js/map.js`, `js/app.js`, `js/screens.js`, `js/storage.js`, `style.css`, `README.md`. Vollständiger Code unten; Dateien komplett ersetzen (außer `style.css` und `README.md`: gezielte Änderungen).

- [ ] **Step 1: `js/geo.js`**

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

export function offsetPoint(center, metersNorth, metersEast) {
  return {
    lat: center.lat + metersNorth / M_PER_DEG_LAT,
    lon: center.lon + metersEast / (M_PER_DEG_LAT * Math.cos(toRad(center.lat))),
  };
}

export function randomPointInRing(center, minM, maxM, rng) {
  const d = minM + rng() * (maxM - minM);
  const ang = rng() * 2 * Math.PI;
  return offsetPoint(center, d * Math.cos(ang), d * Math.sin(ang));
}

// GPS mit Fake-Position für den Test-Modus. Startet die Beobachtung neu, wenn der
// Tab wieder sichtbar wird oder die Ortung in einen Timeout läuft.
export function createLocator({ onPosition, onError }) {
  let fake = null;
  let last = null;
  let watchId = null;
  const geo = navigator.geolocation;

  function start() {
    if (!geo) { onError(new Error('Keine Ortung verfügbar')); return; }
    if (watchId !== null) geo.clearWatch(watchId);
    watchId = geo.watchPosition(
      p => {
        last = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        if (!fake) onPosition(last);
      },
      e => {
        if (e.code === 3) setTimeout(start, 2000); // TIMEOUT: neu versuchen
        if (!fake && !last) onError(e);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }
  start();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') start(); });

  return {
    setFake(pos) { fake = pos; onPosition(pos); },
    clearFake() { fake = null; if (last) onPosition(last); else onError(new Error('Keine Ortung')); },
    restart: start,
    get current() { return fake || last; },
    get isFake() { return fake !== null; },
  };
}
```

- [ ] **Step 2: `js/map.js`**

```js
/* global L */
// Leaflet-Adapter mit Folgen-Modus und Besitz-Markern.

const HAGEN = [51.36, 7.47];

function spriteIcon(id) {
  return L.divIcon({ className: 'spawn-icon', html: `<img src="sprites/${id}.png" alt="">`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon() {
  return L.divIcon({ className: 'arena-icon', html: '⚔', iconSize: [40, 40], iconAnchor: [20, 20] });
}
function ownedIcon(ruetherId) {
  return L.divIcon({ className: 'arena-icon owned', html: `<img src="sprites/${ruetherId}.png" alt=""><span class="trophy">🏆</span>`, iconSize: [48, 48], iconAnchor: [24, 24] });
}

export function createMap({ el, arenas, onSpawnTap, onArenaTap, onFollowChange }) {
  const map = L.map(el, { zoomControl: false }).setView(HAGEN, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pulse = L.marker(HAGEN, { icon: L.divIcon({ className: 'player-pulse', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false });
  const player = L.circleMarker(HAGEN, { radius: 8, color: '#fff', fillColor: '#2a7fff', fillOpacity: 1, weight: 2 });
  const spawnLayer = L.layerGroup().addTo(map);
  const arenaMarkers = {};
  for (const a of arenas) {
    arenaMarkers[a.id] = L.marker([a.lat, a.lon], { icon: arenaIcon() }).addTo(map).on('click', () => onArenaTap(a));
  }
  let following = true;
  let centered = false;
  map.on('dragstart', () => { following = false; onFollowChange?.(false); });

  return {
    setPlayer(pos) {
      const ll = [pos.lat, pos.lon];
      player.setLatLng(ll); pulse.setLatLng(ll);
      if (!map.hasLayer(player)) { pulse.addTo(map); player.addTo(map); }
      if (!centered) { map.setView(ll, 16); centered = true; }
      else if (following) map.panTo(ll, { animate: true, duration: 0.5 });
    },
    follow(pos) {
      following = true; onFollowChange?.(true);
      if (pos) { map.setView([pos.lat, pos.lon], 16); centered = true; }
    },
    setSpawns(spawns) {
      spawnLayer.clearLayers();
      for (const s of spawns) {
        L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId) }).addTo(spawnLayer).on('click', () => onSpawnTap(s));
      }
    },
    setArenaOwner(id, ruetherId) { arenaMarkers[id].setIcon(ruetherId ? ownedIcon(ruetherId) : arenaIcon()); },
    invalidate() { map.invalidateSize(); },
  };
}
```

- [ ] **Step 3: `js/storage.js`** – nur `emptySave` ändern:

```js
export const emptySave = () => ({ version: 1, caught: {}, team: [], arenasBeaten: [], arenaOwners: {}, victoryShown: false });
```

- [ ] **Step 4: `js/screens.js`** (Kampf-Screen raus, Besitzer-Zeile rein)

```js
import { CONST, RUETHERS } from './data.js';

// ---------- Team ----------
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
    show(a, { distanceM, teamSize, beaten, ownerName }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.sprite').src = `sprites/${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} (${boss.btc} BTC)`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${Math.round(distanceM)} m`;
      el.querySelector('.owner').textContent = ownerName ? `🏆 Besitzer: ${ownerName}` : 'Noch niemand hat diese Arena erobert.';
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (beaten) status = 'Bereits erobert. Nochmal kämpfen?';
      else if (!inRange) status = `Du musst näher als ${CONST.ARENA_RANGE} m ran.`;
      else if (teamSize === 0) status = 'Du brauchst mindestens einen Rüther im Team.';
      el.querySelector('.status').textContent = status;
      fight.disabled = !(inRange && teamSize > 0);
    },
  };
}

// ---------- Sieg ----------
export function createVictoryScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  return {};
}
```

- [ ] **Step 5: `js/app.js`**

```js
import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import { createTeamScreen, createArenaScreen, createVictoryScreen } from './screens.js';
import { createBattleScreen } from './battle-ui.js';
import { makeFighter, makeBoss } from './battle.js';

const $ = s => document.querySelector(s);
let save = storage.load();
let spawns = [];
let pos = null;
let lastSpawnPos = null;
let debugWeakBoss = false;

// ---------- Screens ----------
const screens = [...document.querySelectorAll('section.screen')];
function show(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-map') map.invalidate();
}

// ---------- Banner / Toast / HUD ----------
// kind: 'geo' | 'save'. Leeren ('') wirkt nur, wenn der sichtbare Banner von derselben Quelle stammt.
function banner(text, kind) {
  const b = $('#banner');
  if (!text && b.dataset.kind !== kind) return;
  b.textContent = text; b.dataset.kind = kind; b.classList.toggle('hidden', !text);
}
let toastTimer = null;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}
function persist() {
  if (!storage.save(save)) banner('Spielstand kann nicht gespeichert werden.', 'save');
  updateHud();
}
function updateHud() {
  $('#hud-caught').textContent = `${Object.keys(save.caught).length}/${RUETHERS.length} gefangen`;
  $('#hud-arenas').textContent = `${save.arenasBeaten.length}/${ARENAS.length} Trophäen`;
  $('#badge').classList.toggle('hidden', save.arenasBeaten.length < ARENAS.length);
  for (const a of ARENAS) map.setArenaOwner(a.id, save.arenaOwners[a.id] || null);
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
    const owner = save.arenaOwners[a.id];
    arenaScreen.show(a, {
      distanceM: pos ? distance(pos, a) : null,
      teamSize: save.team.length,
      beaten: save.arenasBeaten.includes(a.id),
      ownerName: owner ? RUETHER_BY_ID[owner].name : null,
    });
    show('screen-arena');
  },
  onFollowChange(following) { $('#btn-locate').classList.toggle('following', following); },
});
$('#btn-locate').addEventListener('click', () => map.follow(pos));

// ---------- Spawns ----------
function refreshSpawns() {
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random });
  map.setSpawns(spawns);
  lastSpawnPos = pos;
}
setInterval(refreshSpawns, CONST.SPAWN_INTERVAL);

// ---------- Ortung ----------
const locator = createLocator({
  onPosition(p) {
    pos = p;
    map.setPlayer(p);
    banner('', 'geo');
    if (!lastSpawnPos || distance(lastSpawnPos, p) > CONST.SPAWN_WALK) refreshSpawns();
  },
  onError() {
    banner('Ortung aus. Erlaube sie in den Browser-Einstellungen oder nutze den Test-Modus.', 'geo');
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
function startBattle(a) {
  currentArena = a;
  const team = save.team.map(id => makeFighter(RUETHER_BY_ID[id], save.caught[id]?.bonusBtc ?? 0));
  const enemy = makeBoss(BOSSES[a.boss]);
  if (debugWeakBoss) enemy.btc = 20;
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random });
}
const arenaScreen = createArenaScreen({
  el: $('#screen-arena'),
  bosses: BOSSES,
  onBack() { show('screen-map'); },
  onFight: startBattle,
});
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEnd({ won, retry }) {
    if (retry) return startBattle(currentArena);
    if (won) {
      if (!save.arenasBeaten.includes(currentArena.id)) save.arenasBeaten.push(currentArena.id);
      save.arenaOwners[currentArena.id] = save.team[0];
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
  map.follow(p);
  refreshSpawns();
  toast(`Gebeamt: ${a.name}`);
}));
$('#dbg-gps').addEventListener('click', () => {
  locator.clearFake();
  if (!locator.current) { pos = null; lastSpawnPos = null; map.setSpawns(spawns = []); }
  toast('GPS wieder an');
});
$('#dbg-respawn').addEventListener('click', () => { spawns = []; refreshSpawns(); toast('Spawns neu'); });
$('#dbg-catchall').addEventListener('click', () => {
  for (const r of RUETHERS) save.caught[r.id] ??= { count: 1, bonusBtc: 0 };
  for (const r of RUETHERS) if (save.team.length < CONST.TEAM_SIZE && !save.team.includes(r.id)) save.team.push(r.id);
  persist(); toast('Alle gefangen');
});
$('#dbg-weakboss').addEventListener('click', e => {
  debugWeakBoss = !debugWeakBoss;
  e.target.textContent = `Boss fast tot: ${debugWeakBoss ? 'an' : 'aus'}`;
});
$('#dbg-reset').addEventListener('click', () => { storage.clear(); save = storage.emptySave(); persist(); toast('Spielstand gelöscht'); });
$('#dbg-close').addEventListener('click', () => debug.classList.add('hidden'));

// ---------- Start ----------
updateHud();
```

- [ ] **Step 6: `style.css`**

Den Block von `/* Fangen */` bis vor `/* Team */` **entfernen** (der Fang-Stil lebt jetzt in `css/catch.css`), aber die Regel `.hint { color: var(--muted); font-size: 13px; }` behalten (direkt vor `/* Team */` wieder einfügen). Den Block von `/* Kampf */` bis vor `/* Sieg */` **entfernen** (lebt in `css/battle.css`). Die Regel `#map { flex: 1; background: #333; }` durch die folgenden Regeln ersetzen und die Besitz-Marker-Regeln hinter `.arena-icon.beaten` einfügen:

```css
.map-wrap { position: relative; flex: 1; display: flex; }
#map { flex: 1; background: #333; }
.locate { position: absolute; right: 12px; bottom: 12px; z-index: 1000; width: 48px; height: 48px; border-radius: 50%; padding: 0; font-size: 22px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.locate.following { background: var(--orange); }
.player-pulse { border-radius: 50%; background: rgba(42,127,255,.3); animation: pulse 2s ease-out infinite; }
@keyframes pulse { 0% { transform: scale(.4); opacity: .9; } 100% { transform: scale(1.4); opacity: 0; } }

.arena-icon.owned { background: #d4a017; width: 48px; height: 48px; position: relative; overflow: visible; }
.arena-icon.owned img { width: 100%; height: 100%; border-radius: 50%; image-rendering: pixelated; }
.arena-icon.owned .trophy { position: absolute; right: -8px; bottom: -8px; font-size: 18px; }
```

- [ ] **Step 7: `README.md`** – Abschnitt „Steuerung" ergänzen:

```markdown
## Steuerung

- Karte folgt dir. Karte verschoben? 📍 unten rechts tippen.
- Fangen: Münze nach oben schnippen, kleiner Ring = bessere Chance. Drei Ausbrüche, dann ist der Rüther weg.
- Kampf: auf den Boss tippen = schneller Angriff und Energie. Spezial-Buttons unten, wenn die Energie reicht. Blinkt es, nach links oder rechts wischen = ausweichen. 90 Sekunden Zeit.
- Arenasieg: die Arena gehört deinem ersten Team-Rüther, Trophäe im HUD.
```

- [ ] **Step 8: Prüfen**

`node --check` für alle `js/*.js`; `node --test test/*.test.mjs` (spawn-Tests müssen weiter laufen).

---

### Task 7: Browser-Check (Orchestrator)

`python -m http.server 8000`, `http://localhost:8000/?debug=1`, Handy-Größe 375×812:
1. Konsole ohne Fehler. 📍-Button sichtbar, orange.
2. Beamen: PC Sale → Karte springt, Spawns da, Karte ziehen → 📍 wird weiß, 📍 tippen → zentriert, orange.
3. Spawn in Reichweite antippen → Fang-Screen: Rüther bewegt sich, Ring schrumpft, Münze mit der Maus nach oben schnippen → Flug, Treffer → Einsaugen, Wackeln, Burst oder Ausbruch. Daneben → „Daneben!".
4. „Alle Rüthers fangen", Arena antippen → „Kämpfen": Tippen auf den Boss macht Schaden und lädt Energie, Spezial-Button leuchtet, jede Spezial-Attacke zeigt ihre Animation, Boss-Warnung blinkt, Wischen = „Ausgewichen!", Timer läuft.
5. „Boss fast tot: an" → Kampf gewinnen → Overlay „Arena erobert!", Boss kippt, 🏆. „Weiter" → Marker zeigt Rüther-Sprite mit 🏆, HUD „1/3 Trophäen", Arena-Info zeigt Besitzer.
6. Kampf verlieren (Timer ablaufen lassen) → „Verloren", „Nochmal" startet neu.

---

## Self-Review

**Spec-Abdeckung:** §1 Ortung → Task 6 (geo, map, app). §2 Fangen → Tasks 3 + 5. §3 Kampf → Tasks 2 + 4. §4 Arenen → Tasks 4 (Overlay) + 6 (Besitz, HUD, Debug). §5 Tests → Tasks 2, 3.

**Verträge:** `createBattleScreen({el,onEnd}).start({team,enemy,rng})` / `onEnd({won,retry})` in Task 4 und app.js identisch. `createCatchScreen` wie v1. `createMap` liefert `setPlayer follow setSpawns setArenaOwner invalidate`, app.js nutzt genau diese. `createArenaScreen.show(a, {distanceM, teamSize, beaten, ownerName})` in screens.js und app.js identisch. Engine-Events in Task 2 und Animations-Tabelle in Task 4 stimmen überein (`fast special specialDenied stunnedTap warn dodge enemyAttack poisoned poison stun weaken heal summoned summon faint switch win lose`).
