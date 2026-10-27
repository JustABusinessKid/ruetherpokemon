import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLink, pickKind, PROTO, TIMING } from '../js/net/link.js';

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
  assert.equal(PROTO, 1);
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
