import { CONST, ONLINE } from './data.js';
import { clean, emptyState, loadState, merge, readBus, busUrl, toAppState, newKeyJwk, signerFromJwk, makeMessage, dupEvent } from './online-merge.js';

// Online-Welt über GitHub: Snapshot (Branch online-data) + Live-Bus ntfy.sh, Nachrichten pro Gerät signiert.
// Alles best effort: Timeout, Fehler schlucken, available-Flag.
const KEY_STORE = 'ruether-go-key';
// sync höchstens alle 5 Minuten und nur bei Änderung: ntfy.sh erlaubt ohne Konto 250 Nachrichten am Tag pro IP
// (ein WLAN teilt sich das). „online“ heißt also: in den letzten 10 Minuten etwas geändert (ONLINE_WINDOW_MS).
export const SYNC_MIN_MS = 5 * 60_000;
const FLUSH_MIN_MS = 60_000; // App verlassen: ausstehenden sync sofort senden, aber höchstens einmal pro Minute
const POLL_MIN_MS = 5000;   // Tab-Wechsel lösen keinen Bus-Sturm aus
const SNAP_EVERY_MS = 15 * 60_000; // Snapshot neu laden (die Action merged etwa alle 5 Minuten): gleicht lokale Reihenfolge-Effekte aus
const TEST_TOPIC = /^ruether-go-test-[\w-]{4,40}$/;

// Lokal offline; ?online=ruether-go-test-… = eigenes Test-Topic ohne Snapshot (nie das echte Topic).
export function onlineConfig(loc, base = ONLINE) {
  const test = new URLSearchParams(loc.search).get('online');
  if (test && TEST_TOPIC.test(test)) return { ...base, topic: test, snapshotUrl: null };
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname) ? null : base;
}

// Privater P-256-JWK (x, y, d je 32 Byte base64url), sonst null
const isJwk = j => j?.kty === 'EC' && j.crv === 'P-256' && ['x', 'y', 'd'].every(k => typeof j[k] === 'string' && /^[\w-]{43}$/.test(j[k]));
function readKey() {
  try { const j = JSON.parse(globalThis.localStorage.getItem(KEY_STORE)); return isJwk(j) ? j : null; } catch { return null; } // gesperrt/leer/kaputt
}

// Geräteschlüssel (ECDSA P-256) aus localStorage, sonst neu erzeugen
async function loadSigner() {
  try {
    let jwk = readKey();
    if (!jwk) {
      const fresh = await newKeyJwk();
      jwk = readKey(); // ein zweiter Tab war schneller: dessen Schlüssel nehmen, sonst gäbe es zwei Kennungen
      if (!jwk) {
        jwk = fresh;
        try { globalThis.localStorage.setItem(KEY_STORE, JSON.stringify(jwk)); } catch { /* dann eben nur für diese Sitzung */ }
      }
    }
    return await signerFromJwk(jwk);
  } catch {
    return null; // kein WebCrypto (unsicherer Kontext)
  }
}

// config = ONLINE-Objekt { topic, bus, snapshotUrl } oder null (offline)
export function createOnline({ config, getPayload, onState }) {
  let available = false, lastState = null, timer = null, trail = null, inflight = null;
  let snap = emptyState(), snapAt = 0, snapTime = -1, polling = null, lastPoll = 0;
  let signer = null, signerP = null, lastSync = '', lastSyncAt = 0;
  const live = !!(config && globalThis.crypto?.subtle);
  // Promise cachen: zwei gleichzeitige erste Aufrufe dürfen nicht zwei Schlüssel erzeugen
  const getSigner = async () => (signer = await (signerP ||= loadSigner()));

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
    lastState = toAppState(snap, Date.now(), { id: signer?.id, nickname: clean('sync', getPayload() || {})?.nickname });
    onState?.(lastState);
    return lastState;
  }
  async function poll() {
    await getSigner(); // eigene Kennung für mine/me/nameTaken
    if (config.snapshotUrl && Date.now() - snapAt > SNAP_EVERY_MS) {
      try {
        const txt = await req(`${config.snapshotUrl}?t=${Math.floor(Date.now() / 60000)}`); // Cache-Buster pro Minute
        if (txt != null) {
          const fresh = loadState(JSON.parse(txt));
          snapAt = Date.now();
          // nur einen neueren Stand übernehmen: hängt die Action, behält der Client, was er schon gemergt hat
          if (fresh.lastMsgTime > snapTime) { snap = fresh; snapTime = fresh.lastMsgTime; } // Bus ab dessen lastMsgTime neu lesen
        }
      } catch { /* kein/kaputter Snapshot: nur Bus */ }
    }
    const txt = await req(busUrl(config, snap.lastMsgTime));
    if (txt == null) { available = false; return null; }
    const items = await readBus(txt);
    snap = merge(snap, items); // erst nach dem await lesen, sonst gehen parallel gesendete eigene Nachrichten verloren
    available = true; lastPoll = Date.now();
    return publishState();
  }
  async function publish(k, d, keepalive = false) {
    if (!await getSigner()) return null;
    const msg = await makeMessage(signer, k, d);
    // keepalive: kommt auch noch an, wenn die Seite gerade in den Hintergrund geht
    if (await req(`${config.bus}/${config.topic}`, { method: 'POST', body: JSON.stringify(msg), ...(keepalive && { keepalive }) }) == null) { available = false; return null; }
    available = true;
    // sofort anzeigen; der Bus liefert sie beim nächsten Poll noch mal (idempotent). Erst nach dem ersten Poll:
    // in den leeren Stand gemergt, bekäme die eigene sync sonst einen Namen, der längst einer anderen Kennung gehört
    if (lastPoll) snap = merge(snap, [{ msg }]);
    return publishState();
  }

  const api = {
    syncSoon() { clearTimeout(timer); timer = setTimeout(() => api.syncNow(), CONST.SYNC_DEBOUNCE); },
    // force: Rate-Limit einmal umgehen (Umbenennen, App verlassen)
    async syncNow({ force = false, keepalive = false } = {}) {
      const d = live && clean('sync', getPayload() || {});
      if (!d) return null;
      const body = JSON.stringify(d);
      if (body === lastSync) return lastState; // nichts geändert
      const wait = force ? 0 : lastSyncAt + SYNC_MIN_MS - Date.now();
      if (wait > 0) { // Rate-Limit: später nachreichen, mit dem dann aktuellen Stand
        clearTimeout(trail);
        trail = setTimeout(() => { trail = null; api.syncNow(); }, wait);
        trail.unref?.();
        return lastState;
      }
      if (inflight) return inflight.then(() => api.syncNow({ force, keepalive })); // danach mit dem neuen Stand
      clearTimeout(trail); trail = null;
      lastSyncAt = Date.now();
      inflight = publish('sync', d, keepalive).then(r => { if (r) lastSync = body; return r; }).finally(() => { inflight = null; });
      return inflight;
    },
    fetchState() {
      if (!live) { available = false; return Promise.resolve(null); }
      if (polling) return polling;
      if (lastState && available && Date.now() - lastPoll < POLL_MIN_MS) return Promise.resolve(lastState);
      return (polling = poll().finally(() => { polling = null; }));
    },
    // Nur senden, wenn sich der Besitz wirklich ändert: jeder Sieg in der eigenen Arena kostet sonst ntfy-Kontingent
    async claimArena(arenaId, level, leader) {
      const d = live && getPayload() && clean('arena', { arenaId, level, leader });
      if (!d) return null;
      await api.fetchState(); // aktuellen Besitz kennen (im Kampf wird nicht gepollt)
      if (lastState?.nameTaken) return lastState; // der Merge würde sie verwerfen
      const cur = snap.arenas[d.arenaId];
      if (await getSigner() && cur?.ownerId === signer.id && cur.level === d.level) return lastState;
      return publish('arena', d);
    },
    async postEvent(kind, text) {
      const d = live && getPayload() && clean('event', { kind, text });
      if (!d) return null;
      if (lastState?.nameTaken) return lastState;
      const nickname = (await getSigner()) && snap.players[signer.id]?.nickname;
      if (nickname && dupEvent(snap, { at: Date.now(), nickname, ...d })) return lastState; // steht schon im Feed
      return publish('event', d);
    },
    // Online-Kennung für Export/Import: ohne sie ist man auf dem neuen Gerät ein Fremder mit vergebenem Namen
    exportKey() { const j = readKey(); return j ? JSON.stringify(j) : null; },
    importKey(text) {
      let j = text;
      try { if (typeof j === 'string') j = JSON.parse(j); } catch { return false; }
      if (!isJwk(j)) return false;
      try { globalThis.localStorage.setItem(KEY_STORE, JSON.stringify({ kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d })); } catch { return false; }
      signer = signerP = null; lastSync = ''; // ab jetzt mit der mitgebrachten Kennung
      return true;
    },
    get available() { return available; },
    get lastState() { return lastState; },
    get id() { return signer?.id || null; }, // echte Online-Kennung (SHA-256 des Schlüssels), null bis zum ersten Kontakt
    get nameTaken() { return !!lastState?.nameTaken; }, // Name gehört online einer anderen Kennung: umbenennen
  };
  // App verlassen: ausstehenden sync gleich senden, sonst kommt er erst beim nächsten Öffnen an
  if (live) globalThis.document?.addEventListener?.('visibilitychange', () => {
    if (globalThis.document.visibilityState === 'hidden' && trail && Date.now() - lastSyncAt >= FLUSH_MIN_MS) api.syncNow({ force: true, keepalive: true });
  });
  return api;
}
