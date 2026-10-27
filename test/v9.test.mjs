import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySaveV3, buyItem, catchChanceV3, summonCost, haunebuWin, haunebuActive, startBeam, activeBeam, extendHaunebu,
  questResult, QUEST_SATS,
} from '../js/progress.js';
import { checkAchievements, seededRng } from '../js/quests.js';
import { lureWave, lureTrim } from '../js/spawn.js';
import { lureZoom, lureRoom } from '../js/map.js';
import { distance, offsetPoint } from '../js/geo.js';
import { CONST, ARENAS, RUETHERS, RARITIES, SHOP } from '../js/data.js';

const MIN10 = CONST.HAUNEBU_USE_MS;
const HAGEN = { lat: 51.37, lon: 7.48 }; // weit weg von allen Arenen
const PCSALE = ARENAS.find(a => a.id === 'pcsale');
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

// ---------- §1 Super-Münze und Preise ----------
test('v9: Super-Münze +50 % Fangchance, Obergrenze bleibt, kostet 500', () => {
  assert.equal(catchChanceV3(0.5, 'legendaer', 0.9, false), 0.2);
  assert.equal(catchChanceV3(0.5, 'legendaer', 0.9, true), 0.7);
  assert.equal(catchChanceV3(0.35, 'episch', 0.6, true), 0.77);
  assert.equal(catchChanceV3(0.5, 'normal', 0.9, true), CONST.MAX_CATCH_CHANCE);
  assert.match(SHOP.find(i => i.id === 'supercoin').desc, /\+50 %/);
  const s = emptySaveV3();
  s.sats = 999;
  assert.deepEqual(buyItem(s, 'supercoin', 0), { ok: true });
  assert.equal(s.sats, 499);
  assert.equal(s.items.supercoin, 1);
  assert.deepEqual(buyItem(s, 'supercoin', 0), { ok: false, reason: 'sats' });
  assert.equal(s.items.supercoin, 1);
});

test('v9: Lockmodul kostet 1000, läuft 5 Minuten, Nachkauf verlängert', () => {
  const s = emptySaveV3();
  s.sats = 2500;
  assert.deepEqual(buyItem(s, 'lockmodul', 1000), { ok: true });
  assert.equal(s.sats, 1500);
  assert.equal(s.lureUntil, 1000 + CONST.LURE_MS);
  buyItem(s, 'lockmodul', 2000);
  assert.equal(s.lureUntil, 1000 + 2 * CONST.LURE_MS);
  assert.deepEqual(buyItem(s, 'lockmodul', 3000), { ok: false, reason: 'sats' });
  assert.equal(s.sats, 500);
});

// ---------- §1 Lockmodul: additive Wellen ----------
// Bildschirm-Pixel relativ zum Spieler in der Kartenmitte bei lureZoom (Karte genordet, y nach unten)
const toPx = (pos, p, side) => {
  const m = (156543 * Math.cos((pos.lat * Math.PI) / 180)) / 2 ** lureZoom(pos.lat, side);
  const dE = Math.sign(p.lon - pos.lon) * distance({ lat: pos.lat, lon: p.lon }, pos), dN = Math.sign(p.lat - pos.lat) * distance({ lat: p.lat, lon: pos.lon }, pos);
  return [dE / m, -dN / m];
};
// zwei achsenparallele Quadrate (Mitte, halbe Kantenlänge) überlappen
const hit = ([ax, ay], ah, [bx, by], bh) => Math.abs(ax - bx) < ah + bh && Math.abs(ay - by) < ah + bh;
// Lockmodul über waves Wellen im Minutentakt, wie die App: alt = lureTrim, neu = lureWave, anhängen
function runLure(pos, { side = 375, waves = 5, seed = 1, keep = null, start = [], buttons = [] } = {}) {
  const room = lureRoom(pos, ARENAS, side, buttons), rng = seededRng(seed), log = [];
  let spawns = start;
  for (let w = 0; w < waves; w++) {
    const now = w * CONST.LURE_INTERVAL;
    const old = lureTrim({ spawns, player: pos, now, keep });
    const wave = lureWave({ player: pos, ruethers: RUETHERS, arenas: ARENAS, now, rng, spawns: old, ...room });
    spawns = [...old, ...wave];
    log.push({ old, wave, spawns });
  }
  return log;
}

test('v9: lureWave liefert nur die neuen: 3 Stück, im Lock-Ring, normale Lebensdauer', () => {
  const old = { id: 'alt', ruetherId: 'viktor', ...offsetPoint(HAGEN, 200, 0), expires: 9e12, rarity: 'normal' };
  for (let i = 0; i < 100; i++) {
    const wave = lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 1000, rng: seededRng(i + 1), spawns: [old] });
    assert.equal(wave.length, CONST.LURE_WAVE);
    assert.ok(!wave.includes(old));
    for (const s of wave) {
      const d = distance(HAGEN, s);
      assert.ok(d >= CONST.LURE_RING[0] && d <= CONST.LURE_RING[1] + 1, `got ${d}`);
      assert.ok(d <= CONST.CATCH_RANGE, 'in Fangreichweite');
      assert.equal(s.expires, 1000 + CONST.SPAWN_LIFETIME);
      assert.equal(s.lure, true, 'Wellen-Gesicht: die Karte hält danach den Lock-Zoom');
      assert.ok(['christian', 'viktor'].includes(s.ruetherId), 'ortsgebundene nur in ihrer Zone');
    }
  }
  assert.deepEqual(lureWave({ player: null, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0.5) }), []);
});

test('v9: Lockmodul additiv: 5 Wellen à 3 = 15, die alten bleiben, Gesichter decken sich nicht, alles im Bild', () => {
  for (const side of [336, 375, 390]) {
    for (let seed = 1; seed <= 40; seed++) {
      const log = runLure(HAGEN, { side, seed });
      log.forEach(({ old, wave, spawns }, w) => {
        assert.equal(wave.length, 3, `Welle ${w + 1} bei ${side}`);
        assert.equal(spawns.length, 3 * (w + 1));
        if (w) assert.deepEqual(old, log[w - 1].spawns, 'nichts fällt weg');
      });
      const all = log.at(-1).spawns;
      assert.equal(all.length, CONST.LURE_MAX);
      for (const s of all) {
        const p = toPx(HAGEN, s, side);
        assert.ok(!hit(p, 24, [0, 0], 24), 'Spieler-Punkt bleibt frei');
        assert.ok(Math.abs(p[0]) + 24 <= side / 2 && Math.abs(p[1]) + 24 <= side / 2, `außerhalb des Bildes bei ${side}`);
        for (const t of all) if (t !== s) assert.ok(!hit(p, 26, toPx(HAGEN, t, side), 26), `Gesichter decken sich bei ${side}`);
      }
    }
  }
});

test('v9: lureTrim: höchstens LURE_MAX − LURE_WAVE alte, die ältesten fallen, nie der offene', () => {
  const at = (i, expires) => ({ id: 's' + i, ruetherId: 'viktor', ...offsetPoint(HAGEN, 10 * i, 0), expires, rarity: 'normal' });
  const list = Array.from({ length: 15 }, (_, i) => at(i, 1000 + i));
  const keep = list[0]; // der älteste ist gerade offen
  const left = lureTrim({ spawns: list, player: HAGEN, now: 0, keep });
  assert.equal(left.length, CONST.LURE_MAX - CONST.LURE_WAVE);
  assert.ok(left.includes(keep));
  assert.deepEqual(list.filter(s => !left.includes(s)).map(s => s.id), ['s1', 's2', 's3']);
  // abgelaufen oder vergessen fällt raus, der offene bleibt auch abgelaufen
  const far = { ...at(99, 9e12), ...offsetPoint(HAGEN, CONST.SPAWN_FORGET + 50, 0) };
  const out = lureTrim({ spawns: [at(1, 500), at(2, 5000), far, at(3, 400)], player: HAGEN, now: 1000, keep: { id: 's3' } });
  assert.deepEqual(out.map(s => s.id), ['s2', 's3']);
  assert.deepEqual(lureTrim({ spawns: list.slice(0, 4), player: HAGEN, now: 0 }), list.slice(0, 4));
});

test('v9: Lockmodul über die Grenze: nie mehr als LURE_MAX, der offene Spawn bleibt, keiner liegt auf ihm', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const keep = { id: 'offen', ruetherId: 'viktor', ...offsetPoint(HAGEN, 48 * Math.cos(seed), 48 * Math.sin(seed)), expires: 1, rarity: 'episch' };
    const log = runLure(HAGEN, { seed, waves: 9, keep, start: [keep] });
    for (const { spawns, wave } of log) {
      assert.ok(spawns.length <= CONST.LURE_MAX, `${spawns.length}`);
      assert.equal(spawns.filter(s => s.id === 'offen').length, 1);
      for (const s of wave) assert.ok(!hit(toPx(HAGEN, s, 375), 26, toPx(HAGEN, keep, 375), 26), 'auf dem offenen Spawn');
    }
    assert.ok(log.every(({ wave }) => wave.length === 3), 'Platz durch die Grenze: jede Welle bringt 3');
  }
});

test('v9: Lockmodul-Seltenheiten normal verteilt wie rollRarity', () => {
  const n = {}, total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let all = 0;
  for (let i = 0; i < 2000; i++) {
    for (const s of lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: i, rng: seededRng(Math.imul(i + 5, 2654435761)) })) {
      n[s.rarity] = (n[s.rarity] || 0) + 1;
      all++;
    }
  }
  for (const r of RARITIES) assert.ok(Math.abs((n[r.id] || 0) / all - r.weight / total) < 0.02, `${r.id}: ${(n[r.id] || 0) / all}`);
});

test('v9: lureWave: am PC Sale kann Micha kommen, Rüther des Tages häufiger', () => {
  const near = offsetPoint(PCSALE, 100, 0);
  const ids = new Set();
  for (let i = 0; i < 40; i++) for (const s of lureWave({ player: near, ruethers: RUETHERS, arenas: ARENAS, now: i, rng: seededRng(i + 1) })) ids.add(s.ruetherId);
  assert.deepEqual([...ids].sort(), ['christian', 'micha', 'viktor']);
  const feat = lureWave({ player: HAGEN, ruethers: RUETHERS, arenas: ARENAS, now: 0, rng: seq(0, 0.3), featured: 'viktor' });
  assert.equal(feat.length, 3);
  assert.ok(feat.every(s => s.ruetherId === 'viktor'));
});

test('v9: Lockmodul an Arenen: kein Gesicht auf Schild, Besitzer-Foto oder Keller-Plakette, unter keinem Knopf', () => {
  const W = ARENAS.find(a => a.id === 'worringen'), K = ARENAS.find(a => a.id === 'keller');
  const fab = { x: 187.5 - 16 - 24, y: 220 - 84 - 24, h: 24 }; // Haunebu-Knopf, Karte 375×440
  for (const [at, side, least] of [[W, 375, 15], [W, 336, 11], [W, 390, 15], [K, 375, 14], [K, 390, 14], [PCSALE, 375, 15]]) { // 336: Karte bei 375×667 mit Haunebu-Chip
    const pos = offsetPoint(at, 40, 0); // so landet die Haunebu (app.js land)
    for (let seed = 1; seed <= 30; seed++) {
      const all = runLure(pos, { side, seed, buttons: [fab] }).at(-1).spawns;
      assert.ok(all.length >= least - 1, `nur ${all.length} bei ${at.id}/${side}`);
      for (const s of all) {
        const p = toPx(pos, s, side);
        for (const a of ARENAS) {
          const [x, y] = toPx(pos, a, side), c = a.id === 'keller' ? [x + 44, y + 12] : [x, y]; // Keller-Schild rechts versetzt (map.js)
          assert.ok(!hit(p, 24, c, 34), `Gesicht auf ${a.id} bei ${at.id}/${side}`);
        }
        assert.ok(!hit(p, 26, [fab.x, fab.y], fab.h), 'unter dem Haunebu-Knopf');
        for (const t of all) if (t !== s) assert.ok(!hit(p, 26, toPx(pos, t, side), 26), `Gesichter decken sich bei ${at.id}/${side}`);
      }
    }
  }
});

// ---------- §1 Haunebu verlängern ----------
test('v9: extendHaunebu: nur im Fenster und mit 5000 Sats, +10 Minuten, Preis steigt nicht', () => {
  const s = emptySaveV3();
  s.sats = 50_000;
  assert.deepEqual(extendHaunebu(s, 0), { ok: false, reason: 'keine' });
  assert.equal(s.sats, 50_000);
  haunebuWin(s, 1000);
  const sats = s.sats, summons = s.stats.haunebuSummons, cost = summonCost(s);
  assert.deepEqual(extendHaunebu(s, 1000 + MIN10), { ok: false, reason: 'keine' }, 'abgelaufen');
  assert.deepEqual(extendHaunebu(s, 2000), { ok: true, until: 1000 + MIN10 + CONST.HAUNEBU_EXTEND_MS });
  assert.equal(s.sats, sats - CONST.HAUNEBU_EXTEND_COST);
  assert.deepEqual(extendHaunebu(s, 3000), { ok: true, until: 1000 + MIN10 + 2 * CONST.HAUNEBU_EXTEND_MS });
  assert.equal(s.sats, sats - 2 * CONST.HAUNEBU_EXTEND_COST, 'jedes Mal 5000');
  assert.equal(s.stats.haunebuSummons, summons);
  assert.equal(summonCost(s), cost);
  assert.equal(haunebuActive(s, 1000 + MIN10 + 2 * CONST.HAUNEBU_EXTEND_MS - 1), true);
  assert.deepEqual(buyItem(s, 'haunebu', 3000), { ok: false, reason: 'aktiv' }, 'Beschwören bleibt im Fenster gesperrt');
  s.sats = CONST.HAUNEBU_EXTEND_COST - 1;
  const until = s.haunebuUntil;
  assert.deepEqual(extendHaunebu(s, 4000), { ok: false, reason: 'sats' });
  assert.equal(s.haunebuUntil, until);
  assert.equal(s.sats, CONST.HAUNEBU_EXTEND_COST - 1);
});

test('v9: extendHaunebu: ein aktiver Beam übernimmt das neue Ende, ein alter nicht', () => {
  const s = emptySaveV3();
  haunebuWin(s, 0);
  const home = { lat: 51, lon: 7 };
  startBeam(s, 'keller', 100, home);
  s.sats = 5000;
  const { until } = extendHaunebu(s, MIN10 - 1);
  assert.deepEqual(s.beam, { arenaId: 'keller', until, from: home });
  assert.equal(activeBeam(s, MIN10 + 1).arenaId, 'keller', 'der Beam läuft über das alte Ende hinaus');
  // Beam aus einem früheren Fenster bleibt tot
  const t = emptySaveV3();
  t.beam = { arenaId: 'keller', until: MIN10, from: null };
  haunebuWin(t, 2 * MIN10);
  t.sats = 5000;
  extendHaunebu(t, 2 * MIN10 + 1);
  assert.equal(t.beam.until, MIN10);
  assert.equal(activeBeam(t, 2 * MIN10 + 1), null);
});

// ---------- §7 Quest-Belohnungen ----------
test('v9: questResult Camping: 12k, je Kieser-Training −1k, nie unter 10k, Misserfolg 10 %', () => {
  const s = emptySaveV3();
  const pay = k => questResult(s, 'camping', 'success', 3, false, { kieser: k }).sats;
  assert.deepEqual([0, 1, 2, 3, 7].map(pay), [12_000, 11_000, 10_000, 10_000, 10_000]);
  assert.equal(s.sats, 53_000);
  assert.equal(questResult(s, 'camping', 'fail', 1, false, { kieser: 1 }).sats, 1100);
  assert.equal(questResult(s, 'camping', 'abort', 1).sats, 1200);
  // „Los!“ und sofort Aufgeben kostet nichts mehr (Haunebu bleibt): ohne Fortschritt weder Sats noch XP
  for (const id of ['camping', 'bruch', 'hangar', 'ps3', 'keller', 'tachionenraub']) {
    const r = questResult(emptySaveV3(), id, 'abort', 0);
    assert.deepEqual([r.sats, r.xp], [0, 0], id);
  }
  assert.deepEqual(s.questLog.camping, { best: 3, done: true, wins: 5, kieser: 14, fines: 0, clean: false });
  const r = questResult(emptySaveV3(), 'camping', 'success', 3, true, { kieser: 1 });
  assert.deepEqual(r, { sats: 11_000, xp: CONST.QUEST_XP, best: 3, newBest: true, firstDone: true, fine: 0 });
});

test('v9: questResult Bruch: jedes Mal 6500, Erwischt kostet 10.000, nie unter 0', () => {
  const s = emptySaveV3();
  assert.equal(questResult(s, 'bruch', 'success', 3, false).firstDone, true);
  const again = questResult(s, 'bruch', 'success', 3, false);
  assert.equal(again.sats, 6500);
  assert.equal(again.firstDone, false);
  assert.equal(s.sats, 13_000);
  assert.equal(questResult(s, 'bruch', 'fail', 1, false, {}).sats, 650, 'Zeit um, ohne Erwischen');
  assert.equal(s.sats, 13_650);
  // erwischt: kein Trostgeld, volle Strafe
  assert.deepEqual(questResult(s, 'bruch', 'fail', 2, false, { fine: 10_000 }), { sats: 0, xp: CONST.QUEST_XP / 10, best: 3, newBest: false, firstDone: false, fine: 10_000 });
  assert.equal(s.sats, 3650);
  // nicht genug Sats: bis 0, mehr nicht
  assert.equal(questResult(s, 'bruch', 'fail', 2, false, { fine: 10_000 }).fine, 3650);
  assert.equal(s.sats, 0);
  assert.equal(s.questLog.bruch.fines, 2);
  assert.equal(s.questLog.bruch.wins, 2);
  assert.equal(s.questLog.bruch.done, true, 'Strafe nimmt den Abschluss nicht weg');
});

test('v9: questResult: extra fehlt, null oder Unsinn; alte v8-Einträge zählen weiter', () => {
  const s = emptySaveV3();
  assert.equal(questResult(s, 'camping', 'success', 3, false, null).sats, 12_000);
  assert.equal(questResult(s, 'camping', 'success', 3, false, { kieser: -4, fine: -100 }).sats, 12_000);
  assert.equal(questResult(s, 'camping', 'success', 3, false, { kieser: 'x', fine: NaN }).fine, 0);
  assert.equal(s.sats, 36_000);
  assert.equal(questResult(s, 'hangar', 'success', 4).sats, 2500, 'v8-Missionen unverändert');
  s.questLog.keller = { best: 1, done: true }; // v8-Stand
  questResult(s, 'keller', 'success', 1, true);
  assert.deepEqual(s.questLog.keller, { best: 1, done: true, wins: 2, kieser: 0, fines: 0, clean: true });
  assert.deepEqual(Object.keys(QUEST_SATS).sort(), ['bruch', 'camping', 'hangar', 'keller', 'ps3', 'rabino', 'tachionenraub']); // v12: + Rabino
});

// ---------- §7 Erfolge ----------
test('v9: Erfolge kieser3, bruch_clean, quest_all mit allen Missionen (v12: 7)', () => {
  const s = emptySaveV3();
  const ids = () => checkAchievements(s).map(a => a.id);
  questResult(s, 'camping', 'fail', 1, false, { kieser: 2 });
  assert.deepEqual(ids(), []);
  questResult(s, 'camping', 'success', 3, false, { kieser: 1 });
  assert.deepEqual(ids(), ['quest1', 'kieser3']);
  questResult(s, 'bruch', 'success', 3, false);
  questResult(s, 'bruch', 'fail', 3, true);
  assert.deepEqual(ids(), [], 'Bruch mit Alarm oder ohne Erfolg ist nicht spurlos');
  for (const id of ['tachionenraub', 'hangar', 'ps3']) questResult(s, id, 'success', 3);
  assert.deepEqual(ids(), []);
  questResult(s, 'bruch', 'success', 3, true);
  assert.deepEqual(ids(), ['bruch_clean']);
  questResult(s, 'keller', 'success', 1);
  assert.deepEqual(ids(), [], 'v12: Rabino Empire HQ fehlt noch');
  questResult(s, 'rabino', 'success', 3);
  assert.deepEqual(ids(), ['quest_all']);
});
