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

test('Boss setzt keine Aussetz-Attacke ein, wenn der Spieler gerade ausgesetzt hat', () => {
  const ps3 = makeFighter(BOSSES.ps3);
  // Runde 1: Dosenbier trifft, Boss wählt Index 2 = Firmware-Update (kein Wurf nötig)
  let s = battle([F('christian')], ps3, seq(HIT, 0.99, 0.99, HIT));
  s = playerAttack(s, 2);
  assert.equal(s.team[0].status.skip, true);
  // Runde 2: Christian setzt aus. Kandidaten ohne Firmware-Update: [Blu-ray, Yellow] → 0.99 → Yellow Light
  s = playerAttack(s, 0);
  assert.match(s.log.join(' '), /Yellow Light of Death/);
  assert.equal(s.team[0].status.skip, false);
  assert.equal(s.enemy.btc, 110);
});
