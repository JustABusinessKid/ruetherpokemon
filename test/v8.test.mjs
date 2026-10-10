import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySaveV3, migrate, buyItem, summonCost, haunebuWin, haunebuActive, consumeHaunebu, startBeam, activeBeam, endBeam,
  questsUnlocked, questResult, QUEST_SATS,
} from '../js/progress.js';
import { checkAchievements, seededRng } from '../js/quests.js';
import { lureWave } from '../js/spawn.js';
import { distance, offsetPoint } from '../js/geo.js';
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

// ---------- §3 Lockmodul-Welle ----------
// rng mit fester Folge, danach bleibt der letzte Wert (wie spawn.test.mjs)
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const HAGEN = { lat: 51.37, lon: 7.48 }; // weit weg von allen Arenen
const PCSALE = ARENAS.find(a => a.id === 'pcsale');

test('v8: lureWave: alles neu, 4–8 Stück, alle im Lock-Ring um den Spieler', () => {
  const old = { id: 'alt', ruetherId: 'viktor', ...offsetPoint(HAGEN, 30, 0), expires: 9e12, rarity: 'normal' };
  for (const r of [0, 0.37, 0.99]) {
    const list = lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 1000, rng: seq(r, 0.21, 0.73, 0.5), featured: null });
    assert.ok(list.length >= CONST.LURE_SPAWN_MIN && list.length <= CONST.LURE_SPAWN_MAX, `got ${list.length}`);
    assert.ok(!list.some(s => s.id === old.id));
    for (const s of list) {
      const d = distance(HAGEN, s);
      assert.ok(d >= CONST.LURE_RING[0] - 1 && d <= CONST.LURE_RING[1] + 1, `got ${d}`);
      assert.ok(d <= CONST.CATCH_RANGE, 'in Fangreichweite');
      assert.equal(s.expires, 1000 + CONST.SPAWN_LIFETIME);
      assert.ok(['christian', 'viktor'].includes(s.ruetherId), 'ortsgebundene nur in ihrer Zone');
      assert.ok(s.rarity);
    }
  }
  assert.equal(lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0) }).length, CONST.LURE_SPAWN_MIN);
  assert.equal(lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0.999) }).length, CONST.LURE_SPAWN_MAX);
});

test('v8: lureWave verteilt die Welle: eigene Winkel-Sektoren, zwei Ringe, Mindestabstand, nicht auf dem Spieler', () => {
  const M = 111320, cosLat = Math.cos((HAGEN.lat * Math.PI) / 180);
  for (let i = 0; i < 200; i++) {
    const list = lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: i, rng: seededRng(i + 7) });
    const n = list.length;
    for (const s of list) assert.ok(distance(HAGEN, s) >= 44, 'innen bleibt der Spieler-Punkt frei');
    // Mindestabstand: 44 m ≈ 59 px bei Zoom 17 (map.setLure), die 48-px-Gesichter decken sich nicht
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) assert.ok(distance(list[a], list[b]) >= 44, `zu eng: ${distance(list[a], list[b])}`);
    const ang = list.map(s => Math.atan2((s.lon - HAGEN.lon) * M * cosLat, (s.lat - HAGEN.lat) * M)).sort((a, b) => a - b);
    const gaps = ang.map((a, k) => (k ? a - ang[k - 1] : a + 2 * Math.PI - ang[n - 1]));
    assert.ok(Math.min(...gaps) >= (0.4 / n) * 2 * Math.PI - 1e-6, `Klumpen: ${Math.min(...gaps)}`);
  }
});

test('v8: lureWave behält den offenen Spawn, ohne Position nur ihn', () => {
  const keep = { id: 'offen', ruetherId: 'viktor', ...offsetPoint(HAGEN, 400, 0), expires: 5, rarity: 'episch' };
  const list = lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 1000, rng: seq(0.5, 0.2), keep });
  assert.equal(list[0], keep);
  assert.equal(list.filter(s => s.id === 'offen').length, 1);
  assert.ok(list.length - 1 >= CONST.LURE_SPAWN_MIN);
  assert.deepEqual(lureWave({ player: null, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0.5), keep }), [keep]);
  assert.deepEqual(lureWave({ player: null, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0.5) }), []);
});

test('v8: lureWave: am PC Sale kann Micha kommen, Rüther des Tages häufiger', () => {
  const near = offsetPoint(PCSALE, 100, 0);
  const ids = new Set();
  for (let i = 0; i < 40; i++) {
    for (const s of lureWave({ player: near, ruethers: RUETHERS, arenas: ARENAS, now: i, rng: seededRng(i + 1) })) {
      ids.add(s.ruetherId);
      assert.ok(distance(near, s) <= CONST.LURE_RING[1] + 1, 'auch Micha direkt beim Spieler');
    }
  }
  assert.deepEqual([...ids].sort(), ['christian', 'micha', 'viktor']);
  const feat = lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0, 0.3), featured: 'viktor' });
  assert.ok(feat.every(s => s.ruetherId === 'viktor'));
});

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
  assert.deepEqual(questResult(s, 'tachionenraub', 'success', 5), { sats: 2500, xp: CONST.QUEST_XP, best: 5, newBest: true, firstDone: true });
  assert.equal(s.sats, 2500);
  assert.deepEqual(s.questLog.tachionenraub, { best: 5, done: true });
  assert.deepEqual(questResult(s, 'tachionenraub', 'success', 3), { sats: 1900, xp: CONST.QUEST_XP, best: 5, newBest: false, firstDone: false });
  assert.deepEqual(s.questLog.tachionenraub, { best: 5, done: true });
  // Misserfolg: 10 % der Münz-Sats, kein Abschluss
  const f = emptySaveV3();
  assert.deepEqual(questResult(f, 'tachionenraub', 'fail', 2), { sats: 60, xp: CONST.QUEST_XP / 10, best: 2, newBest: true, firstDone: false });
  assert.deepEqual(f.questLog.tachionenraub, { best: 2, done: false });
  assert.equal(questResult(f, 'tachionenraub', 'abort', 0).sats, 0);
  assert.deepEqual(f.questLog.tachionenraub, { best: 2, done: false });
});

test('v8: questResult Sabotage, PS3, Keller (+1000 ohne Alarm), Misserfolg 10 %', () => {
  const s = emptySaveV3();
  assert.equal(questResult(s, 'hangar', 'success', 4).sats, 2500);
  assert.equal(questResult(s, 'ps3', 'success', 1).sats, 2500);
  assert.equal(questResult(s, 'keller', 'success', 1, false).sats, 2000);
  assert.equal(questResult(s, 'keller', 'success', 1, true).sats, 3000);
  assert.equal(s.sats, 10_000);
  assert.equal(questResult(s, 'hangar', 'fail', 2).sats, 250);
  assert.equal(questResult(s, 'keller', 'abort', 0, true).sats, 200);
  assert.equal(s.questLog.hangar.done, true, 'Misserfolg nimmt den Abschluss nicht weg');
  assert.equal(questResult(s, 'mond', 'success', 9), null);
  assert.equal(s.questLog.mond, undefined);
  assert.equal(questResult(emptySaveV3(), 'ps3', 'fail', -3).best, 0);
  assert.deepEqual(Object.keys(QUEST_SATS).sort(), ['hangar', 'keller', 'ps3', 'tachionenraub']);
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
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['quest_all']);
  // gemeisterte Arena zählt weiter (Level bleibt 5)
  const m = emptySaveV3();
  m.arenaLevels.neuschwabenland = 5; m.arenaMastered.neuschwabenland = true;
  assert.ok(checkAchievements(m).some(a => a.id === 'tachionen'));
});

// ---------- §2 Balance: Tachionenbitcoin mit der echten Engine ----------
// Gutes Spiel: 4 Tipps/s (Abklingzeit), 70 % der Warnungen ausgewichen, Spezial-Attacke bei vollem Mining,
// Teamwechsel bei K.o. macht die Engine. Alle 10 Dreier-Teams aus den 5 Rüthern, je SEEDS Kämpfe.
const SEEDS = 6;
const TEAMS = [];
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 5; c++) TEAMS.push([a, b, c].map(i => RUETHERS[i].id));
function bestSpecial(me) {
  let best;
  me.attacks.forEach((a, i) => { if (me.energy >= a.cost && !(a.once && me.used[a.name]) && (best == null || a.cost > me.attacks[best].cost)) best = i; });
  return best;
}
function simBattle(def, arenaLevel, ids, inst, { dodge = 0.7, tapMs = 250, seed = 1 } = {}) {
  const rng = seededRng(seed);
  const s = createBattle({ team: ids.map(id => makeFighter(RUETHER_BY_ID[id], { uid: id, ...inst })), enemy: makeBoss(def, arenaLevel), rng });
  let dodgeNext = false, nextTap = 0;
  while (!s.over) {
    const me = s.team[s.active], inp = {};
    if (s.time >= nextTap) inp.taps = 1;
    if (dodgeNext) { inp.dodge = true; dodgeNext = false; }
    if (me.energy >= CONST.MAX_ENERGY) inp.special = bestSpecial(me);
    const ev = tick(s, 50, inp);
    if (ev.some(e => e.type === 'fast')) nextTap = s.time + tapMs - 50;
    if (ev.some(e => e.type === 'warn')) dodgeNext = rng() < dodge;
  }
  return s.won;
}
function winRate(def, arenaLevel, inst, opts) {
  let w = 0;
  for (const ids of TEAMS) for (let i = 1; i <= SEEDS; i++) w += simBattle(def, arenaLevel, ids, inst, { ...opts, seed: i * 7919 + 13 }) ? 1 : 0;
  return w / (TEAMS.length * SEEDS);
}
const T = BOSSES.tachionen;
const SEL15 = { rarity: 'selten', level: 15 }, EPI15 = { rarity: 'episch', level: 15 }, LEG20 = { rarity: 'legendaer', level: 20 }, NOR10 = { rarity: 'normal', level: 10 };
// Ergebnis der Simulation (Anteil gewonnener Kämpfe über alle 10 Teams; 6 bzw. 30 Seeds je Team):
//   selten Lv15 auf Lv1 0,63/0,74 · episch Lv15 auf Lv1 0,97/0,97 · legendär Lv20 auf Lv5 0,57/0,52,
//   dabei mit 40 % Ausweichen 0,07/0,09, mit 2,5 statt 4 Tipps/s 0,00/0,13 · normal Lv10 auf Lv5 0/0.
//   Gewinner auf Lv5 sind Teams mit Micha (Wallet-Drain heilt), ohne ihn reicht es nicht.

test('v8 Balance: Lv. 1 mit drei Lv.-15-Rüthern (selten/episch) und gutem Ausweichen gewinnbar', () => {
  const selten = winRate(T, 1, SEL15), episch = winRate(T, 1, EPI15);
  assert.ok(selten >= 0.5, `selten ${selten}`);
  assert.ok(episch >= 0.9, `episch ${episch}`);
});

test('v8 Balance: Lv. 5 mit drei Lv.-20-Legendären nur mit sehr gutem Spiel', () => {
  const good = winRate(T, 5, LEG20);
  assert.ok(good >= 0.4 && good <= 0.8, `gutes Spiel ${good}`);
  const dodge = winRate(T, 5, LEG20, { dodge: 0.4 }), slow = winRate(T, 5, LEG20, { tapMs: 400 });
  assert.ok(dodge <= 0.2, `40 % Ausweichen ${dodge}`);
  assert.ok(slow <= 0.2, `2,5 Tipps/s ${slow}`);
});

test('v8 Balance: Lv. 5 mit drei Lv.-10-Normalen nicht gewinnbar', () => {
  assert.equal(winRate(T, 5, NOR10), 0);
});

test('v8 Balance: mit Abstand der stärkste Boss', () => {
  const others = Object.values(BOSSES).filter(b => b.id !== 'tachionen');
  for (const b of others) {
    assert.ok(makeBoss(T, 1).maxBtc > 1.5 * makeBoss(b, 5).maxBtc, `${b.id}: BTC`);
    assert.ok(T.fast.damage / T.fast.every > makeBoss(b, 5).fast.damage / b.fast.every, `${b.id}: Schaden/s der schnellen Angriffe`);
    // Teams, die jeden anderen Boss auf Lv. 5 schlagen, tun sich schon mit dem Tachionenbitcoin auf Lv. 1 bzw. 2 schwer
    assert.ok(winRate(b, 5, SEL15) >= 0.9, `${b.id} Lv. 5 selten`);
    assert.ok(winRate(b, 5, NOR10) >= 0.8, `${b.id} Lv. 5 normal`);
  }
  assert.ok(winRate(T, 1, SEL15) < 0.9, 'Tachionen Lv. 1 selten');
  assert.ok(winRate(T, 2, NOR10) <= 0.2, 'Tachionen Lv. 2 normal');
});
