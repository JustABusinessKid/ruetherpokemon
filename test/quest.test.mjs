import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, castRay, lineOfSight } from '../js/quest/path.js';
import { createQuest, tick, canExtract, questSummary, visibleCone, abilitiesFor, abilityTargets, ABILITIES, ENEMY_TYPES, tileAt } from '../js/quest/engine.js';
import { MISSIONS, MISSION_BY_ID } from '../js/quest/missions.js';
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

test('Goebbels: Megafon = sofort Voll-Alarm, Verstärkung alle 20 s am Tor, Kegel +25 %', () => {
  const st = Q(ROOM, [{ type: 'goebbels', at: [5, 4], dir: 0 }], { gate: [18, 8], team: ['christian', 'hildegard'] });
  place(st.units[0], 7, 4);
  let ev = run(st, 3000);
  assert.equal(find(ev, 'alert').megafon, true);
  assert.ok(has(ev, 'fullAlarm'));
  assert.equal(st.alarm, 1);
  assert.ok(st.fullAlarm);
  ev = run(st, 20_000);
  const r = find(ev, 'reinforce');
  assert.equal(r.enemies.length, 2);
  for (const i of r.enemies) {
    const e = st.enemies[i];
    assert.equal(e.type, 'pinguin');
    assert.ok(e.reinforcement);
  }
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

test('Alarmierter Gegner jagt und schlägt zu, Rüther wehrt sich mit 8 × power, Gegner-KO bei 0 HP', () => {
  const st = Q(ROOM, [{ type: 'drohne', at: [6, 4], dir: 180 }]);
  const c = st.units[0], e = st.enemies[0];
  place(c, 4, 4);
  const ev = run(st, 8000);
  assert.ok(has(ev, 'hit', h => h.from === 'enemy' && h.damage === ENEMY_TYPES.drohne.dps));
  assert.ok(has(ev, 'hit', h => h.from === 'unit' && h.damage === Math.round(8 * c.power)));
  assert.ok(has(ev, 'ko', k => k.by === 'kampf'));
  assert.equal(e.state, 'ko');
  assert.ok(c.hp < c.maxHp && c.hp > 0);
});

// ---------- Kräfte ----------

test('abilitiesFor: jeder Rüther genau 2 Kräfte, unbekannt keine', () => {
  for (const r of RUETHERS) {
    const list = abilitiesFor(r.id);
    assert.equal(list.length, 2, r.id);
    for (const a of list) assert.ok(a.name && a.icon && a.cd > 0 && a.range > 0 && a.desc);
  }
  assert.deepEqual(abilitiesFor('hitler'), []);
  assert.equal(Object.keys(ABILITIES).length, 10);
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

test('Kraft Handtaschen-Hieb: 15 s KO, leise von hinten, laut von vorn', () => {
  const st = Q(ROOM, [{ type: 'pinguin', at: [8, 4], dir: 0 }, { type: 'pinguin', at: [8, 7], dir: 90 }], { team: ['hildegard'] });
  place(st.units[0], 7, 4);
  let ev = run(st, 100, [ab(0, 'handbag', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').silent, true);
  assert.ok(!has(ev, 'noise'));
  assert.equal(st.enemies[0].state, 'stunned');
  assert.equal(st.enemies[0].reason, 'handbag');
  assert.deepEqual(visibleCone(st, 0), []);
  run(st, 15_000);
  assert.notEqual(st.enemies[0].state, 'stunned');
  // von vorn: Geräusch
  const s2 = Q(ROOM, [{ type: 'pinguin', at: [8, 4], dir: 180 }, { type: 'pinguin', at: [10, 2], dir: 0 }], { team: ['hildegard'] });
  place(s2.units[0], 7, 4);
  ev = run(s2, 100, [ab(0, 'handbag', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').silent, false);
  assert.ok(has(ev, 'noise', n => n.kind === 'hieb' && n.enemies.includes(1)));
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
  assert.deepEqual({ ...end.summary }, { result: 'success', reason: 'extract', missionId: 'test', variantId: 'v', score: 1, objective: { done: 2, total: 2, min: 1 }, timeMs: st.time, alarmFree: true, delivered: 2, leftBehind: 1 });
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

// ---------- Missionen ----------

test('Missionen: 4 Stück, verschiedene Ziele, je 2–3 Varianten, Karten nach Legende', () => {
  assert.ok(MISSIONS.length >= 4);
  assert.deepEqual(new Set(MISSIONS.map(m => m.objective.type)), new Set(['steal', 'sabotage', 'fetch', 'unplug']));
  for (const id of ['tachionenraub', 'hangar', 'ps3', 'keller']) assert.ok(MISSION_BY_ID[id], id);
  for (const m of MISSIONS) {
    assert.ok(m.variants.length >= 2 && m.variants.length <= 3, m.id);
    assert.ok(m.name && m.place && m.intro && m.hint && m.texts.success && m.texts.fail && m.objective.label && m.theme);
    assert.ok(Number.isFinite(m.lat) && Number.isFinite(m.lon));
    const h = m.map.length, w = m.map[0].length;
    assert.ok(w >= 26 && w <= 34 && h >= 18 && h <= 24, `${m.id} ${w}x${h}`);
    for (const [y, row] of m.map.entries()) {
      assert.equal(row.length, w, `${m.id} Zeile ${y}`);
      assert.match(row, /^[#.DLPCSXK~]+$/);
      if (y === 0 || y === h - 1) assert.match(row, /^#+$/);
      else assert.ok(row[0] === '#' && row[w - 1] === '#');
    }
    assert.ok(m.map.join('').includes('L'), `${m.id} braucht L-Türen`);
    assert.ok((m.map.join('').match(/P/g) || []).length >= 3);
    assert.ok(new Set(m.variants.map(v => v.id)).size === m.variants.length);
  }
  assert.equal(MISSION_BY_ID.tachionenraub.objective.min, 3);
  assert.deepEqual(MISSIONS.map(m => m.timeMs / 1000), [360, 360, 300, 300]);
});

const passClosed = st => (x, y) => '.DPX~'.includes(st.tiles[y * st.w + x]);
const passOpen = st => (x, y) => '.DPX~L'.includes(st.tiles[y * st.w + x]);

test('jede Mission und Variante ist lösbar: Weg von P zu jedem Ziel ohne L-Türen, Gegner sinnvoll gesetzt', () => {
  const team = ['christian', 'micha', 'viktor'].map(F);
  for (const m of MISSIONS) {
    let shortcut = false;
    for (const v of m.variants) {
      const st = createQuest({ mission: m, variant: v.id, team });
      const tag = `${m.id}/${v.id}`;
      const p = st.pads[4] || st.pads[0];
      const goals = st.objs;
      assert.ok(goals.length >= 1, tag);
      if (m.objective.type === 'sabotage') assert.equal(goals.length, 4, tag);
      if (m.objective.type === 'steal') assert.ok(st.objective.total >= 10, tag);
      for (const o of goals) {
        const closed = findPath(st.w, st.h, passClosed(st), p.x, p.y, o.x, o.y, 1.5);
        assert.ok(closed, `${tag}: ${o.kind}@${o.x},${o.y} ohne L unerreichbar`);
        const open = findPath(st.w, st.h, passOpen(st), p.x, p.y, o.x, o.y, 1.5);
        if (open.length < closed.length) shortcut = true;
      }
      assert.ok(passClosed(st)(st.gate.x, st.gate.y), `${tag}: Tor`);
      assert.ok(v.desc && v.name, tag);
      for (const e of st.enemies) {
        const ex = Math.floor(e.x), ey = Math.floor(e.y);
        assert.ok(ENEMY_TYPES[e.type], tag);
        assert.ok(passClosed(st)(ex, ey), `${tag}: Gegner ${e.i} in der Wand`);
        for (const w of e.patrol) assert.ok(findPath(st.w, st.h, passClosed(st), ex, ey, w.x, w.y), `${tag}: Wegpunkt ${w.x},${w.y}`);
      }
    }
    assert.ok(shortcut, `${m.id}: keine L-Tür ist eine Abkürzung`);
  }
});

test('jede Variante: 30 s auf der Plattform warten bleibt unentdeckt, Patrouillen laufen', () => {
  const team = ['christian', 'hildegard', 'ramona'].map(F);
  for (const m of MISSIONS) for (const v of m.variants) {
    const st = createQuest({ mission: m, variant: v.id, team, rng: seededRng(3) });
    const start = st.enemies.map(e => [e.x, e.y]);
    const ev = run(st, 30_000);
    assert.ok(!has(ev, 'suspicious') && !has(ev, 'alert'), `${m.id}/${v.id}`);
    assert.ok(st.enemies.some((e, i) => e.x !== start[i][0] || e.y !== start[i][1]), `${m.id}/${v.id} niemand läuft`);
  }
});

test('Varianten: deterministisch mit festem rng, verschiedene Seeds geben verschiedene Varianten', () => {
  const team = ['christian', 'micha', 'viktor'].map(F);
  const play = seed => {
    const st = createQuest({ mission: 'tachionenraub', team, rng: seededRng(seed) });
    const log = [];
    for (let i = 0; i < 800; i++) {
      const cmds = i === 0 ? [{ type: 'move', unit: 0, to: { x: 12, y: 10 } }, { type: 'interact', unit: 1, obj: 0 }, { type: 'move', unit: 2, to: { x: 20, y: 12 } }]
        : i === 120 ? [ab(0, 'beer', { x: 14.5, y: 8.5 })] : [];
      log.push(...tick(st, 50, cmds));
    }
    return { v: st.variantId, log: JSON.stringify(log), units: JSON.stringify(st.units), enemies: JSON.stringify(st.enemies), alarm: st.alarm };
  };
  assert.deepEqual(play(5), play(5));
  const seen = new Set();
  for (let s = 1; s <= 30; s++) seen.add(createQuest({ mission: 'hangar', team, rng: seededRng(s * 2654435761) }).variantId);
  assert.ok(seen.size >= 2);
  assert.throws(() => createQuest({ mission: 'gibtsnicht', team }));
  assert.throws(() => createQuest({ mission: 'hangar', variant: 'gibtsnicht', team }));
});

test('Zustand: Rüther auf der Plattform mit echten ids, Objekte und Türen gelesen', () => {
  const st = createQuest({ mission: 'tachionenraub', variant: 'schicht', team: ['christian', 'ramona'].map(F) });
  assert.deepEqual(st.units.map(u => u.id), ['christian', 'ramona']);
  for (const u of st.units) { assert.equal(tileAt(st, u.x, u.y), 'P'); assert.equal(u.hp, u.maxHp); }
  assert.equal(st.objs.filter(o => o.kind === 'vault').length, 8);
  assert.equal(st.objs.find(o => o.x === 29 && o.y === 13).coins, 0);
  assert.equal(st.objs.find(o => o.x === 22 && o.y === 17).coins, 3);
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

test('Gegnerschaden wächst mit der Teamstärke (Ø maxBtc × power / 100)', () => {
  const c = makeFighter(RUETHER_BY_ID.christian, { rarity: 'legendaer', level: 20 });
  const st = Q(ROOM, [{ type: 'pinguin', at: [6, 4], dir: 180 }], { team: [c] });
  const u = st.units[0], e = st.enemies[0];
  place(u, 5, 4);
  Object.assign(e, { state: 'alert', lastSeen: { x: u.x, y: u.y } });
  const hit = find(run(st, 1500), 'hit', h => h.from === 'enemy');
  assert.equal(hit.damage, Math.round(ENEMY_TYPES.pinguin.dps * c.maxBtc * c.power / 100));
  assert.ok(hit.damage >= 40);
});
