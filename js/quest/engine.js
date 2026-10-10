// Haunebu-Quests: Kommando-Engine (Draufsicht wie Commandos 2). Rein, ohne DOM, deterministisch mit rng.
// Raster in Kacheln, Positionen als Fließkomma (Kachelmitte = x+0.5), Richtungen in Radiant (0 = Osten, π/2 = Süden), Zeiten in ms.
// tick() mutiert den Zustand und liefert Events für die Darstellung (Positionen, Ziele, Dauern für Animationen).
import { findPath, castRay, lineOfSight } from './path.js';
import { MISSION_BY_ID, pickVariant } from './missions.js';

// Gegner-Typen (Spec §5.3). sight/angle: Kegel in Kacheln/Grad, speed Kacheln/s, dps Nahkampf pro s.
export const ENEMY_TYPES = {
  pinguin: {
    name: 'Wachpinguin', sight: 5, angle: 90, speed: 2.2, hp: 60, dps: 6, sprite: 'q-pinguin',
    lines: { sus: ['Quäk?', 'Hat da wer gehustet?', 'Riecht nach Dosenbier ...'], alert: ['QUÄÄÄK! Eindringling!', 'Alarm! Die Münzen!'], calm: ['War wohl nur ein Eisbär.', 'Zurück zum Watscheln.'], wake: ['Wo ist mein Fisch?', 'Watt war dat denn?'] },
  },
  drohne: {
    name: 'Tachionen-Drohne', sight: 7, angle: 60, speed: 3.4, hp: 40, dps: 4, flying: true, sprite: 'q-drohne',
    lines: { sus: ['*surr* Unbekannter Hash?', '*piep?*'], alert: ['BIEP BIEP. Unbefugter Zugriff!', 'FEHLER 418: Rüther erkannt.'], calm: ['*surr* Fehlalarm.', 'Neustart abgeschlossen.'], wake: ['*rebootet*', 'Firmware 0.0.1 geladen.'] },
  },
  goebbels: {
    name: 'Goebbels', sight: 5, angle: 100, speed: 2.4, hp: 80, dps: 5, megafon: true, sprite: 'boss-goebbels',
    lines: { sus: ['Wer flüstert da ohne Megafon?', 'Das hab ich gehört!'], alert: ['*Megafon quietscht* ALAAARM!', '*Rückkopplung* ALLE HERKOMMEN!'], calm: ['Hmpf. Batterie leer.', 'Ich hab nur geübt.'], wake: ['Mein Megafon! Wo ist mein Megafon?'] },
  },
  himmler: {
    name: 'Himmler', sight: 4, angle: 140, speed: 1.8, hp: 70, dps: 5, clipboard: true, sprite: 'boss-himmler',
    lines: { sus: ['Das steht nicht auf meinem Klemmbrett.', 'Moment, ich zähle nach ...'], alert: ['Besuch ohne Formular! ALARM!', 'Das gibt einen Eintrag!'], calm: ['Ich hake das mal ab.', 'Strich gemacht. Weiter.'], wake: ['Wo war ich? Ach ja, Seite 412.'] },
  },
  detektiv: {
    name: 'Ladendetektiv', sight: 6, angle: 80, speed: 2.8, hp: 70, dps: 7, sprite: 'q-detektiv',
    lines: { sus: ['Moment mal, Freundchen ...', 'Hab ich dich nicht schon mal gesehen?'], alert: ['Taschenkontrolle! SOFORT!', 'Halt! Der Kassenbon!'], calm: ['Nur ein Kunde. Kauft eh nix.', 'Ich behalt dich im Auge.'], wake: ['Wer hat das Licht ausgemacht?'] },
  },
};

// Kräfte (Spec §5.4). target: 'door' | 'point' | 'enemy' | 'self' | 'vaultOrDrone'. range in Kacheln, cd in ms.
// icon = art/fx-<icon>.png. Angrenzend (Tresor) zählt mit 1,5 Kacheln, damit auch die Diagonale geht. Weicher Trennstrich (u00AD) im Namen = Trennstelle im Kreismenü.
export const ABILITIES = {
  plus70: { id: 'plus70', unit: 'christian', name: 'Plus 70 Prozent', icon: 'chart-up', target: 'door', range: 1.5, cd: 8000, desc: 'Öffnet eine verschlossene Tür. Der Kurs steigt, die Tür auch.' },
  beer: { id: 'beer', unit: 'christian', name: 'Werfen mit Dosenbier', icon: 'beer-can', target: 'point', range: 6, cd: 12_000, desc: 'Scheppern: Gegner in 5 Kacheln gehen 6 s nachsehen.' },
  family: { id: 'family', unit: 'hildegard', name: 'Familientreffen', icon: 'family', target: 'self', range: 5, cd: 60_000, desc: 'Christian und Micha rennen herein und fesseln die 2 nächsten Gegner in 5 Kacheln. Nur im Kampf.' },
  handbag: { id: 'handbag', unit: 'hildegard', name: 'Handtaschen-Hieb', icon: 'handbag', target: 'enemy', range: 1.2, cd: 6000, desc: '15 s KO. Leise, wenn er dich nicht sieht.' },
  gas: { id: 'gas', unit: 'viktor', name: 'Giftgas-Wand', icon: 'gas', target: 'point', range: 5, cd: 20_000, desc: '3×3-Wolke für 10 s. Blockiert die Sicht, wer drin steht, hustet.' },
  argue: { id: 'argue', unit: 'viktor', name: 'Ungeschlagene Argumentations\u00ADlogik', icon: 'speech', target: 'enemy', range: 3, los: true, cd: 15_000, desc: 'Der Gegner steht 8 s sprachlos da.' },
  controller: { id: 'controller', unit: 'micha', name: 'Controllerwurf', icon: 'controller', target: 'enemy', range: 6, los: true, cd: 12_000, desc: 'Fernkampf-KO für 10 s, braucht Sichtlinie.' },
  wallet: { id: 'wallet', unit: 'micha', name: 'Hardware-Wallet-Umbau', icon: 'wallet', target: 'vaultOrDrone', range: 5, vaultRange: 1.5, cd: 25_000, desc: 'Am Tresor sofort volle Taschen. Eine Drohne in 5 Kacheln ist 10 s aus.' },
  mms: { id: 'mms', unit: 'ramona', name: 'Abgelaufene M&Ms', icon: 'mms', target: 'point', range: 4, cd: 18_000, desc: 'Köder: Der nächste Wachgänger in 6 Kacheln isst und ist 20 s KO.' },
  credits: { id: 'credits', unit: 'ramona', name: 'Unlimited Credits', icon: 'bags', target: 'enemy', range: 1.2, cd: 30_000, desc: 'Bestechung: Ein Gegner direkt neben dir ist 25 s untätig.' },
};
export const abilitiesFor = unitId => Object.values(ABILITIES).filter(a => a.unit === unitId);

const SPEED = 3, SPEED_SLOW = { viktor: 2.6 }, ITEM_SLOW = 0.6, CARRY_MAX = 2;
const ACT = { vault: 'steal', sabotage: 'sabotage', item: 'fetch', plug: 'unplug' };
const ACT_MS = { steal: 3000, sabotage: 4000, fetch: 5000, unplug: 4000, revive: 3000 };
const REACH = 1.5, REVIVE_HP = 0.4;
const SUS_SHOW = 0.3, SUS_DECAY = 0.15, TOUCH = 0.9;
const ALARM_STEP = 0.34, ALARM_DECAY = 0.02, ALARM_OFF = 0.5, FULL_CONE = 1.25;
const REINFORCE_MS = 20_000, REINFORCE_N = 2, REINFORCE_MAX = 8;
const MELEE = 1.3, SWING_MS = 1000, DEFEND = 8, HUNT_SPEED = 1.1;
// Gegnerschaden wächst mit der Teamstärke (Ø maxBtc × power / DMG_REF), sonst ist Kampf für Quest-Teams (alle Arenen gemeistert) gefahrlos
const DMG_REF = 100;
const SHOUT_R = 6, LOST_MS = 8000, LOOK_MS = 3000, POST_LOOK_MS = 2500, NOISE_MS = 6000, TURN = 4;
const NOISE_R = { can: 5, hieb: 4 }, BAIT_R = 6, BAIT_MS = 30_000;
const STUN_MS = { handbag: 15_000, argue: 8000, controller: 10_000, hack: 10_000, bribe: 25_000, eat: 20_000 };
const ARGUE = 'Deutsche Bank ist kein Geringverdiener.';

const WALK = new Set('.DPX~'), OPAQUE = new Set('#LCSK~'), SOLID = new Set('#LCSK');
const CONE_ON = new Set(['patrol', 'suspicious', 'investigate', 'alert', 'distracted']);
const CALM = new Set(['patrol', 'suspicious', 'investigate', 'distracted']); // ablenkbar
const TIMED = new Set(['stunned', 'eating', 'bribed']);

const FAIL = {
  down: 'Liegt flach.', cd: 'Noch nicht bereit.', carry: 'Mit der PS3 im Arm geht das nicht.', target: 'Kein gültiges Ziel.',
  path: 'Da komm ich nicht hin.', full: 'Taschen voll.', empty: 'Leer. Nur ein Zettel: „Bin beim Halving.“', done: 'Schon erledigt.',
  taken: 'Die trägt schon jemand.', noEnemy: 'Kein Gegner in der Nähe. Die Familie bleibt zu Hause.', sight: 'Keine Sichtlinie.',
  ability: 'Das kann der nicht.', extract: 'Abheben geht erst, wenn das Ziel erfüllt ist und alle auf der Plattform stehen.',
};
const END_TEXT = { allDown: 'Alle liegen flach. Die Haunebu fliegt ohne euch.', time: 'Die Zeit ist um.', late: 'Die Zeit ist um. Ziel erfüllt, aber die Haunebu ist ohne euch abgehoben.', abort: 'Abgebrochen. Die Haunebu wartet nicht.' };

const rad = d => d * Math.PI / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const angDiff = (a, b) => { const d = (b - a) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };
const mid = o => ({ x: o.x + 0.5, y: o.y + 0.5 });
const line = (st, e, kind) => { const l = ENEMY_TYPES[e.type].lines[kind]; return l?.length ? l[Math.floor(st.rng() * l.length) % l.length] : null; };

export const tileAt = (st, x, y) => {
  x = Math.floor(x); y = Math.floor(y);
  return x < 0 || y < 0 || x >= st.w || y >= st.h ? '#' : st.tiles[y * st.w + x];
};
const walkable = st => (x, y) => WALK.has(st.tiles[y * st.w + x]);
const blocker = st => (x, y) => x < 0 || y < 0 || x >= st.w || y >= st.h || OPAQUE.has(st.tiles[y * st.w + x]) || st.gas[y * st.w + x] > st.time;
const pathTo = (st, ent, tx, ty, near = 0) => findPath(st.w, st.h, walkable(st), Math.floor(ent.x), Math.floor(ent.y), tx, ty, near);

// ---------- Erzeugen ----------

// mission: Objekt oder id; variant: Objekt, id, Index oder leer (dann per rng); team: Kampfwerte (makeFighter), 1–3.
export function createQuest({ mission, variant, team, rng = Math.random }) {
  const m = typeof mission === 'string' ? MISSION_BY_ID[mission] : mission;
  if (!m) throw new Error('Unbekannte Mission');
  const v = variant == null ? pickVariant(m, rng)
    : typeof variant === 'object' ? variant
      : typeof variant === 'number' ? m.variants[variant] : m.variants.find(x => x.id === variant);
  if (!v) throw new Error('Unbekannte Variante');
  if (!team?.length) throw new Error('Kein Team');
  const rows = m.map.map(r => r.split(''));
  for (const [x, y, ch] of v.patch || []) rows[y][x] = ch;
  const h = rows.length, w = rows[0].length;
  const st = {
    missionId: m.id, variantId: v.id, mission: m, variant: v, theme: m.theme, w, h, tiles: [], gas: new Float64Array(w * h),
    time: 0, timeLimit: m.timeMs, alarm: 0, fullAlarm: false, alarmEver: false, contact: false, reinforceAt: 0, reinforced: 0,
    over: false, result: null, reason: null, units: [], enemies: [], objs: [], doors: [], pads: [], effects: [], pending: [],
    delivered: 0, objective: null, gate: { x: m.gate[0], y: m.gate[1] }, lastSighting: null, nextId: 1, rng, dmgScale: 1,
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === 'C') st.objs.push({ id: st.objs.length, kind: 'vault', x, y, coins: v.coins?.[`${x},${y}`] ?? m.coins ?? 2 });
    else if (ch === 'S') st.objs.push({ id: st.objs.length, kind: 'sabotage', x, y, done: false });
    else if (ch === 'K') st.objs.push({ id: st.objs.length, kind: 'plug', x, y, done: false });
    else if (ch === 'X') st.objs.push({ id: st.objs.length, kind: 'item', x, y, taken: false, by: -1, delivered: false });
    else if (ch === 'D' || ch === 'L') st.doors.push({ id: st.doors.length, x, y, locked: ch === 'L', opening: false });
    else if (ch === 'P') st.pads.push({ x, y });
    st.tiles.push(ch === 'X' ? '.' : ch);
  }
  const type = m.objective.type;
  const total = type === 'steal' ? st.objs.reduce((s, o) => s + (o.coins || 0), 0) : type === 'sabotage' ? st.objs.filter(o => o.kind === 'sabotage').length : 1;
  st.objective = { type, label: m.objective.label, done: 0, total, min: m.objective.min ?? total };
  // Start auf der Plattform, von der Mitte aus
  const cx = st.pads.reduce((s, p) => s + p.x, 0) / st.pads.length, cy = st.pads.reduce((s, p) => s + p.y, 0) / st.pads.length;
  const spots = [...st.pads].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  team.slice(0, 3).forEach((f, i) => {
    const p = spots[i % spots.length];
    st.units.push({
      i, id: f.id, name: f.name, rarity: f.rarity, level: f.level, power: f.power || 1, hp: f.maxBtc, maxHp: f.maxBtc,
      x: p.x + 0.5, y: p.y + 0.5, dir: 0, state: 'idle', path: [], goal: { x: p.x, y: p.y }, intent: null, busy: null,
      carry: 0, item: false, cd: {}, down: false, swingAt: 0,
    });
  });
  st.dmgScale = st.units.reduce((s, u) => s + u.maxHp * u.power, 0) / st.units.length / DMG_REF;
  for (const d of v.enemies) addEnemy(st, d);
  return st;
}

function addEnemy(st, d) {
  const T = ENEMY_TYPES[d.type];
  const dir = rad(d.dir ?? 0);
  const e = {
    i: st.enemies.length, type: d.type, name: T.name, x: d.at[0] + 0.5, y: d.at[1] + 0.5, dir, hp: T.hp, maxHp: T.hp,
    state: 'patrol', reason: null, until: 0, suspicion: 0,
    patrol: (d.patrol || []).map(([x, y, wait = 0, wd]) => ({ x, y, wait, dir: wd == null ? null : rad(wd) })),
    wp: 0, waitUntil: 0, waitDir: null, look: (d.look || []).map(rad), lookI: 0, lookAt: 0, lookDir: dir, home: { x: d.at[0], y: d.at[1], wait: 0, dir },
    path: [], goal: null, target: null, seen: -1, lastSeen: null, lostT: 0, swingAt: 0, repathAt: 0, bait: null, tied: false,
    reinforcement: !!d.reinforcement,
  };
  st.enemies.push(e);
  return e;
}

// ---------- Abfragen für die Darstellung ----------

export function canExtract(st) {
  if (st.over || st.objective.done < st.objective.min) return false;
  const up = st.units.filter(u => !u.down);
  return up.length > 0 && up.every(u => tileAt(st, u.x, u.y) === 'P');
}

// Ergebnis für onEnd und questResult(save, missionId, result, score, alarmFree).
// score = erfüllte Ziele (Raub: abgelieferte Münzen); jeder liegengelassene Rüther (down, nicht auf P) kostet 1.
export function questSummary(st) {
  const o = st.objective, alarmFree = !st.alarmEver;
  const leftBehind = st.units.filter(u => u.down && tileAt(st, u.x, u.y) !== 'P').length;
  return {
    result: st.result, reason: st.reason, missionId: st.missionId, variantId: st.variantId, score: Math.max(0, o.done - leftBehind),
    objective: { done: o.done, total: o.total, min: o.min }, timeMs: st.time, alarmFree, delivered: st.delivered, leftBehind,
  };
}

const coneOf = (st, e) => { const T = ENEMY_TYPES[e.type]; return { range: T.sight * (st.fullAlarm ? FULL_CONE : 1), half: rad(T.angle) / 2 }; };

// Sichtkegel als Polygon [Ursprung, Randpunkte …] in Kacheln, an Wänden, Deckung und Gas abgeschnitten. [] = Kegel aus.
export function visibleCone(st, i) {
  const e = st.enemies[i];
  if (!e || !CONE_ON.has(e.state)) return [];
  const { range, half } = coneOf(st, e), blk = blocker(st);
  const n = Math.max(8, Math.ceil(half * 2 / 0.07));
  const pts = [{ x: e.x, y: e.y }];
  for (let k = 0; k <= n; k++) {
    const a = e.dir - half + 2 * half * k / n, cx = Math.cos(a), cy = Math.sin(a);
    const d = castRay(blk, e.x, e.y, cx, cy, range);
    pts.push({ x: e.x + cx * d, y: e.y + cy * d });
  }
  return pts;
}

// Gültige Ziele einer Kraft (zum Leuchten im Zielmodus). Reichweite egal, der Rüther läuft hin; inRange sagt, ob sofort.
export function abilityTargets(st, unit, abilityId) {
  const u = st.units[unit], ab = ABILITIES[abilityId];
  if (!u || !ab) return [];
  const out = [], inR = (p, r) => Math.hypot(p.x - u.x, p.y - u.y) <= r;
  if (ab.target === 'door') for (const d of st.doors) { if (d.locked && !d.opening) out.push({ door: d.id, ...mid(d), inRange: inR(mid(d), ab.range) }); }
  if (ab.target === 'enemy' || ab.target === 'vaultOrDrone') for (const e of st.enemies) {
    if (e.state === 'ko' || (ab.target === 'vaultOrDrone' && e.type !== 'drohne')) continue;
    out.push({ enemy: e.i, x: e.x, y: e.y, inRange: inR(e, ab.range) });
  }
  if (ab.target === 'vaultOrDrone') for (const o of st.objs) { if (o.kind === 'vault' && o.coins > 0) out.push({ obj: o.id, ...mid(o), inRange: inR(mid(o), ab.vaultRange) }); }
  if (ab.id === 'family') for (const e of familyTargets(st, u)) out.push({ enemy: e.i, x: e.x, y: e.y, inRange: true });
  return out;
}

const familyTargets = (st, u) => st.enemies.filter(e => e.state !== 'ko' && dist(e, u) <= ABILITIES.family.range)
  .sort((a, b) => dist(a, u) - dist(b, u)).slice(0, 2);

// ---------- Schritt ----------

export function tick(st, dt, cmds = []) {
  const ev = [];
  if (st.over) return ev;
  for (const c of cmds) { command(st, c, ev); if (st.over) return ev; }
  if (!(dt > 0)) return ev; // taktische Pause: nur Befehle
  st.time += dt;
  st.contact = false;
  const done0 = st.objective.done;
  // fällige Wurf-/Effekt-Folgen
  if (st.pending.length) {
    const due = st.pending.filter(p => p.at <= st.time);
    st.pending = st.pending.filter(p => p.at > st.time);
    for (const p of due) resolve(st, p, ev);
  }
  st.effects = st.effects.filter(f => {
    if (f.until > st.time) return true;
    ev.push({ type: 'effectEnd', effect: f.id, kind: f.kind, x: f.x, y: f.y });
    return false;
  });
  assignBaits(st, ev);
  const blk = blocker(st);
  for (const u of st.units) updateUnit(st, u, dt, ev, blk);
  for (const e of [...st.enemies]) updateEnemy(st, e, dt, ev, blk);
  // globaler Alarm
  if (!st.contact) st.alarm = Math.max(0, st.alarm - ALARM_DECAY * dt / 1000);
  if (!st.fullAlarm && st.alarm >= 0.999) {
    st.fullAlarm = true; st.reinforceAt = st.time + REINFORCE_MS;
    ev.push({ type: 'fullAlarm', alarm: st.alarm, reinforceAt: st.reinforceAt });
  } else if (st.fullAlarm && st.alarm < ALARM_OFF) {
    st.fullAlarm = false;
    ev.push({ type: 'alarmOff', alarm: st.alarm });
  }
  if (st.fullAlarm && st.time >= st.reinforceAt) { st.reinforceAt += REINFORCE_MS; reinforce(st, ev); }
  updateObjective(st);
  const o = st.objective;
  if (o.done !== done0) ev.push({ type: 'objective', kind: o.type, label: o.label, done: o.done, total: o.total, min: o.min, reached: o.done >= o.min });
  if (st.units.every(u => u.down)) end(st, 'fail', 'allDown', ev);
  else if (st.time >= st.timeLimit) end(st, st.objective.type === 'steal' && st.objective.done >= st.objective.min ? 'success' : 'fail', 'time', ev);
  return ev;
}

function end(st, result, reason, ev) {
  st.over = true; st.result = result; st.reason = reason;
  for (const u of st.units) { u.path = []; u.intent = null; u.busy = null; }
  const o = st.objective, late = reason === 'time' && o.done >= o.min; // Ziel geschafft, nur nicht abgehoben: kein „Heizung brummt weiter“
  ev.push({ type: 'end', result, reason, text: result === 'success' ? st.mission.texts.success : result === 'abort' ? END_TEXT.abort : late ? END_TEXT.late : `${END_TEXT[reason]} ${st.mission.texts.fail}`, summary: questSummary(st) });
}

function updateObjective(st) {
  const o = st.objective;
  if (o.type === 'steal') o.done = st.delivered;
  else if (o.type === 'sabotage') o.done = st.objs.filter(x => x.kind === 'sabotage' && x.done).length;
  else if (o.type === 'fetch') o.done = st.objs.some(x => x.kind === 'item' && x.delivered) ? 1 : 0;
  else o.done = st.objs.some(x => x.kind === 'plug' && x.done) ? 1 : 0;
}

const fail = (ev, u, action, reason, extra = {}) => { ev.push({ type: 'fail', unit: u ? u.i : null, action, reason, text: FAIL[reason], ...extra }); return false; };

// ---------- Befehle ----------

function command(st, c, ev) {
  if (c.type === 'abort') return end(st, 'abort', 'abort', ev);
  if (c.type === 'extract') return canExtract(st) ? end(st, 'success', 'extract', ev) : fail(ev, null, 'extract', 'extract');
  const u = st.units[c.unit];
  if (!u) return;
  if (u.down) return fail(ev, u, c.type, 'down');
  if (c.type === 'stop') { cancelBusy(u, 'befehl', ev); u.path = []; u.intent = null; u.goal = null; return; }
  if (c.type === 'move') {
    if (!c.to) return fail(ev, u, 'move', 'target');
    const t = freeNear(st, u, Math.floor(c.to.x), Math.floor(c.to.y));
    const path = t && pathTo(st, u, t.x, t.y);
    if (!path) return fail(ev, u, 'move', 'path');
    cancelBusy(u, 'befehl', ev);
    u.intent = null; u.path = path; u.goal = t;
    return ev.push({ type: 'path', unit: u.i, to: t, path });
  }
  const it = c.type === 'interact' ? interactIntent(st, u, c.obj, ev) : c.type === 'ability' ? abilityIntent(st, u, c, ev) : null;
  if (!it) return;
  cancelBusy(u, 'befehl', ev);
  u.path = []; u.goal = null; u.intent = it;
  pursue(st, u, ev, blocker(st)); // sofort, wenn in Reichweite (auch in der Pause), sonst Weg berechnen
}

function interactIntent(st, u, obj, ev) {
  if (obj && typeof obj === 'object' && obj.unit != null) {
    const t = st.units[obj.unit];
    if (!t || t === u || !t.down) return fail(ev, u, 'interact', 'target');
    // Wer mitten im Schritt umfällt, liegt bis 0,71 neben der Kachelmitte; A* misst near aber von Mitte zu Mitte
    return { kind: 'interact', unit: t.i, range: REACH + 0.75, near: REACH };
  }
  const o = obj && typeof obj === 'object' ? st.objs.find(x => x.x === Math.floor(obj.x) && x.y === Math.floor(obj.y)) : st.objs[obj];
  if (!o) return fail(ev, u, 'interact', 'target');
  if (!checkObj(st, u, o, ev)) return null;
  return { kind: 'interact', obj: o.id, range: REACH, near: REACH };
}

function checkObj(st, u, o, ev) {
  if (o.kind === 'vault') {
    if (o.coins <= 0) return fail(ev, u, 'interact', 'empty', { obj: o.id });
    if (u.carry >= CARRY_MAX) return fail(ev, u, 'interact', 'full', { obj: o.id });
  }
  if (u.item) return fail(ev, u, 'interact', 'carry', { obj: o.id });
  if ((o.kind === 'sabotage' || o.kind === 'plug') && o.done) return fail(ev, u, 'interact', 'done', { obj: o.id });
  if (o.kind === 'item' && (o.taken || o.delivered)) return fail(ev, u, 'interact', 'taken', { obj: o.id });
  return true;
}

function abilityIntent(st, u, c, ev) {
  const ab = ABILITIES[c.ability], t = c.target || {};
  if (!ab || ab.unit !== u.id) return fail(ev, u, 'ability', 'ability', { ability: c.ability });
  const no = r => fail(ev, u, 'ability', r, { ability: ab.id });
  if (u.item) return no('carry');
  if ((u.cd[ab.id] || 0) > st.time) return no('cd');
  const it = { kind: 'ability', ability: ab.id, range: ab.range, los: !!ab.los, near: 0, target: null };
  if (ab.target === 'self') {
    if (ab.id === 'family' && !familyTargets(st, u).length) return no('noEnemy');
    it.target = {};
  } else if (ab.target === 'point') {
    if (t.x == null || SOLID.has(tileAt(st, t.x, t.y))) return no('target');
    // Ziel darf hinter einer Wand liegen: hinlaufen nur bis sicher in Wurfweite
    it.target = { x: t.x, y: t.y }; it.near = Math.max(0, ab.range - 1.42);
  } else if (ab.target === 'door') {
    const d = t.door != null ? st.doors[t.door] : st.doors.find(x => x.x === Math.floor(t.x) && x.y === Math.floor(t.y));
    if (!d || !d.locked || d.opening) return no('target');
    it.target = { door: d.id }; it.near = REACH;
  } else {
    const e = t.enemy != null ? st.enemies[t.enemy] : null;
    if (ab.target === 'vaultOrDrone' && !e) {
      const o = t.obj != null ? st.objs[t.obj] : t.x != null ? st.objs.find(x => x.x === Math.floor(t.x) && x.y === Math.floor(t.y)) : null;
      if (!o || o.kind !== 'vault') return no('target');
      if (o.coins <= 0) return no('empty');
      if (u.carry >= CARRY_MAX) return no('full');
      Object.assign(it, { target: { obj: o.id }, range: ab.vaultRange, near: REACH });
    } else {
      if (!e || e.state === 'ko' || (ab.target === 'vaultOrDrone' && e.type !== 'drohne')) return no('target');
      it.target = { enemy: e.i }; it.near = ab.range >= REACH ? REACH : 0;
    }
  }
  return it;
}

// Wo liegt das Ziel der Absicht gerade? null = ungültig geworden.
function intentPos(st, u, it) {
  if (it.unit != null) { const t = st.units[it.unit]; return t.down ? t : null; }
  if (it.obj != null && it.kind === 'interact') return mid(st.objs[it.obj]);
  const t = it.target;
  if (!t) return null;
  if (t.door != null) { const d = st.doors[t.door]; return d.locked && !d.opening ? mid(d) : null; }
  if (t.enemy != null) { const e = st.enemies[t.enemy]; return e.state === 'ko' ? null : e; }
  if (t.obj != null) return mid(st.objs[t.obj]);
  if (t.x != null) return t;
  return u; // selbst
}

function pursue(st, u, ev, blk) {
  const it = u.intent, p = intentPos(st, u, it);
  if (!p) { u.intent = null; return fail(ev, u, it.kind, 'target', { ability: it.ability }); }
  const d = Math.hypot(p.x - u.x, p.y - u.y);
  const sight = !it.los || lineOfSight(blk, u.x, u.y, p.x, p.y);
  if (d <= it.range && sight) {
    u.intent = null; u.path = []; u.goal = null;
    return it.kind === 'ability' ? cast(st, u, it, ev, blk) : begin(st, u, it, ev);
  }
  const tx = Math.floor(p.x), ty = Math.floor(p.y);
  if (u.path.length && it.tx === tx && it.ty === ty) return;
  // in Reichweite, aber ohne Sichtlinie (Regal an der Ecke): weiter auf das Ziel zu statt aufgeben
  const path = pathTo(st, u, tx, ty, it.los && d <= it.range && !sight ? 0 : it.near);
  if (!path || !path.length) { u.intent = null; return fail(ev, u, it.kind, path ? 'sight' : 'path', { ability: it.ability }); }
  it.tx = tx; it.ty = ty; u.path = path;
}

// Nächste freie begehbare Kachel (keine zwei Rüther auf demselben Ziel)
function freeNear(st, u, tx, ty) {
  const taken = new Set(st.units.filter(o => o !== u && !o.down).map(o => { const g = o.goal || { x: Math.floor(o.x), y: Math.floor(o.y) }; return g.y * st.w + g.x; }));
  for (let r = 0; r <= 3; r++) {
    let best = null, bd = Infinity;
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r || x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
      const i = y * st.w + x, d = Math.hypot(x - tx, y - ty);
      if (WALK.has(st.tiles[i]) && !taken.has(i) && d < bd) { bd = d; best = { x, y }; }
    }
    if (best) return best;
  }
  return null;
}

// ---------- Rüther ----------

const speedOf = u => (SPEED_SLOW[u.id] || SPEED) * (u.item ? ITEM_SLOW : 1);

// folgt ent.path (Kachelmitten); face=false lässt die Blickrichtung in Ruhe
function walk(ent, speed, dt, face = true) {
  let left = speed * dt / 1000;
  while (left > 0 && ent.path.length) {
    const n = ent.path[0], tx = n.x + 0.5, ty = n.y + 0.5, dx = tx - ent.x, dy = ty - ent.y, d = Math.hypot(dx, dy);
    if (face && d > 1e-6) ent.dir = Math.atan2(dy, dx);
    if (d <= left) { ent.x = tx; ent.y = ty; left -= d; ent.path.shift(); } else { ent.x += dx / d * left; ent.y += dy / d * left; left = 0; }
  }
}

function updateUnit(st, u, dt, ev, blk) {
  if (!u.down) {
    if (u.busy) work(st, u, dt, ev);
    else {
      if (u.intent) pursue(st, u, ev, blk);
      if (u.path.length) walk(u, speedOf(u), dt);
      if (tileAt(st, u.x, u.y) === 'P') deliver(st, u, ev);
    }
    defend(st, u, ev);
  }
  u.state = u.down ? 'down' : u.busy ? 'busy' : u.path.length ? 'move' : 'idle';
}

function begin(st, u, it, ev) {
  let b, at;
  if (it.unit != null) {
    const t = st.units[it.unit];
    b = { kind: 'revive', unit: t.i, obj: null, t: 0, ms: ACT_MS.revive }; at = t;
  } else {
    const o = st.objs[it.obj];
    if (!checkObj(st, u, o, ev)) return;
    const kind = ACT[o.kind];
    b = { kind, obj: o.id, unit: null, t: 0, ms: kind === 'fetch' ? st.mission.fetchMs || ACT_MS.fetch : ACT_MS[kind] }; at = mid(o);
  }
  u.busy = b; u.dir = angTo(u, at);
  ev.push({ type: 'interactStart', unit: u.i, kind: b.kind, obj: b.obj, target: b.unit, ms: b.ms, x: at.x, y: at.y });
}

function cancelBusy(u, reason, ev) {
  if (!u.busy) return;
  ev.push({ type: 'interactCancel', unit: u.i, kind: u.busy.kind, obj: u.busy.obj, target: u.busy.unit, reason, x: u.x, y: u.y });
  u.busy = null;
}

function work(st, u, dt, ev) {
  const b = u.busy;
  b.t += dt;
  if (b.t < b.ms) return;
  u.busy = null;
  if (b.kind === 'revive') {
    const t = st.units[b.unit];
    if (!t.down) return;
    t.down = false; t.hp = Math.max(1, Math.round(t.maxHp * REVIVE_HP)); t.state = 'idle'; t.goal = null;
    return ev.push({ type: 'revive', unit: u.i, target: t.i, hp: t.hp, x: t.x, y: t.y });
  }
  const o = st.objs[b.obj], at = mid(o);
  // ein zweiter Rüther am selben Objekt kann inzwischen fertig sein: neu prüfen statt doppelt verbuchen
  if (b.kind === 'steal' && o.coins <= 0) return fail(ev, u, 'interact', 'empty', { obj: o.id });
  if ((b.kind === 'sabotage' || b.kind === 'unplug') && o.done) return fail(ev, u, 'interact', 'done', { obj: o.id });
  if (b.kind === 'fetch' && o.taken) return fail(ev, u, 'interact', 'taken', { obj: o.id });
  if (b.kind === 'steal') {
    if (u.carry < CARRY_MAX) {
      o.coins--; u.carry++;
      ev.push({ type: 'steal', unit: u.i, obj: o.id, n: 1, coins: u.carry, left: o.coins, x: at.x, y: at.y });
    }
    if (o.coins > 0 && u.carry < CARRY_MAX) u.busy = { ...b, t: 0 }; // nächste Münze
    else if (!o.coins) ev.push({ type: 'vaultEmpty', obj: o.id, x: at.x, y: at.y });
  } else if (b.kind === 'sabotage') {
    o.done = true;
    ev.push({ type: 'sabotage', unit: u.i, obj: o.id, x: at.x, y: at.y, done: st.objs.filter(x => x.kind === 'sabotage' && x.done).length, total: st.objective.total });
  } else if (b.kind === 'fetch') {
    o.taken = true; o.by = u.i; u.item = true;
    ev.push({ type: 'pickup', unit: u.i, obj: o.id, x: at.x, y: at.y });
    if (st.mission.pickupNoise) noise(st, at.x, at.y, st.mission.pickupNoise, 'alarmanlage', ev);
  } else if (b.kind === 'unplug') {
    o.done = true;
    ev.push({ type: 'unplug', unit: u.i, obj: o.id, x: at.x, y: at.y });
  }
}

function deliver(st, u, ev) {
  if (u.carry) {
    st.delivered += u.carry;
    ev.push({ type: 'deliver', unit: u.i, coins: u.carry, item: false, total: st.delivered, x: u.x, y: u.y });
    u.carry = 0;
  }
  if (u.item) {
    const o = st.objs.find(x => x.kind === 'item' && x.by === u.i);
    u.item = false;
    if (o) { o.delivered = true; o.x = Math.floor(u.x); o.y = Math.floor(u.y); }
    ev.push({ type: 'deliver', unit: u.i, coins: 0, item: true, total: st.delivered, x: u.x, y: u.y });
  }
}

// Automatische Gegenwehr gegen angrenzende alarmierte Gegner: 8 × power pro s
function defend(st, u, ev) {
  if (st.time < u.swingAt) return;
  let foe = null, fd = MELEE;
  for (const e of st.enemies) if (e.state === 'alert') { const d = dist(u, e); if (d <= fd) { foe = e; fd = d; } }
  if (!foe) return;
  u.swingAt = st.time + SWING_MS;
  const dmg = Math.max(1, Math.round(DEFEND * u.power));
  foe.hp = Math.max(0, foe.hp - dmg);
  ev.push({ type: 'hit', from: 'unit', unit: u.i, enemy: foe.i, damage: dmg, hp: foe.hp, x: foe.x, y: foe.y });
  if (!foe.hp) ko(st, foe, 'kampf', false, ev);
}

function hurtUnit(st, u, n, e, ev) {
  u.hp = Math.max(0, u.hp - n);
  ev.push({ type: 'hit', from: 'enemy', unit: u.i, enemy: e.i, damage: n, hp: u.hp, x: u.x, y: u.y });
  cancelBusy(u, 'treffer', ev);
  if (u.hp) return;
  u.down = true; u.path = []; u.intent = null; u.goal = null; u.state = 'down';
  ev.push({ type: 'down', unit: u.i, by: e.i, x: u.x, y: u.y });
}

// ---------- Kräfte ----------

function cast(st, u, it, ev, blk) {
  const ab = ABILITIES[it.ability], t = it.target;
  const no = r => fail(ev, u, 'ability', r, { ability: ab.id });
  if (u.item) return no('carry');
  if ((u.cd[ab.id] || 0) > st.time) return no('cd');
  const base = { type: 'ability', unit: u.i, ability: ab.id, name: ab.name, x: u.x, y: u.y };
  const e = t.enemy != null ? st.enemies[t.enemy] : null;
  if (e) u.dir = angTo(u, e);
  switch (ab.id) {
    case 'plus70': {
      const d = st.doors[t.door];
      d.opening = true;
      st.pending.push({ at: st.time + 900, kind: 'door', door: d.id, by: u.i });
      ev.push({ ...base, door: d.id, tx: d.x + 0.5, ty: d.y + 0.5, ms: 900 });
      break;
    }
    case 'beer': case 'mms': {
      const ms = Math.round(350 + 70 * Math.hypot(t.x - u.x, t.y - u.y));
      st.pending.push({ at: st.time + ms, kind: ab.id, x: t.x, y: t.y });
      ev.push({ ...base, item: ab.id === 'beer' ? 'can' : 'mms', tx: t.x, ty: t.y, ms });
      break;
    }
    case 'family': {
      const targets = familyTargets(st, u);
      if (!targets.length) return no('noEnemy');
      const ms = 1500;
      for (const x of targets) timed(x, 'stunned', 'family', st.time + ms);
      st.pending.push({ at: st.time + ms, kind: 'family', targets: targets.map(x => x.i), by: u.i });
      // die echten Christian und Micha rennen vom nächsten Kartenrand heran
      const helpers = ['christian', 'micha'].map((id, k) => {
        const x = targets[k % targets.length];
        return { id, enemy: x.i, x: x.x < st.w / 2 ? 0 : st.w, y: x.y, tx: x.x, ty: x.y };
      });
      ev.push({ ...base, targets: targets.map(x => x.i), helpers, ms });
      break;
    }
    case 'handbag': {
      const seen = sees(st, e, u, blk);
      timed(e, 'stunned', 'handbag', st.time + STUN_MS.handbag);
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms: STUN_MS.handbag, silent: !seen });
      ev.push({ type: 'stun', enemy: e.i, reason: 'handbag', ms: STUN_MS.handbag, x: e.x, y: e.y });
      if (seen) noise(st, e.x, e.y, NOISE_R.hieb, 'hieb', ev);
      break;
    }
    case 'gas': {
      const cx = Math.floor(t.x), cy = Math.floor(t.y), ms = 10_000, until = st.time + ms, tiles = [];
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
        if (SOLID.has(tileAt(st, x, y))) continue;
        const i = y * st.w + x;
        st.gas[i] = Math.max(st.gas[i], until);
        tiles.push({ x, y });
      }
      const id = st.nextId++;
      st.effects.push({ id, kind: 'gas', x: cx + 0.5, y: cy + 0.5, tiles, until, ms });
      ev.push({ ...base, effect: id, tx: cx + 0.5, ty: cy + 0.5, tiles, ms });
      break;
    }
    case 'argue': {
      timed(e, 'stunned', 'argue', st.time + STUN_MS.argue);
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms: STUN_MS.argue, say: ARGUE });
      ev.push({ type: 'stun', enemy: e.i, reason: 'argue', ms: STUN_MS.argue, x: e.x, y: e.y, say: '…' });
      break;
    }
    case 'controller': {
      const ms = Math.round(300 + 60 * dist(u, e));
      st.pending.push({ at: st.time + ms, kind: 'controller', enemy: e.i, by: u.i });
      ev.push({ ...base, item: 'controller', enemy: e.i, tx: e.x, ty: e.y, ms });
      break;
    }
    case 'wallet': {
      if (t.obj != null) {
        const o = st.objs[t.obj], n = Math.min(CARRY_MAX - u.carry, o.coins);
        if (!o.coins) return no('empty');
        if (n <= 0) return no('full');
        o.coins -= n; u.carry += n;
        const at = mid(o);
        ev.push({ ...base, mode: 'vault', obj: o.id, coins: n, tx: at.x, ty: at.y, ms: 800 });
        ev.push({ type: 'steal', unit: u.i, obj: o.id, n, coins: u.carry, left: o.coins, x: at.x, y: at.y, instant: true });
        if (!o.coins) ev.push({ type: 'vaultEmpty', obj: o.id, x: at.x, y: at.y });
      } else {
        timed(e, 'stunned', 'hack', st.time + STUN_MS.hack);
        ev.push({ ...base, mode: 'drone', enemy: e.i, tx: e.x, ty: e.y, ms: STUN_MS.hack });
        ev.push({ type: 'stun', enemy: e.i, reason: 'hack', ms: STUN_MS.hack, x: e.x, y: e.y });
      }
      break;
    }
    case 'credits': {
      timed(e, 'bribed', 'bribe', st.time + STUN_MS.bribe);
      e.dir = angTo(u, e); // dreht sich weg und zählt Geld
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms: STUN_MS.bribe });
      ev.push({ type: 'stun', enemy: e.i, reason: 'bribe', ms: STUN_MS.bribe, x: e.x, y: e.y, say: 'Für den Preis hab ich nix gesehen.' });
      break;
    }
  }
  u.cd[ab.id] = st.time + ab.cd;
  return true;
}

function resolve(st, p, ev) {
  if (p.kind === 'door') {
    const d = st.doors[p.door];
    d.locked = false; d.opening = false;
    st.tiles[d.y * st.w + d.x] = 'D';
    // laufende Wege neu planen, damit niemand den alten Umweg weiterläuft (Absichten plant pursue neu)
    for (const u of st.units) if (!u.down && u.path.length) { if (u.intent) u.intent.tx = null; else if (u.goal) u.path = pathTo(st, u, u.goal.x, u.goal.y) || u.path; }
    ev.push({ type: 'doorOpen', door: d.id, by: p.by, x: d.x + 0.5, y: d.y + 0.5 });
  } else if (p.kind === 'beer') noise(st, p.x, p.y, NOISE_R.can, 'can', ev);
  else if (p.kind === 'mms') {
    const id = st.nextId++;
    st.effects.push({ id, kind: 'mms', x: p.x, y: p.y, until: st.time + BAIT_MS, enemy: -1 });
    ev.push({ type: 'bait', effect: id, x: p.x, y: p.y, ms: BAIT_MS });
  } else if (p.kind === 'controller') {
    const e = st.enemies[p.enemy];
    if (e.state === 'ko') return;
    timed(e, 'stunned', 'controller', st.time + STUN_MS.controller);
    ev.push({ type: 'stun', enemy: e.i, reason: 'controller', ms: STUN_MS.controller, x: e.x, y: e.y });
  } else if (p.kind === 'family') {
    for (const i of p.targets) { const e = st.enemies[i]; if (e.state !== 'ko') ko(st, e, 'family', true, ev); }
  }
}

function ko(st, e, by, tied, ev) {
  e.state = 'ko'; e.reason = by; e.tied = tied; e.path = []; e.goal = null; e.bait = null; e.suspicion = 0; e.seen = -1;
  ev.push({ type: 'ko', enemy: e.i, by, tied, permanent: true, x: e.x, y: e.y });
}

function timed(e, state, reason, until) {
  e.state = state; e.reason = reason; e.until = until; e.path = []; e.goal = null; e.bait = null; e.seen = -1;
}

// Geräusch: ablenkbare Gegner im Umkreis gehen nachsehen
function noise(st, x, y, r, kind, ev) {
  const hit = [];
  for (const e of st.enemies) {
    if (!CALM.has(e.state) || e.bait != null || Math.hypot(e.x - x, e.y - y) > r) continue;
    e.state = 'distracted'; e.reason = 'noise'; e.target = { x, y }; e.until = 0; e.goal = null;
    e.path = pathTo(st, e, Math.floor(x), Math.floor(y), REACH) || [];
    hit.push(e.i);
  }
  ev.push({ type: 'noise', kind, x, y, r, enemies: hit });
}

// M&Ms: der nächste Wachgänger (patrol oder abgelenkt, keine Drohne) in 6 Kacheln geht hin
function assignBaits(st, ev) {
  for (const b of st.effects) {
    if (b.kind !== 'mms') continue;
    if (b.enemy >= 0 && st.enemies[b.enemy].bait === b.id) continue;
    b.enemy = -1;
    let best = null, bd = BAIT_R, bp = null;
    for (const e of st.enemies) {
      if (!(e.state === 'patrol' || (e.state === 'distracted' && e.bait == null)) || ENEMY_TYPES[e.type].flying) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d > bd) continue;
      const path = pathTo(st, e, Math.floor(b.x), Math.floor(b.y), 0);
      if (path) { best = e; bd = d; bp = path; }
    }
    if (!best) continue;
    b.enemy = best.i;
    Object.assign(best, { state: 'distracted', reason: 'bait', bait: b.id, target: { x: b.x, y: b.y }, until: 0, goal: null, path: bp });
    ev.push({ type: 'baitTaken', effect: b.id, enemy: best.i, x: b.x, y: b.y, say: 'Oh, M&Ms!' });
  }
}

// ---------- Gegner ----------

function sees(st, e, u, blk) {
  if (u.down || !CONE_ON.has(e.state)) return false;
  const d = dist(e, u);
  if (d < TOUCH) return true;
  const { range, half } = coneOf(st, e);
  const near = e.state === 'alert' && d <= 2; // im Kampf spürt er dich auch seitlich
  if (!near && (d > range || Math.abs(angDiff(e.dir, angTo(e, u))) > half)) return false;
  return lineOfSight(blk, e.x, e.y, u.x, u.y);
}

function lookFor(st, e, blk) {
  let best = null;
  for (const u of st.units) {
    if (!sees(st, e, u, blk)) continue;
    const d = dist(e, u);
    if (!best || d < best.d) best = { u, d };
  }
  if (best) {
    const T = ENEMY_TYPES[e.type], range = coneOf(st, e).range;
    best.rate = (best.d < TOUCH ? 3 : 0.4 + 1.6 * Math.max(0, 1 - best.d / range)) * (T.clipboard ? 2 : 1);
  }
  return best;
}

function turnTo(e, a, dt) {
  const d = angDiff(e.dir, a), m = TURN * dt / 1000;
  e.dir = Math.abs(d) <= m ? a : e.dir + Math.sign(d) * m;
}

function scan(st, e, dt, base) {
  if (st.time >= e.lookAt) { e.lookAt = st.time + 1200; e.lookDir = base + (st.rng() - 0.5) * 2.4; }
  turnTo(e, e.lookDir, dt);
}

function updateEnemy(st, e, dt, ev, blk) {
  if (e.state === 'ko') return;
  const T = ENEMY_TYPES[e.type];
  const gasEnd = T.flying ? 0 : st.gas[Math.floor(e.y) * st.w + Math.floor(e.x)];
  if (gasEnd > st.time) {
    if (e.state === 'stunned' && e.reason === 'gas') e.until = Math.max(e.until, gasEnd);
    else if (!TIMED.has(e.state)) {
      timed(e, 'stunned', 'gas', gasEnd);
      ev.push({ type: 'stun', enemy: e.i, reason: 'gas', ms: gasEnd - st.time, x: e.x, y: e.y, say: '*hust*' });
    }
  }
  if (TIMED.has(e.state)) {
    if (st.time < e.until) return;
    wake(st, e, ev);
  }
  const seen = lookFor(st, e, blk);
  e.seen = seen ? seen.u.i : -1;
  if (e.state === 'alert') return hunt(st, e, seen, dt, ev);
  if (seen) {
    e.suspicion = Math.min(1, e.suspicion + seen.rate * dt / 1000);
    e.lastSeen = { x: seen.u.x, y: seen.u.y };
    if (e.suspicion >= 1) return raiseAlert(st, e, seen.u, ev);
    if (e.suspicion >= SUS_SHOW) {
      if (e.state !== 'suspicious') {
        e.state = 'suspicious'; e.reason = null; e.bait = null; e.repathAt = 0;
        ev.push({ type: 'suspicious', enemy: e.i, unit: seen.u.i, x: e.x, y: e.y, say: line(st, e, 'sus') });
      }
      // dreht sich zum Rüther und schleicht zur Sichtung
      if (st.time >= e.repathAt) { e.repathAt = st.time + 500; e.path = pathTo(st, e, Math.floor(seen.u.x), Math.floor(seen.u.y)) || []; }
      walk(e, T.speed * 0.5, dt, false);
      return turnTo(e, angTo(e, seen.u), dt * 2);
    }
  } else if (e.state === 'suspicious') {
    investigate(st, e, e.lastSeen, e.suspicion);
  } else if (e.state !== 'investigate') e.suspicion = Math.max(0, e.suspicion - SUS_DECAY * dt / 1000);

  if (e.state === 'patrol') return patrol(st, e, dt);
  if (e.state === 'investigate') {
    if (e.path.length) return walk(e, T.speed, dt);
    if (!e.until) { e.until = st.time + LOOK_MS; e.lookBase = e.dir; }
    scan(st, e, dt, e.lookBase);
    if (st.time >= e.until) calm(st, e, ev);
    return;
  }
  if (e.state === 'distracted') {
    if (e.bait != null) {
      const b = st.effects.find(f => f.id === e.bait);
      if (!b) return calm(st, e, ev);
      if (e.path.length) return walk(e, T.speed, dt);
      st.effects.splice(st.effects.indexOf(b), 1);
      timed(e, 'eating', 'eat', st.time + STUN_MS.eat);
      return ev.push({ type: 'stun', enemy: e.i, reason: 'eat', effect: b.id, ms: STUN_MS.eat, x: e.x, y: e.y, say: 'Mmh ... Moment, die sind von 2017.' });
    }
    if (e.path.length) return walk(e, T.speed, dt);
    if (!e.until) e.until = st.time + NOISE_MS;
    scan(st, e, dt, angTo(e, e.target));
    if (st.time >= e.until) calm(st, e, ev);
  }
}

function patrol(st, e, dt) {
  const route = e.patrol.length ? e.patrol : [e.home], wp = route[e.wp % route.length];
  if (st.time < e.waitUntil) { if (e.waitDir != null) turnTo(e, e.waitDir, dt); return; } // Blick des erreichten Wegpunkts, nicht des nächsten
  if (!e.path.length && Math.floor(e.x) === wp.x && Math.floor(e.y) === wp.y) {
    if (route.length > 1) {
      e.wp = (e.wp + 1) % route.length; e.waitUntil = st.time + wp.wait; e.waitDir = wp.dir; e.goal = null;
      if (wp.dir != null && wp.wait) turnTo(e, wp.dir, dt);
      return;
    }
    // Posten: umsehen
    const dirs = e.look.length ? e.look : [wp.dir ?? e.home.dir];
    if (st.time >= e.lookAt) { e.lookI = (e.lookI + 1) % dirs.length; e.lookAt = st.time + POST_LOOK_MS; }
    return turnTo(e, dirs[e.lookI % dirs.length], dt);
  }
  if (e.goal !== wp || !e.path.length) { e.path = pathTo(st, e, wp.x, wp.y) || []; e.goal = wp; }
  walk(e, ENEMY_TYPES[e.type].speed, dt);
}

function investigate(st, e, pos, sus = 0) {
  Object.assign(e, { state: 'investigate', reason: null, target: { x: pos.x, y: pos.y }, until: 0, goal: null, bait: null, suspicion: Math.max(sus, 0) });
  e.path = pathTo(st, e, Math.floor(pos.x), Math.floor(pos.y)) || [];
}

function calm(st, e, ev) {
  Object.assign(e, { state: 'patrol', reason: null, suspicion: 0, path: [], goal: null, target: null, until: 0, bait: null, lostT: 0 });
  ev.push({ type: 'calm', enemy: e.i, x: e.x, y: e.y, say: line(st, e, 'calm') });
}

function wake(st, e, ev) {
  const r = e.reason;
  ev.push({ type: 'wake', enemy: e.i, reason: r, x: e.x, y: e.y, say: r === 'eat' ? 'Mir ist schlecht ...' : r === 'bribe' ? 'Das Geld ist alle.' : line(st, e, 'wake') });
  if (r === 'eat' || r === 'bribe') Object.assign(e, { state: 'patrol', reason: null, suspicion: 0, path: [], goal: null, until: 0 });
  else investigate(st, e, e, 0.4); // nach KO, Gas oder Argument: misstrauisch umsehen
}

function raiseAlert(st, e, u, ev) {
  const T = ENEMY_TYPES[e.type];
  Object.assign(e, { state: 'alert', reason: null, suspicion: 1, lostT: 0, lastSeen: { x: u.x, y: u.y }, path: [], goal: null, bait: null, repathAt: 0 });
  st.alarmEver = true; st.contact = true; st.lastSighting = { x: u.x, y: u.y };
  st.alarm = T.megafon ? 1 : Math.min(1, st.alarm + ALARM_STEP);
  // Ruf: Kollegen in der Nähe sehen nach
  const called = [];
  for (const o of st.enemies) if (o !== e && CALM.has(o.state) && o.bait == null && dist(o, e) <= SHOUT_R) { investigate(st, o, e.lastSeen, 0.5); called.push(o.i); }
  ev.push({ type: 'alert', enemy: e.i, unit: u.i, x: e.x, y: e.y, megafon: !!T.megafon, alarm: st.alarm, called, say: line(st, e, 'alert') });
  cancelBusy(u, 'entdeckt', ev);
}

function hunt(st, e, seen, dt, ev) {
  const T = ENEMY_TYPES[e.type];
  if (seen) {
    e.lastSeen = { x: seen.u.x, y: seen.u.y }; e.lostT = 0;
    st.contact = true; st.lastSighting = { ...e.lastSeen };
    cancelBusy(seen.u, 'entdeckt', ev);
  } else e.lostT += dt;
  let foe = null, fd = MELEE;
  for (const u of st.units) if (!u.down) { const d = dist(u, e); if (d <= fd) { foe = u; fd = d; } }
  if (foe) {
    e.path = [];
    turnTo(e, angTo(e, foe), dt * 3);
    if (st.time >= e.swingAt) { e.swingAt = st.time + SWING_MS; hurtUnit(st, foe, Math.max(1, Math.round(T.dps * st.dmgScale)), e, ev); }
    return;
  }
  if (e.lostT > LOST_MS) {
    investigate(st, e, e.lastSeen, 0.6);
    return ev.push({ type: 'lost', enemy: e.i, x: e.x, y: e.y, say: 'Wo sind die hin?' });
  }
  if (st.time >= e.repathAt) {
    e.repathAt = st.time + 500;
    const to = seen ? seen.u : e.lastSeen;
    e.path = pathTo(st, e, Math.floor(to.x), Math.floor(to.y)) || [];
  }
  if (e.path.length) walk(e, T.speed * HUNT_SPEED, dt);
  else scan(st, e, dt, e.dir);
}

function reinforce(st, ev) {
  const n = Math.min(REINFORCE_N, REINFORCE_MAX - st.reinforced);
  if (n <= 0) return;
  const g = st.gate, to = st.lastSighting || mid(st.pads[0]), spots = [];
  for (let r = 0; r <= 2 && spots.length < n; r++) for (let y = g.y - r; y <= g.y + r; y++) for (let x = g.x - r; x <= g.x + r; x++) {
    if (spots.length < n && Math.max(Math.abs(x - g.x), Math.abs(y - g.y)) === r && WALK.has(tileAt(st, x, y))) spots.push({ x, y });
  }
  const ids = [];
  for (const s of spots) {
    const e = addEnemy(st, { type: st.mission.reinforce || 'pinguin', at: [s.x, s.y], patrol: [[s.x, s.y, 2000], [Math.floor(to.x), Math.floor(to.y), 3000]], reinforcement: true });
    Object.assign(e, { state: 'alert', suspicion: 1, lastSeen: { x: to.x, y: to.y } });
    ids.push(e.i);
  }
  st.reinforced += ids.length;
  ev.push({ type: 'reinforce', enemies: ids, x: g.x + 0.5, y: g.y + 0.5 });
}
