// v12: Moshe Hillel, Fundament (Spec v12 §1–§3, §6, §8). Engine-, Shop- und Quest-Tests kommen in ihren Bausteinen dazu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { CONST, BOSSES, IMMOBILIEN, AD_ARENA, ARENAS, ARENA_BY_ID, SHOP, ACHIEVEMENTS, LINES } from '../js/data.js';
import { adState, nextWindow, openWindow, AD_GONE_MS } from '../js/ad.js';
import { emptySaveV3, migrate, questsUnlocked, questResult, QUEST_SATS, buyItem, arenaWin } from '../js/progress.js';
import { checkAchievements, seededRng } from '../js/quests.js';
// Quest-Teil (§4): eigene Namen, der Kampf-Teil unten importiert makeFighter, RUETHER_BY_ID und tick (battle.js) selbst
import { RUETHER_BY_ID as RBI } from '../js/data.js';
import { makeFighter as mkFighter } from '../js/battle.js';
import { MISSIONS, MISSION_BY_ID, buildSetup } from '../js/quest/missions.js';
import { createQuest, tick as qtick, visibleCone, questSummary, tileAt, ENEMY_TYPES } from '../js/quest/engine.js';
import { THEMES } from '../js/quest/draw.js';

const MIN = 60_000, H = 3_600_000;

// ---------- §2, §3, §6 Daten ----------
test('v12: Moshe, Immobilien, Anzeige-Arena nur in ARENA_BY_ID, Konstanten, Shop-Eintrag, Erfolge', () => {
  const m = BOSSES.moshe;
  assert.equal(m.name, 'Moshe Hillel');
  assert.equal(m.btc, 800);
  assert.deepEqual([m.fast.fx, m.fast.warn, m.fast.every], ['books', 800, 2300]);
  assert.deepEqual(m.charged.map(a => a.fx), ['code', 'phone', 'telegram']);
  assert.deepEqual(m.charged[0].sats, { pct: 0.1, max: 500, min: 50 });
  assert.ok(m.charged.every(a => a.warn === 1200));
  assert.equal(new Set(IMMOBILIEN).size, 7);
  assert.equal(ARENA_BY_ID.anzeige, AD_ARENA);
  assert.deepEqual(AD_ARENA, { id: 'anzeige', name: 'Rabino Empire', boss: 'moshe', virtual: true });
  assert.ok(!ARENAS.some(a => a.id === 'anzeige'), 'kein Marker, keine Liste');
  assert.equal(ARENAS.length, 5);
  assert.deepEqual([CONST.AD_MS, CONST.AD_EXTEND_MS, CONST.AD_GAP_MIN, CONST.AD_GAP_MAX, CONST.AD_RENDITE], [10 * MIN, 5 * MIN, 2 * H, 3 * H, 0.1]);
  const book = SHOP.find(i => i.id === 'investmentcode');
  assert.deepEqual([book.name, book.cost, book.was, book.sell], ['Der Investment-Code', 4999, 8333, 10]);
  assert.match(book.desc, /100 Seiten inklusive\. 2 Geschenke\./);
  for (const id of ['reingefallen', 'nichtreingefallen', 'rabino']) assert.ok(ACHIEVEMENTS.some(a => a.id === id), id);
  assert.equal(LINES.moshe.appear[0], 'Sie haben bestellt. Jetzt zahlen Sie.');
  assert.equal(LINES.moshe.rage[0], 'Das Angebot ist gleich vorbei!');
});

// §0: der Witz geht auf den Shop, nie auf Juden; das Wort kommt im Code nirgends vor, echte Personen auch nicht
// (die Muster stehen zerlegt da, sonst findet der Test sich selbst)
test('v12 §0: verbotene Wörter kommen in js/, test/ und index.html nicht vor', () => {
  const banned = new RegExp(['j' + String.fromCharCode(252) + 'disch', 'gold' + 'knopf', 'teich' + 'tal'].join('|'), 'i');
  const root = new URL('../', import.meta.url);
  const files = ['index.html', ...readdirSync(new URL('js/', root), { recursive: true }).map(f => `js/${f}`), ...readdirSync(new URL('test/', root)).map(f => `test/${f}`)]
    .filter(f => /\.(m?js|html)$/.test(f) && statSync(new URL(f, root)).isFile());
  assert.ok(files.length > 20);
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, root), 'utf8'), banned, f);
});

// ---------- §1 Zeitplan ----------
test('v12: adState: geschlossen → offen → verlängert → vergriffen → nächstes Fenster', () => {
  let now = 1_000_000;
  assert.deepEqual(adState(null, now), { phase: 'closed', remaining: 0 });
  let ad = nextWindow(null, now, () => 0.5); // fehlt → sofort offen
  assert.deepEqual(ad, { until: now + CONST.AD_MS, next: 0, extended: false });
  assert.deepEqual(ad, openWindow(now));
  assert.deepEqual(adState(ad, now), { phase: 'open', remaining: CONST.AD_MS });
  now += 9 * MIN;
  assert.equal(nextWindow(ad, now), ad, 'nichts fällig: dasselbe Objekt');
  assert.deepEqual(adState(ad, now), { phase: 'open', remaining: MIN });
  now += MIN; // abgelaufen → einmal verlängert
  ad = nextWindow(ad, now, () => 0.5);
  assert.deepEqual(ad, { until: now + CONST.AD_EXTEND_MS, next: 0, extended: true });
  assert.deepEqual(adState(ad, now), { phase: 'extended', remaining: CONST.AD_EXTEND_MS });
  assert.equal(nextWindow(ad, now + 1), ad);
  now += CONST.AD_EXTEND_MS; // Verlängerung vorbei → vergriffen, next gewürfelt, keine zweite Verlängerung
  ad = nextWindow(ad, now, () => 0.5);
  assert.equal(ad.extended, true);
  assert.equal(ad.until, now);
  assert.equal(ad.next, now + CONST.AD_GAP_MIN + 0.5 * (CONST.AD_GAP_MAX - CONST.AD_GAP_MIN));
  assert.deepEqual(adState(ad, now), { phase: 'gone', remaining: AD_GONE_MS });
  assert.equal(adState(ad, now + 1000).phase, 'gone');
  assert.deepEqual(adState(ad, now + AD_GONE_MS), { phase: 'closed', remaining: ad.next - now - AD_GONE_MS });
  assert.equal(nextWindow(ad, ad.next - 1), ad, 'vor next bleibt es zu');
  const again = nextWindow(ad, ad.next, () => 0);
  assert.deepEqual(again, { until: ad.next + CONST.AD_MS, next: 0, extended: false });
  assert.equal(adState(again, ad.next).phase, 'open');
});

test('v12: nextWindow: Pause 2–3 h; lange Abwesenheit verlängert und schließt in einem Schritt, ohne neues Fenster', () => {
  const ad = { until: 100, next: 0, extended: true };
  assert.equal(nextWindow(ad, 100, () => 0).next, 100 + CONST.AD_GAP_MIN);
  assert.ok(nextWindow(ad, 100, () => 0.999999).next < 100 + CONST.AD_GAP_MAX);
  const old = nextWindow({ until: 0, next: 0, extended: false }, 2 * H, () => 0.5); // Fenster komplett verpasst
  assert.deepEqual(old, { until: CONST.AD_EXTEND_MS, next: 2 * H + 2.5 * H, extended: true });
  assert.equal(adState(old, 2 * H).phase, 'closed');
  assert.equal(nextWindow(old, 2 * H + 1), old);
  assert.equal(nextWindow(old, old.next).extended, false, 'danach ein frisches Fenster');
});

// ---------- Migration, Freischaltung ----------
test('v12: Migration: save.ad, items.investmentcode, stats.moshe; arenaLevels.anzeige bleibt; Freischaltung und „Herrscher" ignorieren anzeige', () => {
  const fresh = emptySaveV3();
  assert.equal(fresh.ad, null);
  assert.equal(fresh.items.investmentcode, 0);
  assert.equal(fresh.stats.moshe, 0);
  const s = migrate({
    version: 3, box: [], team: [], ad: { until: 5, next: 9, extended: true }, items: { investmentcode: 1 }, stats: { moshe: 2 },
    arenaLevels: { anzeige: 3, worringen: 2, mond: 4 }, arenaMastered: { anzeige: true, mond: true }, arenaOwners: { anzeige: 'r1' },
  });
  assert.deepEqual(s.ad, { until: 5, next: 9, extended: true });
  assert.equal(s.items.investmentcode, 1);
  assert.equal(s.stats.moshe, 2);
  assert.deepEqual(s.arenaLevels, { anzeige: 3, worringen: 2 });
  assert.deepEqual(s.arenaMastered, { anzeige: true });
  assert.deepEqual(s.arenaOwners, { anzeige: 'r1' });
  assert.deepEqual(migrate(structuredClone(s)), s, 'Neuladen ändert nichts');
  for (const bad of [null, 'x', 7, { until: 'x' }, { next: 1 }]) assert.equal(migrate({ version: 3, box: [], team: [], ad: bad }).ad, null, String(bad));
  assert.deepEqual(migrate({ version: 3, box: [], team: [], ad: { until: 7, next: 'x' } }).ad, { until: 7, next: 0, extended: false });
  assert.deepEqual(migrate({ version: 3, box: [], team: [] }).items, { lockmodul: 0, supercoin: 0, investmentcode: 0 });
  // Anzeige gemeistert schaltet weder die Quests noch „Herrscher" frei, die echten fünf schon
  assert.equal(questsUnlocked(s), false);
  assert.ok(!checkAchievements(s).some(a => a.id === 'master3'));
  for (const a of ARENAS) s.arenaMastered[a.id] = true;
  assert.equal(questsUnlocked(s), true);
  const t = emptySaveV3();
  for (const a of ARENAS) t.arenaMastered[a.id] = true;
  assert.equal(questsUnlocked(t), true);
  assert.ok(checkAchievements(t).some(a => a.id === 'master3'), 'ohne Anzeige-Arena');
});

// ---------- §3, §6 Kauf einmalig, Arena-Maschine, Erfolge ----------
test('v12: Investment-Code einmalig; Anzeige-Arena Lv. 1–5 über arenaWin; Erfolge reingefallen, nichtreingefallen, rabino', () => {
  const s = emptySaveV3();
  s.sats = 10_000;
  assert.deepEqual(checkAchievements(s), []);
  assert.deepEqual(buyItem(s, 'investmentcode'), { ok: true });
  assert.equal(s.sats, 5001);
  assert.equal(s.items.investmentcode, 1);
  assert.deepEqual(buyItem(s, 'investmentcode'), { ok: false, reason: 'besitz' });
  assert.equal(s.sats, 5001);
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['reingefallen']);
  s.items.investmentcode = 0; // verkauft: Erfolg bleibt, Buch weg
  assert.deepEqual(checkAchievements(s), []);
  s.sats = 100;
  assert.deepEqual(buyItem(s, 'investmentcode'), { ok: false, reason: 'sats' });
  s.stats.moshe = 1;
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['nichtreingefallen']);
  for (let i = 1; i <= CONST.ARENA_LEVELS; i++) {
    const w = arenaWin(s, 'anzeige', null);
    assert.equal(w.level, i);
    assert.equal(w.mastered, i === CONST.ARENA_LEVELS);
  }
  assert.equal(s.arenaMastered.anzeige, true);
  assert.ok(!('anzeige' in s.arenaOwners), 'kein stationierter Rüther in der Anzeige (Spec §1)');
  const ids = checkAchievements(s).map(a => a.id);
  assert.ok(ids.includes('rabino'));
  assert.ok(!ids.includes('master1'), 'Arenameister braucht eine echte Arena');
  assert.ok(!ids.includes('master3'), 'Herrscher braucht die echten Arenen');
  assert.equal(questsUnlocked(s), false);
});

// ---------- §4 Belohnung ----------
test('v12: questResult rabino: 500 je Sack, +2000 Abschluss, jedes Video −1000, nie unter 0', () => {
  const s = emptySaveV3();
  assert.deepEqual(QUEST_SATS.rabino, { coin: 500, base: 0, done: 2000, video: 1000 });
  assert.equal(questResult(s, 'rabino', 'success', 3).sats, 3500);
  assert.equal(questResult(s, 'rabino', 'success', 3, false, { videos: 1 }).sats, 2500);
  assert.equal(questResult(s, 'rabino', 'success', 3, false, { videos: 3 }).sats, 500);
  assert.equal(questResult(s, 'rabino', 'success', 3, false, { videos: 9 }).sats, 0);
  assert.equal(questResult(s, 'rabino', 'success', 6, false, { videos: 2 }).sats, 3000);
  assert.equal(questResult(s, 'rabino', 'fail', 2).sats, 100);
  assert.equal(questResult(s, 'rabino', 'fail', 2, false, { videos: 1 }).sats, 0);
  assert.equal(questResult(s, 'rabino', 'abort', 0, false, { videos: 2 }).sats, 0);
  assert.equal(s.sats, 3500 + 2500 + 500 + 3000 + 100);
  assert.equal(questResult(s, 'rabino', 'success', 3, false, { videos: -2 }).sats, 3500, 'Unsinn zählt als 0');
  assert.equal(questResult(emptySaveV3(), 'camping', 'success', 3, false, { videos: 3 }).sats, 12_000, 'nur Rabino kennt Videos');
  assert.equal(s.questLog.rabino.done, true);
});

// ---------- §4 Quest „Rabino Empire HQ“: Mission, Gegner, Videos ----------
const F = id => mkFighter(RBI[id]);
const OFFICE = [
  '####################',
  '#PPP...............#',
  '#PPP...............#',
  '#PPP...............#',
  '#..................#',
  '#........C.........#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];
// Test-Mission wie in quest.test.mjs, aber mit Rabino-Feldern (stealMs, loot, Berater als Verstärkung)
function Q(enemies, { team = ['christian'], ...opts } = {}) {
  const mission = {
    id: 'test', name: 'Test', theme: 'zypern', timeMs: 600_000, gate: [18, 1], coins: 2, reinforce: 'berater', stealMs: 6000, loot: 'q-sack',
    objective: { type: 'steal', min: 1, label: 'Test' }, texts: { success: 'ok', fail: 'nein' }, map: OFFICE, variants: [{ id: 'v', enemies }], ...opts,
  };
  return createQuest({ mission, variant: 'v', team: team.map(F), rng: seededRng(1) });
}
const place = (o, x, y) => Object.assign(o, { x: x + 0.5, y: y + 0.5, path: [], goal: o.patrol ? null : { x, y }, intent: null, busy: null });
function run(st, ms, cmds = []) { const ev = []; for (let t = 0; t < ms; t += 50) ev.push(...qtick(st, 50, t === 0 ? cmds : [])); return ev; }
const has = (ev, type, f = () => true) => ev.some(e => e.type === type && f(e));
const find = (ev, type, f = () => true) => ev.find(e => e.type === type && f(e));

test('v12 §4: Mission rabino: needsItem = Shop-Buch, 2 Karten × 2 Varianten mit je 6 Tresoren und genau einem Moshe, Thema zypern, Texte', () => {
  const m = MISSION_BY_ID.rabino;
  assert.equal(MISSIONS.at(-1), m);
  assert.deepEqual([m.name, m.place, m.theme, m.reinforce, m.needsItem, m.stealMs, m.loot], ['Rabino Empire HQ', 'Limassol, Zypern', 'zypern', 'berater', 'investmentcode', 6000, 'q-sack']);
  assert.deepEqual(m.objective, { type: 'steal', min: 3, label: 'Geldsäcke zurückholen' });
  assert.ok(THEMES.zypern && THEMES.zypern.cover === 'desk' && THEMES.zypern.wall === 'office');
  assert.match(m.intro, /Impressum stand Limassol/);
  assert.match(m.hint, /6 s/);
  assert.equal(m.texts.video[0], 'Diese 3 Trcks verschweigen dir die Banken');
  assert.equal(m.texts.video.length, 6);
  assert.equal(m.layouts.length, 2);
  assert.deepEqual(m.layouts.map(l => l.id), ['grossraum', 'nacht']);
  for (const l of m.layouts) {
    assert.equal(l.variants.length, 2, l.id);
    for (const v of l.variants) {
      const s = buildSetup(m, { layoutId: l.id, variantId: v.id });
      assert.equal(s.map.join('').split('C').length - 1, 6, `${l.id}/${v.id}: 6 Tresore`);
      assert.equal(v.enemies.filter(e => e.type === 'moshe').length, 1, `${l.id}/${v.id}: ein Moshe`);
      assert.ok(v.enemies.every(e => e.type === 'moshe' || e.type === 'berater'), `${l.id}/${v.id}: nur Moshe und Berater`);
      assert.ok(s.map.some(r => r.includes('W')), `${l.id}: Meer am Rand`);
      assert.ok(s.map.some(r => r.includes('T')), `${l.id}: Palmen`);
    }
  }
  // Startplattform 9 Felder (Koop) in jeder Karte
  for (const l of m.layouts) assert.equal(l.map.join('').split('P').length - 1, 9, l.id);
  // needsItem sperrt und entsperrt: ohne Buch 0, Kauf setzt 1, Verkauf (items auf 0) sperrt wieder; das Buch ist ein Shop-Eintrag
  assert.ok(SHOP.some(i => i.id === m.needsItem));
  const s = emptySaveV3();
  s.sats = 10_000;
  assert.equal(s.items[m.needsItem], 0, 'gesperrt');
  assert.deepEqual(buyItem(s, m.needsItem), { ok: true });
  assert.ok(s.items[m.needsItem] >= 1, 'frei');
  s.items[m.needsItem] = 0;
  assert.ok(!(s.items[m.needsItem] >= 1), 'wieder gesperrt');
});

test('v12 §4: Gegner berater und moshe: Werte, catches video, Videodreh (coffee), Beschriftungen, Sprüche ohne Zielgruppe', () => {
  const b = ENEMY_TYPES.berater, mo = ENEMY_TYPES.moshe;
  assert.deepEqual([b.sight, b.angle, b.speed, b.hp, b.dps, b.sprite, b.catches], [6, 70, 2.4, 60, 5, 'q-berater', undefined]);
  assert.ok(b.lines.sus.includes('Haben Sie kurz Zeit?') && b.lines.alert.includes('Ein Interessent!'));
  assert.deepEqual([mo.name, mo.sight, mo.angle, mo.speed, mo.hp, mo.sprite, mo.catches], ['Moshe Hillel', 6, 70, 2.2, 150, 'q-moshe', 'video']);
  assert.deepEqual(mo.coffee, ENEMY_TYPES.bernd.coffee, 'Videodreh läuft wie Stefans Kaffeepause');
  assert.deepEqual(mo.labels, { crash: '+1 Video', panik: 'ANGEBOT!', insider: 'Code?' });
  for (const k of ['coffee', 'buzz', 'crash', 'panik', 'insider', 'task', 'taskEnd', 'heard']) assert.ok(mo.lines[k]?.length, k);
  // Kieser-Zähler und Stefan bleiben unberührt
  assert.equal(ENEMY_TYPES.bernd.catches, 'kieser');
});

test('v12 §4: Tresor knacken dauert 6 s (stealMs), sonst 3 s; Säcke landen wie Münzen', () => {
  const st = Q([]), u = st.units[0], vault = st.objs[0];
  place(u, 9, 6);
  let ev = run(st, 5950, [{ type: 'interact', unit: 0, obj: vault.id }]);
  assert.equal(find(ev, 'interactStart').ms, 6000);
  assert.ok(!has(ev, 'steal'));
  ev = run(st, 100);
  assert.equal(find(ev, 'steal').coins, 1);
  assert.equal(u.carry, 1);
  const plain = Q([], { stealMs: undefined });
  place(plain.units[0], 9, 6);
  assert.equal(find(run(plain, 50, [{ type: 'interact', unit: 0, obj: 0 }]), 'interactStart').ms, 3000);
});

test('v12 §4: Moshe erwischt: Event video mit eigenem Zähler, Pause bis resume, Kieser bleibt 0; Debug catch; Ende und questResult ziehen je Video 1.000 ab', () => {
  const st = Q([{ type: 'moshe', at: [12, 4], dir: 180 }], { team: ['christian', 'micha'] });
  const [c] = st.units, mo = st.enemies[0];
  mo.coffeeAt = Infinity;
  place(c, 11, 4);
  let ev = run(st, 1000);
  const v = find(ev, 'video');
  assert.deepEqual([v.unit, v.enemy, v.count], [0, 0, 1]);
  assert.ok(ENEMY_TYPES.moshe.lines.alert.includes(v.say));
  assert.ok(!has(ev, 'kieser'));
  assert.deepEqual([st.paused, st.videos, st.kieser], ['video', 1, 0]);
  const t0 = st.time;
  assert.deepEqual(run(st, 1000, [{ type: 'move', unit: 0, to: { x: 5, y: 5 } }]), [], 'Pause: Befehle und Zeit stehen');
  assert.equal(st.time, t0);
  ev = qtick(st, 0, [{ type: 'resume' }]);
  const r = find(ev, 'resumed');
  assert.deepEqual([r.reason, r.unit, st.paused], ['video', 0, null]);
  assert.equal(tileAt(st, c.x, c.y), 'P');
  assert.equal(c.hp, c.maxHp);
  assert.deepEqual([mo.x, mo.y, mo.state], [12.5, 4.5, 'patrol']);
  // zweites Video: Debug „Moshe ruft“ (catch) nimmt den ersten Fänger
  ev = qtick(st, 50, [{ type: 'catch' }]);
  assert.equal(find(ev, 'video').count, 2);
  assert.equal(st.videos, 2);
  qtick(st, 0, [{ type: 'resume' }]);
  st.delivered = 3; qtick(st, 50);
  ev = run(st, 100, [{ type: 'extract' }]);
  const end = find(ev, 'end');
  assert.deepEqual([end.result, end.videos, end.kieser, end.summary.videos, end.summary.kieser], ['success', 2, 0, 2, 0]);
  assert.equal(questSummary(st).videos, 2);
  // app.js: questResult(save, id, result, score, alarmFree, { videos }) → 3 Säcke 1.500 + 2.000 − 2 × 1.000
  const s = emptySaveV3();
  assert.equal(questResult(s, 'rabino', end.result, end.summary.score, end.summary.alarmFree, { kieser: end.summary.kieser, videos: end.summary.videos }).sats, 1500);
  // Aufgeben geht in der Pause
  const s2 = Q([{ type: 'moshe', at: [12, 4], dir: 180 }]);
  s2.enemies[0].coffeeAt = Infinity;
  place(s2.units[0], 11, 4);
  run(s2, 1000);
  assert.equal(s2.paused, 'video');
  assert.equal(find(qtick(s2, 50, [{ type: 'abort' }]), 'end').result, 'abort');
});

test('v12 §4: Moshe dreht alle 20–30 s ein Video (Kegel aus), danach 10 s koffeiniert', () => {
  const st = Q([{ type: 'moshe', at: [10, 4], dir: 180 }]), e = st.enemies[0];
  place(st.units[0], 17, 8);
  assert.ok(e.coffeeAt >= 20_000 && e.coffeeAt <= 30_000);
  let ev = run(st, Math.ceil(e.coffeeAt / 50) * 50);
  const c = find(ev, 'coffee');
  assert.deepEqual([c.phase, c.ms], ['start', 5000]);
  assert.ok(ENEMY_TYPES.moshe.lines.coffee.includes(c.say));
  assert.equal(e.state, 'coffee');
  assert.deepEqual(visibleCone(st, 0), []);
  place(st.units[0], 9, 4); // direkt vor der Kamera: er sieht nichts
  ev = run(st, 4000);
  assert.ok(!has(ev, 'suspicious') && !has(ev, 'video'));
  place(st.units[0], 17, 8);
  ev = run(st, 1100);
  assert.ok(has(ev, 'coffee', x => x.phase === 'end'));
  assert.equal(find(ev, 'caffeinated').ms, 10_000);
  assert.ok(ENEMY_TYPES.moshe.lines.buzz.includes(find(ev, 'caffeinated').say));
});

// ---------- §2 Engine: Investment-Code nimmt echte Sats (js/battle.js), Requisiten fliegen in der Warnzeit (js/battle-ui.js) ----------
import { makeFighter, makeBoss, createBattle, tick } from '../js/battle.js';
import { RUETHER_BY_ID } from '../js/data.js';
import { bossHitMs } from '../js/battle-ui.js';

// Kampf gegen Moshe ohne schnelle Angriffe und ohne Zeitlimit; der Rüther hält alles aus
const M = (sats, rng = () => 0.5) => {
  const f = makeFighter(RUETHER_BY_ID.christian); f.btc = f.maxBtc = 100_000;
  const s = createBattle({ team: [f], enemy: makeBoss(BOSSES.moshe), rng, duration: 1e9, sats });
  s.enemy.nextFastAt = Infinity;
  return s;
};
// Nächster Investment-Code bis zum Einschlag (50-ms-Schritte): treffen, normal ausweichen (beim Start der Warnung) oder perfekt
// (in den letzten DODGE_PERFECT ms). Liefert alle Events
function code(s, dodge = null) {
  s.enemy.chargedIndex = 0; s.enemy.nextChargedAt = s.time + 2000;
  const ev = [];
  for (let i = 0; i < 100; i++) {
    const w = s.enemy.warning;
    const now = w && !w.dodged && dodge && (dodge === 'normal' || w.firesAt - s.time <= CONST.DODGE_PERFECT);
    const e = tick(s, 50, now ? { dodge: true } : {});
    ev.push(...e);
    if (e.some(x => x.type === 'enemyAttack')) return ev;
  }
  throw new Error('kein Einschlag');
}
const lost = ev => ev.find(e => e.type === 'satsLost');

test('v12 §2: Treffer nimmt min(max, floor(pct × Rest)), satsLost zählt, Ausweichen (normal und perfekt) rettet die Sats', () => {
  const s = M(20_000);
  assert.deepEqual([s.sats, s.satsLost], [20_000, 0]);
  let ev = code(s);
  const hit = ev.find(e => e.type === 'enemyAttack');
  assert.deepEqual([hit.attack.name, hit.dodged, hit.damage], ['Investment-Code', false, 15]);
  assert.deepEqual(lost(ev), { type: 'satsLost', amount: 500, note: IMMOBILIEN[6] }); // rng konstant: Reihenfolge bleibt, pop nimmt die letzte
  assert.equal(s.satsLost, 500);
  assert.ok(IMMOBILIEN.includes(lost(ev).note));
  ev = code(s, 'normal'); // 25 % Schaden, aber kein Geld
  assert.deepEqual([ev.find(e => e.type === 'enemyAttack').dodged, ev.find(e => e.type === 'enemyAttack').perfect, ev.find(e => e.type === 'enemyAttack').damage], [true, false, 3]);
  assert.equal(lost(ev), undefined);
  ev = code(s, 'perfect');
  assert.deepEqual([ev.find(e => e.type === 'enemyAttack').perfect, ev.find(e => e.type === 'enemyAttack').damage], [true, 0]);
  assert.equal(lost(ev), undefined);
  assert.equal(s.satsLost, 500);
  // der Rest schrumpft mit: 3000 → 300, dann 2700 → 270
  const t = M(3000);
  assert.equal(lost(code(t)).amount, 300);
  assert.equal(lost(code(t)).amount, 270);
  assert.equal(t.satsLost, 570);
  assert.equal(createBattle({ team: [makeFighter(RUETHER_BY_ID.christian)], enemy: makeBoss(BOSSES.ps3) }).sats, 0, 'Standard 0');
});

test('v12 §2: unter min nur „Ratenzahlung" (0 Sats, keine Immobilie); Immobilien ohne Wiederholung, bis alle durch sind', () => {
  const poor = M(49);
  assert.deepEqual(lost(code(poor)), { type: 'satsLost', amount: 0, note: 'Dann eben Ratenzahlung.' });
  assert.equal(poor.satsLost, 0);
  const edge = M(50);
  assert.equal(lost(code(edge)).amount, 5);
  assert.ok(IMMOBILIEN.includes(lost(code(M(50))).note));
  let k = 0;
  const s = M(1_000_000, () => ((k += 7) % 10) / 10);
  const notes = Array.from({ length: 7 }, () => lost(code(s)).note);
  assert.equal(new Set(notes).size, 7, 'sieben verschiedene');
  assert.deepEqual([...notes].sort(), [...IMMOBILIEN].sort());
  assert.notDeepEqual(notes, [...IMMOBILIEN].reverse(), 'Reihenfolge per rng');
  assert.ok(IMMOBILIEN.includes(lost(code(s)).note), 'danach von vorn');
  assert.equal(s.satsLost, 8 * 500);
});

test('v12 §2: Buch, Vertrag, Handy fliegen sichtbar und schlagen vor dem Feuern ein', () => {
  for (const a of [BOSSES.moshe.fast, ...BOSSES.moshe.charged]) assert.ok(bossHitMs(a) > 0 && bossHitMs(a) <= a.warn, `${a.name}: ${bossHitMs(a)} / ${a.warn} ms`);
});
