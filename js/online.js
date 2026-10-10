import { CONST, ONLINE } from './data.js';
import { clean, emptyState, loadState, merge, readBus, busUrl, toAppState, newKeyJwk, signerFromJwk, makeMessage } from './online-merge.js';

// Online-Welt über GitHub: Snapshot (Branch online-data) + Live-Bus ntfy.sh, Nachrichten pro Gerät signiert.
// Alles best effort: Timeout, Fehler schlucken, available-Flag.
const KEY_STORE = 'ruether-go-key';
// sync höchstens alle 5 Minuten: ntfy.sh erlaubt ohne Konto 250 Nachrichten am Tag pro IP (ein WLAN teilt sich das),
// bleibt unter ONLINE_WINDOW_MS (10 min), „online jetzt“ hält also
export const SYNC_MIN_MS = 5 * 60_000;
const POLL_MIN_MS = 5000;   // Tab-Wechsel lösen keinen Bus-Sturm aus
const SNAP_EVERY_MS = 15 * 60_000; // Snapshot neu laden (so oft läuft die Action): gleicht lokale Reihenfolge-Effekte aus
const TEST_TOPIC = /^ruether-go-test-[\w-]{4,40}$/;

// Lokal offline; ?online=ruether-go-test-… = eigenes Test-Topic ohne Snapshot (nie das echte Topic).
export function onlineConfig(loc, base = ONLINE) {
  const test = new URLSearchParams(loc.search).get('online');
  if (test && TEST_TOPIC.test(test)) return { ...base, topic: test, snapshotUrl: null };
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname) ? null : base;
}

// Geräteschlüssel (ECDSA P-256) aus localStorage, sonst neu erzeugen
async function loadSigner() {
  try {
    let jwk = null;
    try { jwk = JSON.parse(globalThis.localStorage.getItem(KEY_STORE)); } catch { /* gesperrt/leer */ }
    if (!jwk?.d) {
      jwk = await newKeyJwk();
      try { globalThis.localStorage.setItem(KEY_STORE, JSON.stringify(jwk)); } catch { /* dann eben nur für diese Sitzung */ }
    }
    return await signerFromJwk(jwk);
  } catch {
    return null; // kein WebCrypto (unsicherer Kontext)
  }
}

// config = ONLINE-Objekt { topic, bus, snapshotUrl } oder null (offline)
export function createOnline({ config, getPayload, onState }) {
  let available = false, lastState = null, timer = null, trail = null, inflight = false;
  let snap = emptyState(), snapAt = 0, polling = null, lastPoll = 0;
  let signer = null, lastSync = '', lastSyncAt = 0;
  const live = !!(config && globalThis.crypto?.subtle);

  // GET/POST mit Timeout; Ergebnis: Antworttext oder null
  async function req(url, opts) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONST.API_TIMEOUT);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(to);
    }
  }
  function publishState() {
    lastState = toAppState(snap);
    onState?.(lastState);
    return lastState;
  }
  async function poll() {
    if (config.snapshotUrl && Date.now() - snapAt > SNAP_EVERY_MS) {
      try {
        const txt = await req(`${config.snapshotUrl}?t=${Math.floor(Date.now() / 60000)}`); // Cache-Buster pro Minute
        if (txt != null) { snap = loadState(JSON.parse(txt)); snapAt = Date.now(); } // Bus ab lastMsgTime des Snapshots neu lesen
      } catch { /* kein/kaputter Snapshot: nur Bus */ }
    }
    const txt = await req(busUrl(config, snap.lastMsgTime));
    if (txt == null) { available = false; return null; }
    const items = await readBus(txt);
    snap = merge(snap, items); // erst nach dem await lesen, sonst gehen parallel gesendete eigene Nachrichten verloren
    available = true; lastPoll = Date.now();
    return publishState();
  }
  async function publish(k, d) {
    signer ||= await loadSigner();
    if (!signer) return null;
    const msg = await makeMessage(signer, k, d);
    if (await req(`${config.bus}/${config.topic}`, { method: 'POST', body: JSON.stringify(msg) }) == null) { available = false; return null; }
    available = true;
    snap = merge(snap, [{ msg }]); // sofort anzeigen; der Bus liefert sie beim nächsten Poll noch mal (idempotent)
    return publishState();
  }

  const api = {
    syncSoon() { clearTimeout(timer); timer = setTimeout(() => api.syncNow(), CONST.SYNC_DEBOUNCE); },
    async syncNow() {
      const d = live && clean('sync', getPayload() || {});
      if (!d) return null;
      const body = JSON.stringify(d);
      if (body === lastSync) return lastState; // nichts geändert
      const wait = lastSyncAt + SYNC_MIN_MS - Date.now();
      if (wait > 0) { // Rate-Limit: später nachreichen, mit dem dann aktuellen Stand
        clearTimeout(trail);
        trail = setTimeout(() => api.syncNow(), wait);
        trail.unref?.();
        return lastState;
      }
      if (inflight) return lastState;
      inflight = true; lastSyncAt = Date.now();
      try {
        const r = await publish('sync', d);
        if (r) lastSync = body;
        return r;
      } finally { inflight = false; }
    },
    fetchState() {
      if (!live) { available = false; return Promise.resolve(null); }
      if (polling) return polling;
      if (lastState && available && Date.now() - lastPoll < POLL_MIN_MS) return Promise.resolve(lastState);
      return (polling = poll().finally(() => { polling = null; }));
    },
    claimArena(arenaId, level, leader) {
      const d = live && getPayload() && clean('arena', { arenaId, level, leader });
      return d ? publish('arena', d) : Promise.resolve(null);
    },
    postEvent(kind, text) {
      const d = live && getPayload() && clean('event', { kind, text });
      return d ? publish('event', d) : Promise.resolve(null);
    },
    get available() { return available; },
    get lastState() { return lastState; },
  };
  return api;
}
