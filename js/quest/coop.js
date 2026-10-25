// v11 §4 Koop-Quest: Netz-Kleber für view.js. Der Host rechnet, der Gast schickt nur Befehle und zeigt Schnappschüsse.
// Gast → Host: qr (Bilder geladen), qc { cmd }, qp { on }. Host → Gast: qs { s: questSnapshot, ev, p } alle SEND_MS.
import { TIMING } from '../net/link.js';

// SILENT_MS: so lange ohne qs (Verbindung steht) gibt der Gast auf; länger als TIMEOUT_MS, denn kommt gar nichts mehr, meldet
// der Link vorher 'lost' (dann wartet der Gast). FIRST_MS: dasselbe vor dem ersten qs (Host lädt evtl. noch)
export const COOP = { SEND_MS: 200, MAX_UNITS: 4, SILENT_MS: TIMING.TIMEOUT_MS + 2000, FIRST_MS: 20_000 };

const CMDS = new Set(['move', 'stop', 'interact', 'ability', 'extract', 'abort']);
const fin = v => typeof v === 'number' && Number.isFinite(v);
const idx = v => Number.isInteger(v) && v >= 0 && v < 10_000; // Index in Einheiten/Gegnern/Türen/Objekten; die Engine prüft, ob es ihn gibt
const pt = p => (p && typeof p === 'object' && fin(p.x) && fin(p.y) ? { x: p.x, y: p.y } : null);

// Befehl des Gasts (Daten von außen): nur erlaubte Arten, nur bekannte Felder mit passenden Typen, by = 'guest' (überschreibt).
// units = Anzahl Einheiten. Liefert den sauberen Befehl oder null.
export function cleanCmd(c, units) {
  if (!c || typeof c !== 'object' || !CMDS.has(c.type)) return null;
  const out = { type: c.type, by: 'guest' };
  if (c.type === 'extract' || c.type === 'abort') return out;
  if (!(Number.isInteger(c.unit) && c.unit >= 0 && c.unit < units)) return null;
  out.unit = c.unit;
  if (c.type === 'move') {
    if (!(out.to = pt(c.to))) return null;
  } else if (c.type === 'interact') {
    const o = c.obj;
    if (idx(o)) out.obj = o;
    else if (o && typeof o === 'object' && idx(o.unit)) out.obj = { unit: o.unit };
    else if (!(out.obj = pt(o))) return null;
  } else if (c.type === 'ability') {
    if (typeof c.ability !== 'string') return null;
    const t = c.target && typeof c.target === 'object' ? c.target : {};
    out.ability = c.ability;
    out.target = {};
    for (const k of ['door', 'enemy', 'obj']) if (idx(t[k])) out.target[k] = t[k];
    if (fin(t.x) && fin(t.y)) Object.assign(out.target, { x: t.x, y: t.y });
    const t2 = pt(c.target2);
    if (t2) out.target2 = t2;
    if (c.dir === 'h' || c.dir === 'v') out.dir = c.dir;
    if (idx(c.face)) out.face = c.face;
  }
  return out;
}

// Zusammenfassung beim Gast (aus dem end-Event des Hosts und seinem Schnappschuss, Daten von außen, Spec §0): der Ergebnis-Screen
// setzt sie in HTML, also nur Zahlen, bekannte Ergebnisse und Text. Team und setup baut der Gast selbst (view.js finish).
const RESULTS = new Set(['success', 'fail', 'abort']);
const nat = v => (fin(v) ? Math.max(0, Math.round(v)) : 0);
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
export function cleanSummary(s) {
  const o = obj(s), ob = obj(o.objective);
  return {
    result: RESULTS.has(o.result) ? o.result : 'abort', reason: typeof o.reason === 'string' ? o.reason.slice(0, 20) : null,
    score: nat(o.score), objective: { done: nat(ob.done), total: nat(ob.total), min: nat(ob.min) }, timeMs: nat(o.timeMs),
    alarmFree: o.alarmFree === true, delivered: nat(o.delivered), leftBehind: nat(o.leftBehind), kieser: nat(o.kieser), fine: nat(o.fine),
    text: typeof o.text === 'string' ? o.text.slice(0, 300) : '', setup: o.setup ?? null, team: Array.isArray(o.team) ? o.team : [],
  };
}
