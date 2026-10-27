// v11 §4/§5: Koop-Quest (owner, Schnappschuss) und Quest-Rennen (raceWinner)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuest, tick, questSnapshot, applyQuestSnapshot, packEvents, tileAt } from '../js/quest/engine.js';
import { MISSIONS, pickSetup } from '../js/quest/missions.js';
import { createDelta, cleanCmd, cleanSummary, COOP } from '../js/quest/coop.js';
import { RACE, raceWinner } from '../js/quest/race.js';
import { makeFighter } from '../js/battle.js';
import { RUETHER_BY_ID } from '../js/data.js';
import { seededRng } from '../js/quests.js';

const F = (id, owner) => ({ ...makeFighter(RUETHER_BY_ID[id]), owner });
const TEAM = () => [F('christian', 'host'), F('micha', 'host'), F('hildegard', 'guest'), F('viktor', 'guest')];
const ROOM = [
  '####################',
  '#PPPP..............#',
  '#..................#',
  '#........L.........#',
  '#........#.........#',
  '#........#.........#',
  '####################',
];
function Q(opts = {}) {
  const mission = {
    id: 'test', name: 'Test', theme: 'neuschwabenland', timeMs: 600_000, gate: [1, 2], coins: 2, reinforce: 'pinguin',
    objective: { type: 'steal', min: 1, label: 'Test' }, texts: { success: 'ok', fail: 'nein' }, map: ROOM, variants: [{ id: 'v', enemies: [] }],
  };
  return createQuest({ mission, variant: 'v', team: TEAM(), rng: seededRng(1), maxUnits: 4, ...opts });
}
const run = (st, ms, cmds = []) => { const ev = []; for (let t = 0; t < ms; t += 50) ev.push(...tick(st, 50, t === 0 ? cmds : [])); return ev; };
const json = x => JSON.parse(JSON.stringify(x));

test('Koop: maxUnits 4 mit owner, ohne maxUnits weiter höchstens 3', () => {
  const st = Q();
  assert.equal(st.units.length, 4);
  assert.deepEqual(st.units.map(u => u.owner), ['host', 'host', 'guest', 'guest']);
  const solo = Q({ maxUnits: undefined });
  assert.equal(solo.units.length, 3);
  const plain = createQuest({ mission: 'keller', team: [makeFighter(RUETHER_BY_ID.christian)], rng: seededRng(2) });
  assert.equal(plain.units[0].owner, null);
  assert.equal(COOP.MAX_UNITS, 4);
});

test('Koop: fremder Befehl → notYours; eigener und ohne by gehen; Partner wiederbeleben geht', () => {
  const st = Q();
  let ev = tick(st, 0, [{ type: 'move', unit: 2, to: { x: 12.5, y: 2.5 }, by: 'host' }]);
  const f = ev.find(e => e.type === 'fail');
  assert.equal(f.reason, 'notYours');
  assert.equal(f.text, 'Das ist nicht dein Rüther.');
  assert.equal(f.unit, 2);
  assert.equal(f.by, 'host'); // Meldung nur beim Absender
  assert.equal(st.units[2].path.length, 0);
  for (const type of ['stop', 'interact', 'ability']) assert.equal(tick(st, 0, [{ type, unit: 0, by: 'guest', obj: 0, ability: 'plus70', target: { door: 0 } }]).find(e => e.type === 'fail')?.reason, 'notYours', type);
  ev = tick(st, 0, [{ type: 'move', unit: 2, to: { x: 12.5, y: 2.5 }, by: 'guest' }, { type: 'move', unit: 3, to: { x: 14.5, y: 2.5 } }]);
  assert.equal(ev.filter(e => e.type === 'path').length, 2);
  // Hildegard (Gast) liegt flach, Christian (Host) holt sie zurück
  Object.assign(st.units[2], { down: true, hp: 0, path: [], goal: null, x: 3.5, y: 2.5 });
  ev = run(st, 4000, [{ type: 'interact', unit: 0, obj: { unit: 2 }, by: 'host' }]);
  assert.ok(ev.some(e => e.type === 'revive' && e.unit === 0 && e.target === 2));
  assert.equal(st.units[2].down, false);
  // Abheben und Aufgeben darf jeder
  ev = tick(st, 0, [{ type: 'abort', by: 'guest' }]);
  assert.equal(ev.find(e => e.type === 'end')?.result, 'abort');
});

test('Schnappschuss: Spiegel bekommt denselben Zustand, Objekte bleiben dieselben, Türkachel folgt', () => {
  const host = Q(), mirror = Q(), u0 = mirror.units[0], u3 = mirror.units[3];
  run(host, 3500, [{ type: 'move', unit: 2, to: { x: 15.5, y: 4.5 }, by: 'guest' }, { type: 'ability', unit: 0, ability: 'plus70', target: { door: 0 }, by: 'host' }]);
  run(host, 1500, [{ type: 'ability', unit: 3, ability: 'gas', target: { x: 6.5, y: 2.5 }, dir: 'h', by: 'guest' }]);
  assert.equal(tileAt(host, 9, 3), 'D');
  assert.ok(host.effects.length && host.gas.some(v => v > host.time));
  applyQuestSnapshot(mirror, json(questSnapshot(host)));
  assert.deepEqual(questSnapshot(mirror), questSnapshot(host));
  assert.equal(mirror.units[0], u0);
  assert.equal(mirror.units[3], u3);
  assert.equal(tileAt(mirror, 9, 3), 'D');
  // weiterlaufen: Effekte per id wiederverwendet, Raster neu gesetzt
  const fw = mirror.effects[0];
  run(host, 500, [{ type: 'move', unit: 3, to: { x: 2.5, y: 4.5 }, by: 'guest' }]);
  applyQuestSnapshot(mirror, json(questSnapshot(host)));
  assert.deepEqual(questSnapshot(mirror), questSnapshot(host));
  assert.equal(mirror.effects[0], fw);
  // kaputte Daten: nichts wirft, Statisches und fremde Schlüssel bleiben unberührt
  applyQuestSnapshot(mirror, json({ tiles: [], w: 1, foo: 1, units: 'x', gas: [1e9, 5, -1, 5, 'a', 5] }));
  assert.equal(mirror.w, 20);
  assert.equal(mirror.foo, undefined);
  assert.equal(mirror.units[0], u0);
  applyQuestSnapshot(mirror, JSON.parse('{"units":[{"__proto__":{"evil":1},"hp":3}]}'));
  assert.equal(mirror.units[0].hp, 3);
  assert.equal(mirror.units[0].evil, undefined);
  applyQuestSnapshot(mirror, null);
});

test('Alle Missionen: 400 Schritte mit Bewegung, Schnappschuss unter 24 KB, Events JSON-fest', () => {
  const sizes = [];
  for (const m of MISSIONS) {
    const rng = seededRng(7), setup = pickSetup(m, rng);
    const st = createQuest({ mission: m, setup, team: TEAM(), rng, maxUnits: 4 }), mirror = createQuest({ mission: m, setup, team: TEAM(), rng: seededRng(7), maxUnits: 4 });
    const pr = seededRng(11), ev = [];
    for (let k = 0; k < 400; k++) {
      const cmds = k % 40 ? [] : st.units.map(u => ({ type: 'move', unit: u.i, to: { x: pr() * st.w, y: pr() * st.h }, by: u.owner }));
      ev.push(...tick(st, 50, cmds));
    }
    const s = JSON.stringify(questSnapshot(st));
    sizes.push(`${m.id} ${(s.length / 1024).toFixed(1)} KB`);
    assert.ok(s.length < 24 * 1024, `${m.id}: ${s.length} Zeichen`);
    const p = packEvents(ev);
    assert.deepEqual(json(p), p, m.id);
    assert.equal(p.length, ev.length);
    applyQuestSnapshot(mirror, JSON.parse(s));
    assert.deepEqual(questSnapshot(mirror), JSON.parse(s), m.id);
  }
  console.log(sizes.join(' · '));
});

test('cleanCmd: nur erlaubte Befehle und Felder, by = guest', () => {
  assert.equal(cleanCmd(null, 4), null);
  for (const type of ['resume', 'catch', 'tick', 'constructor']) assert.equal(cleanCmd({ type, unit: 0 }, 4), null);
  assert.deepEqual(cleanCmd({ type: 'abort', by: 'host' }, 4), { type: 'abort', by: 'guest' });
  assert.deepEqual(cleanCmd({ type: 'extract', unit: 9 }, 4), { type: 'extract', by: 'guest' });
  assert.equal(cleanCmd({ type: 'move', unit: 4, to: { x: 1, y: 1 } }, 4), null);
  assert.equal(cleanCmd({ type: 'move', unit: '__proto__', to: { x: 1, y: 1 } }, 4), null);
  assert.equal(cleanCmd({ type: 'move', unit: 1, to: { x: 'a', y: 1 } }, 4), null);
  assert.deepEqual(cleanCmd({ type: 'move', unit: 1, to: { x: 1.5, y: 2, z: 3 }, by: 'host', evil: 1 }, 4), { type: 'move', by: 'guest', unit: 1, to: { x: 1.5, y: 2 } });
  assert.deepEqual(cleanCmd({ type: 'stop', unit: 3 }, 4), { type: 'stop', by: 'guest', unit: 3 });
  assert.deepEqual(cleanCmd({ type: 'interact', unit: 2, obj: 5 }, 4).obj, 5);
  assert.deepEqual(cleanCmd({ type: 'interact', unit: 2, obj: { unit: 1, x: 'q' } }, 4).obj, { unit: 1 });
  assert.deepEqual(cleanCmd({ type: 'interact', unit: 2, obj: { x: 3, y: 4 } }, 4).obj, { x: 3, y: 4 });
  assert.equal(cleanCmd({ type: 'interact', unit: 2, obj: '__proto__' }, 4), null);
  assert.deepEqual(cleanCmd({ type: 'ability', unit: 2, ability: 'gas', target: { enemy: 2, x: 'a', y: 3, door: -1 }, target2: { x: 1, y: 2 }, dir: 'q', face: 1 }, 4),
    { type: 'ability', by: 'guest', unit: 2, ability: 'gas', target: { enemy: 2 }, target2: { x: 1, y: 2 }, face: 1 });
  assert.equal(cleanCmd({ type: 'ability', unit: 2, ability: 7 }, 4), null);
  // durch JSON und cleanCmd an die Engine: läuft wie ein eigener Befehl des Gasts
  const st = Q(), c = cleanCmd(json({ type: 'move', unit: 3, to: { x: 12.5, y: 2.5 }, by: 'host' }), st.units.length);
  assert.ok(tick(st, 0, [c]).some(e => e.type === 'path' && e.unit === 3));
  assert.equal(tick(st, 0, [cleanCmd({ type: 'move', unit: 0, to: { x: 12.5, y: 2.5 } }, 4)])[0].reason, 'notYours');
});

test('raceWinner: Score, dann Erfolg, dann Zeit, sonst Unentschieden', () => {
  assert.deepEqual(RACE, { WIN_SATS: 1000, WIN_XP: 100, PROGRESS_MS: 1000 });
  assert.equal(raceWinner({ result: 'fail', score: 3, timeMs: 90_000 }, { result: 'success', score: 2, timeMs: 10_000 }), 'a');
  assert.equal(raceWinner({ result: 'fail', score: 2, timeMs: 10_000 }, { result: 'success', score: 2, timeMs: 90_000 }), 'b');
  assert.equal(raceWinner({ result: 'success', score: 2, timeMs: 60_000 }, { result: 'success', score: 2, timeMs: 61_000 }), 'a');
  // Ohne Erfolg zählt die Zeit nicht: sofort aufgeben schlägt keinen, der später scheitert (kein Bonus-Farmen)
  assert.equal(raceWinner({ result: 'abort', score: 0, timeMs: 5000 }, { result: 'fail', score: 0, timeMs: 4000 }), 'draw');
  assert.equal(raceWinner({ result: 'abort', score: 0, timeMs: 1000 }, { result: 'fail', score: 0, timeMs: 360_000 }), 'draw');
  assert.equal(raceWinner({ result: 'abort', score: 0, timeMs: 1000 }, { result: 'abort', score: 0, timeMs: 9000 }), 'draw');
  assert.equal(raceWinner({ result: 'success', score: 2, timeMs: 60_000 }, { result: 'success', score: 2, timeMs: 60_000 }), 'draw');
  // Daten von außen: kaputte Zahlen zählen nicht
  assert.equal(raceWinner({ result: 'success', score: 1, timeMs: 1 }, { result: 'success', score: NaN, timeMs: 1 }), 'a');
  assert.equal(raceWinner({ result: 'success', score: 1, timeMs: 'x' }, { result: 'success', score: 1, timeMs: 5 }), 'b');
  assert.equal(raceWinner(null, { score: 1 }), 'b');
});

test('Koop-Gast: Schnappschuss ändert nie, wer eine Einheit ist; Zusammenfassung des Hosts wird gesäubert (Spec §0)', () => {
  const host = Q(), guest = Q();
  run(host, 500, [{ type: 'move', unit: 0, to: { x: 6.5, y: 2.5 }, by: 'host' }]);
  const snap = json(questSnapshot(host));
  Object.assign(snap.units[0], { rarity: '"><img src=x onerror=alert(1)>', id: 'x" onerror="alert(2)', name: '<b>', level: 'x', abilities: [{ id: 'hack', level: 9 }] });
  snap.units[2].owner = 'host';
  snap.units.push({ i: 4, id: 'hacker' }); // mehr Einheiten gibt es nicht
  const u0 = guest.units[0];
  applyQuestSnapshot(guest, snap);
  assert.equal(guest.units[0], u0);
  assert.deepEqual([u0.id, u0.rarity, u0.name, u0.level], [host.units[0].id, host.units[0].rarity, host.units[0].name, host.units[0].level]);
  assert.deepEqual(u0.abilities, host.units[0].abilities);
  assert.equal(guest.units[2].owner, 'guest');
  assert.equal(guest.units.length, 4);
  assert.deepEqual([u0.x, u0.y], [snap.units[0].x, snap.units[0].y]); // Bewegung kommt weiter an

  const c = cleanSummary({ result: '<img>', reason: 'caught', score: '5<b>', objective: { done: '<img src=x onerror=1>', total: 3.6, min: -2 }, timeMs: 'x',
    alarmFree: 'ja', kieser: '1<i>', videos: 2, fine: 50, text: 7, team: [{ id: 'micha' }], setup: { layoutId: 'a' }, evil: '<script>' });
  assert.deepEqual(c, { result: 'abort', reason: 'caught', score: 0, objective: { done: 0, total: 4, min: 0 }, timeMs: 0, alarmFree: false,
    delivered: 0, leftBehind: 0, kieser: 0, videos: 2, fine: 50, text: '', setup: { layoutId: 'a' }, team: [{ id: 'micha' }] });
  assert.equal(cleanSummary(null).result, 'abort');
});

test('v14 Delta-Schnappschuss: Gast landet nach Deltas beim selben Stand wie mit vollen Schnappschüssen, Deltas klein, ein Teil', () => {
  const m = MISSIONS[0], rng = seededRng(7), setup = pickSetup(m, rng);
  const st = createQuest({ mission: m, setup, team: TEAM(), rng, maxUnits: 4 });
  const viaDelta = createQuest({ mission: m, setup, team: TEAM(), rng: seededRng(7), maxUnits: 4 });
  const viaFull = createQuest({ mission: m, setup, team: TEAM(), rng: seededRng(7), maxUnits: 4 });
  const d = createDelta(), pr = seededRng(11); let bytes = 0, n = 0;
  for (let k = 0; k < 200; k++) {
    const cmds = k % 40 ? [] : st.units.map(u => ({ type: 'move', unit: u.i, to: { x: pr() * st.w, y: pr() * st.h }, by: u.owner }));
    tick(st, 50, cmds);
    if (k % 4) continue;
    const full = questSnapshot(st), delta = JSON.parse(JSON.stringify(d.next(full)));
    if (k) { bytes += JSON.stringify(delta).length; n++; assert.ok(JSON.stringify(delta).length < 4000, `Delta ${JSON.stringify(delta).length}`); }
    applyQuestSnapshot(viaDelta, delta); applyQuestSnapshot(viaFull, JSON.parse(JSON.stringify(full)));
  }
  assert.deepEqual(questSnapshot(viaDelta), questSnapshot(viaFull));
  assert.ok(bytes / n < 2500, `Delta im Schnitt ${Math.round(bytes / n)} B`);
  d.reset();
  assert.deepEqual(d.next(questSnapshot(st)), questSnapshot(st)); // nach reset wieder voll
  const paused = createDelta(); paused.next(questSnapshot(st));
  assert.equal('time' in paused.next(questSnapshot(st)), false); // steht die Zeit, fehlt time im Delta
});
