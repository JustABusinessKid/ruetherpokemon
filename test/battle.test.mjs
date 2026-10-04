import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFighter, makeBoss, createBattle, tick } from '../js/battle.js';
import { RUETHER_BY_ID, BOSSES } from '../js/data.js';

const F = (id, extra = 0) => { const f = makeFighter(RUETHER_BY_ID[id]); f.btc += extra; f.maxBtc += extra; return f; };
const B = (team, bossId, opts = {}) => createBattle({ team, enemy: makeBoss(BOSSES[bossId]), rng: () => 0.5, ...opts });
// tickt in 50-ms-Schritten; input nur im ersten Schritt
function run(s, ms, input = {}, dt = 50) {
  const ev = [];
  for (let t = 0; t < ms; t += dt) ev.push(...tick(s, dt, t === 0 ? input : {}));
  return ev;
}
const has = (ev, type) => ev.some(e => e.type === type);
const find = (ev, type) => ev.find(e => e.type === type);

test('Tipp: 3 Schaden, +10 Energie, Cooldown 250 ms', () => {
  const s = B([F('christian')], 'ps3');
  let ev = tick(s, 16, { taps: 1 });
  assert.equal(s.enemy.btc, 257);
  assert.equal(s.team[0].energy, 10);
  assert.ok(has(ev, 'fast'));
  ev = tick(s, 16, { taps: 1 }); // Cooldown läuft noch
  assert.equal(s.enemy.btc, 257);
  assert.ok(!has(ev, 'fast'));
  ev = tick(s, 250, { taps: 1 }); // Cooldown abgelaufen
  assert.equal(s.enemy.btc, 254);
  assert.equal(s.team[0].energy, 20);
});

test('Spezial: ohne Energie verweigert, mit 100 Energie 40 Schaden', () => {
  const s = B([F('christian')], 'ps3');
  let ev = tick(s, 16, { special: 0 });
  assert.ok(has(ev, 'specialDenied'));
  assert.equal(s.enemy.btc, 260);
  s.team[0].energy = 100;
  ev = tick(s, 16, { special: 0 });
  const sp = find(ev, 'special');
  assert.equal(sp.attack.name, 'Plus 70 Prozent');
  assert.equal(sp.damage, 40);
  assert.equal(s.enemy.btc, 220);
  assert.equal(s.team[0].energy, 0);
});

test('Warnung 600 ms vor dem schnellen Angriff, Ausweichen im Fenster = 25 % Schaden', () => {
  const s = B([F('christian')], 'ps3');
  let ev = run(s, 1850);
  assert.ok(!has(ev, 'warn'));
  ev = run(s, 50); // t = 1900
  const w = find(ev, 'warn');
  assert.equal(w.kind, 'fast');
  assert.equal(w.ms, 600);
  ev = tick(s, 50, { dodge: true });
  assert.ok(has(ev, 'dodge'));
  ev = run(s, 550); // t = 2500
  const a = find(ev, 'enemyAttack');
  assert.equal(a.dodged, true);
  assert.equal(a.damage, 3); // floor(12 × 0,25)
  assert.equal(s.team[0].btc, 97);
});

test('Ausweichen außerhalb der Warnung tut nichts, voller Schaden 12', () => {
  const s = B([F('christian')], 'ps3');
  let ev = tick(s, 50, { dodge: true });
  assert.ok(!has(ev, 'dodge'));
  ev = run(s, 2450); // t = 2500
  const a = find(ev, 'enemyAttack');
  assert.equal(a.dodged, false);
  assert.equal(a.damage, 12);
  assert.equal(s.team[0].btc, 88);
});

test('Gift auf dem Boss: 8 Ticks je 5, dann vorbei', () => {
  const s = B([F('viktor')], 'ps3');
  s.team[0].energy = 100;
  tick(s, 50, { special: 0 }); // Giftgas: 10 Schaden, Gift 5/s bis 8050
  assert.equal(s.enemy.btc, 250);
  const enemyPoison = ev => ev.filter(e => e.type === 'poison' && e.target === 'enemy').length;
  let ev = run(s, 1000);
  assert.equal(enemyPoison(ev), 1);
  assert.equal(s.enemy.btc, 245);
  ev = run(s, 7000);
  assert.equal(enemyPoison(ev), 7);
  assert.equal(s.enemy.btc, 210);
  assert.equal(s.enemy.status.poison, null);
  ev = run(s, 1000);
  assert.equal(enemyPoison(ev), 0);
  assert.equal(s.enemy.btc, 210);
});

test('Betäubung: Boss greift 3 s nicht an, Warnung abgebrochen, Timer verschoben', () => {
  const s = B([F('viktor')], 'ps3');
  s.team[0].energy = 50;
  run(s, 1900); // Warnung läuft
  assert.ok(s.enemy.warning);
  let ev = tick(s, 50, { special: 1 }); // Argumentationslogik: 10 Schaden, Boss betäubt bis 4950
  assert.ok(has(ev, 'stun'));
  assert.equal(s.enemy.warning, null);
  assert.equal(s.enemy.btc, 250);
  ev = run(s, 3000); // bis 4950
  assert.ok(!has(ev, 'enemyAttack'));
  assert.equal(s.team[0].btc, 90);
  ev = run(s, 1100); // Angriff bei 5550
  assert.ok(has(ev, 'enemyAttack'));
});

test('Betäubter Spieler: Tipps ignoriert', () => {
  const s = B([F('christian')], 'ps3');
  s.team[0].status.stunUntil = 1000;
  let ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'stunnedTap'));
  assert.equal(s.enemy.btc, 260);
  run(s, 1000);
  ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'fast'));
});

test('Familientreffen: 20 Schläge je 4 in 10 s, nur einmal', () => {
  const s = B([F('hildegard', 100)], 'ps3');
  s.team[0].energy = 100;
  let ev = tick(s, 50, { special: 0 });
  assert.ok(has(ev, 'summoned'));
  assert.equal(s.summons.length, 2);
  ev = run(s, 10000);
  assert.equal(ev.filter(e => e.type === 'summon').length, 20);
  assert.equal(s.enemy.btc, 180);
  assert.equal(s.summons.length, 0);
  s.team[0].energy = 100;
  ev = tick(s, 50, { special: 0 });
  assert.ok(has(ev, 'specialDenied'));
});

test('Schwächung: 12 → 9', () => {
  const s = B([F('christian')], 'ps3');
  s.team[0].energy = 50;
  run(s, 1900);
  tick(s, 50, { special: 1 }); // Handschlag: 10 Schaden, Boss 8 s geschwächt
  const ev = run(s, 550);
  assert.equal(find(ev, 'enemyAttack').damage, 9);
  assert.equal(s.enemy.btc, 250);
});

test('Drain heilt um den Schaden, Heilung nicht über maxBtc', () => {
  const s = B([F('micha')], 'ps3');
  s.team[0].energy = 100;
  s.team[0].btc = 50;
  let ev = tick(s, 50, { special: 0 });
  assert.equal(s.enemy.btc, 230);
  assert.equal(s.team[0].btc, 80);
  assert.equal(find(ev, 'heal').amount, 30);
  const r = B([F('ramona')], 'ps3');
  r.team[0].energy = 50;
  ev = tick(r, 50, { special: 1 });
  assert.equal(find(ev, 'heal').amount, 0);
  assert.equal(r.team[0].btc, 90);
});

test('Pleite → Wechsel, alle pleite → verloren', () => {
  const s = B([F('christian'), F('viktor')], 'ps3');
  s.team[0].btc = 5;
  let ev = run(s, 2500);
  assert.ok(has(ev, 'faint'));
  assert.equal(find(ev, 'switch').to, 1);
  assert.equal(s.active, 1);
  assert.equal(s.over, false);
  s.team[1].btc = 5;
  ev = run(s, 2500);
  assert.equal(s.over, true);
  assert.equal(s.won, false);
  assert.equal(s.reason, 'wiped');
  assert.equal(find(ev, 'lose').reason, 'wiped');
});

test('Zeit abgelaufen → verloren', () => {
  const s = B([F('christian')], 'ps3', { duration: 1000 });
  const ev = run(s, 1000);
  assert.equal(s.over, true);
  assert.equal(s.reason, 'timeout');
  assert.ok(has(ev, 'lose'));
});

test('Boss pleite → Sieg, danach keine Events mehr', () => {
  const s = B([F('christian')], 'ps3');
  s.enemy.btc = 3;
  let ev = tick(s, 50, { taps: 1 });
  assert.ok(has(ev, 'win'));
  assert.equal(s.won, true);
  assert.equal(s.enemy.btc, 0);
  ev = tick(s, 50, { taps: 1 });
  assert.deepEqual(ev, []);
});

test('Lade-Attacken wechseln: Blockchain-Kette, dann Mining heilt 40', () => {
  const s = B([F('hildegard', 200)], 'schanze');
  s.enemy.btc = 100;
  let ev = run(s, 10000);
  const c1 = ev.filter(e => e.type === 'enemyAttack' && e.kind === 'charged');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].attack.name, 'Blockchain-Kette');
  ev = run(s, 10000);
  const c2 = ev.filter(e => e.type === 'enemyAttack' && e.kind === 'charged');
  assert.equal(c2.length, 1);
  assert.equal(c2[0].attack.name, 'Mining');
  assert.equal(s.enemy.btc, 140);
});

test('Wechsel per Eingabe', () => {
  const s = B([F('christian'), F('viktor')], 'ps3');
  const ev = tick(s, 50, { switchTo: 1 });
  assert.equal(find(ev, 'switch').to, 1);
  assert.equal(s.active, 1);
  assert.ok(!has(tick(s, 50, { switchTo: 1 }), 'switch'));
});

test('v3: Legendär Level 1 Christian tippt 4 Schaden, Level 20 Legendär 8', () => {
  const s = B([makeFighter(RUETHER_BY_ID.christian, { uid: 'x', rarity: 'legendaer', level: 1 })], 'ps3');
  tick(s, 16, { taps: 1 });
  assert.equal(s.enemy.btc, 256); // floor(3 × 1,6) = 4
  assert.equal(s.team[0].btc, 160);
  const t = B([makeFighter(RUETHER_BY_ID.christian, { uid: 'y', rarity: 'legendaer', level: 20 })], 'ps3');
  tick(t, 16, { taps: 1 });
  assert.equal(t.enemy.btc, 252); // floor(3 × 2,816) = 8
  assert.equal(t.team[0].maxBtc, 282);
});

test('v3: Boss Arena-Level 3 hat 390 BTC und Blu-ray 18', () => {
  const b = makeBoss(BOSSES.ps3, 3);
  assert.equal(b.btc, 390);
  assert.equal(b.fast.damage, 18);
  assert.equal(b.charged[0].damage, 37); // floor(25 × 1,5)
  assert.equal(makeBoss(BOSSES.ps3).btc, 260);
});

test('v3: Wutphase unter 50 %: Event rage, nächster schneller Angriff nach 1800 ms', () => {
  const s = B([F('christian', 500)], 'ps3');
  s.enemy.btc = 130;
  let ev = tick(s, 50);
  assert.ok(has(ev, 'rage'));
  assert.equal(s.enemy.rage, true);
  ev = run(s, 1750); // bis 1800: Warnung ab 1250, Angriff bei 1850
  assert.ok(!has(ev, 'enemyAttack'));
  ev = run(s, 50);
  assert.ok(has(ev, 'enemyAttack'));
  ev = run(s, 1800); // nächster bei 3650
  assert.equal(ev.filter(e => e.type === 'enemyAttack').length, 1);
  assert.ok(!has(tick(s, 50), 'rage')); // nur einmal
});
