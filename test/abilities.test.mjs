// v10: Quest-Fähigkeiten (Spec §2/§3), Nahkampf (§4), Leistung (§5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuest, tick, visibleCone, abilitiesFor, abilityTargets, ENEMY_TYPES } from '../js/quest/engine.js';
import { ABILITIES, POOLS, FIXED, params } from '../js/quest/abilities.js';
import { MISSION_BY_ID } from '../js/quest/missions.js';
import { makeFighter } from '../js/battle.js';
import { RUETHERS, RUETHER_BY_ID } from '../js/data.js';
import { seededRng } from '../js/quests.js';

// Einheit: 'id' (feste Stufe 1), ['id', {ability: level, …}] (genau diese) oder fertiger Kämpfer
const F = (u, inst) => {
  if (typeof u === 'string') return makeFighter(RUETHER_BY_ID[u], inst);
  const [id, lv] = u;
  return Object.assign(makeFighter(RUETHER_BY_ID[id], inst), { loadout: Object.entries(lv).map(([a, level]) => ({ id: a, level })) });
};
function Q(map, enemies = [], { team = ['christian'], ...opts } = {}) {
  const mission = {
    id: 'test', name: 'Test', theme: 'neuschwabenland', timeMs: 600_000, gate: [18, 8], coins: 2, reinforce: 'pinguin',
    objective: { type: 'steal', min: 1, label: 'Test' }, texts: { success: 'ok', fail: 'nein' }, map, variants: [{ id: 'v', enemies }], ...opts,
  };
  return createQuest({ mission, variant: 'v', team: team.map(t => (Array.isArray(t) || typeof t === 'string' ? F(t) : t)), rng: seededRng(1) });
}
const place = (o, x, y) => Object.assign(o, { x: x + 0.5, y: y + 0.5, path: [], goal: o.patrol ? null : { x, y }, intent: null, busy: null });
function run(st, ms, cmds = []) {
  const ev = [];
  for (let t = 0; t < ms; t += 50) ev.push(...tick(st, 50, t === 0 ? cmds : []));
  return ev;
}
const has = (ev, type, f = () => true) => ev.some(e => e.type === type && f(e));
const find = (ev, type, f = () => true) => ev.find(e => e.type === type && f(e));
const ab = (unit, ability, target = {}, extra = {}) => ({ type: 'ability', unit, ability, target, ...extra });
const coneLen = (st, i) => Math.max(0, ...visibleCone(st, i).slice(1).map(p => Math.hypot(p.x - st.enemies[i].x, p.y - st.enemies[i].y)));
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
const P = (x, y, dir = 0, more = {}) => ({ type: 'pinguin', at: [x, y], dir, ...more });

// ---------- Daten ----------

test('Daten: 25 Fähigkeiten, je Rüther 2 feste + 3 Pool, Stufen und Texte, Icons, params führt zusammen', () => {
  assert.equal(Object.keys(ABILITIES).length, 25);
  const NEW = ['vp', 'kursalarm', 'wlan', 'junge', 'mittag', 'tratsch', 'mutter', 'crash', 'insider', 'deo', 'firewall', 'raubkopie', 'vibra', 'horde', 'sale', 'feierabend'];
  const TARGETS = ['door', 'point', 'enemy', 'self', 'vaultOrDrone', 'enemyThenPoint', 'pointThenPoint', 'pointDir', 'teammatePoint'];
  for (const r of RUETHERS) {
    assert.equal(FIXED[r.id].length, 2, r.id);
    assert.equal(POOLS[r.id].length, 3, r.id);
  }
  for (const a of Object.values(ABILITIES)) {
    assert.equal(a.stages.length, 3, a.id);
    assert.equal(a.texts.length, 3, a.id);
    for (const t of a.texts) assert.ok(t.length > 5 && !/\p{Extended_Pictographic}/u.test(t), `${a.id}: ${t}`);
    assert.ok(TARGETS.includes(a.target), a.id);
    assert.equal(a.icon, NEW.includes(a.id) ? `art/ab-${a.id}.png` : a.icon, a.id);
    assert.ok(/^art\/(ab|fx)-[\w-]+\.png$/.test(a.icon), a.id);
    for (let l = 1; l <= 3; l++) { const p = params(a.id, l); assert.ok(TARGETS.includes(p.target) && p.cd >= 0, `${a.id} ${l}`); }
  }
  assert.equal(ABILITIES.plus70.icon, 'art/fx-chart-up.png');
  assert.equal(ABILITIES.credits.icon, 'art/fx-bags.png');
  assert.deepEqual([params('gas', 1).target, params('gas', 3).target, params('horde', 3).target], ['point', 'pointDir', 'pointThenPoint']);
  assert.deepEqual([params('beer', 1).range, params('beer', 2).range, params('beer', 3).range, params('beer', 3).cd], [6, 8, 8, 8000]);
  assert.equal(params('beer', 9).puddle, 30_000); // geklemmt
  assert.equal(params('nix', 1), null);
});

test('Loadout: ohne nur die 2 festen auf Stufe 1, sonst 3 mit Stufe; Fremdes und doppelte fliegen raus; Ladungen', () => {
  const st = Q(ROOM, [], { team: ['christian', ['ramona', { mms: 2, credits: 3, feierabend: 2 }], ['micha', { wallet: 1, gas: 3, controller: 7 }]] });
  const [c, r, m] = st.units;
  assert.deepEqual(c.abilities, [{ id: 'plus70', level: 1 }, { id: 'beer', level: 1 }]);
  assert.deepEqual(r.abilities.map(a => [a.id, a.level]), [['mms', 2], ['credits', 3], ['feierabend', 2]]);
  assert.deepEqual(m.abilities.map(a => [a.id, a.level]), [['wallet', 1], ['controller', 3]]);
  assert.deepEqual(r.charges, { feierabend: 2 });
  const list = abilitiesFor(r);
  assert.deepEqual(list.map(a => a.cd), [18_000, 22_000, 0]);
  assert.equal(list[0].text, ABILITIES.mms.texts[1]);
  assert.ok(has(tick(st, 0, [ab(0, 'vp')]), 'fail', f => f.reason === 'ability')); // nicht ausgerüstet
  // Lade-Format aus progress.loadoutFor: dritter Slot null
  const s2 = Q(ROOM, [], { team: [Object.assign(F('viktor'), { loadout: [{ id: 'gas', level: 1 }, { id: 'argue', level: 1 }, null] })] });
  assert.equal(s2.units[0].abilities.length, 2);
});

// ---------- Christian ----------

test('Plus 70 Prozent: Stufe 1 knarzt (Geräusch), Stufe 2 lautlos, Stufe 3 aus 3 Kacheln und danach Sofort-Klau', () => {
  const MAP = ['############', '#PPP.#.....#', '#....L..C..#', '#....#.....#', '############'];
  let st = Q(MAP, [P(8, 1)]);
  place(st.units[0], 4, 2);
  let ev = run(st, 1000, [ab(0, 'plus70', { door: 0 })]);
  assert.equal(find(ev, 'ability').silent, false);
  assert.ok(has(ev, 'noise', n => n.kind === 'tuer' && n.r === 4 && n.enemies.includes(0)));
  st = Q(MAP, [P(9, 1)], { team: [['christian', { plus70: 2 }]] });
  place(st.units[0], 4, 2);
  ev = run(st, 1000, [ab(0, 'plus70', { door: 0 })]);
  assert.ok(has(ev, 'doorOpen', d => d.silent) && !has(ev, 'noise'));
  assert.equal(st.units[0].cd.plus70, 5000);
  st = Q(MAP, [], { team: [['christian', { plus70: 3 }]] });
  place(st.units[0], 2, 2);
  ev = run(st, 1000, [ab(0, 'plus70', { door: 0 })]);
  const a = find(ev, 'ability');
  assert.ok(a.quick && d2(a, 2.5, 2.5) < 0.01, 'öffnet von x=2 aus, ohne hinzulaufen');
  ev = run(st, 2000, [{ type: 'interact', unit: 0, obj: 0 }]);
  assert.ok(has(ev, 'interactStart', s => s.kind === 'steal' && s.ms === 0));
  assert.equal(st.units[0].carry, 1);
  ev = run(st, 3200);
  assert.equal(st.units[0].carry, 2); // zweite Münze wieder normal (3 s)
});

test('Dosenbier Stufe 3: Bierpfütze, die erste Wache rutscht aus (6 s KO, leise)', () => {
  const st = Q(ROOM, [P(12, 4), P(17, 8)], { team: [['christian', { beer: 3 }]] });
  place(st.units[0], 3, 1);
  let ev = run(st, 4000, [ab(0, 'beer', { x: 8.5, y: 4.5 })]);
  assert.ok(find(ev, 'ability').puddle);
  assert.ok(has(ev, 'puddle'));
  const s = find(ev, 'stun', x => x.reason === 'slip');
  assert.deepEqual([s.enemy, s.ms], [0, 6000]);
  assert.equal(ev.filter(e => e.type === 'noise').length, 1, 'nur das Scheppern, Ausrutschen ist leise');
  ev = run(st, 100);
  assert.ok(!st.effects.some(f => f.kind === 'puddle'), 'Pfütze verbraucht');
  assert.equal(st.enemies[1].state, 'patrol');
});

test('Vice-President-Auftritt: keine Wache wird misstrauisch, Himmler halb so schnell, Klauen bricht; Stufe 3 schickt zum Tor', () => {
  let st = Q(ROOM, [P(5, 4)], { team: [['christian', { vp: 1 }]] });
  let ev = run(st, 50, [ab(0, 'vp')]);
  assert.equal(find(ev, 'ability').ms, 12_000);
  place(st.units[0], 8, 4);
  run(st, 3000);
  assert.equal(st.enemies[0].suspicion, 0);
  ev = run(st, 9500);
  assert.ok(has(ev, 'disguiseEnd', d => d.reason === 'zeit'));
  // Himmler: halbe Rate
  const rate = vp => {
    const s = Q(ROOM, [{ type: 'himmler', at: [5, 4], dir: 0 }], { team: [['christian', { vp: 1 }]] });
    if (vp) tick(s, 0, [ab(0, 'vp')]);
    place(s.units[0], 8, 4);
    tick(s, 50);
    return s.enemies[0].suspicion;
  };
  assert.ok(rate(false) > 0 && Math.abs(rate(true) / rate(false) - 0.5) < 1e-9);
  // Klauen bricht die Tarnung
  st = Q(['##########', '#PPP.....#', '#....C...#', '#........#', '##########'], [], { team: [['christian', { vp: 2 }]] });
  place(st.units[0], 4, 2);
  tick(st, 0, [ab(0, 'vp')]);
  assert.equal(st.units[0].disguiseUntil, 18_000);
  ev = tick(st, 50, [{ type: 'interact', unit: 0, obj: 0 }]);
  assert.ok(has(ev, 'disguiseEnd', d => d.reason === 'klau'));
  // Stufe 3: Vorbeigehen schickt die Wache 10 s zum Tor
  st = Q(ROOM, [P(8, 4, 180)], { team: [['christian', { vp: 3 }]] });
  tick(st, 0, [ab(0, 'vp')]);
  place(st.units[0], 7, 4);
  ev = run(st, 2000);
  assert.ok(has(ev, 'vpSend', v => v.enemy === 0 && v.say === 'Gehen Sie mal zum Tor!'));
  assert.equal(st.enemies[0].task.kind, 'vp');
  assert.ok(d2(st.enemies[0], 8.5, 4.5) > 2, 'läuft Richtung Tor');
  ev = run(st, 8500);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'vp'));
  assert.equal(st.units[0].vpSend, null, 'nur eine Wache');
});

test('Kurs-Alarm: Wachen in 6 laufen zum Handy und starren 10 s (Kegel aus); Stufe 3: Misstrauen 0, Alarm −0,3', () => {
  for (const level of [1, 3]) {
    const st = Q(ROOM, [P(12, 4), P(13, 6), P(18, 1)], { team: [['christian', { kursalarm: level }]] });
    place(st.units[0], 6, 4);
    st.enemies[0].suspicion = 0.2; st.alarm = 0.6;
    let ev = run(st, 4000, [ab(0, 'kursalarm', { x: 10.5, y: 4.5 })]);
    assert.equal(find(ev, 'ability').item, 'phone');
    assert.deepEqual(find(ev, 'phone').enemies, [0, 1]);
    assert.equal(st.enemies[2].state, 'patrol');
    for (const i of [0, 1]) {
      assert.equal(st.enemies[i].task.kind, 'kursalarm');
      assert.ok(d2(st.enemies[i], 10.5, 4.5) < 2.2);
      assert.deepEqual(visibleCone(st, i), []);
    }
    ev = run(st, params('kursalarm', level).ms + 2000);
    assert.ok(has(ev, 'taskEnd', t => t.kind === 'kursalarm' && t.enemy === 0));
    if (level === 3) {
      assert.equal(st.enemies[0].suspicion, 0);
      ev.push(...run(st, 4000));
      assert.ok(has(ev, 'alarmDrop', a => a.drop === 0.3));
    } else assert.ok(!has(ev, 'alarmDrop'));
  }
});

test('WLAN-Störung: Sicht in der Zone halb, Drohnen aus; Stufe 3 Funkloch: kein Alarm, kein Rufen, kein Bellen', () => {
  let st = Q(ROOM, [P(12, 4), { type: 'drohne', at: [13, 3], dir: 0 }], { team: [['christian', { wlan: 1 }]] });
  place(st.units[0], 7, 4);
  let ev = run(st, 100, [ab(0, 'wlan', { x: 12.5, y: 4.5 })]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.size, a.ms, a.rect], [5, 12_000, { x0: 10, y0: 2, x1: 14, y1: 6 }]);
  assert.ok(Math.abs(coneLen(st, 0) - 2.5) < 1e-6);
  assert.ok(has(ev, 'stun', s => s.enemy === 1 && s.reason === 'wlan'));
  ev = run(st, 12_000);
  assert.ok(has(ev, 'wake', w => w.enemy === 1));
  assert.ok(Math.abs(coneLen(st, 0) - 5) < 1e-6);
  // Stufe 2: 7×7, 16 s
  st = Q(ROOM, [], { team: [['christian', { wlan: 2 }]] });
  place(st.units[0], 10, 4);
  assert.deepEqual(find(tick(st, 50, [ab(0, 'wlan', { x: 12.5, y: 4.5 })]), 'ability').rect, { x0: 9, y0: 1, x1: 15, y1: 7 });
  // Funkloch: Alarm in der Zone verbreitet sich nicht
  st = Q(ROOM, [P(12, 4, 180), P(15, 4), { type: 'dackel', at: [12, 2], dir: 0 }], { team: [['christian', { wlan: 3 }]] });
  place(st.units[0], 7, 4);
  tick(st, 50, [ab(0, 'wlan', { x: 12.5, y: 4.5 })]);
  place(st.units[0], 11, 4);
  ev = run(st, 3000);
  const al = find(ev, 'alert', x => x.enemy === 0);
  assert.ok(al && al.muted && !al.called.length);
  assert.equal(st.alarm, 0);
  assert.ok(!has(ev, 'bark'));
  assert.equal(st.enemies[1].state, 'patrol');
});

// ---------- Hildegard ----------

test('Familientreffen: Stufe 1 laut (Geräusch), Stufe 3: 3 Gegner, kein Geräusch', () => {
  const E = [6, 7, 8].map(x => P(x, 4));
  let st = Q(ROOM, [...E, P(5, 7)], { team: ['hildegard'] });
  place(st.units[0], 4, 4);
  let ev = run(st, 2000, [ab(0, 'family')]);
  assert.deepEqual(find(ev, 'ability').targets.length, 2);
  assert.ok(has(ev, 'noise', n => n.kind === 'familie' && n.r === 5));
  st = Q(ROOM, [...E, P(5, 7)], { team: [['hildegard', { family: 3 }]] });
  place(st.units[0], 4, 4);
  ev = run(st, 2000, [ab(0, 'family')]);
  const a = find(ev, 'ability');
  assert.equal(a.targets.length, 3);
  assert.ok(a.silent && !has(ev, 'noise'));
  assert.equal(st.enemies.filter(e => e.state === 'ko').length, 3);
  assert.equal(st.units[0].cd.family, 45_000);
});

test('„Junge, komm mal her!“: Wache kommt, 10 s Standpauke (Kegel aus), Spezialgegner halb; Stufe 3: 30 s die Ruhe selbst', () => {
  let st = Q(ROOM, [P(10, 4)], { team: ['hildegard', 'christian'] });
  place(st.units[0], 4, 4); place(st.units[1], 2, 8);
  assert.deepEqual(abilitiesFor(st.units[0]).map(a => a.id), ['family', 'junge']);
  let ev = run(st, 100, [ab(0, 'junge', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').say, 'Junge, komm mal her!');
  assert.equal(find(ev, 'task').kind, 'junge');
  assert.deepEqual(visibleCone(st, 0), []);
  ev = run(st, 4000);
  assert.ok(d2(st.enemies[0], 4.5, 4.5) <= 1.6, 'steht bei Hildegard');
  assert.equal(st.enemies[0].suspicion, 0);
  ev = run(st, 10_000);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'junge'));
  // Spezialgegner halb so lang
  st = Q(ROOM, [{ type: 'goebbels', at: [6, 4], dir: 0 }], { team: ['hildegard'] });
  place(st.units[0], 4, 4);
  assert.equal(find(tick(st, 50, [ab(0, 'junge', { enemy: 0 })]), 'ability').ms, 5000);
  // Stufe 3: danach 30 s kein Misstrauen, auch wenn Hildegard vor ihm steht
  st = Q(ROOM, [P(6, 4)], { team: [['hildegard', { junge: 3 }]] });
  place(st.units[0], 4, 4);
  ev = run(st, 16_500, [ab(0, 'junge', { enemy: 0 })]);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'junge'));
  assert.ok(st.enemies[0].calmUntil > st.time + 29_000);
  const e = st.enemies[0];
  place(st.units[0], Math.floor(e.x) + 2, Math.floor(e.y));
  e.dir = 0;
  run(st, 2000);
  assert.equal(e.suspicion, 0);
});

test('Mittagsruhe: Wachen in 6 dösen 15 s, Geräusch in 6 weckt gereizt (Misstrauen ×2 für 20 s); Stufe 3 nur Geräusche in 2', () => {
  for (const level of [1, 3]) {
    const st = Q(ROOM, [P(6, 4), P(8, 4), P(17, 8)], { team: [['hildegard', { mittag: level }], 'christian'] });
    place(st.units[0], 3, 4); place(st.units[1], 3, 2);
    let ev = run(st, 100, [ab(0, 'mittag')]);
    assert.deepEqual(find(ev, 'ability').enemies, [0, 1]);
    assert.deepEqual(visibleCone(st, 0), []);
    assert.equal(st.enemies[0].task.kind, 'mittag');
    assert.equal(st.enemies[2].state, 'patrol');
    ev = run(st, 2000, [ab(1, 'beer', { x: 10.5, y: 4.5 })]);
    assert.ok(has(ev, 'taskEnd', t => t.enemy === 1 && t.reason === 'wach'));
    assert.ok(st.enemies[1].grumpyUntil > st.time + 18_000);
    if (level === 1) assert.ok(has(ev, 'taskEnd', t => t.enemy === 0 && t.reason === 'wach'));
    else assert.equal(st.enemies[0].task?.kind, 'mittag', 'Stufe 3: 4 Kacheln weit weckt nicht');
  }
  // gereizt = doppelt so schnell misstrauisch
  const rate = grumpy => { const s = Q(ROOM, [P(5, 4)]); place(s.units[0], 8, 4); if (grumpy) s.enemies[0].grumpyUntil = 1e9; tick(s, 50); return s.enemies[0].suspicion; };
  assert.ok(Math.abs(rate(true) / rate(false) - 2) < 1e-9);
});

test('Tratsch: die 2 nächsten in 8 laufen zueinander und streiten 12 s (Kegel aufeinander); Stufe 3 tauschen Runden', () => {
  const E = [P(12, 2, 0, { patrol: [[12, 2], [16, 2]] }), P(12, 7, 0, { patrol: [[12, 7], [16, 7]] }), P(18, 1)];
  for (const level of [1, 3]) {
    const st = Q(ROOM, E, { team: [['hildegard', { tratsch: level }]] });
    place(st.units[0], 8, 4);
    const r0 = st.enemies[0].patrol, r1 = st.enemies[1].patrol;
    let ev = run(st, 4000, [ab(0, 'tratsch')]);
    assert.deepEqual(find(ev, 'ability').enemies, [0, 1]);
    const [a, b] = st.enemies;
    assert.equal(a.task.kind, 'tratsch');
    assert.ok(Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - a.dir) < 0.05, 'schaut den anderen an');
    assert.ok(visibleCone(st, 0).length > 2, 'Kegel an');
    assert.equal(st.enemies[2].state, 'patrol');
    ev = run(st, params('tratsch', level).ms);
    assert.ok(has(ev, 'taskEnd', t => t.kind === 'tratsch'));
    if (level === 3) { assert.ok(has(ev, 'routesSwapped')); assert.equal(a.patrol, r1); assert.equal(b.patrol, r0); } else assert.equal(a.patrol, r0);
  }
  const s = Q(ROOM, [P(6, 4)], { team: [['hildegard', { tratsch: 1 }]] });
  assert.ok(has(tick(s, 0, [ab(0, 'tratsch')]), 'fail', f => f.reason === 'noPair'));
});

test('„Ich ruf deine Mutter an!“: Wache geht Richtung Tor, kommt nach 20 s zurück; Spezial halb; Stufe 3 verheult (halbe Sicht 15 s)', () => {
  for (const level of [1, 3]) {
    const st = Q(ROOM, [P(6, 4)], { team: [['hildegard', { mutter: level }]] });
    place(st.units[0], 2, 4);
    let ev = run(st, 3000, [ab(0, 'mutter', { enemy: 0 })]);
    const e = st.enemies[0];
    assert.equal(find(ev, 'task').kind, 'mutter');
    assert.deepEqual(visibleCone(st, 0), []);
    assert.ok(e.x > 9, 'unterwegs zum Tor');
    ev = run(st, params('mutter', level).ms - 2900);
    assert.ok(has(ev, 'taskEnd', t => t.kind === 'mutter'));
    assert.equal(e.state, 'patrol');
    run(st, 100);
    assert.ok(Math.abs(coneLen(st, 0) - (level === 3 ? 2.5 : 5)) < 1e-6);
  }
  const s = Q(ROOM, [{ type: 'himmler', at: [6, 4], dir: 0 }], { team: [['hildegard', { mutter: 1 }]] });
  place(s.units[0], 4, 4);
  assert.equal(find(tick(s, 50, [ab(0, 'mutter', { enemy: 0 })]), 'ability').ms, 10_000);
});

// ---------- Viktor ----------

test('Giftgas Stufe 2 und 3: 14 s, CD 15; Wand 3×5 quer oder längs', () => {
  let st = Q(ROOM, [], { team: [['viktor', { gas: 2 }]] });
  place(st.units[0], 8, 4);
  let a = find(tick(st, 50, [ab(0, 'gas', { x: 12.5, y: 4.5 })]), 'ability');
  assert.deepEqual([a.ms, a.tiles.length, st.units[0].cd.gas], [14_000, 9, 15_000]);
  st = Q(ROOM, [], { team: [['viktor', { gas: 3 }]] });
  place(st.units[0], 8, 4);
  a = find(tick(st, 50, [ab(0, 'gas', { x: 12.5, y: 4.5 }, { dir: 'v' })]), 'ability');
  assert.deepEqual([a.dir, a.tiles.length, a.rect], ['v', 15, { x0: 11, y0: 2, x1: 13, y1: 6 }]);
  st.units[0].cd = {};
  a = find(tick(st, 50, [ab(0, 'gas', { x: 12.5, y: 4.5 }, { dir: 'h' })]), 'ability');
  assert.deepEqual([a.dir, a.rect], ['h', { x0: 10, y0: 3, x1: 14, y1: 5 }]);
});

test('Argumentationslogik: Stufe 2 12 s bis 4; Stufe 3 hört eine zweite Wache in 3 zu', () => {
  const st = Q(ROOM, [P(10, 3), P(12, 3), P(17, 8)], { team: [['viktor', { argue: 3 }]] });
  place(st.units[0], 6, 3);
  const ev = tick(st, 50, [ab(0, 'argue', { enemy: 0 })]);
  const a = find(ev, 'ability');
  assert.deepEqual([a.ms, a.second], [12_000, 1]);
  assert.equal(st.enemies[1].reason, 'argue');
  assert.equal(st.enemies[2].state, 'patrol');
});

test('Crash-Gerücht: Wachen in 6 checken 10 s ihr Depot (Kegel aus), Spezial halb; Stufe 3 Panikverkauf Richtung Tor', () => {
  let st = Q(ROOM, [P(7, 4), P(8, 7), { type: 'himmler', at: [6, 2], dir: 0 }, P(17, 4)], { team: [['viktor', { crash: 1 }]] });
  place(st.units[0], 4, 4);
  let ev = run(st, 100, [ab(0, 'crash')]);
  assert.deepEqual(find(ev, 'ability').enemies.sort(), [0, 1, 2]);
  assert.deepEqual(visibleCone(st, 0), []);
  assert.equal(st.enemies[3].state, 'patrol');
  ev = run(st, 5100);
  assert.ok(has(ev, 'taskEnd', t => t.enemy === 2), 'Himmler nach 5 s');
  assert.equal(st.enemies[0].task.kind, 'crash');
  ev = run(st, 5000);
  assert.ok(has(ev, 'taskEnd', t => t.enemy === 0 && t.kind === 'crash'));
  st = Q(ROOM, [P(7, 4)], { team: [['viktor', { crash: 3 }]] });
  place(st.units[0], 4, 4);
  ev = run(st, 14_100, [ab(0, 'crash')]);
  assert.ok(has(ev, 'task', t => t.kind === 'panik' && t.end > st.time));
  run(st, 2500);
  assert.ok(st.enemies[0].x > 10, 'rennt Richtung Tor');
});

test('Insider-Tipp: Wache läuft zum Punkt und wartet 8 s (Kegel an); zu weit = Fehler; Stufe 3 kommt eine zweite mit', () => {
  let st = Q(ROOM, [P(6, 4), P(8, 2)], { team: [['viktor', { insider: 1 }]] });
  place(st.units[0], 4, 4);
  assert.ok(has(tick(st, 0, [ab(0, 'insider', { enemy: 0 }, { target2: { x: 18.5, y: 8.5 } })]), 'fail', f => f.reason === 'far'));
  let ev = run(st, 4000, [ab(0, 'insider', { enemy: 0 }, { target2: { x: 6.5, y: 8.5 } })]);
  assert.deepEqual(find(ev, 'ability').to, { x: 6.5, y: 8.5 });
  assert.equal(st.enemies[0].task.kind, 'insider');
  assert.ok(d2(st.enemies[0], 6.5, 8.5) < 0.1);
  assert.ok(visibleCone(st, 0).length > 2);
  assert.equal(st.enemies[1].state, 'patrol');
  ev = run(st, 8000);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'insider'));
  // Dem Tippgeber glaubt sie: Der Weg führt an Viktor vorbei, trotzdem kein Verdacht
  st = Q(ROOM, [P(6, 4)], { team: [['viktor', { insider: 1 }]] });
  place(st.units[0], 4, 4);
  ev = run(st, 4000, [ab(0, 'insider', { enemy: 0 }, { target2: { x: 2.5, y: 7.5 } })]);
  assert.ok(!has(ev, 'taskEnd') && !has(ev, 'alert'));
  assert.equal(st.enemies[0].suspicion, 0);
  st = Q(ROOM, [P(6, 4), P(8, 2)], { team: [['viktor', { insider: 3 }]] });
  place(st.units[0], 4, 4);
  ev = run(st, 5000, [ab(0, 'insider', { enemy: 0 }, { target2: { x: 6.5, y: 8.5 } })]);
  assert.equal(find(ev, 'ability').second, 1);
  assert.ok(d2(st.enemies[1], 6.5, 8.5) <= 1.6);
});

test('Deobombe: Nebel 5×5 blickdicht rein/raus, kein Husten; Stufe 3: Klauen im Nebel hört keiner, Deckung auch beim Anrempeln', () => {
  let st = Q(ROOM, [P(5, 4), P(10, 3, 180)], { team: [['viktor', { deo: 1 }]] });
  place(st.units[0], 11, 7);
  let ev = run(st, 100, [ab(0, 'deo', { x: 10.5, y: 4.5 })]);
  assert.deepEqual(find(ev, 'ability').rect, { x0: 8, y0: 2, x1: 12, y1: 6 });
  assert.ok(!has(ev, 'stun'));
  assert.ok(coneLen(st, 1) < 1, 'drinnen sieht keiner raus');
  place(st.units[0], 9, 4);
  run(st, 1500);
  assert.equal(st.enemies[0].suspicion, 0, 'reinsehen geht nicht');
  // Arbeitsgeräusch: ohne Nebel hört die Wache daneben das Klauen, mit Stufe 3 nicht
  const MAP = ['##############', '#PPP.........#', '#............#', '#.....C......#', '#............#', '##############'];
  const steal = level => {
    const s = Q(MAP, [P(8, 3)], { team: [['viktor', { deo: level }]], coins: 3 });
    place(s.units[0], 7, 3);
    if (level) tick(s, 0, [ab(0, 'deo', { x: 7.5, y: 3.5 })]);
    return run(s, 2900, [{ type: 'interact', unit: 0, obj: 0 }]);
  };
  assert.ok(has(steal(0), 'heard'));
  assert.ok(has(steal(1), 'heard'), 'Stufe 1 dämpft nicht');
  assert.ok(!has(steal(3), 'heard'));
  // Deckung: selbst direkt an der Wache unsichtbar (Stufe 3), Stufe 1 verrät Anrempeln
  const bump = level => {
    const s = Q(MAP, [P(8, 3)], { team: [['viktor', { deo: level }]] });
    place(s.units[0], 7, 3);
    tick(s, 0, [ab(0, 'deo', { x: 8.5, y: 3.5 })]);
    place(s.units[0], 8, 3);
    run(s, 500);
    return s.enemies[0].suspicion;
  };
  assert.ok(bump(1) > 0);
  assert.equal(bump(3), 0);
});

// ---------- Micha ----------

test('Hardware-Wallet: Stufe 2 Drohne 15 s, CD 18; Stufe 3 bekommen Teamkameraden in 2 am selben Tresor volle Taschen', () => {
  let st = Q(ROOM, [{ type: 'drohne', at: [8, 4], dir: 0 }], { team: [['micha', { wallet: 2 }]] });
  place(st.units[0], 4, 4);
  assert.ok(has(tick(st, 50, [ab(0, 'wallet', { enemy: 0 })]), 'stun', s => s.reason === 'hack' && s.ms === 15_000));
  st = Q(['##########', '#PPP.....#', '#....C...#', '#........#', '##########'], [], { team: [['micha', { wallet: 3 }], 'christian', 'viktor'], coins: 5 });
  const [m, c, v] = st.units;
  place(m, 4, 2); place(c, 4, 1); place(v, 8, 3);
  const ev = tick(st, 50, [ab(0, 'wallet', { obj: 0 })]);
  assert.deepEqual(find(ev, 'ability').shared, [{ unit: 1, coins: 2 }]);
  assert.deepEqual([m.carry, c.carry, v.carry, st.objs[0].coins], [2, 2, 0, 1]);
  assert.equal(ev.filter(e => e.type === 'steal').length, 2);
});

test('Controllerwurf Stufe 3: Abpraller trifft eine zweite Wache in 3', () => {
  const st = Q(ROOM, [P(10, 4), P(12, 4), P(17, 8)], { team: [['micha', { controller: 3 }]] });
  place(st.units[0], 4, 4);
  const ev = run(st, 1000, [ab(0, 'controller', { enemy: 0 })]);
  assert.ok(has(ev, 'stun', s => s.enemy === 0 && s.ms === 14_000));
  assert.ok(has(ev, 'stun', s => s.enemy === 1 && s.bounce === 0));
  assert.equal(st.enemies[2].state, 'patrol');
});

test('Firewall: nur Rüther kommen durch, Gegner nicht, Sicht frei; Stufe 3 blickdicht', () => {
  const MAP = ['####################', '#PPP...............#', '#..................#', '#########.##########', '#..................#', '#..................#', '####################'];
  for (const level of [1, 3]) {
    const st = Q(MAP, [P(9, 5, -90, { patrol: [[9, 5], [9, 1]] })], { team: [['micha', { firewall: level }], 'christian'] });
    place(st.units[0], 5, 2); place(st.units[1], 9, 1);
    st.enemies[0].dir = -Math.PI / 2;
    let ev = tick(st, 50, [ab(0, 'firewall', { x: 9.5, y: 3.5 }, { dir: 'h' })]);
    const a = find(ev, 'ability');
    assert.deepEqual([a.tiles, a.dir, a.opaque], [[{ x: 9, y: 3 }], 'h', level === 3]);
    ev = run(st, 3000);
    assert.ok(st.enemies[0].y > 4, 'Wache kommt nicht durch');
    if (level === 1) assert.ok(st.enemies[0].suspicion > 0, 'durchsehen geht');
    else assert.equal(st.enemies[0].suspicion, 0);
    st.units[1].x = 2.5; st.units[1].y = 1.5; st.enemies[0].suspicion = 0;
    ev = run(st, 100, [{ type: 'move', unit: 0, to: { x: 14, y: 5 } }]);
    assert.ok(find(ev, 'path').path.some(n => n.x === 9 && n.y === 3), 'Micha geht durch');
  }
});

test('Raubkopie: Fake mit Gesicht des Teammitglieds läuft zum zweiten Punkt, Wachen jagen ihn ohne Alarm; Stufe 3 „Lizenz ungültig“', () => {
  for (const level of [1, 3]) {
    const st = Q(ROOM, [P(10, 4, 180)], { team: [['micha', { raubkopie: level }], 'christian'] });
    place(st.units[0], 3, 8); place(st.units[1], 18, 1);
    let ev = run(st, 1500, [ab(0, 'raubkopie', { x: 6.5, y: 4.5 }, { target2: { x: 2.5, y: 2.5 }, face: 1 })]);
    const a = find(ev, 'ability');
    assert.deepEqual([a.face, a.faceUnit, a.ms, a.to], ['christian', 1, params('raubkopie', level).ms, { x: 2.5, y: 2.5 }]);
    assert.ok(has(ev, 'task', t => t.kind === 'raubkopie' && t.enemy === 0));
    ev = run(st, 4000);
    assert.equal(st.alarm, 0);
    assert.ok(!has(ev, 'alert'));
    if (level === 3) assert.ok(has(ev, 'stun', s => s.reason === 'lizenz' && s.ms === 6000));
    else assert.ok(st.enemies[0].task?.kind === 'raubkopie' && d2(st.enemies[0], 2.5, 2.5) < 1.5);
    ev = run(st, params('raubkopie', level).ms - 5400);
    assert.ok(has(ev, 'effectEnd', f => f.kind === 'decoy'));
  }
});

test('Vibrationsalarm: Wache bis 8 schaut 4 s aufs Handy (Kegel aus); Stufe 2 6 s/CD 6; Stufe 3 Gruppen-Chat', () => {
  let st = Q(ROOM, [P(10, 4), P(13, 4)], { team: [['micha', { vibra: 1 }]] });
  place(st.units[0], 3, 4);
  let ev = run(st, 100, [ab(0, 'vibra', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').second, -1);
  assert.deepEqual(visibleCone(st, 0), []);
  assert.ok(visibleCone(st, 1).length > 2);
  ev = run(st, 4000);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'vibra'));
  st = Q(ROOM, [P(10, 4), P(13, 4)], { team: [['micha', { vibra: 3 }]] });
  place(st.units[0], 3, 4);
  ev = run(st, 100, [ab(0, 'vibra', { enemy: 0 })]);
  assert.deepEqual([find(ev, 'ability').ms, find(ev, 'ability').second, st.units[0].cd.vibra], [6000, 1, 6000]);
  assert.deepEqual(visibleCone(st, 1), []);
});

// ---------- Ramona ----------

test('M&Ms: Stufe 2 30 s KO und Wurf bis 6, Stufe 3 Familienpackung für 2 Wachen', () => {
  const MAP = ['####################', '#PPP...............#', '#..................#', '#...~..............#', '#..................#', '####################'];
  const st = Q(MAP, [P(12, 3), P(11, 1)], { team: [['ramona', { mms: 3 }]] });
  place(st.units[0], 4, 3);
  const ev = run(st, 12_000, [ab(0, 'mms', { x: 7.5, y: 3.5 })]);
  assert.equal(find(ev, 'bait').portions, 2);
  const eats = ev.filter(e => e.type === 'stun' && e.reason === 'eat');
  assert.deepEqual(eats.map(e => e.enemy).sort(), [0, 1]);
  assert.ok(eats.every(e => e.ms === 30_000));
  assert.ok(!st.effects.some(f => f.kind === 'mms'));
});

test('Unlimited Credits: Stufe 2 40 s/CD 22; Stufe 3 Spitzel deckt 25 s Gegner in 5 auf', () => {
  const st = Q(ROOM, [P(8, 4, 180), P(12, 4), P(17, 8)], { team: [['ramona', { credits: 3 }]] });
  place(st.units[0], 7, 4);
  let ev = tick(st, 50, [ab(0, 'credits', { enemy: 0 })]);
  assert.deepEqual([find(ev, 'ability').ms, find(ev, 'ability').spy, st.units[0].cd.credits], [40_000, 25_000, 22_000]);
  tick(st, 50);
  assert.deepEqual(st.enemies.map(e => e.revealed), [false, true, false]);
  run(st, 25_000);
  assert.equal(st.enemies[1].revealed, false);
});

test('Trollkids-Horde: Wachen im 5×5 stehen fest (Kegel aus), dann frei; Stufe 3 zieht die Horde einen Weg entlang', () => {
  let st = Q(ROOM, [P(12, 4), P(13, 5), P(17, 4)], { team: [['ramona', { horde: 1 }]] });
  place(st.units[0], 7, 4);
  let ev = run(st, 100, [ab(0, 'horde', { x: 12.5, y: 4.5 })]);
  assert.equal(find(ev, 'ability').size, 5);
  assert.deepEqual([st.enemies[0].task?.kind, st.enemies[1].task?.kind, st.enemies[2].state], ['horde', 'horde', 'patrol']);
  assert.deepEqual(visibleCone(st, 0), []);
  ev = run(st, 10_500);
  assert.ok(has(ev, 'taskEnd', t => t.kind === 'horde' && t.enemy === 0));
  assert.equal(st.enemies[0].state, 'patrol');
  st = Q(ROOM, [P(12, 4), P(17, 4)], { team: [['ramona', { horde: 3 }]] });
  place(st.units[0], 7, 4);
  assert.ok(has(tick(st, 0, [ab(0, 'horde', { x: 12.5, y: 4.5 }, { target2: { x: 1.5, y: 8.5 } })]), 'fail', f => f.reason === 'far'));
  ev = run(st, 4000, [ab(0, 'horde', { x: 12.5, y: 4.5 }, { target2: { x: 17.5, y: 4.5 } })]);
  assert.ok(find(ev, 'ability').path.length >= 5);
  assert.ok(has(ev, 'task', t => t.kind === 'horde' && t.enemy === 1), 'zieht weiter und erwischt die zweite');
});

test('Sale-Schild: Wache in 2 bleibt 4 s stehen, jede höchstens alle 15 s; ein Schild ersetzt das alte, Stufe 3 zwei gleichzeitig', () => {
  let st = Q(ROOM, [P(14, 3, 180, { patrol: [[14, 3], [6, 3]] })], { team: [['ramona', { sale: 1 }]] });
  place(st.units[0], 10, 7);
  let ev = run(st, 4000, [ab(0, 'sale', { x: 10.5, y: 4.5 })]);
  const t = find(ev, 'task', x => x.kind === 'sale');
  assert.ok(t && t.ms === 4000);
  assert.ok(st.enemies[0].saleAt > st.time);
  ev = run(st, 4000);
  assert.ok(has(ev, 'taskEnd', x => x.kind === 'sale'));
  st.units[0].cd = {};
  ev = tick(st, 50, [ab(0, 'sale', { x: 11.5, y: 5.5 })]);
  assert.ok(has(ev, 'effectEnd', f => f.kind === 'sale' && f.reason === 'ersetzt'));
  assert.equal(st.effects.filter(f => f.kind === 'sale').length, 1);
  st = Q(ROOM, [], { team: [['ramona', { sale: 3 }]] });
  place(st.units[0], 10, 4);
  for (const x of [9.5, 11.5, 12.5]) { st.units[0].cd = {}; tick(st, 50, [ab(0, 'sale', { x, y: 4.5 })]); }
  assert.deepEqual(st.effects.filter(f => f.kind === 'sale').map(f => f.x), [11.5, 12.5]);
  assert.equal(params('sale', 2).ms, 120_000);
});

test('„Feierabend!“: normale Wache kündigt, geht zum Tor und ist weg; Ladungen; nicht bei Spezialgegnern und Drohnen; Stufe 3 Kollege', () => {
  let st = Q(ROOM, [P(8, 4), { type: 'goebbels', at: [6, 2], dir: 0 }, { type: 'drohne', at: [6, 6], dir: 0 }], { team: [['ramona', { feierabend: 1 }]] });
  place(st.units[0], 7, 4);
  assert.ok(has(tick(st, 0, [ab(0, 'feierabend', { enemy: 1 })]), 'fail', f => f.reason === 'quits'));
  assert.ok(has(tick(st, 0, [ab(0, 'feierabend', { enemy: 2 })]), 'fail', f => f.reason === 'quits'));
  assert.deepEqual(abilityTargets(st, 0, 'feierabend').map(x => x.enemy), [0]);
  let ev = run(st, 100, [ab(0, 'feierabend', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').charges, 0);
  assert.equal(st.enemies[0].task.kind, 'feierabend');
  assert.deepEqual(visibleCone(st, 0), []);
  assert.ok(has(tick(st, 0, [ab(0, 'feierabend', { enemy: 0 })]), 'fail', f => f.reason === 'target' || f.reason === 'charges'));
  ev = run(st, 12_000);
  assert.ok(has(ev, 'gone', g => g.enemy === 0));
  assert.deepEqual([st.enemies[0].state, st.enemies[0].gone], ['ko', true]);
  assert.ok(d2(st.enemies[0], 18.5, 8.5) < 2, 'am Tor verschwunden');
  // Stufe 2: zwei Ladungen; Stufe 3 nimmt einen normalen Kollegen in 4 mit
  st = Q(ROOM, [P(8, 4), P(10, 4), P(14, 4)], { team: [['ramona', { feierabend: 3 }]] });
  place(st.units[0], 7, 4);
  assert.equal(st.units[0].charges.feierabend, 2);
  ev = run(st, 100, [ab(0, 'feierabend', { enemy: 0 })]);
  assert.equal(find(ev, 'ability').buddy, 1);
  place(st.units[0], 13, 4);
  run(st, 100, [ab(0, 'feierabend', { enemy: 2 })]);
  assert.equal(st.units[0].charges.feierabend, 0);
  place(st.units[0], 2, 8);
  assert.ok(has(tick(st, 0, [ab(0, 'feierabend', { enemy: 2 })]), 'fail', f => f.reason === 'charges' || f.reason === 'target'));
});

// ---------- §4 Nahkampf ----------

test('§4 Nahkampf: eine alarmierte Wache kostet ≥ 50 % HP, zwei legen Lv. 20 legendär in ≤ 12 s um; Fähigkeits-Stufen machen Gegner stärker', () => {
  const legend = id => makeFighter(RUETHER_BY_ID[id], { rarity: 'legendaer', level: 20 });
  for (const r of RUETHERS) for (const f of [makeFighter(r), makeFighter(r, { rarity: 'legendaer', level: 20 })]) {
    const st = Q(ROOM, [P(6, 4, 180)], { team: [f] });
    const u = st.units[0], e = st.enemies[0];
    place(u, 5, 4);
    Object.assign(e, { state: 'alert', suspicion: 1, lastSeen: { x: u.x, y: u.y } });
    for (let t = 0; t < 60_000 && !u.down && e.state !== 'ko'; t += 50) tick(st, 50);
    assert.ok(u.hp <= u.maxHp / 2, `${r.id} Lv. ${f.level}: nur ${Math.round(100 - 100 * u.hp / u.maxHp)} % verloren`);
  }
  const st = Q(ROOM, [P(6, 4, 180), P(5, 5, -90)], { team: [legend('hildegard')] });
  const u = st.units[0];
  place(u, 5, 4);
  for (const e of st.enemies) Object.assign(e, { state: 'alert', suspicion: 1, lastSeen: { x: u.x, y: u.y } });
  let t = 0;
  for (; t < 12_000 && !u.down; t += 50) tick(st, 50);
  assert.ok(u.down, `steht nach ${t} ms noch`);
  assert.ok(st.enemies.every(e => e.state !== 'ko'));
  // mitwachsend: 3 × 6 Stufen über 1 → dps × 1,54, HP × 1,36
  const max = id => [id, Object.fromEntries([...FIXED[id], POOLS[id][0]].map(a => [a, 3]))];
  const a = Q(ROOM, [P(6, 4)], { team: ['christian', 'micha', 'viktor'] }), b = Q(ROOM, [P(6, 4)], { team: [max('christian'), max('micha'), max('viktor')] });
  assert.ok(Math.abs(b.dmgScale / a.dmgScale - 1.54) < 1e-9);
  assert.equal(b.enemies[0].maxHp, Math.round(60 * 1.6 * 1.36));
  assert.equal(a.enemies[0].maxHp, 96);
});

test('§4 Alarm: alarmierte Gegner rufen Kollegen in 8 Kacheln', () => {
  const st = Q(ROOM, [P(5, 4), P(12, 8), P(17, 1)]);
  place(st.units[0], 8, 4);
  const ev = run(st, 3000);
  const a = find(ev, 'alert', x => x.enemy === 0);
  assert.ok(a.called.includes(1), '7,6 Kacheln entfernt');
  assert.ok(!a.called.includes(2));
});

// ---------- Leistung ----------

test('Leistung: Camping-Karte, 5 Rüther mit allen Fähigkeiten auf Stufe 3 dauernd im Einsatz: 1000 Ticks < 400 ms', { skip: !MISSION_BY_ID.camping && 'Mission fehlt' }, () => {
  const m = { ...MISSION_BY_ID.camping, solo: null }, l = m.layouts[0];
  const full = id => [id, Object.fromEntries([...FIXED[id], ...POOLS[id]].map(a => [a, 3]))];
  const setup = { layoutId: l.id, variantId: l.variants[0].id, mirror: false, seed: 5 };
  const st = createQuest({ mission: m, setup, team: [full('christian'), full('micha'), full('ramona')].map(F), rng: seededRng(5) });
  const s2 = createQuest({ mission: m, setup, team: [full('hildegard'), full('viktor')].map(F), rng: seededRng(5) });
  for (const u of s2.units) st.units.push({ ...u, i: st.units.length });
  for (const u of st.units) u.hp = u.maxHp = 1e9; // keiner fällt um, alles bleibt im Einsatz
  const kinds = new Set(), tasks = new Set();
  const salvo = () => {
    const cmds = [];
    st.units.forEach((u, k) => {
      const e = st.enemies[k % st.enemies.length], ex = Math.floor(e.x), ey = Math.floor(e.y);
      u.cd = {}; for (const id of Object.keys(u.charges)) u.charges[id] = 2;
      Object.assign(u, { x: ex + 0.5, y: ey + 0.5, path: [], intent: null, busy: null, item: false });
      for (const a of u.abilities) { // Gas woanders hin, sonst husten alle statt Aufgaben zu erledigen; Familie fesselt für immer, die bleibt weg
        if (a.id === 'family') continue;
        const p = a.id === 'gas' ? { x: st.spots[0].x + 0.5, y: st.spots[0].y + 0.5 } : { x: ex + 0.5, y: ey + 0.5 };
        cmds.push(ab(u.i, a.id, { enemy: e.i, ...p, door: 0, obj: 0 }, { target2: { x: ex + 0.5, y: ey + 0.5 }, dir: 'h', face: 0 }));
      }
    });
    return cmds;
  };
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    for (const e of tick(st, 50, i % 200 === 0 ? salvo() : [])) if (e.type === 'task') tasks.add(e.kind);
    if (st.paused) tick(st, 0, [{ type: 'resume' }]);
    for (let k = 0; k < st.enemies.length; k++) visibleCone(st, k);
    for (const f of st.effects) kinds.add(f.kind);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
  assert.ok(kinds.size >= 7 && tasks.size >= 5, `Effekte ${[...kinds]}, Aufgaben ${[...tasks]}`);
});
