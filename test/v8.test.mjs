import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySaveV3, migrate, buyItem, summonCost, haunebuWin, haunebuActive, consumeHaunebu, startBeam, activeBeam, endBeam,
  questsUnlocked, questResult, QUEST_SATS,
} from '../js/progress.js';
import { checkAchievements, seededRng } from '../js/quests.js';
import { makeFighter, makeBoss, createBattle, tick } from '../js/battle.js';
import { CONST, ARENAS, BOSSES, RUETHERS, RUETHER_BY_ID } from '../js/data.js';

const MIN = CONST.HAUNEBU_USE_MS;

// ---------- §1 Haunebu: Kosten und Fenster ----------
test('v8: summonCost 5000, 6000, 7000, 8000, 8000 …', () => {
  const s = emptySaveV3();
  const row = [];
  for (let n = 0; n < 6; n++) { s.stats.haunebuSummons = n; row.push(summonCost(s)); }
  assert.deepEqual(row, [5000, 6000, 7000, 8000, 8000, 8000]);
  delete s.stats.haunebuSummons;
  assert.equal(summonCost(s), 5000);
});

test('v8: buyItem haunebu: Sats, aktives Fenster, Preis steigt mit jeder Beschwörung', () => {
  const s = emptySaveV3();
  s.sats = 4999;
  assert.deepEqual(buyItem(s, 'haunebu', 0), { ok: false, reason: 'sats' });
  assert.equal(s.sats, 4999);
  assert.equal(s.stats.haunebuSummons, 0);
  s.sats = 12_000;
  assert.deepEqual(buyItem(s, 'haunebu', 0), { ok: true, summon: true, cost: 5000 });
  assert.equal(s.sats, 7000);
  assert.equal(s.stats.haunebuSummons, 1);
  assert.equal(s.items.haunebu, undefined);
  // Niederlage gegen Hitler: nächste Beschwörung kostet trotzdem mehr
  assert.deepEqual(buyItem(s, 'haunebu', 10), { ok: true, summon: true, cost: 6000 });
  assert.equal(s.sats, 1000);
  // Sieg: solange das Fenster läuft, keine neue Beschwörung (auch nicht ohne Sats)
  haunebuWin(s, 1000);
  s.sats = 50_000;
  assert.deepEqual(buyItem(s, 'haunebu', 1000 + MIN - 1), { ok: false, reason: 'aktiv' });
  s.sats = 0;
  assert.deepEqual(buyItem(s, 'haunebu', 1000), { ok: false, reason: 'aktiv' });
  s.sats = 7000;
  assert.deepEqual(buyItem(s, 'haunebu', 1000 + MIN), { ok: true, summon: true, cost: 7000 });
  assert.equal(s.sats, 0);
  assert.equal(s.stats.haunebuSummons, 3);
});

test('v8: haunebuWin öffnet 10 Minuten, haunebuActive an der Grenze', () => {
  const s = emptySaveV3();
  assert.equal(haunebuActive(s, 0), false);
  s.sats = 10;
  assert.deepEqual(haunebuWin(s, 5000), { sats: CONST.HAUNEBU_WIN_SATS, until: 5000 + MIN });
  assert.equal(s.haunebuUntil, 5000 + MIN);
  assert.equal(s.sats, 10 + CONST.HAUNEBU_WIN_SATS);
  assert.equal(s.stats.haunebuWins, 1);
  assert.equal(haunebuActive(s, 5000 + MIN - 1), true);
  assert.equal(haunebuActive(s, 5000 + MIN), false);
  assert.equal('flugscheibe' in s, false);
});

test('v8: startBeam braucht das Fenster, Flüge sind frei und beliebig oft', () => {
  const s = emptySaveV3();
  s.sats = 0;
  assert.deepEqual(startBeam(s, 'keller', 0), { ok: false, reason: 'keine' });
  haunebuWin(s, 1000);
  s.sats = 0;
  assert.deepEqual(startBeam(s, 'mond', 2000), { ok: false, reason: 'arena' });
  assert.equal(s.beam, null);
  const home = { lat: 51, lon: 7 };
  assert.deepEqual(startBeam(s, 'keller', 2000, home), { ok: true, until: 1000 + MIN });
  assert.deepEqual(s.beam, { arenaId: 'keller', until: 1000 + MIN, from: home });
  assert.deepEqual(startBeam(s, 'neuschwabenland', 3000), { ok: true, until: 1000 + MIN });
  assert.deepEqual(s.beam, { arenaId: 'neuschwabenland', until: 1000 + MIN, from: home }, 'Heimatort bleibt beim Weiterspringen');
  assert.equal(s.sats, 0);
  assert.deepEqual(startBeam(s, 'pcsale', 1000 + MIN), { ok: false, reason: 'keine' });
});

test('v8: activeBeam hängt am Fenster, consumeHaunebu beendet es sofort', () => {
  const s = emptySaveV3();
  haunebuWin(s, 0);
  startBeam(s, 'keller', 100);
  assert.equal(activeBeam(s, MIN - 1).arenaId, 'keller');
  assert.equal(activeBeam(s, MIN), null);
  consumeHaunebu(s, 500);
  assert.equal(haunebuActive(s, 500), false);
  assert.equal(activeBeam(s, 500), null, 'Quest verbraucht die Haunebu: Rückflug fällig');
  assert.equal(s.beam.arenaId, 'keller', 'Rückflug macht die App (Kampf/Fang abwarten)');
  endBeam(s);
  assert.equal(s.beam, null);
  // Ein alter Beam aus einem früheren Fenster wird nicht wieder aktiv
  const t = emptySaveV3();
  t.beam = { arenaId: 'keller', until: 10 * MIN };
  assert.equal(activeBeam(t, 5), null);
  haunebuWin(t, 2 * MIN);
  assert.equal(activeBeam(t, 2 * MIN + 1).until, 10 * MIN);
  t.beam.until = MIN;
  assert.equal(activeBeam(t, 2 * MIN + 1), null);
});

test('v8: Migration v7 → v8: Flugscheibe weg, Fenster zu, Zähler und Quest-Log neu', () => {
  const v7 = { version: 3, box: [], team: [], sats: 42, flugscheibe: true, beam: { arenaId: 'keller', until: 9e12, from: null }, stats: { catches: 5, haunebuWins: 2 } };
  const s = migrate(v7);
  assert.equal('flugscheibe' in s, false);
  assert.equal(s.haunebuUntil, 0);
  assert.equal(s.stats.haunebuSummons, 0);
  assert.equal(s.stats.haunebuWins, 2);
  assert.deepEqual(s.questLog, {});
  assert.equal(activeBeam(s, 1000), null, 'alte Besitzer müssen neu beschwören');
  // v8-Stand bleibt beim Neuladen erhalten, Kaputtes fliegt raus
  const v8 = migrate({ ...v7, haunebuUntil: 777, stats: { haunebuSummons: 3 }, questLog: { keller: { best: 1, done: true } } });
  assert.equal(v8.haunebuUntil, 777);
  assert.equal(v8.stats.haunebuSummons, 3);
  assert.deepEqual(v8.questLog, { keller: { best: 1, done: true } });
  for (const bad of ['x', null, NaN, Infinity]) assert.equal(migrate({ ...v7, haunebuUntil: bad }).haunebuUntil, 0);
  for (const bad of ['x', [], null, 3]) assert.deepEqual(migrate({ ...v7, questLog: bad }).questLog, {});
  const fresh = emptySaveV3();
  assert.equal(fresh.haunebuUntil, 0);
  assert.equal(fresh.stats.haunebuSummons, 0);
  assert.deepEqual(fresh.questLog, {});
  assert.equal('flugscheibe' in fresh, false);
});

// ---------- §2 Engine: eigene Kampfdauer ----------
test('v8: makeBoss übernimmt duration, createBattle nutzt sie, sonst BATTLE_DURATION', () => {
  const t = makeBoss(BOSSES.tachionen, 3);
  assert.equal(t.duration, BOSSES.tachionen.duration);
  const team = [makeFighter(RUETHER_BY_ID.christian)];
  assert.equal(createBattle({ team, enemy: t }).duration, BOSSES.tachionen.duration);
  assert.equal(createBattle({ team, enemy: t, duration: 5000 }).duration, 5000);
  assert.equal(createBattle({ team, enemy: t, duration: undefined }).duration, BOSSES.tachionen.duration, 'battle-ui übergibt undefined');
  assert.equal(createBattle({ team, enemy: makeBoss(BOSSES.hitler, 1) }).duration, CONST.BATTLE_DURATION);
});

test('v8: Wut beschleunigt schnelle Angriffe, macht sie nie langsamer', () => {
  const def = { ...BOSSES.tachionen, fast: { ...BOSSES.tachionen.fast, every: 1000 } };
  const s = createBattle({ team: [makeFighter(RUETHER_BY_ID.christian)], enemy: makeBoss(def, 1) });
  s.team[0].btc = s.team[0].maxBtc = 1e6;
  s.enemy.btc = Math.floor(s.enemy.maxBtc / 2);
  tick(s, 50);
  assert.equal(s.enemy.rage, true);
  assert.equal(s.enemy.fastEvery, 1000);
});

// ---------- §3 Lockmodul-Welle: v9 macht sie additiv, Tests in test/v9.test.mjs ----------

// ---------- §5 Quests: Freischaltung, Belohnung, Log ----------
test('v8: questsUnlocked braucht alle fünf Arenen gemeistert', () => {
  assert.equal(ARENAS.length, 5);
  const s = emptySaveV3();
  for (const a of ARENAS.slice(0, 4)) s.arenaMastered[a.id] = true;
  assert.equal(questsUnlocked(s), false);
  s.arenaMastered.neuschwabenland = true;
  assert.equal(questsUnlocked(s), true);
});

test('v8: questResult Raub: 300 je Münze + 1000 Abschluss, Bestwert', () => {
  const s = emptySaveV3();
  assert.deepEqual(questResult(s, 'tachionenraub', 'success', 5), { sats: 2500, xp: CONST.QUEST_XP, best: 5, newBest: true, firstDone: true, fine: 0 });
  assert.equal(s.sats, 2500);
  assert.deepEqual(s.questLog.tachionenraub, { best: 5, done: true, wins: 1, kieser: 0, fines: 0, clean: false });
  assert.deepEqual(questResult(s, 'tachionenraub', 'success', 3), { sats: 1900, xp: CONST.QUEST_XP, best: 5, newBest: false, firstDone: false, fine: 0 });
  assert.deepEqual(s.questLog.tachionenraub, { best: 5, done: true, wins: 2, kieser: 0, fines: 0, clean: false });
  // Misserfolg: 10 % der Münz-Sats, kein Abschluss
  const f = emptySaveV3();
  assert.deepEqual(questResult(f, 'tachionenraub', 'fail', 2), { sats: 60, xp: CONST.QUEST_XP / 10, best: 2, newBest: true, firstDone: false, fine: 0 });
  assert.deepEqual(f.questLog.tachionenraub, { best: 2, done: false, wins: 0, kieser: 0, fines: 0, clean: false });
  assert.equal(questResult(f, 'tachionenraub', 'abort', 0).sats, 0);
  assert.deepEqual(f.questLog.tachionenraub, { best: 2, done: false, wins: 0, kieser: 0, fines: 0, clean: false });
});

test('v8: questResult Sabotage, PS3, Keller (+1000 ohne Alarm), Misserfolg 10 %', () => {
  const s = emptySaveV3();
  assert.equal(questResult(s, 'hangar', 'success', 4).sats, 2500);
  assert.equal(questResult(s, 'ps3', 'success', 1).sats, 2500);
  assert.equal(questResult(s, 'keller', 'success', 1, false).sats, 2000);
  assert.equal(questResult(s, 'keller', 'success', 1, true).sats, 3000);
  assert.equal(s.sats, 10_000);
  assert.equal(questResult(s, 'hangar', 'fail', 2).sats, 250);
  assert.equal(questResult(s, 'keller', 'abort', 1, true).sats, 200);
  assert.deepEqual([questResult(s, 'keller', 'abort', 0, true).sats, questResult(s, 'hangar', 'fail', 0).xp], [0, 0], 'ohne Fortschritt kein Trost');
  assert.equal(s.questLog.hangar.done, true, 'Misserfolg nimmt den Abschluss nicht weg');
  assert.equal(questResult(s, 'mond', 'success', 9), null);
  assert.equal(s.questLog.mond, undefined);
  assert.equal(questResult(emptySaveV3(), 'ps3', 'fail', -3).best, 0);
  assert.deepEqual(Object.keys(QUEST_SATS).sort(), ['bruch', 'camping', 'hangar', 'keller', 'ps3', 'tachionenraub']); // v9: + Camping, Bruch
});

test('v8: Erfolge haunebu, tachionen, quest1, quest_all', () => {
  const s = emptySaveV3();
  assert.deepEqual(checkAchievements(s), []);
  haunebuWin(s, 0);
  s.arenaLevels.neuschwabenland = 1;
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['haunebu']);
  s.arenaLevels.neuschwabenland = 2;
  questResult(s, 'hangar', 'fail', 1);
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['tachionen']);
  questResult(s, 'hangar', 'success', 4);
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['quest1']);
  for (const id of ['tachionenraub', 'ps3']) questResult(s, id, 'success', 3);
  assert.deepEqual(checkAchievements(s), []);
  questResult(s, 'keller', 'success', 1);
  assert.deepEqual(checkAchievements(s), [], 'v9: quest_all braucht auch Camping und Bruch');
  questResult(s, 'camping', 'success', 3);
  questResult(s, 'bruch', 'success', 3);
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['quest_all']);
  // gemeisterte Arena zählt weiter (Level bleibt 5)
  const m = emptySaveV3();
  m.arenaLevels.neuschwabenland = 5; m.arenaMastered.neuschwabenland = true;
  assert.ok(checkAchievements(m).some(a => a.id === 'tachionen'));
});

// ---------- §2 Balance: Tachionenbitcoin mit der echten Engine ----------
// Spielermodell: normal = 3 Tipps/s und 50 % der Warnungen ausgewichen, gut = 3,5 Tipps/s und 70 %.
// Spezial-Attacke bei vollem Mining, Teamwechsel bei K.o. macht die Engine. Alle 10 Dreier-Teams aus den
// 5 Rüthern, je SEEDS Kämpfe mit festen Seeds (deterministisch).
const SEEDS = 60;
const TEAMS = [];
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 5; c++) TEAMS.push([a, b, c].map(i => RUETHERS[i].id));
const NORMAL = { taps: 3, dodge: 0.5, name: 'normal' }, GOOD = { taps: 3.5, dodge: 0.7, name: 'gut' };
function bestSpecial(me) {
  let best;
  me.attacks.forEach((a, i) => { if (me.energy >= a.cost && !(a.once && me.used[a.name]) && (best == null || a.cost > me.attacks[best].cost)) best = i; });
  return best;
}
function simBattle(def, arenaLevel, ids, inst, { taps, dodge }, seed) {
  const rng = seededRng(seed), tapMs = 1000 / taps;
  const s = createBattle({ team: ids.map(id => makeFighter(RUETHER_BY_ID[id], { uid: id, ...inst })), enemy: makeBoss(def, arenaLevel), rng });
  let dodgeNext = false, nextTap = tapMs;
  while (!s.over) {
    const me = s.team[s.active], inp = {};
    if (s.time + 50 >= nextTap) inp.taps = 1;
    if (dodgeNext) { inp.dodge = true; dodgeNext = false; }
    if (me.energy >= CONST.MAX_ENERGY) inp.special = bestSpecial(me);
    const ev = tick(s, 50, inp);
    // Takt halten; nach einer Betäubung neu ansetzen statt nachzuholen
    if (ev.some(e => e.type === 'fast')) nextTap = (s.time - nextTap < tapMs ? nextTap : s.time) + tapMs;
    if (ev.some(e => e.type === 'warn')) dodgeNext = rng() < dodge;
  }
  return s.won;
}
function winRate(def, arenaLevel, inst, play) {
  let w = 0;
  for (const ids of TEAMS) for (let i = 1; i <= SEEDS; i++) w += simBattle(def, arenaLevel, ids, inst, play, i * 7919 + 13) ? 1 : 0;
  return w / (TEAMS.length * SEEDS);
}
const T = BOSSES.tachionen;
const R = (rarity, level) => ({ rarity, level });
const checkRates = rows => {
  for (const [lvl, inst, play, min, max] of rows) {
    const r = winRate(T, lvl, inst, play);
    assert.ok(r >= min && r <= max, `Arena-Lv. ${lvl}, ${inst.rarity} Lv. ${inst.level}, ${play.name}: ${r} nicht in [${min}, ${max}]`);
  }
};
// Ergebnis mit SEEDS = 60 (Anteil gewonnener Kämpfe über alle 10 Teams):
//   Lv1 selten12 gut 0,97 · normal 0,62 · Lv2 selten15 gut 0,90 · episch15 normal 0,80 · Lv3 episch16 gut 0,94
//   Lv4 episch18 gut 0,77 · legendär18 normal 0,73 · Lv5 legendär20 gut 0,94 · normal 0,54
//   Hürde: Lv1 normal8 normal 0,02 · Lv5 episch15 normal 0,05 · episch15 gut auf Lv1–5: 1,00 0,99 0,91 0,58 0,44
// checkRates: [Arena-Level, Team, Spiel, Siegquote mindestens, höchstens]

test('Tachionen Balance: auf jedem Arena-Level fair spielbar', () => {
  checkRates([
    [1, R('selten', 12), GOOD, 0.65, 1], [1, R('selten', 12), NORMAL, 0.35, 1],
    [2, R('selten', 15), GOOD, 0.6, 1], [2, R('episch', 15), NORMAL, 0.5, 1],
    [3, R('episch', 16), GOOD, 0.55, 1],
    [4, R('episch', 18), GOOD, 0.55, 1], [4, R('legendaer', 18), NORMAL, 0.45, 1],
    [5, R('legendaer', 20), GOOD, 0.6, 1], [5, R('legendaer', 20), NORMAL, 0.35, 1],
  ]);
});

test('Tachionen Balance: bleibt eine echte Hürde', () => {
  checkRates([[1, R('normal', 8), NORMAL, 0, 0.15], [5, R('episch', 15), NORMAL, 0, 0.2]]);
  // saubere Steigerung: dasselbe Team gewinnt mit jedem Level seltener
  const rates = [1, 2, 3, 4, 5].map(l => winRate(T, l, R('episch', 15), GOOD));
  for (let l = 1; l < 5; l++) assert.ok(rates[l] <= rates[l - 1], `episch Lv. 15, gut: ${rates.join(' ')}`);
  assert.ok(rates[0] - rates[4] >= 0.3, `episch Lv. 15, gut: ${rates.join(' ')}`);
});

test('Tachionen Balance: auf jedem Level mit Abstand der stärkste Arena-Boss', () => {
  // Schaden/s: schneller Angriff + Lade-Attacken im Wechsel (alle CHARGED_EVERY), Gift voll gerechnet
  const fastDps = b => b.fast.damage * 1000 / b.fast.every;
  const dps = b => fastDps(b) + b.charged.reduce((s, c) => s + c.damage + (c.poison ? c.poison.perSec * c.poison.ms / 1000 : 0), 0) / b.charged.length * 1000 / CONST.CHARGED_EVERY;
  const others = ARENAS.map(a => BOSSES[a.boss]).filter(b => b.id !== 'tachionen');
  assert.deepEqual(others.map(b => b.id).sort(), ['heizung', 'ps3', 'satoshi', 'schanze']);
  for (let l = 1; l <= CONST.ARENA_LEVELS; l++) {
    const t = makeBoss(T, l), o = others.map(b => makeBoss(b, l));
    assert.ok(t.maxBtc >= 1.4 * Math.max(...o.map(b => b.maxBtc)), `Lv. ${l}: BTC`);
    assert.ok(fastDps(t) >= 1.2 * Math.max(...o.map(fastDps)), `Lv. ${l}: Schaden/s schneller Angriff`);
    assert.ok(dps(t) >= 1.2 * Math.max(...o.map(dps)), `Lv. ${l}: Schaden/s gesamt`);
  }
});
