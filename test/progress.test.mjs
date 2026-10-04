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
