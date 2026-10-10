import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySaveV3, migrate, haunebuWin, activeBeam, endBeam } from '../js/progress.js';
import { checkAchievements } from '../js/quests.js';
import { makeFighter, makeBoss, createBattle, tick, msToChargedWarn } from '../js/battle.js';
import { CONST, ARENAS, BOSSES, RUETHER_BY_ID } from '../js/data.js';

// v8: Flugscheibe als Besitz entfällt (Beschwörung + 10-Minuten-Fenster, siehe v8.test.mjs). Hier bleibt,
// was aus v7 weiter gilt: Beam-Prüfung bei der Migration, activeBeam-Grenze, endBeam.
test('v7: neuer Spielstand hat Fenster, Beam und haunebuWins', () => {
  const s = emptySaveV3();
  assert.equal(s.haunebuUntil, 0);
  assert.equal(s.beam, null);
  assert.equal(s.stats.haunebuWins, 0);
});

test('v7: Migration eines v6-Spielstands ohne die neuen Felder', () => {
  const v6 = { version: 3, box: [], team: [], sats: 42, stats: { catches: 5, arenaWins: 1 } };
  const s = migrate(v6);
  assert.equal(s.haunebuUntil, 0);
  assert.equal(s.beam, null);
  assert.equal(s.stats.haunebuWins, 0);
  assert.equal(s.stats.catches, 5);
  assert.equal(s.sats, 42);
  // vorhandene Werte bleiben, kaputter Beam fliegt raus
  const keep = migrate({ ...v6, beam: { arenaId: 'keller', until: 123 }, stats: { haunebuWins: 2 } });
  assert.deepEqual(keep.beam, { arenaId: 'keller', until: 123 });
  assert.equal(keep.stats.haunebuWins, 2);
  for (const beam of [{ arenaId: 'keller' }, { arenaId: 5, until: 1 }, { until: 1 }, 'x', 7]) {
    assert.equal(migrate({ ...v6, beam }).beam, null);
  }
});

test('v7: activeBeam an der Grenze, endBeam räumt auf', () => {
  const s = emptySaveV3();
  assert.equal(activeBeam(s, 0), null);
  haunebuWin(s, 0);
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
  s.stats.haunebuWins = 1; // v8: Erfolg hängt am Sieg, nicht mehr am Besitz
  assert.deepEqual(checkAchievements(s).map(a => a.id).sort(), ['haunebu', 'keller']);
});

test('v7/v8: master3 braucht alle fünf Arenen (v8: mit Neuschwabenland)', () => {
  assert.equal(ARENAS.length, 5);
  const s = emptySaveV3();
  for (const id of ['worringen', 'huettenberg', 'pcsale', 'keller']) s.arenaMastered[id] = true;
  assert.ok(!checkAchievements(s).some(a => a.id === 'master3'));
  s.arenaMastered.neuschwabenland = true;
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

// v7c §2c: Gegner-Sprüche stehen 3 s in der Blase; ein Ausruf der Lade-Attacke ersetzt sie sofort
test('v7c: msToChargedWarn: Sprüche passen zwischen die Ausrufe, auch in der Wut', () => {
  const SAY = 3000;
  for (const def of [BOSSES.hitler, BOSSES.heizung]) {
    const s = createBattle({ team: [strong('christian'), strong('micha')], enemy: makeBoss(def, 1), rng: () => 0.5 });
    s.team.forEach(f => { f.btc = f.maxBtc = 1e6; });
    s.enemy.btc = s.enemy.maxBtc = 1e6;
    const fits = [], warns = [], lines = [];
    let nextLineAt = 8000; // Regel wie in battle-ui.js: Ausruf → Spruch frühestens SAY + 500 danach, sonst alle 8 s
    while (s.time < 80_000) {
      if (s.time >= 40_000 && !s.enemy.rage) s.enemy.btc = s.enemy.maxBtc / 2; // nächster Tipp löst die Wut aus
      for (const e of tick(s, 50, { taps: 1 })) {
        if (e.type === 'warn' && e.kind === 'charged') { warns.push(s.time); nextLineAt = s.time + SAY + 500; }
      }
      const ok = msToChargedWarn(s) >= SAY;
      if (ok) fits.push(s.time);
      if (ok && s.time >= nextLineAt) { lines.push(s.time); nextLineAt = s.time + 8000; }
    }
    assert.ok(s.enemy.rage, def.id);
    for (const w of warns) assert.ok(!fits.some(t => t > w - SAY && t < w), `${def.id}: Spruch vor Ausruf bei ${w}`);
    assert.ok(lines.filter(t => t < 40_000).length >= 3, `${def.id}: Sprüche normal`);
    assert.ok(lines.filter(t => t > 41_000).length >= 3, `${def.id}: Sprüche in der Wut`);
  }
});
