import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFighter, makeBoss, createBattle, tick } from '../js/battle.js';
import { makeWild, wildBossDef } from '../js/wild.js';
import { bossHitMs, swipeDir, SWIPE_PX, NOW_LEAD } from '../js/battle-ui.js';
import { CONST, BOSSES, RUETHERS, RUETHER_BY_ID } from '../js/data.js';
import { seededRng } from '../js/quests.js';

// v11 Abwehr: Fenster = ganze Warnung + Puffer davor, Perfekt in den letzten 300 ms, Sperre nach Fehlversuch, Abstand zwischen Angriffen
const F = id => makeFighter(RUETHER_BY_ID[id]);
const B = (bossId, team = [F('christian')]) => createBattle({ team, enemy: makeBoss(BOSSES[bossId]), rng: () => 0.5 });
function run(s, ms, input = {}, dt = 50) {
  const ev = [];
  for (let t = 0; t < ms; t += dt) ev.push(...tick(s, dt, t === 0 ? input : {}));
  return ev;
}
const until = (s, t) => (t > s.time ? run(s, t - s.time) : []); // Spielzeit bis t (50-ms-Schritte)
const find = (ev, type) => ev.find(e => e.type === type);
const quiet = s => { s.enemy.nextFastAt = s.enemy.nextChargedAt = Infinity; return s; }; // Boss greift nicht an
// PS3: schneller Angriff alle 2500 ms, Warnung 800 ms → Warnung ab 1700, Einschlag 2500, 12 Schaden

test('Fenster: Ausweichen zählt während der ganzen Warnung, auch im letzten Schritt', () => {
  for (const at of [1750, 2150, 2450, 2500]) {
    const s = B('ps3');
    const w = find(until(s, 1700), 'warn');
    assert.deepEqual([w.kind, w.ms, w.dodgeable], ['fast', 800, true]);
    until(s, at - 50);
    const ev = tick(s, 50, { dodge: true });
    assert.ok(find(ev, 'dodge'), `Wisch bei ${at}`);
    const a = find([...ev, ...until(s, 2500)], 'enemyAttack');
    assert.equal(a.dodged, true, `Wisch bei ${at}`);
  }
});

test('Perfekt: in den letzten 300 ms kein Schaden und +15 Mining, davor 25 % Schaden', () => {
  const normal = B('ps3'), perfect = B('ps3');
  until(normal, 2100); until(perfect, 2150);
  let ev = tick(normal, 50, { dodge: true }); // t = 2150: 350 ms vor dem Einschlag
  assert.equal(find(ev, 'dodge').perfect, false);
  ev = tick(perfect, 50, { dodge: true }); // t = 2200: 300 ms davor
  assert.equal(find(ev, 'dodge').perfect, true);
  assert.equal(perfect.team[0].energy, CONST.PERFECT_ENERGY);
  const a = find(until(normal, 2500), 'enemyAttack'), p = find(until(perfect, 2500), 'enemyAttack');
  assert.deepEqual([a.dodged, a.perfect, a.damage], [true, false, 3]); // floor(12 × 0,25)
  assert.deepEqual([p.dodged, p.perfect, p.damage], [true, true, 0]);
  assert.equal(perfect.team[0].btc, 100);
  // Perfekt verhindert auch Gift (Yellow Light of Death) – wie jedes Ausweichen
  const y = B('ps3');
  quiet(y).enemy.nextChargedAt = 1200;
  until(y, 1000); // Warnung 50 → 1250
  const yev = [...tick(y, 50, { dodge: true }), ...until(y, 1300)];
  assert.ok(find(yev, 'dodge').perfect);
  assert.equal(find(yev, 'enemyAttack').damage, 0);
  assert.ok(!find(yev, 'poisoned'));
  assert.equal(y.team[0].status.poison, null);
});

test('Puffer: Wisch bis 250 ms vor der Warnung zählt beim Start (normal), 300 ms davor ist zu früh', () => {
  const s = B('ps3');
  until(s, 1400);
  let ev = tick(s, 50, { dodge: true }); // t = 1450: 250 ms vor der Warnung
  assert.ok(!find(ev, 'dodge'));
  ev = until(s, 1700);
  const d = find(ev, 'dodge');
  assert.ok(d && find(ev, 'warn'), 'gilt mit dem Start der Warnung');
  assert.equal(d.perfect, false);
  assert.ok(!find(ev, 'dodgeMiss'));
  assert.equal(find(until(s, 2500), 'enemyAttack').damage, 3);

  const t = B('ps3');
  until(t, 1350);
  tick(t, 50, { dodge: true }); // t = 1400: 300 ms vor der Warnung
  ev = until(t, 1700);
  assert.ok(!find(ev, 'dodge'));
  // einzelner Fehlversuch: „Zu früh!", aber keine Sperre in der laufenden Warnung, der zweite Versuch zählt
  assert.deepEqual(find(ev, 'dodgeMiss'), { type: 'dodgeMiss', reason: 'early', lockMs: 0 });
  assert.equal(t.dodgeLockUntil, 1700);
  until(t, 1950);
  assert.ok(find(tick(t, 50, { dodge: true }), 'dodge'));
  assert.equal(find(until(t, 2500), 'enemyAttack').dodged, true);
});

test('Sperre: nach einem Fehlversuch zählt ein Wisch erst nach 600 ms, ein Wisch in der Sperre verlängert sie', () => {
  const s = B('ps3');
  until(s, 950);
  tick(s, 50, { dodge: true }); // t = 1000, zu früh (Sperre bis 1600)
  until(s, 1350);
  tick(s, 50, { dodge: true }); // t = 1400: in der Sperre → bis 2000, weiter gesperrt auch in der Warnung ab 1700
  assert.equal(s.dodgeLockUntil, 2000);
  until(s, 1750);
  let ev = tick(s, 50, { dodge: true }); // t = 1800: in der Sperre, Warnung läuft → nichts, Sperre bis 2400
  assert.ok(!find(ev, 'dodge'));
  assert.equal(s.dodgeLockUntil, 2400);
  until(s, 2350);
  ev = tick(s, 50, { dodge: true }); // t = 2400: frei → Perfekt
  assert.ok(find(ev, 'dodge').perfect);
  assert.equal(find(until(s, 2500), 'enemyAttack').damage, 0);
  assert.equal(s.dodgeMisses, 0, 'Erfolg setzt die Folge zurück');
});

test('Zu spät: Wisch kurz nach dem Einschlag ist ein Fehlversuch „late", später wieder „early"', () => {
  const s = B('ps3');
  until(s, 2500); // Einschlag
  tick(s, 50, { dodge: true }); // 50 ms danach
  let ev = until(s, 2900);
  assert.equal(find(ev, 'dodgeMiss').reason, 'late');
  until(s, 3400);
  tick(s, 50, { dodge: true }); // 950 ms nach dem Einschlag, Warnung erst ab 4200
  ev = until(s, 3800);
  assert.equal(find(ev, 'dodgeMiss').reason, 'early');
});

// Nach einem Einschlag kommt die nächste Warnung frühestens ATTACK_GAP (700 ms) später; Lade-Attacke so legen, dass sie genau dann beginnt
const nextCharged = s => { s.enemy.nextChargedAt = 2500 + CONST.ATTACK_GAP + BOSSES.ps3.charged[0].warn; return s; }; // Warnung ab 3200

test('Einzelner Fehlversuch sperrt nicht die nächste Warnung, Weiterwischen in der Sperre schon', () => {
  // [Wisch ms nach dem Einschlag (voller Treffer bei 2500), Reaktion ms nach dem Warnbeginn 3200]: alte Sperre reichte bis 3450/3500
  for (const [late, react] of [[350, 200], [400, 250], [200, 100]]) {
    const s = nextCharged(B('ps3'));
    let ev = [...until(s, 2500 + late - 50), ...tick(s, 50, { dodge: true }), ...until(s, 3200 + react - 50)];
    assert.equal(find(ev, 'enemyAttack').dodged, false);
    assert.equal(find(ev, 'dodgeMiss').reason, 'late');
    assert.ok(find(ev, 'warn') && s.dodgeLockUntil <= 3200 + 50, `Sperre endet mit der Warnung (${late}): ${s.dodgeLockUntil}`);
    ev = [...tick(s, 50, { dodge: true }), ...until(s, 4400)];
    assert.ok(find(ev, 'dodge'), `Reaktion ${react} ms nach der Warnung zählt`);
    assert.equal(find(ev, 'enemyAttack').dodged, true);
  }
  // dieselbe Lage, aber in der Sperre weitergewischt: bleibt gesperrt, voller Treffer
  const s = nextCharged(B('ps3'));
  until(s, 2650); tick(s, 50, { dodge: true }); // t = 2700: zu spät, Sperre bis 3300
  until(s, 3050); tick(s, 50, { dodge: true }); // t = 3100: in der Sperre → bis 3700
  until(s, 3350);
  const ev = [...tick(s, 50, { dodge: true }), ...until(s, 4400)];
  assert.ok(!find(ev, 'dodge'));
  assert.equal(find(ev, 'enemyAttack').dodged, false);
});

test('Doppelwisch nach gelungenem Ausweichen: der erste verpufft still, die nächste Warnung zählt', () => {
  const s = nextCharged(B('ps3'));
  until(s, 1950);
  tick(s, 50, { dodge: true }); // t = 2000: ausgewichen
  assert.equal(find(until(s, 2500), 'enemyAttack').dodged, true);
  until(s, 2850);
  let ev = [...tick(s, 50, { dodge: true }), ...until(s, 3200)]; // t = 2900, 400 ms nach dem Einschlag
  assert.ok(!find(ev, 'dodgeMiss'), 'kein „Zu spät!"');
  assert.equal(s.dodgeLockUntil, 0);
  assert.equal(s.dodgeMisses, 0);
  ev = [...tick(s, 50, { dodge: true }), ...until(s, 4400)]; // t = 3250, Lade-Warnung seit 3200
  assert.ok(find(ev, 'dodge'));
  assert.equal(find(ev, 'enemyAttack').dodged, true);
  // nur der erste: ein zweiter Wisch nach demselben Einschlag ist wieder „Zu spät!"
  const t = B('ps3');
  until(t, 1950); tick(t, 50, { dodge: true });
  until(t, 2550); tick(t, 50, { dodge: true }); // 100 ms nach dem Einschlag, verpufft
  until(t, 2900); tick(t, 50, { dodge: true }); // 450 ms danach
  assert.equal(find(until(t, 3300), 'dodgeMiss').reason, 'late');
});

test('Sperre wächst bei Fehlversuchen in Folge (600/1200/1800 ms), Ruhe setzt sie zurück', () => {
  const s = quiet(B('ps3'));
  const miss = at => { until(s, at - 50); tick(s, 50, { dodge: true }); return find(until(s, at + 300), 'dodgeMiss'); };
  assert.equal(miss(1000).lockMs, 300); // Sperre bis 1600
  assert.equal(s.dodgeLockUntil, 1600);
  assert.equal(miss(1700).lockMs, 900); // zweiter in Folge: 1200 ab dem Wisch → 2900
  assert.equal(miss(3000).lockMs, 1500); // dritter: 1800 → 4800
  assert.equal(miss(4900).lockMs, 1500); // höchstens 3×
  assert.equal(s.dodgeMisses, 4);
  // Ruhe: 2 × 600 ms nach dem Ende der Sperre fängt die Folge neu an
  miss(6700 + 2 * CONST.DODGE_LOCK);
  assert.equal(s.dodgeMisses, 1);
  assert.equal(s.dodgeLockUntil, s.time - 300 + CONST.DODGE_LOCK);
});

test('Nicht abwehrbar: Heilung ohne Ausweichen, Wisch = Fehlversuch „immune", die Heilung wirkt', () => {
  const s = quiet(B('schanze'));
  s.enemy.btc = 100; s.enemy.rage = true; s.enemy.chargedIndex = 1; s.enemy.nextChargedAt = 2000; // Mining: +40, Warnung ab 800
  let ev = until(s, 800);
  assert.deepEqual([find(ev, 'warn').attack.name, find(ev, 'warn').dodgeable], ['Mining', false]);
  assert.equal(s.enemy.warning.dodgeable, false);
  until(s, 950);
  ev = [...tick(s, 50, { dodge: true }), ...until(s, 2000)];
  assert.ok(!find(ev, 'dodge'));
  assert.equal(find(ev, 'dodgeMiss').reason, 'immune');
  assert.equal(find(ev, 'enemyAttack').dodged, false);
  assert.equal(s.enemy.btc, 140);
  // Wisch knapp vor bzw. kurz nach einer nicht abwehrbaren Attacke: auch „immune", nicht „Zu spät!"
  for (const at of [1950, 2100]) {
    const h = quiet(B('schanze'));
    h.enemy.chargedIndex = 1; h.enemy.nextChargedAt = 2000;
    until(h, at - 50);
    tick(h, 50, { dodge: true });
    assert.equal(find(until(h, at + 400), 'dodgeMiss').reason, 'immune', `Wisch bei ${at}`);
  }
  // Firmware-Update (kein Schaden, aber Betäubung) bleibt abwehrbar
  const p = quiet(B('ps3'));
  p.enemy.chargedIndex = 1; p.enemy.nextChargedAt = 1200;
  assert.equal(find(run(p, 50), 'warn').dodgeable, true);
});

// Engine-Schleife mit 60 Hz wie in battle-ui.js; Team unsterblich, Boss mit sehr viel BTC (jeder zweite gleich in der Wut)
const DT = 1000 / 60;
const ENEMIES = [...Object.values(BOSSES).map(b => [b.id, () => makeBoss(b, 3)]), ...RUETHERS.map(r => [`wild-${r.id}`, () => makeWild(r, { rarity: 'episch', level: 12 })])];
function fight(mkEnemy, seed, { plan, spam } = {}) {
  const rng = seededRng(seed);
  const team = ['christian', 'micha', 'viktor'].map(id => { const f = makeFighter(RUETHER_BY_ID[id], { uid: id, rarity: 'legendaer', level: 20 }); f.btc = f.maxBtc = 1e9; return f; });
  const s = createBattle({ team, enemy: mkEnemy(), rng, duration: 90_000 });
  s.enemy.btc = s.enemy.maxBtc = 1e7;
  if (seed % 2) s.enemy.btc = s.enemy.maxBtc / 2;
  const res = { warns: [], hits: [], dodged: 0, total: 0 }, swipes = [];
  let nextTap = 0, nextSpam = spam ? rng() * spam : Infinity;
  while (!s.over) {
    const inp = {}, me = s.team[s.active];
    if (s.time >= nextTap) { inp.taps = 1; nextTap = s.time + 1000 / 3.5; }
    if (me.energy >= CONST.MAX_ENERGY) inp.special = 0; // Spezial bei vollem Mining (Betäubung, Gift, Schwächung inklusive)
    if (swipes.length && s.time + DT >= swipes[0]) { inp.dodge = true; swipes.shift(); }
    if (s.time + DT >= nextSpam) { inp.dodge = true; nextSpam += spam; }
    for (const e of tick(s, DT, inp)) {
      if (e.type === 'warn') {
        res.warns.push({ at: s.time, ms: e.ms, warn: e.attack.warn, after: s.lastAttackAt });
        if (e.dodgeable && plan) swipes.push(plan(s, e, rng));
      }
      if (e.type === 'enemyAttack') {
        res.hits.push(s.time);
        if (e.attack.damage > 0 || e.attack.poison || e.attack.stun) { res.total++; res.dodged += e.dodged ? 1 : 0; }
      }
    }
  }
  return res;
}
function rate(opts) {
  let dodged = 0, total = 0;
  for (const [, mk] of ENEMIES) for (let i = 0; i < 4; i++) { const r = fight(mk, 101 + i, opts); dodged += r.dodged; total += r.total; }
  return dodged / total;
}
// Mensch: sieht die Warnung im nächsten Frame, reagiert nach R und überschreitet die Wisch-Schwelle 40–90 ms später
const human = (r0, r1) => (s, e, rng) => s.time + DT + r0 + rng() * (r1 - r0) + 40 + rng() * 50;

test('Simulation: menschliches Timing weicht zuverlässig aus, Dauerwischen nicht', () => {
  const good = rate({ plan: human(250, 450) }), slow = rate({ plan: human(350, 550) }), spam = rate({ spam: 200 });
  assert.ok(good >= 0.8, `Reaktion 250–450 ms: ${good}`);
  assert.ok(slow >= 0.8, `Reaktion 350–550 ms: ${slow}`);
  assert.ok(spam <= 0.4, `Dauerwischen alle 200 ms: ${spam}`);
  // Wischen im Takt trifft nur zufällig (wie vor v11.1: 0 / 0,32 / 0,47); die Schonung einzelner Fehlversuche ändert daran nichts.
  // v12: Moshe (fast every 2300 wie Hitler, aber ohne Heil- oder Beschwörungs-Attacke) liegt bei 1300 ms allein bei 0,91 und hebt
  // den Schnitt auf 0,51; mit every 2400 wären es 0,46. Die Daten stehen in Spec v12 §2 fest, darum hier 0,55 statt 0,5.
  for (const p of [700, 1000, 1300]) { const r = rate({ spam: p }); assert.ok(r <= 0.55, `Wischen im Takt alle ${p} ms: ${r}`); }
});

test('Abstand: jede Warnung frühestens ATTACK_GAP nach dem letzten Einschlag und immer in voller Länge', () => {
  for (const [id, mk] of ENEMIES) {
    const r = fight(mk, 7);
    assert.ok(r.warns.length > 20, id);
    for (const w of r.warns) {
      assert.ok(w.at - w.after >= CONST.ATTACK_GAP, `${id}: Warnung ${Math.round(w.at - w.after)} ms nach dem Einschlag`);
      assert.ok(Math.abs(w.ms - w.warn) <= DT, `${id}: Warnung ${w.ms} statt ${w.warn} ms`);
    }
  }
});

test('Tachionen: Vor-Echo kommt mit der Warnung, Wisch darauf zählt, auch 33 ms zu früh (Takt)', () => {
  const T = BOSSES.tachionen;
  assert.ok(T.fast.warn >= 700 && T.charged.every(c => c.warn >= 1000), 'Warnzeiten fair');
  assert.ok(CONST.DODGE_BUFFER >= 250, 'Puffer deckt das alte Vor-Echo (300 ms vorher) fast ganz ab');
  const mk = () => { const s = quiet(createBattle({ team: [F('christian')], enemy: makeBoss(T, 5), rng: () => 0.5 })); s.team[0].btc = s.team[0].maxBtc = 1e6; return s; };
  // Reaktion 150 ms auf das Vor-Echo (= Warnbeginn) + Schwelle
  const s = mk();
  s.enemy.nextFastAt = 2000;
  until(s, 1300);
  assert.ok(s.enemy.warning, 'Warnung ab 1300');
  until(s, 1500);
  let ev = [...tick(s, 50, { dodge: true }), ...until(s, 2000)];
  assert.equal(find(ev, 'enemyAttack').dodged, true);
  // Takt vorweggenommen: 33 ms vor dem Warnbeginn gewischt
  const t = mk();
  t.enemy.nextFastAt = 2000;
  run(t, 1267, {}, 1267);
  ev = [...tick(t, 1, { dodge: true }), ...until(t, 2000)];
  assert.ok(find(ev, 'dodge'));
  assert.equal(find(ev, 'enemyAttack').dodged, true);
  // nach einer Lade-Attacke beginnt der nächste Überlicht-Hash erst ATTACK_GAP später (vorher 400 ms, mitten im Halving-Einschlag)
  const h = mk();
  h.enemy.nextChargedAt = 1000; h.enemy.nextFastAt = 1100;
  assert.equal(find(until(h, 1050), 'enemyAttack').attack.name, 'Tachionen-Halving');
  while (!h.enemy.warning) tick(h, 50);
  assert.equal(h.enemy.warning.attack.name, 'Überlicht-Hash');
  assert.equal(h.enemy.warning.startAt - h.lastAttackAt, CONST.ATTACK_GAP);
});

test('Boss-Animationen schlagen nie nach dem Feuern ein (fliegen während der Warnung)', () => {
  const atks = [...Object.values(BOSSES), ...RUETHERS.map(r => wildBossDef(r, { rarity: 'legendaer', level: 20 }))].flatMap(b => [b.fast, ...b.charged]);
  for (const a of atks) assert.ok(bossHitMs(a) <= a.warn, `${a.name}: Einschlag ${bossHitMs(a)} ms, Warnung ${a.warn} ms`);
  assert.ok(bossHitMs(BOSSES.ps3.fast) > 0, 'Blu-ray fliegt sichtbar heran');
});

test('„JETZT!" kommt eine Reaktionszeit vor dem Perfekt-Fenster: wer darauf reagiert, trifft „Perfekt!"', () => {
  const shown = CONST.DODGE_PERFECT + NOW_LEAD; // ms vor dem Einschlag, ab dann steht „JETZT!" auf dem Knopf
  for (const [id, atk] of [['ps3', BOSSES.ps3.fast], ['tachionen', BOSSES.tachionen.fast], ['tachionen', BOSSES.tachionen.charged[0]]]) {
    assert.ok(atk.warn > shown, `${atk.name}: Warnung länger als „JETZT!"`);
    for (const react of [250, 300, 350]) for (const swipe of [40, 90]) {
      const s = quiet(createBattle({ team: [F('christian')], enemy: makeBoss(BOSSES[id]), rng: () => 0.5 }));
      s.team[0].btc = s.team[0].maxBtc = 1e6;
      if (atk === BOSSES[id].fast) s.enemy.nextFastAt = 3000; else s.enemy.nextChargedAt = 3000;
      while (s.time + DT < 3000 - shown) tick(s, DT);
      const t0 = s.time + DT; // erster Frame mit „JETZT!"
      const ev = [];
      while (s.time + DT < t0 + react + swipe) ev.push(...tick(s, DT));
      ev.push(...tick(s, DT, { dodge: true })); // Wisch zählt im nächsten Frame
      while (!find(ev, 'enemyAttack')) ev.push(...tick(s, DT));
      assert.deepEqual([find(ev, 'enemyAttack').dodged, find(ev, 'dodge')?.perfect], [true, true], `${atk.name}, Reaktion ${react} + ${swipe} ms`);
    }
  }
});

test('Wisch-Erkennung: jede Richtung ab 28 px, darunter Tipp', () => {
  assert.equal(SWIPE_PX, 28);
  assert.equal(swipeDir(-40, 0), 'left');
  assert.equal(swipeDir(40, 0), 'right');
  assert.equal(swipeDir(0, 90), 'right'); // senkrecht nach unten
  assert.equal(swipeDir(-3, -60), 'left'); // senkrecht nach oben
  assert.equal(swipeDir(20, 20), 'right'); // schräg, 28,3 px
  assert.equal(swipeDir(20, 0), null);
  assert.equal(swipeDir(0, 0), null);
});
