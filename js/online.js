import { CONST } from './data.js';

// Backend-Client. Alles best effort: Timeout, Fehler schlucken, available-Flag.
export function createOnline({ apiBase, getPayload, onState }) {
  let available = false, lastState = null, timer = null, inflight = false;
  async function call(path, body) {
    if (!apiBase) { available = false; return null; } // offline-Modus (lokale Tests)
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONST.API_TIMEOUT);
    try {
      const res = await fetch(apiBase + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      available = res.ok;
      if (data?.ok && Array.isArray(data.leaderboard)) { lastState = data; onState?.(data); }
      return res.ok ? data : null;
    } catch {
      available = false;
      return null;
    } finally {
      clearTimeout(to);
    }
  }
  const api = {
    syncSoon() { clearTimeout(timer); timer = setTimeout(() => api.syncNow(), CONST.SYNC_DEBOUNCE); },
    async syncNow() {
      const p = getPayload();
      if (!p || inflight) return null;
      inflight = true;
      try { return await call('/api/sync', p); } finally { inflight = false; }
    },
    fetchState() { return call('/api/state'); },
    claimArena(arenaId, level, leader) {
      const p = getPayload();
      if (!p || !leader) return Promise.resolve(null);
      return call('/api/arena', { token: p.token, arenaId, level, leader });
    },
    postEvent(kind, text) {
      const p = getPayload();
      if (!p) return Promise.resolve(null);
      return call('/api/event', { token: p.token, kind, text });
    },
    get available() { return available; },
    get lastState() { return lastState; },
  };
  return api;
}
