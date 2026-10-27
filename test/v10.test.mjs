import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySaveV3, migrate, abilityLevel, buyAbility, upgradeAbility, equipAbility, loadoutFor } from '../js/progress.js';
import { POOLS, FIXED } from '../js/quest/abilities.js';
import { CONST } from '../js/data.js';

// Spec v10 §2: eigene Kopie der IDs, damit Logik und Fähigkeiten-Daten nicht auseinanderlaufen
const IDS = {
  christian: { fixed: ['plus70', 'beer'], pool: ['vp', 'kursalarm', 'wlan'] },
  hildegard: { fixed: ['family', 'junge'], pool: ['mittag', 'tratsch', 'mutter'] },
  viktor: { fixed: ['gas', 'argue'], pool: ['crash', 'insider', 'deo'] },
  micha: { fixed: ['wallet', 'controller'], pool: ['firewall', 'raubkopie', 'vibra'] },
  ramona: { fixed: ['mms', 'credits'], pool: ['horde', 'sale', 'feierabend'] },
  moshe: { fixed: ['buch', 'neuesvideo'], pool: ['schlange', 'zinseszins', 'geschenk'] }, // v13 §2
};
const rich = (sats = 1e6) => Object.assign(emptySaveV3(), { sats });

test('v10: IDs in abilities.js passen zur Spec', () => {
  for (const [rid, { fixed, pool }] of Object.entries(IDS)) {
    assert.deepEqual(FIXED[rid], fixed, rid);
    assert.deepEqual(POOLS[rid], pool, rid);
  }
  assert.deepEqual(Object.keys(FIXED).sort(), Object.keys(IDS).sort());
});

test('v10: neuer Spielstand: feste Stufe 1, Pool leer, Slot leer', () => {
  const s = emptySaveV3();
  for (const [rid, { fixed, pool }] of Object.entries(IDS)) {
    assert.deepEqual(s.questAbilities[rid], { levels: {}, slot: null });
    for (const aid of fixed) assert.equal(abilityLevel(s, rid, aid), 1);
    for (const aid of pool) assert.equal(abilityLevel(s, rid, aid), 0);
    assert.deepEqual(loadoutFor(s, rid), [{ id: fixed[0], level: 1 }, { id: fixed[1], level: 1 }, null]);
  }
  assert.equal(abilityLevel(s, 'christian', 'gas'), 0, 'fremde Fähigkeit');
  assert.equal(abilityLevel(s, 'christian', 'handbag'), 0, 'alte Fähigkeit gibt es nicht mehr');
  assert.equal(abilityLevel({}, 'viktor', 'gas'), 1, 'geht auch ohne questAbilities');
});

test('v10: Kaufen kostet ABILITY_BUY, gibt Stufe 1, erste wird ausgerüstet', () => {
  const s = rich(CONST.ABILITY_BUY - 1);
  assert.deepEqual(buyAbility(s, 'christian', 'vp'), { ok: false, reason: 'sats' });
  assert.equal(s.sats, CONST.ABILITY_BUY - 1);
  assert.equal(abilityLevel(s, 'christian', 'vp'), 0);
  s.sats = 2 * CONST.ABILITY_BUY + 5;
  assert.deepEqual(buyAbility(s, 'christian', 'vp'), { ok: true, cost: CONST.ABILITY_BUY, level: 1 });
  assert.equal(s.sats, CONST.ABILITY_BUY + 5);
  assert.equal(s.questAbilities.christian.slot, 'vp');
  assert.deepEqual(loadoutFor(s, 'christian')[2], { id: 'vp', level: 1 });
  assert.deepEqual(buyAbility(s, 'christian', 'vp'), { ok: false, reason: 'besitz' });
  assert.deepEqual(buyAbility(s, 'christian', 'wlan').ok, true);
  assert.equal(s.sats, 5);
  assert.equal(s.questAbilities.christian.slot, 'vp', 'zweiter Kauf wechselt den Slot nicht');
  // feste, fremde und unbekannte Fähigkeiten kann man nicht kaufen
  s.sats = 1e6;
  for (const [rid, aid] of [['christian', 'plus70'], ['christian', 'gas'], ['hildegard', 'handbag'], ['niemand', 'vp']]) {
    assert.deepEqual(buyAbility(s, rid, aid), { ok: false, reason: 'pool' }, `${rid}/${aid}`);
  }
  assert.equal(s.sats, 1e6);
  assert.deepEqual(s.questAbilities.hildegard, { levels: {}, slot: null }, 'andere Rüther bleiben unberührt');
});

test('v10: Upgrade auf 2 und 3 kostet ABILITY_UP, auch feste; Fehlerfälle', () => {
  const s = rich(0);
  assert.deepEqual(upgradeAbility(s, 'micha', 'firewall'), { ok: false, reason: 'fehlt' });
  assert.deepEqual(upgradeAbility(s, 'micha', 'gas'), { ok: false, reason: 'fehlt' });
  assert.deepEqual(upgradeAbility(s, 'micha', 'controller'), { ok: false, reason: 'sats' });
  s.sats = CONST.ABILITY_UP[2];
  assert.deepEqual(upgradeAbility(s, 'micha', 'controller'), { ok: true, cost: CONST.ABILITY_UP[2], level: 2 });
  assert.equal(s.sats, 0);
  assert.deepEqual(upgradeAbility(s, 'micha', 'controller'), { ok: false, reason: 'sats' });
  assert.equal(abilityLevel(s, 'micha', 'controller'), 2);
  s.sats = CONST.ABILITY_UP[3] + 1;
  assert.deepEqual(upgradeAbility(s, 'micha', 'controller'), { ok: true, cost: CONST.ABILITY_UP[3], level: 3 });
  assert.deepEqual(upgradeAbility(s, 'micha', 'controller'), { ok: false, reason: 'max' });
  assert.equal(s.sats, 1);
  assert.deepEqual(loadoutFor(s, 'micha'), [{ id: 'wallet', level: 1 }, { id: 'controller', level: 3 }, null]);
});

test('v10: alles kaufen und ausbauen kostet 28.000 je Rüther, 168.000 für alle sechs (v13: Moshe frei)', () => {
  assert.equal(CONST.ABILITY_BUY, 1000);
  assert.deepEqual(CONST.ABILITY_UP, { 2: 2000, 3: 3000 });
  const s = rich(168_000);
  s.questLog = { rabino: { wins: 3 } };
  for (const [rid, { fixed, pool }] of Object.entries(IDS)) {
    const before = s.sats;
    for (const aid of pool) assert.equal(buyAbility(s, rid, aid).ok, true);
    for (const aid of [...fixed, ...pool]) {
      assert.equal(upgradeAbility(s, rid, aid).ok, true);
      assert.equal(upgradeAbility(s, rid, aid).ok, true);
      assert.equal(abilityLevel(s, rid, aid), 3);
    }
    assert.equal(before - s.sats, 28_000, rid);
    assert.deepEqual(loadoutFor(s, rid), [{ id: fixed[0], level: 3 }, { id: fixed[1], level: 3 }, { id: pool[0], level: 3 }]);
  }
  assert.equal(s.sats, 0);
});

test('v10: Ausrüsten nur gekaufte Pool-Fähigkeit, kostenlos, null leert den Slot', () => {
  const s = rich(2000);
  buyAbility(s, 'ramona', 'sale');
  assert.deepEqual(equipAbility(s, 'ramona', 'horde'), { ok: false, reason: 'fehlt' });
  assert.deepEqual(equipAbility(s, 'ramona', 'mms'), { ok: false, reason: 'pool' });
  assert.deepEqual(equipAbility(s, 'ramona', 'vp'), { ok: false, reason: 'pool' });
  assert.equal(s.questAbilities.ramona.slot, 'sale');
  buyAbility(s, 'ramona', 'feierabend');
  upgradeAbility(s, 'ramona', 'feierabend'); // zu wenig Sats, bleibt Stufe 1
  assert.equal(s.sats, 0);
  assert.deepEqual(equipAbility(s, 'ramona', 'feierabend'), { ok: true });
  assert.equal(s.sats, 0);
  assert.deepEqual(loadoutFor(s, 'ramona')[2], { id: 'feierabend', level: 1 });
  assert.deepEqual(equipAbility(s, 'ramona', null), { ok: true });
  assert.equal(loadoutFor(s, 'ramona')[2], null);
  // leerer Slot: der nächste Kauf rüstet wieder aus
  s.sats = 1000;
  buyAbility(s, 'ramona', 'horde');
  assert.equal(s.questAbilities.ramona.slot, 'horde');
});

test('v10: Migration füllt leer auf, behält gültige Stufen, Kaputtes fliegt raus', () => {
  const old = { version: 3, box: [], team: [], sats: 7, stats: {} };
  const s = migrate(old);
  for (const rid of Object.keys(IDS)) assert.deepEqual(s.questAbilities[rid], { levels: {}, slot: null });
  for (const bad of ['x', [], null, 3]) assert.deepEqual(migrate({ ...old, questAbilities: bad }).questAbilities, s.questAbilities);
  const m = migrate({
    ...old,
    questAbilities: {
      christian: { levels: { plus70: 3, vp: 2, wlan: 1, gas: 2, handbag: 1, kursalarm: 4, beer: '2' }, slot: 'wlan' },
      hildegard: { levels: { mittag: 0, tratsch: 1.5 }, slot: 'mittag' },
      viktor: { levels: { deo: 1 }, slot: 'gas' },
      micha: 'kaputt',
      fremd: { levels: { x: 1 }, slot: 'x' },
    },
  });
  assert.deepEqual(m.questAbilities.christian, { levels: { plus70: 3, vp: 2, wlan: 1 }, slot: 'wlan' });
  assert.deepEqual(m.questAbilities.hildegard, { levels: {}, slot: null }, 'Slot nur mit gekaufter Fähigkeit');
  assert.deepEqual(m.questAbilities.viktor, { levels: { deo: 1 }, slot: null }, 'feste Fähigkeit gehört nicht in den Slot');
  assert.deepEqual(m.questAbilities.micha, { levels: {}, slot: null });
  assert.equal('fremd' in m.questAbilities, false);
  assert.deepEqual(loadoutFor(m, 'christian'), [{ id: 'plus70', level: 3 }, { id: 'beer', level: 1 }, { id: 'wlan', level: 1 }]);
  // Neuladen ändert nichts
  assert.deepEqual(migrate(structuredClone(m)).questAbilities, m.questAbilities);
});
