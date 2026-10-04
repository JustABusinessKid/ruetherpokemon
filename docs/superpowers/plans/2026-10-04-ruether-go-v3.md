# Rüther GO v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seltenheitsstufen mit Rütherdex, Sats-Währung mit Power-Ups und Shop, Arena-Level mit Wutphase, VS-Intro, Hintergründen, Combo und Konfetti.

**Architecture:** Neue reine Logik in `js/progress.js` (Seltenheit, Stats, Sats, Level, Arenen, Migration), Engine `js/battle.js` erweitert (Power, Arena-Skalierung, Wut). Spielstand v2 mit Exemplaren (`box`), Migration von v1. UI: Sammlung/Dex/Shop in `js/screens.js` + `css/screens.css`, Kampf-Intro/Wut/Combo/Hintergründe in `js/battle-ui.js` + `css/battle.css`, Fang-Seltenheit/Super-Münze/Belohnung in `js/catch.js` + `css/catch.css`.

**Spec:** `docs/superpowers/specs/2026-10-04-ruether-go-v3-design.md` (gilt bei Zweifel), darunter v2 und v1.

**Schon erledigt (nicht anfassen):** `js/data.js` (RARITIES, SHOP, neue CONST) und `index.html` (alle neuen Screens, Elemente und Debug-Buttons).

**Allgemeine Regeln:** UTF-8 ohne BOM, LF (Write-Tool erzeugt CRLF → mit Node-Skript normalisieren). Keine Commits aus Agenten. Tests: `node --test test/*.test.mjs`. Agenten ändern nur ihre Dateien. Lokal: `python -m http.server 8000` → `http://localhost:8000/?debug=1`.

---

## Dateistruktur

| Datei | Besitzer | Verantwortung |
|---|---|---|
| `js/progress.js`, `test/progress.test.mjs` | A | Seltenheit, Stats, Sats, Level, Arenen, Migration (Code unten) |
| `js/battle.js`, `test/battle.test.mjs`, `js/spawn.js`, `test/spawn.test.mjs` | A | Engine v3 (Power, Arena-Skalierung, Wut), Spawn-Seltenheit (Code unten) |
| `js/battle-ui.js`, `css/battle.css` | B | Intro, Wut, Combo, Treffer-Blitz, Beben, Hintergründe, Glanz, Konfetti, Sats-Zähler (Vertrag unten) |
| `js/catch.js`, `css/catch.css` | C | Aura, Badge, Super-Münze, Belohnungs-Popup, Legendär-Burst (Vertrag unten) |
| `js/storage.js`, `js/map.js`, `js/screens.js`, `css/screens.css`, `js/app.js`, `style.css`, `README.md` | D | Speicher v2, Marker, Sammlung/Dex/Shop/Arena-Info, Verdrahtung (Code unten) |

---

### Task 2: Fortschritts-Logik (TDD) — Agent A

**Files:** Create `test/progress.test.mjs`, Create `js/progress.js`.

- [ ] **Step 1: `test/progress.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rollRarity, instanceMult, fighterStats, levelCost, powerUp, catchChanceV3, catchReward,
  arenaScale, arenaReward, arenaWin, buyItem, migrate, emptySaveV2, dexCount, DEX_TOTAL, lureActive,
} from '../js/progress.js';
import { RUETHER_BY_ID } from '../js/data.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('rollRarity: gewichtete Stufen', () => {
  assert.equal(rollRarity(() => 0.0), 'normal');
  assert.equal(rollRarity(() => 0.71), 'selten');
  assert.equal(rollRarity(() => 0.91), 'episch');
  assert.equal(rollRarity(() => 0.985), 'legendaer');
});

test('fighterStats: Christian Legendär Level 20', () => {
  const inst = { rarity: 'legendaer', level: 20 };
  assert.ok(near(instanceMult(inst), 2.816));
  const st = fighterStats(RUETHER_BY_ID.christian, inst);
  assert.equal(st.btc, 282);
  assert.ok(near(st.power, 2.816));
  assert.deepEqual(fighterStats(RUETHER_BY_ID.christian, undefined), { btc: 100, power: 1 });
});

test('levelCost und powerUp', () => {
  assert.equal(levelCost(1), 50);
  assert.equal(levelCost(19), 950);
  assert.equal(levelCost(20), null);
  const s = emptySaveV2();
  s.box.push({ uid: 'r1', id: 'christian', rarity: 'normal', level: 1, caughtAt: 0 });
  assert.equal(powerUp(s, 'r1').ok, false);
  s.sats = 60;
  assert.deepEqual(powerUp(s, 'r1'), { ok: true, cost: 50, level: 2 });
  assert.equal(s.sats, 10);
  s.box[0].level = 20; s.sats = 5000;
  assert.equal(powerUp(s, 'r1').reason, 'max');
  assert.equal(powerUp(s, 'nope').ok, false);
});

test('catchChanceV3: Abzug, Ring, Super-Münze, Grenzen', () => {
  assert.equal(catchChanceV3(0.5, 'legendaer', 0.9, false), 0.2);
  assert.equal(catchChanceV3(0.5, 'legendaer', 0.9, true), 0.4);
  assert.equal(catchChanceV3(0.5, 'normal', 0.4, true), 0.95);
  assert.equal(catchChanceV3(0.35, 'legendaer', 0.9, false), 0.05);
  assert.equal(catchChanceV3(0.5, 'selten', 0.6, false), 0.52);
});

test('catchReward: Dex-Bonus nur beim ersten Mal, Team wird aufgefüllt', () => {
  const s = emptySaveV2();
  const r1 = catchReward(s, 'christian', 'selten', 123);
  assert.equal(r1.sats, 130);
  assert.equal(r1.newDex, true);
  assert.equal(s.sats, 130);
  assert.equal(s.box.length, 1);
  assert.equal(s.box[0].rarity, 'selten');
  assert.equal(s.box[0].caughtAt, 123);
  assert.deepEqual(s.team, [s.box[0].uid]);
  const r2 = catchReward(s, 'christian', 'selten', 124);
  assert.equal(r2.sats, 30);
  assert.equal(r2.newDex, false);
  assert.equal(s.sats, 160);
  assert.equal(s.stats.catches, 2);
  assert.equal(dexCount(s), 1);
  assert.equal(DEX_TOTAL, 20);
});

test('Arena: Skalierung, Belohnung, Level, gemeistert', () => {
  assert.equal(arenaScale(1), 1);
  assert.equal(arenaScale(3), 1.5);
  assert.equal(arenaReward(2), 300);
  const s = emptySaveV2();
  s.box.push({ uid: 'r1', id: 'christian', rarity: 'normal', level: 1, caughtAt: 0 });
  let w = arenaWin(s, 'pcsale', 'r1');
  assert.deepEqual(w, { sats: 150, level: 1, newLevel: 2, mastered: false });
  assert.equal(s.arenaLevels.pcsale, 2);
  assert.equal(s.arenaOwners.pcsale, 'r1');
  assert.equal(s.sats, 150);
  s.arenaLevels.pcsale = 5;
  w = arenaWin(s, 'pcsale', 'r1');
  assert.equal(w.sats, 750);
  assert.equal(w.mastered, true);
  assert.equal(s.arenaLevels.pcsale, 5);
  assert.equal(s.arenaMastered.pcsale, true);
  assert.equal(s.stats.arenaWins, 2);
});

test('buyItem: Super-Münze ins Inventar, Lockmodul aktiviert sofort', () => {
  const s = emptySaveV2();
  assert.equal(buyItem(s, 'supercoin', 0).ok, false);
  s.sats = 400;
  assert.equal(buyItem(s, 'supercoin', 0).ok, true);
  assert.equal(s.items.supercoin, 1);
  assert.equal(s.sats, 360);
  assert.equal(buyItem(s, 'lockmodul', 1000).ok, true);
  assert.equal(s.lureUntil, 301000);
  assert.equal(s.sats, 60);
  assert.equal(lureActive(s, 2000), true);
  assert.equal(lureActive(s, 400000), false);
  assert.equal(buyItem(s, 'nix', 0).ok, false);
});

test('migrate: v1 → v2', () => {
  const v1 = { version: 1, caught: { christian: { count: 3, bonusBtc: 20 }, viktor: { count: 1, bonusBtc: 0 } }, team: ['viktor', 'christian'], arenasBeaten: ['pcsale'], arenaOwners: { pcsale: 'christian' }, victoryShown: false };
  const s = migrate(v1);
  assert.equal(s.version, 2);
  assert.equal(s.box.length, 2);
  const chr = s.box.find(i => i.id === 'christian');
  assert.equal(chr.level, 3);
  assert.equal(chr.rarity, 'normal');
  assert.equal(s.dex['christian:normal'], true);
  assert.equal(s.dex['viktor:normal'], true);
  assert.equal(s.sats, 200);
  assert.equal(s.stats.catches, 4);
  assert.deepEqual(s.team, [s.box.find(i => i.id === 'viktor').uid, chr.uid]);
  assert.equal(s.arenaLevels.pcsale, 2);
  assert.equal(s.arenaOwners.pcsale, chr.uid);
  assert.equal(s.items.supercoin, 0);
  assert.equal(migrate(null).version, 2);
  assert.equal(migrate({ version: 7 }).box.length, 0);
  const v2 = migrate({ version: 2, box: [], team: [], sats: 5 });
  assert.equal(v2.sats, 5);
  assert.deepEqual(v2.items, { lockmodul: 0, supercoin: 0 });
});
```

- [ ] **Step 2: Test laufen lassen → FAIL (Modul fehlt)**

- [ ] **Step 3: `js/progress.js`**

```js
import { CONST, RARITIES, RARITY_BY_ID, RUETHERS, RUETHER_BY_ID, SHOP } from './data.js';
import { ringBonus } from './catch-logic.js';

// ---------- Seltenheit ----------
export function rollRarity(rng) {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let x = rng() * total;
  for (const r of RARITIES) { if (x < r.weight) return r.id; x -= r.weight; }
  return RARITIES[0].id;
}
export const rarityOf = id => RARITY_BY_ID[id] || RARITY_BY_ID.normal;

// ---------- Stats ----------
export function instanceMult(inst) {
  return rarityOf(inst?.rarity).mult * (1 + CONST.LEVEL_STEP * ((inst?.level || 1) - 1));
}
export function fighterStats(def, inst) {
  const mult = instanceMult(inst);
  return { btc: Math.round(def.btc * mult), power: mult };
}

// ---------- Power-Up ----------
export function levelCost(level) {
  return level >= CONST.LEVEL_MAX ? null : CONST.LEVEL_COST * level;
}
export function powerUp(save, uid) {
  const inst = save.box.find(i => i.uid === uid);
  if (!inst) return { ok: false, reason: 'unbekannt' };
  const cost = levelCost(inst.level);
  if (cost == null) return { ok: false, reason: 'max' };
  if (save.sats < cost) return { ok: false, reason: 'sats' };
  save.sats -= cost;
  inst.level += 1;
  return { ok: true, cost, level: inst.level };
}

// ---------- Fangen ----------
export function catchChanceV3(base, rarityId, ringScale, superCoin) {
  const c = base - rarityOf(rarityId).catchPenalty + ringBonus(ringScale).bonus + (superCoin ? CONST.SUPERCOIN_BONUS : 0);
  return Math.min(CONST.MAX_CATCH_CHANCE, Math.max(CONST.MIN_CATCH_CHANCE, Math.round(c * 100) / 100));
}
export function newUid(save) {
  save.nextUid = save.nextUid || 1;
  const uid = 'r' + save.nextUid;
  save.nextUid += 1;
  return uid;
}
// Mutiert save: neues Exemplar, Dex, Sats, Team-Auffüllung. Gibt Belohnung zurück.
export function catchReward(save, id, rarityId, now = 0) {
  const r = rarityOf(rarityId);
  const uid = newUid(save);
  save.box.push({ uid, id, rarity: r.id, level: 1, caughtAt: now });
  const key = `${id}:${r.id}`;
  const newDex = !save.dex[key];
  if (newDex) save.dex[key] = true;
  const sats = r.sats + (newDex ? CONST.DEX_BONUS : 0);
  save.sats += sats;
  save.stats.catches += 1;
  if (save.team.length < CONST.TEAM_SIZE) save.team.push(uid);
  return { sats, newDex, uid };
}
export const DEX_TOTAL = RUETHERS.length * RARITIES.length;
export const dexCount = save => Object.keys(save.dex).length;

// ---------- Arenen ----------
export const arenaScale = level => 1 + CONST.ARENA_SCALE * (level - 1);
export const arenaReward = level => CONST.ARENA_WIN_BASE * level;
export function arenaWin(save, arenaId, leaderUid) {
  const level = save.arenaLevels[arenaId] || 1;
  const sats = arenaReward(level);
  save.sats += sats;
  save.stats.arenaWins += 1;
  save.arenaOwners[arenaId] = leaderUid;
  if (level >= CONST.ARENA_LEVELS) save.arenaMastered[arenaId] = true;
  else save.arenaLevels[arenaId] = level + 1;
  return { sats, level, newLevel: save.arenaLevels[arenaId] || level, mastered: !!save.arenaMastered[arenaId] };
}

// ---------- Shop ----------
export const lureActive = (save, now) => (save.lureUntil || 0) > now;
export function buyItem(save, itemId, now = 0) {
  const item = SHOP.find(i => i.id === itemId);
  if (!item) return { ok: false, reason: 'unbekannt' };
  if (save.sats < item.cost) return { ok: false, reason: 'sats' };
  save.sats -= item.cost;
  if (itemId === 'lockmodul') save.lureUntil = Math.max(now, save.lureUntil || 0) + CONST.LURE_MS;
  else save.items[itemId] = (save.items[itemId] || 0) + 1;
  return { ok: true };
}

// ---------- Spielstand ----------
export function emptySaveV2() {
  return {
    version: 2, box: [], team: [], sats: 0, dex: {}, arenaLevels: {}, arenaMastered: {}, arenaOwners: {},
    items: { lockmodul: 0, supercoin: 0 }, lureUntil: 0, victoryShown: false,
    stats: { catches: 0, arenaWins: 0 }, nextUid: 1,
  };
}
export function migrate(d) {
  const empty = emptySaveV2();
  if (!d || typeof d !== 'object') return empty;
  if (d.version === 2) return { ...empty, ...d, items: { ...empty.items, ...(d.items || {}) }, stats: { ...empty.stats, ...(d.stats || {}) } };
  if (d.version !== 1) return empty;
  const s = empty;
  const uidOf = {};
  let catches = 0;
  for (const [id, c] of Object.entries(d.caught || {})) {
    if (!RUETHER_BY_ID[id]) continue;
    const uid = newUid(s);
    s.box.push({ uid, id, rarity: 'normal', level: Math.min(CONST.LEVEL_MAX, 1 + Math.floor((c.bonusBtc || 0) / 10)), caughtAt: 0 });
    s.dex[`${id}:normal`] = true;
    uidOf[id] = uid;
    catches += c.count || 1;
  }
  s.team = (d.team || []).map(id => uidOf[id]).filter(Boolean);
  for (const id of d.arenasBeaten || []) s.arenaLevels[id] = 2;
  for (const [aid, rid] of Object.entries(d.arenaOwners || {})) if (uidOf[rid]) s.arenaOwners[aid] = uidOf[rid];
  s.sats = 50 * catches;
  s.stats.catches = catches;
  s.victoryShown = !!d.victoryShown;
  return s;
}
```

- [ ] **Step 4: `node --test test/progress.test.mjs` → 8 PASS**

---

### Task 3: Engine v3 und Spawn-Seltenheit — Agent A

**Files:** Modify `js/battle.js`, `test/battle.test.mjs`, `js/spawn.js`, `test/spawn.test.mjs`.

- [ ] **Step 1: `js/battle.js` komplett ersetzen**

```js
import { CONST } from './data.js';
import { fighterStats, arenaScale } from './progress.js';

// Echtzeit-Engine. tick() mutiert den State und liefert Events für die Animationen.

const freshStatus = () => ({ poison: null, stunUntil: 0, weakenedUntil: 0 });

// inst: Exemplar { uid, rarity, level } oder undefined (Normal, Level 1)
export function makeFighter(def, inst) {
  const { btc, power } = fighterStats(def, inst);
  return {
    id: def.id, uid: inst?.uid || null, name: def.name, rarity: inst?.rarity || 'normal', level: inst?.level || 1,
    btc, maxBtc: btc, power, attacks: def.attacks, energy: 0, used: {}, status: freshStatus(),
  };
}

export function makeBoss(def, arenaLevel = 1) {
  const scale = arenaScale(arenaLevel);
  const dmg = n => Math.floor(n * scale);
  const btc = Math.floor(def.btc * scale);
  return {
    id: def.id, name: def.name, btc, maxBtc: btc, arenaLevel, rage: false,
    fast: { ...def.fast, damage: dmg(def.fast.damage) },
    charged: def.charged.map(c => ({ ...c, damage: dmg(c.damage) })),
    chargedIndex: 0, fastEvery: def.fast.every, chargedEvery: CONST.CHARGED_EVERY,
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
  const dealt = atk.damage > 0 ? hurt(e, atk.damage * me.power) : 0;
  ev.push({ type: 'special', attack: atk, damage: dealt });
  if (atk.poison) { poison(e, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'enemy', ms: atk.poison.ms }); }
  if (atk.stun) stunEnemy(s, atk.stun, ev);
  if (atk.weaken) { e.status.weakenedUntil = s.time + atk.weaken; ev.push({ type: 'weaken', ms: atk.weaken }); }
  if (atk.drain && dealt > 0) ev.push({ type: 'heal', target: 'me', amount: heal(me, dealt) });
  if (atk.heal) ev.push({ type: 'heal', target: 'me', amount: heal(me, atk.heal) });
  if (atk.summon) {
    s.summons = atk.summon.map(x => ({ id: x.id, name: x.name, damage: x.damage, power: me.power, nextAt: s.time + CONST.SUMMON_INTERVAL, until: s.time + atk.summonMs }));
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
    e.nextFastAt = s.time + e.fastEvery;
  } else {
    e.nextChargedAt = s.time + e.chargedEvery;
    e.chargedIndex = (e.chargedIndex + 1) % e.charged.length;
    e.nextFastAt = Math.max(e.nextFastAt, s.time + 1000);
  }
}

function rageStep(s, ev) {
  const e = s.enemy;
  if (e.rage || !alive(e) || e.btc > CONST.RAGE_AT * e.maxBtc) return;
  e.rage = true;
  e.fastEvery = CONST.RAGE_FAST_EVERY;
  e.chargedEvery = CONST.RAGE_CHARGED_EVERY;
  e.nextFastAt = s.time + e.fastEvery;
  e.nextChargedAt = Math.min(e.nextChargedAt, s.time + e.chargedEvery);
  ev.push({ type: 'rage' });
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
      ev.push({ type: 'summon', id: su.id, name: su.name, damage: hurt(s.enemy, su.damage * (su.power || 1)) });
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

  const sw = input.switchTo;
  if (sw != null && sw !== s.active && s.team[sw] && alive(s.team[sw])) {
    s.active = sw; me = s.team[sw];
    ev.push({ type: 'switch', to: sw, fighter: me });
  }
  const meStunned = stunned(me, s.time);
  for (let i = 0; i < (input.taps || 0); i++) {
    if (meStunned) { ev.push({ type: 'stunnedTap' }); break; }
    if (s.tapCooldown > 0) break;
    const d = hurt(s.enemy, CONST.FAST_DAMAGE * me.power);
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

  summonStep(s, ev);
  rageStep(s, ev);
  if (alive(s.enemy)) enemyStep(s, me, ev);
  poisonStep(s, me, 'me', ev, dt);
  poisonStep(s, s.enemy, 'enemy', ev, dt);

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

- [ ] **Step 2: `test/battle.test.mjs` anpassen und erweitern**

Den Helfer `F` ersetzen (Extra-BTC statt Bonus-Parameter, damit die v2-Tests unverändert laufen):

```js
const F = (id, extra = 0) => { const f = makeFighter(RUETHER_BY_ID[id]); f.btc += extra; f.maxBtc += extra; return f; };
```

Am Ende drei Tests ergänzen:

```js
test('v3: Legendär Level 1 Christian tippt 4 Schaden, Level 20 Legendär 8', () => {
  const s = B([makeFighter(RUETHER_BY_ID.christian, { uid: 'x', rarity: 'legendaer', level: 1 })], 'ps3');
  tick(s, 16, { taps: 1 });
  assert.equal(s.enemy.btc, 256); // floor(3 × 1,6) = 4
  assert.equal(s.team[0].btc, 160);
  const t = B([makeFighter(RUETHER_BY_ID.christian, { uid: 'y', rarity: 'legendaer', level: 20 })], 'ps3');
  tick(t, 16, { taps: 1 });
  assert.equal(t.enemy.btc, 252); // floor(3 × 2,816) = 8
  assert.equal(t.team[0].maxBtc, 282);
});

test('v3: Boss Arena-Level 3 hat 390 BTC und Blu-ray 18', () => {
  const b = makeBoss(BOSSES.ps3, 3);
  assert.equal(b.btc, 390);
  assert.equal(b.fast.damage, 18);
  assert.equal(b.charged[0].damage, 37); // floor(25 × 1,5)
  assert.equal(makeBoss(BOSSES.ps3).btc, 260);
});

test('v3: Wutphase unter 50 %: Event rage, nächster schneller Angriff nach 1800 ms', () => {
  const s = B([F('christian', 500)], 'ps3');
  s.enemy.btc = 130;
  let ev = tick(s, 50);
  assert.ok(has(ev, 'rage'));
  assert.equal(s.enemy.rage, true);
  ev = run(s, 1750); // bis 1800: Warnung ab 1250, Angriff bei 1850
  assert.ok(!has(ev, 'enemyAttack'));
  ev = run(s, 50);
  assert.ok(has(ev, 'enemyAttack'));
  ev = run(s, 1800); // nächster bei 3650
  assert.equal(ev.filter(e => e.type === 'enemyAttack').length, 1);
  assert.ok(!has(tick(s, 50), 'rage')); // nur einmal
});
```

- [ ] **Step 3: `js/spawn.js` komplett ersetzen**

```js
import { CONST } from './data.js';
import { distance, randomPointInRing } from './geo.js';
import { rollRarity } from './progress.js';

function makeSpawn(r, pos, now, rng, forceRarity) {
  return {
    id: `${r.id}-${now}-${Math.floor(rng() * 1e6)}`,
    ruetherId: r.id,
    lat: pos.lat,
    lon: pos.lon,
    expires: now + CONST.SPAWN_LIFETIME,
    rarity: forceRarity || rollRarity(rng),
  };
}

// Reine Funktion. lure: Lockmodul aktiv (mehr Spawns). forceRarity: alle neuen Spawns bekommen diese Stufe (Debug).
export function updateSpawns({ spawns, player, arenas, ruethers, now, rng, lure = false, forceRarity = null }) {
  if (!player) return [];
  const list = spawns.filter(s => s.expires > now && distance(player, s) <= CONST.SPAWN_FORGET);
  const min = lure ? CONST.LURE_SPAWN_MIN : CONST.SPAWN_MIN;
  const max = lure ? CONST.LURE_SPAWN_MAX : CONST.SPAWN_MAX;
  const target = min + Math.floor(rng() * (max - min + 1));

  const anywhere = ruethers.filter(r => r.spawn === 'anywhere');
  const local = ruethers
    .filter(r => r.spawn !== 'anywhere')
    .map(r => ({ r, arena: arenas.find(a => a.id === r.spawn) }))
    .filter(x => x.arena && distance(player, x.arena) <= CONST.LOCAL_ZONE);

  const place = (r) => {
    const loc = local.find(x => x.r.id === r.id);
    const center = loc ? loc.arena : player;
    const ring = loc ? CONST.LOCAL_SPAWN_RING : CONST.SPAWN_RING;
    return makeSpawn(r, randomPointInRing(center, ring[0], ring[1], rng), now, rng, forceRarity);
  };

  for (const { r } of local) {
    if (list.some(s => s.ruetherId === r.id)) continue;
    if (list.length >= max) {
      const i = list.findIndex(s => anywhere.some(a => a.id === s.ruetherId));
      if (i >= 0) list.splice(i, 1);
    }
    list.push(place(r));
  }
  const pool = [...anywhere, ...local.map(x => x.r)];
  while (list.length < target) {
    list.push(place(pool[Math.floor(rng() * pool.length)]));
  }
  return list;
}
```

- [ ] **Step 4: `test/spawn.test.mjs` erweitern** (bestehende Tests bleiben; im Test „bestehende Spawns werden nicht verdoppelt" und im SPAWN_MAX-Regressionstest statt `CONST.SPAWN_MAX` weiter die Zahl 4 erwarten, das stimmt ohne Lockmodul):

```js
test('v3: jeder Spawn hat eine Seltenheit, forceRarity erzwingt sie, Lockmodul erhöht die Zielzahl', () => {
  const a = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0) });
  assert.ok(a.every(s => s.rarity === 'normal'));
  const b = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0), forceRarity: 'legendaer' });
  assert.ok(b.every(s => s.rarity === 'legendaer'));
  const c = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0.99, 0.5), lure: true });
  assert.equal(c.length, CONST.LURE_SPAWN_MAX);
});
```

- [ ] **Step 5: `node --test test/*.test.mjs` → alle grün** (progress 8, battle 18, catch 7, spawn 10)

---

### Task 4: Kampf-Bildschirm v3 — Agent B

**Files:** Modify `js/battle-ui.js`, `css/battle.css`. Nur diese beiden. DOM steht in `index.html` (`#screen-battle` hat neu: `.stage .bg`, `.stage .combo`, `.fighter.me .frame > img.sprite + .shine`, `.intro` mit `.intro-arena .intro-level .intro-me .intro-vs .intro-boss .intro-me-name .intro-boss-name .countdown`, Overlay mit `.confetti .sats-gain .arena-note`).

**Vertrag:**
```js
createBattleScreen({ el, onEnd }) -> { start({ team, enemy, rng, arena, arenaLevel, reward, masteredAfter }), stop() }
// team[i] hat zusätzlich uid, rarity, level, power; enemy hat arenaLevel, rage.
// arena = { id, name, ... }; reward = Sats bei Sieg; masteredAfter = true, wenn dieser Sieg die Arena meistert.
// onEnd({ won, retry }) wie v2.
```

**Neu gegenüber v2 (alles Pflicht):**
1. **VS-Intro** (Spec §3): `.intro` 2,6 s einblenden: Arena-Name + „Arena Lv. n" (bei gemeistert „Arena Lv. 5 👑"), Boss-Sprite rutscht von rechts, erster Rüther von links, „VS" platzt (scale 3 → 1 mit Überschwingen), Namen darunter, dann Countdown „3", „2", „1", „Kampf!" (je 500 ms, jede Zahl `pop`). Erst danach Schleife starten (Timer bleibt bis dahin auf 90). Aufgeben funktioniert auch während des Intros. Bei „Nochmal" wieder mit Intro.
2. **Arena-Hintergrund:** `stage.dataset.arena = arena.id`; `.stage .bg` liegt unter dem Sprite (`z-index` unter `.enemy-sprite`, `pointer-events: none`) und zeigt per CSS: `pcsale` dunkelblau mit Scanlines (`repeating-linear-gradient`) und einem hellen Streifen, der alle 4 s von oben nach unten läuft; `huettenberg` zwei Ebenen regnender ₿ (`::before`/`::after` mit `content` aus wiederholten „₿ " und `animation` nach unten, unterschiedliche Geschwindigkeit) plus orangem Schein unten; `worringen` fallende grüne Hex-Zeichen („0 1 a f 3 c …", monospace) auf fast schwarz.
3. **Wutphase:** Event `rage`: `.stage` bekommt Klasse `rage` (roter pulsierender Innenschatten, bleibt bis Kampfende), Boss-Sprite `rage-shake` 1 s, großes „WUT!" (rot, fliegt rein und zittert), Boss-Name bekommt „🔥 " davor; Flash-Farbe der Warnungen bleibt.
4. **Combo:** Treffer (`fast`) mit < 800 ms Abstand erhöhen den Zähler; `.combo` zeigt „×n" ab n ≥ 2, wächst pro Treffer kurz (`bump`), ab ×10 Klasse `hot` (gold, Funken ✨ steigen auf). Nach 1 s ohne Treffer ausblenden und zurücksetzen.
5. **Treffer-Feedback:** Boss-Sprite `hit` (weißer Blitz 120 ms, `filter: brightness(3)`) bei jedem Treffer zusätzlich zum `shake`; Schadenszahlen ≥ 25 bekommen Klasse `big`; Beben bei Boss-Treffern auf den Spieler nach Schaden: `quake-s` (< 15), `quake-m` (< 30), `quake-l` (sonst), bei Lade-Attacken mindestens `quake-m`.
6. **Seltenheits-Glanz:** `.fighter.me .frame` bekommt Klasse `r-<rarity>` (Rahmenfarbe aus `--r-<rarity>` in `style.css`), bei episch/legendaer läuft über `.shine` ein diagonaler Glanzstreifen (`animation: shine 2.4s infinite`). Bei Wechsel aktualisieren. Name zeigt „Lv. n".
7. **Sieg-Overlay:** zusätzlich `.confetti` mit 30 Partikeln (div, zufällige Farbe aus den vier Seltenheitsfarben, zufällige x-Position und Verzögerung, fallen 2 s mit Drehung), `.sats-gain` zählt von 0 auf `reward` hoch (1 s, `requestAnimationFrame`, Format `+1.234 💰`), `.arena-note` = `masteredAfter ? 'Arena gemeistert! 👑' : 'Arena Lv. ' + (arenaLevel + 1) + ' freigeschaltet'`. Bei Niederlage beides versteckt/leer.
8. Alles aus v2 bleibt (Animationen, Overlay-Logik, Aufgeben, Catch-up-Schleife mit `MAX_CATCHUP = 1500`).

**Prüfen (Agent B):** `node --check`; Selektoren gegen `index.html`; Browser-Test wie in v2 (Server im Hintergrund, `?debug=1`, „Alle Rüthers fangen", Beamen, Arena, Kämpfen): Intro sichtbar, Countdown, Hintergrund je Arena, Tippen, Combo-Anzeige, Spezial, Wut (Boss unter 50 % bringen, z.B. mit „Boss fast tot" aus und viel Tippen oder per Harness), Sieg-Overlay mit Konfetti und Zähler. Konsole ohne Fehler. Server stoppen.

---

### Task 5: Fang-Bildschirm v3 — Agent C

**Files:** Modify `js/catch.js`, `css/catch.css`. Nur diese beiden. DOM neu in `#screen-catch`: `.rarity-badge`, `.target .aura`, `.reward.hidden`, `button.supercoin.hidden`.

**Vertrag:**
```js
import { catchChanceV3 } from './progress.js';
createCatchScreen({ el, onDone, onCancel, onCaught, onSuperCoinUsed }) -> { start(spawn, def, { rng = Math.random, rarity = 'normal', superCoins = 0 }) }
// onSuperCoinUsed() -> verbleibende Anzahl (wird beim Treffer mit aktiver Super-Münze aufgerufen, auch wenn der Rüther ausbricht)
// onCaught({ spawn, usedSuperCoin }) -> { sats, newDex }   (synchron im Moment „Gefangen!")
// onDone({ spawn, caught }) genau einmal; onCancel() beim ✕ (nur in idle)
```

**Neu gegenüber v2 (alles Pflicht):**
1. `.target` bekommt Klasse `r-<rarity>`; `.aura` ist ein weicher farbiger Kreis hinter dem Sprite (`radial-gradient` in `--r-<rarity>`), pulsiert ab Selten, bei Normal unsichtbar. `.rarity-badge` zeigt den Seltenheitsnamen in der Farbe oben in der Bühne (Legendär mit ✨).
2. **Super-Münze:** Button `.supercoin` nur sichtbar, wenn `superCoins > 0`, Text „🪙 Super-Münze (n)"; Antippen schaltet `active` (Button leuchtet, Münze bekommt Klasse `super` mit goldenem Glanz). Chance pro Treffer = `catchChanceV3(def.catchChance, rarity, ringScale, superActive)`. Trifft die Münze mit aktiver Super-Münze: `onSuperCoinUsed()` aufrufen, Zähler aktualisieren, Schalter deaktivieren (bei 0 Button verstecken). Fehlwürfe verbrauchen nichts.
3. **Burst in Seltenheitsfarbe** (Sterne und Münz-Glow). Legendär zusätzlich: 40 goldene Konfetti-Partikel fallen 2 s und großer Text „LEGENDÄR!" (gold, `pop`).
4. **Belohnung:** im Moment „Gefangen!" `onCaught` aufrufen, `.reward` zeigen: „+130 💰" (groß, springt rein) und darunter „Neu im Rütherdex!" wenn `newDex`. `onDone` nach 1,8 s statt 1 s.
5. Alles aus v2 bleibt (Schnippen, Ring, Wackeln, Ausbruch, Flucht, Nachricht beim Abwurf löschen).

**Prüfen (Agent C):** `node --check`; Selektoren; Browser-Test mit synthetischen PointerEvents (wie in v2 beschrieben, 2 px/ms) bis „Gefangen!" inkl. Belohnungs-Popup; „Nächster Spawn legendär" im Debug-Panel für den Legendär-Burst. Konsole ohne Fehler.

---

### Task 6: Speicher, Karte, Screens, Verdrahtung — Agent D

**Files:** Modify `js/storage.js`, `js/map.js`, `js/screens.js`, `js/app.js`, `style.css`, `README.md`; Create `css/screens.css`.

- [ ] **Step 1: `js/storage.js`**

```js
import { migrate, emptySaveV2 } from './progress.js';
const KEY = 'ruether-go';

export const emptySave = emptySaveV2;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySaveV2();
    return migrate(JSON.parse(raw));
  } catch {
    return emptySaveV2();
  }
}

// true = gespeichert, false = localStorage gesperrt/voll
export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
```

- [ ] **Step 2: `js/map.js`**

```js
/* global L */
// Leaflet-Adapter mit Folgen-Modus, Seltenheits-Markern und Arena-Leveln.

const HAGEN = [51.36, 7.47];

function spriteIcon(id, rarity = 'normal') {
  const star = rarity === 'legendaer' ? '<span class="star">✨</span>' : '';
  return L.divIcon({ className: `spawn-icon r-${rarity}`, html: `<span class="aura"></span><img src="sprites/${id}.png" alt="">${star}`, iconSize: [48, 48], iconAnchor: [24, 24] });
}
function arenaIcon({ level = 1, mastered = false, ownerId = null } = {}) {
  const badge = `<span class="lvl">${mastered ? '👑' : 'Lv.' + level}</span>`;
  const cls = mastered ? ' mastered' : '';
  if (ownerId) {
    return L.divIcon({ className: 'arena-icon owned' + cls, html: `<img src="sprites/${ownerId}.png" alt=""><span class="trophy">🏆</span>${badge}`, iconSize: [48, 48], iconAnchor: [24, 24] });
  }
  return L.divIcon({ className: 'arena-icon' + cls, html: `⚔${badge}`, iconSize: [40, 40], iconAnchor: [20, 20] });
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
        L.marker([s.lat, s.lon], { icon: spriteIcon(s.ruetherId, s.rarity), zIndexOffset: 1000 }).addTo(spawnLayer).on('click', () => onSpawnTap(s));
      }
    },
    setArena(id, info) { arenaMarkers[id].setIcon(arenaIcon(info)); },
    invalidate() { map.invalidateSize(); },
  };
}
```

- [ ] **Step 3: `js/screens.js`** komplett ersetzen

```js
import { CONST, RUETHERS, RUETHER_BY_ID, RARITIES, RARITY_BY_ID, SHOP } from './data.js';
import { fighterStats, levelCost, DEX_TOTAL, dexCount, arenaReward } from './progress.js';

const fmt = n => n.toLocaleString('de-DE');
const rarityRank = id => RARITIES.findIndex(r => r.id === id);

// ---------- Sammlung ----------
// onTeamChange(teamUids); onPowerUp(uid) -> { ok, reason, level }; onDex(); onBack()
export function createCollectionScreen({ el, onTeamChange, onPowerUp, onDex, onBack }) {
  const box = el.querySelector('.box');
  el.querySelector('.back').addEventListener('click', onBack);
  el.querySelector('.dex-btn').addEventListener('click', onDex);
  let save = null;

  function card(inst) {
    const def = RUETHER_BY_ID[inst.id], r = RARITY_BY_ID[inst.rarity], st = fighterStats(def, inst);
    const idx = save.team.indexOf(inst.uid), cost = levelCost(inst.level);
    const div = document.createElement('div');
    div.className = `card r-${inst.rarity}` + (idx >= 0 ? ' in-team' : '');
    div.dataset.uid = inst.uid;
    div.innerHTML = `
      ${idx >= 0 ? `<div class="order">${idx + 1}</div>` : ''}
      <div class="frame r-${inst.rarity}"><img src="sprites/${inst.id}.png" alt=""><span class="shine"></span></div>
      <div class="meta">
        <div class="cname">${def.name} <span class="rar">${r.name}</span></div>
        <div class="sub">Lv. ${inst.level} · ${st.btc} BTC · Power ×${st.power.toFixed(2)}</div>
        <div class="actions">
          <button class="team-btn">${idx >= 0 ? 'Aus dem Team' : 'Ins Team'}</button>
          <button class="power-btn" ${cost == null || save.sats < cost ? 'disabled' : ''}>${cost == null ? 'Max. Level' : `Power-Up (${fmt(cost)} 💰)`}</button>
        </div>
      </div>`;
    div.querySelector('.team-btn').addEventListener('click', () => toggleTeam(inst.uid));
    div.querySelector('.power-btn').addEventListener('click', () => {
      const res = onPowerUp(inst.uid);
      if (!res.ok) return;
      render();
      const c = box.querySelector(`[data-uid="${inst.uid}"]`);
      if (c) {
        c.classList.add('level-up');
        c.querySelector('.cname').insertAdjacentHTML('beforeend', `<span class="lvl-pop">Lv. ${res.level}!</span>`);
        setTimeout(() => c.classList.remove('level-up'), 1200);
      }
    });
    return div;
  }
  function render() {
    box.innerHTML = '';
    if (!save.box.length) { box.innerHTML = '<p class="empty">Noch keine Rüthers gefangen. Raus auf die Karte!</p>'; return; }
    for (const def of RUETHERS) {
      const mine = save.box.filter(i => i.id === def.id)
        .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level);
      if (!mine.length) continue;
      const h = document.createElement('h3');
      h.textContent = `${def.name} (${mine.length})`;
      box.appendChild(h);
      for (const inst of mine) box.appendChild(card(inst));
    }
  }
  function toggleTeam(uid) {
    const i = save.team.indexOf(uid);
    if (i >= 0) save.team.splice(i, 1);
    else if (save.team.length < CONST.TEAM_SIZE) save.team.push(uid);
    else return;
    onTeamChange(save.team);
    render();
  }
  return { show(s) { save = s; render(); } };
}

// ---------- Rütherdex ----------
export function createDexScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const grid = el.querySelector('.dex-grid');
  return {
    show(save) {
      el.querySelector('.dex-count').textContent = `${dexCount(save)}/${DEX_TOTAL}`;
      grid.innerHTML = '<div class="dex-head"></div>' + RARITIES.map(r => `<div class="dex-head r-${r.id}">${r.name}</div>`).join('');
      for (const def of RUETHERS) {
        grid.insertAdjacentHTML('beforeend', `<div class="dex-name">${def.name}</div>`);
        for (const r of RARITIES) {
          const has = !!save.dex[`${def.id}:${r.id}`];
          grid.insertAdjacentHTML('beforeend', `<div class="dex-cell r-${r.id} ${has ? 'has' : 'missing'}"><img src="sprites/${has ? def.id : 'unknown'}.png" alt=""></div>`);
        }
      }
    },
  };
}

// ---------- Shop ----------
// onBuy(itemId) -> { ok, reason }
export function createShopScreen({ el, onBuy, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const list = el.querySelector('.shop-items');
  let save = null;
  function render() {
    el.querySelector('.shop-sats').textContent = `💰 ${fmt(save.sats)}`;
    list.innerHTML = '';
    for (const item of SHOP) {
      const owned = item.id === 'supercoin'
        ? `Im Besitz: ${save.items.supercoin || 0}`
        : (save.lureUntil > Date.now() ? '🧲 Gerade aktiv (Kauf verlängert)' : '');
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="icon">${item.icon}</div>
        <div class="meta"><div class="iname">${item.name}</div><div class="sub">${item.desc}</div><div class="sub owned">${owned}</div></div>
        <button class="buy primary" ${save.sats < item.cost ? 'disabled' : ''}>${fmt(item.cost)} 💰</button>`;
      div.querySelector('.buy').addEventListener('click', () => {
        const res = onBuy(item.id);
        render();
        if (res.ok) { const d = list.querySelector(`.shop-item:nth-child(${SHOP.indexOf(item) + 1})`); d?.classList.add('bought'); setTimeout(() => d?.classList.remove('bought'), 600); }
      });
      list.appendChild(div);
    }
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
    show(a, { distanceM, teamSize, level, mastered, ownerName, bossBtc }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.sprite').src = `sprites/${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} (${bossBtc} BTC)`;
      el.querySelector('.level').textContent = mastered ? '👑 Arena gemeistert (Lv. 5)' : `Arena Lv. ${level} von ${CONST.ARENA_LEVELS}`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${Math.round(distanceM)} m`;
      el.querySelector('.owner').textContent = ownerName ? `🏆 Besitzer: ${ownerName}` : 'Noch niemand hat diese Arena erobert.';
      el.querySelector('.reward').textContent = `Belohnung: ${fmt(arenaReward(level))} 💰`;
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (!inRange) status = `Du musst näher als ${CONST.ARENA_RANGE} m ran.`;
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

- [ ] **Step 4: `js/app.js`** komplett ersetzen

```js
import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID, RARITY_BY_ID } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import { createCollectionScreen, createDexScreen, createShopScreen, createArenaScreen, createVictoryScreen } from './screens.js';
import { createBattleScreen } from './battle-ui.js';
import { makeFighter, makeBoss } from './battle.js';
import { catchReward, arenaWin, arenaReward, arenaScale, powerUp, buyItem, lureActive, dexCount, DEX_TOTAL } from './progress.js';

const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString('de-DE');
let save = storage.load();
let spawns = [];
let pos = null;
let lastSpawnPos = null;
let debugWeakBoss = false;
let debugLegendary = false;

// ---------- Screens ----------
const screens = [...document.querySelectorAll('section.screen')];
function show(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-map') map.invalidate();
}

// ---------- Banner / Toast / HUD ----------
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
const instById = uid => save.box.find(i => i.uid === uid);
function teamInstances() {
  save.team = save.team.filter(uid => instById(uid));
  return save.team.map(instById);
}
function updateHud() {
  $('#hud-dex').textContent = `Dex ${dexCount(save)}/${DEX_TOTAL}`;
  $('#hud-sats').textContent = `💰 ${fmt(save.sats)}`;
  const mastered = ARENAS.filter(a => save.arenaMastered[a.id]).length;
  $('#badge').classList.toggle('hidden', mastered < ARENAS.length);
  for (const a of ARENAS) {
    const owner = instById(save.arenaOwners[a.id]);
    map.setArena(a.id, { level: save.arenaLevels[a.id] || 1, mastered: !!save.arenaMastered[a.id], ownerId: owner ? owner.id : null });
  }
  updateLure();
}
function updateLure() {
  const b = $('#lure-banner');
  const left = (save.lureUntil || 0) - Date.now();
  b.classList.toggle('hidden', left <= 0);
  if (left > 0) {
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    b.textContent = `🧲 Lockmodul: ${m}:${String(s).padStart(2, '0')}`;
  }
}
setInterval(updateLure, 1000);

// ---------- Karte ----------
const map = createMap({
  el: $('#map'),
  arenas: ARENAS,
  onSpawnTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.CATCH_RANGE) return toast(`Zu weit weg: ${Math.round(d)} m`);
    catchScreen.start(s, RUETHER_BY_ID[s.ruetherId], { rng: Math.random, rarity: s.rarity, superCoins: save.items.supercoin || 0 });
    show('screen-catch');
  },
  onArenaTap(a) {
    const level = save.arenaLevels[a.id] || 1;
    const owner = instById(save.arenaOwners[a.id]);
    arenaScreen.show(a, {
      distanceM: pos ? distance(pos, a) : null,
      teamSize: teamInstances().length,
      level,
      mastered: !!save.arenaMastered[a.id],
      ownerName: owner ? `${RUETHER_BY_ID[owner.id].name} (${RARITY_BY_ID[owner.rarity].name}, Lv. ${owner.level})` : null,
      bossBtc: Math.floor(BOSSES[a.boss].btc * arenaScale(level)),
    });
    show('screen-arena');
  },
  onFollowChange(following) { $('#btn-locate').classList.toggle('following', following); },
});
$('#btn-locate').addEventListener('click', () => map.follow(pos));

// ---------- Spawns ----------
let spawnTimer = null;
function refreshSpawns() {
  const lure = lureActive(save, Date.now());
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random, lure, forceRarity: debugLegendary ? 'legendaer' : null });
  if (debugLegendary) { debugLegendary = false; $('#dbg-legendary').textContent = 'Nächster Spawn legendär: aus'; }
  map.setSpawns(spawns);
  lastSpawnPos = pos;
  scheduleSpawns();
}
function scheduleSpawns() {
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(refreshSpawns, lureActive(save, Date.now()) ? CONST.LURE_INTERVAL : CONST.SPAWN_INTERVAL);
}
scheduleSpawns();

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
  onSuperCoinUsed() {
    save.items.supercoin = Math.max(0, (save.items.supercoin || 0) - 1);
    persist();
    return save.items.supercoin;
  },
  onCaught({ spawn }) {
    const r = catchReward(save, spawn.ruetherId, spawn.rarity, Date.now());
    persist();
    return r;
  },
  onDone({ spawn }) {
    spawns = spawns.filter(s => s.id !== spawn.id);
    map.setSpawns(spawns);
    show('screen-map');
  },
  onCancel() { show('screen-map'); },
});

// ---------- Sammlung / Dex / Shop ----------
const collection = createCollectionScreen({
  el: $('#screen-collection'),
  onTeamChange(team) { save.team = team; persist(); },
  onPowerUp(uid) {
    const res = powerUp(save, uid);
    if (res.ok) { persist(); toast(`Level ${res.level}! −${fmt(res.cost)} 💰`); }
    else if (res.reason === 'sats') toast('Nicht genug Sats.');
    return res;
  },
  onDex() { dex.show(save); show('screen-dex'); },
  onBack() { show('screen-map'); },
});
const dex = createDexScreen({ el: $('#screen-dex'), onBack() { collection.show(save); show('screen-collection'); } });
const shop = createShopScreen({
  el: $('#screen-shop'),
  onBuy(id) {
    const res = buyItem(save, id, Date.now());
    if (res.ok) {
      persist();
      toast(id === 'lockmodul' ? '🧲 Lockmodul aktiv!' : '🪙 Super-Münze gekauft');
      if (id === 'lockmodul') refreshSpawns();
    } else toast('Nicht genug Sats.');
    return res;
  },
  onBack() { show('screen-map'); },
});
$('#btn-collection').addEventListener('click', () => { teamInstances(); collection.show(save); show('screen-collection'); });
$('#btn-shop').addEventListener('click', () => { shop.show(save); show('screen-shop'); });

// ---------- Arena + Kampf ----------
let currentArena = null;
function startBattle(a) {
  currentArena = a;
  const team = teamInstances().map(inst => makeFighter(RUETHER_BY_ID[inst.id], inst));
  const level = save.arenaLevels[a.id] || 1;
  const enemy = makeBoss(BOSSES[a.boss], level);
  if (debugWeakBoss) enemy.btc = 20;
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random, arena: a, arenaLevel: level, reward: arenaReward(level), masteredAfter: level >= CONST.ARENA_LEVELS });
}
const arenaScreen = createArenaScreen({ el: $('#screen-arena'), bosses: BOSSES, onBack() { show('screen-map'); }, onFight: startBattle });
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEnd({ won, retry }) {
    if (retry) return startBattle(currentArena);
    if (won) {
      arenaWin(save, currentArena.id, save.team[0]);
      persist();
      if (ARENAS.every(a => save.arenaMastered[a.id]) && !save.victoryShown) {
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
  for (const r of RUETHERS) if (!save.box.some(i => i.id === r.id)) catchReward(save, r.id, 'normal', Date.now());
  persist(); toast('Alle gefangen');
});
$('#dbg-sats').addEventListener('click', () => { save.sats += 1000; persist(); toast('+1000 💰'); });
$('#dbg-legendary').addEventListener('click', e => {
  debugLegendary = !debugLegendary;
  e.target.textContent = `Nächster Spawn legendär: ${debugLegendary ? 'an' : 'aus'}`;
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

- [ ] **Step 5: `style.css`** – Ergänzungen (bestehende Regeln bleiben):

In `:root` ergänzen:
```css
  --r-normal: #9aa0a6;
  --r-selten: #2a7fff;
  --r-episch: #b36bff;
  --r-legendaer: #f7c948;
```
Anhängen:
```css
/* Seltenheit, Rahmen, Glanz (geteilt von Karte, Sammlung, Kampf, Fangen) */
.frame { position: relative; display: inline-block; border: 3px solid var(--r-normal); border-radius: 12px; overflow: hidden; background: #111; }
.frame.r-selten { border-color: var(--r-selten); }
.frame.r-episch { border-color: var(--r-episch); box-shadow: 0 0 10px var(--r-episch); }
.frame.r-legendaer { border-color: var(--r-legendaer); box-shadow: 0 0 14px var(--r-legendaer); }
.frame img { display: block; image-rendering: pixelated; }
.frame .shine { display: none; position: absolute; inset: -40% -60%; background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.45) 50%, transparent 60%); pointer-events: none; }
.frame.r-episch .shine, .frame.r-legendaer .shine { display: block; animation: shine 2.4s linear infinite; }
@keyframes shine { from { transform: translateX(-60%); } to { transform: translateX(60%); } }
.pill { background: rgba(255,255,255,.12); border-radius: 999px; padding: 3px 10px; font-size: 13px; }
.sats { font-weight: 700; color: var(--orange); }
.bottombar button { padding: 10px 16px; }
.banner.lure { background: #7a4a00; color: #ffd27a; }

.spawn-icon { position: relative; }
.spawn-icon .aura { position: absolute; inset: -8px; border-radius: 50%; opacity: 0; pointer-events: none; }
.spawn-icon img { position: relative; }
.spawn-icon.r-selten img { border-color: var(--r-selten); }
.spawn-icon.r-episch img { border-color: var(--r-episch); }
.spawn-icon.r-legendaer img { border-color: var(--r-legendaer); }
.spawn-icon.r-selten .aura { background: radial-gradient(circle, var(--r-selten) 0%, transparent 70%); opacity: .6; animation: aura-pulse 1.8s ease-in-out infinite; }
.spawn-icon.r-episch .aura { background: radial-gradient(circle, var(--r-episch) 0%, transparent 70%); opacity: .7; animation: aura-pulse 1.4s ease-in-out infinite; }
.spawn-icon.r-legendaer .aura { background: radial-gradient(circle, var(--r-legendaer) 0%, transparent 70%); opacity: .85; animation: aura-pulse 1s ease-in-out infinite; }
.spawn-icon .star { position: absolute; top: -12px; right: -10px; font-size: 16px; animation: aura-pulse 1s ease-in-out infinite; }
@keyframes aura-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.25); } }

.arena-icon { position: relative; overflow: visible; }
.arena-icon .lvl { position: absolute; left: -8px; bottom: -8px; background: #111; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 6px; border: 1px solid #fff; }
.arena-icon.mastered { box-shadow: 0 0 0 3px var(--r-legendaer), 0 0 16px var(--r-legendaer); }
```

- [ ] **Step 6: `css/screens.css`** (neu)

```css
/* Sammlung */
#screen-collection .hint, #screen-shop .hint { padding: 0 14px; }
#screen-collection .topbar .dex-btn { padding: 6px 10px; background: var(--orange); color: #111; font-weight: 700; }
.box { flex: 1; overflow: auto; padding: 0 14px calc(14px + env(safe-area-inset-bottom)); }
.box h3 { margin: 14px 0 6px; font-size: 15px; color: var(--muted); }
.box .empty { color: var(--muted); text-align: center; margin-top: 40px; }
.card { display: flex; gap: 12px; align-items: center; background: var(--panel); border-radius: 12px; padding: 10px; margin-bottom: 10px; position: relative; border: 2px solid transparent; }
.card.in-team { border-color: var(--orange); }
.card .frame img { width: 72px; height: 72px; }
.card .order { position: absolute; top: -8px; left: -8px; background: var(--orange); color: #111; font-weight: 700; border-radius: 50%; width: 24px; height: 24px; line-height: 24px; text-align: center; }
.card .meta { flex: 1; min-width: 0; }
.card .cname { font-weight: 700; }
.card .rar { font-size: 12px; padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,.1); margin-left: 4px; }
.card.r-selten .rar { color: var(--r-selten); }
.card.r-episch .rar { color: var(--r-episch); }
.card.r-legendaer .rar { color: var(--r-legendaer); }
.card .sub { font-size: 12px; color: var(--muted); margin: 2px 0 6px; }
.card .actions { display: flex; gap: 6px; }
.card .actions button { padding: 8px 10px; font-size: 13px; flex: 1; }
.card .power-btn:not(:disabled) { background: var(--orange); color: #111; font-weight: 700; }
.card.level-up .frame { animation: level-glow 1.2s ease-out; }
.card .lvl-pop { display: inline-block; margin-left: 6px; color: var(--r-legendaer); font-weight: 800; animation: lvl-pop 1.2s ease-out forwards; }
@keyframes level-glow { 0% { box-shadow: 0 0 0 0 var(--orange); } 50% { box-shadow: 0 0 24px 6px var(--orange); } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes lvl-pop { 0% { transform: scale(.4); opacity: 0; } 30% { transform: scale(1.3); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }

/* Rütherdex */
.dex-grid { display: grid; grid-template-columns: 1.3fr repeat(4, 1fr); gap: 6px; padding: 10px; overflow: auto; align-content: start; }
.dex-head { font-size: 11px; text-align: center; color: var(--muted); }
.dex-head.r-selten { color: var(--r-selten); } .dex-head.r-episch { color: var(--r-episch); } .dex-head.r-legendaer { color: var(--r-legendaer); }
.dex-name { font-size: 13px; font-weight: 700; align-self: center; }
.dex-cell { aspect-ratio: 1; border-radius: 10px; border: 3px solid var(--r-normal); background: #111; overflow: hidden; }
.dex-cell.r-selten { border-color: var(--r-selten); } .dex-cell.r-episch { border-color: var(--r-episch); } .dex-cell.r-legendaer { border-color: var(--r-legendaer); }
.dex-cell img { width: 100%; height: 100%; image-rendering: pixelated; }
.dex-cell.missing { opacity: .35; border-style: dashed; }

/* Shop */
.shop-items { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.shop-item { display: flex; gap: 12px; align-items: center; background: var(--panel); border-radius: 12px; padding: 12px; }
.shop-item .icon { font-size: 36px; }
.shop-item .meta { flex: 1; }
.shop-item .iname { font-weight: 700; }
.shop-item .sub { font-size: 12px; color: var(--muted); }
.shop-item .owned { color: var(--orange); }
.shop-item .buy { white-space: nowrap; }
.shop-item.bought { animation: bought .6s ease-out; }
@keyframes bought { 0% { background: var(--orange); } 100% { background: var(--panel); } }

/* Arena-Info */
.arena-body .level { color: var(--orange); font-weight: 700; }
.arena-body .reward { color: var(--r-legendaer); }
```

- [ ] **Step 7: `README.md`** – Abschnitt „Steuerung" ersetzen:

```markdown
## Steuerung

- Karte folgt dir. Karte verschoben? 📍 unten rechts tippen.
- Rüthers gibt es in vier Seltenheiten (Normal, Selten, Episch, Legendär), erkennbar an Rand und Aura auf der Karte. Seltenere sind stärker und schwerer zu fangen.
- Fangen: Münze nach oben schnippen, kleiner Ring = bessere Chance. Super-Münze (Shop) gibt +20 %. Drei Ausbrüche, dann ist der Rüther weg.
- Sammlung: bis zu drei ins Team, Power-Up hebt das Level (kostet Sats). Rütherdex zeigt alle 20 Kombinationen.
- Shop: Lockmodul (5 Minuten doppelte Spawns), Super-Münzen. Sats gibt es für Fänge, neue Dex-Einträge und Arenasiege.
- Kampf: VS-Intro, dann auf den Boss tippen. Spezial-Buttons unten, wenn die Energie reicht. Blinkt es, wischen = ausweichen. Unter 50 % wird der Boss wütend und schneller. 90 Sekunden Zeit, ✕ oben links = aufgeben.
- Arenen haben fünf Level, der Boss wird pro Level stärker und die Belohnung größer. Level 5 besiegt = gemeistert (👑). Alle drei gemeistert = Krone.
```

- [ ] **Step 8:** `node --check js/*.js`, `node --test test/*.test.mjs` (spawn/catch/progress grün; battle gehört A).

---

### Task 7: Browser-Check (Orchestrator)

`?debug=1`, 375×812: Migration (alter Spielstand bleibt als Normal-Exemplare, Sats vorhanden), HUD Dex/Sats, „+1000 Sats", Shop kaufen (Lockmodul-Banner, Super-Münze im Fang-Screen), „Nächster Spawn legendär" → goldene Aura auf der Karte, Fang mit Badge/Aura/Legendär-Burst/Belohnung, Sammlung mit Rahmen und Power-Up-Animation, Dex-Raster, Arena-Info mit Level und Belohnung, Kampf: Intro + Countdown, Hintergrund, Combo, Wut, Sieg-Overlay mit Konfetti und Sats-Zähler, Marker mit Level-Badge, Level steigt, gemeistert bei Lv. 5.

---

## Self-Review

**Spec-Abdeckung:** §1 Seltenheit → Tasks 2 (rollRarity, Stats, Chance), 3 (Spawn, Engine), 5 (Fang-UI), 6 (Marker, Sammlung). §2 Sats/Power-Ups/Shop → Tasks 2, 6. §3 Arenen → Tasks 2 (arenaWin/scale), 3 (Boss-Skalierung, Wut), 4 (Intro, Hintergründe, Combo, Konfetti), 6 (Marker, Arena-Info). §4 Fangen → Task 5. §5 Karte → Task 6. §6 Spielstand → Tasks 2, 6. §9 Debug → Task 6. §10 Tests → Tasks 2, 3.

**Verträge:** `battleScreen.start({team, enemy, rng, arena, arenaLevel, reward, masteredAfter})` in Task 4 und app.js identisch. `catchScreen.start(spawn, def, {rng, rarity, superCoins})`, `onCaught/onSuperCoinUsed/onDone/onCancel` in Task 5 und app.js identisch. `createMap.setArena(id, {level, mastered, ownerId})`, `createArenaScreen.show(a, {distanceM, teamSize, level, mastered, ownerName, bossBtc})`, `createCollectionScreen({onTeamChange,onPowerUp,onDex,onBack}).show(save)`, `createShopScreen({onBuy,onBack}).show(save)`, `createDexScreen({onBack}).show(save)` in screens.js und app.js identisch. Engine-Events: v2 plus `rage`.
