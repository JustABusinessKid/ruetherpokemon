import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rollRarity, instanceMult, fighterStats, levelCost, powerUp, catchChanceV3, catchReward,
  arenaScale, arenaReward, arenaWin, buyItem, migrate, emptySaveV2, dexCount, DEX_TOTAL, lureActive,
} from '../js/progress.js';
import { xpForLevel, addXp, levelProgress, canFuse, fuse, nextRarity, emptySaveV3 } from '../js/progress.js';
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

test('migrate: v1 → v3', () => {
  const v1 = { version: 1, caught: { christian: { count: 3, bonusBtc: 20 }, viktor: { count: 1, bonusBtc: 0 } }, team: ['viktor', 'christian'], arenasBeaten: ['pcsale'], arenaOwners: { pcsale: 'christian' }, victoryShown: false };
  const s = migrate(v1);
  assert.equal(s.version, 3);
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
  assert.equal(migrate(null).version, 3);
  assert.equal(migrate({ version: 7 }).box.length, 0);
  const v2 = migrate({ version: 2, box: [], team: [], sats: 5 });
  assert.equal(v2.version, 3);
  assert.equal(v2.sats, 5);
  assert.deepEqual(v2.items, { lockmodul: 0, supercoin: 0 });
  assert.equal(v2.profile, null);
  assert.equal(v2.settings.sound, true);
});

test('v4: XP und Trainer-Level', () => {
  assert.equal(xpForLevel(1), 150);
  assert.equal(xpForLevel(4), 600);
  const s = emptySaveV3();
  assert.deepEqual(addXp(s, 100), { levelUps: [], sats: 0 });
  assert.deepEqual(levelProgress(s), { level: 1, xp: 100, need: 150 });
  const r = addXp(s, 400); // 500 gesamt: Lv1→2 (150), Lv2→3 (300), Rest 50
  assert.deepEqual(r, { levelUps: [2, 3], sats: 500 });
  assert.equal(s.trainerLevel, 3);
  assert.equal(s.xp, 50);
  assert.equal(s.sats, 500);
});

test('v4: Fusion verbraucht die drei niedrigsten, Ergebnis nächste Seltenheit mit max Level', () => {
  const s = emptySaveV3();
  s.box.push(
    { uid: 'a', id: 'christian', rarity: 'selten', level: 2, caughtAt: 0 },
    { uid: 'b', id: 'christian', rarity: 'selten', level: 5, caughtAt: 0 },
    { uid: 'c', id: 'christian', rarity: 'selten', level: 1, caughtAt: 0 },
    { uid: 'd', id: 'christian', rarity: 'selten', level: 9, caughtAt: 0 },
    { uid: 'e', id: 'viktor', rarity: 'selten', level: 1, caughtAt: 0 },
  );
  s.team = ['a', 'd', 'e'];
  assert.equal(nextRarity('selten'), 'episch');
  assert.equal(nextRarity('legendaer'), null);
  assert.equal(canFuse(s, 'christian', 'selten'), true);
  assert.equal(canFuse(s, 'viktor', 'selten'), false);
  const r = fuse(s, 'christian', 'selten', 7);
  assert.equal(r.ok, true);
  assert.deepEqual(r.used.map(i => i.uid), ['c', 'a', 'b']);
  assert.equal(r.inst.rarity, 'episch');
  assert.equal(r.inst.level, 5);
  assert.equal(r.newDex, true);
  assert.equal(s.sats, 100);
  assert.deepEqual(s.box.map(i => i.uid).sort(), ['d', 'e', r.inst.uid].sort());
  assert.deepEqual(s.team, ['d', 'e', r.inst.uid]);
  assert.equal(s.stats.fusions, 1);
  assert.equal(fuse(s, 'christian', 'selten').ok, false);
  s.box.push({ uid: 'x', id: 'micha', rarity: 'legendaer', level: 1 }, { uid: 'y', id: 'micha', rarity: 'legendaer', level: 1 }, { uid: 'z', id: 'micha', rarity: 'legendaer', level: 1 });
  assert.equal(canFuse(s, 'micha', 'legendaer'), false);
});

import { sellValue, pickFood, feed, sell, sellDuplicates, levelUpUids } from '../js/progress.js';

const I = (uid, id, rarity, level = 1) => ({ uid, id, rarity, level, caughtAt: 0 });

test('v6: sellValue = 2 × Fang-Sats', () => {
  assert.deepEqual(['normal', 'selten', 'episch', 'legendaer'].map(sellValue), [20, 60, 160, 400]);
});

test('v6: pickFood nimmt das schwächste passende Duplikat', () => {
  const s = emptySaveV3();
  s.box.push(
    I('t', 'christian', 'selten', 3),
    I('a', 'christian', 'selten', 1),
    I('b', 'christian', 'normal', 5),
    I('c', 'christian', 'normal', 2),
    I('d', 'christian', 'episch', 1), // höhere Seltenheit
    I('e', 'viktor', 'normal', 1),    // anderer Rüther
    I('f', 'christian', 'normal', 1), // im Team
  );
  s.team = ['t', 'f'];
  assert.equal(pickFood(s, 't'), 'c');
  s.box = s.box.filter(i => i.uid !== 'c' && i.uid !== 'b');
  assert.equal(pickFood(s, 't'), 'a');
  assert.equal(pickFood(s, 'e'), null);
  assert.equal(pickFood(s, 'nope'), null);
});

test('v6: feed gibt +2 Level, Kappe 20, Schutzregeln', () => {
  const s = emptySaveV3();
  s.box.push(I('t', 'christian', 'selten', 3), I('a', 'christian', 'normal'), I('b', 'christian', 'episch'),
    I('c', 'viktor', 'normal'), I('f', 'christian', 'normal'), I('g', 'christian', 'normal'));
  s.team = ['t', 'f'];
  assert.deepEqual(feed(s, 't', 'a'), { ok: true, level: 5 });
  assert.equal(s.box.some(i => i.uid === 'a'), false);
  assert.equal(feed(s, 't', 'nope').reason, 'unbekannt');
  assert.equal(feed(s, 'nope', 'g').reason, 'unbekannt');
  assert.equal(feed(s, 't', 'f').reason, 'team');
  assert.equal(feed(s, 't', 'b').reason, 'falsch'); // höhere Seltenheit
  assert.equal(feed(s, 't', 'c').reason, 'falsch'); // anderer Rüther
  assert.equal(feed(s, 't', 't').reason, 'falsch');
  s.box.find(i => i.uid === 't').level = 19;
  assert.deepEqual(feed(s, 't', 'g'), { ok: true, level: 20 });
  s.box.push(I('h', 'christian', 'normal'));
  assert.equal(feed(s, 't', 'h').reason, 'max');
  assert.equal(s.box.some(i => i.uid === 'h'), true);
});

test('v6: sell schützt Team und letztes Exemplar einer Seltenheit', () => {
  const s = emptySaveV3();
  s.box.push(I('a', 'christian', 'normal'), I('b', 'christian', 'normal'), I('c', 'christian', 'episch'), I('d', 'christian', 'normal'));
  s.team = ['d'];
  assert.deepEqual(sell(s, 'a'), { ok: true, sats: 20 });
  assert.equal(s.sats, 20);
  assert.deepEqual(s.box.map(i => i.uid), ['b', 'c', 'd']);
  assert.equal(sell(s, 'd').reason, 'team');
  assert.equal(sell(s, 'c').reason, 'letztes');
  assert.equal(sell(s, 'nope').reason, 'unbekannt');
  assert.deepEqual(sell(s, 'b'), { ok: true, sats: 20 }); // d (Team) bleibt als Normal übrig
  assert.equal(sell(s, 'd').ok, false);
  assert.equal(s.sats, 40);
});

test('v6: sellDuplicates behält Team und bestes je Seltenheit', () => {
  const s = emptySaveV3();
  s.box.push(
    I('n1', 'christian', 'normal', 2), I('n2', 'christian', 'normal', 7), I('n3', 'christian', 'normal', 1),
    I('n4', 'christian', 'normal', 1), I('s1', 'christian', 'selten', 1), I('s2', 'christian', 'selten', 4),
    I('e1', 'christian', 'episch', 1), I('v1', 'viktor', 'normal', 1), I('v2', 'viktor', 'normal', 1),
  );
  s.team = ['n4', 'v1'];
  s.sats = 5;
  assert.deepEqual(sellDuplicates(s, 'christian'), { count: 3, sats: 100 }); // n1, n3 (je 20), s1 (60)
  assert.deepEqual(s.box.map(i => i.uid), ['n2', 'n4', 's2', 'e1', 'v1', 'v2']);
  assert.equal(s.sats, 105);
  assert.deepEqual(sellDuplicates(s, 'christian'), { count: 0, sats: 0 });
  // Gleichstand: das Teammitglied gilt als bestes, das andere geht weg
  assert.deepEqual(sellDuplicates(s, 'viktor'), { count: 1, sats: 20 });
  assert.deepEqual(s.box.filter(i => i.id === 'viktor').map(i => i.uid), ['v1']);
});

test('v6: levelUpUids +1, Kappe 20, nur geänderte', () => {
  const s = emptySaveV3();
  s.box.push(I('a', 'christian', 'normal', 3), I('b', 'viktor', 'normal', 20), I('c', 'micha', 'normal', 19));
  assert.deepEqual(levelUpUids(s, ['a', 'b', 'nope', undefined, 'a']), [{ uid: 'a', level: 4 }]);
  assert.deepEqual(levelUpUids(s, ['c'], 5), [{ uid: 'c', level: 20 }]);
  assert.deepEqual(levelUpUids(s, []), []);
});
