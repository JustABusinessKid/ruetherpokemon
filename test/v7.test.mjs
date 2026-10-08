import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySaveV3, migrate, buyItem, haunebuWin, startBeam, activeBeam, endBeam } from '../js/progress.js';
import { checkAchievements } from '../js/quests.js';
import { makeFighter, makeBoss, createBattle, tick } from '../js/battle.js';
import { CONST, ARENAS, BOSSES, RUETHER_BY_ID } from '../js/data.js';

test('v7: neuer Spielstand hat Flugscheibe, Beam und haunebuWins', () => {
  const s = emptySaveV3();
  assert.equal(s.flugscheibe, false);
  assert.equal(s.beam, null);
  assert.equal(s.stats.haunebuWins, 0);
});

test('v7: Migration eines v6-Spielstands ohne die neuen Felder', () => {
  const v6 = { version: 3, box: [], team: [], sats: 42, stats: { catches: 5, arenaWins: 1 } };
  const s = migrate(v6);
  assert.equal(s.flugscheibe, false);
  assert.equal(s.beam, null);
  assert.equal(s.stats.haunebuWins, 0);
  assert.equal(s.stats.catches, 5);
  assert.equal(s.sats, 42);
  // vorhandene Werte bleiben, kaputter Beam fliegt raus
  const keep = migrate({ ...v6, flugscheibe: true, beam: { arenaId: 'keller', until: 123 }, stats: { haunebuWins: 2 } });
  assert.equal(keep.flugscheibe, true);
  assert.deepEqual(keep.beam, { arenaId: 'keller', until: 123 });
  assert.equal(keep.stats.haunebuWins, 2);
  for (const beam of [{ arenaId: 'keller' }, { arenaId: 5, until: 1 }, { until: 1 }, 'x', 7]) {
    assert.equal(migrate({ ...v6, beam }).beam, null);
  }
  assert.equal(migrate({ ...v6, flugscheibe: 'ja' }).flugscheibe, false);
});

test('v7: buyItem haunebu: Sats, Besitz, Beschwörung ohne Inventar', () => {
  const s = emptySaveV3();
  s.sats = 999;
  assert.deepEqual(buyItem(s, 'haunebu', 0), { ok: false, reason: 'sats' });
  assert.equal(s.sats, 999);
  s.sats = 1200;
  assert.deepEqual(buyItem(s, 'haunebu', 0), { ok: true, summon: true });
  assert.equal(s.sats, 200);
  assert.equal(s.items.haunebu, undefined);
  s.flugscheibe = true;
  s.sats = 5000;
  assert.deepEqual(buyItem(s, 'haunebu', 0), { ok: false, reason: 'besitz' });
  assert.equal(s.sats, 5000);
  s.sats = 0; // Besitz geht vor Sats
  assert.deepEqual(buyItem(s, 'haunebu', 0), { ok: false, reason: 'besitz' });
});

test('v7: haunebuWin gibt Flugscheibe, Sats und zählt', () => {
  const s = emptySaveV3();
  s.sats = 10;
  assert.deepEqual(haunebuWin(s), { sats: CONST.HAUNEBU_WIN_SATS });
  assert.equal(s.flugscheibe, true);
  assert.equal(s.sats, 10 + CONST.HAUNEBU_WIN_SATS);
  assert.equal(s.stats.haunebuWins, 1);
  haunebuWin(s);
  assert.equal(s.stats.haunebuWins, 2);
});

test('v7: startBeam: Fehlerfälle ohne Abzug', () => {
  const s = emptySaveV3();
  s.sats = 1000;
  assert.deepEqual(startBeam(s, 'keller', 0), { ok: false, reason: 'keine' });
  s.flugscheibe = true;
  assert.deepEqual(startBeam(s, 'mond', 0), { ok: false, reason: 'arena' });
  s.sats = CONST.HAUNEBU_BEAM_COST - 1;
  assert.deepEqual(startBeam(s, 'keller', 0), { ok: false, reason: 'sats' });
  assert.equal(s.sats, CONST.HAUNEBU_BEAM_COST - 1);
  assert.equal(s.beam, null);
});

test('v7: startBeam zieht Sats ab, ein neuer Flug ersetzt den aktiven', () => {
  const s = emptySaveV3();
  s.flugscheibe = true;
  s.sats = 700;
  assert.deepEqual(startBeam(s, 'keller', 1000), { ok: true, until: 1000 + CONST.HAUNEBU_BEAM_MS });
  assert.equal(s.sats, 400);
  assert.deepEqual(s.beam, { arenaId: 'keller', until: 1000 + CONST.HAUNEBU_BEAM_MS });
  assert.deepEqual(startBeam(s, 'pcsale', 5000), { ok: true, until: 5000 + CONST.HAUNEBU_BEAM_MS });
  assert.equal(s.sats, 100);
  assert.deepEqual(s.beam, { arenaId: 'pcsale', until: 5000 + CONST.HAUNEBU_BEAM_MS });
});

test('v7: activeBeam an der Grenze, endBeam räumt auf', () => {
  const s = emptySaveV3();
  assert.equal(activeBeam(s, 0), null);
  s.beam = { arenaId: 'keller', until: 1000 };
  assert.deepEqual(activeBeam(s, 999), { arenaId: 'keller', until: 1000 });
  assert.equal(activeBeam(s, 1000), null);
  assert.equal(activeBeam(s, 2000), null);
  endBeam(s);
  assert.equal(s.beam, null);
});

test('v7: Erfolge keller und haunebu', () => {
  const s = emptySaveV3();
  s.arenaLevels.keller = 1;
  assert.deepEqual(checkAchievements(s), []);
  s.arenaLevels.keller = 2;
  s.flugscheibe = true;
  assert.deepEqual(checkAchievements(s).map(a => a.id).sort(), ['haunebu', 'keller']);
});

test('v7: master3 braucht alle vier Arenen', () => {
  assert.equal(ARENAS.length, 4);
  const s = emptySaveV3();
  for (const id of ['worringen', 'huettenberg', 'pcsale']) s.arenaMastered[id] = true;
  assert.ok(!checkAchievements(s).some(a => a.id === 'master3'));
  s.arenaMastered.keller = true;
  assert.ok(checkAchievements(s).some(a => a.id === 'master3'));
});

// ---------- Engine: neue Bosse ----------
const strong = id => makeFighter(RUETHER_BY_ID[id], { uid: id, rarity: 'legendaer', level: 20 });
// Tippt dauernd, zündet Spezial 0, sobald genug Energie da ist
function fight(s, ms) {
  const ev = [];
  for (let t = 0; t < ms && !s.over; t += 50) {
    const me = s.team[s.active];
    ev.push(...tick(s, 50, { taps: 1, special: me.energy >= me.attacks[0].cost ? 0 : undefined }));
  }
  return ev;
}
const has = (ev, type, target) => ev.some(e => e.type === type && (!target || e.target === target));

test('v7: Bitcoin-Heizung: Gift, Betäubung und Heilung laufen über 35 s', () => {
  const s = createBattle({ team: [strong('christian'), strong('micha'), strong('viktor')], enemy: makeBoss(BOSSES.heizung, 1), rng: () => 0.5 });
  s.enemy.btc = s.enemy.maxBtc = 100_000; // Boss hält durch, damit alle Lade-Attacken kommen
  const ev = fight(s, 35_000);
  assert.ok(s.time > 20_000);
  assert.ok(has(ev, 'poisoned', 'me'));
  assert.ok(has(ev, 'stun', 'me'));
  assert.ok(has(ev, 'heal', 'enemy'));
  const fx = ev.filter(e => e.type === 'enemyAttack' && e.kind === 'charged').map(e => e.attack.fx);
  assert.deepEqual(fx.slice(0, 3), ['overheat', 'fan', 'found']);
});

test('v7: Hitler: Wolfsschanze, Betäubung und Bunker-Heilung laufen über 35 s', () => {
  const s = createBattle({ team: [strong('christian'), strong('micha'), strong('viktor')], enemy: makeBoss(BOSSES.hitler, 1), rng: () => 0.5 });
  s.enemy.btc = s.enemy.maxBtc = 100_000;
  const ev = fight(s, 35_000);
  assert.ok(s.time > 20_000);
  assert.ok(has(ev, 'stun', 'me'));
  assert.ok(has(ev, 'heal', 'enemy'));
  assert.ok(ev.some(e => e.type === 'enemyAttack' && e.kind === 'fast' && e.attack.fx === 'krupp'));
  const fx = ev.filter(e => e.type === 'enemyAttack' && e.kind === 'charged').map(e => e.attack.fx);
  assert.deepEqual(fx.slice(0, 3), ['wolfsschanze', 'ray', 'bunker']);
  assert.ok(has(ev, 'enemySummoned'));
  assert.equal(ev.filter(e => e.type === 'enemySummon').length, 20);
});

// ---------- Engine: Gegner-Helfer (Wolfsschanzen-Beschwörung) ----------
const run = (s, ms) => { const ev = []; for (let t = 0; t < ms; t += 50) ev.push(...tick(s, 50)); return ev; };
// Hitler ohne eigene weitere Angriffe; die Beschwörung feuert im ersten Schritt (t = 50)
function summonBattle(team, dodged = false) {
  const s = createBattle({ team, enemy: makeBoss(BOSSES.hitler, 1), rng: () => 0.5 });
  const e = s.enemy;
  e.nextFastAt = e.chargedEvery = Infinity;
  e.warning = { kind: 'charged', attack: e.charged[0], firesAt: 0, dodged };
  return s;
}
const helperHits = ev => ev.filter(e => e.type === 'enemySummon');

test('v7: Goebbels und Himmler schlagen 10 s lang je einmal pro Sekunde, dann nicht mehr', () => {
  const s = summonBattle([strong('christian')]);
  assert.deepEqual(s.enemySummons, []);
  const me = s.team[0], start = me.btc;
  let ev = tick(s, 50);
  assert.deepEqual(ev.find(e => e.type === 'enemySummoned'), { type: 'enemySummoned', ids: ['goebbels', 'himmler'], names: ['Goebbels', 'Himmler'], ms: 10_000 });
  assert.equal(s.enemySummons.length, 2);
  assert.deepEqual(s.summons, []); // Spieler-Helfer bleiben getrennt
  ev = run(s, 10_000); // Schläge bei 1050 … 10050
  const hits = helperHits(ev);
  assert.equal(hits.length, 20);
  assert.deepEqual(hits.slice(0, 2), [
    { type: 'enemySummon', id: 'goebbels', name: 'Goebbels', damage: 3 },
    { type: 'enemySummon', id: 'himmler', name: 'Himmler', damage: 3 },
  ]);
  assert.equal(me.btc, start - 60);
  assert.equal(s.enemySummons.length, 0);
  ev = run(s, 3000);
  assert.equal(helperHits(ev).length, 0);
  assert.equal(me.btc, start - 60);
});

test('v7: Ausweichen verhindert die Wolfsschanzen-Beschwörung nicht', () => {
  const s = summonBattle([strong('christian')], true);
  const ev = tick(s, 50);
  assert.ok(ev.some(e => e.type === 'enemyAttack' && e.dodged));
  assert.ok(has(ev, 'enemySummoned'));
  assert.equal(s.enemySummons.length, 2);
});

test('v7: Gegner-Helfer: nach K.o. trifft der nächste Schlag den nächsten Rüther', () => {
  const s = summonBattle([strong('christian'), strong('micha')]);
  const [first, second] = s.team;
  first.btc = 4;
  tick(s, 50);
  let ev = run(s, 1000); // bei 1050: Goebbels 3, Himmler nur noch 1
  assert.deepEqual(helperHits(ev).map(e => e.damage), [3, 1]);
  assert.equal(ev.find(e => e.type === 'faint').fighter, first);
  assert.equal(s.team[s.active], second);
  const before = second.btc;
  ev = run(s, 1000); // bei 2050
  assert.deepEqual(helperHits(ev).map(e => e.damage), [3, 3]);
  assert.equal(second.btc, before - 6);
});

test('v7: Gegner-Helfer: nach einem Sieg kein Schaden und keine Events mehr', () => {
  const s = summonBattle([strong('christian')]);
  const me = s.team[0];
  tick(s, 50);
  run(s, 950); // t = 1000, nächster Helfer-Schlag bei 1050
  const before = me.btc;
  s.enemy.btc = 3;
  let ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'win'));
  assert.equal(helperHits(ev).length, 0);
  ev = run(s, 3000);
  assert.deepEqual(ev, []);
  assert.equal(me.btc, before);
});

test('v7: starke Rüther besiegen Hitler mit Spezialattacken', () => {
  const s = createBattle({ team: [strong('christian'), strong('micha'), strong('viktor')], enemy: makeBoss(BOSSES.hitler, 1), rng: () => 0.5 });
  assert.equal(s.enemy.maxBtc, 600);
  const ev = fight(s, CONST.BATTLE_DURATION);
  assert.ok(has(ev, 'special'));
  assert.equal(s.won, true);
  assert.equal(s.reason, 'ko');
  assert.equal(s.enemy.btc, 0);
});

test('v7: enemyAttack nennt den getroffenen Rüther, auch wenn er im selben Schritt K.o. geht', () => {
  const s = createBattle({ team: [strong('christian'), strong('micha')], enemy: makeBoss(BOSSES.hitler, 1), rng: () => 0.5 });
  const first = s.team[0];
  first.btc = 1;
  const ev = [];
  for (let t = 0; t < 10_000 && !ev.some(e => e.type === 'faint'); t += 50) ev.push(...tick(s, 50, {}));
  const hit = ev.find(e => e.type === 'enemyAttack' && e.damage > 0);
  assert.equal(hit.fighter, first);
  assert.equal(ev.find(e => e.type === 'faint').fighter, first);
  assert.equal(s.team[s.active], s.team[1]); // state.active zeigt schon auf den Nächsten
});
