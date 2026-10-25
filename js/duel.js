import { CONST, RUETHER_BY_ID, RARITY_BY_ID } from './data.js';
import { makeFighter } from './battle.js';

// v11 Arena-Duell 3 gegen 3 (Spec §3.1): reine Engine ohne DOM und ohne Zufall, deterministisch.
// Seite a = Host, b = Gast. Gegner jeder Seite ist immer der aktive Rüther der anderen Seite.
// tickDuel mutiert den Zustand und liefert JSON-feste Events (Kämpfer per Seite + Teamindex, Attacken per Index).
// Der Host rechnet allein (host-autoritativ, §3.2), der Gast zeichnet nur Schnappschüsse (duelSnapshot/fromDuelSnapshot).

export const DUEL = {
  DURATION: 90_000, WARN: 1000, HP_MULT: 2, STEP: 50, SEND_MS: 100, MIN_REWARD_MS: 30_000,
  // LAG_MAX: Funkzeit-Gutschrift (s.lag) höchstens so viele ms; STUN_SAFE: nach einer Betäubung so lange Schutz vor der nächsten
  LAG_MAX: 400, STUN_SAFE: 2000,
  REWARD: { win: { sats: 300, xp: 150 }, lose: { sats: 100, xp: 50 }, draw: { sats: 150, xp: 75 } },
};
export const TEAM_MAX = 3;

const SIDES = ['a', 'b'];
const other = k => (k === 'a' ? 'b' : 'a');
const alive = f => f.btc > 0;
const stunned = (f, t) => f.status.stunUntil > t;
const weak = (f, t) => (f.status.weakenedUntil > t ? CONST.WEAKEN_FACTOR : 1);
const int = v => Number.isInteger(v);
// Feindliche Attacken werden angekündigt; reine Selbst-Attacken (Unlimited Credits, Familientreffen) wirken sofort
export const hostile = atk => atk.damage > 0 || !!atk.poison || !!atk.stun || !!atk.weaken;

function heal(f, n) { const h = Math.max(0, Math.min(Math.floor(n), f.maxBtc - f.btc)); f.btc += h; return h; }
function hurt(f, n) { const d = Math.max(0, Math.min(Math.floor(n), f.btc)); f.btc -= d; return d; }

// Picks aus der Lobby → Kampfwerte, auf beiden Geräten gleich (Spec §2): unbekannte id verwerfen, unbekannte Seltenheit
// → normal, Level 1–20; höchstens 3. Werte des Partners werden so nie übernommen, sondern neu berechnet.
export function duelFighters(picks) {
  const out = [];
  for (const p of Array.isArray(picks) ? picks : []) {
    const def = p && RUETHER_BY_ID[p.id];
    if (!def) continue;
    const level = Math.max(1, Math.min(CONST.LEVEL_MAX, Math.floor(Number(p.level)) || 1));
    const rarity = RARITY_BY_ID[p.rarity] ? p.rarity : 'normal';
    out.push(makeFighter(def, { uid: typeof p.uid === 'string' ? p.uid : null, rarity, level }));
    if (out.length === TEAM_MAX) break;
  }
  return out;
}

function prep(f) {
  const c = structuredClone(f);
  c.maxBtc = c.btc = Math.round(f.maxBtc * DUEL.HP_MULT);
  c.energy = 0; c.used = {}; c.status = { poison: null, stunUntil: 0, weakenedUntil: 0, stunSafeUntil: 0 };
  return c;
}
const freshSide = team => ({ team: team.slice(0, TEAM_MAX).map(prep), active: 0, tapCooldown: 0, charge: null, summons: [] });

// lag: Funkzeit-Gutschrift je Ziel-Seite in ms. Der Gast sieht eine Ladung erst einen Funkweg (plus Sendetakt) später, und sein
// Ausweichen braucht noch einen zum Host; Ladungen gegen ihn kündigen sich so lange länger an (der Host setzt s.lag.b aus der
// gemessenen Umlaufzeit). Steht im Zustand: Schnappschuss und Determinismus bleiben.
export function createDuel({ a, b, duration = DUEL.DURATION }) {
  return { time: 0, duration, over: false, winner: null, reason: null, lag: { a: 0, b: 0 }, a: freshSide(a), b: freshSide(b) };
}
const lagOf = (s, k) => Math.max(0, Math.min(DUEL.LAG_MAX, Math.round(Number(s.lag?.[k])) || 0));

function finish(s, winner, reason, ev) {
  s.over = true; s.winner = winner; s.reason = reason;
  ev.push({ type: 'end', winner, reason });
  return ev;
}
// Für Verbindungsabbruch (winner null, reason 'lost') und Aufgeben außerhalb der Schleife; ist es schon vorbei, nichts
export function endDuel(s, winner, reason) {
  return s.over ? [] : finish(s, winner, reason, []);
}

function cancel(s, k, ev) {
  const side = s[k], c = side.charge;
  if (!c) return;
  side.charge = null;
  ev.push({ type: 'cancel', side: k, fighter: c.fighter, index: c.index });
}

// Schritt 2 je Seite: Cooldown, Aufgeben, Wechsel, Tipp, Spezial-Start. true = Duell vorbei (Aufgeben)
function sideStep(s, k, inp, dt, ev) {
  const side = s[k], foe = s[other(k)], t = s.time;
  side.tapCooldown = Math.max(0, side.tapCooldown - dt);
  if (inp.quit === true) { finish(s, other(k), 'quit', ev); return true; }
  const sw = inp.switchTo;
  if (int(sw) && sw !== side.active && side.team[sw] && alive(side.team[sw])) {
    cancel(s, k, ev); // Mining der Ladung ist weg
    side.active = sw;
    ev.push({ type: 'switch', side: k, to: sw });
  }
  const me = side.team[side.active], target = foe.team[foe.active];
  if (Number(inp.taps) >= 1) { // höchstens ein Tipp pro Schritt
    if (stunned(me, t)) ev.push({ type: 'stunnedTap', side: k });
    else if (side.tapCooldown <= 0) {
      const damage = hurt(target, CONST.FAST_DAMAGE * me.power * weak(me, t));
      me.energy = Math.min(CONST.MAX_ENERGY, me.energy + CONST.FAST_ENERGY);
      side.tapCooldown = CONST.FAST_COOLDOWN;
      ev.push({ type: 'fast', side: k, damage });
    }
  }
  if (inp.special != null) {
    const index = inp.special, atk = int(index) ? me.attacks[index] : null;
    if (!atk || side.charge || stunned(me, t) || me.energy < atk.cost || (atk.once && me.used[atk.name])) {
      ev.push({ type: 'specialDenied', side: k, index: int(index) ? index : -1 });
    } else {
      me.energy -= atk.cost;
      if (atk.once) me.used[atk.name] = true;
      if (hostile(atk)) {
        const ms = DUEL.WARN + lagOf(s, other(k)); // gegen den Gast mit Funkzeit-Gutschrift
        side.charge = { index, fighter: side.active, firesAt: t + ms, ms, dodged: false };
        ev.push({ type: 'charge', side: k, fighter: side.active, index, ms });
      } else {
        ev.push({ type: 'special', side: k, fighter: side.active, index, damage: 0, dodged: false });
        selfEffects(s, k, me, atk, ev);
      }
    }
  }
  return false;
}

function selfEffects(s, k, me, atk, ev) {
  if (atk.heal) ev.push({ type: 'heal', side: k, amount: heal(me, atk.heal) });
  if (atk.summon) {
    s[k].summons = atk.summon.map(x => ({ id: x.id, name: x.name, damage: x.damage, power: me.power, nextAt: s.time + CONST.SUMMON_INTERVAL, until: s.time + atk.summonMs }));
    ev.push({ type: 'summoned', side: k, ids: atk.summon.map(x => x.id), names: atk.summon.map(x => x.name), ms: atk.summonMs });
  }
}

// Schritt 4: fällige Ladung feuert auf den dann aktiven Gegner
function fire(s, k, ev) {
  const side = s[k], c = side.charge, t = s.time;
  if (!c || t < c.firesAt) return;
  side.charge = null;
  const me = side.team[c.fighter], atk = me.attacks[c.index], o = other(k), foe = s[o], target = foe.team[foe.active];
  const factor = weak(me, t) * (c.dodged ? CONST.DODGE_FACTOR : 1);
  const damage = atk.damage > 0 ? hurt(target, atk.damage * me.power * factor) : 0;
  ev.push({ type: 'special', side: k, fighter: c.fighter, index: c.index, damage, dodged: c.dodged });
  if (!c.dodged) {
    if (atk.poison) { target.status.poison = { perSec: atk.poison.perSec, until: t + atk.poison.ms, acc: 0 }; ev.push({ type: 'poisoned', side: o, ms: atk.poison.ms }); }
    // Betäubt bzw. gerade erst wieder frei: keine neue Betäubung (sonst sperrt eine billige Stun-Attacke das ganze Duell)
    if (atk.stun && !(target.status.stunSafeUntil > t)) {
      target.status.stunUntil = t + atk.stun;
      target.status.stunSafeUntil = t + atk.stun + DUEL.STUN_SAFE;
      ev.push({ type: 'stun', side: o, ms: atk.stun });
    }
    if (atk.weaken) { target.status.weakenedUntil = t + atk.weaken; ev.push({ type: 'weaken', side: o, ms: atk.weaken }); }
  }
  if (atk.drain && damage > 0) ev.push({ type: 'heal', side: k, amount: heal(me, damage) });
  selfEffects(s, k, me, atk, ev);
}

// Schritt 5: Helfer schlagen alle SUMMON_INTERVAL den gegnerischen Aktiven (Ausweichen hilft nicht), abgelaufene fliegen raus
function helpers(s, k, ev) {
  const side = s[k], foe = s[other(k)], target = foe.team[foe.active];
  for (const su of side.summons) {
    while (su.nextAt <= s.time && su.nextAt <= su.until) {
      ev.push({ type: 'summon', side: k, id: su.id, damage: hurt(target, su.damage * su.power) });
      su.nextAt += CONST.SUMMON_INTERVAL;
    }
  }
  side.summons = side.summons.filter(su => su.nextAt <= su.until);
}

// Gift tickt nur am jeweils aktiven Rüther (wie im Arena-Kampf); side = Ziel
function poison(s, k, dt, ev) {
  const f = s[k].team[s[k].active], p = f.status.poison;
  if (!p) return;
  p.acc += dt;
  while (p.acc >= 1000 && alive(f)) {
    p.acc -= 1000;
    ev.push({ type: 'poison', side: k, damage: hurt(f, p.perSec) });
  }
  if (s.time >= p.until) f.status.poison = null;
}

// Schritt 6: K.o. des Aktiven → Ladung bricht ab, automatischer Wechsel zum ersten Lebenden; false = Seite ist raus
function koStep(s, k, ev) {
  const side = s[k];
  if (alive(side.team[side.active])) return true;
  ev.push({ type: 'faint', side: k, fighter: side.active });
  cancel(s, k, ev); // Helfer bleiben: sie gehören der Seite, nicht dem Rüther
  const next = side.team.findIndex(alive);
  if (next === -1) return false;
  side.active = next;
  ev.push({ type: 'switch', side: k, to: next });
  return true;
}

const share = side => side.team.reduce((n, f) => n + f.btc, 0) / side.team.reduce((n, f) => n + f.maxBtc, 0);

// inputs = { a?: Input, b?: Input }, Input = { taps?, dodge?, special?, switchTo?, quit? }. Schrittfolge laut Spec §3.1
export function tickDuel(s, dt, inputs = {}) {
  const ev = [];
  if (s.over) return ev;
  s.time += dt;
  for (const k of SIDES) if (sideStep(s, k, inputs[k] || {}, dt, ev)) return ev;
  for (const k of SIDES) {
    const c = s[other(k)].charge;
    if (inputs[k]?.dodge === true && c && !c.dodged) { c.dodged = true; ev.push({ type: 'dodge', side: k }); }
  }
  for (const k of SIDES) fire(s, k, ev);
  for (const k of SIDES) helpers(s, k, ev);
  for (const k of SIDES) poison(s, k, dt, ev);
  const inA = koStep(s, 'a', ev), inB = koStep(s, 'b', ev);
  if (!inA && !inB) return finish(s, 'draw', 'ko', ev);
  if (!inA) return finish(s, 'b', 'ko', ev);
  if (!inB) return finish(s, 'a', 'ko', ev);
  if (s.time >= s.duration) {
    const pa = share(s.a), pb = share(s.b);
    return finish(s, pa > pb ? 'a' : pb > pa ? 'b' : 'draw', 'timeout', ev);
  }
  return ev;
}

// ---------- Schnappschuss (Host → Gast, alle SEND_MS) ----------
const STRIP = ({ attacks, ...f }) => f;
export function duelSnapshot(s) {
  const side = x => ({ ...x, team: x.team.map(STRIP), charge: x.charge && { ...x.charge }, summons: x.summons.map(su => ({ ...su })) });
  return structuredClone({ ...s, a: side(s.a), b: side(s.b) });
}

// Prüft den Schnappschuss (Daten von außen, Spec §0) und ergänzt attacks aus data.js. Kaputt → null (der Gast verwirft ihn)
const num = v => typeof v === 'number' && Number.isFinite(v);
function okFighter(f) {
  return f && RUETHER_BY_ID[f.id] && num(f.btc) && num(f.maxBtc) && f.maxBtc > 0 && num(f.power) && num(f.energy)
    && f.status && typeof f.status === 'object' && num(f.status.stunUntil) && num(f.status.weakenedUntil);
}
function okSide(x) {
  if (!x || !Array.isArray(x.team) || !x.team.length || x.team.length > TEAM_MAX || !x.team.every(okFighter)) return false;
  if (!int(x.active) || !x.team[x.active] || !num(x.tapCooldown) || !Array.isArray(x.summons)) return false;
  const c = x.charge;
  return c == null || (int(c.fighter) && x.team[c.fighter] && int(c.index) && !!RUETHER_BY_ID[x.team[c.fighter].id].attacks[c.index] && num(c.firesAt));
}
export function fromDuelSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || !num(snap.time) || !num(snap.duration) || !okSide(snap.a) || !okSide(snap.b)) return null;
  const s = structuredClone(snap);
  for (const k of SIDES) {
    for (const f of s[k].team) { f.attacks = RUETHER_BY_ID[f.id].attacks; f.used ||= {}; }
    s[k].charge ??= null;
  }
  s.over = !!s.over;
  return s;
}

// ---------- Ergebnis und Belohnung ----------
export function duelOutcome(s, side) {
  if (!s.over) return null;
  return { won: s.winner === side, draw: s.winner === 'draw', reason: s.reason, timeMs: s.time };
}
// Abbruch: nichts. Wer aufgibt: nichts. Sieg durch Aufgeben erst ab MIN_REWARD_MS (kein Start-und-gleich-Aufgeben-Farmen)
export function duelReward({ won, draw, reason, timeMs }) {
  const none = { sats: 0, xp: 0 };
  if (reason === 'lost') return none;
  if (reason === 'quit') return won && timeMs >= DUEL.MIN_REWARD_MS ? { ...DUEL.REWARD.win } : none;
  return { ...DUEL.REWARD[won ? 'win' : draw ? 'draw' : 'lose'] };
}
