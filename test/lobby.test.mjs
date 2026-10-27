// v11 Lobby (Spec Mehrspieler §0/§2): start und pick vom Partner sind Daten von außen. Geprüft werden nur die reinen Prüfer;
// Bildschirm und Ablauf deckt der Zwei-Fenster-Playtest ab (README „Zusammen spielen ohne Netz“).
import test from 'node:test';
import assert from 'node:assert/strict';

// Kleines Ersatz-DOM: ui.js greift beim Laden zu, createLobby baut Markup und hört auf Klicks (Ablauf-Test unten)
function fakeEl() {
  const kids = new Map(), on = {};
  return {
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, style: {}, dataset: {}, children: [], firstChild: null,
    querySelector: sel => (kids.has(sel) ? kids.get(sel) : kids.set(sel, fakeEl()).get(sel)), querySelectorAll: () => [],
    addEventListener: (t, f) => { (on[t] ||= []).push(f); }, removeEventListener() {}, appendChild() {}, remove() {}, setAttribute() {}, focus() {},
    click(cls) { for (const f of on.click || []) f({ target: { closest: () => ({ disabled: false, dataset: {}, classList: { contains: c => c === cls } }) } }); },
  };
}
globalThis.document ??= { getElementById: () => fakeEl(), querySelector: () => fakeEl(), createElement: () => fakeEl(), addEventListener() {}, hidden: false };
globalThis.location ??= { search: '' };
const { cleanPicks, cleanStart, createLobby, appOnly } = await import('../js/lobby.js');
const { createLink, PROTO } = await import('../js/net/link.js');
const { MISSION_BY_ID, pickSetup } = await import('../js/quest/missions.js');

const pick = (id, extra = {}) => ({ uid: `u-${id}`, id, rarity: 'selten', level: 5, loadout: null, ...extra });

test('cleanPicks: unbekannte id raus, Seltenheit und Level begrenzt, höchstens max', () => {
  const out = cleanPicks([pick('christian'), pick('hitler'), { id: 'viktor', rarity: 'gold', level: 99 }, null, 'x', pick('micha', { level: -3 }), pick('ramona')], 3);
  assert.deepEqual(out.map(p => [p.id, p.rarity, p.level]), [['christian', 'selten', 5], ['viktor', 'normal', 20], ['micha', 'selten', 1]]);
  assert.equal(cleanPicks('kaputt').length, 0);
  const lo = cleanPicks([pick('micha', { loadout: [{ id: 'controller', level: 2 }, { id: 'x', level: 7 }, 'y', { id: 'z', level: 1 }] })])[0].loadout;
  assert.deepEqual(lo, [{ id: 'controller', level: 2 }, null, null]); // höchstens 3, Stufe 1–3; ob es zum Rüther passt, prüft createQuest
});

test('cleanStart: gültiger Start kommt durch, kaputte Teile machen ihn ungültig', () => {
  const m = MISSION_BY_ID.tachionenraub, setup = pickSetup(m, () => 0.3);
  const base = { t: 'start', mode: 'coop', missionId: m.id, setup, seed: 12345, teams: { host: [pick('christian'), pick('viktor'), pick('micha')], guest: [pick('hildegard')] },
    names: { host: { name: 'Sebi', avatar: 'christian' }, guest: { name: 'Papa'.repeat(20), avatar: 'gibtsnicht' } } };
  const g = cleanStart(base);
  assert.equal(g.mission, m);
  assert.deepEqual(g.setup, { layoutId: setup.layoutId, variantId: setup.variantId, mirror: setup.mirror, seed: setup.seed });
  assert.equal(g.teams.host.length, 2); // Koop: höchstens 2 je Spieler
  assert.equal(g.names.guest.name.length, 24);
  assert.equal(g.names.guest.avatar, 'christian');
  assert.equal(cleanStart({ ...base, mode: 'pvp' }), null);
  assert.equal(cleanStart({ ...base, missionId: 'camping' }), null); // Solo-Mission gibt es im Koop nicht
  assert.equal(cleanStart({ ...base, mode: 'race', missionId: 'camping' }), null); // Karte aus einer anderen Mission
  assert.equal(cleanStart({ ...base, mode: 'race', missionId: 'camping', setup: pickSetup(MISSION_BY_ID.camping, () => 0.5) }).mission.id, 'camping');
  assert.equal(cleanStart({ ...base, setup: { ...setup, variantId: 'nope' } }), null);
  assert.equal(cleanStart({ ...base, teams: { host: [pick('hitler')], guest: [pick('micha')] } }), null);
  assert.equal(cleanStart({ ...base, mode: 'duel', missionId: null, setup: null }).mission, null);
  assert.equal(cleanStart({ ...base, seed: 'x' }).seed, 1);
});

// Ablauf über echte local-Links: Gast-Lobby gegen einen Host-Link. Prüft Rundenkennung (seed) und Sieger nach dem Entscheid.
test('Lobby: Moduswechsel kürzt das Team nicht dauerhaft; Rennen wertet nur die eigene Runde und behält den Sieger', async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async f => { for (let i = 0; i < 100 && !f(); i++) await sleep(20); assert.ok(f()); };
  const box = ['christian', 'viktor', 'micha'].map((id, i) => ({ uid: `u${i}`, id, rarity: 'normal', level: 3 }));
  const save = { profile: { nickname: 'Papa', avatar: 'viktor' }, box, team: box.map(i => i.uid), trainerLevel: 2, seen: {} };
  const ev = [], got = [];
  const el = fakeEl();
  const lobby = createLobby({ el, getSave: () => save, persist() {}, onExit() {}, onStart: g => ev.push(['start', g.mode]),
    onRace: r => ev.push(['race', r.done, r.winner]), onRaceDone: r => ev.push(['done', r.winner, r.his?.score]) });
  lobby.open();
  const host = createLink({ kind: 'local', timing: { ADV_MS: 30 } });
  host.on('message', m => got.push(m));
  const spy = new BroadcastChannel('ruether-go-link'), ids = {}; // Transport-Ids, um einen Funkabriss beim Gast zu spielen
  spy.onmessage = e => { if (e.data?.k === 'acc') Object.assign(ids, { host: e.data.from, guest: e.data.to }); };
  try {
    await host.host('Sebi');
    el.click('mp-join');
    await until(() => host.state === 'connected');
    host.send({ t: 'me', name: 'Sebi', avatar: 'christian', level: 5, version: 'v11' });
    const team = () => got.filter(m => m.t === 'pick').at(-1)?.team.length;
    await until(() => team() === 3);
    host.send({ t: 'mode', mode: 'coop', missionId: 'tachionenraub' });
    await until(() => team() === 2);
    host.send({ t: 'mode', mode: 'duel', missionId: null });
    await until(() => team() === 3); // vorher blieb es bei 2

    const m = MISSION_BY_ID.tachionenraub, pick = id => ({ uid: `x-${id}`, id, rarity: 'normal', level: 3, loadout: null });
    host.send({ t: 'start', mode: 'race', missionId: m.id, setup: pickSetup(m, () => 0.3), seed: 7, teams: { host: [pick('ramona')], guest: [pick('micha')] },
      names: { host: { name: 'Sebi', avatar: 'christian' }, guest: { name: 'Papa', avatar: 'viktor' } } });
    await until(() => ev.some(e => e[0] === 'start'));
    host.send({ t: 'rend', seed: 6, result: 'success', score: 2, timeMs: 1000 }); // aus der alten Runde: verworfen
    lobby.raceEnd({ result: 'success', score: 9, timeMs: 5000 });
    await until(() => got.some(x => x.t === 'rend'));
    assert.equal(got.find(x => x.t === 'rend').seed, 7);
    await sleep(60);
    assert.ok(!ev.some(e => e[0] === 'done'), 'altes rend wertet nicht');
    host.send({ t: 'rend', seed: 7, result: 'success', score: 3, timeMs: 2000 });
    await until(() => ev.some(e => e[0] === 'done'));
    assert.deepEqual(ev.find(e => e[0] === 'done'), ['done', 'me', 3]);
    ev.length = 0;
    spy.postMessage({ k: 'bye', from: ids.host, to: ids.guest }); // wie Nearby onDisconnected: lost beim Gast, onRace ohne neuen Entscheid
    await until(() => ev.some(e => e[0] === 'race'));
    assert.ok(ev.filter(e => e[0] === 'race').every(e => e[1] === true && e[2] === 'me'), JSON.stringify(ev));
  } finally {
    el.click('mp-leave');
    await host.close();
    spy.close();
    await sleep(20);
  }
});

test('appOnly: im Browser nur mit ?slot=N der Testmodus, sonst der Weg zur App', () => {
  assert.equal(appOnly('local', ''), true);
  assert.equal(appOnly('local', '?lag=150'), true);
  assert.equal(appOnly('local', '?slot=2'), false);
  assert.equal(appOnly('local', '?online=x&slot=1'), false);
  assert.equal(appOnly('nearby', ''), false);
});

// App (nearby) mit Ersatz-Plugin: Fehler sagen, was zu tun ist, und führen in die Einstellungen; Version sagt, wer aktualisiert
test('Lobby (App): Berechtigung fehlt → Einstellungen öffnen; Verbinden-Toast je Suche einmal; neuere App → Download', async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const made = [], create = document.createElement, byId = document.getElementById, pop = fakeEl();
  document.createElement = () => { const e = fakeEl(); made.push(e); return e; };
  document.getElementById = id => (id === 'popup' ? pop : fakeEl());
  const card = () => pop.querySelector('.popup-card').innerHTML;
  const label = text => made.filter(e => e.textContent === text).at(-1);
  const toasts = text => made.filter(e => String(e.className).startsWith('toast-item') && e.innerHTML.includes(text)).length;
  const calls = [], subs = {};
  const fire = (ev, d) => (subs[ev] || []).slice().forEach(fn => fn(d));
  const plugin = {
    addListener: (ev, fn) => { (subs[ev] ||= []).push(fn); return Promise.resolve({ remove: async () => { subs[ev] = subs[ev].filter(f => f !== fn); } }); },
    join: async o => { calls.push(['join', o]); throw Object.assign(new Error('permission'), { code: 'permission' }); },
    host: async o => { calls.push(['host', o]); }, send: async o => { calls.push(['send', o]); },
    close: async () => { calls.push(['close']); }, keepAwake: async () => {}, openSettings: async o => { calls.push(['openSettings', o]); },
  };
  globalThis.Capacitor = { isPluginAvailable: n => n === 'NearbyLink', Plugins: { NearbyLink: plugin } };
  const save = { profile: { nickname: 'Papa', avatar: 'viktor' }, box: [], team: [], trainerLevel: 1, seen: { nearby: true } };
  const el = fakeEl();
  const lobby = createLobby({ el, getSave: () => save, persist() {}, onExit() {} });
  try {
    lobby.open();
    el.click('mp-join');
    await sleep(20);
    assert.match(card(), /Geräte in der Nähe/);
    assert.ok(label('Später'), 'harmloser Knopf zuerst');
    label('Einstellungen öffnen').click();
    await sleep(0);
    assert.deepEqual(calls.at(-1), ['openSettings', { to: 'app' }]);

    plugin.join = async o => { calls.push(['join', o]); };
    el.click('mp-join');
    await sleep(20);
    assert.match(el.querySelector('.mp-wait-sub').textContent, /App offen lassen/);
    fire('error', { code: 'connect', message: 'STATUS_ERROR' });
    fire('error', { code: 'connect', message: 'STATUS_ERROR' });
    assert.equal(toasts('Verbinden hat nicht geklappt'), 1);

    fire('connected', { id: 'e1', name: 'Sebi', code: '0042' });
    fire('message', { id: 'e1', data: JSON.stringify({ t: 'hello', v: PROTO + 1, name: 'Sebi', sid: 'neu' }) });
    await sleep(20);
    assert.match(card(), /Dein Mitspieler hat eine neuere App/);
    label('App herunterladen').click();
    await sleep(0);
    assert.match(location.href, /releases\/latest\/download\/RuetherGO\.apk$/);
  } finally {
    el.click('mp-leave');
    await sleep(20);
    delete globalThis.Capacitor;
    document.createElement = create;
    document.getElementById = byId;
  }
});
