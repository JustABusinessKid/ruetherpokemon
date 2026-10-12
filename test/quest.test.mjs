import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, castRay, lineOfSight } from '../js/quest/path.js';
import { createQuest, tick, canExtract, questSummary, visibleCone, abilitiesFor, abilityTargets, ABILITIES, ENEMY_TYPES, tileAt } from '../js/quest/engine.js';
import { MISSIONS, MISSION_BY_ID, buildSetup } from '../js/quest/missions.js';
import { makeFighter } from '../js/battle.js';
import { RUETHERS, RUETHER_BY_ID } from '../js/data.js';
import { seededRng } from '../js/quests.js';

const F = id => makeFighter(RUETHER_BY_ID[id]);
// Test-Mission aus einer Karte; Optionen überschreiben Missionsfelder
function Q(map, enemies = [], { team = ['christian'], ...opts } = {}) {
  const mission = {
    id: 'test', name: 'Test', theme: 'neuschwabenland', timeMs: 600_000, gate: [1, 2], coins: 2, reinforce: 'pinguin',
    objective: { type: 'steal', min: 1, label: 'Test' }, texts: { success: 'ok', fail: 'nein' }, map, variants: [{ id: 'v', enemies }], ...opts,
  };
  return createQuest({ mission, variant: 'v', team: team.map(t => (typeof t === 'string' ? F(t) : t)), rng: seededRng(1) });
}
const place = (o, x, y) => Object.assign(o, { x: x + 0.5, y: y + 0.5, path: [], goal: o.patrol ? null : { x, y }, intent: null, busy: null });
function run(st, ms, cmds = []) {
  const ev = [];
  for (let t = 0; t < ms; t += 50) ev.push(...tick(st, 50, t === 0 ? cmds : []));
  return ev;
}
const has = (ev, type, f = () => true) => ev.some(e => e.type === type && f(e));
const find = (ev, type, f = () => true) => ev.find(e => e.type === type && f(e));
const ab = (unit, ability, target) => ({ type: 'ability', unit, ability, target });
const coneLen = (st, i) => Math.max(0, ...visibleCone(st, i).slice(1).map(p => Math.hypot(p.x - st.enemies[i].x, p.y - st.enemies[i].y)));

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
const VAULT = [
  '##########',
  '#PPP.....#',
  '#....C...#',
  '#........#',
  '##########',
];

// ---------- path.js ----------

test('A*: 8 Richtungen, keine Ecken schneiden, L-Türen sperren, near', () => {
  const pass = g => (x, y) => !'#L'.includes(g[y][x]);
  let p = findPath(5, 3, pass(['.....', '.....', '.....']), 0, 0, 4, 2);
  assert.equal(p.length, 4); // 2 diagonal + 2 gerade
  assert.deepEqual(p.at(-1), { x: 4, y: 2 });
  // Wand neben dem Start: keine Diagonale an der Ecke vorbei
  assert.deepEqual(findPath(2, 2, pass(['.#', '..']), 0, 0, 1, 1), [{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  // diagonal zwischen zwei Wänden durch: verboten
  assert.equal(findPath(2, 2, pass(['.#', '#.']), 0, 0, 1, 1), null);
  // L sperrt, D lässt durch
  assert.equal(findPath(5, 3, pass(['..#..', '..L..', '..#..']), 0, 1, 4, 1), null);
  assert.equal(findPath(5, 3, pass(['..#..', '..D..', '..#..']), 0, 1, 4, 1).length, 4);
  // near=1.5: neben ein festes Ziel (auch diagonal), [] wenn schon da
  const g = ['.....', '..#..', '.....'];
  assert.deepEqual(findPath(5, 3, pass(g), 0, 1, 2, 1, 1.5), [{ x: 1, y: 1 }]);
  assert.deepEqual(findPath(5, 3, pass(g), 1, 1, 2, 1, 1.5), []);
  assert.deepEqual(findPath(5, 3, pass(g), 1, 0, 2, 1, 1.5), []);
  assert.deepEqual(findPath(5, 3, pass(g), 0, 0, 2, 1, 4), []); // Radius
  assert.equal(findPath(5, 3, pass(g), 0, 1, 2, 1), null); // Wand selbst ist kein Ziel
});

test('Sichtstrahl: Wände, Deckung (~), diagonale Lücken, Abstand', () => {
  const blk = g => (x, y) => x < 0 || y < 0 || x >= g[0].length || y >= g.length || '#~'.includes(g[y][x]);
  const G = ['.....', '..#..', '.....'];
  assert.ok(lineOfSight(blk(G), 0.5, 0.5, 4.5, 0.5));
  assert.ok(!lineOfSight(blk(G), 0.5, 1.5, 4.5, 1.5));
  // wer auf ~ steht, ist unsichtbar; wer drin steht, sieht raus
  assert.ok(!lineOfSight(blk(['..~..']), 0.5, 0.5, 2.5, 0.5));
  assert.ok(lineOfSight(blk(['..~..']), 2.5, 0.5, 0.5, 0.5));
  assert.ok(!lineOfSight(blk(['.#', '#.']), 0.5, 0.5, 1.5, 1.5));
  assert.ok(Math.abs(castRay(blk(G), 0.5, 1.5, 1, 0, 10) - 1.5) < 1e-9);
  assert.equal(castRay(blk(G), 0.5, 0.5, 1, 0, 3), 3);
});

// ---------- Sicht und Alarm ----------

test('Sicht: Kegel nach vorn, nicht hinter Wänden, nicht von hinten', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [5, 6], dir: 0 }]);
  const e = st.enemies[0], c = st.units[0];
  place(c, 10, 6); // 5 Kacheln, aber hinter der Wand x=9
  let ev = run(st, 2000);
  assert.equal(e.suspicion, 0);
  assert.ok(!has(ev, 'suspicious'));
  place(c, 2, 6); // hinter dem Pinguin
  run(st, 1000);
  assert.equal(e.suspicion, 0);
  place(c, 8, 6); // direkt davor
  ev = run(st, 400);
  assert.ok(e.suspicion > 0);
  const e0 = st.enemies[0], d = visibleCone(st, 0).slice(1).map(p => Math.hypot(p.x - e0.x, p.y - e0.y));
  assert.ok(Math.min(...d) <= 3.6, 'Kegel endet an der Wand');
});

test('Sicht: Gaswolke blockiert, danach sieht er wieder', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [2, 4], dir: 0 }], { team: ['viktor', 'christian'] });
  const [v, c] = st.units, e = st.enemies[0];
  place(v, 4, 1); place(c, 17, 1);
  const ev = run(st, 100, [ab(0, 'gas', { x: 4.5, y: 4.5 })]);
  const a = find(ev, 'ability');
  assert.equal(a.ability, 'gas');
  assert.equal(a.tiles.length, 9);
  assert.equal(a.ms, 10_000);
  assert.ok(coneLen(st, 0) < 1.6);
  place(c, 7, 4);
  run(st, 2000);
  assert.equal(e.suspicion, 0);
  run(st, 8500); // Gas weg
  run(st, 300);
  assert.ok(e.suspicion > 0);
});

test('suspicion: ? ab 0,3, ! bei 1, Alarm +0,34; nah = schneller; Himmler doppelt', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [5, 4], dir: 0 }]);
  place(st.units[0], 8, 4);
  const ev = run(st, 3000);
  const si = ev.findIndex(e => e.type === 'suspicious'), ai = ev.findIndex(e => e.type === 'alert');
  assert.ok(si >= 0 && ai > si);
  assert.ok(ev[si].say);
  assert.equal(st.enemies[0].state, 'alert');
  assert.ok(Math.abs(st.alarm - 0.34) < 0.01);
  assert.ok(st.alarmEver);
  const until = (type, d) => {
    const s = Q(ROOM, [{ type, at: [3, 4], dir: 0 }]);
    place(s.units[0], 3 + d, 4);
    for (let t = 50; t < 10_000; t += 50) if (has(tick(s, 50), 'suspicious')) return t;
    return Infinity;
  };
  assert.ok(until('pinguin', 2) < until('pinguin', 4));
  assert.ok(until('himmler', 3) < until('pinguin', 3));
});

test('Goebbels: Megafon = sofort Voll-Alarm, Verstärkung alle 15 s am Tor, Kegel +25 %', () => {
  const st = Q(ROOM, [{ type: 'goebbels', at: [5, 4], dir: 0 }], { gate: [18, 8], team: ['christian', 'hildegard'] });
  place(st.units[0], 7, 4);
  let ev = run(st, 3000);
  assert.equal(find(ev, 'alert').megafon, true);
  const fa = find(ev, 'fullAlarm');
  assert.equal(st.alarm, 1);
  assert.ok(st.fullAlarm);
  ev = run(st, fa.reinforceAt - st.time - 100);
  assert.ok(!has(ev, 'reinforce'));
  ev = run(st, 200);
  const r = find(ev, 'reinforce');
  assert.equal(r.enemies.length, 2);
  for (const i of r.enemies) {
    const e = st.enemies[i];
    assert.equal(e.type, 'pinguin');
    assert.ok(e.reinforcement);
  }
  assert.equal(st.reinforceAt, fa.reinforceAt + 15_000); // nächste Welle 15 s später
  // Kegel im Voll-Alarm 25 % weiter
  const s2 = Q(ROOM, [{ type: 'pinguin', at: [2, 4], dir: 0 }]);
  assert.ok(Math.abs(coneLen(s2, 0) - 5) < 1e-6);
  s2.fullAlarm = true;
  assert.ok(Math.abs(coneLen(s2, 0) - 6.25) < 1e-6);
});

test('Alarm sinkt ohne Sichtkontakt um 0,02/s, Voll-Alarm endet unter 0,5', () => {
  const st = Q(ROOM, []);
  st.alarm = 0.52; st.fullAlarm = true; st.reinforceAt = Infinity;
  let ev = run(st, 500);
  assert.ok(Math.abs(st.alarm - 0.51) < 1e-6);
  ev = run(st, 1000);
  assert.ok(has(ev, 'alarmOff'));
  assert.equal(st.fullAlarm, false);
});

test('Alarmierter Gegner jagt und schlägt zu (dps × 2,5), Rüther wehrt sich mit 5 × power, Gegner hat HP × 1,6, KO bei 0 HP', () => {
  const st = Q(ROOM, [{ type: 'drohne', at: [6, 4], dir: 180 }], { team: ['christian', 'micha', 'viktor'] });
  const [c, m, v] = st.units, e = st.enemies[0];
  assert.equal(e.maxHp, Math.round(ENEMY_TYPES.drohne.hp * 1.6));
  place(c, 4, 4); place(m, 4, 3); place(v, 4, 5); // zu dritt gegen eine Drohne
  const ev = run(st, 25_000);
  assert.ok(has(ev, 'hit', h => h.from === 'enemy' && h.damage === Math.round(ENEMY_TYPES.drohne.dps * 2.5 * st.dmgScale)));
  assert.ok(has(ev, 'hit', h => h.from === 'unit' && h.damage === Math.round(5 * c.power)));
  assert.ok(has(ev, 'ko', k => k.by === 'kampf'));
  assert.equal(e.state, 'ko');
});

// ---------- Kräfte ----------

test('abilitiesFor: ohne Loadout die 2 festen auf Stufe 1, unbekannt keine; 25 Fähigkeiten', () => {
  for (const r of RUETHERS) {
    const list = abilitiesFor(r.id);
    assert.equal(list.length, 2, r.id);
    for (const a of list) assert.ok(a.name && a.icon && a.cd > 0 && a.level === 1 && a.text && a.kind === 'fixed', a.id);
    const st = Q(ROOM, [], { team: [r.id] });
    assert.deepEqual(abilitiesFor(st.units[0]).map(a => a.id), list.map(a => a.id)); // kein dritter Slot
  }
  assert.deepEqual(abilitiesFor('hitler'), []);
  assert.equal(Object.keys(ABILITIES).length, 25);
  assert.equal(ABILITIES.handbag, undefined);
});

test('Kraft Plus 70 Prozent: L wird nach 900 ms offen, Abklingzeit, läuft erst hin', () => {
  const MAP = ['##########', '#PPP.#...#', '#....L...#', '#....L...#', '##########'];
  const st = Q(MAP, []);
  const c = st.units[0];
  assert.ok(has(tick(st, 0, [{ type: 'move', unit: 0, to: { x: 7, y: 2 } }]), 'fail', f => f.reason === 'path'));
  const [d1, d2] = st.doors.filter(d => d.locked);
  assert.deepEqual(abilityTargets(st, 0, 'plus70').map(t => t.door), [d1.id, d2.id]);
  // Christian steht auf P (1,1): zu weit, er läuft hin
  let ev = run(st, 3000, [ab(0, 'plus70', { door: d1.id })]);
  assert.equal(find(ev, 'ability').ms, 900);
  assert.ok(has(ev, 'doorOpen', o => o.door === d1.id));
  assert.equal(tileAt(st, d1.x, d1.y), 'D');
  assert.ok(findPath(st.w, st.h, (x, y) => '.DPX~'.includes(st.tiles[y * st.w + x]), Math.floor(c.x), Math.floor(c.y), 7, 2));
  ev = run(st, 50, [ab(0, 'plus70', { door: d2.id })]);
  assert.ok(has(ev, 'fail', f => f.reason === 'cd'));
  ev = run(st, 8000, [ab(0, 'plus70', { door: d2.id })]);
  run(st, 9000, [ab(0, 'plus70', { door: d2.id })]);
  assert.equal(tileAt(st, d2.x, d2.y), 'D');
});

test('Kraft Dosenbier: Scheppern, Gegner in 5 Kacheln sehen 6 s nach, dann Patrouille', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [12, 4], dir: 0 }, { type: 'pinguin', at: [17, 8], dir: 0 }]);
  place(st.units[0], 3, 1);
  let ev = run(st, 1500, [ab(0, 'beer', { x: 8.5, y: 4.5 })]);
  const a = find(ev, 'ability');
  assert.equal(a.item, 'can');
  assert.ok(a.ms > 300);
  const n = find(ev, 'noise');
  assert.deepEqual(n.enemies, [0]);
  assert.equal(n.r, 5);
  assert.equal(st.enemies[0].state, 'distracted');
  assert.equal(st.enemies[1].state, 'patrol');
  run(st, 2500);
  assert.ok(Math.hypot(st.enemies[0].x - 8.5, st.enemies[0].y - 4.5) < 1.6, 'steht am Geräusch');
  assert.equal(st.enemies[0].state, 'distracted');
  ev = run(st, 7000);
  assert.ok(has(ev, 'calm', c => c.enemy === 0));
  assert.equal(st.enemies[0].state, 'patrol');
});

test('Würfe: Ziel hinter verschlossener Tür, er läuft nur bis in Wurfweite', () => {
  const MAP = ['############', '#PPP.#.....#', '#....L.....#', '#....#.....#', '############'];
  const st = Q(MAP, [{ type: 'pinguin', at: [9, 3], dir: 0 }]);
  place(st.units[0], 1, 3);
  const ev = run(st, 3000, [ab(0, 'beer', { x: 8.5, y: 2.5 })]);
  const a = find(ev, 'ability');
  assert.ok(a && Math.hypot(a.x - 8.5, a.y - 2.5) <= 6);
  assert.deepEqual(find(ev, 'noise').enemies, [0]);
  assert.ok(!has(ev, 'fail'));
});

test('Kraft Familientreffen: die 2 nächsten Gegner in 5 Kacheln dauerhaft KO, nur im Kampf', () => {
  const st = Q(ROOM, [6, 7, 8].map(x => ({ type: 'pinguin', at: [x, 4], dir: 0 })), { team: ['hildegard'] });
  place(st.units[0], 4, 4);
  const ev = run(st, 2000, [ab(0, 'family', {})]);
  const a = find(ev, 'ability');
  assert.deepEqual(a.targets, [0, 1]);
  assert.deepEqual(a.helpers.map(h => h.id), ['christian', 'micha']);
  assert.equal(a.ms, 1500);
  assert.ok(has(ev, 'ko', k => k.enemy === 0 && k.tied && k.by === 'family'));
  assert.equal(st.enemies[0].state, 'ko');
  assert.equal(st.enemies[1].state, 'ko');
  assert.notEqual(st.enemies[2].state, 'ko');
  run(st, 60_000);
  assert.equal(st.enemies[0].state, 'ko'); // dauerhaft
  const s2 = Q(ROOM, [{ type: 'pinguin', at: [15, 4], dir: 0 }], { team: ['hildegard'] });
  place(s2.units[0], 4, 4);
  assert.ok(has(tick(s2, 50, [ab(0, 'family', {})]), 'fail', f => f.reason === 'noEnemy'));
  assert.equal(s2.units[0].cd.family, undefined);
});

test('Kraft Giftgas: Gegner darin husten (betäubt), Drohne nicht, nach 10 s vorbei', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [11, 4], dir: 0 }, { type: 'drohne', at: [11, 3], dir: 0 }], { team: ['viktor'] });
  place(st.units[0], 7, 4);
  let ev = run(st, 200, [ab(0, 'gas', { x: 11.5, y: 4.5 })]);
  assert.ok(has(ev, 'stun', s => s.enemy === 0 && s.reason === 'gas' && s.say === '*hust*'));
  assert.equal(st.enemies[0].state, 'stunned');
  assert.equal(st.enemies[1].state, 'patrol');
  assert.ok(st.effects.some(f => f.kind === 'gas'));
  ev = run(st, 10_000);
  assert.ok(has(ev, 'effectEnd', f => f.kind === 'gas'));
  assert.ok(has(ev, 'wake', w => w.enemy === 0 && w.reason === 'gas'));
  assert.notEqual(st.enemies[0].state, 'stunned');
});

test('Kraft Argumentationslogik: 8 s stumm, Kegel aus, Sprechblase', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [9, 3], dir: 0 }], { team: ['viktor'] });
  place(st.units[0], 7, 3);
  let ev = run(st, 100, [ab(0, 'argue', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').say, 'Deutsche Bank ist kein Geringverdiener.');
  assert.equal(find(ev, 'stun').say, '…');
  assert.equal(st.enemies[0].reason, 'argue');
  assert.deepEqual(visibleCone(st, 0), []);
  ev = run(st, 8000);
  assert.ok(has(ev, 'wake'));
  assert.ok(visibleCone(st, 0).length > 2);
});

test('Kraft Controllerwurf: Fernkampf-KO 10 s mit Sichtlinie, läuft bis in Reichweite', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [16, 4], dir: 0 }], { team: ['micha'] });
  place(st.units[0], 2, 4);
  const ev = run(st, 6000, [ab(0, 'controller', { enemy: 0 })]);
  const a = find(ev, 'ability');
  assert.equal(a.item, 'controller');
  assert.ok(Math.hypot(a.x - 16.5, a.y - 4.5) <= 6);
  assert.ok(has(ev, 'stun', s => s.reason === 'controller' && s.ms === 10_000));
  assert.equal(st.enemies[0].state, 'stunned');
});

test('Kraft Hardware-Wallet: am Tresor sofort volle Taschen, Drohne 10 s aus, sonst ungültig', () => {
  const st = Q(VAULT, [], { team: ['micha'], coins: 3 });
  place(st.units[0], 4, 2);
  let ev = tick(st, 50, [ab(0, 'wallet', { obj: 0 })]);
  assert.equal(find(ev, 'ability').mode, 'vault');
  assert.equal(find(ev, 'steal').n, 2);
  assert.equal(st.units[0].carry, 2);
  assert.equal(st.objs[0].coins, 1);
  const s2 = Q(ROOM, [{ type: 'drohne', at: [8, 4], dir: 0 }, { type: 'pinguin', at: [8, 6], dir: 0 }], { team: ['micha'] });
  place(s2.units[0], 4, 4);
  ev = tick(s2, 50, [ab(0, 'wallet', { enemy: 1 })]);
  assert.ok(has(ev, 'fail', f => f.reason === 'target'));
  ev = tick(s2, 50, [ab(0, 'wallet', { enemy: 0 })]);
  assert.ok(has(ev, 'stun', s => s.reason === 'hack' && s.ms === 10_000));
  assert.deepEqual(abilityTargets(s2, 0, 'wallet').map(t => t.enemy), [0]); // nur Drohnen, Pinguin nicht
});

test('Kraft Abgelaufene M&Ms: nächster Wachgänger in 6 Kacheln isst, 20 s KO; Drohnen essen nicht', () => {
  const MAP = ['####################', '#PPP...............#', '#..................#', '#...~..............#', '#..................#', '####################'];
  const st = Q(MAP, [{ type: 'pinguin', at: [12, 3], dir: 0 }, { type: 'drohne', at: [8, 1], dir: 0 }], { team: ['ramona'] });
  place(st.units[0], 4, 3); // in Deckung
  let ev = run(st, 5000, [ab(0, 'mms', { x: 7.5, y: 3.5 })]);
  assert.equal(find(ev, 'ability').item, 'mms');
  assert.ok(has(ev, 'bait'));
  assert.equal(find(ev, 'baitTaken').enemy, 0);
  assert.ok(has(ev, 'stun', s => s.enemy === 0 && s.reason === 'eat' && s.ms === 20_000));
  assert.equal(st.enemies[0].state, 'eating');
  assert.equal(st.enemies[1].state, 'patrol');
  assert.ok(!st.effects.some(f => f.kind === 'mms'));
  ev = run(st, 20_000);
  assert.ok(has(ev, 'wake', w => w.enemy === 0 && w.say === 'Mir ist schlecht ...'));
});

test('Kraft Unlimited Credits: angrenzender Gegner 25 s bestochen, dreht sich weg', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [8, 4], dir: 180 }], { team: ['ramona'] });
  place(st.units[0], 7, 4);
  let ev = tick(st, 50, [ab(0, 'credits', { enemy: 0 })]);
  assert.ok(has(ev, 'stun', s => s.reason === 'bribe' && s.ms === 25_000));
  assert.equal(st.enemies[0].state, 'bribed');
  assert.ok(Math.abs(st.enemies[0].dir) < 1e-9); // schaut von Ramona weg nach Osten
  assert.deepEqual(visibleCone(st, 0), []);
  ev = run(st, 25_000);
  assert.ok(has(ev, 'wake', w => w.reason === 'bribe'));
  assert.equal(st.enemies[0].state, 'patrol');
});

test('Kräfte: fremde Kraft, Abklingzeit und Ziele werden geprüft', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [15, 4], dir: 0 }], { team: ['viktor'] });
  assert.ok(has(tick(st, 0, [ab(0, 'plus70', { door: 0 })]), 'fail', f => f.reason === 'ability'));
  assert.ok(has(tick(st, 0, [ab(0, 'gas', { x: 0.5, y: 0.5 })]), 'fail', f => f.reason === 'target'));
  assert.ok(has(tick(st, 0, [ab(0, 'argue', { enemy: 9 })]), 'fail', f => f.reason === 'target'));
  place(st.units[0], 4, 4);
  tick(st, 50, [ab(0, 'gas', { x: 6.5, y: 4.5 })]);
  assert.ok(has(tick(st, 50, [ab(0, 'gas', { x: 6.5, y: 4.5 })]), 'fail', f => f.reason === 'cd'));
});

// ---------- Interaktion, Abliefern, Ende ----------

test('Klau: 3 s pro Münze, höchstens 2, Abliefern auf der Plattform', () => {
  const st = Q(VAULT, [], { coins: 3 });
  const c = st.units[0];
  place(c, 4, 2);
  let ev = run(st, 3000, [{ type: 'interact', unit: 0, obj: 0 }]);
  assert.equal(find(ev, 'interactStart').ms, 3000);
  assert.equal(c.carry, 1);
  ev = run(st, 3100);
  assert.equal(c.carry, 2);
  assert.equal(c.busy, null);
  assert.equal(st.objs[0].coins, 1);
  assert.ok(has(tick(st, 0, [{ type: 'interact', unit: 0, obj: 0 }]), 'fail', f => f.reason === 'full'));
  ev = run(st, 2000, [{ type: 'move', unit: 0, to: { x: 2, y: 1 } }]);
  const d = find(ev, 'deliver');
  assert.equal(d.coins, 2);
  assert.equal(st.delivered, 2);
  assert.equal(st.objective.done, 2);
  assert.ok(has(ev, 'objective', o => o.reached));
  assert.equal(c.carry, 0);
});

test('Klau bricht ab, wenn der Rüther gesehen und alarmiert wird', () => {
  const st = Q(VAULT, [{ type: 'pinguin', at: [8, 3], dir: 180 }], { coins: 3 });
  place(st.units[0], 5, 3);
  const ev = run(st, 2900, [{ type: 'interact', unit: 0, obj: 0 }]);
  assert.ok(has(ev, 'alert'));
  assert.equal(find(ev, 'interactCancel').reason, 'entdeckt');
  assert.equal(st.units[0].carry, 0);
  assert.equal(st.objs[0].coins, 3);
});

test('Sabotage 4 s und Stecker 4 s erfüllen das Ziel', () => {
  const MAP = ['##########', '#PPP.....#', '#....S.K.#', '#........#', '##########'];
  for (const [type, kind] of [['sabotage', 'sabotage'], ['unplug', 'plug']]) {
    const st = Q(MAP, [], { objective: { type, label: 't' } });
    const o = st.objs.find(x => x.kind === kind);
    place(st.units[0], o.x, o.y + 1);
    let ev = run(st, 3900, [{ type: 'interact', unit: 0, obj: o.id }]);
    assert.equal(find(ev, 'interactStart').ms, 4000);
    assert.equal(o.done, false);
    ev = run(st, 200);
    assert.ok(has(ev, type === 'unplug' ? 'unplug' : 'sabotage'));
    assert.equal(st.objective.done, 1);
    assert.ok(has(tick(st, 0, [{ type: 'interact', unit: 0, obj: o.id }]), 'fail', f => f.reason === 'done'));
  }
});

test('PS3: 5 s aufheben, Warensicherung piept, 40 % langsamer, keine Kräfte, abliefern, abheben', () => {
  const MAP = ['############', '#PPP.......#', '#.......X..#', '#..........#', '############'];
  const st = Q(MAP, [{ type: 'detektiv', at: [9, 3], dir: 0 }], { team: ['micha', 'christian'], objective: { type: 'fetch', label: 'PS3' }, fetchMs: 5000, pickupNoise: 7 });
  const m = st.units[0];
  place(m, 7, 2);
  let ev = run(st, 5100, [{ type: 'interact', unit: 0, obj: 0 }]);
  assert.equal(find(ev, 'interactStart').ms, 5000);
  assert.ok(has(ev, 'pickup'));
  assert.ok(has(ev, 'noise', n => n.kind === 'alarmanlage' && n.enemies.includes(0)));
  assert.equal(m.item, true);
  assert.ok(has(tick(st, 0, [ab(0, 'controller', { enemy: 0 })]), 'fail', f => f.reason === 'carry'));
  tick(st, 0, [{ type: 'move', unit: 0, to: { x: 4, y: 2 } }]);
  const x0 = m.x;
  tick(st, 1000);
  assert.ok(Math.abs((x0 - m.x) - 3 * 0.6) < 1e-6);
  ev = run(st, 3000, [{ type: 'move', unit: 0, to: { x: 1, y: 1 } }]);
  assert.ok(has(ev, 'deliver', d => d.item));
  assert.equal(st.objective.done, 1);
  assert.equal(m.item, false);
  assert.ok(canExtract(st));
  ev = tick(st, 50, [{ type: 'extract' }]);
  assert.equal(find(ev, 'end').result, 'success');
  assert.equal(questSummary(st).score, 1);
});

test('extract: erst mit Ziel und allen Stehenden auf P; Liegengelassene kosten Wertung', () => {
  const st = Q(VAULT, [], { team: ['christian', 'viktor'] });
  const [c, v] = st.units;
  assert.equal(canExtract(st), false);
  st.delivered = 2;
  tick(st, 50);
  assert.equal(canExtract(st), true);
  place(v, 6, 3);
  assert.equal(canExtract(st), false);
  assert.ok(has(tick(st, 50, [{ type: 'extract' }]), 'fail', f => f.action === 'extract'));
  v.down = true; v.hp = 0;
  assert.equal(canExtract(st), true);
  const ev = tick(st, 50, [{ type: 'extract' }]);
  const end = find(ev, 'end');
  assert.equal(end.result, 'success');
  assert.equal(end.reason, 'extract');
  assert.equal(end.text, 'ok');
  assert.deepEqual({ ...end.summary }, {
    result: 'success', reason: 'extract', missionId: 'test', layoutId: null, variantId: 'v', mirror: false, setup: { layoutId: null, variantId: 'v', mirror: false, seed: 0 },
    score: 1, objective: { done: 2, total: 2, min: 1 }, timeMs: st.time, alarmFree: true, delivered: 2, leftBehind: 1, kieser: 0, fine: 0,
  });
  assert.equal(end.fine, 0);
  assert.equal(end.kieser, 0);
  assert.equal(c.down, false);
  assert.deepEqual(tick(st, 50, [{ type: 'move', unit: 0, to: { x: 5, y: 3 } }]), []); // vorbei
});

test('down und Wiederbeleben: 3 s daneben, 40 % HP; alle down = gescheitert', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [8, 4], dir: 180 }], { team: ['christian', 'viktor'] });
  const [c, v] = st.units, e = st.enemies[0];
  place(c, 7, 4); c.hp = 5;
  Object.assign(e, { state: 'alert', lastSeen: { x: c.x, y: c.y } });
  let ev = run(st, 1100);
  assert.ok(has(ev, 'down', d => d.unit === 0 && d.by === 0));
  assert.equal(c.down, true);
  assert.equal(c.state, 'down');
  assert.ok(has(tick(st, 0, [{ type: 'move', unit: 0, to: { x: 2, y: 2 } }]), 'fail', f => f.reason === 'down'));
  e.state = 'ko';
  ev = run(st, 6000, [{ type: 'interact', unit: 1, obj: { unit: 0 } }]);
  assert.equal(find(ev, 'interactStart').kind, 'revive');
  const r = find(ev, 'revive');
  assert.equal(r.target, 0);
  assert.equal(c.down, false);
  assert.equal(c.hp, Math.round(c.maxHp * 0.4));
  c.down = v.down = true;
  ev = tick(st, 50);
  assert.equal(find(ev, 'end').reason, 'allDown');
  assert.equal(st.result, 'fail');
});

test('Zeitablauf: Raub mit erreichtem Ziel gilt, sonst gescheitert; aufgeben = abort', () => {
  const a = Q(VAULT, [], { timeMs: 1000 });
  a.delivered = 1;
  let ev = run(a, 1100);
  assert.equal(find(ev, 'end').result, 'success');
  assert.equal(a.reason, 'time');
  const b = Q(VAULT, [], { timeMs: 1000 });
  run(b, 1100);
  assert.equal(b.result, 'fail');
  const c = Q(VAULT, [], { timeMs: 1000, objective: { type: 'sabotage', label: 't' } });
  run(c, 1100);
  assert.equal(c.result, 'fail');
  const d = Q(VAULT, []);
  ev = tick(d, 50, [{ type: 'abort' }]);
  assert.equal(find(ev, 'end').result, 'abort');
  assert.equal(d.over, true);
});

test('Pause: tick mit dt 0 nimmt Befehle an, die Zeit steht', () => {
  const st = Q(ROOM, []);
  const ev = tick(st, 0, [{ type: 'move', unit: 0, to: { x: 10, y: 4 } }]);
  const p = find(ev, 'path');
  assert.deepEqual(p.to, { x: 10, y: 4 });
  assert.ok(p.path.length > 0);
  assert.equal(st.time, 0);
  const x0 = st.units[0].x;
  assert.equal(x0, 2.5);
  run(st, 500);
  assert.ok(st.units[0].x > x0);
  // zwei Rüther aufs selbe Feld: der zweite nimmt das Nachbarfeld
  const s2 = Q(ROOM, [], { team: ['christian', 'micha'] });
  tick(s2, 0, [{ type: 'move', unit: 0, to: { x: 10, y: 4 } }, { type: 'move', unit: 1, to: { x: 10, y: 4 } }]);
  assert.notDeepEqual(s2.units[0].goal, s2.units[1].goal);
});

// ---------- Missionen (v9: Layouts × Varianten × Spiegelung über buildSetup) ----------

// Alle Kombinationen; seed fest, damit Patrouillen-Versatz und Beute reproduzierbar sind
const combos = (seed = 7) => MISSIONS.flatMap(m => m.layouts.flatMap(l => l.variants.flatMap(v => [false, true].map(mirror => ({
  m, tag: `${m.id}/${l.id}/${v.id}${mirror ? '/gespiegelt' : ''}`, setup: { layoutId: l.id, variantId: v.id, mirror, seed },
})))));
const teamFor = (m, ids) => (m.solo ? [m.solo, ...ids] : ids).map(F);
const passClosed = st => (x, y) => '.DPX~'.includes(st.tiles[y * st.w + x]);

test('Missionen: Engine kennt jede Kachel und jeden Gegnertyp, Zustand trägt setup, layoutId und mirror', () => {
  for (const { m, tag, setup } of combos()) {
    const st = createQuest({ mission: m, setup, team: teamFor(m, ['christian', 'micha', 'viktor']), rng: seededRng(1) });
    assert.match(st.tiles.join(''), /^[#.DLPCSKV~BWT]+$/, tag);
    for (const e of st.enemies) assert.ok(ENEMY_TYPES[e.type], `${tag}: ${e.type}`);
    assert.deepEqual(st.setup, setup, tag);
    assert.equal(st.layoutId, setup.layoutId);
    assert.equal(st.mirror, setup.mirror);
    assert.equal(st.timeLimit, m.timeMs ?? null, tag);
    assert.equal(st.units.length, m.solo ? 1 : 3, tag);
    if (m.solo) assert.equal(st.units[0].id, m.solo, tag);
    for (const u of st.units) assert.equal(tileAt(st, u.x, u.y), 'P', tag);
    const kind = { steal: 'vault', sabotage: 'sabotage', fetch: 'item', unplug: 'plug', valve: 'valve', ignite: 'tree' }[m.objective.type];
    const n = st.objs.filter(o => o.kind === kind).length;
    assert.ok(n >= 1, tag);
    if (m.objective.type === 'steal') assert.ok(st.objective.total >= st.objective.min + 2, tag);
    else assert.equal(st.objective.total, ['sabotage', 'valve', 'ignite'].includes(m.objective.type) ? n : 1, tag);
  }
});

test('jede Kombination lösbar (Engine-Zustand): Weg von P zu jedem Ziel ohne L-Türen, Tor und Wegpunkte erreichbar', () => {
  for (const { m, tag, setup } of combos()) {
    const st = createQuest({ mission: m, setup, team: teamFor(m, ['christian']), rng: seededRng(1) });
    const p = st.spots[0];
    for (const o of st.objs) assert.ok(findPath(st.w, st.h, passClosed(st), p.x, p.y, o.x, o.y, 1.5), `${tag}: ${o.kind}@${o.x},${o.y} ohne L unerreichbar`);
    assert.ok(passClosed(st)(st.gate.x, st.gate.y), `${tag}: Tor`);
    for (const e of st.enemies) {
      const ex = Math.floor(e.x), ey = Math.floor(e.y);
      assert.ok(passClosed(st)(ex, ey), `${tag}: Gegner ${e.i} in der Wand`);
      for (const w of e.patrol) assert.ok(findPath(st.w, st.h, passClosed(st), ex, ey, w.x, w.y), `${tag}: Wegpunkt ${w.x},${w.y}`);
    }
  }
});

test('jede Kombination: 30 s auf der Plattform warten bleibt unentdeckt, Patrouillen laufen', () => {
  for (const { m, tag, setup } of combos(3)) {
    const st = createQuest({ mission: m, setup, team: teamFor(m, ['christian', 'hildegard', 'ramona']), rng: seededRng(3) });
    const start = st.enemies.map(e => [e.x, e.y]);
    const ev = run(st, 30_000);
    assert.ok(!has(ev, 'suspicious') && !has(ev, 'alert') && !has(ev, 'kieser') && !has(ev, 'caught'), tag);
    assert.ok(st.enemies.some((e, i) => e.x !== start[i][0] || e.y !== start[i][1]), `${tag} niemand läuft`);
  }
});

test('Setup: gleicher Seed = gleicher Zustand und Ablauf, verschiedene Seeds würfeln Layouts/Varianten/Spiegelung', () => {
  const team = ['christian', 'micha', 'viktor'].map(F);
  const play = seed => {
    const st = createQuest({ mission: 'tachionenraub', team, rng: seededRng(seed) });
    const log = [];
    for (let i = 0; i < 800; i++) {
      const cmds = i === 0 ? [{ type: 'move', unit: 0, to: { x: 12, y: 10 } }, { type: 'interact', unit: 1, obj: 0 }, { type: 'move', unit: 2, to: { x: 20, y: 12 } }]
        : i === 120 ? [ab(0, 'beer', { x: 14.5, y: 8.5 })] : [];
      log.push(...tick(st, 50, cmds));
    }
    return { setup: st.setup, log: JSON.stringify(log), units: JSON.stringify(st.units), enemies: JSON.stringify(st.enemies), alarm: st.alarm };
  };
  assert.deepEqual(play(5), play(5));
  const seen = new Set();
  for (let s = 1; s <= 60; s++) { const st = createQuest({ mission: 'hangar', team, rng: seededRng(s * 2654435761) }); seen.add(`${st.layoutId}/${st.variantId}/${st.mirror}`); }
  assert.ok(seen.size >= 4, [...seen].join(' '));
  // gleiches setup, anderer rng: gleicher Startzustand
  const l = MISSION_BY_ID.hangar.layouts[0], setup = { layoutId: l.id, variantId: l.variants[1].id, mirror: true, seed: 77 };
  const snap = st => JSON.stringify([st.tiles, st.objs, st.enemies, st.units, st.gate]);
  assert.equal(snap(createQuest({ mission: 'hangar', setup, team, rng: seededRng(1) })), snap(createQuest({ mission: 'hangar', setup, team, rng: seededRng(2) })));
  assert.throws(() => createQuest({ mission: 'gibtsnicht', team }));
  assert.throws(() => createQuest({ mission: 'hangar', variant: 'gibtsnicht', team }));
  assert.throws(() => createQuest({ mission: 'hangar', setup: { layoutId: 'gibtsnicht' }, team }));
});

test('Spiegeln: Zustand ist das waagerechte Spiegelbild, Ende meldet setup', () => {
  const m = MISSION_BY_ID.tachionenraub, l = m.layouts[0], team = ['christian', 'ramona'].map(F);
  const a = createQuest({ mission: m, setup: { layoutId: l.id, variantId: 'schicht', mirror: false, seed: 4 }, team });
  const b = createQuest({ mission: m, setup: { layoutId: l.id, variantId: 'schicht', mirror: true, seed: 4 }, team });
  const rows = st => Array.from({ length: st.h }, (_, y) => st.tiles.slice(y * st.w, (y + 1) * st.w).join(''));
  assert.deepEqual(rows(b), rows(a).map(r => [...r].reverse().join('')));
  assert.deepEqual(b.gate, { x: a.w - 1 - a.gate.x, y: a.gate.y });
  assert.deepEqual(b.objs.map(o => `${o.x},${o.y}:${o.coins}`).sort(), a.objs.map(o => `${a.w - 1 - o.x},${o.y}:${o.coins}`).sort());
  for (const [i, e] of a.enemies.entries()) assert.ok(Math.abs(b.enemies[i].x - (a.w - e.x)) < 1e-9 && b.enemies[i].y === e.y);
  const end = find(tick(b, 50, [{ type: 'abort' }]), 'end');
  assert.deepEqual(end.summary.setup, { layoutId: l.id, variantId: 'schicht', mirror: true, seed: 4 });
  assert.deepEqual(end.setup, end.summary.setup);
  assert.equal(end.summary.layoutId, l.id);
  assert.equal(end.summary.mirror, true);
  // Kompatibilität: variant ohne setup = Layout dieser Variante, ungespiegelt
  const c = createQuest({ mission: 'hangar', variant: 'nacht', team, rng: seededRng(2) });
  assert.equal(c.layoutId, 'halle');
  assert.equal(c.mirror, false);
});

test('Zustand: Rüther auf der Plattform mit echten ids, Objekte und Türen gelesen', () => {
  const setup = { layoutId: 'tresor', variantId: 'schicht', mirror: false, seed: 1 };
  const st = createQuest({ mission: 'tachionenraub', setup, team: ['christian', 'ramona'].map(F) });
  const built = buildSetup(MISSION_BY_ID.tachionenraub, setup);
  assert.deepEqual(st.units.map(u => u.id), ['christian', 'ramona']);
  for (const u of st.units) { assert.equal(tileAt(st, u.x, u.y), 'P'); assert.equal(u.hp, u.maxHp); }
  assert.equal(st.objs.filter(o => o.kind === 'vault').length, 8);
  for (const o of st.objs) assert.equal(o.coins, built.coins[`${o.x},${o.y}`]);
  assert.equal(st.objs.find(o => o.x === 29 && o.y === 13).coins, 0);
  assert.ok(st.doors.some(d => d.locked) && st.doors.some(d => !d.locked));
  assert.equal(st.objective.min, 3);
  assert.equal(st.timeLimit, 360_000);
  const cone = visibleCone(st, 0);
  assert.ok(cone.length > 10);
  assert.deepEqual(cone[0], { x: st.enemies[0].x, y: st.enemies[0].y });
});

test('Leistung: 1000 Ticks einer Mission unter 300 ms', () => {
  const st = createQuest({ mission: 'tachionenraub', variant: 'inventur', team: ['christian', 'micha', 'viktor'].map(F), rng: seededRng(9) });
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    const cmds = i === 0 ? [{ type: 'move', unit: 0, to: { x: 20, y: 10 } }, { type: 'interact', unit: 1, obj: 4 }, { type: 'move', unit: 2, to: { x: 25, y: 18 } }] : [];
    tick(st, 50, cmds);
    for (let k = 0; k < st.enemies.length; k++) visibleCone(st, k);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
});

// ---------- Fix-Runde 1 ----------

test('Wiederbeleben klappt auch, wenn der Liegende mitten im Schritt neben der Kachelmitte umfiel', () => {
  const st = Q(ROOM, [], { team: ['christian', 'micha'] });
  const [c, m] = st.units;
  place(c, 3, 1);
  Object.assign(m, { x: 5.95, y: 2.95, down: true, hp: 0, path: [], goal: null });
  const ev = run(st, 6000, [{ type: 'interact', unit: 0, obj: { unit: 1 } }]);
  assert.ok(!has(ev, 'fail'), JSON.stringify(find(ev, 'fail')));
  assert.ok(has(ev, 'revive', r => r.target === 1));
  assert.equal(m.down, false);
});

test('Patrouille: während der Wartezeit Blick des erreichten Wegpunkts, nicht des nächsten', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [6, 8], dir: 0, patrol: [[6, 8, 1500, 0], [15, 8, 1500, 180]] }]);
  const e = st.enemies[0], end = {};
  for (let t = 0; t < 14_000; t += 50) {
    tick(st, 50);
    if (st.time < e.waitUntil && e.waitUntil - st.time <= 100) end[Math.floor(e.x)] = e.dir;
  }
  assert.equal(e.state, 'patrol');
  assert.ok(Math.cos(end[6]) > 0.99, `bei x=6: ${end[6]}`);
  assert.ok(Math.cos(end[15]) < -0.99, `bei x=15: ${end[15]}`);
});

test('Zwei Rüther am selben Objekt: eine PS3, eine Sabotage, ein leerer Tresor werden nur einmal verbucht', () => {
  const MAP = ['############', '#PPP.......#', '#.......X..#', '#....S.....#', '############'];
  const both = id => [{ type: 'interact', unit: 0, obj: id }, { type: 'interact', unit: 1, obj: id }];
  let st = Q(MAP, [], { team: ['christian', 'micha'], objective: { type: 'fetch', label: 'PS3' }, fetchMs: 5000 });
  const item = st.objs.find(o => o.kind === 'item');
  place(st.units[0], 7, 2); place(st.units[1], 9, 2);
  let ev = run(st, 6000, both(item.id));
  assert.equal(ev.filter(x => x.type === 'pickup').length, 1);
  assert.ok(has(ev, 'fail', f => f.reason === 'taken'));
  assert.equal(st.units.filter(u => u.item).length, 1);
  st = Q(MAP, [], { team: ['christian', 'micha'], objective: { type: 'sabotage', label: 'S' } });
  const s = st.objs.find(o => o.kind === 'sabotage');
  place(st.units[0], 4, 3); place(st.units[1], 6, 3);
  ev = run(st, 5000, both(s.id));
  assert.equal(ev.filter(x => x.type === 'sabotage').length, 1);
  assert.equal(st.objective.done, 1);
  st = Q(VAULT, [], { team: ['christian', 'micha'], coins: 1 });
  place(st.units[0], 4, 2); place(st.units[1], 6, 2);
  ev = run(st, 4000, both(0));
  assert.equal(ev.filter(x => x.type === 'steal').length, 1);
  assert.equal(ev.filter(x => x.type === 'vaultEmpty').length, 1);
  assert.equal(st.units[0].carry + st.units[1].carry, 1);
});

test('Controllerwurf mit Regal an der Ecke: er läuft weiter, bis er freie Sicht hat (ps3 Ladenschluss)', () => {
  const st = createQuest({ mission: 'ps3', variant: 'ladenschluss', team: [F('micha')], rng: seededRng(1) });
  const m = st.units[0], det = st.enemies.find(e => e.x === 26.5 && e.y === 12.5);
  for (const e of st.enemies) if (e !== det) e.state = 'ko';
  place(m, 24, 16);
  const ev = run(st, 4000, [ab(0, 'controller', { enemy: det.i })]);
  assert.ok(!has(ev, 'fail', f => f.reason === 'sight'));
  assert.ok(has(ev, 'ability', a => a.ability === 'controller'));
});

test('Tür geht auf: laufende Umwege werden neu geplant', () => {
  const MAP = ['##########', '#PPP.#...#', '#....L...#', '#....#...#', '#....#...#', '#....#...#', '#....#...#', '#........#', '##########'];
  const st = Q(MAP, [], { team: ['christian', 'hildegard'] });
  const [c, h] = st.units, door = st.doors.find(d => d.locked);
  place(c, 4, 2); place(h, 3, 2);
  tick(st, 0, [ab(0, 'plus70', { door: door.id }), { type: 'move', unit: 1, to: { x: 7, y: 2 } }]);
  assert.ok(h.path.length >= 10); // Umweg unten herum
  run(st, 1000);
  assert.equal(tileAt(st, door.x, door.y), 'D');
  assert.ok(h.path.length <= 6, `noch ${h.path.length} Kacheln`); // alter Umweg: noch 9
  run(st, 2500);
  assert.deepEqual([Math.floor(h.x), Math.floor(h.y)], [7, 2]);
});

test('Zeitablauf mit erfülltem Ziel: eigener Text statt „Heizung brummt weiter“', () => {
  const MAP = ['##########', '#PPP.....#', '#......K.#', '##########'];
  const st = Q(MAP, [], { timeMs: 1000, objective: { type: 'unplug', label: 'K' } });
  st.objs[0].done = true;
  const end = find(run(st, 1100), 'end');
  assert.equal(end.result, 'fail');
  assert.ok(!end.text.includes('nein') && end.text.includes('Ziel erfüllt'), end.text);
  const st2 = Q(MAP, [], { timeMs: 1000, objective: { type: 'unplug', label: 'K' } });
  assert.ok(find(run(st2, 1100), 'end').text.endsWith('nein'));
});

test('Gegnerschaden wächst linear mit der Teamstärke (Ø maxBtc / 170) und ist im Nahkampf × 2,5', () => {
  const c = makeFighter(RUETHER_BY_ID.christian, { rarity: 'legendaer', level: 20 });
  const st = Q(ROOM, [{ type: 'pinguin', at: [6, 4], dir: 180 }], { team: [c] });
  const u = st.units[0], e = st.enemies[0];
  place(u, 5, 4);
  Object.assign(e, { state: 'alert', lastSeen: { x: u.x, y: u.y } });
  const hit = find(run(st, 1500), 'hit', h => h.from === 'enemy');
  assert.equal(hit.damage, Math.round(ENEMY_TYPES.pinguin.dps * 2.5 * c.maxBtc / 170));
  assert.ok(hit.damage >= 20 && hit.damage < c.maxBtc / 4, `${hit.damage} pro Schlag`); // tut weh, legt aber nicht in 1 s um
});

// ---------- v9: neue Kacheln, Ziele, Bernd, Ranger, Dackel, Platzwart ----------

test('Kacheln V/B/W/T: nicht begehbar; W und V lassen Sicht durch, B und T nicht; Würfe ins Wasser ja, auf Bäume nein', () => {
  const MAP = ['############', '#PPP.W.....#', '#....W.....#', '#....T.....#', '#....V.....#', '#....B.....#', '############'];
  const st = Q(MAP, []);
  assert.ok(has(tick(st, 0, [{ type: 'move', unit: 0, to: { x: 8, y: 2 } }]), 'fail', f => f.reason === 'path'));
  for (const [y, seen] of [[1, true], [3, false], [4, true], [5, false]]) {
    const s = Q(MAP, [{ type: 'pinguin', at: [8, y], dir: 180 }]);
    place(s.units[0], 4, y);
    run(s, 400);
    assert.equal(s.enemies[0].suspicion > 0, seen, `Zeile ${y} (${MAP[y][5]})`);
  }
  place(st.units[0], 4, 2);
  assert.ok(!has(tick(st, 0, [ab(0, 'beer', { x: 5.5, y: 1.5 })]), 'fail'));
  const s2 = Q(MAP, []);
  place(s2.units[0], 4, 2);
  assert.ok(has(tick(s2, 0, [ab(0, 'beer', { x: 5.5, y: 3.5 })]), 'fail', f => f.reason === 'target'));
});

const CAMP = [
  '####################',
  '#PPP..........V....#',
  '#PPP...............#',
  '#PPP...............#',
  '#..................#',
  '#........V.........#',
  '#..................#',
  '#..............V...#',
  '#..................#',
  '####################',
];
const campOpts = { team: ['viktor'], solo: 'viktor', timeMs: null, objective: { type: 'valve', label: 'Wasser' } };

test('Wasseranschlüsse: 4 s je Anschluss von nebenan, Ziel 3/3, dann abheben; keine Zeitgrenze', () => {
  const st = Q(CAMP, [], campOpts);
  const v = st.units[0];
  assert.equal(st.timeLimit, null);
  assert.deepEqual([st.objective.total, st.objective.min], [3, 3]);
  const valves = st.objs.filter(o => o.kind === 'valve');
  let ev = [];
  for (const o of valves) {
    place(v, o.x, o.y + 1);
    ev = run(st, 3900, [{ type: 'interact', unit: 0, obj: o.id }]);
    assert.equal(find(ev, 'interactStart').ms, 4000);
    assert.equal(o.done, false);
    ev = run(st, 200);
    const e = find(ev, 'valve');
    assert.deepEqual([e.obj, e.total], [o.id, 3]);
  }
  assert.equal(find(ev, 'valve').done, 3);
  assert.ok(has(ev, 'objective', o => o.reached && o.kind === 'valve'));
  assert.ok(has(tick(st, 0, [{ type: 'interact', unit: 0, obj: valves[0].id }]), 'fail', f => f.reason === 'done'));
  run(st, 700_000); // Zeit spielt keine Rolle
  assert.equal(st.over, false);
  place(v, 2, 2);
  assert.equal(find(tick(st, 50, [{ type: 'extract' }]), 'end').result, 'success');
});

test('Solo: nur der Solo-Rüther spielt; liegt er, ist die Mission gescheitert', () => {
  const st = Q(CAMP, [], { ...campOpts, team: ['christian', 'viktor', 'micha'] });
  assert.deepEqual(st.units.map(u => u.id), ['viktor']);
  st.units[0].down = true;
  const end = find(tick(st, 50), 'end');
  assert.deepEqual([end.result, end.reason], ['fail', 'allDown']);
  assert.ok(end.text.startsWith('Viktor liegt flach'), end.text);
});

const angDiffT = (a, b) => { const d = (b - a) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };

test('Bernd: Kaffee alle 20–30 s für 5 s (Kegel aus, vorbeischleichen), danach 10 s koffeiniert: Sicht ×1,3, Kegel ×1,2, Tempo ×1,5', () => {
  const st = Q(ROOM, [{ type: 'bernd', at: [10, 4], dir: 180 }], { team: ['viktor'] });
  const e = st.enemies[0], v = st.units[0], C = ENEMY_TYPES.bernd.coffee;
  place(v, 17, 8);
  assert.ok(e.coffeeAt >= 20_000 && e.coffeeAt <= 30_000, `${e.coffeeAt}`);
  assert.ok(Math.abs(coneLen(st, 0) - 6) < 1e-6);
  let ev = run(st, Math.ceil(e.coffeeAt / 50) * 50);
  const c = find(ev, 'coffee');
  assert.deepEqual([c.phase, c.ms, c.enemy], ['start', 5000, 0]);
  assert.ok(ENEMY_TYPES.bernd.lines.coffee.includes(c.say));
  const t0 = st.time;
  assert.ok(e.coffeeAt >= t0 + 20_000 - 50 && e.coffeeAt <= t0 + 30_000, 'nächster Kaffee 20–30 s nach diesem');
  assert.equal(e.state, 'coffee');
  assert.deepEqual(visibleCone(st, 0), []);
  place(v, 9, 4); // direkt vor ihm
  ev = run(st, 4000);
  assert.equal(e.suspicion, 0);
  assert.ok(!has(ev, 'suspicious'));
  place(v, 17, 8);
  ev = run(st, 1100);
  assert.ok(has(ev, 'coffee', x => x.phase === 'end'));
  assert.equal(find(ev, 'caffeinated').ms, C.boost);
  assert.equal(e.state, 'patrol');
  assert.ok(Math.abs(coneLen(st, 0) - 6 * 1.3) < 1e-6);
  const pts = visibleCone(st, 0).slice(1), spread = Math.abs(angDiffT(Math.atan2(pts[0].y - e.y, pts[0].x - e.x), Math.atan2(pts.at(-1).y - e.y, pts.at(-1).x - e.x)));
  assert.ok(Math.abs(spread - 70 * 1.2 * Math.PI / 180) < 0.02, `${spread}`);
  run(st, 10_000);
  assert.ok(Math.abs(coneLen(st, 0) - 6) < 1e-6);
  // Tempo: koffeiniert 1,5-mal so schnell auf der Runde
  const pace = buzz => {
    const s = Q(ROOM, [{ type: 'bernd', at: [2, 8], dir: 0, patrol: [[2, 8], [18, 8]] }], { team: ['viktor'] });
    const b = s.enemies[0];
    b.coffeeAt = Infinity;
    if (buzz) b.buzzUntil = Infinity;
    tick(s, 50);
    const x0 = b.x;
    tick(s, 1000);
    return b.x - x0;
  };
  assert.ok(Math.abs(pace(false) - 2.3) < 1e-6 && Math.abs(pace(true) - 2.3 * 1.5) < 1e-6, `${pace(false)} ${pace(true)}`);
});

test('Bernd erwischt Viktor: kieser-Event, Pause bis resume, dann Plattform mit voller HP, Bernd zurück auf Anfang, alle ruhig, Ziele bleiben', () => {
  const st = Q(CAMP, [{ type: 'bernd', at: [12, 3], dir: 180, patrol: [[12, 3, 1000], [12, 7, 1000]] }, { type: 'camper', at: [17, 5], dir: 180 }], campOpts);
  const v = st.units[0], b = st.enemies[0], cp = st.enemies[1];
  st.objs[0].done = true;
  v.hp = 3;
  place(v, 11, 3);
  b.coffeeAt = Infinity;
  Object.assign(cp, { state: 'investigate', target: { x: 11.5, y: 3.5 }, until: 0 });
  st.alarm = 0.6;
  let ev = run(st, 1000);
  const k = find(ev, 'kieser');
  assert.deepEqual([k.unit, k.enemy, k.count], [0, 0, 1]);
  assert.equal(ev.filter(x => x.type === 'kieser').length, 1);
  assert.equal(st.paused, 'kieser');
  assert.equal(st.kieser, 1);
  // Pause: Zeit steht, Befehle außer resume/abort werden ignoriert
  const t0 = st.time, x0 = v.x;
  assert.deepEqual(run(st, 2000, [{ type: 'move', unit: 0, to: { x: 5, y: 5 } }]), []);
  assert.equal(st.time, t0);
  assert.equal(v.x, x0);
  ev = tick(st, 0, [{ type: 'resume' }]);
  const r = find(ev, 'resumed');
  assert.deepEqual([r.reason, r.unit], ['kieser', 0]);
  assert.equal(st.paused, null);
  assert.equal(tileAt(st, v.x, v.y), 'P');
  assert.equal(v.hp, v.maxHp);
  assert.equal(v.down, false);
  assert.deepEqual([b.x, b.y, b.wp, b.state, b.suspicion], [12.5, 3.5, 0, 'patrol', 0]);
  assert.equal(cp.state, 'patrol');
  assert.equal(st.alarm, 0);
  assert.equal(st.objs[0].done, true, 'abgedrehter Anschluss bleibt zu');
  run(st, 100);
  assert.ok(st.time > t0, 'nach resume läuft die Zeit weiter');
  // zweites Mal: alarmierter Bernd läuft hin und greift zu
  place(v, 8, 6);
  Object.assign(b, { state: 'alert', lastSeen: { x: v.x, y: v.y }, suspicion: 1 });
  ev = run(st, 4000);
  assert.equal(find(ev, 'kieser').count, 2);
  tick(st, 0, [{ type: 'resume' }]);
  place(v, 2, 2);
  for (const o of st.objs) o.done = true;
  tick(st, 50);
  ev = run(st, 100, [{ type: 'extract' }]);
  const end = find(ev, 'end');
  assert.equal(end.result, 'success');
  assert.equal(end.kieser, 2);
  assert.equal(end.summary.kieser, 2);
  // Aufgeben geht auch während der Pause
  const s2 = Q(CAMP, [{ type: 'bernd', at: [12, 3], dir: 180 }], campOpts);
  place(s2.units[0], 11, 3);
  s2.enemies[0].coffeeAt = Infinity;
  run(s2, 1000);
  assert.equal(s2.paused, 'kieser');
  assert.equal(find(tick(s2, 50, [{ type: 'abort' }]), 'end').result, 'abort');
  // Debug „Bernd ruft“: {type:'catch'} = der erste Fänger erwischt Einheit 0 sofort; ohne Fänger nichts
  const s3 = Q(CAMP, [{ type: 'camper', at: [17, 5], dir: 180 }, { type: 'bernd', at: [12, 7], dir: 0 }], campOpts);
  const k3 = find(tick(s3, 50, [{ type: 'catch' }]), 'kieser');
  assert.deepEqual([k3.enemy, k3.unit, k3.count, s3.paused], [1, 0, 1, 'kieser']);
  assert.ok(!has(tick(Q(CAMP, [{ type: 'camper', at: [17, 5], dir: 180 }], campOpts), 50, [{ type: 'catch' }]), 'kieser'));
});

test('Ranger erwischt: caught {by, unit, fine}, sofort Ende fail/caught mit 10.000 Strafe', () => {
  const st = Q(ROOM, [{ type: 'ranger', at: [10, 4], dir: 180 }], { team: ['christian', 'micha'] });
  place(st.units[0], 9, 4);
  const ev = run(st, 1500);
  const c = find(ev, 'caught'), end = find(ev, 'end');
  assert.deepEqual([c.by, c.unit, c.fine], [0, 0, 10_000]);
  assert.ok(ev.indexOf(end) > ev.indexOf(c));
  assert.deepEqual([end.result, end.reason, end.fine], ['fail', 'caught', 10_000]);
  assert.equal(end.summary.fine, 10_000);
  assert.ok(end.text.includes('teuer'), end.text);
  assert.equal(st.over, true);
  assert.ok(!has(ev, 'hit', h => h.from === 'enemy'), 'Ranger schlagen nicht');
  // alarmierter Ranger aus der Ferne
  const s2 = Q(ROOM, [{ type: 'ranger', at: [15, 4], dir: 180 }], { team: ['christian'] });
  place(s2.units[0], 8, 4);
  Object.assign(s2.enemies[0], { state: 'alert', lastSeen: { x: 8.5, y: 4.5 }, suspicion: 1 });
  assert.equal(find(run(s2, 6000), 'end').reason, 'caught');
  // ohne Erwischen: keine Strafe
  const s3 = Q(ROOM, [], { team: ['christian'] });
  assert.equal(find(tick(s3, 50, [{ type: 'abort' }]), 'end').fine, 0);
});

test('Feuer: 3 s anzünden, Baum brennt dauerhaft; Ranger in 10 Kacheln bemerken es nach 5 s und laufen löschen', () => {
  const MAP = [
    '##############################',
    '#PPP.........................#',
    '#PPP.........................#',
    '#PPP.........................#',
    '#.....B..................B...#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
  ];
  const st = Q(MAP, [{ type: 'ranger', at: [14, 8], dir: 0 }, { type: 'ranger', at: [27, 8], dir: 0 }], { team: ['christian'], objective: { type: 'ignite', min: 1, label: 'Feuer' } });
  const c = st.units[0], [near, far] = st.enemies, tree = st.objs.find(o => o.x === 6);
  assert.equal(st.objective.total, 2);
  place(c, 5, 4);
  let ev = run(st, 2900, [{ type: 'interact', unit: 0, obj: tree.id }]);
  assert.equal(find(ev, 'interactStart').ms, 3000);
  ev = run(st, 200);
  const ig = find(ev, 'ignite');
  assert.deepEqual([ig.obj, ig.done, ig.total], [tree.id, 1, 2]);
  assert.equal(tree.done, true);
  assert.ok(has(ev, 'objective', o => o.reached));
  place(c, 28, 1);
  const lit = tree.litAt;
  ev = run(st, 4700);
  assert.ok(!has(ev, 'fireSpotted'), 'erst nach 5 s');
  ev = run(st, 400);
  const fs = find(ev, 'fireSpotted');
  assert.ok(st.time - lit >= 5000);
  assert.deepEqual([fs.obj, fs.enemies], [tree.id, [0]]);
  assert.ok(ENEMY_TYPES.ranger.lines.fire.includes(fs.say));
  assert.deepEqual([near.state, near.reason], ['distracted', 'fire']);
  assert.equal(far.state, 'patrol');
  run(st, 5000);
  assert.ok(Math.hypot(near.x - 6.5, near.y - 4.5) < 1.6, 'steht am Baum');
  assert.deepEqual([near.state, near.reason, near.path.length], ['distracted', 'fire', 0]);
  ev = run(st, 8000);
  assert.ok(has(ev, 'calm', x => x.enemy === 0));
  assert.equal(near.state, 'patrol');
  assert.equal(tree.done, true, 'brennt weiter');
  assert.ok(!has(run(st, 10_000), 'fireSpotted'), 'nur einmal bemerkt');
});

test('Dackel bellt bei Sichtung: Kollegen in 6 Kacheln kommen zum Hund; Platzwart pfeift: Alarm +0,5', () => {
  const st = Q(ROOM, [{ type: 'dackel', at: [10, 4], dir: 180 }, { type: 'camper', at: [15, 4], dir: 0 }, { type: 'camper', at: [17, 8], dir: 0 }]);
  place(st.units[0], 8, 4);
  const ev = run(st, 1000);
  const b = find(ev, 'bark');
  assert.deepEqual([b.enemy, b.r, b.enemies, b.say], [0, 6, [1], 'WAU!']);
  assert.ok(['distracted', 'investigate'].includes(st.enemies[1].state)); // erst Bellen, dann evtl. Alarmruf
  assert.equal(st.enemies[2].state, 'patrol');
  assert.ok(['suspicious', 'alert'].includes(st.enemies[0].state));
  assert.ok(!has(ev, 'noise'), 'Bellen ist ein eigenes Event');
  const s2 = Q(ROOM, [{ type: 'platzwart', at: [5, 4], dir: 0 }]);
  place(s2.units[0], 8, 4);
  const e2 = run(s2, 3000);
  const w = find(e2, 'whistle');
  assert.equal(w.enemy, 0);
  assert.ok(Math.abs(w.alarm - 0.5) < 1e-9);
  assert.ok(Math.abs(find(e2, 'alert').alarm - 0.5) < 1e-9);
});

test('Neue Gegnertypen: Werte laut Spec, Sprüche und Sprite', () => {
  const want = { bernd: [6, 70], camper: [5, 90, 2.2], dackel: [3, 120, 3.6], platzwart: [6, 70, 2.4], ranger: [8, 50, 2.3] };
  for (const [id, [sight, angle, speed]] of Object.entries(want)) {
    const T = ENEMY_TYPES[id];
    assert.deepEqual([T.sight, T.angle], [sight, angle], id);
    if (speed) assert.equal(T.speed, speed, id);
    assert.equal(T.sprite, `q-${id}`);
    for (const k of ['sus', 'alert', 'calm', 'wake']) assert.ok(T.lines[k]?.length, `${id}.${k}`);
  }
  assert.deepEqual(ENEMY_TYPES.bernd.coffee, { every: [20_000, 30_000], ms: 5000, boost: 10_000, speed: 1.5, sight: 1.3, angle: 1.2 });
  assert.ok(ENEMY_TYPES.bernd.lines.coffee.length);
  assert.equal(ENEMY_TYPES.bernd.catches, 'kieser');
  assert.deepEqual([ENEMY_TYPES.ranger.catches, ENEMY_TYPES.ranger.fine], ['caught', 10_000]);
  assert.equal(ENEMY_TYPES.platzwart.whistle, 0.5);
  assert.equal(ENEMY_TYPES.dackel.bark, true);
});

// Spec (Sebi): Stefan redet nur über seine Kieser-Breite oder Bulletproof Coffee, nie über Geruch oder Duschen
test('Stefans Sprüche: Engine-Lines und Kieser-Cutscene ohne Duschen und Geruch', () => {
  const bad = /dusch|riech|stink|unrasiert/i;
  const lines = [...Object.values(ENEMY_TYPES.bernd.lines).flat(), ...MISSION_BY_ID.camping.texts.kieser.filter(([who]) => who === 'bernd').map(([, t]) => t)];
  assert.ok(lines.length >= 10);
  for (const t of lines) assert.ok(!bad.test(t), t);
  assert.ok(MISSION_BY_ID.camping.texts.kieser.some(([who, t]) => who === 'viktor' && /duschen/.test(t))); // Viktors eigener Spruch darf bleiben
});

// Große Karte 64×48: Wände mit Lücken, Bäume, Wasser, Deckung; 16 Wachen auf langen Runden
function bigQuest(n = 16) {
  const W = 64, H = 48, rows = [];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      r += x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#'
        : x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 'P'
          : x % 8 === 0 && y > 6 && y % 6 !== 3 ? '#'
            : y === 30 && x > 20 && x < 40 ? 'W'
              : x % 11 === 5 && y % 7 === 2 ? 'T'
                : x % 9 === 4 && y % 5 === 1 ? '~' : '.';
    }
    rows.push(r);
  }
  rows[40] = rows[40].slice(0, 50) + 'V' + rows[40].slice(51);
  const free = (x, y) => '.~'.includes(rows[y][x]);
  const rng = seededRng(11), pick = () => { for (;;) { const x = 1 + Math.floor(rng() * 62), y = 8 + Math.floor(rng() * 39); if (free(x, y)) return [x, y]; } };
  const types = ['camper', 'dackel', 'platzwart'];
  const enemies = Array.from({ length: n }, (_, i) => { const a = pick(); return { type: types[i % 3], at: a, dir: 0, patrol: [a, pick(), pick(), pick()] }; });
  return Q(rows, enemies, { team: ['christian', 'micha', 'viktor'], gate: [60, 45], timeMs: null, objective: { type: 'valve', label: 'V' }, reinforce: 'camper' });
}

test('Leistung große Karte 64×48, 16 Wachen: 1000 Ticks unter 400 ms, auch wenn alle jagen', () => {
  const st = bigQuest();
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    const cmds = i === 0 ? [{ type: 'move', unit: 0, to: { x: 60, y: 44 } }, { type: 'move', unit: 1, to: { x: 30, y: 40 } }, { type: 'move', unit: 2, to: { x: 58, y: 3 } }] : [];
    tick(st, 50, cmds);
    for (let k = 0; k < st.enemies.length; k++) visibleCone(st, k);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `Patrouille: ${ms.toFixed(0)} ms`);
  // alle Wachen alarmiert, Rüther unverwüstlich: Jagd-Wege alle 500 ms über die ganze Karte
  const s2 = bigQuest();
  for (const u of s2.units) u.hp = u.maxHp = 1e9;
  for (const e of s2.enemies) Object.assign(e, { state: 'alert', suspicion: 1, lastSeen: { x: 3.5, y: 3.5 } });
  const t1 = performance.now();
  for (let i = 0; i < 1000; i++) {
    tick(s2, 50, i === 0 ? [{ type: 'move', unit: 0, to: { x: 60, y: 44 } }, { type: 'move', unit: 1, to: { x: 30, y: 40 } }] : []);
    for (let k = 0; k < s2.enemies.length; k++) visibleCone(s2, k);
  }
  const ms2 = performance.now() - t1;
  assert.ok(ms2 < 400, `Jagd: ${ms2.toFixed(0)} ms`);
  assert.equal(s2.over, false);
});

test('Camping und Bruch (echte Karten): solo Viktor ohne Zeit, Bernd trinkt Kaffee; Bruch mit Rangern; je 1000 Ticks unter 400 ms', { skip: !(MISSION_BY_ID.camping && MISSION_BY_ID.bruch) && 'Missionen fehlen noch' }, () => {
  for (const id of ['camping', 'bruch']) {
    const m = MISSION_BY_ID[id];
    for (const l of m.layouts) for (const mirror of [false, true]) {
      const tag = `${id}/${l.id}${mirror ? '/gespiegelt' : ''}`;
      const st = createQuest({ mission: m, setup: { layoutId: l.id, variantId: l.variants[0].id, mirror, seed: 5 }, team: ['christian', 'viktor', 'micha'].map(F), rng: seededRng(5) });
      if (id === 'camping') {
        assert.deepEqual(st.units.map(u => u.id), ['viktor'], tag);
        assert.equal(st.timeLimit, null);
        assert.equal(st.objective.total, 3);
        assert.ok(st.w >= 64 && st.h >= 48, tag);
      } else assert.equal(st.objective.type, 'ignite');
      const far = st.objs.reduce((a, o) => (Math.hypot(o.x - st.spots[0].x, o.y - st.spots[0].y) > Math.hypot(a.x - st.spots[0].x, a.y - st.spots[0].y) ? o : a));
      const t0 = performance.now(), ev = [];
      for (let i = 0; i < 1000; i++) {
        const cmds = i === 0 ? st.units.map(u => ({ type: 'interact', unit: u.i, obj: far.id })) : [];
        ev.push(...tick(st, 50, cmds));
        if (st.paused) tick(st, 0, [{ type: 'resume' }]);
        for (let k = 0; k < st.enemies.length; k++) visibleCone(st, k);
      }
      const ms = performance.now() - t0;
      assert.ok(ms < 400, `${tag}: ${ms.toFixed(0)} ms`);
      if (id === 'camping') assert.ok(has(ev, 'coffee', c => c.phase === 'start'), `${tag}: Bernd trinkt keinen Kaffee`);
    }
  }
});

test('Fixes Runde 1: Stefan heißt sichtbar Stefan und ist nach resume wieder heil; M&Ms nicht ins Wasser; getrennte Ziel-Kacheln für Rüther und Ranger', () => {
  // kein sichtbares „Bernd“ (ids wie 'bernd' bleiben)
  assert.equal(ENEMY_TYPES.bernd.name, 'Stefan');
  for (const T of Object.values(ENEMY_TYPES)) for (const l of Object.values(T.lines).flat()) assert.ok(!l.includes('Bernd'), l);
  for (const m of MISSIONS) {
    const vis = [m.name, m.place, m.intro, m.hint, ...Object.values(m.texts).flat(2), ...m.layouts.flatMap(l => [l.name, ...l.variants.flatMap(v => [v.name, v.desc])])];
    for (const s of vis) assert.ok(typeof s !== 'string' || !s.includes('Bernd'), `${m.id}: ${s}`);
  }
  // Viktor wehrt sich vor dem Zugriff (defend vor hunt): nach resume hat Stefan wieder volle HP
  const c = Q(CAMP, [{ type: 'bernd', at: [12, 3], dir: 180 }], campOpts), b = c.enemies[0];
  for (let n = 0; n < 3; n++) {
    place(c.units[0], 11, 3);
    Object.assign(b, { x: 12.5, y: 3.5, coffeeAt: Infinity, state: 'alert', lastSeen: { x: 11.5, y: 3.5 }, suspicion: 1 });
    assert.ok(has(run(c, 500), 'kieser'), `Fang ${n + 1}`);
    tick(c, 0, [{ type: 'resume' }]);
    assert.equal(b.hp, b.maxHp, `Fang ${n + 1}`);
  }
  // M&Ms: Ziel im Wasser ist ungültig (keiner käme hin), daneben an Land geht
  const w = Q(['############', '#PPP.......#', '#....WW....#', '#..........#', '############'], [], { team: ['ramona'] });
  place(w.units[0], 4, 1);
  assert.ok(has(tick(w, 0, [ab(0, 'mms', { x: 5.5, y: 2.5 })]), 'fail', f => f.reason === 'target'));
  assert.ok(!has(tick(w, 0, [ab(0, 'mms', { x: 5.5, y: 3.5 })]), 'fail'));
  // Rüther auf dem Weg zu einer Absicht hält seine Ziel-Kachel frei
  const r = Q(['##########', '#PPP.....#', '#........#', '#......V.#', '##########'], [], { team: ['christian', 'hildegard'], objective: { type: 'valve', label: 'W' } });
  tick(r, 0, [{ type: 'interact', unit: 0, obj: 0 }]);
  const end0 = r.units[0].path.at(-1);
  tick(r, 0, [{ type: 'move', unit: 1, to: { x: end0.x + 0.5, y: end0.y + 0.5 } }]);
  assert.ok(r.units[1].goal && (r.units[1].goal.x !== end0.x || r.units[1].goal.y !== end0.y), 'nicht auf dieselbe Kachel');
  // drei Ranger von derselben Seite löschen von drei verschiedenen Kacheln
  const f = Q(['####################', '#PPP...............#', '#..................#', '#.........B........#', '#..................#', '#..................#', '####################'],
    [{ type: 'ranger', at: [16, 3], dir: 0 }, { type: 'ranger', at: [17, 3], dir: 0 }, { type: 'ranger', at: [16, 4], dir: 0 }], { team: ['christian'], objective: { type: 'ignite', min: 1, label: 'F' } });
  Object.assign(f.objs[0], { done: true, litAt: -5000 }); // brennt schon 5 s
  assert.deepEqual(find(run(f, 100), 'fireSpotted').enemies, [0, 1, 2]);
  run(f, 5000);
  assert.ok(f.enemies.every(e => e.reason === 'fire' && !e.path.length && Math.hypot(e.x - 10.5, e.y - 3.5) < 1.6), 'alle am Baum');
  assert.equal(new Set(f.enemies.map(e => `${Math.floor(e.x)},${Math.floor(e.y)}`)).size, 3);
});

// ---------- v10 Fixes Runde 1 (quest) ----------
const L = (id, lv) => Object.assign(F(id), { loadout: Object.entries(lv).map(([a, level]) => ({ id: a, level })) });
const abx = (unit, ability, target = {}, extra = {}) => ({ type: 'ability', unit, ability, target, ...extra });

test('v10 Fix: Wache auf der Randkachel des Deo-Nebels sieht nicht raus; blickdichte Firewall nur für Gegner', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [8, 4], dir: 180 }], { team: [L('viktor', { deo: 1 })] });
  place(st.units[0], 11, 7);
  assert.deepEqual(find(run(st, 100, [abx(0, 'deo', { x: 10.5, y: 4.5 })]), 'ability').rect, { x0: 8, y0: 2, x1: 12, y1: 6 });
  assert.deepEqual(visibleCone(st, 0), [], 'Kegel aus, die Wache steht selbst im Nebel');
  place(st.units[0], 5, 4); // 3 Kacheln vor ihr, außerhalb des Nebels
  const ev = run(st, 1500);
  assert.equal(st.enemies[0].suspicion, 0);
  assert.ok(!has(ev, 'alert'));
  // Firewall Stufe 3: Micha wirft den Controller durch die eigene Wand (Rüther sehen durch), statt hindurchzulaufen
  const f = Q(ROOM, [{ type: 'pinguin', at: [14, 3], dir: 0 }], { team: [L('micha', { firewall: 3, controller: 1 })] });
  place(f.units[0], 10, 3);
  assert.ok(find(tick(f, 0, [abx(0, 'firewall', { x: 12.5, y: 3.5 }, { dir: 'v' })]), 'ability').opaque);
  assert.ok(has(tick(f, 0, [abx(0, 'controller', { enemy: 0 })]), 'ability', a => a.ability === 'controller'));
  assert.deepEqual(f.units[0].path, []);
});

test('v10 Fix: M&Ms – sperrt die Firewall den Weg, isst die Wache nicht durch die Wand', () => {
  const MAP = ['####################', '#PPP......#........#', '#.........#........#', '#.........#........#', '#..................#', '#.........#........#', '####################'];
  const st = Q(MAP, [{ type: 'pinguin', at: [13, 4], dir: 180 }], { team: [L('ramona', { mms: 1 }), L('micha', { firewall: 1 })] });
  place(st.units[0], 5, 4); place(st.units[1], 6, 2);
  let ev = run(st, 1500, [abx(0, 'mms', { x: 8.5, y: 4.5 })]);
  assert.ok(has(ev, 'baitTaken'));
  ev = tick(st, 0, [abx(1, 'firewall', { x: 10.5, y: 4.5 }, { dir: 'v' })]);
  assert.deepEqual(find(ev, 'ability').tiles, [{ x: 10, y: 4 }]);
  place(st.units[0], 1, 1); place(st.units[1], 2, 1);
  ev = run(st, 3000);
  const e = st.enemies[0];
  assert.ok(!has(ev, 'stun', s => s.reason === 'eat'), 'kein Essen hinter der Wand');
  assert.ok(e.x > 10 && e.state !== 'eating');
  assert.equal(st.effects.find(x => x.kind === 'mms')?.portions, 1, 'Portion bleibt liegen');
  ev = run(st, 16_000); // Firewall weg: jetzt kommt er hin
  assert.ok(has(ev, 'stun', s => s.reason === 'eat' && Math.hypot(s.x - 8.5, s.y - 4.5) <= 1.5));
});

test('v10 Fix: eigene Fehltexte für Mittagsruhe/Crash, Insider-Tipp ohne Weg ohne Abklingzeit, Schild und Horde nicht ins Wasser', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [17, 8] }], { team: [L('hildegard', { mittag: 1 }), L('viktor', { crash: 1 })] });
  const m = find(tick(st, 0, [abx(0, 'mittag')]), 'fail'), c = find(tick(st, 0, [abx(1, 'crash')]), 'fail');
  assert.deepEqual([m.reason, c.reason], ['noDoze', 'noRumor']);
  for (const t of [m.text, c.text]) assert.ok(/Wache/.test(t) && !/Familie/.test(t), t);
  // Insider-Tipp: Zielpunkt hinter verschlossener Tür, kein anderer Weg
  const MAP = ['####################', '#PPP.....#.........#', '#........L.........#', '#........#.........#', '####################'];
  const s = Q(MAP, [{ type: 'pinguin', at: [6, 2], dir: 180 }], { team: [L('viktor', { insider: 1 })] });
  place(s.units[0], 4, 2);
  const f = find(tick(s, 0, [abx(0, 'insider', { enemy: 0 }, { target2: { x: 14.5, y: 2.5 } })]), 'fail');
  assert.deepEqual([f.reason, f.text], ['noWay', 'Da kommt die Wache nicht hin.']);
  assert.ok(!(s.units[0].cd.insider > s.time), 'keine Abklingzeit');
  assert.ok(!has(tick(s, 0, [abx(0, 'insider', { enemy: 0 }, { target2: { x: 6.5, y: 3.5 } })]), 'fail'));
  // Sale-Schild und Horde: Wasser ist kein Startpunkt, das Ufer schon
  for (const id of ['sale', 'horde']) {
    const w = Q(['############', '#PPP.......#', '#....WW....#', '#..........#', '############'], [], { team: [L('ramona', { [id]: 1 })] });
    place(w.units[0], 4, 1);
    assert.ok(has(tick(w, 0, [abx(0, id, { x: 5.5, y: 2.5 })]), 'fail', x => x.reason === 'target'), id);
    assert.ok(!has(tick(w, 0, [abx(0, id, { x: 5.5, y: 3.5 })]), 'fail'), id);
  }
});

test('v10 Fix: Tratsch – Hildegard zwischen den Streithähnen wird nicht gesehen', () => {
  const MAP = ['####################', '#PPP...............#', '#..................#', '#..................#', '#..................#', '#..................#', '####################'];
  for (const level of [1, 3]) {
    const st = Q(MAP, [{ type: 'pinguin', at: [5, 3], dir: 180 }, { type: 'pinguin', at: [15, 3], dir: 0 }], { team: [L('hildegard', { tratsch: level })] });
    place(st.units[0], 10, 4);
    const ev = run(st, 4000, [abx(0, 'tratsch')]);
    assert.ok(!has(ev, 'taskEnd') && !has(ev, 'alert') && !has(ev, 'suspicious'), `Stufe ${level}`);
    assert.equal(st.units[0].hp, st.units[0].maxHp);
    assert.ok(st.enemies.every(e => e.task?.kind === 'tratsch' && e.task.phase === 'stay'));
  }
});

test('v10 Fix: Stefan redet auch bei Crash-Gerücht, Panik und Klappern nur über Kieser und Bulletproof Coffee', () => {
  const B = ENEMY_TYPES.bernd.lines;
  const st = Q(ROOM, [{ type: 'bernd', at: [8, 3], dir: 0 }, { type: 'pinguin', at: [5, 6], dir: 0 }], { team: [L('viktor', { crash: 3 })] });
  st.enemies[0].coffeeAt = Infinity;
  place(st.units[0], 5, 3);
  let ev = run(st, 100, [abx(0, 'crash')]);
  assert.ok(B.crash.includes(find(ev, 'task', t => t.enemy === 0).say));
  assert.equal(find(ev, 'task', t => t.enemy === 1).say, 'Mein Depot! Alles rot!'); // andere Wachen wie gehabt
  place(st.units[0], 1, 8);
  ev = run(st, 7500); // Stufe 3: 14 s, Stefan halb so lang
  assert.ok(B.taskEnd.includes(find(ev, 'taskEnd', t => t.enemy === 0).say));
  assert.ok(B.panik.includes(find(ev, 'task', t => t.enemy === 0 && t.kind === 'panik').say));
  assert.deepEqual(ENEMY_TYPES.bernd.labels, { crash: '+20 kg', panik: 'ZU KIESER!', insider: 'Kaffee?' });
  // Klappern am Tresor hört Stefan mit seinen Hantelscheiben
  const v = Q(VAULT, [{ type: 'bernd', at: [7, 3], dir: 0 }], { team: ['viktor'] });
  v.enemies[0].coffeeAt = Infinity;
  place(v.units[0], 5, 3);
  ev = run(v, 2500, [{ type: 'interact', unit: 0, obj: 0 }]);
  assert.ok(B.heard.includes(find(ev, 'heard').say));
  for (const t of [...B.crash, ...B.panik, ...B.insider, ...B.task, ...B.taskEnd, ...B.heard]) assert.ok(/Kieser|Coffee|Kaffee|Beinpresse|Hantel/.test(t), t);
});
