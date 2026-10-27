// v13: Moshe spielbar, Fundament (Spec v13 §1, §2, §6, §7): Daten, Freischaltung, Pseudo-Exemplar, Erfolg, Kaufsperre, Migration,
// Wortfilter. Die Wirkungen (engine.js), Team/Start/Sammlung (screens.js, app.js) und die Videos testen ihre eigenen Bausteine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CONST, QUEST_UNITS, RUETHERS, RUETHER_BY_ID, ACHIEVEMENTS, portraitOf } from '../js/data.js';
import { emptySaveV3, migrate, questResult, MOSHE_WINS, mosheUnlocked, mosheInst, abilityLevel, buyAbility, upgradeAbility, equipAbility, loadoutFor, fighterStats } from '../js/progress.js';
import { checkAchievements, seededRng } from '../js/quests.js';
import { ABILITIES, FIXED, POOLS, params } from '../js/quest/abilities.js';
import { makeFighter } from '../js/battle.js';
import { createQuest, abilitiesFor, tick, visibleCone, tileAt } from '../js/quest/engine.js';
import { pickVideo, videoSrc, VIDEO_COUNT, SKIP_MS, SAFETY_MS } from '../js/quest/video.js';

const withWins = (wins, sats = 1e6) => Object.assign(emptySaveV3(), { sats, questLog: { rabino: { best: 3, done: wins > 0, wins } } });

// ---------- §1, §6 Daten ----------
test('v13 §1: QUEST_UNITS.moshe nicht in RUETHERS; portraitOf kennt Rüther und Moshe, sonst null; Erfolg moshe_spielbar', () => {
  assert.deepEqual(QUEST_UNITS.moshe, { id: 'moshe', name: 'Moshe Hillel', title: 'Rabino Empire', btc: 100, attacks: [] });
  assert.equal(RUETHER_BY_ID.moshe, undefined);
  assert.ok(!RUETHERS.some(r => r.id === 'moshe'));
  assert.equal(RUETHERS.length, 5, 'Dex, Spawns, Onboarding und all_five bleiben bei fünf');
  for (const r of RUETHERS) assert.equal(portraitOf(r.id), `sprites/${r.id}.png`);
  assert.equal(portraitOf('moshe'), 'sprites/moshe.png');
  for (const x of ['hitler', 'unknown', '', null, undefined, 'constructor']) assert.equal(portraitOf(x), null, String(x));
  const a = ACHIEVEMENTS.find(x => x.id === 'moshe_spielbar');
  assert.deepEqual(a, { id: 'moshe_spielbar', name: 'Mitarbeiter des Monats', desc: 'Räume Rabino Empire HQ dreimal aus, dann arbeitet Moshe für dich.', icon: 'star' });
  assert.equal(ACHIEVEMENTS.filter(x => x.id === 'moshe_spielbar').length, 1);
});

// ---------- §2 Fähigkeiten (nur Daten) ----------
test('v13 §2: fünf Fähigkeiten mit unit moshe, Ids, Zahlen und Texte wie in der Spec', () => {
  assert.deepEqual(FIXED.moshe, ['buch', 'neuesvideo']);
  assert.deepEqual(POOLS.moshe, ['schlange', 'zinseszins', 'geschenk']);
  assert.equal(Object.keys(ABILITIES).length, 30);
  assert.equal(ABILITIES.video, undefined, "'video' ist der Fangszenen-Event");
  const names = { buch: 'Der Investment-Code', neuesvideo: 'Sein neues Video', schlange: '12 Personen bestellen gerade', zinseszins: 'Der Zinseszins', geschenk: 'Premium-Geschenk: Immobilien' };
  for (const [id, name] of Object.entries(names)) {
    const a = ABILITIES[id];
    assert.equal(a.unit, 'moshe', id);
    assert.equal(a.name, name);
    assert.equal(a.icon, `art/ab-${id}.png`);
    assert.equal(a.kind, FIXED.moshe.includes(id) ? 'fixed' : 'pool');
    assert.equal(a.stages.length, 3);
    assert.equal(a.texts.length, 3);
    for (const t of a.texts) assert.ok(t.length > 10 && !/\p{Extended_Pictographic}/u.test(t), `${id}: ${t}`);
    assert.ok(!RUETHERS.some(r => FIXED[r.id].includes(id) || POOLS[r.id].includes(id)), `${id} gehört nur Moshe`);
  }
  const p = (id, l) => params(id, l);
  assert.deepEqual(p('buch', 1), { target: 'enemy', range: 2, ms: 8000, cd: 20_000, special: 0.5 });
  assert.equal(p('buch', 2).ms, 12_000);
  assert.deepEqual([p('buch', 3).ms, p('buch', 3).spread], [12_000, 2]);
  assert.deepEqual(p('neuesvideo', 1), { target: 'self', r: 6, ms: 10_000, cd: 30_000, special: 0.5 });
  assert.deepEqual([p('neuesvideo', 2).ms, p('neuesvideo', 2).r, p('neuesvideo', 2).finger], [14_000, 7, undefined]);
  assert.deepEqual([p('neuesvideo', 3).ms, p('neuesvideo', 3).r, p('neuesvideo', 3).finger], [14_000, 7, 5000]);
  assert.deepEqual(p('schlange', 1), { target: 'point', range: 6, r: 6, ms: 10_000, cd: 30_000, special: 0.5 });
  assert.deepEqual([p('schlange', 2).ms, p('schlange', 2).block], [14_000, undefined]);
  assert.deepEqual([p('schlange', 3).ms, p('schlange', 3).block], [14_000, 8000]);
  assert.deepEqual(p('zinseszins', 1), { target: 'self', ms: 20_000, times: 1, cd: 40_000 });
  assert.deepEqual([p('zinseszins', 2).ms, p('zinseszins', 2).times], [15_000, 1]);
  assert.deepEqual([p('zinseszins', 3).ms, p('zinseszins', 3).times], [15_000, 2]);
  assert.deepEqual(p('geschenk', 1), { target: 'enemy', range: 6, ms: 20_000, cd: 30_000, special: 0.5 });
  assert.deepEqual([p('geschenk', 2).ms, p('geschenk', 2).family], [30_000, undefined]);
  assert.deepEqual([p('geschenk', 3).ms, p('geschenk', 3).family], [30_000, 3]);
  // Texte nennen die Zahlen der Stufe
  assert.match(ABILITIES.buch.texts[0], /2 Kacheln.*8 s.*Abklingzeit 20 s/);
  assert.match(ABILITIES.neuesvideo.texts[0], /6 Kacheln.*10 s.*Abklingzeit 30 s/);
  assert.match(ABILITIES.schlange.texts[2], /8 s/);
  assert.match(ABILITIES.zinseszins.texts[0], /achte Weltwunder.*20 s.*Abklingzeit 40 s/);
  assert.match(ABILITIES.geschenk.texts[0], /Limassol.*20 s.*Abklingzeit 30 s/);
});

// ---------- §1 Freischaltung, Pseudo-Exemplar ----------
test('v13 §1: mosheUnlocked ab 3 Siegen; fail/abort zählen nicht; Unsinn im questLog wirft nicht', () => {
  assert.equal(MOSHE_WINS, 3);
  const s = emptySaveV3();
  assert.equal(mosheUnlocked(s), false);
  questResult(s, 'rabino', 'success', 3);
  questResult(s, 'rabino', 'success', 3);
  assert.equal(s.questLog.rabino.wins, 2);
  assert.equal(mosheUnlocked(s), false);
  questResult(s, 'rabino', 'fail', 2);
  questResult(s, 'rabino', 'abort', 1);
  assert.equal(s.questLog.rabino.wins, 2, 'Misserfolg und Aufgeben zählen nicht');
  assert.equal(mosheUnlocked(s), false);
  questResult(s, 'rabino', 'success', 3);
  assert.equal(mosheUnlocked(s), true);
  questResult(s, 'tachionenraub', 'success', 3);
  assert.equal(mosheUnlocked(withWins(0)), false);
  assert.equal(mosheUnlocked(withWins(2)), false);
  assert.equal(mosheUnlocked(withWins(3)), true);
  assert.equal(mosheUnlocked(withWins(99)), true);
  assert.equal(mosheUnlocked({ questLog: { tachionenraub: { wins: 9 } } }), false, 'nur Rabino Empire HQ');
  for (const bad of [null, undefined, 'x', 7, [], { rabino: null }, { rabino: 'x' }, { rabino: { wins: 'drei' } }, { rabino: { wins: -5 } }, { rabino: { wins: NaN } }, { rabino: { wins: Infinity } }, { rabino: { done: true } }]) {
    assert.equal(mosheUnlocked({ questLog: bad }), false, JSON.stringify(bad));
    assert.deepEqual(mosheInst({ questLog: bad }), { uid: 'moshe', id: 'moshe', rarity: 'normal', level: 1 }, JSON.stringify(bad));
  }
  assert.equal(mosheUnlocked({}), false);
  assert.equal(mosheUnlocked(null), false);
  assert.equal(mosheUnlocked({ questLog: { rabino: { wins: '3' } } }), true, 'Zahl als String zählt');
  assert.equal(mosheUnlocked({ questLog: { rabino: { wins: 3.9 } } }), true);
  assert.equal(mosheUnlocked({ questLog: { rabino: { wins: 2.9 } } }), false, 'abgerundet');
});

test('v13 §1: mosheInst: Level = Siege (1…20), Seltenheit ab 6/10/15, immer uid und id moshe; makeFighter skaliert damit', () => {
  const inst = w => mosheInst(withWins(w));
  assert.deepEqual(inst(0), { uid: 'moshe', id: 'moshe', rarity: 'normal', level: 1 });
  assert.deepEqual(inst(1), { uid: 'moshe', id: 'moshe', rarity: 'normal', level: 1 });
  assert.deepEqual(inst(3), { uid: 'moshe', id: 'moshe', rarity: 'normal', level: 3 });
  assert.deepEqual(inst(5), { uid: 'moshe', id: 'moshe', rarity: 'normal', level: 5 });
  assert.deepEqual(inst(6), { uid: 'moshe', id: 'moshe', rarity: 'selten', level: 6 });
  assert.deepEqual(inst(9), { uid: 'moshe', id: 'moshe', rarity: 'selten', level: 9 });
  assert.deepEqual(inst(10), { uid: 'moshe', id: 'moshe', rarity: 'episch', level: 10 });
  assert.deepEqual(inst(14), { uid: 'moshe', id: 'moshe', rarity: 'episch', level: 14 });
  assert.deepEqual(inst(15), { uid: 'moshe', id: 'moshe', rarity: 'legendaer', level: 15 });
  assert.deepEqual(inst(20), { uid: 'moshe', id: 'moshe', rarity: 'legendaer', level: 20 });
  assert.deepEqual(inst(21), { uid: 'moshe', id: 'moshe', rarity: 'legendaer', level: CONST.LEVEL_MAX }, 'gedeckelt');
  assert.deepEqual(inst(1000), { uid: 'moshe', id: 'moshe', rarity: 'legendaer', level: 20 });
  const f1 = makeFighter(QUEST_UNITS.moshe, inst(1)), f20 = makeFighter(QUEST_UNITS.moshe, inst(20));
  assert.deepEqual([f1.id, f1.uid, f1.name, f1.rarity, f1.level, f1.btc, f1.maxBtc, f1.power], ['moshe', 'moshe', 'Moshe Hillel', 'normal', 1, 100, 100, 1]);
  assert.deepEqual([f20.id, f20.rarity, f20.level, f20.btc], ['moshe', 'legendaer', 20, fighterStats(QUEST_UNITS.moshe, inst(20)).btc]);
  assert.ok(f20.btc > f1.btc);
  assert.deepEqual(f1.attacks, []);
});

// ---------- §6 Erfolg ----------
test('v13 §6: Erfolg „Mitarbeiter des Monats“ genau einmal, +ACHIEVEMENT_SATS; vorher nicht', () => {
  const s = withWins(2, 0);
  assert.ok(!checkAchievements(s).some(a => a.id === 'moshe_spielbar'));
  assert.equal(s.achievements.moshe_spielbar, undefined);
  s.questLog.rabino.wins = 3;
  const before = s.sats;
  const fresh = checkAchievements(s, 77);
  assert.deepEqual(fresh.filter(a => a.id === 'moshe_spielbar').map(a => a.name), ['Mitarbeiter des Monats']);
  assert.equal(s.achievements.moshe_spielbar, 77);
  assert.equal(s.sats - before, CONST.ACHIEVEMENT_SATS * fresh.length);
  assert.deepEqual(checkAchievements(s), [], 'einmal reicht');
  // wer beim Update schon 3 Siege hat, bekommt ihn beim ersten Prüfen
  const old = migrate({ version: 3, box: [], team: [], questLog: { rabino: { best: 3, done: true, wins: 5 } }, achievements: { quest1: 1 } });
  assert.ok(checkAchievements(old).some(a => a.id === 'moshe_spielbar'));
});

// ---------- §1 Kaufsperre ----------
test('v13 §1: buyAbility/upgradeAbility für moshe vor der Freischaltung „gesperrt“, danach wie bei den Rüthern', () => {
  const s = withWins(2);
  assert.deepEqual(buyAbility(s, 'moshe', 'schlange'), { ok: false, reason: 'gesperrt' });
  assert.deepEqual(buyAbility(s, 'moshe', 'zinseszins'), { ok: false, reason: 'gesperrt' });
  assert.deepEqual(buyAbility(s, 'moshe', 'buch'), { ok: false, reason: 'gesperrt' }, 'Sperre vor allen anderen Gründen');
  assert.deepEqual(upgradeAbility(s, 'moshe', 'buch'), { ok: false, reason: 'gesperrt' });
  assert.deepEqual(upgradeAbility(s, 'moshe', 'schlange'), { ok: false, reason: 'gesperrt' });
  assert.equal(s.sats, 1e6);
  assert.deepEqual(s.questAbilities.moshe, { levels: {}, slot: null });
  assert.equal(abilityLevel(s, 'moshe', 'buch'), 1, 'feste Stufe 1 auch gesperrt (nur Anzeige)');
  assert.deepEqual(loadoutFor(s, 'moshe'), [{ id: 'buch', level: 1 }, { id: 'neuesvideo', level: 1 }, null]);
  assert.deepEqual(buyAbility(s, 'christian', 'vp'), { ok: true, cost: CONST.ABILITY_BUY, level: 1 }, 'Rüther bleiben frei');
  s.questLog.rabino.wins = 3;
  assert.deepEqual(buyAbility(s, 'moshe', 'buch'), { ok: false, reason: 'pool' });
  assert.deepEqual(buyAbility(s, 'moshe', 'vp'), { ok: false, reason: 'pool' });
  assert.deepEqual(buyAbility(s, 'moshe', 'schlange'), { ok: true, cost: CONST.ABILITY_BUY, level: 1 });
  assert.equal(s.questAbilities.moshe.slot, 'schlange');
  assert.deepEqual(buyAbility(s, 'moshe', 'schlange'), { ok: false, reason: 'besitz' });
  assert.deepEqual(upgradeAbility(s, 'moshe', 'buch'), { ok: true, cost: CONST.ABILITY_UP[2], level: 2 });
  assert.deepEqual(upgradeAbility(s, 'moshe', 'schlange'), { ok: true, cost: CONST.ABILITY_UP[2], level: 2 });
  assert.deepEqual(upgradeAbility(s, 'moshe', 'schlange'), { ok: true, cost: CONST.ABILITY_UP[3], level: 3 });
  assert.deepEqual(upgradeAbility(s, 'moshe', 'schlange'), { ok: false, reason: 'max' });
  assert.deepEqual(upgradeAbility(s, 'moshe', 'geschenk'), { ok: false, reason: 'fehlt' });
  assert.deepEqual(loadoutFor(s, 'moshe'), [{ id: 'buch', level: 2 }, { id: 'neuesvideo', level: 1 }, { id: 'schlange', level: 3 }]);
  assert.equal(buyAbility(s, 'moshe', 'geschenk').ok, true);
  assert.deepEqual(equipAbility(s, 'moshe', 'geschenk'), { ok: true });
  assert.deepEqual(loadoutFor(s, 'moshe')[2], { id: 'geschenk', level: 1 });
  assert.deepEqual(equipAbility(s, 'moshe', 'buch'), { ok: false, reason: 'pool' });
  assert.equal(s.sats, 1e6 - 1000 - 1000 - 2000 - 2000 - 3000 - 1000);
  // alles für Moshe kostet wie bei einem Rüther 28.000
  const t = withWins(3, 28_000);
  for (const aid of POOLS.moshe) assert.equal(buyAbility(t, 'moshe', aid).ok, true);
  for (const aid of [...FIXED.moshe, ...POOLS.moshe]) { assert.equal(upgradeAbility(t, 'moshe', aid).ok, true); assert.equal(upgradeAbility(t, 'moshe', aid).ok, true); }
  assert.equal(t.sats, 0);
});

// ---------- Migration ----------
test('v13: Migration: questAbilities.moshe wie bei den Rüthern, idempotent; uid moshe im Team überlebt nur freigeschaltet', () => {
  assert.deepEqual(emptySaveV3().questAbilities.moshe, { levels: {}, slot: null });
  const base = { version: 3, box: [{ uid: 'r1', id: 'christian', rarity: 'normal', level: 1 }], nextUid: 2, sats: 5, stats: {} };
  const m = migrate({ ...base, questAbilities: { moshe: { levels: { buch: 3, schlange: 2, geschenk: 1, vp: 2, video: 1, zinseszins: 4 }, slot: 'schlange' } } });
  assert.deepEqual(m.questAbilities.moshe, { levels: { buch: 3, schlange: 2, geschenk: 1 }, slot: 'schlange' });
  assert.deepEqual(loadoutFor(m, 'moshe'), [{ id: 'buch', level: 3 }, { id: 'neuesvideo', level: 1 }, { id: 'schlange', level: 2 }]);
  assert.deepEqual(migrate({ ...base, questAbilities: { moshe: { levels: { buch: 1 }, slot: 'buch' } } }).questAbilities.moshe, { levels: { buch: 1 }, slot: null }, 'feste nicht im Slot');
  assert.deepEqual(migrate({ ...base, questAbilities: { moshe: 'kaputt' } }).questAbilities.moshe, { levels: {}, slot: null });
  assert.deepEqual(migrate(structuredClone(m)), m, 'Neuladen ändert nichts');
  // Team: Moshe steht nicht in der Box und bleibt trotzdem drin, sobald er frei ist
  const locked = migrate({ ...base, team: ['r1', 'moshe', 'r9'], questLog: { rabino: { wins: 2 } } });
  assert.deepEqual(locked.team, ['r1']);
  const free = migrate({ ...base, team: ['moshe', 'r1', 'r9', 'moshe'], questLog: { rabino: { best: 3, done: true, wins: 3 } } });
  assert.deepEqual(free.team, ['moshe', 'r1']);
  assert.deepEqual(migrate(structuredClone(free)).team, ['moshe', 'r1']);
  assert.deepEqual(free.box.map(i => i.uid), ['r1'], 'Moshe landet nicht in der Box');
  assert.equal(migrate({ ...base, team: ['moshe', 'r1', 'r1', 'r1', 'r1'], questLog: { rabino: { wins: 3 } } }).team.length, 2);
  assert.equal(migrate({ ...base, team: ['moshe'], questLog: 'x' }).team.length, 0, 'kaputter questLog sperrt');
});

// ---------- createQuest mit Moshe (Daten reichen der Engine) ----------
test('v13 §1: createQuest mit makeFighter(QUEST_UNITS.moshe, mosheInst) liefert eine Einheit moshe mit 3 Fähigkeiten', () => {
  const s = withWins(7);
  buyAbility(s, 'moshe', 'zinseszins');
  upgradeAbility(s, 'moshe', 'buch');
  const f = Object.assign(makeFighter(QUEST_UNITS.moshe, mosheInst(s)), { loadout: loadoutFor(s, 'moshe') });
  const st = createQuest({ mission: 'tachionenraub', team: [makeFighter(RUETHER_BY_ID.christian), f], rng: seededRng(1) });
  const u = st.units.find(x => x.id === 'moshe');
  assert.ok(u);
  assert.deepEqual([u.name, u.rarity, u.level], ['Moshe Hillel', 'selten', 7]);
  assert.deepEqual(u.abilities, [{ id: 'buch', level: 2 }, { id: 'neuesvideo', level: 1 }, { id: 'zinseszins', level: 1 }]);
  const list = abilitiesFor(u);
  assert.deepEqual(list.map(a => [a.id, a.level, a.ms, a.cd]), [['buch', 2, 12_000, 20_000], ['neuesvideo', 1, 10_000, 30_000], ['zinseszins', 1, 20_000, 40_000]]);
  for (const a of list) assert.ok(a.name && a.icon && a.text, a.id);
  // fremde Fähigkeiten im Loadout (Koop-Partner) fliegen raus, Rüther kriegen Moshes nicht
  const g = Object.assign(makeFighter(QUEST_UNITS.moshe, mosheInst(s)), { loadout: [{ id: 'vp', level: 3 }, { id: 'buch', level: 1 }] });
  assert.deepEqual(createQuest({ mission: 'tachionenraub', team: [g], rng: seededRng(1) }).units[0].abilities, [{ id: 'buch', level: 1 }]);
  const c = Object.assign(makeFighter(RUETHER_BY_ID.christian), { loadout: [{ id: 'plus70', level: 1 }, { id: 'schlange', level: 3 }] });
  assert.deepEqual(createQuest({ mission: 'tachionenraub', team: [c], rng: seededRng(1) }).units[0].abilities, [{ id: 'plus70', level: 1 }]);
  assert.deepEqual(abilitiesFor('moshe').map(a => a.id), ['buch', 'neuesvideo']);
});

// ---------- §0 Wortfilter über alles Neue (der v12-Test läuft außerdem über js/, test/ und index.html) ----------
test('v13 §0: Fähigkeitstexte, Erfolg, Versionsmeldung ohne verbotene Wörter; NEWS wortgleich in version.json', () => {
  const banned = new RegExp(['j' + String.fromCharCode(252) + 'disch', 'gold' + 'knopf', 'teich' + 'tal', 'talmud'].join('|'), 'i');
  const texts = [];
  for (const id of [...FIXED.moshe, ...POOLS.moshe]) texts.push(ABILITIES[id].name, ...ABILITIES[id].texts);
  texts.push(...Object.values(QUEST_UNITS).flatMap(u => [u.name, u.title]));
  const a = ACHIEVEMENTS.find(x => x.id === 'moshe_spielbar');
  texts.push(a.name, a.desc);
  const v = JSON.parse(readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
  texts.push(...v.news);
  for (const t of texts) assert.doesNotMatch(t, banned, t);
  assert.equal(v.v, 13);
  assert.equal(v.news.length, 3);
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  for (const n of v.news) assert.ok(app.includes(`'${n}'`), `NEWS in app.js: ${n}`);
  assert.match(v.news[0], /^Moshe Hillel arbeitet für dich: Räume Rabino Empire HQ dreimal aus/);
  assert.match(v.news[1], /Überspringen geht nach 20 Sekunden\.$/);
  assert.match(v.news[2], /Raumcode teilen, fertig\. Beide brauchen die neue Version\.$/);
});

// ---------- Baustein B: Team-Wahl und Missionsliste (screens.js, reine Helfer; Bildschirme, Sammlung und Start prüft der Headless-Lauf) ----------
test('v13 §1/§6: questTeamList hängt Moshe hinter die Box (nur frei), mosheLine zählt Siege bis 3', async () => {
  globalThis.document ??= { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} }; // ui.js greift beim Laden zu
  globalThis.location ??= { search: '' };
  const { questTeamList, mosheLine } = await import('../js/screens.js');
  const box = [{ uid: 'r1', id: 'christian', rarity: 'normal', level: 1 }, { uid: 'r2', id: 'viktor', rarity: 'episch', level: 4 }, { uid: 'r3', id: 'micha', rarity: 'normal', level: 9 }];
  const s = Object.assign(withWins(2), { box, team: ['r3', 'moshe'] });
  assert.deepEqual(questTeamList(s).map(i => i.uid), ['r3', 'r2', 'r1'], 'Team zuerst, dann Seltenheit, dann Level; Moshe gesperrt');
  s.questLog.rabino.wins = 7;
  assert.deepEqual(questTeamList(s).map(i => i.uid), ['r3', 'r2', 'r1', 'moshe']);
  assert.deepEqual(questTeamList(s).at(-1), mosheInst(s));
  assert.deepEqual(questTeamList(withWins(3)).map(i => i.uid), ['moshe'], 'leere Box: nur Moshe');
  assert.deepEqual(questTeamList(withWins(0)), []);
  assert.equal(mosheLine(withWins(0)), 'Siege 0/3 · dann arbeitet Moshe für dich');
  assert.equal(mosheLine(withWins(2)), 'Siege 2/3 · dann arbeitet Moshe für dich');
  assert.equal(mosheLine(withWins(3)), 'Moshe spielbar');
  assert.equal(mosheLine(withWins(99)), 'Moshe spielbar');
  for (const bad of [null, 'x', { rabino: { wins: 'zwei' } }, { rabino: { wins: -2 } }]) assert.equal(mosheLine({ questLog: bad }), 'Siege 0/3 · dann arbeitet Moshe für dich', JSON.stringify(bad));
  assert.equal(mosheLine({ questLog: { rabino: { wins: 2.7 } } }), 'Siege 2/3 · dann arbeitet Moshe für dich');
});

// ---------- §3 Videos (Auswahl ohne DOM; DOM-Bauer prüft die Abnahme im Browser) ----------
test('v13 §3: pickVideo deterministisch je seed, in 9 Szenen jedes Video genau einmal, danach von vorn; Dateien da; SW und APK-Kopie', () => {
  const order = (seed, n = 9) => Array.from({ length: n }, (_, k) => pickVideo(seed, k + 1));
  for (const seed of [0, 1, 7, 123456, 4294967295]) {
    const a = order(seed);
    assert.deepEqual([...a].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7, 8], `seed ${seed}: keine Wiederholung`);
    assert.deepEqual(order(seed), a, 'deterministisch (Host und Gast sehen dasselbe)');
    assert.equal(pickVideo(seed, 10), a[0], 'nach 9 von vorn');
  }
  assert.notDeepEqual(order(1), order(2), 'andere Seeds, andere Reihenfolge');
  for (const c of [0, undefined, NaN, -3]) { const i = pickVideo(5, c); assert.ok(Number.isInteger(i) && i >= 0 && i < 9, String(c)); }
  assert.ok(pickVideo(3, 2, 3) < 3);
  assert.equal(VIDEO_COUNT, 9);
  assert.deepEqual([videoSrc(0), videoSrc(8)], ['vids/moshe-01.mp4', 'vids/moshe-09.mp4']);
  for (let i = 0; i < VIDEO_COUNT; i++) assert.ok(existsSync(new URL('../' + videoSrc(i), import.meta.url)), videoSrc(i));
  assert.ok(SKIP_MS === 20000 && SAFETY_MS > SKIP_MS);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sw, /vids\/moshe/, 'Videos nicht im Precache');
  assert.ok(sw.includes("'ruether-vids'") && sw.includes("includes('/vids/')"), 'eigener Laufzeit-Cache');
  assert.match(readFileSync(new URL('../native/build-www.mjs', import.meta.url), 'utf8'), /'vids'/);
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^moshehillelvids\.zip$/m);
});

// ---------- §2 Wirkungen (Engine, Baustein A): je Fähigkeit Stufe 1 und 3 ----------
// Muster wie test/abilities.test.mjs: Test-Mission aus einer Karte, Moshe als Kämpfer mit genau diesem Loadout
const M = (lv = {}) => Object.assign(makeFighter(QUEST_UNITS.moshe, mosheInst(withWins(3))), { loadout: Object.entries(lv).map(([id, level]) => ({ id, level })) });
const R = id => makeFighter(RUETHER_BY_ID[id]);
function Q(map, enemies = [], { team = [M({ buch: 1, neuesvideo: 1 })], ...opts } = {}) {
  const mission = {
    id: 'test', name: 'Test', theme: 'zypern', timeMs: 600_000, gate: [18, 8], coins: 2, reinforce: 'berater', loot: 'q-sack',
    objective: { type: 'steal', min: 1, label: 'Test' }, texts: { success: 'ok', fail: 'nein' }, map, variants: [{ id: 'v', enemies }], ...opts,
  };
  return createQuest({ mission, variant: 'v', team, rng: seededRng(1) });
}
const place = (o, x, y) => Object.assign(o, { x: x + 0.5, y: y + 0.5, path: [], goal: o.patrol ? null : { x, y }, intent: null, busy: null });
function run(st, ms, cmds = []) {
  const ev = [];
  for (let t = 0; t < ms; t += 50) ev.push(...tick(st, 50, t === 0 ? cmds : []));
  return ev;
}
const has = (ev, type, f = () => true) => ev.some(e => e.type === type && f(e));
const find = (ev, type, f = () => true) => ev.find(e => e.type === type && f(e));
const ab = (unit, ability, target = {}) => ({ type: 'ability', unit, ability, target });
const d2 = (a, x, y) => Math.hypot(a.x - x, a.y - y);
const ROOM = [
  '####################',
  '#PPP...............#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#........#.........#',
  '#........#.........#',
  '#........#.........#',
  '#..................#',
  '####################',
];
const P = (x, y, dir = 0, more = {}) => ({ type: 'berater', at: [x, y], dir, ...more });

test('v13 §2 buch: Wache bis 2 Kacheln liest 8 s (bribed, Kegel aus), wacht als Patrouille ohne Alarm; Moshe halb; Stufe 3 liest die nächste in 2 mit', () => {
  let st = Q(ROOM, [P(5, 4, 180), P(12, 4)]);
  place(st.units[0], 3, 4);
  let ev = run(st, 100, [ab(0, 'buch', { enemy: 0 })]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.ability, a.ms, a.second, a.enemy], ['buch', 4000, -1, 0]); // Berater ist Spezialgegner (§2): halb
  const s = find(ev, 'stun', x => x.reason === 'liest');
  assert.deepEqual([s.enemy, s.ms, s.say.length > 5], [0, 4000, true]);
  assert.deepEqual([st.enemies[0].state, st.enemies[0].reason], ['bribed', 'liest']);
  assert.deepEqual(visibleCone(st, 0), []);
  assert.equal(st.units[0].cd.buch, 20_000);
  assert.equal(st.enemies[1].state, 'patrol', 'Stufe 1: keiner liest mit');
  ev = run(st, 4000); // Moshe steht die ganze Zeit vor ihr
  const w = find(ev, 'wake', x => x.reason === 'liest');
  assert.equal(w.say, 'Kapitel 3 ist stark.');
  assert.equal(st.enemies[0].state, 'patrol', 'wacht als Patrouille auf, nicht misstrauisch');
  assert.ok(!has(ev, 'alert') && !has(ev, 'suspicious'));
  // normale Wache volle 8 s, der Gegner-Moshe 4 s
  st = Q(ROOM, [{ type: 'pinguin', at: [5, 4], dir: 180 }, { type: 'moshe', at: [12, 4], dir: 0 }]);
  place(st.units[0], 3, 4);
  ev = run(st, 100, [ab(0, 'buch', { enemy: 0 })]);
  assert.deepEqual([find(ev, 'ability').ms, find(ev, 'stun').ms], [8000, 8000]);
  ev = run(st, 7800);
  assert.equal(st.enemies[0].state, 'bribed', 'liest noch');
  place(st.units[0], 11, 4); // hinter den Gegner-Moshe, weg vom aufwachenden Pinguin
  run(st, 12_200);
  assert.equal(find(tick(st, 50, [ab(0, 'buch', { enemy: 1 })]), 'ability').ms, 4000);
  // Stufe 3: Weiterempfehlung an die nächste Wache in 2 Kacheln, nicht an die in 5
  st = Q(ROOM, [{ type: 'pinguin', at: [5, 4], dir: 0 }, { type: 'pinguin', at: [6, 3], dir: 0 }, { type: 'pinguin', at: [10, 4], dir: 0 }], { team: [M({ buch: 3 })] });
  place(st.units[0], 3, 4);
  ev = run(st, 100, [ab(0, 'buch', { enemy: 0 })]);
  assert.deepEqual([find(ev, 'ability').ms, find(ev, 'ability').second], [12_000, 1]);
  assert.deepEqual(ev.filter(e => e.type === 'stun' && e.reason === 'liest').map(e => [e.enemy, e.ms, e.reader ?? null]), [[0, 12_000, null], [1, 12_000, 0]]);
  assert.deepEqual(st.enemies.map(e => e.state), ['bribed', 'bribed', 'patrol']);
  // zu weit: Moshe läuft erst hin
  st = Q(ROOM, [P(10, 4, 180)]);
  place(st.units[0], 3, 4);
  ev = run(st, 3000, [ab(0, 'buch', { enemy: 0 })]);
  assert.ok(has(ev, 'stun', x => x.reason === 'liest'));
  assert.ok(d2(st.units[0], st.enemies[0].x, st.enemies[0].y) <= 2.1, 'bis auf 2 Kacheln heran (die Wache kommt ihm entgegen)');
  assert.equal(st.enemies[0].state, 'bribed', 'auch eine alarmierte Wache liest');
});

test('v13 §2 neuesvideo: alle Wachen in 6 schauen 10 s (Kegel aus, Blick auf Moshe), Sichtlinie egal; Spezial halb; ohne Wache Fehler; Stufe 3: danach 5 s verwirrt', () => {
  const pin = (x, y, dir = 0) => ({ type: 'pinguin', at: [x, y], dir });
  let st = Q(ROOM, [pin(6, 4), { type: 'moshe', at: [8, 2], dir: 0 }, pin(12, 7), pin(17, 8)]); // Wache 2 hinter der Wand bei x=9 (Sicht egal, aber 9 Kacheln weit), Wache 3 zu weit
  place(st.units[0], 3, 4);
  let ev = run(st, 100, [ab(0, 'neuesvideo')]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.enemies, a.r, a.ms, a.finger, a.say], [[0, 1], 6, 10_000, false, 'Hallo Freunde, heute zeige ich euch …']);
  const tasks = ev.filter(e => e.type === 'task' && e.kind === 'neuesvideo');
  assert.deepEqual(tasks.map(t => [t.enemy, t.ms, t.cone]), [[0, 10_000, false], [1, 5000, false]]);
  assert.equal(tasks[0].say, 'Ist das echt?');
  for (const i of [0, 1]) assert.deepEqual(visibleCone(st, i), []);
  assert.deepEqual([st.enemies[2].state, st.enemies[3].state], ['patrol', 'patrol']);
  assert.equal(st.units[0].cd.neuesvideo, 30_000);
  run(st, 1500);
  assert.ok(Math.abs(Math.cos(st.enemies[0].dir) + 1) < 0.05, 'Wache 0 (östlich von Moshe) dreht sich zu ihm');
  ev = run(st, 4000);
  assert.ok(has(ev, 'taskEnd', t => t.enemy === 1 && t.kind === 'neuesvideo'), 'Gegner-Moshe nach 5 s');
  assert.equal(st.enemies[0].task?.kind, 'neuesvideo');
  ev = run(st, 5000);
  assert.ok(has(ev, 'taskEnd', t => t.enemy === 0 && t.reason === 'fertig'));
  assert.equal(st.enemies[0].state, 'patrol');
  assert.ok(!has(ev, 'stun'), 'Stufe 1: kein Verwirren');
  // hinter der Wand, aber in Reichweite: das Handy ist laut
  st = Q(ROOM, [pin(11, 6, 180)]);
  place(st.units[0], 7, 6);
  assert.deepEqual(find(run(st, 100, [ab(0, 'neuesvideo')]), 'ability').enemies, [0]);
  // ohne Wache in 6 Kacheln: Fehler, keine Abklingzeit
  st = Q(ROOM, [pin(12, 4)]);
  place(st.units[0], 3, 4);
  ev = tick(st, 0, [ab(0, 'neuesvideo')]);
  assert.ok(has(ev, 'fail', f => f.reason === 'noViewer' && f.text === 'Keine Wache in der Nähe, die das Video sieht.'));
  assert.equal(st.units[0].cd.neuesvideo, undefined);
  // Stufe 3: 14 s, 7 Kacheln, danach 5 s verwirrt (stunned, Kegel aus), dann misstrauisch umsehen
  st = Q(ROOM, [pin(10, 4), pin(17, 4)], { team: [M({ neuesvideo: 3 })] });
  place(st.units[0], 3, 4);
  ev = run(st, 100, [ab(0, 'neuesvideo')]);
  assert.deepEqual([find(ev, 'ability').enemies, find(ev, 'ability').ms, find(ev, 'ability').finger], [[0], 14_000, true]);
  assert.equal(find(ev, 'task').say, 'Warum hat er sechs Finger?');
  ev = run(st, 14_100);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'neuesvideo'));
  const s = find(ev, 'stun', x => x.reason === 'finger');
  assert.deepEqual([s.enemy, s.ms, s.say], [0, 5000, 'SECHS FINGER?!']);
  assert.deepEqual([st.enemies[0].state, visibleCone(st, 0)], ['stunned', []]);
  ev = run(st, 5100);
  assert.ok(has(ev, 'wake', w => w.reason === 'finger'));
  assert.equal(st.enemies[0].state, 'investigate');
});

test('v13 §2 schlange: Wurf bis 6, Schlange am Punkt, ruhige Wachen in 6 stellen sich 10 s an (Kegel aus); Stufe 3: 3×3-Wand 8 s nur für Wachen', () => {
  const pin = (x, y, dir = 0, more = {}) => ({ type: 'pinguin', at: [x, y], dir, ...more });
  let st = Q(ROOM, [pin(12, 4), pin(13, 6), pin(18, 1), pin(2, 8)], { team: [M({ schlange: 1 })] });
  place(st.units[0], 6, 4);
  st.enemies[3].state = 'alert'; st.enemies[3].suspicion = 1; st.enemies[3].lastSeen = { x: 2.5, y: 8.5 }; // alarmiert, sucht an Ort und Stelle
  let ev = run(st, 4000, [ab(0, 'schlange', { x: 10.5, y: 4.5 })]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.item, a.r, a.block, a.say], ['queue', 6, 0, '12 Personen schließen gerade ihre Bestellung ab.']);
  assert.ok(a.ms > 350 && a.ms < 1000, 'Flugzeit');
  const q = find(ev, 'queue');
  assert.deepEqual([q.x, q.y, q.r, q.ms, q.block, q.enemies], [10.5, 4.5, 6, 10_000, 0, [0, 1]]);
  const f = st.effects.find(x => x.kind === 'schlange');
  assert.ok(f && f.until > st.time);
  assert.ok(!st.effects.some(x => x.kind === 'wall'), 'Stufe 1: keine Wand');
  for (const i of [0, 1]) {
    assert.equal(st.enemies[i].task.kind, 'schlange');
    assert.ok(d2(st.enemies[i], 10.5, 4.5) <= 2.4, `Wache ${i} steht an`);
    assert.deepEqual(visibleCone(st, i), []);
  }
  assert.equal(st.enemies[2].state, 'patrol', 'zu weit');
  assert.equal(st.enemies[3].state, 'alert', 'alarmierte stellen sich nicht an');
  assert.equal(st.units[0].cd.schlange, 30_000);
  ev = run(st, 12_000);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'schlange' && t.enemy === 0 && t.say === 'Ausverkauft. Nächste Lieferung aus Zypern.'));
  assert.ok(has(ev, 'effectEnd', e => e.kind === 'schlange'));
  // Berater halb so lang
  st = Q(ROOM, [P(12, 4)], { team: [M({ schlange: 1 })] });
  place(st.units[0], 6, 4);
  assert.equal(find(run(st, 2000, [ab(0, 'schlange', { x: 10.5, y: 4.5 })]), 'task').ms, 5000);
  // Stufe 3: Wand im Gang, die Wache kommt 8 s nicht durch, Rüther schon; danach ist der Weg frei
  const MAP = ['####################', '#PPP...............#', '#..................#', '#########.##########', '#..................#', '#..................#', '####################'];
  st = Q(MAP, [pin(9, 5, -90, { patrol: [[9, 5], [9, 1]] })], { team: [M({ schlange: 3 }), R('christian')], gate: [1, 5] });
  place(st.units[0], 5, 2); place(st.units[1], 2, 1);
  st.enemies[0].dir = -Math.PI / 2;
  ev = run(st, 1500, [ab(0, 'schlange', { x: 9.5, y: 3.5 })]);
  assert.equal(find(ev, 'ability').block, 8000);
  assert.equal(find(ev, 'queue').block, 8000);
  const w = st.effects.find(x => x.kind === 'wall');
  assert.ok(w && w.tiles.some(t => t.x === 9 && t.y === 3) && w.tiles.length === 7, 'Gangkachel plus die freien Kacheln darüber und darunter');
  assert.ok(st.wall[3 * st.w + 9] > st.time);
  ev = run(st, 3000);
  assert.ok(st.enemies[0].y > 3.9, 'Wache kommt nicht durch');
  ev = run(st, 100, [{ type: 'move', unit: 1, to: { x: 14, y: 5 } }]);
  assert.ok(find(ev, 'path').path.some(n => n.x === 9 && n.y === 3), 'Christian geht durch die Schlange');
  ev = run(st, 5000);
  assert.ok(has(ev, 'effectEnd', e => e.kind === 'wall'));
  assert.ok(!(st.wall[3 * st.w + 9] > st.time), 'Wand abgelaufen');
  let minY = 9;
  for (let k = 0; k < 16; k++) { run(st, 1000); minY = Math.min(minY, st.enemies[0].y); }
  assert.ok(minY < 2, 'danach läuft die Patrouille wieder durch den Gang');
});

test('v13 §2 zinseszins: nur mit Beute; nach ms verdoppelt sich die getragene Beute als interest; Abliefern addiert; flach oder erwischt verfällt; Stufe 3 zweimal', () => {
  const VAULT = ['##########', '#PPP.....#', '#....C...#', '#........#', '##########'];
  let st = Q(VAULT, [], { team: [M({ zinseszins: 1 })], gate: [8, 1] });
  const u = st.units[0];
  let ev = tick(st, 0, [ab(0, 'zinseszins')]);
  assert.ok(has(ev, 'fail', f => f.reason === 'noLoot' && f.text === 'Nichts zu verzinsen.'));
  assert.deepEqual([u.cd.zinseszins, u.zins], [undefined, null]);
  u.carry = 1; place(u, 5, 2);
  ev = run(st, 100, [ab(0, 'zinseszins')]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.ms, a.times, a.at, a.carry], [20_000, 1, 20_000, 1]);
  assert.deepEqual(u.zins, { at: 20_000, left: 1, ms: 20_000 });
  assert.equal(u.cd.zinseszins, 40_000);
  ev = run(st, 19_800);
  assert.ok(!has(ev, 'zins') && u.interest === 0, 'noch nicht fällig');
  ev = run(st, 200);
  const z = find(ev, 'zins');
  assert.deepEqual([z.unit, z.amount, z.interest, z.left, z.next], [0, 1, 1, 0, null]);
  assert.deepEqual([u.interest, u.zins], [1, null]);
  // Abliefern: Beute plus Zins, auch über objective.total hinaus
  ev = run(st, 3000, [{ type: 'move', unit: 0, to: { x: 1, y: 1 } }]);
  const d = find(ev, 'deliver');
  assert.deepEqual([d.coins, d.interest, d.total], [2, 1, 2]);
  assert.deepEqual([u.carry, u.interest, st.delivered, st.objective.done], [0, 0, 2, 2]);
  // Stufe 2: schon nach 15 s; flach = verfallen
  st = Q(VAULT, [], { team: [M({ zinseszins: 2 })], gate: [8, 1] });
  Object.assign(st.units[0], { carry: 2 }); place(st.units[0], 5, 2);
  assert.equal(find(tick(st, 50, [ab(0, 'zinseszins')]), 'ability').ms, 15_000);
  run(st, 5000);
  st.units[0].down = true; st.units[0].hp = 0;
  ev = run(st, 12_000);
  assert.ok(!has(ev, 'zins'));
  assert.deepEqual([st.units[0].zins, st.units[0].interest], [null, 0]);
  // erwischt (Debug-Fang) nullt den laufenden Zins
  st = Q(VAULT, [{ type: 'moshe', at: [8, 3], dir: 180 }], { team: [M({ zinseszins: 1 })], gate: [8, 1] });
  Object.assign(st.units[0], { carry: 1 }); place(st.units[0], 5, 2);
  run(st, 100, [ab(0, 'zinseszins')]);
  assert.ok(st.units[0].zins);
  ev = tick(st, 0, [{ type: 'catch' }]);
  assert.ok(has(ev, 'video') && st.paused === 'video');
  assert.equal(st.units[0].zins, null);
  // Stufe 3: zweimal, je 15 s; 2 Säcke werden 2 + 2 + 2
  st = Q(VAULT, [], { team: [M({ zinseszins: 3 })], gate: [8, 1] });
  Object.assign(st.units[0], { carry: 2 }); place(st.units[0], 5, 2);
  ev = run(st, 100, [ab(0, 'zinseszins')]);
  assert.deepEqual([find(ev, 'ability').ms, find(ev, 'ability').times], [15_000, 2]);
  ev = run(st, 15_000);
  let zz = find(ev, 'zins');
  assert.deepEqual([zz.amount, zz.interest, zz.left, zz.next], [2, 2, 1, 30_000]);
  assert.deepEqual(st.units[0].zins, { at: 30_000, left: 1, ms: 15_000 });
  ev = run(st, 15_000);
  zz = find(ev, 'zins');
  assert.deepEqual([zz.amount, zz.interest, zz.left, zz.next], [2, 4, 0, null]);
  assert.deepEqual([st.units[0].interest, st.units[0].zins], [4, null]);
  ev = run(st, 3000, [{ type: 'move', unit: 0, to: { x: 1, y: 1 } }]);
  assert.deepEqual([find(ev, 'deliver').coins, st.delivered], [6, 6]);
  assert.equal(st.objective.done, 6, 'mehr als die 2 Münzen im Tresor');
  // nach der Ablieferung ist der nächste Zins ohne Beute wieder ein Fehler
  st.units[0].cd.zinseszins = 0;
  assert.ok(has(tick(st, 0, [ab(0, 'zinseszins')]), 'fail', f => f.reason === 'noLoot'));
});

test('v13 §2 geschenk: Wache bis 6 läuft zum Tor und schaut 20 s den Prospekt an (Kegel aus), dann Patrouille; Spezial halb; nicht auf Betäubte; Stufe 3 nimmt die nächste in 3 mit', () => {
  const pin = (x, y, dir = 0) => ({ type: 'pinguin', at: [x, y], dir });
  let st = Q(ROOM, [pin(6, 4), pin(13, 2)], { team: [M({ geschenk: 1 })] });
  place(st.units[0], 2, 4);
  let ev = run(st, 3000, [ab(0, 'geschenk', { enemy: 0 })]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.enemy, a.ms, a.second], [0, 20_000, -1]);
  const e = st.enemies[0];
  const t = find(ev, 'task');
  assert.deepEqual([t.kind, t.enemy, t.to, t.ms, t.cone, t.say], ['geschenk', 0, st.gate, 20_000, false, 'Ein Reihenhaus! In Limassol!']);
  assert.deepEqual(visibleCone(st, 0), []);
  assert.ok(e.x > 9, 'unterwegs zum Tor');
  assert.equal(st.enemies[1].state, 'patrol');
  assert.equal(st.units[0].cd.geschenk, 30_000);
  ev = run(st, 6000);
  assert.ok(d2(e, st.gate.x + 0.5, st.gate.y + 0.5) <= 1.6 && e.task.phase === 'stay', 'am Tor, schaut den Prospekt an');
  ev = run(st, 20_100);
  const end = find(ev, 'taskEnd', x => x.kind === 'geschenk');
  assert.deepEqual([end.enemy, end.reason, end.say], [0, 'fertig', 'Boden optional, steht hier.']);
  assert.equal(e.state, 'patrol');
  // Spezialgegner halb (Berater, Moshe); schon Betäubte kriegen kein Haus
  st = Q(ROOM, [{ type: 'moshe', at: [6, 4], dir: 0 }, P(8, 4), pin(8, 2)], { team: [M({ geschenk: 1 })] });
  place(st.units[0], 4, 4);
  assert.equal(find(tick(st, 50, [ab(0, 'geschenk', { enemy: 0 })]), 'ability').ms, 10_000);
  st.units[0].cd.geschenk = 0;
  assert.equal(find(tick(st, 50, [ab(0, 'geschenk', { enemy: 1 })]), 'ability').ms, 10_000);
  st.units[0].cd.geschenk = 0;
  st.enemies[2].state = 'stunned'; st.enemies[2].until = 1e9;
  assert.ok(has(tick(st, 0, [ab(0, 'geschenk', { enemy: 2 })]), 'fail', f => f.reason === 'target'));
  // Stufe 3: die nächste Wache in 3 Kacheln kommt mit zur Besichtigung, die in 5 nicht
  st = Q(ROOM, [pin(6, 4), pin(7, 2), pin(6, 8)], { team: [M({ geschenk: 3 })] });
  place(st.units[0], 2, 4);
  ev = run(st, 100, [ab(0, 'geschenk', { enemy: 0 })]);
  assert.deepEqual([find(ev, 'ability').ms, find(ev, 'ability').second], [30_000, 1]);
  assert.deepEqual(ev.filter(x => x.type === 'task').map(x => [x.enemy, x.kind, x.say]), [[0, 'geschenk', 'Ein Reihenhaus! In Limassol!'], [1, 'geschenk', 'Die Familie kommt mit.']]);
  assert.equal(st.enemies[2].state, 'patrol');
  run(st, 6000);
  for (const i of [0, 1]) assert.ok(d2(st.enemies[i], st.gate.x + 0.5, st.gate.y + 0.5) <= 1.6, `Wache ${i} am Tor`);
});

test('v13 §2: Moshe neben einem Rüther im Team; Stefan und Himmler halb; Schnappschuss (Koop) trägt zins, interest und die lesende Wache', async () => {
  const { questSnapshot, applyQuestSnapshot } = await import('../js/quest/engine.js');
  const E = [{ type: 'bernd', at: [5, 4], dir: 180 }, { type: 'himmler', at: [6, 2], dir: 180 }];
  const mk = () => Q(ROOM, E, { team: [R('christian'), M({ buch: 1, neuesvideo: 1, zinseszins: 1 })] });
  const st = mk(), guest = mk();
  assert.deepEqual(st.units.map(u => u.id), ['christian', 'moshe']);
  place(st.units[1], 3, 4);
  st.units[1].carry = 1;
  const ev = run(st, 100, [ab(1, 'buch', { enemy: 0 }), ab(1, 'zinseszins')]);
  assert.equal(find(ev, 'ability', a => a.ability === 'buch').ms, 4000);
  assert.ok(st.units[1].zins);
  applyQuestSnapshot(guest, JSON.parse(JSON.stringify(questSnapshot(st))));
  assert.deepEqual([guest.units[1].zins, guest.units[1].interest, guest.units[1].id, guest.enemies[0].state, guest.enemies[0].reason], [st.units[1].zins, 0, 'moshe', 'bribed', 'liest']);
  place(st.units[1], 1, 8); // aus Himmlers Blick, sonst erwischt ihn Stefan nach dem Lesen und der Zins verfällt
  run(st, 20_000);
  applyQuestSnapshot(guest, JSON.parse(JSON.stringify(questSnapshot(st))));
  assert.deepEqual([guest.units[1].interest, guest.units[1].zins], [1, null]);
});
