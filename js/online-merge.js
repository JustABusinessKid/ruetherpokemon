import { RUETHERS, RUETHER_BY_ID, RARITIES, RARITY_BY_ID, ARENAS, ARENA_BY_ID } from './data.js';

// Online-Welt ohne Backend: signierte Nachrichten (ntfy.sh) werden in einen Stand gemergt.
// Reine Funktionen ohne DOM, genutzt vom Client (js/online.js) und von der GitHub Action (tools/online-sync.mjs).
// Regeln wie die alte Higgsfield-API (ruether.server.ts).

export const ONLINE_WINDOW_MS = 10 * 60 * 1000; // „online“ = sync in den letzten 10 Minuten
export const FEED_MAX = 50;
export const BOARD_MAX = 20;
export const MSG_MAX_BYTES = 3500;
export const FUTURE_SLACK_MS = 5 * 60 * 1000;   // Uhren der Geräte dürfen etwas vorgehen
export const BUS_OVERLAP_S = 30; // ntfy schreibt seinen Cache gebündelt: etwas zurück lesen, der Merge ist idempotent
export const KINDS = ['catch', 'level', 'quest', 'fusion', 'achievement']; // Event-Arten der Clients ('arena' erzeugt nur der Merge)
const MSG_KINDS = new Set(['sync', 'arena', 'event']);
const DEX_MAX = RUETHERS.length * RARITIES.length;
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' }, SIG = { name: 'ECDSA', hash: 'SHA-256' };
const subtle = () => globalThis.crypto?.subtle;
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k); // 'constructor', '__proto__' … sind keine Rüther
const PLAYER_ID = /^(legacy:.{2,16}|[\w-]{43})$/;

// ---------- Bereinigen ----------
// Steuerzeichen, Bidi-Overrides und Zero-Width raus; nach Codepoints kürzen (keine halben Emojis)
const JUNK = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
export const str = (v, max) => typeof v === 'string' ? [...v.replace(/\s+/g, ' ').replace(JUNK, '').trim()].slice(0, max).join('').trim() : '';
export const int = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min; };
export function leaderOf(v) {
  if (!v || typeof v !== 'object') return null;
  return own(RUETHER_BY_ID, v.id) && own(RARITY_BY_ID, v.rarity) ? { id: v.id, rarity: v.rarity, level: int(v.level, 1, 20) } : null;
}

// Schema von d je Nachrichtenart; null = ablehnen. Zahlen werden geklemmt wie früher.
export function clean(k, d) {
  if (!d || typeof d !== 'object') return null;
  if (k === 'sync') {
    const nickname = str(d.nickname, 16);
    if (nickname.length < 2) return null;
    return {
      nickname, avatar: own(RUETHER_BY_ID, d.avatar) ? d.avatar : 'christian',
      sats: int(d.sats, 0, 1e9), dex: int(d.dex, 0, DEX_MAX), trophies: int(d.trophies, 0, 100_000),
      mastered: int(d.mastered, 0, ARENAS.length), level: int(d.level, 1, 999), xp: int(d.xp, 0, 1e9), leader: leaderOf(d.leader),
    };
  }
  if (k === 'arena') {
    const leader = leaderOf(d.leader);
    return own(ARENA_BY_ID, d.arenaId) && leader ? { arenaId: d.arenaId, level: int(d.level, 1, 5), leader } : null;
  }
  if (k === 'event') {
    const text = str(d.text, 120);
    return KINDS.includes(d.kind) && text.length >= 3 ? { kind: d.kind, text } : null;
  }
  return null;
}

// ---------- Signatur ----------
// Kanonisches JSON: Schlüssel sortiert, ohne Leerraum, undefined fällt weg
export const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);
export const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const enc = s => new TextEncoder().encode(s);
const idOf = async raw => b64u(await subtle().digest('SHA-256', raw));

export async function newKeyJwk() {
  const kp = await subtle().generateKey(ALGO, true, ['sign', 'verify']);
  return subtle().exportKey('jwk', kp.privateKey);
}
// Signierer aus dem privaten JWK (x/y enthalten den öffentlichen Punkt)
export async function signerFromJwk(jwk) {
  const raw = new Uint8Array([4, ...unb64u(jwk.x), ...unb64u(jwk.y)]);
  const key = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, ALGO, false, ['sign']);
  return { key, pub: b64u(raw), id: await idOf(raw) };
}
export async function makeMessage(signer, k, d, t = Date.now()) {
  const body = { v: 1, k, id: signer.id, t, d };
  const sig = b64u(await subtle().sign(SIG, signer.key, enc(canonical(body))));
  return { ...body, pub: signer.pub, sig };
}

// Prüft eine Nachricht vom Bus. Ergebnis: bereinigte Nachricht oder null.
export async function validate(m, now = Date.now()) {
  try {
    if (!m || typeof m !== 'object' || m.v !== 1 || !MSG_KINDS.has(m.k)) return null;
    if (!/^[\w-]{87}$/.test(m.pub) || !/^[\w-]{43}$/.test(m.id) || !/^[\w-]{86}$/.test(m.sig)) return null;
    if (!Number.isFinite(m.t) || m.t <= 0 || m.t > now + FUTURE_SLACK_MS) return null;
    if (enc(JSON.stringify(m)).length > MSG_MAX_BYTES) return null;
    const raw = unb64u(m.pub);
    if (await idOf(raw) !== m.id) return null;
    const key = await subtle().importKey('raw', raw, ALGO, false, ['verify']);
    if (!await subtle().verify(SIG, key, unb64u(m.sig), enc(canonical({ v: m.v, k: m.k, id: m.id, t: m.t, d: m.d })))) return null;
    const d = clean(m.k, m.d);
    return d ? { v: 1, k: m.k, id: m.id, pub: m.pub, t: m.t, d, sig: m.sig } : null;
  } catch {
    return null; // kaputtes base64, ungültiger Punkt …
  }
}

// Poll-URL für ntfy ab dem letzten gemergten Stand (ohne Stand: die ganzen 12 h)
export const busUrl = ({ bus, topic }, lastMsgTime) => `${bus}/${topic}/json?poll=1&since=${lastMsgTime ? lastMsgTime - BUS_OVERLAP_S : '12h'}`;

// ntfy-JSON-Stream (eine Zeile pro Nachricht) → [{ time, msg }]; msg null = ungültig (zählt nur für lastMsgTime)
export async function readBus(text, now = Date.now()) {
  const out = [];
  for (const line of String(text).split('\n')) {
    let e, m = null;
    try { e = JSON.parse(line); } catch { continue; }
    if (e?.event !== 'message') continue;
    try { m = JSON.parse(e.message); } catch { /* kein JSON */ }
    out.push({ time: Number(e.time) || 0, msg: await validate(m, now) });
  }
  return out;
}

// ---------- Stand ----------
// { v, lastMsgTime (ntfy-Zeit in s), players: { [id]: { nickname, avatar, sats, dex, trophies, mastered, level, xp, leader, t } },
//   arenas: { [arenaId]: { ownerId, leader, level, since } }, events: [{ at, nickname, kind, text, m }] (neueste zuerst) }
export const emptyState = () => ({ v: 1, lastMsgTime: 0, players: {}, arenas: {}, events: [] });
const time = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0;

// Stand aus Datei/Snapshot laden und dabei bereinigen (kaputte Einträge fallen weg)
export function loadState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  s.lastMsgTime = time(raw.lastMsgTime);
  for (const [id, p] of Object.entries(raw.players || {})) {
    const d = clean('sync', p);
    if (d && PLAYER_ID.test(id)) s.players[id] = { ...d, t: time(p.t) };
  }
  for (const [aid, a] of Object.entries(raw.arenas || {})) {
    if (own(ARENA_BY_ID, aid) && own(s.players, a?.ownerId)) s.arenas[aid] = { ownerId: a.ownerId, leader: leaderOf(a.leader), level: int(a.level, 1, 5), since: time(a.since) };
  }
  for (const e of Array.isArray(raw.events) ? raw.events : []) {
    if (!e || (!KINDS.includes(e.kind) && e.kind !== 'arena')) continue;
    s.events.push({ at: time(e.at), nickname: str(e.nickname, 16), kind: e.kind, text: str(e.text, 160), m: str(e.m, 32) });
  }
  s.events.sort((a, b) => b.at - a.at).splice(FEED_MAX);
  return s;
}

const nickKey = n => n.toLocaleLowerCase('de');
function addEvent(s, e) {
  if (s.events.some(x => x.m === e.m)) return; // schon gemergt (Snapshot + Bus überlappen)
  s.events.push(e);
  s.events.sort((a, b) => b.at - a.at).splice(FEED_MAX);
}
function apply(s, { k, id, t, d, sig }) {
  const me = s.players[id];
  if (k === 'sync') {
    if (me && t <= me.t) return; // alt oder doppelt
    const other = Object.keys(s.players).find(pid => pid !== id && nickKey(s.players[pid].nickname) === nickKey(d.nickname));
    if (other) {
      if (!other.startsWith('legacy:')) return; // Nickname gehört der ersten id
      delete s.players[other]; // Altspieler: die neue id übernimmt Name und Arenen
      for (const a of Object.values(s.arenas)) if (a.ownerId === other) a.ownerId = id;
    }
    s.players[id] = { ...d, t };
    return;
  }
  if (!me) return; // wie früher: nur bekannte Spieler
  const m = sig.slice(0, 16);
  if (k === 'arena') {
    const cur = s.arenas[d.arenaId];
    if (cur && t <= cur.since) return;
    const prev = cur && s.players[cur.ownerId]?.nickname;
    s.arenas[d.arenaId] = { ownerId: id, leader: d.leader, level: d.level, since: t };
    const taken = prev && prev !== me.nickname ? ` und ${prev} rausgeworfen` : '';
    addEvent(s, { at: t, nickname: me.nickname, kind: 'arena', text: `hat ${ARENA_BY_ID[d.arenaId].name} erobert (Lv. ${d.level})${taken}.`, m });
  } else addEvent(s, { at: t, nickname: me.nickname, kind: d.kind, text: d.text, m });
}

// Geprüfte Nachrichten ([{ time, msg }]) in einen neuen Stand mergen. Idempotent: Snapshot und Bus dürfen sich überlappen.
// Ohne time (eigene, gerade gesendete Nachricht) bleibt lastMsgTime stehen.
export function merge(state, items) {
  const s = structuredClone(state);
  for (const { time: tm, msg } of [...items].sort((a, b) => (a.msg?.t || 0) - (b.msg?.t || 0))) {
    if (tm > s.lastMsgTime) s.lastMsgTime = tm;
    if (msg) apply(s, msg);
  }
  return s;
}

// Form von online.lastState, wie sie app.js/screens.js schon kennen
export function toAppState(s, now = Date.now()) {
  const on = p => p.t > now - ONLINE_WINDOW_MS;
  const arenas = {};
  for (const [aid, a] of Object.entries(s.arenas)) {
    const owner = s.players[a.ownerId]?.nickname;
    if (owner) arenas[aid] = { owner, leader: a.leader, level: a.level, since: a.since };
  }
  const players = Object.values(s.players);
  const board = [...players].sort((a, b) => b.trophies - a.trophies || b.mastered - a.mastered || b.dex - a.dex || b.sats - a.sats).slice(0, BOARD_MAX);
  return {
    ok: true, now, arenas,
    leaderboard: board.map(p => ({ nickname: p.nickname, avatar: p.avatar, sats: p.sats, dex: p.dex, trophies: p.trophies, mastered: p.mastered, level: p.level, leader: p.leader, online: on(p) })),
    online: players.filter(on).length,
    feed: s.events.map(({ at, nickname, kind, text }) => ({ at, nickname, kind, text })),
  };
}
