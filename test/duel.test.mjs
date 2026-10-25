import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUEL, createDuel, tickDuel, endDuel, duelSnapshot, fromDuelSnapshot, duelOutcome, duelReward, duelFighters } from '../js/duel.js';
import { makeFighter } from '../js/battle.js';
import { RUETHER_BY_ID, CONST } from '../js/data.js';

const F = id => makeFighter(RUETHER_BY_ID[id]);
const D = (a, b, opts = {}) => createDuel({ a: a.map(F), b: b.map(F), ...opts });
// tickt in 50-ms-Schritten ohne Eingaben
function run(s, ms, dt = DUEL.STEP) {
  const ev = [];
  for (let t = 0; t < ms; t += dt) ev.push(...tickDuel(s, dt));
  return ev;
}
const find = (ev, type, side) => ev.find(e => e.type === type && (side == null || e.side === side));
const has = (ev, type, side) => !!find(ev, type, side);

test('createDuel: Klone mit doppelter Lebensenergie, Original bleibt', () => {
  const c = F('christian');
  const s = createDuel({ a: [c], b: [F('viktor')] });
  assert.equal(s.a.team[0].maxBtc, 200);
  assert.equal(s.a.team[0].btc, 200);
  assert.equal(s.b.team[0].btc, 180);
  assert.equal(c.btc, 100);
  assert.equal(s.a.active, 0);
  assert.equal(s.winner, null);
});

test('duelFighters: unbekannte id raus, Seltenheit/Level geprüft, höchstens 3', () => {
  const f = duelFighters([{ id: 'hacker' }, { id: 'christian', rarity: 'gold', level: 99 }, { id: 'viktor', rarity: 'episch', level: -3 }, { id: 'micha' }, { id: 'ramona' }]);
  assert.deepEqual(f.map(x => x.id), ['christian', 'viktor', 'micha']);
  assert.equal(f[0].rarity, 'normal');
  assert.equal(f[0].level, CONST.LEVEL_MAX);
  assert.equal(f[1].rarity, 'episch');
  assert.equal(f[1].level, 1);
  assert.deepEqual(duelFighters(null), []);
});

test('Tipp: 3 Schaden am gegnerischen Aktiven, +10 Mining, Cooldown 250 ms, höchstens einer pro Schritt', () => {
  const s = D(['christian'], ['viktor']);
  let ev = tickDuel(s, 50, { a: { taps: 3 } });
  assert.deepEqual(find(ev, 'fast', 'a'), { type: 'fast', side: 'a', damage: 3 });
  assert.equal(ev.filter(e => e.type === 'fast').length, 1);
  assert.equal(s.b.team[0].btc, 177);
  assert.equal(s.a.team[0].energy, 10);
  for (let i = 0; i < 4; i++) { ev = tickDuel(s, 50, { a: { taps: 1 } }); assert.ok(!has(ev, 'fast'), `Cooldown, Schritt ${i}`); }
  ev = tickDuel(s, 50, { a: { taps: 1 } }); // 250 ms später
  assert.ok(has(ev, 'fast', 'a'));
  assert.equal(s.b.team[0].btc, 174);
});

test('Spezial: angekündigt, nach WARN Treffer mit Gift; ohne Mining verweigert', () => {
  const s = D(['viktor'], ['christian']);
  let ev = tickDuel(s, 50, { a: { special: 0 } });
  assert.deepEqual(find(ev, 'specialDenied'), { type: 'specialDenied', side: 'a', index: 0 });
  s.a.team[0].energy = 100;
  ev = tickDuel(s, 50, { a: { special: 0 } });
  assert.deepEqual(find(ev, 'charge'), { type: 'charge', side: 'a', fighter: 0, index: 0, ms: DUEL.WARN });
  assert.equal(s.a.team[0].energy, 0);
  ev = tickDuel(s, 50, { a: { special: 1 } }); // eigene Ladung läuft: keine zweite
  assert.ok(has(ev, 'specialDenied', 'a'));
  ev = run(s, DUEL.WARN - 100);
  assert.ok(!has(ev, 'special'));
  assert.equal(s.b.team[0].btc, 200);
  ev = run(s, 50);
  const sp = find(ev, 'special', 'a');
  assert.deepEqual(sp, { type: 'special', side: 'a', fighter: 0, index: 0, damage: 10, dodged: false });
  assert.deepEqual(find(ev, 'poisoned'), { type: 'poisoned', side: 'b', ms: 8000 });
  assert.ok(s.b.team[0].status.poison);
  ev = run(s, 1000);
  assert.deepEqual(find(ev, 'poison'), { type: 'poison', side: 'b', damage: 5 });
});

test('Ausweichen: 25 % Schaden, kein Gift, keine Betäubung; ohne Ladung nichts', () => {
  const s = D(['viktor'], ['christian']);
  let ev = tickDuel(s, 50, { b: { dodge: true } });
  assert.ok(!has(ev, 'dodge'));
  s.a.team[0].energy = 100;
  tickDuel(s, 50, { a: { special: 0 } });
  ev = tickDuel(s, 50, { b: { dodge: true } });
  assert.deepEqual(find(ev, 'dodge'), { type: 'dodge', side: 'b' });
  ev = run(s, DUEL.WARN);
  const sp = find(ev, 'special', 'a');
  assert.equal(sp.dodged, true);
  assert.equal(sp.damage, 2); // floor(10 × 0,25)
  assert.ok(!has(ev, 'poisoned'));
  assert.equal(s.b.team[0].status.poison, null);
  // Betäubung ausgewichen
  s.a.team[0].energy = 50;
  tickDuel(s, 50, { a: { special: 1 } });
  tickDuel(s, 50, { b: { dodge: true } });
  ev = run(s, DUEL.WARN);
  assert.ok(!has(ev, 'stun'));
  assert.equal(s.b.team[0].status.stunUntil, 0);
});

// Abwehr-Fenster: vom Schritt der Ankündigung bis einschließlich zum Schritt des Feuerns (Schritte 2 → 3 → 4), danach zu spät.
// duel-ui.js lässt das Requisit genau in diesem Fenster fliegen.
test('Ausweichen zählt im Schritt der Ankündigung und im Schritt des Feuerns, danach nicht mehr', () => {
  let s = D(['christian'], ['viktor']);
  s.a.team[0].energy = 100;
  let ev = tickDuel(s, 50, { a: { special: 0 }, b: { dodge: true } });
  assert.ok(has(ev, 'charge', 'a') && has(ev, 'dodge', 'b'), 'gleicher Schritt wie die Ankündigung');
  s = D(['christian'], ['viktor']);
  s.a.team[0].energy = 100;
  tickDuel(s, 50, { a: { special: 0 } });
  assert.ok(!has(run(s, DUEL.WARN - 50), 'special'));
  ev = tickDuel(s, 50, { b: { dodge: true } }); // letzter Schritt: Ausweichen vor dem Feuern
  assert.deepEqual(find(ev, 'special', 'a'), { type: 'special', side: 'a', fighter: 0, index: 0, damage: 10, dodged: true }); // floor(40 × 0,25)
  assert.ok(!has(tickDuel(s, 50, { b: { dodge: true } }), 'dodge'), 'nach dem Feuern zu spät');
  assert.equal(s.b.team[0].btc, 170);
});

test('Betäubung: kein Tipp (stunnedTap), keine Spezial; Wechseln geht trotzdem', () => {
  const s = D(['viktor'], ['christian', 'micha']);
  s.a.team[0].energy = 50;
  tickDuel(s, 50, { a: { special: 1 } });
  const ev = run(s, DUEL.WARN);
  assert.deepEqual(find(ev, 'stun'), { type: 'stun', side: 'b', ms: 3000 });
  let e2 = tickDuel(s, 50, { b: { taps: 1 } });
  assert.deepEqual(find(e2, 'stunnedTap'), { type: 'stunnedTap', side: 'b' });
  s.b.team[0].energy = 100;
  e2 = tickDuel(s, 50, { b: { special: 0 } });
  assert.ok(has(e2, 'specialDenied', 'b'));
  e2 = tickDuel(s, 50, { b: { switchTo: 1 } });
  assert.deepEqual(find(e2, 'switch'), { type: 'switch', side: 'b', to: 1 });
  e2 = tickDuel(s, 50, { b: { taps: 1 } });
  assert.ok(has(e2, 'fast', 'b'));
});

test('Schwächung beim Ziel: dessen Tipps machen 75 %', () => {
  const s = createDuel({ a: [F('christian')], b: [makeFighter(RUETHER_BY_ID.viktor, { rarity: 'legendaer', level: 20 })] });
  s.a.team[0].energy = 50;
  tickDuel(s, 50, { a: { special: 1 } }); // Vice-President-Handschlag, weaken 8000
  const ev = run(s, DUEL.WARN);
  assert.deepEqual(find(ev, 'weaken'), { type: 'weaken', side: 'b', ms: 8000 });
  const p = s.b.team[0].power;
  const before = s.a.team[0].btc;
  tickDuel(s, 50, { b: { taps: 1 } });
  assert.equal(before - s.a.team[0].btc, Math.floor(CONST.FAST_DAMAGE * p * CONST.WEAKEN_FACTOR));
});

test('Hardware-Wallet heilt um den tatsächlichen Schaden', () => {
  const s = D(['micha'], ['christian']);
  s.a.team[0].btc = 100;
  s.a.team[0].energy = 100;
  tickDuel(s, 50, { a: { special: 0 } });
  const ev = run(s, DUEL.WARN);
  assert.equal(find(ev, 'special', 'a').damage, 30);
  assert.deepEqual(find(ev, 'heal', 'a'), { type: 'heal', side: 'a', amount: 30 });
  assert.equal(s.a.team[0].btc, 130);
});

test('heal und summon wirken sofort, once geht nur einmal', () => {
  const s = D(['ramona'], ['hildegard']);
  s.a.team[0].btc = 100; s.a.team[0].energy = 50;
  let ev = tickDuel(s, 50, { a: { special: 1 } });
  assert.deepEqual(find(ev, 'special', 'a'), { type: 'special', side: 'a', fighter: 0, index: 1, damage: 0, dodged: false });
  assert.deepEqual(find(ev, 'heal', 'a'), { type: 'heal', side: 'a', amount: 40 });
  assert.equal(s.a.charge, null);
  s.b.team[0].energy = 100;
  ev = tickDuel(s, 50, { b: { special: 0 } });
  assert.deepEqual(find(ev, 'summoned', 'b'), { type: 'summoned', side: 'b', ids: ['christian', 'micha'], names: ['Christian', 'Onkel Micha'], ms: 10_000 });
  assert.equal(s.b.charge, null);
  ev = run(s, 1000);
  const hits = ev.filter(e => e.type === 'summon' && e.side === 'b');
  assert.equal(hits.length, 2);
  assert.ok(hits.every(h => h.damage === 4));
  s.b.team[0].energy = 100;
  ev = tickDuel(s, 50, { b: { special: 0 } });
  assert.ok(has(ev, 'specialDenied', 'b'));
  assert.equal(s.b.team[0].energy, 100);
  ev = run(s, 10_000);
  assert.equal(ev.filter(e => e.type === 'summon').length, 18); // 10 s lang 2 Helfer, die ersten 2 Schläge oben
  assert.equal(s.b.summons.length, 0);
});

test('Wechsel bricht die eigene Ladung ab, Mining ist weg', () => {
  const s = D(['viktor', 'christian'], ['micha']);
  s.a.team[0].energy = 100;
  tickDuel(s, 50, { a: { special: 0 } });
  const ev = tickDuel(s, 50, { a: { switchTo: 1 } });
  assert.deepEqual(find(ev, 'cancel'), { type: 'cancel', side: 'a', fighter: 0, index: 0 });
  assert.deepEqual(find(ev, 'switch'), { type: 'switch', side: 'a', to: 1 });
  assert.equal(s.a.charge, null);
  assert.equal(s.a.team[0].energy, 0);
  assert.ok(!has(run(s, DUEL.WARN), 'special'));
  // auf sich selbst, unbekannt oder pleite: nichts
  s.a.team[0].btc = 0;
  assert.ok(!has(tickDuel(s, 50, { a: { switchTo: 0 } }), 'switch'));
  assert.ok(!has(tickDuel(s, 50, { a: { switchTo: 7 } }), 'switch'));
  assert.ok(!has(tickDuel(s, 50, { a: { switchTo: '1' } }), 'switch'));
});

test('Gegner wechselt während der Ladung: sie trifft den dann Aktiven', () => {
  const s = D(['christian'], ['viktor', 'micha']);
  s.a.team[0].energy = 100;
  tickDuel(s, 50, { a: { special: 0 } });
  tickDuel(s, 50, { b: { switchTo: 1 } });
  run(s, DUEL.WARN);
  assert.equal(s.b.team[0].btc, 180);
  assert.equal(s.b.team[1].btc, 160);
});

test('K.o.: Ladung bricht ab, automatischer Wechsel zum ersten Lebenden', () => {
  const s = D(['christian'], ['viktor', 'micha', 'ramona']);
  s.b.team[0].energy = 100;
  tickDuel(s, 50, { b: { special: 0 } });
  s.b.team[0].btc = 3;
  s.b.team[1].btc = 0; // schon pleite: wird übersprungen
  const ev = tickDuel(s, 300, { a: { taps: 1 } });
  assert.deepEqual(find(ev, 'faint'), { type: 'faint', side: 'b', fighter: 0 });
  assert.deepEqual(find(ev, 'cancel'), { type: 'cancel', side: 'b', fighter: 0, index: 0 });
  assert.deepEqual(find(ev, 'switch', 'b'), { type: 'switch', side: 'b', to: 2 });
  assert.equal(s.b.active, 2);
  assert.equal(s.over, false);
});

test('Ende per K.o.', () => {
  const s = D(['christian'], ['viktor']);
  s.b.team[0].btc = 3;
  const ev = tickDuel(s, 50, { a: { taps: 1 } });
  assert.deepEqual(ev.at(-1), { type: 'end', winner: 'a', reason: 'ko' });
  assert.deepEqual(duelOutcome(s, 'a'), { won: true, draw: false, reason: 'ko', timeMs: 50 });
  assert.deepEqual(duelOutcome(s, 'b'), { won: false, draw: false, reason: 'ko', timeMs: 50 });
  assert.deepEqual(tickDuel(s, 50, { a: { taps: 1 } }), []);
});

test('Ende: beide im selben Schritt raus = Unentschieden', () => {
  const s = D(['christian'], ['viktor']);
  s.a.team[0].btc = 3; s.b.team[0].btc = 3;
  const ev = tickDuel(s, 50, { a: { taps: 1 }, b: { taps: 1 } });
  assert.deepEqual(ev.at(-1), { type: 'end', winner: 'draw', reason: 'ko' });
  assert.equal(duelOutcome(s, 'b').draw, true);
});

test('Ende per Zeit: höherer Rest-BTC-Anteil gewinnt, gleich = Unentschieden', () => {
  let s = D(['christian'], ['viktor', 'micha'], { duration: 1000 });
  tickDuel(s, 50, { b: { taps: 1 } });
  let ev = run(s, 900);
  assert.equal(duelOutcome(s, 'a'), null);
  ev = run(s, 50);
  assert.deepEqual(ev.at(-1), { type: 'end', winner: 'b', reason: 'timeout' });
  s = D(['christian'], ['viktor'], { duration: 1000 });
  ev = run(s, 1000);
  assert.deepEqual(ev.at(-1), { type: 'end', winner: 'draw', reason: 'timeout' });
  assert.equal(s.time, 1000);
});

test('Aufgeben: die andere Seite gewinnt, auch mit dt 0', () => {
  const s = D(['christian'], ['viktor']);
  run(s, 500);
  const ev = tickDuel(s, 0, { b: { quit: true } });
  assert.deepEqual(ev, [{ type: 'end', winner: 'a', reason: 'quit' }]);
  assert.deepEqual(duelOutcome(s, 'a'), { won: true, draw: false, reason: 'quit', timeMs: 500 });
  assert.deepEqual(endDuel(s, null, 'lost'), []);
});

test('endDuel: Verbindung weg ohne Sieger', () => {
  const s = D(['christian'], ['viktor']);
  assert.deepEqual(endDuel(s, null, 'lost'), [{ type: 'end', winner: null, reason: 'lost' }]);
  assert.deepEqual(duelOutcome(s, 'a'), { won: false, draw: false, reason: 'lost', timeMs: 0 });
});

// feste Eingabefolge über ~20 s mit allem: Tipps, Spezials, Ausweichen, Wechsel
function script(s, steps, from = 0) {
  const ev = [];
  for (let i = from; i < from + steps; i++) {
    const a = {}, b = {};
    if (i % 3 === 0) a.taps = 1;
    if (i % 4 === 1) b.taps = 1;
    if (i % 37 === 0) a.special = i % 2;
    if (i % 41 === 5) b.special = (i >> 1) % 2;
    if (i % 23 === 7) b.dodge = true;
    if (i % 150 === 90) a.switchTo = (i / 150 | 0) % 3;
    if (i % 170 === 30) b.switchTo = 1;
    ev.push(...tickDuel(s, DUEL.STEP, { a, b }));
  }
  return ev;
}
const TEAMS = () => D(['christian', 'viktor', 'ramona'], ['hildegard', 'micha', 'viktor']);

test('Deterministisch: dieselbe Eingabefolge ergibt dieselben Events und denselben Endzustand', () => {
  const s1 = TEAMS(), s2 = TEAMS();
  const e1 = script(s1, 400), e2 = script(s2, 400);
  assert.ok(e1.length > 100);
  assert.deepEqual(e1, e2);
  assert.deepEqual(duelSnapshot(s1), duelSnapshot(s2));
  assert.deepEqual(JSON.parse(JSON.stringify(e1)), e1); // JSON-fest
  for (const t of ['fast', 'charge', 'special', 'dodge', 'switch']) assert.ok(has(e1, t), t);
});

test('Schnappschuss: JSON-fest unter 4 KB, fromDuelSnapshot tickt genauso weiter', () => {
  const s = TEAMS();
  script(s, 250);
  const json = JSON.stringify(duelSnapshot(s));
  assert.ok(json.length < 4096, `${json.length} Zeichen`);
  assert.ok(!json.includes('attacks'));
  const m = fromDuelSnapshot(JSON.parse(json));
  assert.equal(m.a.team[0].attacks, RUETHER_BY_ID.christian.attacks);
  const e1 = script(s, 300, 250), e2 = script(m, 300, 250);
  assert.deepEqual(e2, e1);
  assert.deepEqual(duelSnapshot(m), duelSnapshot(s));
});

test('fromDuelSnapshot: kaputte Daten → null', () => {
  const ok = duelSnapshot(TEAMS());
  assert.ok(fromDuelSnapshot(ok));
  const bad = [null, 7, {}, { ...ok, time: 'x' }, { ...ok, a: { ...ok.a, active: 5 } }, { ...ok, b: { ...ok.b, team: [] } },
    { ...ok, a: { ...ok.a, team: [{ ...ok.a.team[0], id: 'hacker' }] } }, { ...ok, a: { ...ok.a, charge: { fighter: 0, index: 9, firesAt: 1 } } },
    { ...ok, b: { ...ok.b, team: [...ok.b.team, ok.b.team[0]] } }];
  for (const b of bad) assert.equal(fromDuelSnapshot(b), null, JSON.stringify(b)?.slice(0, 60));
});

test('duelReward: Sieg, Niederlage, Unentschieden, Aufgeben mit MIN_REWARD_MS, Abbruch', () => {
  const R = (won, draw, reason, timeMs = 60_000) => duelReward({ won, draw, reason, timeMs });
  assert.deepEqual(R(true, false, 'ko'), { sats: 300, xp: 150 });
  assert.deepEqual(R(true, false, 'timeout'), { sats: 300, xp: 150 });
  assert.deepEqual(R(false, false, 'ko'), { sats: 100, xp: 50 });
  assert.deepEqual(R(false, true, 'timeout'), { sats: 150, xp: 75 });
  assert.deepEqual(R(false, true, 'ko'), { sats: 150, xp: 75 });
  assert.deepEqual(R(false, false, 'quit'), { sats: 0, xp: 0 });
  assert.deepEqual(R(true, false, 'quit', DUEL.MIN_REWARD_MS - 1), { sats: 0, xp: 0 });
  assert.deepEqual(R(true, false, 'quit', DUEL.MIN_REWARD_MS), { sats: 300, xp: 150 });
  assert.deepEqual(R(false, false, 'lost'), { sats: 0, xp: 0 });
  assert.deepEqual(R(true, false, 'lost'), { sats: 0, xp: 0 });
  const r = R(true, false, 'ko'); r.sats = 1;
  assert.equal(DUEL.REWARD.win.sats, 300); // Kopie, keine Referenz
});

test('Betäubung: keine Dauerschleife, neue Betäubung erst STUN_SAFE nach dem Ende der alten', () => {
  const s = D(['viktor'], ['christian']);
  const stunNow = () => { s.a.team[0].energy = 100; tickDuel(s, 50, { a: { special: 1 } }); return run(s, DUEL.WARN); };
  const t0 = s.time;
  assert.ok(has(stunNow(), 'stun', 'b'));
  const until = s.b.team[0].status.stunUntil;
  assert.ok(until > s.time);
  assert.ok(!has(stunNow(), 'stun'), 'noch betäubt: keine Verlängerung');
  assert.equal(s.b.team[0].status.stunUntil, until);
  run(s, until - s.time + 100); // frei, aber in der Schonfrist
  assert.ok(!has(stunNow(), 'stun'), 'Schonfrist');
  assert.ok(s.b.team[0].status.stunUntil - t0 <= 3000 + DUEL.WARN + 50);
  run(s, until + DUEL.STUN_SAFE - s.time);
  assert.ok(has(stunNow(), 'stun', 'b'), 'nach der Schonfrist wieder');
});

test('Funkzeit-Gutschrift: Ladung gegen den Gast kündigt sich lag.b länger an, Ausweichen zählt bis dahin; bleibt im Schnappschuss', () => {
  const s = D(['christian'], ['viktor']);
  assert.deepEqual(s.lag, { a: 0, b: 0 });
  s.lag.b = 300;
  s.a.team[0].energy = 100;
  const ev = tickDuel(s, 50, { a: { special: 0 } });
  assert.deepEqual(find(ev, 'charge'), { type: 'charge', side: 'a', fighter: 0, index: 0, ms: DUEL.WARN + 300 });
  assert.equal(s.a.charge.ms, DUEL.WARN + 300);
  assert.ok(!has(run(s, DUEL.WARN + 200), 'special'), 'nach WARN noch nicht gefeuert');
  const m = fromDuelSnapshot(JSON.parse(JSON.stringify(duelSnapshot(s))));
  assert.deepEqual(m.lag, { a: 0, b: 300 });
  assert.ok(has(tickDuel(s, 50, { b: { dodge: true } }), 'dodge', 'b'), 'Ausweichen bei WARN + 250 ms zählt');
  assert.equal(find(run(s, 100), 'special').dodged, true);
  // Gegenrichtung (Gast lädt) ohne Gutschrift; Gutschrift höchstens LAG_MAX
  s.lag = { a: 0, b: 99_999 };
  s.b.team[0].energy = 100;
  assert.equal(find(tickDuel(s, 50, { b: { special: 0 } }), 'charge').ms, DUEL.WARN);
  s.a.team[0].energy = 100;
  run(s, DUEL.WARN + 100);
  assert.equal(find(tickDuel(s, 50, { a: { special: 0 } }), 'charge').ms, DUEL.WARN + DUEL.LAG_MAX);
});
