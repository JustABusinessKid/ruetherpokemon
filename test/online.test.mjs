import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonical, clean, validate, merge, toAppState, loadState, emptyState, readBus,
  newKeyJwk, signerFromJwk, makeMessage, nameTaken, FEED_MAX, MSG_MAX_BYTES, DUP_WINDOW_MS,
} from '../js/online-merge.js';
import { createOnline, onlineConfig, SYNC_MIN_MS } from '../js/online.js';
import { runSync, STALE_MS } from '../tools/online-sync.mjs';
import { ONLINE, ARENAS } from '../js/data.js';

const signer = async () => signerFromJwk(await newKeyJwk());
const SYNC = { nickname: 'Sebi', avatar: 'micha', sats: 500, dex: 4, trophies: 2, mastered: 1, level: 3, xp: 90, leader: { id: 'micha', rarity: 'selten', level: 7 } };
const LEADER = { id: 'viktor', rarity: 'episch', level: 12 };
// ntfy-Zeile wie bei GET /<topic>/json?poll=1
const line = (msg, time = 1) => JSON.stringify({ id: 'x' + time, time, event: 'message', topic: 't', message: JSON.stringify(msg) });
const items = msgs => msgs.map((msg, i) => ({ time: 100 + i, msg }));

test('online: kanonisches JSON ist sortiert und stabil', () => {
  assert.equal(canonical({ b: 1, a: { d: [1, { y: 2, x: 'ü' }], c: null }, u: undefined }), '{"a":{"c":null,"d":[1,{"x":"ü","y":2}]},"b":1}');
});

test('online: echte Signatur gültig, jede Manipulation ungültig', async () => {
  const s = await signer(), other = await signer();
  const m = await makeMessage(s, 'sync', clean('sync', SYNC));
  assert.ok(await validate(m));
  assert.equal(m.id.length, 43);
  assert.equal(await validate({ ...m, d: { ...m.d, sats: 999_999 } }), null, 'd verändert');
  assert.equal(await validate({ ...m, t: m.t + 1 }), null, 't verändert');
  assert.equal(await validate({ ...m, k: 'event' }), null, 'k verändert');
  assert.equal(await validate({ ...m, pub: other.pub }), null, 'pub passt nicht zur id');
  assert.equal(await validate({ ...m, pub: other.pub, id: other.id }), null, 'fremder Schlüssel');
  assert.equal(await validate({ ...m, sig: m.sig.slice(0, -2) + (m.sig.endsWith('AA') ? 'BB' : 'AA') }), null, 'Signatur kaputt');
  assert.equal(await validate({ ...m, v: 2 }), null);
  assert.equal(await validate({ ...m, pub: '!'.repeat(87) }), null, 'kein base64url');
  assert.equal(await validate('quatsch'), null);
  // Zukunft: mehr als 5 Minuten vor
  const future = await makeMessage(s, 'sync', clean('sync', SYNC), Date.now() + 10 * 60_000);
  assert.equal(await validate(future), null);
  // zu groß (auch korrekt signiert)
  const big = await makeMessage(s, 'event', { kind: 'catch', text: 'x'.repeat(MSG_MAX_BYTES) });
  assert.equal(await validate(big), null);
});

test('online: Schema wie die alte API', async () => {
  assert.equal(clean('sync', { ...SYNC, nickname: ' a ' }), null, 'Nickname zu kurz');
  const c = clean('sync', { ...SYNC, nickname: 'Sebi\u0000\u202e  der\nGroße und noch mehr', avatar: 'satoshi', sats: -5, dex: 99, mastered: 42, leader: { id: 'satoshi', rarity: 'x', level: 3 }, token: 'geheim' });
  assert.equal(c.nickname, 'Sebi der Große u');
  assert.equal(c.avatar, 'christian');
  assert.equal(c.sats, 0);
  assert.equal(c.dex, 20);
  assert.equal(c.mastered, ARENAS.length);
  assert.equal(c.leader, null);
  assert.equal('token' in c, false);
  assert.deepEqual(clean('sync', { ...SYNC, leader: { ...LEADER, level: 99 } }).leader, { ...LEADER, level: 20 });
  assert.deepEqual(clean('arena', { arenaId: 'neuschwabenland', level: 9, leader: LEADER }), { arenaId: 'neuschwabenland', level: 5, leader: LEADER });
  assert.equal(clean('arena', { arenaId: 'mond', level: 1, leader: LEADER }), null);
  assert.equal(clean('arena', { arenaId: 'constructor', level: 1, leader: { id: 'toString', rarity: 'constructor', level: 1 } }), null, 'Prototyp-Schlüssel');
  assert.equal(clean('sync', { ...SYNC, avatar: '__proto__' }).avatar, 'christian');
  assert.equal(Object.keys(loadState({ players: { __proto__: SYNC, constructor: SYNC } }).players).length, 0);
  assert.equal(clean('arena', { arenaId: 'keller', level: 1, leader: null }), null);
  assert.equal(clean('event', { kind: 'arena', text: 'hat alles erobert' }), null, 'arena-Events erzeugt nur der Merge');
  assert.equal(clean('event', { kind: 'catch', text: 'ab' }), null);
  assert.equal(clean('event', { kind: 'catch', text: 'y'.repeat(300) }).text.length, 120);
  // signiert, aber Schema falsch → abgelehnt
  const s = await signer();
  assert.equal(await validate(await makeMessage(s, 'event', { kind: 'spam', text: 'hallo welt' })), null);
  assert.equal(await validate(await makeMessage(s, 'sync', { nickname: 'x' })), null);
});

test('online: Merge-Regeln (sync, Nickname gehört der ersten id, arena, event)', async () => {
  const a = await signer(), b = await signer();
  const t0 = Date.now() - 60_000;
  const msgs = [
    await makeMessage(a, 'sync', clean('sync', SYNC), t0),
    await makeMessage(b, 'sync', clean('sync', { ...SYNC, nickname: 'sebi', trophies: 99 }), t0 + 1), // gleicher Name, andere id
    await makeMessage(b, 'arena', clean('arena', { arenaId: 'keller', level: 2, leader: LEADER }), t0 + 2), // unbekannt → ignoriert
    await makeMessage(a, 'arena', clean('arena', { arenaId: 'keller', level: 3, leader: LEADER }), t0 + 3),
    await makeMessage(a, 'event', clean('event', { kind: 'catch', text: 'hat einen legendären Viktor gefangen!' }), t0 + 4),
  ];
  const s = merge(emptyState(), items(msgs));
  assert.deepEqual(Object.keys(s.players), [a.id]);
  assert.equal(s.players[a.id].trophies, 2);
  assert.equal(s.arenas.keller.ownerId, a.id);
  assert.equal(s.arenas.keller.level, 3);
  assert.equal(s.events.length, 2);
  assert.equal(s.events[0].text, 'hat einen legendären Viktor gefangen!');
  assert.equal(s.events[1].text, 'hat Keller der Rütherschanze erobert (Lv. 3).');
  assert.equal(s.lastMsgTime, 104);
  // idempotent: Snapshot + Bus überlappen
  assert.deepEqual(merge(s, items(msgs)), s);
  // b nimmt einen freien Namen und wirft a aus der Arena
  const more = [
    await makeMessage(b, 'sync', clean('sync', { ...SYNC, nickname: 'Bea' }), t0 + 5),
    await makeMessage(b, 'arena', clean('arena', { arenaId: 'keller', level: 4, leader: LEADER }), t0 + 6),
    await makeMessage(a, 'arena', clean('arena', { arenaId: 'keller', level: 5, leader: LEADER }), t0 + 2), // älter als der Besitz → ignoriert
  ];
  const s2 = merge(s, items(more));
  assert.equal(s2.arenas.keller.ownerId, b.id);
  assert.equal(s2.events[0].text, 'hat Keller der Rütherschanze erobert (Lv. 4) und Sebi rausgeworfen.');
  assert.equal(s2.events[0].nickname, 'Bea');
  // ältere sync überschreibt nicht
  const old = merge(s2, [{ msg: await makeMessage(a, 'sync', clean('sync', { ...SYNC, sats: 1 }), t0 - 1) }]);
  assert.equal(old.players[a.id].sats, 500);
  assert.equal(old.lastMsgTime, s2.lastMsgTime, 'ohne time bleibt lastMsgTime');
});

test('online: Altspieler wird von der neuen id übernommen (inkl. Arenen)', async () => {
  const seed = loadState(JSON.parse(await readFile(new URL('../online/state.seed.json', import.meta.url), 'utf8')));
  assert.ok(Object.keys(seed.players).every(id => id.startsWith('legacy:')));
  assert.ok(!JSON.stringify(seed).includes('token'));
  const legacy = Object.keys(seed.players)[0], nick = seed.players[legacy].nickname;
  const n = await signer();
  const s = merge(seed, items([await makeMessage(n, 'sync', clean('sync', { ...SYNC, nickname: nick.toUpperCase() }))]));
  assert.equal(s.players[legacy], undefined);
  assert.equal(s.players[n.id].nickname, nick.toUpperCase());
  for (const [aid, a] of Object.entries(seed.arenas)) if (a.ownerId === legacy) assert.equal(s.arenas[aid].ownerId, n.id);
  // danach gehört der Name der neuen id: ein Dritter kommt nicht mehr dran
  const x = await signer();
  const s2 = merge(s, items([await makeMessage(x, 'sync', clean('sync', { ...SYNC, nickname: nick }))]));
  assert.equal(s2.players[x.id], undefined);
});

test('online: Feed hält die letzten 50, toAppState liefert die alte Form', async () => {
  const a = await signer();
  const now = Date.now();
  const msgs = [await makeMessage(a, 'sync', clean('sync', SYNC), now - 120_000)];
  for (let i = 0; i < 60; i++) msgs.push(await makeMessage(a, 'event', { kind: 'level', text: `Event Nummer ${i}` }, now - 60_000 + i));
  const s = merge(emptyState(), items(msgs));
  assert.equal(s.events.length, FEED_MAX);
  assert.equal(s.events[0].text, 'Event Nummer 59');
  s.players['legacy:Alt'] = { ...clean('sync', { ...SYNC, nickname: 'Alt', trophies: 50 }), t: now - 11 * 60_000 };
  const st = toAppState(s, now);
  assert.deepEqual(Object.keys(st).sort(), ['arenas', 'feed', 'leaderboard', 'nameTaken', 'now', 'ok', 'online']);
  assert.equal(st.online, 1);
  assert.deepEqual(st.leaderboard.map(p => [p.nickname, p.online]), [['Alt', false], ['Sebi', true]]);
  assert.deepEqual(Object.keys(st.leaderboard[0]).sort(), ['avatar', 'dex', 'leader', 'level', 'mastered', 'me', 'nickname', 'online', 'sats', 'trophies']);
  assert.deepEqual(Object.keys(st.feed[0]).sort(), ['at', 'kind', 'nickname', 'text']);
});

test('online: readBus prüft jede Zeile, ungültige zählen nur für lastMsgTime', async () => {
  const a = await signer();
  const good = await makeMessage(a, 'sync', clean('sync', SYNC));
  const text = [line(good, 10), '{kaputt', JSON.stringify({ event: 'open', time: 11 }), line({ ...good, t: good.t + 5 }, 12), ''].join('\n');
  const r = await readBus(text);
  assert.deepEqual(r.map(x => [x.time, !!x.msg]), [[10, true], [12, false]]);
  assert.equal(merge(emptyState(), r).lastMsgTime, 12);
});

test('online: onlineConfig – lokal offline, Test-Topic ohne Snapshot, echtes Topic nur auf dem Host', () => {
  const loc = (href) => new URL(href);
  assert.equal(onlineConfig(loc('http://localhost:8000/')), null);
  assert.equal(onlineConfig(loc('http://127.0.0.1:8000/?online=1')), null, 'altes ?online=1 schaltet nicht mehr das echte Topic frei');
  assert.equal(onlineConfig(loc(`http://localhost:8000/?online=${ONLINE.topic}`)), null, 'echtes Topic nie lokal');
  assert.deepEqual(onlineConfig(loc('http://localhost:8000/?online=ruether-go-test-abc123')), { ...ONLINE, topic: 'ruether-go-test-abc123', snapshotUrl: null });
  assert.equal(onlineConfig(loc('https://justabusinesskid.github.io/ruetherpokemon/')), ONLINE);
});

// ---------- Client mit gemocktem fetch ----------
function fakeNet({ snapshot = null, bus = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body, keepalive: !!opts.keepalive });
    if (url.startsWith('https://snap.test/')) return snapshot ? new Response(JSON.stringify(snapshot)) : new Response('nope', { status: 404 });
    if (opts.method === 'POST') { bus.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ id: 'n', time: 1 })); }
    return new Response(bus.map((m, i) => line(m, 1000 + i)).join('\n'));
  };
  return calls;
}
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const CFG = { topic: 'ruether-go-test-unit', bus: 'https://bus.test', snapshotUrl: 'https://snap.test/state.json' };

test('online-Client: offline ohne Konfiguration, keine Netzaufrufe', async () => {
  const calls = fakeNet();
  const o = createOnline({ config: null, getPayload: () => SYNC });
  assert.equal(await o.fetchState(), null);
  assert.equal(await o.syncNow(), null);
  assert.equal(await o.claimArena('keller', 2, LEADER), null);
  assert.equal(await o.postEvent('catch', 'hat was gefangen'), null);
  assert.equal(o.available, false);
  assert.equal(calls.length, 0);
});

test('online-Client: Snapshot + Bus zusammenführen, eigene Nachrichten sofort sichtbar', async () => {
  const seed = JSON.parse(await readFile(new URL('../online/state.seed.json', import.meta.url), 'utf8'));
  const other = await signer();
  const bus = [await makeMessage(other, 'sync', clean('sync', { ...SYNC, nickname: 'Fremder', trophies: 1 }))];
  const calls = fakeNet({ snapshot: { ...seed, lastMsgTime: 999 }, bus });
  let states = 0;
  const o = createOnline({ config: CFG, getPayload: () => ({ ...SYNC, token: 'nie-senden' }), onState: () => states++ });
  const st = await o.fetchState();
  assert.ok(st && o.available);
  assert.match(calls[0].url, /^https:\/\/snap\.test\/state\.json\?t=\d+$/);
  assert.equal(calls[1].url, 'https://bus.test/ruether-go-test-unit/json?poll=1&since=969');
  assert.ok(st.leaderboard.some(p => p.nickname === 'Fremder' && p.online));
  assert.ok(st.leaderboard.some(p => p.nickname === seed.players[Object.keys(seed.players)[0]].nickname));
  assert.ok(Object.keys(st.arenas).length >= 1);
  assert.equal(st.online, 1);
  // Arena erobern: sync zuerst, dann arena; beide signiert auf dem Bus, ohne Token
  await o.syncNow();
  const after = await o.claimArena('worringen', 4, LEADER);
  assert.equal(after.arenas.worringen.owner, 'Sebi');
  assert.match(after.feed[0].text, /Rütherschanze Worringen erobert \(Lv\. 4\)/);
  const posts = calls.filter(c => c.method === 'POST');
  assert.deepEqual(posts.map(c => c.url), ['https://bus.test/ruether-go-test-unit', 'https://bus.test/ruether-go-test-unit']);
  for (const p of posts) { assert.ok(await validate(JSON.parse(p.body))); assert.ok(!p.body.includes('nie-senden')); }
  // der Bus liefert die eigenen Nachrichten noch mal: Stand bleibt gleich (idempotent)
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 6000 }); // Poll-Drossel (5 s) überspringen
  const again = await o.fetchState().finally(() => mock.timers.reset());
  assert.deepEqual(again.arenas, after.arenas);
  assert.equal(again.feed.length, after.feed.length);
  assert.ok(states >= 3);
  // nach 15 Minuten wird der Snapshot neu geladen (Action-Stand gilt)
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 16 * 60_000 });
  await o.fetchState().finally(() => mock.timers.reset());
  assert.equal(calls.filter(c => c.url.startsWith('https://snap.test/')).length, 2);
  // gleicher Schlüssel beim nächsten Start (localStorage)
  assert.ok(store.get('ruether-go-key'));
});

test('online-Client: Fehler still → offline, Snapshot fehlt → nur Bus', async () => {
  globalThis.fetch = async () => { throw new Error('kein Netz'); };
  const o = createOnline({ config: CFG, getPayload: () => SYNC });
  assert.equal(await o.fetchState(), null);
  assert.equal(o.available, false);
  assert.equal(await o.syncNow(), null);
  const calls = fakeNet({ snapshot: null, bus: [] });
  const st = await o.fetchState();
  assert.ok(st);
  assert.equal(calls[1].url, 'https://bus.test/ruether-go-test-unit/json?poll=1&since=12h');
});

test('online-Client: sync höchstens alle 5 Minuten und nur bei Änderung, arena/event sofort', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  try {
    const calls = fakeNet();
    let p = { ...SYNC };
    const o = createOnline({ config: CFG, getPayload: () => p });
    const posts = () => calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body));
    await o.syncNow();
    assert.equal(posts().length, 1);
    await o.syncNow(); // unverändert
    p = { ...p, sats: 600 };
    await o.syncNow(); // geändert, aber zu früh → später
    assert.equal(posts().length, 1);
    await o.postEvent('catch', 'hat einen legendären Micha gefangen!');
    await o.claimArena('pcsale', 1, LEADER);
    assert.deepEqual(posts().map(m => m.k), ['sync', 'event', 'arena']);
    p = { ...p, sats: 700 };
    assert.equal(SYNC_MIN_MS, 5 * 60_000, '250 Nachrichten am Tag pro IP bei ntfy.sh');
    mock.timers.tick(SYNC_MIN_MS - 1);
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    assert.equal(posts().length, 3, 'vor Ablauf nichts');
    mock.timers.tick(1); // nachgereicht, mit dem dann aktuellen Stand
    for (let i = 0; i < 20 && posts().length < 4; i++) await new Promise(r => setImmediate(r));
    assert.deepEqual(posts().map(m => m.k), ['sync', 'event', 'arena', 'sync']);
    assert.equal(posts()[3].d.sats, 700);
    mock.timers.tick(2 * SYNC_MIN_MS);
    await o.syncNow(); // unverändert → nichts
    assert.equal(posts().length, 4);
  } finally {
    mock.timers.reset();
  }
});

test('online-sync (Action): Seed beim ersten Lauf, schreibt nur bei Änderung', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rgo-sync-'));
  const statePath = join(dir, 'state.json');
  const a = await signer();
  const bus = [await makeMessage(a, 'sync', clean('sync', SYNC)), await makeMessage(a, 'event', clean('event', { kind: 'quest', text: 'hat den Tachionenraub geschafft!' }))];
  const calls = fakeNet({ bus });
  assert.equal((await runSync({ statePath, bus: 'https://bus.test', topic: 'ruether-go-test-unit' })).changed, true);
  assert.equal(calls[0].url, 'https://bus.test/ruether-go-test-unit/json?poll=1&since=12h');
  const s = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(s.lastMsgTime, 1001);
  assert.equal(s.players[a.id].nickname, 'Sebi');
  assert.ok(Object.keys(s.players).some(id => id.startsWith('legacy:')), 'Startstand übernommen');
  const m1 = (await stat(statePath)).mtimeMs;
  assert.equal((await runSync({ statePath, bus: 'https://bus.test', topic: 'ruether-go-test-unit' })).changed, false);
  assert.equal(calls[1].url, 'https://bus.test/ruether-go-test-unit/json?poll=1&since=971');
  assert.equal((await stat(statePath)).mtimeMs, m1);
  // Zurücksetzen: leere state.json → leerer Stand (+ die letzten 12 h vom Bus)
  await writeFile(statePath, '');
  assert.equal((await runSync({ statePath, bus: 'https://bus.test', topic: 'ruether-go-test-unit' })).changed, true);
  const r = JSON.parse(await readFile(statePath, 'utf8'));
  assert.deepEqual(Object.keys(r.players), [a.id]);
});

// ---------- Audit-Fixes ----------
test('online: Arena-Meldung ohne Änderung (gleicher Besitzer, gleiches Level) und doppelte Events lässt der Merge weg', async () => {
  const a = await signer(), b = await signer();
  const t0 = Date.now() - 3600_000;
  const claim = (s, lv, t) => makeMessage(s, 'arena', clean('arena', { arenaId: 'keller', level: lv, leader: LEADER }), t);
  const ev = (s, text, t) => makeMessage(s, 'event', clean('event', { kind: 'achievement', text }), t);
  const s = merge(emptyState(), items([
    await makeMessage(a, 'sync', clean('sync', SYNC), t0),
    await makeMessage(b, 'sync', clean('sync', { ...SYNC, nickname: 'Bea' }), t0),
    await claim(a, 5, t0 + 1), await claim(a, 5, t0 + 2), await claim(a, 5, t0 + 3), // Farmen in der eigenen Arena
    await ev(a, 'hat Keller der Rütherschanze gemeistert!', t0 + 4), await ev(a, 'hat Keller der Rütherschanze gemeistert!', t0 + 5),
    await ev(b, 'hat Keller der Rütherschanze gemeistert!', t0 + 6), // anderer Spieler darf denselben Text
  ]));
  assert.equal(s.arenas.keller.since, t0 + 1, '„seit“ bleibt beim ersten Sieg');
  assert.deepEqual(s.events.map(e => [e.nickname, e.kind]), [['Bea', 'achievement'], ['Sebi', 'achievement'], ['Sebi', 'arena']]);
  // echte Änderungen erzeugen weiter Einträge: Rauswurf und Rückeroberung mit gleichem Text
  const s2 = merge(s, items([await claim(b, 5, t0 + 7), await claim(a, 5, t0 + 8), await claim(b, 5, t0 + 9)]));
  assert.equal(s2.arenas.keller.ownerId, b.id);
  assert.equal(s2.events.filter(e => e.kind === 'arena').length, 4);
  // gleicher Text nach mehr als 24 h kommt wieder in den Feed
  const s3 = merge(s2, items([await ev(a, 'hat Keller der Rütherschanze gemeistert!', t0 + 4 + DUP_WINDOW_MS)]));
  assert.equal(s3.events[0].text, 'hat Keller der Rütherschanze gemeistert!');
  assert.equal(s3.events[0].nickname, 'Sebi');
});

test('online: mine/me hängen an der Kennung, nameTaken wenn der Name einer anderen Kennung gehört', async () => {
  const a = await signer(), b = await signer();
  const s = merge(emptyState(), items([
    await makeMessage(a, 'sync', clean('sync', SYNC)),
    await makeMessage(b, 'sync', clean('sync', SYNC)), // zweites Gerät, gleicher Name → verworfen
    await makeMessage(a, 'arena', clean('arena', { arenaId: 'pcsale', level: 2, leader: LEADER })),
  ]));
  s.players['legacy:Opa'] = { ...clean('sync', { ...SYNC, nickname: 'Opa' }), t: 1 };
  const forA = toAppState(s, Date.now(), { id: a.id, nickname: 'Sebi' }), forB = toAppState(s, Date.now(), { id: b.id, nickname: 'sebi' });
  assert.equal(forA.arenas.pcsale.mine, true);
  assert.equal(forB.arenas.pcsale.mine, false, 'gleicher Name, aber fremde Kennung');
  assert.equal(forA.leaderboard.find(p => p.nickname === 'Sebi').me, true);
  assert.equal(forB.leaderboard.some(p => p.me), false);
  assert.equal(forA.nameTaken, false);
  assert.equal(forB.nameTaken, true);
  assert.equal(nameTaken(s, b.id, 'Opa'), false, 'Altspieler-Namen übernimmt die neue id');
  assert.equal(nameTaken(s, undefined, 'Sebi'), false, 'ohne eigene Kennung kein Fehlalarm');
  assert.equal(toAppState(s).arenas.pcsale.mine, false);
});

test('online-Client: Kennung wandert mit exportKey/importKey aufs neue Gerät', async () => {
  store.clear();
  const calls = fakeNet();
  const o1 = createOnline({ config: CFG, getPayload: () => SYNC });
  assert.equal(o1.exportKey(), null, 'noch kein Schlüssel');
  await o1.syncNow();
  const key = o1.exportKey(), id = o1.id;
  assert.equal(id.length, 43);
  assert.equal(JSON.parse(key).d.length, 43);
  // neues Gerät: leerer Speicher, Import, dann gleiche Kennung auf dem Bus
  store.clear();
  const o2 = createOnline({ config: CFG, getPayload: () => ({ ...SYNC, sats: 1 }) });
  assert.equal(o2.importKey('{kaputt'), false);
  assert.equal(o2.importKey({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'c' }), false);
  assert.equal(store.size, 0);
  assert.equal(o2.importKey(key), true);
  await o2.syncNow();
  const posts = calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body));
  assert.deepEqual(posts.map(m => m.id), [id, id]);
  assert.equal(o2.id, id);
  assert.equal(o2.nameTaken, false);
  // ohne Import: neue Kennung, Name vergeben → Hinweis
  store.clear();
  const o3 = createOnline({ config: CFG, getPayload: () => SYNC });
  await o3.syncNow();
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 6000 });
  await o3.fetchState().finally(() => mock.timers.reset());
  assert.notEqual(o3.id, id);
  assert.equal(o3.nameTaken, true);
  assert.equal(o3.lastState.nameTaken, true);
  const before = calls.length;
  assert.ok(await o3.postEvent('catch', 'hat einen legendären Micha gefangen!'));
  assert.equal(calls.filter((c, i) => i >= before && c.method === 'POST').length, 0, 'würde ohnehin verworfen: nicht senden');
});

test('online-Client: zwei gleichzeitige erste Nachrichten nutzen denselben Schlüssel', async () => {
  store.clear();
  const calls = fakeNet();
  const o = createOnline({ config: CFG, getPayload: () => SYNC });
  await Promise.all([o.syncNow(), o.postEvent('catch', 'hat einen legendären Micha gefangen!'), o.postEvent('level', 'ist Trainer Lv. 5 geworden!')]);
  const ids = new Set(calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body).id));
  assert.equal(ids.size, 1);
  assert.equal(JSON.parse(store.get('ruether-go-key')).x.length, 43);
});

test('online-Client: Sieg in der eigenen Arena auf gleichem Level und doppelte Events werden nicht gesendet', async () => {
  store.clear();
  const calls = fakeNet();
  const o = createOnline({ config: CFG, getPayload: () => SYNC });
  const posts = () => calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body).k);
  await o.syncNow();
  await o.claimArena('keller', 5, LEADER);
  await o.claimArena('keller', 5, LEADER); // nochmal gewonnen
  await o.postEvent('achievement', 'hat Keller der Rütherschanze gemeistert!');
  await o.postEvent('achievement', 'hat Keller der Rütherschanze gemeistert!');
  assert.deepEqual(posts(), ['sync', 'arena', 'event']);
  assert.equal(o.lastState.arenas.keller.mine, true);
  // jemand anderes hat sie inzwischen (vor dem Senden wird gepollt): dann wieder senden
  const other = await signer();
  const later = Date.now() + 6000;
  const net = fakeNet({ bus: [await makeMessage(other, 'sync', clean('sync', { ...SYNC, nickname: 'Bea' }), later), await makeMessage(other, 'arena', clean('arena', { arenaId: 'keller', level: 5, leader: LEADER }), later)] });
  mock.timers.enable({ apis: ['Date'], now: later + 1 });
  try {
    const r = await o.claimArena('keller', 5, LEADER);
    assert.equal(r.arenas.keller.mine, true);
    assert.deepEqual(net.filter(c => c.method === 'POST').map(c => JSON.parse(c.body).k), ['arena']);
  } finally { mock.timers.reset(); }
});

test('online-Client: Umbenennen sendet sofort (force), ausstehender sync geht beim Verlassen der App raus', async () => {
  store.clear();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.document = doc;
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  try {
    const calls = fakeNet();
    let p = { ...SYNC };
    const o = createOnline({ config: CFG, getPayload: () => p });
    const posts = () => calls.filter(c => c.method === 'POST');
    await o.syncNow();
    await o.fetchState();
    mock.timers.tick(10);
    p = { ...p, nickname: 'Sebastian' };
    await o.syncNow({ force: true });
    assert.equal(posts().length, 2, 'Name sofort online');
    assert.equal(JSON.parse(posts()[1].body).d.nickname, 'Sebastian');
    assert.equal(o.lastState.leaderboard.find(x => x.me).nickname, 'Sebastian');
    // geändert, Rate-Limit → nachreichen; App geht vor Ablauf in den Hintergrund
    p = { ...p, sats: 900 };
    await o.syncNow();
    assert.equal(posts().length, 2);
    doc.dispatchEvent(new Event('visibilitychange')); // noch sichtbar: nichts
    mock.timers.tick(59_000);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 300; i++) await new Promise(r => setImmediate(r));
    assert.equal(posts().length, 2, 'höchstens einmal pro Minute');
    mock.timers.tick(1000);
    doc.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 500 && posts().length < 3; i++) await new Promise(r => setImmediate(r));
    assert.equal(posts().length, 3);
    assert.equal(JSON.parse(posts()[2].body).d.sats, 900);
    assert.deepEqual(posts().map(c => c.keepalive), [false, false, true], 'überlebt das Schließen der Seite');
    mock.timers.tick(SYNC_MIN_MS);
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    assert.equal(posts().length, 3, 'der Timer ist erledigt, kein zweites Senden');
  } finally {
    mock.timers.reset();
    delete globalThis.document;
  }
});

test('online-Client: älterer oder gleicher Snapshot ersetzt den gemergten Stand nicht', async () => {
  store.clear();
  const other = await signer();
  const busMsgs = [await makeMessage(other, 'sync', clean('sync', { ...SYNC, nickname: 'Bea' }))];
  const calls = fakeNet({ snapshot: { ...emptyState(), lastMsgTime: 500 }, bus: busMsgs });
  const o = createOnline({ config: CFG, getPayload: () => SYNC });
  await o.fetchState();
  assert.ok(o.lastState.leaderboard.some(p => p.nickname === 'Bea'));
  busMsgs.length = 0; // ntfy hat sie nicht mehr (12 h um), die Action hängt
  mock.timers.enable({ apis: ['Date'], now: Date.now() + 16 * 60_000 });
  try {
    await o.fetchState();
    assert.equal(calls.filter(c => c.url.startsWith('https://snap.test/')).length, 2);
    assert.ok(o.lastState.leaderboard.some(p => p.nickname === 'Bea'), 'nichts weggeworfen');
    assert.match(calls.at(-1).url, /since=970$/, 'Bus ab dem eigenen Stand, nicht ab dem alten Snapshot');
  } finally { mock.timers.reset(); }
});

test('online-sync (Action): meldet, wie lange Nachrichten ungemergt liegen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rgo-lag-'));
  const statePath = join(dir, 'state.json');
  await writeFile(statePath, JSON.stringify({ ...emptyState(), lastMsgTime: 1000 }));
  const a = await signer();
  const bus = [await makeMessage(a, 'sync', clean('sync', SYNC)), await makeMessage(a, 'event', clean('event', { kind: 'quest', text: 'hat den Tachionenraub geschafft!' }))];
  fakeNet({ bus }); // Bus-Zeiten 1000 (schon gemergt, Überlappung) und 1001
  const now = 1001_000 + STALE_MS + 1;
  const chk = await runSync({ statePath, bus: 'https://bus.test', topic: 'ruether-go-test-unit', now: now - 1, write: false });
  assert.deepEqual(chk, { changed: false, lagMs: STALE_MS });
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).lastMsgTime, 1000, '--check schreibt nichts');
  const run = await runSync({ statePath, bus: 'https://bus.test', topic: 'ruether-go-test-unit', now });
  assert.deepEqual(run, { changed: true, lagMs: STALE_MS + 1 });
  assert.equal((await runSync({ statePath, bus: 'https://bus.test', topic: 'ruether-go-test-unit', now })).lagMs, 0, 'danach alles gemergt');
});

test('online-sync (CLI): --check endet mit Fehler, wenn der Stand über 10 h hinter dem Bus hängt', async () => {
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  const a = await signer();
  const msg = await makeMessage(a, 'sync', clean('sync', SYNC));
  let busTime = Math.floor(Date.now() / 1000) - 11 * 3600;
  const srv = createServer((req, res) => res.end(line(msg, busTime))).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const dir = await mkdtemp(join(tmpdir(), 'rgo-cli-'));
  const statePath = join(dir, 'state.json');
  await writeFile(statePath, '{}');
  const script = fileURLToPath(new URL('../tools/online-sync.mjs', import.meta.url));
  const env = { ...process.env, ONLINE_BUS: `http://127.0.0.1:${srv.address().port}`, ONLINE_TOPIC: 'ruether-go-test-unit' };
  const cli = () => new Promise(r => execFile(process.execPath, [script, statePath, '--check'], { env }, (err, out) => r({ code: err?.code ?? 0, out })));
  try {
    const stale = await cli();
    assert.equal(stale.code, 1);
    assert.match(stale.out, /::error::Online-Stand hängt 11\.0 h/);
    assert.equal(await readFile(statePath, 'utf8'), '{}', '--check schreibt nichts');
    busTime = Math.floor(Date.now() / 1000) - 600;
    assert.equal((await cli()).code, 0);
  } finally { srv.close(); }
});
