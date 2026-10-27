import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLink, pickKind, PROTO, TIMING } from '../js/net/link.js';
import { newRoomCode, ROOM_RE, ICE, ROOM_MS, ANSWER_MS, OPEN_MS, SIGNAL_MS } from '../js/net/online.js';
import { ONLINE } from '../js/data.js';

// Node hat BroadcastChannel global. Jeder Test schließt alle Links, sonst bleibt der Prozess offen.
const links = [], chans = [];
afterEach(async () => {
  await Promise.all(links.splice(0).map(l => l.close()));
  chans.splice(0).forEach(c => c.close());
});
// ADV_MS kurz, sonst wartet jeder Beitritt bis zur nächsten Anwerbung
const mk = (o = {}) => { const l = createLink({ kind: 'local', ...o, timing: { ADV_MS: 30, ...o.timing } }); links.push(l); return l; };
const raw = name => { const c = new BroadcastChannel(name); chans.push(c); return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setImmediate(r));
// nächstes Event eines Typs, mit Zeitlimit statt Hänger
const once = (link, type, ms = 2000) => new Promise((res, rej) => {
  const t = setTimeout(() => { off(); rej(new Error('kein ' + type)); }, ms);
  const off = link.on(type, d => { clearTimeout(t); off(); res(d); });
});
const record = (link, types) => {
  const log = [];
  for (const type of types) link.on(type, d => log.push([type, d]));
  return log;
};
async function connect(channel, oa = {}, ob = {}) {
  const a = mk({ channel, ...oa }), b = mk({ channel, ...ob });
  const ca = once(a, 'connected'), cb = once(b, 'connected'), found = once(b, 'peerFound');
  await a.host('Sebi');
  await b.join('Papa');
  return { a, b, ea: await ca, eb: await cb, found: await found };
}

test('link: pickKind nimmt nearby nur mit Plugin', () => {
  assert.equal(pickKind(), 'local');
  globalThis.Capacitor = { isPluginAvailable: n => n === 'NearbyLink' };
  try { assert.equal(pickKind(), 'nearby'); } finally { delete globalThis.Capacitor; }
  assert.deepEqual(TIMING, { PING_MS: 2000, TIMEOUT_MS: 6000, RECONNECT_MS: 60_000, ADV_MS: 1000 });
  assert.equal(PROTO, 2); // v13: Moshe-Picks, v12-Apps bekommen das Versions-Popup
});

test('link: local host/join → beide connected mit Namen und gleichem Code', async () => {
  const { a, b, ea, eb, found } = await connect('t-basic');
  assert.deepEqual(found, { name: 'Sebi' });
  assert.equal(ea.name, 'Papa');
  assert.equal(eb.name, 'Sebi');
  assert.match(ea.code, /^\d{4}$/);
  assert.equal(ea.code, eb.code);
  assert.equal(ea.again, false);
  assert.equal(eb.again, false);
  assert.deepEqual([a.kind, a.role, a.state, a.peer, a.code], ['local', 'host', 'connected', { name: 'Papa' }, ea.code]);
  assert.deepEqual([b.role, b.state, b.peer], ['guest', 'connected', { name: 'Sebi' }]);
});

test('link: Nachrichten hin und zurück, auch mit lag', async () => {
  const { a, b } = await connect('t-msg', { lag: 20 }, { lag: 20 });
  const mb = once(b, 'message');
  assert.equal(a.send({ t: 'me', name: 'Sebi', level: 7, team: [1, 2] }), true);
  assert.deepEqual(await mb, { t: 'me', name: 'Sebi', level: 7, team: [1, 2] });
  const ma = once(a, 'message');
  assert.equal(b.send({ t: 'pick', team: [], ready: true }), true);
  assert.deepEqual(await ma, { t: 'pick', team: [], ready: true });
});

test('link: 100-KB-Nachricht kommt zerlegt heil an, jedes Teil unter 32 KB', async () => {
  const { a, b } = await connect('t-big');
  const spy = raw('t-big'), sizes = [];
  spy.onmessage = e => { if (e.data.k === 'msg' && e.data.data.includes('"_part"')) sizes.push(Buffer.byteLength(e.data.data)); };
  const big = { t: 'qs', s: 'ä"\\😀x'.repeat(20_000), n: 3 }; // Anführungszeichen, Backslash, Surrogatpaare an den Schnitten
  const got = once(b, 'message');
  assert.equal(a.send(big), true);
  assert.deepEqual(await got, big);
  await sleep(20);
  assert.ok(sizes.length >= 13, `${sizes.length} Teile`);
  assert.ok(Math.max(...sizes) < 32_768, `größtes Teil ${Math.max(...sizes)} Byte`);
});

test('link: anderes PROTO → disconnected version, Gast hört auf', async () => {
  const b = mk({ channel: 't-version' });
  const fake = raw('t-version'), seen = [];
  fake.onmessage = e => {
    const m = e.data;
    if (m.to !== 'alt') return;
    if (m.k === 'req') {
      fake.postMessage({ k: 'acc', from: 'alt', to: m.from, code: '0815' });
      fake.postMessage({ k: 'msg', from: 'alt', to: m.from, data: JSON.stringify({ t: 'hello', v: PROTO + 1, name: 'Alt', sid: 'x' }) });
    }
    if (m.k === 'msg') seen.push(JSON.parse(m.data));
  };
  const dis = once(b, 'disconnected');
  await b.join('Papa');
  fake.postMessage({ k: 'adv', from: 'alt', name: 'Alt' });
  assert.deepEqual(await dis, { reason: 'version', theirs: PROTO + 1 }); // die App sagt damit, wer aktualisieren muss
  await sleep(20);
  assert.equal(b.state, 'idle');
  assert.equal(b.peer, null);
  assert.equal(seen[0].t, 'hello');
  assert.equal(seen[0].v, PROTO);
  assert.equal(seen[0].name, 'Papa');
});

test('link: Funkstille → lost → wieder senden → connected again → close → Partner disconnected left', async () => {
  const slow = { PING_MS: 60_000, TIMEOUT_MS: 60_000 };
  const { a, b, eb } = await connect('t-lost', { timing: slow }, { timing: { PING_MS: 60_000, TIMEOUT_MS: 120 } });
  assert.deepEqual(await once(b, 'lost'), { reason: 'timeout' });
  assert.equal(b.state, 'lost');
  assert.equal(b.send({ t: 'x' }), false);
  assert.equal(a.state, 'connected');
  const again = once(b, 'connected'), msg = once(b, 'message');
  a.send({ t: 'hallo' });
  assert.deepEqual(await again, { name: 'Sebi', code: eb.code, again: true });
  assert.deepEqual(await msg, { t: 'hallo' });
  const left = once(b, 'disconnected'), closed = once(a, 'disconnected');
  await a.close();
  assert.deepEqual(await closed, { reason: 'closed' });
  assert.equal(a.state, 'closed');
  assert.deepEqual(await left, { reason: 'left' });
  assert.equal(b.state, 'idle'); // Gast: zurück zum Anfang
});

test('link: Herzschlag hält die Verbindung, Pings sieht die App nie', async () => {
  const { b } = await connect('t-ping', { timing: { PING_MS: 30, TIMEOUT_MS: 60_000 } }, { timing: { PING_MS: 60_000, TIMEOUT_MS: 150 } });
  const log = record(b, ['message', 'lost']);
  await sleep(400);
  assert.equal(b.state, 'connected');
  assert.deepEqual(log, []);
});

test('link: RECONNECT_MS abgelaufen → disconnected timeout; neu gestarteter Partner → closed, dann connected', async () => {
  const { a, b } = await connect('t-recon', { timing: { PING_MS: 60_000, TIMEOUT_MS: 60_000 } },
    { timing: { PING_MS: 60_000, TIMEOUT_MS: 60, RECONNECT_MS: 150 } });
  const la = record(a, ['lost', 'disconnected', 'connected']);
  assert.deepEqual(await once(b, 'disconnected'), { reason: 'timeout' });
  assert.equal(b.state, 'idle');
  await sleep(30);
  assert.equal(a.state, 'lost'); // Gast-Transport ist weg: Gastgeber wirbt wieder an
  assert.deepEqual(la, [['lost', { reason: 'native' }]]);
  const c = mk({ channel: 't-recon' }); // „Partner-App neu gestartet“: neue sid
  const cc = once(c, 'connected'), ca = once(a, 'connected');
  await c.join('Papa');
  assert.equal((await ca).again, false);
  assert.equal((await cc).name, 'Sebi');
  assert.deepEqual(la.slice(1).map(([t, d]) => [t, d.reason ?? d.again]), [['disconnected', 'closed'], ['connected', false]]);
  assert.equal(a.state, 'connected');
});

test('link: send ohne Verbindung liefert false', async () => {
  const l = mk({ channel: 't-none' });
  assert.equal(l.send({ t: 'x' }), false);
  await l.join('Papa');
  assert.equal(l.state, 'joining');
  assert.equal(l.send({ t: 'x' }), false);
});

// Ersatz für Capacitor.Plugins.NearbyLink: zeichnet Aufrufe auf, fire() spielt Plugin-Events
function fakePlugin() {
  const subs = {};
  const p = {
    calls: [],
    fire: (ev, d) => (subs[ev] || []).forEach(fn => fn(d)),
    sent: () => p.calls.filter(c => c[0] === 'send').map(c => JSON.parse(c[1].data)),
    addListener(ev, fn) {
      (subs[ev] ||= []).push(fn);
      return Promise.resolve({ remove: async () => { subs[ev] = subs[ev].filter(f => f !== fn); } });
    },
  };
  for (const m of ['host', 'join', 'send', 'close', 'keepAwake', 'openSettings']) p[m] = async o => { p.calls.push([m, o]); };
  return p;
}
const hello = (sid, name = 'Papa') => ({ id: 'e1', data: JSON.stringify({ t: 'hello', v: PROTO, name, sid }) });

test('link: nearby ruft das Plugin auf, Plugin-Events werden Link-Events', async () => {
  const p = fakePlugin(), l = createLink({ kind: 'nearby', plugin: p });
  links.push(l);
  const log = record(l, ['connected', 'lost', 'disconnected', 'message', 'error', 'peerFound']);
  await l.host('Sebi');
  assert.deepEqual(p.calls[0], ['host', { name: 'Sebi' }]);
  assert.equal(l.state, 'hosting');
  l.keepAwake(true);
  assert.deepEqual(p.calls.at(-1), ['keepAwake', { on: true }]);
  l.openSettings('location');
  assert.deepEqual(p.calls.at(-1), ['openSettings', { to: 'location' }]);

  p.fire('connected', { id: 'e1', name: 'Papa', code: '4711' });
  const h = p.sent()[0];
  assert.deepEqual([h.t, h.v, h.name, typeof h.sid], ['hello', PROTO, 'Sebi', 'string']);
  assert.equal(l.state, 'hosting'); // erst nach dem Hallo verbunden
  p.fire('message', hello('s1'));
  assert.deepEqual(log.shift(), ['connected', { name: 'Papa', code: '4711', again: false }]);
  assert.equal(l.code, '4711');

  assert.equal(l.send({ t: 'me', level: 3 }), true);
  assert.equal(p.calls.at(-1)[1].data, '{"t":"me","level":3}');
  p.fire('message', { id: 'e1', data: '{"t":"pick","team":[]}' });
  p.fire('message', { id: 'e1', data: 'kaputt{' });
  p.fire('message', { id: 'e1', data: '{"t":5}' });
  p.fire('message', { id: 'e1', data: '[1]' });
  p.fire('message', { id: 'e1', data: '{"t":"ping"}' });
  assert.deepEqual(log.splice(0), [['message', { t: 'pick', team: [] }]]);

  // nativ weg → lost, Gastgeber wirbt wieder an; Partner mit neuer sid → closed, dann connected again:false
  p.fire('disconnected', { id: 'e1' });
  assert.deepEqual(log.shift(), ['lost', { reason: 'native' }]);
  assert.equal(l.send({ t: 'x' }), false);
  await tick();
  assert.deepEqual(p.calls.filter(c => c[0] === 'host').length, 2);
  p.fire('connected', { id: 'e2', name: 'Papa', code: '1234' });
  p.fire('disconnected', { id: 'e1' }); // veraltet: gehört zum alten Endpunkt
  p.fire('message', hello('s2'));
  assert.deepEqual(log.splice(0), [['disconnected', { reason: 'closed' }], ['connected', { name: 'Papa', code: '1234', again: false }]]);

  p.fire('error', { code: 'bluetooth', message: 'aus' });
  assert.deepEqual(log.splice(0), [['error', { code: 'bluetooth', message: 'aus' }]]);
  assert.equal(l.state, 'connected');

  await l.close();
  assert.deepEqual(p.sent().at(-1), { t: 'bye' });
  assert.equal(p.calls.at(-1)[0], 'close');
  assert.deepEqual(log.splice(0), [['disconnected', { reason: 'closed' }]]);
});

test('link: nearby Gast sucht nach dem Verlust nur den alten Partner, Fehlercode kommt durch', async () => {
  const p = fakePlugin(), l = createLink({ kind: 'nearby', plugin: p });
  links.push(l);
  const log = record(l, ['peerFound', 'connected', 'error']);
  await l.join('Papa');
  assert.deepEqual(p.calls[0], ['join', { name: 'Papa' }]);
  p.fire('peerFound', { id: 'e1', name: 'Sebi' });
  p.fire('connected', { id: 'e1', name: 'Sebi', code: '0042' });
  p.fire('message', hello('h1', 'Sebi'));
  p.fire('disconnected', { id: 'e1' });
  await tick();
  assert.deepEqual(p.calls.filter(c => c[0] === 'join').at(-1), ['join', { name: 'Papa', peer: 'Sebi' }]);
  p.fire('connected', { id: 'e3', name: 'Sebi', code: '0042' });
  p.fire('message', hello('h1', 'Sebi'));
  assert.deepEqual(log.splice(0), [
    ['peerFound', { name: 'Sebi' }],
    ['connected', { name: 'Sebi', code: '0042', again: false }],
    ['connected', { name: 'Sebi', code: '0042', again: true }],
  ]);
  p.fire('error', { code: 'connect', message: 'x' });
  assert.equal(l.state, 'connected');
  log.splice(0);

  // Start schlägt fehl: Promise mit .code, state 'idle', genau ein error-Event (auch wenn das Plugin zusätzlich eins schickt)
  p.join = async () => { p.fire('error', { code: 'permission', message: 'nein' }); throw new Error('permission'); };
  await assert.rejects(l.join('Papa'), { code: 'permission' });
  assert.equal(l.state, 'idle');
  p.fire('error', { code: 'permission', message: 'nein' });
  assert.deepEqual(log, [['error', { code: 'permission', message: 'permission' }]]);

  const none = createLink({ kind: 'nearby', plugin: null });
  links.push(none);
  await assert.rejects(none.host('Sebi'), { code: 'unavailable' });
});

test('link: Funkstille → nach RETRY_MS wirbt der Gastgeber neu an, ein neu gestarteter Gast kommt sofort rein', async () => {
  const a = mk({ channel: 't-retry', timing: { PING_MS: 60_000, TIMEOUT_MS: 80, RETRY_MS: 60, RECONNECT_MS: 5000 } });
  const fake = raw('t-retry'); // Gast, der nach dem Hallo ohne bye abstürzt (App beendet, Akku leer)
  fake.onmessage = e => {
    const m = e.data;
    if (m.k === 'adv') fake.postMessage({ k: 'req', from: 'tot', to: m.from, name: 'Papa' });
    if (m.k === 'acc' && m.to === 'tot') {
      fake.postMessage({ k: 'msg', from: 'tot', to: m.from, data: JSON.stringify({ t: 'hello', v: PROTO, name: 'Papa', sid: 'alt' }) });
      fake.onmessage = null; // ab jetzt stumm
    }
  };
  const log = record(a, ['lost', 'disconnected', 'connected']);
  const ca = once(a, 'connected');
  await a.host('Sebi');
  await ca;
  assert.deepEqual(await once(a, 'lost'), { reason: 'timeout' });
  const c = mk({ channel: 't-retry' }), cc = once(c, 'connected', 1500), ca2 = once(a, 'connected', 1500);
  await c.join('Papa');
  assert.equal((await cc).name, 'Sebi'); // vorher erst nach RECONNECT_MS
  assert.equal((await ca2).name, 'Papa');
  assert.equal(a.state, 'connected');
  assert.deepEqual(log.map(([t, d]) => [t, d.reason ?? d.again]), [['connected', false], ['lost', 'timeout'], ['disconnected', 'closed'], ['connected', false]]);
});

test('link: nearby Neustart nach dem Verlust scheitert → alle RETRY_MS erneut, Fehler nur einmal', async () => {
  const p = fakePlugin(), l = createLink({ kind: 'nearby', plugin: p, timing: { PING_MS: 40, RETRY_MS: 40, RECONNECT_MS: 5000 } });
  links.push(l);
  const log = record(l, ['lost', 'error', 'connected']);
  await l.host('Sebi');
  p.fire('connected', { id: 'e1', name: 'Papa', code: '4711' });
  p.fire('message', hello('s1'));
  let fails = 2; // Funkmodul startet gerade neu
  p.host = async o => { p.calls.push(['host', o]); if (fails-- > 0) throw Object.assign(new Error('bluetooth'), { code: 'bluetooth' }); };
  p.fire('disconnected', { id: 'e1' });
  await sleep(300);
  assert.equal(p.calls.filter(c => c[0] === 'host').length, 4); // Start, 2 Fehlschläge, dann klappt es (und es bleibt dabei)
  assert.equal(l.state, 'lost');
  assert.deepEqual(log.filter(e => e[0] === 'error'), [['error', { code: 'bluetooth', message: 'bluetooth' }]]);
  p.fire('connected', { id: 'e2', name: 'Papa', code: '4711' });
  p.fire('message', hello('s1'));
  assert.deepEqual(log.at(-1), ['connected', { name: 'Papa', code: '4711', again: true }]);
});

test('link: nearby Funkstille reißt die Verbindung nicht selbst ab, erst nach SILENT_MS startet der Transport neu', async () => {
  const p = fakePlugin(), l = createLink({ kind: 'nearby', plugin: p, timing: { PING_MS: 20, TIMEOUT_MS: 60, RETRY_MS: 20, SILENT_MS: 400, RECONNECT_MS: 5000 } });
  links.push(l);
  const log = record(l, ['lost', 'connected']);
  await l.host('Sebi');
  p.fire('connected', { id: 'e1', name: 'Papa', code: '4711' });
  p.fire('message', hello('s1'));
  assert.deepEqual(await once(l, 'lost'), { reason: 'timeout' }); // JS des Partners steht (Bildschirm aus), Nearby hält die Verbindung
  await sleep(150); // früher: nach RETRY_MS host() → stopAll → Verbindung weg
  assert.equal(p.calls.filter(c => c[0] === 'host').length, 1);
  assert.ok(p.sent().filter(m => m.t === 'ping').length >= 3, 'pingt weiter');
  p.fire('message', { id: 'e1', data: '{"t":"ping"}' }); // Partner wieder da: dieselbe Verbindung, derselbe Code
  assert.deepEqual(log.at(-1), ['connected', { name: 'Papa', code: '4711', again: true }]);
  assert.equal(l.state, 'connected');
  await once(l, 'lost'); // bleibt es still, startet die Hülle nach SILENT_MS doch neu (Nearby meldet sonst disconnected)
  await sleep(450);
  assert.equal(p.calls.filter(c => c[0] === 'host').length, 2);
  assert.equal(l.state, 'lost');
  createLink({ kind: 'local' }).openSettings('app'); // im Browser: nichts zu öffnen, kein Fehler
});

// ---------- online (Spec v13 §4.5 „Ohne Server“): In-Memory-ntfy und Fake-WebRTC, injiziert über net ----------
const BUS = 'https://bus.test';
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await tick(); };
// bis fn() wahr ist, nur über setImmediate (läuft auch mit mock.timers; echte Zeit, weil der Gast 300 ms Presences sammelt)
async function until(fn, what, ms = 3000) {
  for (const end = Date.now() + ms; !fn() && Date.now() < end;) await tick();
  assert.ok(fn(), 'nicht eingetreten: ' + what);
}
function fakeBus() {
  const log = new Map(), subs = new Set(); // topic → Ereignisse; offene Abos
  let n = 0;
  const bus = {
    posts: [], fail: null, slow: 0, refuse: 0, // fail: 'throw' | 429; slow: ms bis zur POST-Antwort (Zustellung sofort); refuse: so viele Abos endgültig ablehnen (wie 429)
    get subs() { return subs.size; },
    msgs: () => bus.posts.map(p => JSON.parse(p.body)),
    replay() { for (const s of subs) for (const e of log.get(s.topic) || []) s.deliver(e); }, // wie ein SSE-Reconnect: Backlog nochmal
    async fetch(url, { method, body } = {}) {
      if (bus.fail === 'throw') throw new TypeError('Failed to fetch');
      const topic = url.slice(BUS.length + 1);
      bus.posts.push({ topic, body, method });
      if (bus.fail) return { ok: false, status: bus.fail, text: async () => '' };
      const e = { id: 'n' + (++n), time: Math.floor(Date.now() / 1000), event: 'message', topic, message: body };
      if (!log.has(topic)) log.set(topic, []);
      log.get(topic).push(e);
      for (const s of subs) if (s.topic === topic) setImmediate(() => s.deliver(e));
      if (bus.slow) await new Promise(r => setTimeout(r, bus.slow));
      return { ok: true, text: async () => '' };
    },
    EventSource: class {
      constructor(url) {
        [, this.topic, this.since] = url.match(/^https:\/\/bus\.test\/([^/]+)\/sse\?since=(\S+)$/);
        if (bus.refuse > 0) { bus.refuse--; this.readyState = 2; setImmediate(() => this.onerror?.()); return; } // Nicht-200: Chromium schließt endgültig
        subs.add(this);
        setImmediate(() => { if (!subs.has(this)) return; this.onopen?.(); for (const e of log.get(this.topic) || []) this.deliver(e); });
      }
      deliver(e) { if (subs.has(this)) this.onmessage?.({ data: JSON.stringify(e) }); }
      close() { subs.delete(this); }
    },
  };
  return bus;
}
function fakeRtc() {
  const offers = new Map(), answers = new Map(); // sdp → pc
  const rtc = { pcs: [], chans: [], sdpPad: 0 };
  let n = 0;
  class Channel {
    constructor(label) { Object.assign(this, { label, readyState: 'connecting', bufferedAmount: 0, peer: null, sent: [] }); rtc.chans.push(this); }
    send(d) { if (this.readyState !== 'open') throw new Error('nicht offen'); this.sent.push(d); const p = this.peer; setImmediate(() => { if (p?.readyState === 'open') p.onmessage?.({ data: d }); }); }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.onclose?.(); const p = this.peer; setImmediate(() => p?.close()); } // Gegenstück nach den schon gesendeten Nachrichten
    open() { if (this.readyState !== 'connecting') return; this.readyState = 'open'; this.onopen?.(); }
  }
  class RTCPeerConnection {
    constructor(cfg) { Object.assign(this, { cfg, connectionState: 'new', iceGatheringState: 'new', localDescription: null, ch: null, pair: null, remotes: [] }); rtc.pcs.push(this); }
    createDataChannel(label) { return this.ch = new Channel(label); }
    async createOffer() { return { type: 'offer', sdp: 'fake-offer-' + (++n) + 'x'.repeat(rtc.sdpPad) }; }
    async createAnswer() { return { type: 'answer', sdp: 'fake-answer-' + (++n) + 'x'.repeat(rtc.sdpPad) }; }
    async setLocalDescription(d) { this.localDescription = d; (d.type === 'offer' ? offers : answers).set(d.sdp, this); this.iceGatheringState = 'complete'; this.onicegatheringstatechange?.(); }
    async setRemoteDescription(d) {
      this.remotes.push(d);
      const other = (d.type === 'offer' ? offers : answers).get(d.sdp);
      if (!other) throw new Error('unbekannte SDP');
      this.pair = other;
      if (d.type === 'offer') return; // Antworter: der Kanal kommt, wenn der Bieter die Answer setzt
      other.pair = this;
      const c = other.ch = new Channel(this.ch.label); c.peer = this.ch; this.ch.peer = c;
      setImmediate(() => {
        other.ondatachannel?.({ channel: c });
        for (const p of [this, other]) { p.connectionState = 'connected'; p.onconnectionstatechange?.(); }
        c.open(); this.ch.open();
      });
    }
    close() { if (this.connectionState === 'closed') return; this.connectionState = 'closed'; this.onconnectionstatechange?.(); this.ch?.close(); }
    fail() { for (const p of [this, this.pair]) if (p && p.connectionState !== 'closed') { p.connectionState = 'failed'; p.onconnectionstatechange?.(); } } // ICE gescheitert, beide Seiten
  }
  rtc.RTCPeerConnection = RTCPeerConnection;
  rtc.guestPc = () => rtc.pcs.findLast(p => p.localDescription?.type === 'offer');
  return rtc;
}
const netOf = (bus, rtc) => ({ fetch: bus.fetch, EventSource: bus.EventSource, RTCPeerConnection: rtc?.RTCPeerConnection, bus: BUS });
const online = (room, bus, rtc, o = {}) => mk({ kind: 'online', room, net: netOf(bus, rtc), ...o });
async function connectOnline(room, bus, rtc, oa = {}, ob = {}) {
  const a = online(room, bus, rtc, oa), b = online(room, bus, rtc, ob);
  const ca = once(a, 'connected'), cb = once(b, 'connected'), found = once(b, 'peerFound');
  await a.host('Sebi');
  await b.join('Papa');
  return { a, b, ea: await ca, eb: await cb, found: await found };
}
const dead = (bus, room, at = Date.now(), name = 'Geist') => bus.fetch(`${BUS}/ruether-go-rtc-${room}`, { method: 'POST', body: JSON.stringify({ t: 'host', tid: 'tot', name, at }) });

test('online: host/join über ntfy-Fake → beide connected, 3 Nachrichten im Raum-Topic, Abos danach zu', async () => {
  const bus = fakeBus(), rtc = fakeRtc(), room = newRoomCode();
  assert.match(room, ROOM_RE);
  const { a, b, ea, eb, found } = await connectOnline(room, bus, rtc);
  assert.deepEqual(found, { name: 'Sebi' });
  assert.deepEqual(ea, { name: 'Papa', code: room, again: false });
  assert.deepEqual(eb, { name: 'Sebi', code: room, again: false });
  assert.deepEqual([a.kind, a.code, b.code, a.peer, b.peer], ['online', room, room, { name: 'Papa' }, { name: 'Sebi' }]);
  const m = bus.msgs();
  assert.deepEqual(m.map(x => x.t), ['host', 'offer', 'answer']);
  assert.ok(bus.posts.every(p => p.topic === `ruether-go-rtc-${room}` && p.method === 'POST'), 'nur das Raum-Topic');
  assert.ok(bus.posts.every(p => Buffer.byteLength(p.body) <= 3500));
  assert.equal(m[1].to, m[0].tid);
  assert.equal(m[2].id, m[1].id);
  assert.deepEqual([m[0].name, m[1].name, m[2].name], ['Sebi', 'Papa', 'Sebi']);
  assert.ok(bus.posts.every(p => !p.topic.includes(ONLINE.topic)), 'nie das Welt-Topic');
  assert.equal(bus.subs, 0);
  assert.deepEqual(rtc.pcs[0].cfg.iceServers, ICE);
  // cb.up erst beim 'open': das Hallo ist die erste Nachricht und ging nicht ins Leere
  assert.equal(JSON.parse(rtc.chans[0].sent[0]).t, 'hello');
  assert.equal(JSON.parse(rtc.chans[1].sent[0]).t, 'hello');
});

test('online: Nachrichten hin und zurück, 100 KB zerlegt in Teile ≤ 8000 Zeichen', async () => {
  const bus = fakeBus(), rtc = fakeRtc();
  const { a, b } = await connectOnline('AAAAAA', bus, rtc);
  const mb = once(b, 'message');
  assert.equal(a.send({ t: 'me', name: 'Sebi', level: 7 }), true);
  assert.deepEqual(await mb, { t: 'me', name: 'Sebi', level: 7 });
  const ma = once(a, 'message');
  assert.equal(b.send({ t: 'pick', team: [], ready: true }), true);
  assert.deepEqual(await ma, { t: 'pick', team: [], ready: true });
  const big = { t: 'qs', s: 'ä"\\😀x'.repeat(20_000), n: 3 };
  const got = once(b, 'message');
  assert.equal(a.send(big), true);
  assert.deepEqual(await got, big);
  const parts = rtc.chans[1].sent.filter(s => s.includes('"_part"'));
  assert.ok(parts.length >= 13 && parts.every(s => Buffer.byteLength(s) < 32_768), `${parts.length} Teile`);
});

test('online: Kanal weg → lost native → neue Presence/Offer → connected again; neuer Host mit anderem Namen wird genommen', async () => {
  const bus = fakeBus(), rtc = fakeRtc(), room = 'BBBBBB';
  const { a, b } = await connectOnline(room, bus, rtc);
  const la = record(a, ['lost', 'connected', 'disconnected', 'error']), lb = record(b, ['lost', 'connected', 'disconnected', 'error']);
  const tid1 = bus.msgs()[0].tid;
  rtc.guestPc().fail();
  await until(() => la.length >= 2 && lb.length >= 2, 'again auf beiden Seiten');
  assert.deepEqual(la, [['lost', { reason: 'native' }], ['connected', { name: 'Papa', code: room, again: true }]]);
  assert.deepEqual(lb, [['lost', { reason: 'native' }], ['connected', { name: 'Sebi', code: room, again: true }]]);
  const m = bus.msgs();
  assert.deepEqual(m.map(x => x.t), ['host', 'offer', 'answer', 'host', 'offer', 'answer']);
  assert.notEqual(m[3].tid, tid1);
  assert.equal(m[4].to, m[3].tid);
  assert.equal(rtc.pcs.filter(p => p.connectionState === 'connected').length, 2); // alte pcs zu, kein doppeltes down
  assert.equal(bus.subs, 0);
  // Host stirbt ohne bye (sein Neustart scheitert), ein anderer Host eröffnet denselben Raum: der Gast nimmt ihn (peer egal)
  bus.fail = 'throw';
  rtc.guestPc().fail();
  await until(() => la.some(e => e[0] === 'error'), 'Host-Neustart scheitert');
  bus.fail = null;
  const c = online(room, bus, rtc);
  await c.host('Mama');
  await until(() => lb.some(e => e[0] === 'connected' && e[1].name === 'Mama'), 'Gast bei Mama');
  assert.deepEqual(lb.slice(2).map(([t, d]) => [t, d.reason ?? d.name]), [['lost', 'native'], ['disconnected', 'closed'], ['connected', 'Mama']]);
  assert.equal(b.peer.name, 'Mama');
  assert.equal(c.state, 'connected');
  assert.equal(a.state, 'lost');
});

test('online: Start-Reject webrtc | offline | signal → idle, genau ein error-Event', async () => {
  const bus = fakeBus(), rtc = fakeRtc(), room = 'CCCCCC';
  const l = mk({ kind: 'online', room, net: { fetch: bus.fetch, EventSource: bus.EventSource, bus: BUS } }); // kein RTCPeerConnection
  const log = record(l, ['error']);
  await assert.rejects(l.host('Sebi'), { code: 'webrtc' });
  assert.equal(l.state, 'idle');
  await assert.rejects(online(room, bus, rtc, { net: { ...netOf(bus, rtc), EventSource: undefined } }).join('Papa'), { code: 'webrtc' });
  const h = online(room, bus, rtc), lh = record(h, ['error']);
  bus.fail = 'throw';
  await assert.rejects(h.host('Sebi'), { code: 'offline' });
  bus.fail = 429;
  await assert.rejects(h.host('Sebi'), { code: 'signal' });
  bus.fail = null;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  try { await assert.rejects(h.host('Sebi'), { code: 'offline' }); } finally { delete globalThis.navigator.onLine; }
  await settle();
  assert.deepEqual([l.state, h.state, bus.subs], ['idle', 'idle', 0]);
  assert.deepEqual(log.map(e => e[1].code), ['webrtc']);
  assert.deepEqual(lh.map(e => e[1].code), ['offline', 'signal', 'offline']);
});

test('online: Gast ohne Presence → nach ROOM_MS error room, Suche läuft weiter', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = fakeBus(), rtc = fakeRtc(), room = 'DDDDDD';
    const b = online(room, bus, rtc), log = record(b, ['error', 'peerFound', 'connected']);
    await b.join('Papa');
    await settle();
    mock.timers.tick(ROOM_MS - 1);
    assert.deepEqual(log, []);
    mock.timers.tick(1);
    assert.deepEqual(log, [['error', { code: 'room', message: 'Kein Spiel mit diesem Code' }]]);
    assert.equal(b.state, 'joining');
    const a = online(room, bus, rtc);
    await a.host('Sebi');
    await settle();
    mock.timers.tick(300); // Presences gesammelt
    await until(() => a.state === 'connected' && b.state === 'connected', 'connected');
    assert.deepEqual(log.slice(1), [['peerFound', { name: 'Sebi' }], ['connected', { name: 'Sebi', code: room, again: false }]]);
  } finally { mock.timers.reset(); }
});

test('online: Offer ohne Answer → nach ANSWER_MS einmal error connect; Fremdes und Altes wird ignoriert', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = fakeBus(), rtc = fakeRtc(), room = 'EEEEEE';
    await dead(bus, room, Date.now() - 2 * 60 * 60_000); // 2 h alt: löst kein Offer aus
    const b = online(room, bus, rtc), log = record(b, ['error', 'peerFound']);
    await b.join('Papa');
    await settle();
    mock.timers.tick(300);
    assert.deepEqual(log, []);
    await dead(bus, room);
    await settle();
    mock.timers.tick(300);
    await until(() => bus.msgs().some(m => m.t === 'offer'), 'Offer');
    assert.deepEqual(log, [['peerFound', { name: 'Geist' }]]);
    const offer = bus.msgs().find(m => m.t === 'offer');
    assert.equal(offer.to, 'tot');
    bus.replay(); // doppelte ntfy-ids (SSE-Reconnect): kein zweites Offer
    await bus.fetch(`${BUS}/ruether-go-rtc-${room}`, { method: 'POST', body: JSON.stringify({ t: 'answer', id: 'fremd', name: 'X', sdp: offer.sdp, at: Date.now() }) });
    await settle();
    assert.equal(bus.msgs().filter(m => m.t === 'offer').length, 1);
    assert.deepEqual(rtc.guestPc().remotes, [], 'Answer mit fremder id nicht gesetzt');
    mock.timers.tick(ANSWER_MS);
    assert.deepEqual(log.at(-1), ['error', { code: 'connect', message: 'Keine Antwort' }]);
    assert.equal(rtc.guestPc().connectionState, 'closed');
    mock.timers.tick(2 * ANSWER_MS);
    assert.equal(log.filter(e => e[0] === 'error').length, 1);
    assert.equal(b.state, 'joining');
    // Host: Offer mit fremdem to bekommt keine Answer
    const a = online(room, bus, rtc);
    await a.host('Sebi');
    await settle();
    await bus.fetch(`${BUS}/ruether-go-rtc-${room}`, { method: 'POST', body: JSON.stringify({ t: 'offer', id: 'o9', to: 'jemand', name: 'X', sdp: 'kaputt', at: Date.now() }) });
    await settle();
    assert.equal(bus.msgs().filter(m => m.t === 'answer' && m.name === 'Sebi').length, 0);
    assert.equal(rtc.pcs.length, 1, 'Host baut keine pc');
  } finally { mock.timers.reset(); }
});

test('online: Host nach left → neue Presence, neue tid, selber Raum; Gast-stop schließt Abo und pc', async () => {
  const bus = fakeBus(), rtc = fakeRtc(), room = 'FFFFFF';
  const { a, b } = await connectOnline(room, bus, rtc);
  const left = once(a, 'disconnected');
  await b.close();
  assert.deepEqual(await left, { reason: 'left' });
  await until(() => bus.msgs().filter(m => m.t === 'host').length === 2, 'neue Presence');
  await settle(); // Abo kommt nach dem POST
  const [p1, , , p2] = bus.msgs();
  assert.notEqual(p1.tid, p2.tid);
  assert.ok(bus.posts.every(p => p.topic === `ruether-go-rtc-${room}`));
  assert.equal(a.state, 'hosting');
  assert.equal(bus.subs, 1);
  const g = online(room, bus, rtc);
  await g.join('Papa');
  await until(() => rtc.guestPc()?.localDescription, 'Offer gebaut');
  assert.equal(bus.subs, 2);
  await g.close();
  assert.equal(bus.subs, 1);
  assert.equal(rtc.guestPc().connectionState, 'closed');
});

test('online: Body über 3500 Byte geht als Teile (t:c) und kommt zusammengesetzt an', async () => {
  const bus = fakeBus(), rtc = fakeRtc();
  rtc.sdpPad = 5000;
  const { a, b } = await connectOnline('GGGGGG', bus, rtc);
  assert.equal(a.state, 'connected');
  const m = bus.msgs();
  assert.deepEqual(m.map(x => x.t), ['host', 'c', 'c', 'c', 'c']);
  assert.deepEqual(m.slice(1).map(x => [x.k, x.n]), [[0, 2], [1, 2], [0, 2], [1, 2]]);
  assert.ok(bus.posts.every(p => Buffer.byteLength(p.body) <= 3500));
  assert.equal(rtc.pcs[1].remotes[0].sdp.length > 5000, true);
  assert.equal(b.state, 'connected');
});

test('online: send verwirft still bei vollem oder geschlossenem Kanal; SILENT_MS gilt auch für online', async () => {
  const bus = fakeBus(), rtc = fakeRtc();
  const { a, b } = await connectOnline('HHHHHH', bus, rtc, { timing: { PING_MS: 60_000, TIMEOUT_MS: 60_000 } },
    { timing: { PING_MS: 60_000, TIMEOUT_MS: 80, RETRY_MS: 20, SILENT_MS: 400, RECONNECT_MS: 5000 } });
  const ch = rtc.chans[0], n = ch.sent.length;
  ch.bufferedAmount = 256 * 1024;
  assert.equal(b.send({ t: 'x' }), true);
  ch.bufferedAmount = 0; ch.readyState = 'closed';
  assert.equal(b.send({ t: 'y' }), true);
  assert.equal(ch.sent.length, n);
  ch.readyState = 'open';
  assert.deepEqual(await once(b, 'lost'), { reason: 'timeout' }); // Host schweigt: kein Neustart vor SILENT_MS
  await sleep(150);
  assert.equal(bus.msgs().length, 3);
  assert.equal(b.state, 'lost');
  await sleep(700); // SILENT_MS um: Abo neu, Offer auf die alte Presence
  assert.equal(bus.msgs().filter(m => m.t === 'offer').length, 2);
  assert.equal(a.state, 'connected');
});

test('online: Answer-POST langsamer als der Kanal → der OPEN_MS-Wächter wirft die offene Verbindung nicht weg', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = fakeBus(), rtc = fakeRtc(), room = 'JJJJJJ';
    const a = online(room, bus, rtc), b = online(room, bus, rtc);
    const la = record(a, ['lost']), lb = record(b, ['lost']);
    await a.host('Sebi');
    await b.join('Papa');
    await settle();
    mock.timers.tick(300); // Presence gesammelt → Offer
    await until(() => bus.msgs().some(m => m.t === 'offer'), 'Offer');
    bus.slow = 1000; // der Gast bekommt die Answer per SSE sofort, die POST-Antwort an den Host kommt erst nach dem 'open'
    await until(() => a.state === 'connected' && b.state === 'connected', 'beide offen, Answer-POST noch unterwegs');
    assert.equal(bus.msgs().length, 3);
    mock.timers.tick(1000); await settle(); // POST-Antwort da
    mock.timers.tick(OPEN_MS + 1); await settle();
    assert.deepEqual([a.state, b.state, la, lb], ['connected', 'connected', [], []]);
    assert.deepEqual(rtc.pcs.map(p => p.connectionState), ['connected', 'connected']);
    assert.equal(bus.msgs().length, 3, 'keine zweite Presence');
  } finally { mock.timers.reset(); }
});

test('online: Abbrechen, während die Presence noch unterwegs ist → kein Abo, kein Offer auf die eigene Presence, kein Fehler', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = fakeBus(), rtc = fakeRtc(), room = 'KKKKKK';
    bus.slow = 500;
    const a = online(room, bus, rtc), log = record(a, ['error']);
    const p = a.host('Sebi');
    await settle();
    await a.close();
    mock.timers.tick(500); await p; await settle(); // POST-Antwort kommt erst nach dem Abbrechen
    mock.timers.tick(ANSWER_MS + 1000); await settle();
    assert.deepEqual([a.state, bus.subs, rtc.pcs.length, bus.msgs().map(m => m.t), log], ['closed', 0, 0, ['host'], []]);
  } finally { mock.timers.reset(); }
});

test('online: Abo endgültig abgelehnt (429/5xx) → einmal error signal, nach SIGNAL_MS neues Abo, dann verbunden', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = fakeBus(), rtc = fakeRtc(), room = 'MMMMMM';
    const a = online(room, bus, rtc);
    await a.host('Sebi');
    bus.refuse = 1;
    const b = online(room, bus, rtc), log = record(b, ['error', 'connected']);
    await b.join('Papa');
    await settle();
    assert.equal(bus.subs, 1, 'Abo des Gasts abgelehnt');
    mock.timers.tick(SIGNAL_MS); await settle(); // room (5 s), signal (8 s), dann neu abonniert
    assert.deepEqual(log.map(e => [e[0], e[1].code]), [['error', 'room'], ['error', 'signal']]);
    assert.equal(bus.subs, 2);
    mock.timers.tick(300); // Presence aus dem Backlog gesammelt
    await until(() => a.state === 'connected' && b.state === 'connected', 'verbunden über das zweite Abo');
    mock.timers.tick(3 * SIGNAL_MS); await settle();
    assert.equal(log.filter(e => e[0] === 'error').length, 2, 'signal nur einmal je Start');
    assert.equal(bus.subs, 0);
  } finally { mock.timers.reset(); }
});

test('online: keepAwake hängt einen visibilitychange-Hörer an, stop() löst ihn wieder', async () => {
  const calls = [];
  globalThis.document = { visibilityState: 'visible', addEventListener: (t, f) => calls.push(['add', t, f]), removeEventListener: (t, f) => calls.push(['remove', t, f]) };
  try {
    const l = online('LLLLLL', fakeBus(), fakeRtc());
    l.keepAwake(true); l.keepAwake(true); l.keepAwake(false); l.keepAwake(true);
    assert.deepEqual(calls.map(c => [c[0], c[1]]), [['add', 'visibilitychange']]);
    await l.close();
    assert.deepEqual(calls.map(c => c[0]), ['add', 'remove']);
    assert.equal(calls[0][2], calls[1][2], 'derselbe Hörer');
  } finally { delete globalThis.document; }
});
