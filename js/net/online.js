// Transport 'online' für js/net/link.js (Spec v13 §4): Signalisierung über ntfy (Topic ruether-go-rtc-<CODE>, nie das
// Welt-Topic), Spielverkehr über einen WebRTC-DataChannel (STUN + öffentliches TURN). Drei ntfy-Nachrichten je Aufbau:
// Presence (Host) → Offer (Gast) → Answer (Host), ohne Trickle-ICE; nach 'open' des Kanals geht das Abo zu.
// Keine Bibliothek. EventSource/RTCPeerConnection/fetch werden erst beim Start geholt (net für Tests, sonst globalThis),
// Node kennt sie nicht. Eingehendes ist Daten von außen: nur Objekte mit String-t, Namen gekürzt, to/id/at geprüft.
import { ONLINE } from '../data.js';

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O/1/I
export const ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
export const GATHER_MS = 4000;  // ICE-Sammeln gedeckelt: ein toter TURN hält den Start nicht auf
export const ROOM_MS = 5000;    // Gast: keine Presence → error 'room' (Suche läuft weiter)
export const ANSWER_MS = 20_000; // Gast: Offer ohne Answer → error 'connect', pc weg, weiter warten
export const OPEN_MS = 20_000;   // nach gesetzter Answer kein 'open' → pc weg; Host postet neue Presence, Gast error 'connect'
export const SIGNAL_MS = 8000;  // EventSource geht nicht auf → error 'signal' (einmal je Start)
const POST_MS = 6000, COLLECT_MS = 300; // POST-Timeout; Gast sammelt Presences aus dem Backlog so lange, nimmt die jüngste
const MSG_MAX = 3500, CHUNK = 3000, CHUNK_MAX = 8; // ntfy-Grenze 4 KB: größere Bodys als Teile { t:'c', id, k, n, d }
const BUF_MAX = 256 * 1024; // Kanal voll: verwerfen, ds/qs sind volle Schnappschüsse
const AGE_MS = 60 * 60_000, AHEAD_MS = 5 * 60_000; // at außerhalb [jetzt − 60 min, jetzt + 5 min] wird ignoriert
const NAME_MAX = 40;

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clip = (s, fb = '') => (typeof s === 'string' ? s.slice(0, NAME_MAX) : fb);
const coded = (code, message = code) => Object.assign(new Error(message), { code });
const bytes = s => new TextEncoder().encode(s).length;
function parse(str) {
  if (typeof str !== 'string') return null;
  try { const m = JSON.parse(str); return m && typeof m === 'object' && !Array.isArray(m) && typeof m.t === 'string' ? m : null; } catch { return null; }
}

// 6 Zeichen aus ROOM_ALPHABET (30 Bit); crypto, sonst Math.random
export function newRoomCode() {
  const b = new Uint8Array(6);
  try { globalThis.crypto.getRandomValues(b); } catch { for (let i = 0; i < 6; i++) b[i] = Math.floor(Math.random() * 256); }
  return Array.from(b, x => ROOM_ALPHABET[x % 32]).join('');
}

// Signatur wie nearbyTransport/localTransport: cb = { found(name), up(name, code), down(), data(str), error(code, message) }
export function onlineTransport({ room, net = {} }, cb) {
  const topic = `${net.bus || ONLINE.bus}/ruether-go-rtc-${room}`;
  const ice = net.ice || ICE;
  const PC = () => net.RTCPeerConnection || globalThis.RTCPeerConnection;
  const ES = () => net.EventSource || globalThis.EventSource;
  const F = () => net.fetch || globalThis.fetch;
  let role = null, name = '', tid = null, offerId = null, peerName = '';
  let es = null, pc = null, ch = null, opened = false; // pc: die aktuelle Verbindung (Identität = Generation), opened: ihr Kanal war offen
  let seen = new Set(), chunks = new Map(), presences = [];
  const timers = {};
  let wake = null, wakeOn = false, onVis = null; // onVis: visibilitychange-Hörer, stop() löst ihn wieder
  const arm = (k, ms, fn) => { clearTimeout(timers[k]); timers[k] = setTimeout(() => { delete timers[k]; fn(); }, ms); };
  const disarm = k => { clearTimeout(timers[k]); delete timers[k]; };
  const fresh = at => typeof at === 'number' && at > Date.now() - AGE_MS && at < Date.now() + AHEAD_MS;
  const presence = () => ({ t: 'host', tid, name, at: Date.now() });

  // ---------- ntfy ----------
  async function post1(body) {
    const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), POST_MS);
    let res;
    try { res = await F()(topic, { method: 'POST', body, signal: ctrl.signal }); } catch (e) { throw coded('offline', e?.message || 'offline'); } finally { clearTimeout(to); }
    if (!res?.ok) throw coded('signal', `ntfy ${res?.status ?? '?'}`);
  }
  // rejectet mit code 'offline' (fetch wirft) | 'signal' (!ok, 429)
  async function post(m) {
    const body = JSON.stringify(m);
    if (bytes(body) <= MSG_MAX) return post1(body);
    const n = Math.ceil(body.length / CHUNK), id = rid();
    for (let k = 0; k < n; k++) await post1(JSON.stringify({ t: 'c', id, k, n, d: body.slice(k * CHUNK, (k + 1) * CHUNK) }));
  }
  const later = p => p.catch(e => cb.error(e.code, e.message)); // Offer/Answer/Presence im Hintergrund: Fehler nur melden
  // Abgerissen verbindet EventSource selbst neu (Backlog kommt erneut, seen). Auf Nicht-200 (429, 5xx) schließt sie endgültig
  // (readyState 2) und nie wieder: dann nach SIGNAL_MS neu abonnieren (again); 'signal' wird je Start nur einmal gemeldet
  function subscribe(since, again = false) {
    const s = es = new (ES())(`${topic}/sse?since=${since}`);
    if (!again) arm('signal', SIGNAL_MS, () => cb.error('signal', 'ntfy antwortet nicht'));
    s.onopen = () => { if (s === es) disarm('signal'); };
    s.onmessage = e => { if (s === es) recv(e?.data); };
    s.onerror = () => { if (s === es && s.readyState === 2) arm('resub', SIGNAL_MS, () => subscribe(since, true)); };
  }
  function closeEs() {
    try { es?.close(); } catch { /* egal */ }
    es = null; presences = [];
    disarm('signal'); disarm('resub'); disarm('room'); disarm('collect');
  }
  function recv(data) {
    let e;
    try { e = JSON.parse(data); } catch { return; }
    if (e?.event !== 'message' || typeof e.id !== 'string' || seen.has(e.id)) return;
    seen.add(e.id);
    const m = parse(e.message);
    if (m) handle(m.t === 'c' ? chunk(m) : m);
  }
  // Teile je id sammeln, komplett → die eigentliche Nachricht (sonst null)
  function chunk({ id, k, n, d }) {
    if (typeof id !== 'string' || !Number.isInteger(n) || n < 1 || n > CHUNK_MAX || !Number.isInteger(k) || k < 0 || k >= n || typeof d !== 'string' || d.length > CHUNK) return null;
    let p = chunks.get(id);
    if (!p) { if (chunks.size >= 4) chunks.delete(chunks.keys().next().value); chunks.set(id, p = { n, got: 0, d: new Array(n) }); }
    if (p.n !== n || p.d[k] !== undefined) return null;
    p.d[k] = d;
    if (++p.got < n) return null;
    chunks.delete(id);
    return parse(p.d.join(''));
  }
  function handle(m) {
    if (!role || !m || !fresh(m.at)) return; // nach stop() nichts mehr annehmen
    if (role === 'host') {
      if (m.t === 'offer' && m.to === tid && !pc && typeof m.id === 'string' && typeof m.sdp === 'string') answer(m);
    } else if (m.t === 'host' && typeof m.tid === 'string') { // Backlog 300 ms sammeln; live heißt „Host neu gestartet“
      presences.push(m);
      if (!timers.collect) arm('collect', COLLECT_MS, pickHost);
    } else if (m.t === 'answer' && pc && offerId && m.id === offerId && typeof m.sdp === 'string') accept(m);
  }

  // ---------- WebRTC ----------
  function newPc() {
    dropPc();
    const p = pc = new (PC())({ iceServers: ice });
    opened = false;
    p.onconnectionstatechange = () => { if (p.connectionState === 'failed' || p.connectionState === 'closed') fail(p); };
    return p;
  }
  function dropPc() {
    const p = pc;
    if (!p) return;
    pc = null; ch = null; offerId = null;
    disarm('open'); disarm('answer');
    p.ondatachannel = p.onconnectionstatechange = null;
    try { p.close(); } catch { /* schon zu */ }
  }
  // Kanal zu oder ICE gescheitert, nur für die aktuelle pc und nur einmal. Vor 'open' kennt die Hülle die pc nicht
  // (onDown ignoriert, link.js): dann wie der OPEN_MS-Wächter – Host wirbt neu an, Gast meldet 'connect'
  function fail(p) {
    if (p !== pc) return;
    const was = opened;
    dropPc();
    if (was) cb.down();
    else if (role === 'host') later(post(presence()));
    else cb.error('connect', 'Keine Direktverbindung');
  }
  const gathered = p => new Promise(res => {
    if (p.iceGatheringState === 'complete') return res();
    const t = setTimeout(done, GATHER_MS);
    function done() { clearTimeout(t); p.onicegatheringstatechange = null; res(); }
    p.onicegatheringstatechange = () => { if (p.iceGatheringState === 'complete') done(); };
  });
  function wire(c, p) {
    if (p !== pc) { try { c.close(); } catch { /* egal */ } return; }
    ch = c;
    const open = () => {
      if (p !== pc || opened) return;
      opened = true; disarm('open'); closeEs();
      cb.up(peerName, room);
    };
    c.onopen = open;
    c.onmessage = e => { if (p === pc && typeof e?.data === 'string') cb.data(e.data); };
    c.onclose = () => fail(p);
    if (c.readyState === 'open') open(); // manche Browser liefern den Kanal schon offen
  }
  // Host: genau ein Offer beantworten
  async function answer(m) {
    peerName = clip(m.name);
    const p = newPc();
    p.ondatachannel = e => wire(e.channel, p);
    try {
      await p.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await p.setLocalDescription(await p.createAnswer());
      await gathered(p);
      if (p !== pc) return;
      await post({ t: 'answer', id: m.id, name, sdp: p.localDescription.sdp, at: Date.now() });
    } catch (e) {
      if (p === pc && !opened) { dropPc(); cb.error(e?.code || 'connect', e?.message || 'connect'); }
      return;
    }
    // der Gast hat die Answer per SSE schon, bevor die POST-Antwort hier ankommt: ist der Kanal inzwischen offen, kein Wächter
    if (p === pc && !opened) arm('open', OPEN_MS, () => fail(p));
  }
  // Gast: jüngste Presence → found → Offer; eine laufende pc gilt als veraltet (Host neu gestartet)
  function pickHost() {
    const h = presences.reduce((a, b) => (b.at >= a.at ? b : a));
    presences = [];
    disarm('room');
    peerName = clip(h.name);
    cb.found(peerName);
    offer(h.tid);
  }
  async function offer(to) {
    const p = newPc();
    wire(p.createDataChannel('ruether'), p);
    const id = offerId = rid();
    try {
      await p.setLocalDescription(await p.createOffer());
      await gathered(p);
      if (p !== pc) return;
      await post({ t: 'offer', id, to, name, sdp: p.localDescription.sdp, at: Date.now() });
    } catch (e) {
      if (p === pc) { dropPc(); cb.error(e?.code || 'connect', e?.message || 'connect'); }
      return;
    }
    if (p === pc) arm('answer', ANSWER_MS, () => { dropPc(); cb.error('connect', 'Keine Antwort'); });
  }
  async function accept(m) {
    const p = pc;
    offerId = null; disarm('answer');
    try { await p.setRemoteDescription({ type: 'answer', sdp: m.sdp }); } catch (e) {
      if (p === pc) { dropPc(); cb.error('connect', e?.message || 'connect'); }
      return;
    }
    if (p === pc && !opened) arm('open', OPEN_MS, () => fail(p));
  }

  // ---------- Wake Lock (Browser) ----------
  async function grab() {
    if (wake && !wake.released) return;
    try { wake = await globalThis.navigator?.wakeLock?.request('screen'); } catch { wake = null; }
  }
  function release() {
    try { wake?.release(); } catch { /* egal */ }
    wake = null;
  }

  function cleanup() {
    dropPc(); closeEs();
    for (const k of Object.keys(timers)) disarm(k);
    seen = new Set(); chunks.clear();
  }
  return {
    // Host: Presence POSTen (reject 'offline' | 'signal'), dann abonnieren; Gast: abonnieren, auf Presence warten (peer egal).
    // Ohne stop() davor (relaunch/finish der Hülle): alte pc und altes Abo wegräumen
    start(r, n) {
      if (typeof PC() !== 'function' || typeof ES() !== 'function') throw coded('webrtc', 'Kein WebRTC oder EventSource');
      if (globalThis.navigator?.onLine === false) throw coded('offline', 'Kein Internet');
      cleanup();
      role = r; name = clip(n);
      if (r === 'host') { // nach dem Netzwarten nur abonnieren, wenn kein stop()/start() dazwischenkam (sonst Abo-Leck, Offer auf die eigene Presence)
        const t = tid = rid();
        return post(presence()).then(() => { if (role === 'host' && tid === t) subscribe('30s'); });
      }
      subscribe('10m');
      arm('room', ROOM_MS, () => cb.error('room', 'Kein Spiel mit diesem Code'));
      return Promise.resolve();
    },
    send(str) {
      if (ch?.readyState !== 'open' || ch.bufferedAmount >= BUF_MAX) return; // Stau/zu: verwerfen, den Rest merkt der Herzschlag
      try { ch.send(str); } catch { /* gerade zugegangen */ }
    },
    openSettings() {},
    stop() {
      cleanup(); role = null; wakeOn = false; release();
      if (onVis) { globalThis.document?.removeEventListener?.('visibilitychange', onVis); onVis = null; }
    },
    keepAwake(on) {
      wakeOn = !!on;
      if (!wakeOn) return release();
      if (!onVis) { // Bildschirm aus gibt den Lock frei: sichtbar → erneut holen
        onVis = () => { if (wakeOn && globalThis.document.visibilityState === 'visible') grab(); };
        globalThis.document?.addEventListener?.('visibilitychange', onVis);
      }
      grab();
    },
  };
}
