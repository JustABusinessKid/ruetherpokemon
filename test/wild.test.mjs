import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildBossDef, makeWild } from '../js/wild.js';
import { createBattle, makeFighter, tick } from '../js/battle.js';
import { RUETHER_BY_ID } from '../js/data.js';

const N1 = { rarity: 'normal', level: 1 };

test('wildBossDef: Christian Normal Lv. 1', () => {
  const d = wildBossDef(RUETHER_BY_ID.christian, N1);
  assert.equal(d.id, 'christian');
  assert.equal(d.name, 'Christian');
  assert.equal(d.btc, 160); // round(100 × 1,6)
  assert.deepEqual(d.fast, { name: 'Rempler', damage: 6, every: 2600, warn: 600, fx: 'wild-fast', prop: null, ownerId: 'christian' });
  assert.deepEqual(d.charged.map(c => [c.name, c.damage, c.warn, c.fx, c.prop, c.ownerId]), [
    ['Plus 70 Prozent', 28, 1200, 'wild', 'chart-up', 'christian'],
    ['Vice-President-Handschlag', 7, 1200, 'wild', 'handshake', 'christian'],
    ['Werfen mit Dosenbier', 14, 1200, 'wild', 'beer-can', 'christian'],
  ]);
  // keine Spieler-Felder im Boss
  for (const c of d.charged) for (const k of ['cost', 'weaken', 'drain', 'summon', 'once']) assert.equal(k in c, false, k);
});

test('wildBossDef: Hildegard hat Familientreffen als Lade-Attacke mit 18', () => {
  const d = wildBossDef(RUETHER_BY_ID.hildegard, N1);
  assert.equal(d.btc, 192);
  const fam = d.charged.find(c => c.name === 'Familientreffen');
  assert.equal(fam.damage, 18);
  assert.equal(fam.prop, 'family');
  assert.equal(d.charged.find(c => c.name === 'Handtaschen-Hieb').damage, 14);
});

test('wildBossDef: Gift 75 % Dauer, Betäubung max 2 s, Heilung × 0,6, flavour bleibt', () => {
  const v = wildBossDef(RUETHER_BY_ID.viktor, N1);
  const gas = v.charged.find(c => c.name === 'Giftgas');
  assert.deepEqual([gas.damage, gas.poison], [7, { perSec: 5, ms: 6000 }]);
  const speech = v.charged.find(c => c.fx === 'wild' && c.prop === 'speech');
  assert.equal(speech.stun, 2000);
  assert.equal(speech.flavour, 'Deutsche Bank ist kein Geringverdiener.');
  const r = wildBossDef(RUETHER_BY_ID.ramona, N1);
  assert.deepEqual(r.charged.map(c => [c.damage, c.heal, c.poison]), [[10, undefined, { perSec: 4, ms: 6000 }], [0, 24, undefined]]);
  const m = wildBossDef(RUETHER_BY_ID.micha, N1);
  assert.deepEqual(m.charged.map(c => c.damage), [21, 17]);
});

test('wildBossDef: Legendär Lv. 20 skaliert mit der Hashrate', () => {
  const d = wildBossDef(RUETHER_BY_ID.christian, { rarity: 'legendaer', level: 20 }); // power 2,816
  assert.equal(d.btc, 451); // round(282 × 1,6)
  assert.equal(d.fast.damage, 17); // round(6 × 2,816)
  assert.deepEqual(d.charged.map(c => c.damage), [78, 19, 39]);
  const h = wildBossDef(RUETHER_BY_ID.hildegard, { rarity: 'legendaer', level: 20 });
  assert.equal(h.charged[0].damage, 50); // floor(18 × 2,816)
  assert.equal(wildBossDef(RUETHER_BY_ID.ramona, { rarity: 'legendaer', level: 20 }).charged[1].heal, 68); // round(40 × 2,816 × 0,6)
});

test('makeWild: Boss-Gegner mit Wild-Markierung, Engine läuft', () => {
  const e = makeWild(RUETHER_BY_ID.christian, { rarity: 'selten', level: 3 });
  assert.equal(e.wild, true);
  assert.equal(e.rarity, 'selten');
  assert.equal(e.level, 3);
  assert.equal(e.id, 'christian');
  assert.equal(e.btc, e.maxBtc);
  assert.equal(e.fastEvery, 2600);
  assert.equal(e.charged.length, 3);
  const s = createBattle({ team: [makeFighter(RUETHER_BY_ID.viktor)], enemy: e, duration: 60_000 });
  const ev = [];
  for (let t = 0; t < 3000; t += 50) ev.push(...tick(s, 50));
  const hit = ev.find(x => x.type === 'enemyAttack');
  assert.equal(hit.attack.name, 'Rempler');
  assert.equal(hit.damage, e.fast.damage);
});
