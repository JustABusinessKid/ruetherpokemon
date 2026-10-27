import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONST } from '../js/data.js';
import { emptySaveV3, migrate, buyItem, summonCost, dexCount, sell, newUid } from '../js/progress.js';

// Fixes aus dem Technik-Audit (Kern): Spielstand zwischen Tabs, Prüfung beim Laden/Import, offene Beschwörung, Ortungstext, Audio

// ---------- localStorage-Attrappe (vor dem Import von storage.js) ----------
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (globalThis.localStorage.full) throw new Error('QuotaExceededError'); mem.set(k, String(v)); },
  removeItem: k => mem.delete(k),
};
const storage = await import('../js/storage.js');

test('Tabs: ein anderer Tab hat gespeichert → changed, erst nach load wieder still; save meldet volles localStorage', () => {
  mem.clear();
  const a = storage.load();
  assert.equal(storage.changed(), false);
  a.sats = 100;
  assert.equal(storage.save(a), true);
  assert.equal(storage.changed(), false, 'eigenes Speichern zählt nicht');
  mem.set(storage.KEY, JSON.stringify({ ...a, sats: 5000 })); // Tab B speichert
  assert.equal(storage.changed(), true);
  assert.equal(storage.load().sats, 5000, 'Stand von Tab B übernommen');
  assert.equal(storage.changed(), false);
  localStorage.full = true;
  assert.equal(storage.save({ ...a, sats: 1 }), false);
  localStorage.full = false;
  assert.equal(storage.load().sats, 5000, 'gescheitertes Speichern ändert nichts');
  storage.clear(true);
  assert.equal(mem.get(storage.KEY), undefined);
  assert.equal(JSON.parse(mem.get('ruether-go-backup')).sats, 5000, 'Zurücksetzen aus dem Fehler-Splash hebt eine Kopie auf');
  assert.equal(storage.changed(), false);
});

test('Laden/Import: kaputte Felder werden bereinigt statt die App lahmzulegen', () => {
  const s = migrate({
    version: 3, dex: null, sats: 'x', xp: -5, trainerLevel: 0, team: ['r2', 'r2', 'r9', 7, 'r1', 'r3'],
    box: [null, 5, { uid: 'r1', id: 'christian', rarity: 'episch', level: 99 }, { uid: 'r1', id: 'viktor', rarity: 'quatsch', level: '3' },
      { id: 'micha', rarity: 'normal', level: 1 }, { uid: 'r2', id: 'gibtsnicht' }, { uid: 'r3', id: 'constructor' }, { uid: 'r2', id: 'ramona', level: null }],
    arenaLevels: { pcsale: '4', keller: 9, nirgendwo: 3 }, arenaMastered: [], arenaOwners: { pcsale: 'r1', keller: 5 },
    stats: { arenaWins: '2', catches: null }, items: null, quests: { date: 'x', list: [null, { id: 'q', progress: 0 }] }, profile: 'Sebi',
  });
  assert.deepEqual(s.dex, {});
  assert.equal(dexCount(s), 0);
  assert.equal(s.sats, 0);
  assert.equal(s.xp, 0);
  assert.equal(s.trainerLevel, 1);
  assert.deepEqual(s.box.map(i => [i.id, i.rarity, i.level]), [['christian', 'episch', CONST.LEVEL_MAX], ['viktor', 'normal', 3], ['micha', 'normal', 1], ['ramona', 'normal', 1]]);
  const uids = s.box.map(i => i.uid);
  assert.equal(new Set(uids).size, uids.length, 'jede uid nur einmal');
  assert.equal(uids[0], 'r1');
  assert.ok(s.nextUid > Math.max(...uids.map(u => +u.slice(1))), 'nextUid liegt über allen rN');
  assert.ok(!uids.includes(newUid(s)), 'neue uid kollidiert nicht');
  assert.deepEqual(s.team, ['r2', 'r1'].filter(u => uids.includes(u)), 'Team: eindeutig, nur vorhandene, höchstens TEAM_SIZE');
  assert.deepEqual(s.arenaLevels, { pcsale: 4, keller: CONST.ARENA_LEVELS });
  assert.deepEqual(s.arenaMastered, {});
  assert.deepEqual(s.arenaOwners, { pcsale: 'r1' });
  assert.equal(s.stats.arenaWins, 2);
  assert.equal(s.stats.catches, 0);
  s.stats.arenaWins += 1;
  assert.equal(s.stats.arenaWins, 3, 'Zahl, kein String-Anhängen');
  assert.deepEqual(s.items, { lockmodul: 0, supercoin: 0, investmentcode: 0 }); // v12: + Investment-Code
  assert.deepEqual(s.quests.list, [{ id: 'q', progress: 0 }]);
  assert.equal(s.profile, null);
  // Doppelte uid: Verkaufen nimmt nur noch ein Exemplar mit
  const d = migrate({ version: 3, box: [{ uid: 'r1', id: 'viktor', rarity: 'normal', level: 1 }, { uid: 'r1', id: 'viktor', rarity: 'normal', level: 1 }], team: [] });
  assert.equal(sell(d, d.box[1].uid).ok, true);
  assert.equal(d.box.length, 1);
  // Gültiger Stand bleibt unverändert
  const ok = migrate({ version: 3, box: [{ uid: 'r4', id: 'hildegard', rarity: 'selten', level: 7, caughtAt: 5 }], team: ['r4'], nextUid: 5, sats: 1234, dex: { 'hildegard:selten': true } });
  assert.deepEqual(ok.box, [{ uid: 'r4', id: 'hildegard', rarity: 'selten', level: 7, caughtAt: 5 }]);
  assert.deepEqual(ok.team, ['r4']);
  assert.equal(ok.nextUid, 5);
  assert.equal(ok.sats, 1234);
  assert.equal(dexCount(ok), 1);
  assert.deepEqual(migrate(structuredClone(ok)), ok, 'Neuladen ändert nichts');
});

test('Haunebu: bezahlte Beschwörung bleibt als summonPending im Spielstand, bis der Kampf entschieden ist', () => {
  const s = Object.assign(emptySaveV3(), { sats: 50_000 });
  assert.equal(s.summonPending, 0);
  const cost = summonCost(s);
  assert.equal(buyItem(s, 'haunebu', 1000).ok, true);
  assert.equal(s.summonPending, cost, 'Betrag zum Erstatten');
  const again = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(again.summonPending, cost, 'übersteht Neuladen');
  for (const bad of ['x', -3, null, NaN]) assert.equal(migrate({ ...s, summonPending: bad }).summonPending, 0);
});

test('Ortung: Text je Fehlercode, Ablehnung auch nach erster Position, clearFake nennt den letzten Fehler', async () => {
  const { geoHint, createLocator } = await import('../js/geo.js');
  assert.match(geoHint({ code: 1 }), /Erlaube sie/);
  assert.match(geoHint(new Error('Keine Ortung verfügbar')), /Ortung aus/);
  assert.equal(geoHint({ code: 2 }), 'Suche GPS-Signal …');
  assert.equal(geoHint({ code: 3 }), 'Suche GPS-Signal …');
  let ok = null, fail = null;
  const geolocation = { watchPosition: (a, b) => { ok = a; fail = b; return 1; }, clearWatch() {} };
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { geolocation }, configurable: true });
  globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
  try {
    const errs = [], seen = [];
    const loc = createLocator({ onPosition: p => seen.push(p), onError: e => errs.push(e.code) });
    loc.clearFake();
    assert.deepEqual(errs, [3], 'noch keine Antwort: wie Timeout, nicht „erlaube“');
    fail({ code: 3 });
    assert.deepEqual(errs, [3, 3]);
    ok({ coords: { latitude: 50, longitude: 7, accuracy: 5 } });
    fail({ code: 3 });
    assert.deepEqual(errs, [3, 3], 'Timeout mit Position: kein Banner');
    fail({ code: 1 });
    assert.deepEqual(errs, [3, 3, 1], 'später entzogene Erlaubnis wird gemeldet');
    assert.equal(loc.current, null);
    loc.setFake({ lat: 1, lon: 1 });
    loc.clearFake();
    assert.deepEqual(errs, [3, 3, 1, 1]);
  } finally {
    Object.defineProperty(globalThis, 'navigator', nav);
    delete globalThis.document;
  }
});

test('Audio: vor dem ersten Tipp weder AudioContext noch Töne noch Vibrieren', async () => {
  let made = 0, oscs = 0, vibs = 0;
  const node = () => ({ connect: n => n, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  globalThis.AudioContext = class { constructor() { made += 1; this.state = 'running'; this.currentTime = 0; this.destination = {}; } createOscillator() { oscs += 1; return node(); } createGain() { return node(); } resume() { return Promise.resolve(); } };
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => { vibs += 1; } }, configurable: true });
  try {
    const { sfx, haptic } = await import('../js/audio.js');
    sfx.play('wave'); sfx.play('ufo'); haptic(30);
    assert.deepEqual([made, oscs, vibs], [0, 0, 0], 'nichts staut sich vor der ersten Geste');
    sfx.unlock();
    assert.equal(made, 1);
    sfx.play('click'); haptic(30);
    assert.deepEqual([oscs, vibs], [1, 1]);
  } finally {
    Object.defineProperty(globalThis, 'navigator', nav);
    delete globalThis.AudioContext;
  }
});
