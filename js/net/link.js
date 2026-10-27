// Verbindung zwischen zwei Geräten ohne Internet (Spec §1.2, §6).
// Eine Hülle (Hallo, Herzschlag, Zerlegen, Wiederverbinden, Events) über zwei kleine Transporte:
// 'nearby' = Capacitor-Plugin NearbyLink (Bluetooth/WLAN-Direct, Android-App), 'local' = BroadcastChannel
// (zwei Fenster im selben Browser, zum Testen). Transporte reichen nur Rohtext durch.
// Eingehendes ist Daten von außen: kaputtes JSON und Nachrichten ohne Text-t werden still verworfen.

export const PROTO = 1; // erhöhen bei jeder inkompatiblen Änderung an Link-, Duell- oder Quest-Nachrichten
export const TIMING = { PING_MS: 2000, TIMEOUT_MS: 6000, RECONNECT_MS: 60_000, ADV_MS: 1000 };
// Im Zustand 'lost': so lange nach dem Timeout bzw. nach einem fehlgeschlagenen Neustart startet die Hülle den Transport neu
// (überschreibbar per timing.RETRY_MS)
const RETRY_MS = 3000;
// nearby: nach einem reinen Herzschlag-Timeout bleibt die Funkverbindung so lange stehen (timing.SILENT_MS). Nearby hält sie
// selbst mit Keep-alive (alle 5 s, im GMS-Prozess) und meldet echte Abrisse als disconnected; still ist sie oft nur, weil das
// JS des Partners kurz steht (Bildschirm aus, Hintergrund) oder Nearby gerade auf WLAN umschaltet.
const SILENT_MS = 30_000;
const PART = 8000;      // Zeichen je Teil: auch als UTF-8 mit JSON-Escapes unter den 32 KB von Nearby
const MAX_PARTS = 1000; // größer wird keine Nachricht (8 Mio. Zeichen)
const NAME_MAX = 40;
const RESERVED = new Set(['hello', 'ping', 'bye', '_part']);
const PING = '{"t":"ping"}', BYE = '{"t":"bye"}';

const now = () => globalThis.performance?.now?.() ?? Date.now();
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); // randomUUID gibt es ohne https nicht
const clip = (s, fb = '') => (typeof s === 'string' ? s.slice(0, NAME_MAX) : fb);
const coded = (code, message = code) => Object.assign(new Error(message), { code });
// Plugin-Fehler → Error mit .code (permission | bluetooth | unavailable | busy | toobig | notconnected | Status-Text)
function toErr(e) {
  const code = typeof e?.code === 'string' && e.code ? e.code : String(e?.message || e || 'unavailable');
  return coded(code, typeof e?.message === 'string' && e.message ? e.message : code);
}
// JSON-Text → Nachrichtenobjekt mit Text-t, sonst null
function parse(str) {
  if (typeof str !== 'string') return null;
  try {
    const m = JSON.parse(str);
    return m && typeof m === 'object' && !Array.isArray(m) && typeof m.t === 'string' ? m : null;
  } catch { return null; }
}

// 'nearby', wenn die Android-App das Plugin mitbringt, sonst 'local'
export function pickKind() {
  return globalThis.Capacitor?.isPluginAvailable?.('NearbyLink') ? 'nearby' : 'local';
}

// Transport 'nearby': das Capacitor-Plugin (§1.1), Methoden liefern Promises, Events über addListener
function nearbyTransport(plugin, cb) {
  let subs = null, cur = null; // cur: id des verbundenen Endpunkts
  const quiet = p => Promise.resolve(p).catch(() => {});
  return {
    start(role, name, peer) {
      if (!plugin) throw coded('unavailable', 'NearbyLink fehlt');
      subs ||= Object.entries({
        peerFound: e => cb.found(e?.name),
        connected: e => { cur = e?.id ?? null; cb.up(e?.name, e?.code); },
        // ein spätes disconnected des alten Endpunkts (stopAll beim Neustart) gilt nicht für den neuen
        disconnected: e => { if (e?.id != null && cur != null && e.id !== cur) return; cur = null; cb.down(); },
        message: e => cb.data(e?.data),
        error: e => cb.error(e?.code, e?.message),
      }).map(([ev, fn]) => plugin.addListener(ev, fn));
      return role === 'host' ? plugin.host({ name }) : plugin.join(peer ? { name, peer } : { name });
    },
    send(data) { quiet(plugin?.send({ data })); }, // toobig/notconnected: verworfen, den Rest merkt der Herzschlag
    openSettings(to) { quiet(plugin?.openSettings?.({ to })); },
    stop() {
      for (const s of subs || []) quiet(Promise.resolve(s).then(h => h?.remove?.())); // Capacitor 6: Promise<Handle>
      subs = null; cur = null;
      return quiet(plugin?.close());
    },
    keepAwake(on) { quiet(plugin?.keepAwake({ on })); },
  };
}

// Transport 'local': BroadcastChannel, Nachrichten { k, from, to?, … } (Tabelle §1.2).
// lag verzögert jede eingehende Nachricht (Playtest ?lag=150); gleiche Verzögerung hält die Reihenfolge.
function localTransport({ channel, lag, advMs }, cb) {
  const me = rid();
  let ch = null, role = null, name = '', want = null, other = null, adv = null;
  const hosts = new Map(); // Gast: gesehene Gastgeber id → Name
  const post = m => { try { ch?.postMessage({ ...m, from: me }); } catch { /* Kanal schon zu */ } };
  const stopAdv = () => { clearInterval(adv); adv = null; };
  function recv(m) {
    if (!ch || !m || typeof m !== 'object' || typeof m.from !== 'string' || m.from === me) return;
    if (m.to !== undefined && m.to !== me) return; // an jemand anderen
    const { k, from } = m;
    if (k === 'adv' && role === 'guest' && !other && typeof m.name === 'string' && (!want || m.name === want)) {
      if (!hosts.has(from)) cb.found(m.name);
      hosts.set(from, m.name);
      post({ k: 'req', to: from, name });
    } else if (k === 'req' && role === 'host' && !other) { // nur der erste req zählt
      other = from; stopAdv();
      const code = String(Math.floor(Math.random() * 1e4)).padStart(4, '0');
      post({ k: 'acc', to: from, code });
      cb.up(m.name, code);
    } else if (k === 'acc' && role === 'guest' && hosts.has(from)) {
      if (other) { if (other !== from) post({ k: 'bye', to: from }); return; } // zweiter Gastgeber: absagen
      other = from;
      cb.up(hosts.get(from), String(m.code ?? ''));
    } else if (k === 'msg' && from === other && typeof m.data === 'string') cb.data(m.data);
    else if (k === 'bye' && from === other) { other = null; cb.down(); }
  }
  return {
    start(r, n, p) {
      if (!ch) {
        if (typeof BroadcastChannel !== 'function') throw coded('unavailable', 'Kein BroadcastChannel');
        ch = new BroadcastChannel(channel);
        ch.onmessage = e => (lag > 0 ? setTimeout(recv, lag, e.data) : recv(e.data));
      }
      if (other) post({ k: 'bye', to: other });
      other = null; stopAdv(); hosts.clear();
      role = r; name = n; want = p || null;
      if (r === 'host') {
        const a = () => post({ k: 'adv', name });
        a(); adv = setInterval(a, advMs);
      }
    },
    send(data) { if (other) post({ k: 'msg', to: other, data }); },
    openSettings() {},
    stop() {
      if (other) post({ k: 'bye', to: other });
      stopAdv(); other = null; role = null;
      try { ch?.close(); } catch { /* egal */ }
      ch = null;
    },
    keepAwake() {},
  };
}

export function createLink({ kind = pickKind(), plugin, channel = 'ruether-go-link', lag = 0, timing } = {}) {
  const T = { RETRY_MS, SILENT_MS, ...TIMING, ...timing };
  const step = Math.max(5, Math.min(T.PING_MS, T.TIMEOUT_MS) / 4);
  const hears = new Map(), parts = new Map();
  let myName = '', sid = rid(), peerSid = null, gen = 0;
  let up = false, upName = '', upCode = null, linked = false, early = null; // up: Transport steht; linked: Hallo getauscht
  let lastRx = 0, lastTx = 0, lostAt = 0, ticker = null, partId = 0;
  let starting = false, failCode = null, failAt = -Infinity, paged = false;
  let retryAt = Infinity, lostErr = null; // 'lost': nächster Neustart des Transports; zuletzt gemeldeter Neustart-Fehler (nur einmal melden)
  const cb = { found, up: onUp, down: onDown, data: onData, error: onError };
  const tr = kind === 'nearby'
    ? nearbyTransport(plugin ?? globalThis.Capacitor?.Plugins?.NearbyLink, cb)
    : localTransport({ channel, lag, advMs: T.ADV_MS }, cb);
  const link = {
    kind, role: null, state: 'idle', peer: null, code: null,
    host: name => begin('host', name),
    join: name => begin('guest', name),
    send, on, close,
    keepAwake: on => tr.keepAwake(!!on),
    openSettings: to => tr.openSettings(to), // nearby: app | location | bluetooth (Android-Einstellungen)
  };

  function emit(type, d) {
    for (const fn of [...(hears.get(type) || [])]) {
      try { fn(d); } catch (e) { console.error(e); } // ein kaputter Hörer reißt die Verbindung nicht mit
    }
  }
  function on(type, fn) {
    if (!hears.has(type)) hears.set(type, new Set());
    hears.get(type).add(fn);
    return () => hears.get(type).delete(fn);
  }
  // Der Takt (Ping, Timeout, Wiederverbinden) läuft nur, solange der Link etwas tut
  function setState(s) {
    if (link.state === s) return;
    link.state = s;
    const run = s !== 'idle' && s !== 'closed';
    if (run && !ticker) ticker = setInterval(tick, step);
    if (!run && ticker) { clearInterval(ticker); ticker = null; }
    emit('state', s);
  }
  function raw(str) { lastTx = now(); tr.send(str); }
  // Runde vorbei: neue sid, damit ein alter Partner beim Wiederkommen „neu gestartet“ erkennt
  function reset() {
    gen++; up = false; linked = false; early = null; peerSid = null; lostAt = 0; retryAt = Infinity; sid = rid();
    link.peer = null; link.code = null; parts.clear();
  }
  // Transport starten (anwerben bzw. suchen). Fehler: zurück auf 'idle'; beim Wiederverbinden bleibt 'lost',
  // tick() versucht es nach RETRY_MS erneut (der Fehler wird dabei nur einmal gemeldet)
  function launch(peer) {
    const g = gen;
    starting = true;
    return Promise.resolve().then(() => tr.start(link.role, myName, peer)).then(() => { starting = false; }, e => {
      starting = false;
      const err = toErr(e);
      failCode = err.code; failAt = now();
      if (g === gen) {
        if (link.state !== 'lost') { reset(); tr.stop(); setState('idle'); emit('error', { code: err.code, message: err.message }); }
        else {
          retryAt = now() + T.RETRY_MS;
          if (err.code !== lostErr) { lostErr = err.code; emit('error', { code: err.code, message: err.message }); }
        }
      }
      throw err;
    });
  }
  // Wiederverbinden (§1.2 'lost'): Transport neu starten, Gastgeber wirbt wieder an, Gast sucht nur nach dem bisherigen Partner
  function relaunch() {
    retryAt = Infinity;
    up = false; linked = false; early = null; parts.clear();
    launch(link.role === 'guest' ? link.peer?.name : undefined).catch(() => {});
  }
  function begin(role, name) {
    if (linked) raw(BYE); // neu anfangen mitten in einer Verbindung: Partner sauber verabschieden
    reset();
    myName = clip(name);
    link.role = role;
    setState(role === 'host' ? 'hosting' : 'joining');
    if (!paged) { globalThis.addEventListener?.('pagehide', onHide); paged = true; }
    return launch();
  }
  function onHide() { close(); }

  function found(name) { if (link.role === 'guest') emit('peerFound', { name: clip(name) }); }
  function onUp(name, code) {
    if (link.state === 'idle' || link.state === 'closed') return;
    up = true; linked = false;
    upName = clip(name); upCode = code == null ? null : String(code);
    lastRx = now();
    raw(JSON.stringify({ t: 'hello', v: PROTO, name: myName, sid }));
    if (early) { const m = early; early = null; hello(m); }
  }
  // Transport weg (Nearby onDisconnected, local bye): neu verbinden, solange RECONNECT_MS läuft.
  // Gastgeber wirbt wieder an, Gast sucht nur nach dem bisherigen Partner (vor dem Hallo: wie vorher).
  function onDown() {
    if (!up) return; // veraltet, schon zurückgesetzt
    if (linked && link.state === 'connected') lose('native');
    relaunch();
  }
  function lose(reason) {
    lostAt = now(); lostErr = null;
    retryAt = reason !== 'timeout' ? Infinity : lostAt + (kind === 'nearby' ? T.SILENT_MS : T.RETRY_MS); // nativ weg: onDown startet sofort neu
    setState('lost');
    emit('lost', { reason });
  }
  // Endgültig vorbei (bye, RECONNECT_MS abgelaufen, falsche Version): Gastgeber wirbt weiter an, Gast hört auf.
  // Bei 'version' steht im Event auch theirs (PROTO des Partners), damit die App sagen kann, wer aktualisieren muss.
  function finish(reason, theirs) {
    reset();
    if (link.role === 'host' && reason !== 'version') { setState('hosting'); launch().catch(() => {}); }
    else { tr.stop(); setState('idle'); }
    emit('disconnected', reason === 'version' ? { reason, theirs: Number.isFinite(theirs) ? theirs : 0 } : { reason });
  }
  function hello(m) {
    if (m.v !== PROTO) return finish('version', m.v);
    if (typeof m.sid !== 'string' || !m.sid || (linked && m.sid === peerSid)) return; // kaputt oder doppelt
    const again = m.sid === peerSid;
    if (peerSid && !again) { // Partner-App neu gestartet: die alte Runde ist vorbei
      peerSid = null; parts.clear();
      emit('disconnected', { reason: 'closed' });
      if (!up) return; // ein Hörer hat neu angefangen oder geschlossen
    }
    peerSid = m.sid; linked = true; lostAt = 0; lastRx = now();
    link.peer = { name: clip(m.name, upName) };
    link.code = upCode;
    setState('connected');
    emit('connected', { name: link.peer.name, code: link.code, again });
  }
  function onData(str) {
    if (link.state === 'idle' || link.state === 'closed') return;
    const m = parse(str);
    if (!up) { if (m?.t === 'hello') early = m; return; } // Nearby: Hallo kam vor „connected“
    lastRx = now(); // jede Nachricht ist ein Lebenszeichen
    if (!m) return;
    if (m.t === 'hello') return hello(m);
    if (!linked) return; // vor dem Hallo-Abgleich geht nichts durch
    if (m.t === 'bye') return finish('left');
    if (link.state === 'lost') { // Funkstille vorbei
      setState('connected');
      emit('connected', { name: link.peer.name, code: link.code, again: true });
    }
    if (m.t === 'ping') return;
    if (m.t === '_part') return part(m);
    emit('message', m);
  }
  // Teile einer langen Nachricht sammeln (Reihenfolge egal), komplett → wie eine normale Nachricht
  function part({ id, k, n, d }) {
    if ((typeof id !== 'number' && typeof id !== 'string') || !Number.isInteger(n) || n < 1 || n > MAX_PARTS
      || !Number.isInteger(k) || k < 0 || k >= n || typeof d !== 'string' || d.length > PART) return;
    let p = parts.get(id);
    if (!p) {
      if (parts.size >= 4) parts.delete(parts.keys().next().value); // liegengebliebene Reste verwerfen
      parts.set(id, p = { n, got: 0, d: new Array(n) });
    }
    if (p.n !== n || p.d[k] !== undefined) return;
    p.d[k] = d;
    if (++p.got < n) return;
    parts.delete(id);
    const m = parse(p.d.join(''));
    if (m && !RESERVED.has(m.t)) emit('message', m);
  }
  // Native Fehler-Events; den Startfehler meldet schon launch, nicht doppelt
  function onError(code, message) {
    code = typeof code === 'string' && code ? code : 'unknown';
    if (starting || (code === failCode && now() - failAt < 2000)) return;
    emit('error', { code, message: typeof message === 'string' ? message : code });
  }
  // Funkstille (timeout): der Transport pingt weiter, das nächste Lebenszeichen heißt „wieder da“. Bleibt es RETRY_MS (nearby:
  // SILENT_MS) still, startet die Hülle den Transport neu (§1.2 'lost'); ebenso RETRY_MS nach einem fehlgeschlagenen Neustart,
  // bis RECONNECT_MS um ist.
  function tick() {
    const t = now();
    if (linked && t - lastTx >= T.PING_MS) raw(PING);
    if (linked && link.state === 'connected' && t - lastRx >= T.TIMEOUT_MS) lose('timeout');
    else if (link.state === 'lost') {
      if (t - lostAt >= T.RECONNECT_MS) finish('timeout');
      else if (!starting && t >= retryAt) relaunch();
    }
  }

  // false, wenn gerade nicht verbunden (Nachricht verworfen). Über PART Zeichen wird zerlegt.
  function send(obj) {
    if (link.state !== 'connected') return false;
    let str;
    try { str = JSON.stringify(obj); } catch { return false; } // Zyklus, BigInt
    if (typeof str !== 'string') return false;
    if (str.length <= PART) { raw(str); return true; }
    const n = Math.ceil(str.length / PART), id = ++partId;
    if (n > MAX_PARTS) return false;
    for (let k = 0; k < n; k++) raw(JSON.stringify({ t: '_part', id, k, n, d: str.slice(k * PART, (k + 1) * PART) }));
    return true;
  }
  async function close() {
    if (link.state === 'closed') return;
    const had = peerSid !== null;
    if (linked) raw(BYE);
    reset();
    setState('closed');
    if (paged) { globalThis.removeEventListener?.('pagehide', onHide); paged = false; }
    const done = Promise.resolve(tr.stop());
    if (had) emit('disconnected', { reason: 'closed' });
    await done;
  }

  return link;
}
