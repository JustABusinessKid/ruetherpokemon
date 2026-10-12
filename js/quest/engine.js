// Haunebu-Quests: Kommando-Engine (Draufsicht wie Commandos 2). Rein, ohne DOM, deterministisch mit rng.
// Raster in Kacheln, Positionen als Fließkomma (Kachelmitte = x+0.5), Richtungen in Radiant (0 = Osten, π/2 = Süden), Zeiten in ms.
// tick() mutiert den Zustand und liefert Events für die Darstellung (Positionen, Ziele, Dauern für Animationen).
import { findPath, castRay, lineOfSight } from './path.js';
import { MISSION_BY_ID, pickSetup, buildSetup } from './missions.js';
import { ABILITIES, FIXED, params } from './abilities.js';
export { ABILITIES, POOLS, FIXED, params } from './abilities.js';

// Gegner-Typen (Spec §5.3, v9 §2.1). sight/angle: Kegel in Kacheln/Grad, speed Kacheln/s, dps Nahkampf pro s.
// coffee: Kaffeepause (Kegel aus) und danach koffeiniert; catches: 'kieser' (Pause + Cutscene) | 'caught' (sofort Ende mit fine);
// bark: Sichtung macht Geräusch; whistle: Alarm-Schritt; fire: bemerkt brennende Bäume und läuft löschen.
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
  bernd: {
    name: 'Stefan', sight: 6, angle: 70, speed: 2.3, hp: 150, dps: 5, sprite: 'q-bernd', catches: 'kieser',
    coffee: { every: [20_000, 30_000], ms: 5000, boost: 10_000, speed: 1.5, sight: 1.3, angle: 1.2 },
    lines: { sus: ['Moment … ich pass grad nicht durch die Tür.', 'Wer schleicht da? Ich bin zu breit zum Umdrehen.'], alert: ['HALT! Erst Kieser, dann Kaffee!', 'Nach Kieser bin ich so breit, ich pass durch keine Tür!'], coffee: ['*schlürf* … mit Butter.', 'Bulletproof. Wie mein Rücken.'], buzz: ['Puls 180. Weiter geht’s!', 'JETZT bin ich wach!'], calm: ['Erst mal ’n Bulletproof Coffee.', 'Zu breit zum Hinterherlaufen.', 'Muss der Koffeinschock gewesen sein.'], wake: ['Wo ist mein Kaffee?'],
      // v10: eigene Sprüche statt der allgemeinen Fähigkeits-Sprüche (own); [kind] je Aufgabe, task/taskEnd für den Rest, heard fürs Klappern
      crash: ['Depot? Mein Depot ist die Beinpresse.', 'Rot? Rot ist nur mein Kopf nach Kieser.'], panik: ['Schnell zu Kieser, bevor einer meine Beinpresse nimmt!'],
      insider: ['Gratis Bulletproof Coffee? Bin unterwegs.'], task: ['Moment, nach Kieser bin ich zu breit für so was.', 'Mach ich. Nach meinem Bulletproof Coffee.'],
      taskEnd: ['Egal. Nach Kieser ist mir alles egal.', 'Kein Kaffee da? Dann halt Kieser.'], heard: ['Klappert da wer mit meinen Hantelscheiben?'] },
    labels: { crash: '+20 kg', panik: 'ZU KIESER!', insider: 'Kaffee?' }, // Ansicht: statt Depot-Kursen, VERKAUFEN! und Freibier?
  },
  camper: {
    name: 'Dauercamper', sight: 5, angle: 90, speed: 2.2, hp: 70, dps: 6, sprite: 'q-camper',
    lines: { sus: ['Wer latscht da über meine Parzelle?', 'Ey, das ist mein Stellplatz!'], alert: ['Grillzange raus! Einer ohne Platzkarte!', 'ALARM am Vorzelt!'], calm: ['Wohl nur ein Igel.', 'Zurück zum Grill, die Würstchen.'], wake: ['Wer hat meine Sandalen geklaut?'] },
  },
  dackel: {
    name: 'Dackel', sight: 3, angle: 120, speed: 3.6, hp: 30, dps: 4, bark: true, sprite: 'q-dackel',
    lines: { sus: ['*schnüffel*', 'Wuff?'], alert: ['WAU! WAU! WAU!', 'Grrrr ... WAU!'], calm: ['*kratzt sich am Ohr*', '*schnüffelt am Grill*'], wake: ['*jault*', 'Wuff ...'] },
  },
  platzwart: {
    name: 'Platzwart', sight: 6, angle: 70, speed: 2.4, hp: 80, dps: 6, whistle: 0.5, sprite: 'q-platzwart',
    lines: { sus: ['Haben Sie eine Platzkarte?', 'Nach 22 Uhr ist Ruhe!'], alert: ['*TRIIIIL* Platzverweis!', '*Trillerpfeife* Sofort stehen bleiben!'], calm: ['Ich schreib das ins Platzbuch.', 'Ruhe auf dem Platz.'], wake: ['Wo ist meine Pfeife?'] },
  },
  ranger: {
    name: 'Ranger vom Bruch', sight: 8, angle: 50, speed: 2.3, hp: 80, dps: 6, catches: 'caught', fine: 10_000, fire: true, sprite: 'q-ranger',
    lines: { sus: ['Moment, das ist kein Reiher ...', 'Hier ist Betreten verboten.'], alert: ['Halt! Naturschutzgebiet!', 'Personalien, aber zackig!'], caught: ['Das wird teuer!'], fire: ['FEUER! Wo ist die Feuerpatsche?', 'Es brennt im Bruch!'], calm: ['War wohl ein Wildschwein.', 'Ich zähl weiter Kraniche.'], wake: ['Wo ist mein Fernglas?'] },
  },
};

// Fähigkeiten einer Einheit (st.units[i]) mit Stufe, zusammengeführten Werten (params) und Text der Stufe.
// Mit einer Rüther-id statt Einheit: die 2 festen auf Stufe 1 (Spielstand ohne Loadout).
export function abilitiesFor(u) {
  const list = typeof u === 'string' ? (FIXED[u] || []).map(id => ({ id, level: 1 })) : u?.abilities || [];
  return list.map(({ id, level }) => ({ ...ABILITIES[id], ...params(id, level), level, text: ABILITIES[id].texts[level - 1] }));
}

const SPEED = 3, SPEED_SLOW = { viktor: 2.6 }, ITEM_SLOW = 0.6, CARRY_MAX = 2;
const ACT = { vault: 'steal', sabotage: 'sabotage', item: 'fetch', plug: 'unplug', valve: 'valve', tree: 'ignite' };
const ACT_MS = { steal: 3000, sabotage: 4000, fetch: 5000, unplug: 4000, valve: 4000, ignite: 3000, revive: 3000 };
// Ziele, die einzeln zählen (objective.type → Objektart)
const COUNTED = { sabotage: 'sabotage', valve: 'valve', ignite: 'tree' };
const OBJ_TILE = { C: 'vault', S: 'sabotage', K: 'plug', X: 'item', V: 'valve', B: 'tree' };
const FIRE_MS = 5000, FIRE_R = 10, DOUSE_MS = 8000, BARK_R = 6, BARK_CD = 4000;
const REACH = 1.5, REVIVE_HP = 0.4;
const SUS_SHOW = 0.3, SUS_DECAY = 0.15, TOUCH = 0.9;
const ALARM_STEP = 0.34, ALARM_DECAY = 0.02, ALARM_OFF = 0.5, FULL_CONE = 1.25;
const REINFORCE_MS = 15_000, REINFORCE_N = 2, REINFORCE_MAX = 8;
const MELEE = 1.3, SWING_MS = 1000, DEFEND = 5, HUNT_SPEED = 1.1;
// Gegnerschaden wächst linear mit der Teamstärke (Ø maxBtc / DMG_REF). Linear, nicht × power: sonst wüchse er quadratisch, und eine Wache
// legte einen Lv.-20-Legendären in 1 s um. Ziel §4: 1 Wache kostet über die Hälfte der HP, 2 Wachen legen ihn in ein paar Sekunden um.
// v10 §4: Nahkampf ist gefährlich (dps ×2,5, HP ×1,6) und wächst je Fähigkeits-Stufe über 1 im Team (+3 % dps, +2 % HP).
const DMG_REF = 170, MELEE_DPS = 2.5, MELEE_HP = 1.6, LV_DPS = 0.03, LV_HP = 0.02;
const SHOUT_R = 8, LOST_MS = 8000, LOOK_MS = 3000, POST_LOOK_MS = 2500, NOISE_MS = 6000, TURN = 4;
const BAIT_MS = 30_000, PHONE_WALK = 5000, PUDDLE_R = 1.5, HORDE_SPEED = 2, QUIT_MS = 40_000;
// Arbeitsgeräusch: Klauen, Sabotieren, Abdrehen usw. hören ruhige Wachen in WORK_R Kacheln (Misstrauen pro s, bis sie nachsehen)
const WORK_R = 2, WORK_SUS = 0.3;
const ARGUE = 'Deutsche Bank ist kein Geringverdiener.';
const SPECIAL = new Set(['bernd', 'goebbels', 'himmler', 'ranger']);
const QUITS = new Set(['pinguin', 'detektiv', 'camper', 'dackel', 'platzwart']); // „Feierabend!“: normale Wachen, keine Drohnen
const TASKY = new Set(['junge', 'mutter', 'insider', 'vibra']); // Verhalten statt Betäubung: nicht auf schon Betäubte
const NOISY = new Set(['steal', 'sabotage', 'valve', 'unplug', 'ignite']);
const TASK_END = {
  junge: 'Ja, Frau Rüther …', mutter: 'Mama sagt, ich soll lieb sein.', crash: 'Puh. Nur ein Gerücht.', tratsch: 'Mit dir red ich nicht mehr.',
  insider: 'Hier ist ja gar nix.', kursalarm: 'Der Kurs war auch schon mal besser.', sale: 'Kein Geld dabei.', vp: 'Netter Mann, der Vizepräsident.',
  mittag: 'Ausgeschlafen.', horde: 'Endlich weg, die Bande.', panik: 'Zu spät. Alles weg.', raubkopie: 'Wo ist der hin?',
};

// V Wasseranschluss (fest, Sicht frei), B Baum zum Anzünden und T Baum/Deko (fest, blockieren Sicht), W Wasser (nicht begehbar, Sicht frei)
const WALK = new Set('.DPX~'), OPAQUE = new Set('#LCSK~BT'), SOLID = new Set('#LCSKVBT');
const CONE_ON = new Set(['patrol', 'suspicious', 'investigate', 'alert', 'distracted']);
const CALM = new Set(['patrol', 'suspicious', 'investigate', 'distracted']); // ablenkbar
const TIMED = new Set(['stunned', 'eating', 'bribed']);

const FAIL = {
  down: 'Liegt flach.', cd: 'Noch nicht bereit.', carry: 'Mit der PS3 im Arm geht das nicht.', target: 'Kein gültiges Ziel.',
  path: 'Da komm ich nicht hin.', full: 'Taschen voll.', empty: 'Leer. Nur ein Zettel: „Bin beim Halving.“', done: 'Schon erledigt.',
  taken: 'Die trägt schon jemand.', noEnemy: 'Kein Gegner in der Nähe. Die Familie bleibt zu Hause.', sight: 'Keine Sichtlinie.',
  ability: 'Das kann der nicht.', extract: 'Abheben geht erst, wenn das Ziel erfüllt ist und alle auf der Plattform stehen.',
  noPair: 'Zum Tratschen braucht es zwei.', charges: 'Für heute ist Feierabend aufgebraucht.', quits: 'Der kündigt nicht.', far: 'Zu weit weg.',
  noDoze: 'Keine Wache in der Nähe, die ein Nickerchen braucht.', noRumor: 'Keine Wache in der Nähe, die das Gerücht hört.', noWay: 'Da kommt die Wache nicht hin.',
};
const NO_TARGET = { family: 'noEnemy', mittag: 'noDoze', crash: 'noRumor' }; // self-Fähigkeiten ohne Gegner im Umkreis
const END_TEXT = { allDown: 'Alle liegen flach. Die Haunebu fliegt ohne euch.', soloDown: 'liegt flach. Die Haunebu fliegt ohne dich.', time: 'Die Zeit ist um.', late: 'Die Zeit ist um. Ziel erfüllt, aber die Haunebu ist ohne euch abgehoben.', abort: 'Abgebrochen. Die Haunebu sammelt euch ein.', caught: 'Erwischt! „Das wird teuer!“' };

const rad = d => d * Math.PI / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const angDiff = (a, b) => { const d = (b - a) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };
const mid = o => ({ x: o.x + 0.5, y: o.y + 0.5 });
const line = (st, e, kind) => { const l = ENEMY_TYPES[e.type].lines[kind]; return l?.length ? l[Math.floor(st.rng() * l.length) % l.length] : null; };
// Stefan redet nur über Kieser und Bulletproof Coffee (§0): hat der Typ eigene Sprüche unter einem der keys, gelten die statt fallback
const own = (st, e, keys, fallback) => { const l = ENEMY_TYPES[e.type].lines, k = keys.find(x => l[x]); return k ? line(st, e, k) : fallback; };

export const tileAt = (st, x, y) => {
  x = Math.floor(x); y = Math.floor(y);
  return x < 0 || y < 0 || x >= st.w || y >= st.h ? '#' : st.tiles[y * st.w + x];
};
const walkable = st => (x, y) => WALK.has(st.tiles[y * st.w + x]);
// Gegner kommen nicht durch die Firewall (st.wall), Rüther schon
const walkE = st => (x, y) => { const i = y * st.w + x; return WALK.has(st.tiles[i]) && !(st.wall[i] > st.time); };
// Sicht blockieren Wände/Deckung, Gas und Nebel (st.smoke: Deobombe); die blickdichte Firewall (st.fwOpaque) nur für Gegner (foe)
const blocker = (st, foe = false) => (x, y) => {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
  const i = y * st.w + x;
  return OPAQUE.has(st.tiles[i]) || st.gas[i] > st.time || st.smoke[i] > st.time || (foe && st.fwOpaque[i] > st.time);
};
// Wer selbst in Gas, Nebel oder der blickdichten Firewall steht, sieht nichts (castRay/lineOfSight zählen die Startkachel nicht mit)
const blind = (st, e) => { const i = Math.floor(e.y) * st.w + Math.floor(e.x); return st.gas[i] > st.time || st.smoke[i] > st.time || st.fwOpaque[i] > st.time; };
const pathTo = (st, ent, tx, ty, near = 0) => findPath(st.w, st.h, ent.type ? walkE(st) : walkable(st), Math.floor(ent.x), Math.floor(ent.y), tx, ty, near);
const rollMs = (st, [a, b]) => a + st.rng() * (b - a);
const buzzed = (st, e) => e.buzzUntil > st.time; // nach dem Kaffee
const enemySpeed = (st, e) => { const T = ENEMY_TYPES[e.type]; return T.speed * (buzzed(st, e) ? T.coffee.speed : 1); };
const lvl = n => Math.min(3, Math.max(1, Math.floor(n) || 1));
const quitting = e => e.state === 'task' && e.task.kind === 'feierabend';
const isOut = e => e.state === 'ko' || quitting(e); // KO, gefesselt, gekündigt
const canTask = e => !isOut(e) && !TIMED.has(e.state);
const coneOn = e => CONE_ON.has(e.state) || (e.state === 'task' && e.task.cone);
const nearest = (st, p, r, ok, n = Infinity) => st.enemies.filter(e => ok(e) && dist(e, p) <= r).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, n);
const inRect = (f, x, y) => { x = Math.floor(x); y = Math.floor(y); return x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1; };
const zoneOf = (st, kind, p, flag) => st.effects.find(f => f.kind === kind && f.until > st.time && (!flag || f[flag]) && inRect(f, p.x, p.y));
const muted = (st, u) => st.effects.length > 0 && !!zoneOf(st, 'deo', u, 'mute'); // Deobombe Stufe 3: Geräusche gedämpft, Deckung

// ---------- Erzeugen ----------

// Setup → Karte. Neues Format (layouts): buildSetup aus missions.js; altes Format (map/variants direkt an der Mission,
// z. B. Test-Missionen): die Mission ist das einzige Layout, ungespiegelt, Variante per id/Objekt/Index oder rng.
function resolveSetup(m, setup, variant, rng) {
  if (!m.layouts) {
    const v = variant == null ? m.variants[Math.floor(rng() * m.variants.length) % m.variants.length]
      : typeof variant === 'object' ? variant
        : typeof variant === 'number' ? m.variants[variant] : m.variants.find(x => x.id === variant);
    if (!v) throw new Error('Unbekannte Variante');
    const rows = m.map.map(r => r.split(''));
    for (const [x, y, ch] of v.patch || []) rows[y][x] = ch;
    return { setup: { layoutId: null, variantId: v.id, mirror: false, seed: 0 }, built: { layout: m, variant: v, map: rows.map(r => r.join('')), gate: m.gate, enemies: v.enemies, coins: v.coins, mirror: false } };
  }
  if (!setup && variant != null) { // Kompatibilität: Variante (id/Objekt) ohne setup, ungespiegelt
    const id = typeof variant === 'object' ? variant.id : variant, l = m.layouts.find(x => x.variants.some(v => v.id === id));
    if (!l) throw new Error('Unbekannte Variante');
    setup = { layoutId: l.id, variantId: id, mirror: false, seed: Math.floor(rng() * 4294967296) };
  }
  setup ||= pickSetup(m, rng);
  const built = buildSetup(m, setup);
  if (!built?.map) throw new Error('Unbekanntes Layout oder Variante');
  return { setup, built };
}

// mission: Objekt oder id; setup: { layoutId, variantId, mirror, seed } (leer = pickSetup per rng);
// variant: nur Kompatibilität (id/Objekt); team: Kampfwerte (makeFighter), 1–3; bei mission.solo nur dieser Rüther.
// team[i].loadout (loadoutFor aus progress.js): [{id, level}, {id, level}, {id, level}|null]; fehlt es, gelten die 2 festen auf Stufe 1.
export function createQuest({ mission, setup, variant, team, rng = Math.random }) {
  const m = typeof mission === 'string' ? MISSION_BY_ID[mission] : mission;
  if (!m) throw new Error('Unbekannte Mission');
  if (!team?.length) throw new Error('Kein Team');
  const { setup: su, built: b } = resolveSetup(m, setup, variant, rng);
  const v = b.variant, rows = b.map;
  const h = rows.length, w = rows[0].length;
  const coinMap = b.coins && typeof b.coins === 'object' ? b.coins : null;
  const coins0 = typeof b.coins === 'number' ? b.coins : b.layout?.coins ?? m.coins ?? 2;
  const st = {
    missionId: m.id, variantId: v.id, layoutId: su.layoutId, mirror: !!b.mirror, setup: su, mission: m, variant: v, layout: b.layout,
    theme: m.theme, w, h, tiles: [], gas: new Float64Array(w * h), smoke: new Float64Array(w * h), wall: new Float64Array(w * h), fwOpaque: new Float64Array(w * h), paths: new Map(),
    time: 0, timeLimit: m.timeMs ?? null, alarm: 0, fullAlarm: false, alarmEver: false, contact: false, reinforceAt: 0, reinforced: 0,
    over: false, result: null, reason: null, paused: null, pausedBy: null, kieser: 0, fine: 0, solo: m.solo || null,
    units: [], enemies: [], objs: [], doors: [], pads: [], spots: [], effects: [], pending: [],
    delivered: 0, objective: null, gate: { x: b.gate[0], y: b.gate[1] }, lastSighting: null, nextId: 1, rng, dmgScale: 1, hpScale: 1,
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x], kind = OBJ_TILE[ch], o = kind && { id: st.objs.length, kind, x, y };
    if (kind === 'vault') o.coins = coinMap?.[`${x},${y}`] ?? coins0;
    else if (kind === 'item') Object.assign(o, { taken: false, by: -1, delivered: false });
    else if (kind) o.done = false;
    if (kind === 'tree') Object.assign(o, { litAt: 0, spotted: false });
    if (o) st.objs.push(o);
    else if (ch === 'D' || ch === 'L') st.doors.push({ id: st.doors.length, x, y, locked: ch === 'L', opening: false });
    else if (ch === 'P') st.pads.push({ x, y });
    st.tiles.push(ch === 'X' ? '.' : ch);
  }
  const type = m.objective.type;
  const total = type === 'steal' ? st.objs.reduce((s, o) => s + (o.coins || 0), 0) : COUNTED[type] ? st.objs.filter(o => o.kind === COUNTED[type]).length : 1;
  st.objective = { type, label: m.objective.label, done: 0, total, min: m.objective.min ?? total };
  // Start auf der Plattform, von der Mitte aus
  const cx = st.pads.reduce((s, p) => s + p.x, 0) / st.pads.length, cy = st.pads.reduce((s, p) => s + p.y, 0) / st.pads.length;
  st.spots = [...st.pads].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const squad = m.solo ? [team.find(f => f.id === m.solo) || team[0]] : team.slice(0, 3);
  squad.forEach((f, i) => {
    const p = st.spots[i % st.spots.length], seen = new Set();
    const abilities = (f.loadout || (FIXED[f.id] || []).map(id => ({ id, level: 1 })))
      .filter(a => a && ABILITIES[a.id]?.unit === f.id && !seen.has(a.id) && seen.add(a.id)).map(a => ({ id: a.id, level: lvl(a.level) }));
    const charges = {};
    for (const a of abilities) { const c = params(a.id, a.level).charges; if (c != null) charges[a.id] = c; }
    st.units.push({
      i, id: f.id, name: f.name, rarity: f.rarity, level: f.level, power: f.power || 1, hp: f.maxBtc, maxHp: f.maxBtc,
      x: p.x + 0.5, y: p.y + 0.5, dir: 0, state: 'idle', path: [], goal: { x: p.x, y: p.y }, intent: null, busy: null,
      carry: 0, item: false, cd: {}, down: false, swingAt: 0,
      abilities, charges, disguiseUntil: 0, disguiseK: 1, vpSend: null, quickSteal: false,
    });
  });
  const up = st.units.reduce((s, u) => s + u.abilities.reduce((t, a) => t + a.level - 1, 0), 0); // Stufen über 1 im Team
  st.dmgScale = st.units.reduce((s, u) => s + u.maxHp, 0) / st.units.length / DMG_REF * (1 + LV_DPS * up);
  st.hpScale = 1 + LV_HP * up;
  for (const d of b.enemies) addEnemy(st, d);
  return st;
}

function addEnemy(st, d) {
  const T = ENEMY_TYPES[d.type];
  if (!T) throw new Error(`Unbekannter Gegner ${d.type}`);
  const dir = rad(d.dir ?? 0), patrol = (d.patrol || []).map(([x, y, wait = 0, wd]) => ({ x, y, wait, dir: wd == null ? null : rad(wd) }));
  const hp = Math.round(T.hp * MELEE_HP * st.hpScale);
  // task: Verhalten aus Fähigkeiten (state 'task'); *Until: Nachwirkungen; revealed: vom Spitzel aufgedeckt; melee: schlägt gerade zu; gone: gekündigt
  const e = {
    i: st.enemies.length, type: d.type, name: T.name, x: d.at[0] + 0.5, y: d.at[1] + 0.5, dir, hp, maxHp: hp,
    state: 'patrol', reason: null, until: 0, suspicion: 0, patrol,
    wp: 0, waitUntil: 0, waitDir: null, look: (d.look || []).map(rad), lookI: 0, lookAt: 0, lookDir: dir, home: { x: d.at[0], y: d.at[1], wait: 0, dir },
    path: [], goal: null, target: null, seen: -1, lastSeen: null, lostT: 0, swingAt: 0, repathAt: 0, bait: null, tied: false,
    reinforcement: !!d.reinforcement, coffeeAt: T.coffee ? st.time + rollMs(st, T.coffee.every) : 0, buzzUntil: 0, barkAt: 0,
    task: null, sightK: 1, tearyUntil: 0, grumpyUntil: 0, calmUntil: 0, spyUntil: 0, spyR: 0, saleAt: 0, revealed: false, melee: false, gone: false,
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

// Ergebnis für onEnd und questResult(save, missionId, result, score, alarmFree, { kieser, fine }).
// score = erfüllte Ziele (Raub: abgelieferte Münzen); jeder liegengelassene Rüther (down, nicht auf P) kostet 1.
export function questSummary(st) {
  const o = st.objective, alarmFree = !st.alarmEver;
  const leftBehind = st.units.filter(u => u.down && tileAt(st, u.x, u.y) !== 'P').length;
  return {
    result: st.result, reason: st.reason, missionId: st.missionId, layoutId: st.layoutId, variantId: st.variantId, mirror: st.mirror, setup: st.setup,
    score: Math.max(0, o.done - leftBehind), objective: { done: o.done, total: o.total, min: o.min }, timeMs: st.time, alarmFree,
    delivered: st.delivered, leftBehind, kieser: st.kieser, fine: st.fine,
  };
}

// Kegelmaße; liefert ein geteiltes Objekt (Sichtprüfung je Gegner × Rüther × Schritt ohne Allokation), sofort auslesen
const CONE = { range: 0, half: 0 };
const coneOf = (st, e) => {
  const T = ENEMY_TYPES[e.type], c = buzzed(st, e) ? T.coffee : null;
  CONE.range = T.sight * (st.fullAlarm ? FULL_CONE : 1) * (c ? c.sight : 1) * e.sightK; CONE.half = rad(T.angle * (c ? c.angle : 1)) / 2;
  return CONE;
};

// Sichtkegel als Polygon [Ursprung, Randpunkte …] in Kacheln, an Wänden, Deckung, Gas und Nebel abgeschnitten. [] = Kegel aus.
export function visibleCone(st, i) {
  const e = st.enemies[i];
  if (!e || !coneOn(e) || blind(st, e)) return [];
  const { range, half } = coneOf(st, e), blk = blocker(st, true);
  const n = Math.max(8, Math.ceil(half * 2 / 0.07));
  const pts = [{ x: e.x, y: e.y }];
  for (let k = 0; k <= n; k++) {
    const a = e.dir - half + 2 * half * k / n, cx = Math.cos(a), cy = Math.sin(a);
    const d = castRay(blk, e.x, e.y, cx, cy, range);
    pts.push({ x: e.x + cx * d, y: e.y + cy * d });
  }
  return pts;
}

// Gültige Ziele einer Fähigkeit auf der Stufe der Einheit (zum Leuchten im Zielmodus). Reichweite egal, der Rüther läuft hin;
// inRange sagt, ob sofort. 'self': wer betroffen wäre; 'teammatePoint': die Teammitglieder (wessen Gesicht); reine Punktziele: [].
export function abilityTargets(st, unit, abilityId) {
  const u = st.units[unit], own = u?.abilities.find(a => a.id === abilityId);
  if (!own) return [];
  const id = own.id, p = params(id, own.level), out = [], inR = (q, r) => dist(q, u) <= r;
  if (p.target === 'door') for (const d of st.doors) { if (d.locked && !d.opening) out.push({ door: d.id, ...mid(d), inRange: inR(mid(d), p.range) }); }
  if (p.target === 'enemy' || p.target === 'enemyThenPoint' || p.target === 'vaultOrDrone') for (const e of st.enemies) {
    if (enemyOk(id, e)) out.push({ enemy: e.i, x: e.x, y: e.y, inRange: inR(e, p.range) });
  }
  if (p.target === 'vaultOrDrone') for (const o of st.objs) { if (o.kind === 'vault' && o.coins > 0) out.push({ obj: o.id, ...mid(o), inRange: inR(mid(o), p.vaultRange) }); }
  if (p.target === 'teammatePoint') for (const t of st.units) out.push({ unit: t.i, x: t.x, y: t.y, inRange: true });
  if (p.target === 'self') for (const e of selfTargets(st, u, id, p)) out.push({ enemy: e.i, x: e.x, y: e.y, inRange: true });
  return out;
}

const enemyOk = (id, e) => !isOut(e) && (id !== 'wallet' || e.type === 'drohne') && (id !== 'feierabend' || QUITS.has(e.type)) && (!TASKY.has(id) || !TIMED.has(e.state));

// Wen trifft eine Fähigkeit ohne Ziel? Familie: die n nächsten (auch Betäubte); Tratsch: die 2 nächsten; Mittagsruhe/Crash: alle im Umkreis
function selfTargets(st, u, id, p) {
  if (id === 'family') return nearest(st, u, p.range, e => !isOut(e), p.n);
  if (id === 'tratsch') return nearest(st, u, p.r, canTask, 2);
  if (id === 'mittag' || id === 'crash') return nearest(st, u, p.r, canTask);
  return [];
}

// ---------- Schritt ----------

// st.paused ('kieser'): Zeit steht, nur {type:'resume'} und {type:'abort'} werden angenommen.
export function tick(st, dt, cmds = []) {
  const ev = [];
  if (st.over) return ev;
  for (const c of cmds) {
    if (st.paused && c.type !== 'resume' && c.type !== 'abort') continue;
    command(st, c, ev);
    if (st.over) return ev;
  }
  if (st.paused || !(dt > 0)) return ev; // taktische Pause: nur Befehle
  st.time += dt;
  st.contact = false;
  const done0 = st.objective.done;
  // fällige Wurf-/Effekt-Folgen
  if (st.pending.length) {
    const due = st.pending.filter(p => p.at <= st.time);
    if (due.length) { st.pending = st.pending.filter(p => p.at > st.time); for (const p of due) resolve(st, p, ev); }
  }
  if (st.effects.length) {
    let walls = false;
    st.effects = st.effects.filter(f => {
      if (f.until > st.time) return true;
      ev.push({ type: 'effectEnd', effect: f.id, kind: f.kind, x: f.x, y: f.y });
      if (f.kind === 'firewall') walls = true;
      if (f.alarmDrop) { st.alarm = Math.max(0, st.alarm - f.alarmDrop); ev.push({ type: 'alarmDrop', ability: 'kursalarm', effect: f.id, drop: f.alarmDrop, alarm: st.alarm }); }
      return false;
    });
    if (walls) wallChanged(st);
  }
  assignBaits(st, ev);
  spotFires(st, ev);
  effectsStep(st, dt, ev);
  const blk = blocker(st), blkE = blocker(st, true);
  for (const u of st.units) updateUnit(st, u, dt, ev, blk);
  for (let k = 0, n = st.enemies.length; k < n && !st.paused && !st.over; k++) updateEnemy(st, st.enemies[k], dt, ev, blkE);
  if (st.over) return ev; // erwischt
  updateObjective(st);
  const o = st.objective;
  if (o.done !== done0) ev.push({ type: 'objective', kind: o.type, label: o.label, done: o.done, total: o.total, min: o.min, reached: o.done >= o.min });
  if (st.paused) return ev; // Kieser: Rest nach resume
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
  if (st.units.every(u => u.down)) end(st, 'fail', 'allDown', ev);
  else if (st.timeLimit != null && st.time >= st.timeLimit) end(st, o.type === 'steal' && o.done >= o.min ? 'success' : 'fail', 'time', ev);
  return ev;
}

function end(st, result, reason, ev) {
  st.over = true; st.result = result; st.reason = reason; st.paused = null;
  for (const u of st.units) { u.path = []; u.intent = null; u.busy = null; }
  const o = st.objective, t = st.mission.texts, late = reason === 'time' && o.done >= o.min; // Ziel geschafft, nur nicht abgehoben: kein „Heizung brummt weiter“
  const why = reason === 'allDown' && st.solo ? `${st.units[0].name} ${END_TEXT.soloDown}` : END_TEXT[reason];
  const text = result === 'success' ? t.success : result === 'abort' ? END_TEXT.abort : late ? END_TEXT.late
    : reason === 'caught' && t.caught ? t.caught : `${why} ${t.fail}`;
  ev.push({ type: 'end', result, reason, text, setup: st.setup, fine: st.fine, kieser: st.kieser, summary: questSummary(st) });
}

const doneCount = (st, kind) => { let n = 0; for (const x of st.objs) if (x.kind === kind && x.done) n++; return n; };

function updateObjective(st) {
  const o = st.objective;
  if (o.type === 'steal') o.done = st.delivered;
  else if (COUNTED[o.type]) o.done = doneCount(st, COUNTED[o.type]);
  else if (o.type === 'fetch') o.done = st.objs.some(x => x.kind === 'item' && x.delivered) ? 1 : 0;
  else o.done = st.objs.some(x => x.kind === 'plug' && x.done) ? 1 : 0;
}

const fail = (ev, u, action, reason, extra = {}) => { ev.push({ type: 'fail', unit: u ? u.i : null, action, reason, text: FAIL[reason], ...extra }); return false; };

// ---------- Befehle ----------

function command(st, c, ev) {
  if (c.type === 'abort') return end(st, 'abort', 'abort', ev);
  if (c.type === 'resume') return st.paused && resume(st, ev);
  if (c.type === 'catch') { // Debug „Stefan ruft“: Fänger (sonst der erste mit catches) erwischt die Einheit (sonst 0) sofort
    const e = st.enemies[c.enemy ?? st.enemies.findIndex(x => ENEMY_TYPES[x.type].catches)], u = st.units[c.unit ?? 0];
    return e && ENEMY_TYPES[e.type].catches && u && !u.down && catchUnit(st, e, u, ev);
  }
  if (c.type === 'extract') return canExtract(st) ? end(st, 'success', 'extract', ev) : fail(ev, null, 'extract', 'extract');
  const u = st.units[c.unit];
  if (!u) return;
  if (u.down) return fail(ev, u, c.type, 'down');
  if (c.type === 'stop') { cancelBusy(u, 'befehl', ev); u.path = []; u.intent = null; u.goal = null; return; }
  // Fähigkeiten: c.ability, c.target, dazu je Zieltyp c.target2 {x,y}, c.dir 'h'|'v', c.face (Index des Teammitglieds)
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
  if (o.done) return fail(ev, u, 'interact', 'done', { obj: o.id });
  if (o.kind === 'item' && (o.taken || o.delivered)) return fail(ev, u, 'interact', 'taken', { obj: o.id });
  return true;
}

const ON_GROUND = new Set(['mms', 'raubkopie', 'sale', 'horde']); // Startpunkt nur auf begehbarem Boden
// Insider-Tipp: Kommt die Wache zum Zielpunkt (Tür L, Wasser, Firewall)?
const guardWay = (st, e, q) => !!pathTo(st, e, Math.floor(q.x), Math.floor(q.y));
const notReady = (st, u, id, p) => (u.cd[id] || 0) > st.time ? 'cd' : p.charges != null && !(u.charges[id] > 0) ? 'charges' : null;

function abilityIntent(st, u, c, ev) {
  const own = u.abilities.find(a => a.id === c.ability), t = c.target || {};
  if (!own) return fail(ev, u, 'ability', 'ability', { ability: c.ability });
  const id = own.id, p = params(id, own.level), kind = p.target, no = r => fail(ev, u, 'ability', r, { ability: id });
  if (u.item) return no('carry');
  const why = notReady(st, u, id, p);
  if (why) return no(why);
  const it = { kind: 'ability', ability: id, range: p.range ?? 0, los: !!p.los, near: 0, target: null };
  const spot = q => q?.x != null && q.y != null && !SOLID.has(tileAt(st, q.x, q.y));
  const ground = q => spot(q) && WALK.has(tileAt(st, q.x, q.y)); // begehbar: Köder, Startpunkt der Kopie, Zielpunkte
  if (kind === 'self') {
    const n = selfTargets(st, u, id, p).length;
    if (id === 'tratsch' && n < 2) return no('noPair');
    if (NO_TARGET[id] && !n) return no(NO_TARGET[id]);
    it.target = {};
  } else if (kind === 'door') {
    const d = t.door != null ? st.doors[t.door] : st.doors.find(x => x.x === Math.floor(t.x) && x.y === Math.floor(t.y));
    if (!d || !d.locked || d.opening) return no('target');
    it.target = { door: d.id }; it.near = REACH;
  } else if (kind === 'vaultOrDrone' && t.enemy == null) {
    const o = t.obj != null ? st.objs[t.obj] : t.x != null ? st.objs.find(x => x.x === Math.floor(t.x) && x.y === Math.floor(t.y)) : null;
    if (!o || o.kind !== 'vault') return no('target');
    if (o.coins <= 0) return no('empty');
    if (u.carry >= CARRY_MAX) return no('full');
    Object.assign(it, { target: { obj: o.id }, range: p.vaultRange, near: REACH });
  } else if (kind === 'enemy' || kind === 'enemyThenPoint' || kind === 'vaultOrDrone') {
    const e = t.enemy != null ? st.enemies[t.enemy] : null;
    if (e && id === 'feierabend' && !isOut(e) && !QUITS.has(e.type)) return no('quits');
    if (!e || !enemyOk(id, e)) return no('target');
    if (kind === 'enemyThenPoint') {
      if (!ground(c.target2)) return no('target');
      if (dist(c.target2, e) > p.range2) return no('far');
      if (!guardWay(st, e, c.target2)) return no('noWay');
      it.target2 = { x: c.target2.x, y: c.target2.y };
    }
    it.target = { enemy: e.i }; it.near = p.range >= REACH ? REACH : 0;
  } else { // Punktziele: point, pointDir, pointThenPoint, teammatePoint
    if (!spot(t)) return no('target');
    if (ON_GROUND.has(id) && !ground(t)) return no('target'); // Köder ins Wasser frisst keiner, Schild und Horde stehen nicht im Fluss
    if (kind === 'pointThenPoint' || kind === 'teammatePoint') {
      if (!ground(c.target2)) return no('target');
      if (p.range2 && dist(c.target2, t) > p.range2) return no('far');
      it.target2 = { x: c.target2.x, y: c.target2.y };
    }
    if (kind === 'pointDir') it.dir = c.dir === 'v' ? 'v' : 'h';
    if (kind === 'teammatePoint') it.face = st.units[c.face] ? c.face : u.i;
    // Ziel darf hinter einer Wand liegen: hinlaufen nur bis sicher in Wurfweite
    it.target = { x: t.x, y: t.y }; it.near = Math.max(0, it.range - 1.42);
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
  const taken = new Set(st.units.filter(o => o !== u && !o.down).map(o => { const g = o.goal || o.path[o.path.length - 1] || { x: Math.floor(o.x), y: Math.floor(o.y) }; return g.y * st.w + g.x; }));
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
  if (u.disguiseUntil) disguise(st, u, ev);
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
    if (kind === 'steal' && u.quickSteal) { b.ms = 0; u.quickSteal = false; } // Plus 70 Prozent Stufe 3
    unmask(u, 'klau', ev);
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
  if (NOISY.has(b.kind)) workNoise(st, u, dt, ev);
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
  if (o.done) return fail(ev, u, 'interact', 'done', { obj: o.id });
  if (b.kind === 'fetch' && o.taken) return fail(ev, u, 'interact', 'taken', { obj: o.id });
  if (b.kind === 'steal') {
    if (u.carry < CARRY_MAX) {
      o.coins--; u.carry++;
      ev.push({ type: 'steal', unit: u.i, obj: o.id, n: 1, coins: u.carry, left: o.coins, x: at.x, y: at.y });
    }
    if (o.coins > 0 && u.carry < CARRY_MAX) u.busy = { ...b, t: 0, ms: ACT_MS.steal }; // nächste Münze (wieder normal lang)
    else if (!o.coins) ev.push({ type: 'vaultEmpty', obj: o.id, x: at.x, y: at.y });
  } else if (b.kind === 'sabotage' || b.kind === 'valve' || b.kind === 'ignite') {
    o.done = true;
    if (b.kind === 'ignite') o.litAt = st.time; // brennt ab jetzt dauerhaft, Ranger bemerken es nach FIRE_MS
    ev.push({ type: b.kind, unit: u.i, obj: o.id, x: at.x, y: at.y, done: doneCount(st, o.kind), total: st.objective.total });
  } else if (b.kind === 'fetch') {
    o.taken = true; o.by = u.i; u.item = true;
    ev.push({ type: 'pickup', unit: u.i, obj: o.id, x: at.x, y: at.y });
    if (st.mission.pickupNoise && !muted(st, u)) noise(st, at.x, at.y, st.mission.pickupNoise, 'alarmanlage', ev);
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

// Klappern bei der Arbeit: ruhige Wachen in WORK_R Kacheln werden misstrauisch und sehen nach, Dösende wachen auf.
// Im Deo-Nebel Stufe 3 hört es keiner.
function workNoise(st, u, dt, ev) {
  if (muted(st, u)) return;
  for (const e of st.enemies) {
    if (dist(e, u) > WORK_R) continue;
    if (e.state === 'task' && e.task.kind === 'mittag') { wakeDozer(st, e, ev); continue; }
    if (!CALM.has(e.state) || e.bait != null || e.seen === u.i || e.calmUntil > st.time) continue;
    e.suspicion = Math.min(SUS_SHOW, e.suspicion + WORK_SUS * dt / 1000);
    if (e.suspicion >= SUS_SHOW && e.state !== 'investigate') {
      investigate(st, e, u, SUS_SHOW);
      ev.push({ type: 'heard', enemy: e.i, unit: u.i, x: e.x, y: e.y, say: own(st, e, ['heard'], 'Was klappert da?') });
    }
  }
}

// Vice-President-Auftritt: Ablauf und Stufe 3 („Gehen Sie mal zum Tor!“ an die erste ruhige Wache in sendR)
function disguise(st, u, ev) {
  if (st.time >= u.disguiseUntil || u.down) return unmask(u, u.down ? 'flach' : 'zeit', ev);
  if (!u.vpSend) return;
  const e = st.enemies.find(x => (CALM.has(x.state) || x.state === 'suspicious') && dist(x, u) <= u.vpSend.r);
  if (!e) return;
  ev.push({ type: 'vpSend', unit: u.i, enemy: e.i, ms: u.vpSend.ms, x: u.x, y: u.y, say: 'Gehen Sie mal zum Tor!' });
  setTask(st, e, { kind: 'vp', to: st.gate, near: REACH, ms: Infinity, end: st.time + u.vpSend.ms, cone: true }, ev, 'Sofort, Herr Vizepräsident!');
  u.vpSend = null;
}

// Tarnung bricht: Klauen/Sabotieren ('klau'), Prügeln ('angriff'), abgelaufen ('zeit'), umgefallen ('flach')
function unmask(u, reason, ev) {
  if (!u.disguiseUntil) return;
  u.disguiseUntil = 0; u.vpSend = null;
  ev.push({ type: 'disguiseEnd', unit: u.i, reason, x: u.x, y: u.y });
}

// Automatische Gegenwehr gegen angrenzende alarmierte Gegner: DEFEND × power pro s
function defend(st, u, ev) {
  if (st.time < u.swingAt) return;
  let foe = null, fd = MELEE;
  for (const e of st.enemies) if (e.state === 'alert') { const d = dist(u, e); if (d <= fd) { foe = e; fd = d; } }
  if (!foe) return;
  unmask(u, 'angriff', ev);
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

// ---------- Fähigkeiten ----------

// Spezialgegner bekommen bei manchen Fähigkeiten nur special × Dauer
const dur = (e, p, ms = p.ms) => Math.round(ms * (p.special && SPECIAL.has(e.type) ? p.special : 1));
const second = (st, e, r, ok = canTask) => (r ? nearest(st, e, r, x => x !== e && ok(x), 1)[0] || null : null);

// Rechteck w×h um die Kachel von (x,y) als Effekt; tiles = die nicht festen Kacheln darin
function rectEffect(st, kind, x, y, w, h, ms, extra = {}) {
  const cx = Math.floor(x), cy = Math.floor(y), x0 = cx - Math.floor(w / 2), y0 = cy - Math.floor(h / 2), tiles = [];
  for (let ty = y0; ty < y0 + h; ty++) for (let tx = x0; tx < x0 + w; tx++) if (!SOLID.has(tileAt(st, tx, ty))) tiles.push({ x: tx, y: ty });
  const f = { id: st.nextId++, kind, x: cx + 0.5, y: cy + 0.5, x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, tiles, until: st.time + ms, ms, ...extra };
  st.effects.push(f);
  return f;
}
const paint = (st, arr, tiles, until) => { for (const q of tiles) { const i = q.y * st.w + q.x; arr[i] = Math.max(arr[i], until); } };
const rectOf = f => ({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1 });

function stun(st, e, reason, ms, ev, say, state = 'stunned', extra = {}) {
  timed(e, state, reason, st.time + ms);
  ev.push({ type: 'stun', enemy: e.i, reason, ms, x: e.x, y: e.y, say, ...extra });
}

function cast(st, u, it, ev) {
  const id = it.ability, own = u.abilities.find(a => a.id === id), p = params(id, own.level), t = it.target;
  const no = r => fail(ev, u, 'ability', r, { ability: id });
  if (u.item) return no('carry');
  const why = notReady(st, u, id, p);
  if (why) return no(why);
  const e = t.enemy != null ? st.enemies[t.enemy] : null;
  if (e && !enemyOk(id, e)) return no('target');
  if (e) u.dir = angTo(u, e);
  const base = { type: 'ability', unit: u.i, ability: id, level: own.level, name: ABILITIES[id].name, x: u.x, y: u.y };
  const flight = q => Math.round(350 + 70 * dist(u, q));
  switch (id) {
    case 'plus70': {
      const d = st.doors[t.door];
      d.opening = true;
      st.pending.push({ at: st.time + 900, kind: 'door', door: d.id, by: u.i, noise: p.noise || 0 });
      if (p.quickSteal) u.quickSteal = true;
      ev.push({ ...base, door: d.id, tx: d.x + 0.5, ty: d.y + 0.5, ms: 900, silent: !p.noise, quick: !!p.quickSteal });
      break;
    }
    case 'beer': case 'mms': case 'kursalarm': { // Würfe: Wirkung bei der Landung (resolve)
      const ms = flight(t);
      st.pending.push({ at: st.time + ms, kind: id, x: t.x, y: t.y, by: u.i, p });
      const extra = id === 'beer' ? { item: 'can', puddle: !!p.puddle } : id === 'mms' ? { item: 'mms', portions: p.portions } : { item: 'phone', stare: p.ms, r: p.r };
      ev.push({ ...base, ...extra, tx: t.x, ty: t.y, ms });
      break;
    }
    case 'vp':
      Object.assign(u, { disguiseUntil: st.time + p.ms, disguiseK: p.himmler, vpSend: p.send ? { ms: p.send, r: p.sendR } : null });
      ev.push({ ...base, ms: p.ms, until: u.disguiseUntil, send: !!p.send, say: 'Rüther, Vice President. Ich bin angemeldet.' });
      break;
    case 'wlan': {
      const f = rectEffect(st, 'wlan', t.x, t.y, p.size, p.size, p.ms, { sight: p.sight, funkloch: !!p.funkloch });
      ev.push({ ...base, effect: f.id, tx: f.x, ty: f.y, size: p.size, rect: rectOf(f), tiles: f.tiles, ms: p.ms, funkloch: f.funkloch });
      break;
    }
    case 'family': {
      const targets = selfTargets(st, u, id, p);
      if (!targets.length) return no('noEnemy');
      const ms = 1500;
      for (const x of targets) timed(x, 'stunned', 'family', st.time + ms);
      st.pending.push({ at: st.time + ms, kind: 'family', targets: targets.map(x => x.i), by: u.i, x: u.x, y: u.y, noise: p.noise || 0 });
      // die echten Christian und Micha rennen vom nächsten Kartenrand heran
      const helpers = ['christian', 'micha'].map((hid, k) => {
        const x = targets[k % targets.length];
        return { id: hid, enemy: x.i, x: x.x < st.w / 2 ? 0 : st.w, y: x.y, tx: x.x, ty: x.y };
      });
      ev.push({ ...base, targets: targets.map(x => x.i), helpers, ms, silent: !p.noise });
      break;
    }
    case 'junge': {
      const ms = dur(e, p), at = { x: u.x, y: u.y };
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms, say: 'Junge, komm mal her!' });
      setTask(st, e, { kind: 'junge', to: at, near: REACH, ms, face: at, calm: p.calm || 0 }, ev, 'Ich hab doch gar nix gemacht!');
      break;
    }
    case 'mittag': case 'crash': {
      const hit = selfTargets(st, u, id, p);
      if (!hit.length) return no(NO_TARGET[id]);
      ev.push({ ...base, enemies: hit.map(x => x.i), r: p.r, ms: p.ms, say: id === 'mittag' ? 'Mittagsruhe! Alle mal hinlegen.' : 'Psst. Morgen crasht alles.' });
      for (const x of hit) {
        if (id === 'mittag') setTask(st, x, { kind: 'mittag', ms: p.ms, wakeR: p.wakeR, grumpy: p.grumpy }, ev, 'Zzz …');
        else setTask(st, x, { kind: 'crash', ms: dur(x, p), panic: p.panic || 0 }, ev, 'Mein Depot! Alles rot!');
      }
      break;
    }
    case 'tratsch': {
      const [a, b] = selfTargets(st, u, id, p);
      if (!b) return no('noPair');
      const meet = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ev.push({ ...base, enemies: [a.i, b.i], meet, ms: p.ms, say: 'Habt ihr gehört, was der über dich erzählt?' });
      setTask(st, a, { kind: 'tratsch', to: meet, near: REACH, ms: dur(a, p), cone: true, trust: u.i, faceEnemy: b.i, pair: b.i, swap: !!p.swap }, ev, 'Was hast du über mich gesagt?');
      setTask(st, b, { kind: 'tratsch', to: meet, near: REACH, ms: dur(b, p), cone: true, trust: u.i, faceEnemy: a.i, pair: a.i, swap: !!p.swap }, ev, 'Ich? Du hast doch angefangen!');
      break;
    }
    case 'mutter': {
      const ms = dur(e, p);
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms, say: 'Ich ruf deine Mutter an!' });
      setTask(st, e, { kind: 'mutter', to: st.gate, near: REACH, ms: Infinity, end: st.time + ms, teary: p.teary || 0 }, ev, 'Mama? Nein, ich hab nix angestellt!');
      break;
    }
    case 'gas': { // Stufe 3: 3×5, dir 'h' = quer (5 breit), 'v' = längs (5 hoch)
      const [w, h] = it.dir === 'v' ? [p.w, p.h] : [p.h, p.w];
      const f = rectEffect(st, 'gas', t.x, t.y, w, h, p.ms, { dir: it.dir || null });
      paint(st, st.gas, f.tiles, f.until);
      ev.push({ ...base, effect: f.id, tx: f.x, ty: f.y, tiles: f.tiles, rect: rectOf(f), dir: f.dir, ms: p.ms });
      break;
    }
    case 'argue': {
      const two = second(st, e, p.second);
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms: p.ms, say: ARGUE, second: two ? two.i : -1 });
      stun(st, e, 'argue', p.ms, ev, '…');
      if (two) stun(st, two, 'argue', p.ms, ev, '…', 'stunned', { listener: true });
      break;
    }
    case 'insider': {
      const to = it.target2;
      if (!guardWay(st, e, to)) return no('noWay'); // inzwischen versperrt: keine Abklingzeit
      const two = second(st, e, p.second);
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, to, ms: dur(e, p), second: two ? two.i : -1, say: 'Psst. Da drüben gibt’s gleich Freibier.' });
      setTask(st, e, { kind: 'insider', to, ms: dur(e, p), cone: true, trust: u.i }, ev, 'Echt? Bin unterwegs.');
      if (two) setTask(st, two, { kind: 'insider', to, near: REACH, ms: dur(two, p), cone: true, trust: u.i }, ev, 'Warte, ich komm mit!');
      break;
    }
    case 'deo': {
      const f = rectEffect(st, 'deo', t.x, t.y, p.size, p.size, p.ms, { mute: !!p.mute });
      paint(st, st.smoke, f.tiles, f.until);
      ev.push({ ...base, effect: f.id, tx: f.x, ty: f.y, size: p.size, rect: rectOf(f), tiles: f.tiles, ms: p.ms, mute: f.mute });
      break;
    }
    case 'wallet': {
      if (t.obj != null) {
        const o = st.objs[t.obj], n = Math.min(CARRY_MAX - u.carry, o.coins), at = mid(o);
        if (!o.coins) return no('empty');
        if (n <= 0) return no('full');
        o.coins -= n; u.carry += n;
        const steals = [{ type: 'steal', unit: u.i, obj: o.id, n, coins: u.carry, left: o.coins, x: at.x, y: at.y, instant: true }], shared = [];
        // Stufe 3: Teamkameraden in share Kacheln bekommen am selben Tresor auch volle Taschen
        if (p.share) for (const m of st.units) {
          const k = Math.min(CARRY_MAX - m.carry, o.coins);
          if (m === u || m.down || m.item || k <= 0 || dist(m, u) > p.share) continue;
          o.coins -= k; m.carry += k;
          shared.push({ unit: m.i, coins: k });
          unmask(m, 'klau', ev);
          steals.push({ type: 'steal', unit: m.i, obj: o.id, n: k, coins: m.carry, left: o.coins, x: at.x, y: at.y, instant: true, shared: true });
        }
        steals[0].left = o.coins + shared.reduce((s, x) => s + x.coins, 0);
        ev.push({ ...base, mode: 'vault', obj: o.id, coins: n, shared, tx: at.x, ty: at.y, ms: 800 }, ...steals);
        if (!o.coins) ev.push({ type: 'vaultEmpty', obj: o.id, x: at.x, y: at.y });
      } else {
        ev.push({ ...base, mode: 'drone', enemy: e.i, tx: e.x, ty: e.y, ms: p.ms });
        stun(st, e, 'hack', p.ms, ev);
      }
      break;
    }
    case 'controller': {
      const ms = Math.round(300 + 60 * dist(u, e));
      st.pending.push({ at: st.time + ms, kind: 'controller', enemy: e.i, by: u.i, ms: p.ms, bounce: p.bounce || 0 });
      ev.push({ ...base, item: 'controller', enemy: e.i, tx: e.x, ty: e.y, ms, ko: p.ms, bounce: !!p.bounce });
      break;
    }
    case 'firewall': { // dir 'h' = quer (Reihe), 'v' = längs (Spalte)
      const f = rectEffect(st, 'firewall', t.x, t.y, it.dir === 'v' ? 1 : p.len, it.dir === 'v' ? p.len : 1, p.ms, { dir: it.dir, opaque: !!p.opaque });
      paint(st, st.wall, f.tiles, f.until);
      if (f.opaque) paint(st, st.fwOpaque, f.tiles, f.until); // nur Gegner sehen nicht durch, Rüther schon
      wallChanged(st);
      ev.push({ ...base, effect: f.id, tx: f.x, ty: f.y, tiles: f.tiles, rect: rectOf(f), dir: f.dir, ms: p.ms, opaque: f.opaque });
      break;
    }
    case 'raubkopie': {
      const sx = Math.floor(t.x), sy = Math.floor(t.y), to = { x: Math.floor(it.target2.x) + 0.5, y: Math.floor(it.target2.y) + 0.5 };
      const path = findPath(st.w, st.h, walkable(st), sx, sy, Math.floor(to.x), Math.floor(to.y));
      if (!path) return no('path');
      const face = st.units[it.face] || u;
      const f = { id: st.nextId++, kind: 'decoy', face: face.id, faceUnit: face.i, x: sx + 0.5, y: sy + 0.5, dir: 0, path, until: st.time + p.ms, ms: p.ms, confuse: p.confuse || 0, hit: [] };
      st.effects.push(f);
      ev.push({ ...base, effect: f.id, face: f.face, faceUnit: f.faceUnit, from: { x: f.x, y: f.y }, to, path: path.slice(), ms: p.ms, confuse: f.confuse });
      break;
    }
    case 'vibra': {
      const two = second(st, e, p.second);
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms: p.ms, second: two ? two.i : -1 });
      for (const x of two ? [e, two] : [e]) setTask(st, x, { kind: 'vibra', ms: p.ms }, ev, x === e ? '*brrr* Moment, Nachricht.' : '*brrr* Gruppen-Chat?');
      break;
    }
    case 'credits':
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, ms: p.ms, spy: p.spy || 0, spyR: p.spyR || 0 });
      stun(st, e, 'bribe', p.ms, ev, 'Für den Preis hab ich nix gesehen.', 'bribed');
      e.dir = angTo(u, e); // dreht sich weg und zählt Geld
      if (p.spy) { e.spyUntil = st.time + p.spy; e.spyR = p.spyR; }
      break;
    case 'horde': {
      const sx = Math.floor(t.x), sy = Math.floor(t.y);
      const path = it.target2 ? findPath(st.w, st.h, walkable(st), sx, sy, Math.floor(it.target2.x), Math.floor(it.target2.y)) || [] : [];
      const f = { id: st.nextId++, kind: 'horde', x: sx + 0.5, y: sy + 0.5, dir: 0, half: Math.floor(p.size / 2), path, until: st.time + p.ms, ms: p.ms };
      st.effects.push(f);
      ev.push({ ...base, effect: f.id, tx: f.x, ty: f.y, size: p.size, path: path.slice(), ms: p.ms });
      hordeStep(st, f, 0, ev);
      break;
    }
    case 'sale': {
      const mine = st.effects.filter(f => f.kind === 'sale' && f.by === u.i), old = mine.length >= p.max ? mine[0] : null;
      if (old) { st.effects.splice(st.effects.indexOf(old), 1); ev.push({ type: 'effectEnd', effect: old.id, kind: 'sale', x: old.x, y: old.y, reason: 'ersetzt' }); }
      const f = { id: st.nextId++, kind: 'sale', x: Math.floor(t.x) + 0.5, y: Math.floor(t.y) + 0.5, until: st.time + p.ms, ms: p.ms, r: p.r, stop: p.stop, every: p.every, by: u.i };
      st.effects.push(f);
      ev.push({ ...base, effect: f.id, tx: f.x, ty: f.y, ms: p.ms, r: p.r, stop: p.stop, removed: old ? old.id : null });
      break;
    }
    case 'feierabend': {
      const buddy = second(st, e, p.buddy, x => !isOut(x) && QUITS.has(x.type));
      ev.push({ ...base, enemy: e.i, tx: e.x, ty: e.y, buddy: buddy ? buddy.i : -1, charges: u.charges[id] - 1, say: 'Mach doch mal Feierabend!' });
      for (const x of buddy ? [e, buddy] : [e]) setTask(st, x, { kind: 'feierabend', to: st.gate, near: REACH, ms: 1500, end: st.time + QUIT_MS }, ev, x === e ? 'Wissen Sie was? Ich kündige!' : 'Warte, ich komm mit!');
      break;
    }
  }
  u.cd[id] = st.time + (p.cd || 0);
  if (p.charges != null) u.charges[id]--;
  return true;
}

function resolve(st, p, ev) {
  if (p.kind === 'door') {
    const d = st.doors[p.door];
    d.locked = false; d.opening = false;
    st.tiles[d.y * st.w + d.x] = 'D';
    st.paths.clear();
    for (const e of st.enemies) if (e.state === 'patrol') e.goal = null; // Patrouillen planen über die neue Tür
    // laufende Wege neu planen, damit niemand den alten Umweg weiterläuft (Absichten plant pursue neu)
    for (const u of st.units) if (!u.down && u.path.length) { if (u.intent) u.intent.tx = null; else if (u.goal) u.path = pathTo(st, u, u.goal.x, u.goal.y) || u.path; }
    ev.push({ type: 'doorOpen', door: d.id, by: p.by, x: d.x + 0.5, y: d.y + 0.5, silent: !p.noise });
    if (p.noise) noise(st, d.x + 0.5, d.y + 0.5, p.noise, 'tuer', ev);
  } else if (p.kind === 'beer') {
    noise(st, p.x, p.y, p.p.r, 'can', ev);
    if (p.p.puddle) {
      const f = { id: st.nextId++, kind: 'puddle', x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5, until: st.time + p.p.puddle, ms: p.p.puddle, slip: p.p.slip };
      st.effects.push(f);
      ev.push({ type: 'puddle', effect: f.id, x: f.x, y: f.y, ms: f.ms });
    }
  } else if (p.kind === 'mms') {
    const id = st.nextId++;
    st.effects.push({ id, kind: 'mms', x: p.x, y: p.y, until: st.time + BAIT_MS, enemy: -1, r: p.p.r, eat: p.p.ms, portions: p.p.portions });
    ev.push({ type: 'bait', effect: id, x: p.x, y: p.y, ms: BAIT_MS, portions: p.p.portions });
  } else if (p.kind === 'kursalarm') {
    const f = { id: st.nextId++, kind: 'phone', x: p.x, y: p.y, r: p.p.r, until: st.time + p.p.ms + PHONE_WALK, ms: p.p.ms + PHONE_WALK, alarmDrop: p.p.alarmDrop || 0 };
    st.effects.push(f);
    const hit = nearest(st, p, p.p.r, canTask), at = { x: p.x, y: p.y };
    ev.push({ type: 'phone', effect: f.id, x: p.x, y: p.y, r: p.p.r, ms: p.p.ms, enemies: hit.map(e => e.i) });
    for (const e of hit) setTask(st, e, { kind: 'kursalarm', to: at, near: REACH, ms: p.p.ms, face: at, effect: f.id, reset: !!p.p.reset }, ev, 'Was macht der Kurs?');
  } else if (p.kind === 'controller') {
    const e = st.enemies[p.enemy];
    if (isOut(e)) return;
    stun(st, e, 'controller', p.ms, ev);
    const two = second(st, e, p.bounce, x => !isOut(x)); // Abpraller
    if (two) stun(st, two, 'controller', p.ms, ev, undefined, 'stunned', { bounce: e.i, fromX: e.x, fromY: e.y });
  } else if (p.kind === 'family') {
    for (const i of p.targets) { const e = st.enemies[i]; if (!isOut(e)) ko(st, e, 'family', true, ev); }
    if (p.noise) noise(st, p.x, p.y, p.noise, 'familie', ev);
  }
}

function ko(st, e, by, tied, ev) {
  e.state = 'ko'; e.reason = by; e.tied = tied; e.path = []; e.goal = null; e.bait = null; e.suspicion = 0; e.seen = -1; e.task = null;
  ev.push({ type: 'ko', enemy: e.i, by, tied, permanent: true, x: e.x, y: e.y });
}

function timed(e, state, reason, until) {
  e.state = state; e.reason = reason; e.until = until; e.path = []; e.goal = null; e.bait = null; e.seen = -1; e.task = null;
}

// ---------- Verhalten aus Fähigkeiten (state 'task') ----------
// task: { kind, phase 'go'|'stay', to {x,y}|null, near, ms (Bleiben nach Ankunft), until (Ende des Bleibens), end (Frist für alles),
//   cone (Kegel an), face {x,y} | faceEnemy, wasAlert, lastSeen, … je Art }. kind = Fähigkeits-id bzw. 'panik' (Crash Stufe 3).
function setTask(st, e, task, ev, say = null) {
  const prev = e.state === 'task' ? e.task : null, alert = e.state === 'alert';
  const k = { phase: 'go', to: null, near: 0, ms: 0, until: 0, end: null, cone: false, wasAlert: alert || !!prev?.wasAlert, lastSeen: alert ? e.lastSeen : prev?.lastSeen || null, ...task };
  Object.assign(e, { state: 'task', reason: k.kind, task: k, bait: null, goal: null, target: k.to, until: 0, seen: -1, repathAt: 0, lostT: 0 });
  e.path = k.to ? pathTo(st, e, Math.floor(k.to.x), Math.floor(k.to.y), k.near) || [] : [];
  if (!e.path.length) { k.phase = 'stay'; k.until = st.time + k.ms; }
  ev.push({ type: 'task', enemy: e.i, kind: k.kind, x: e.x, y: e.y, to: k.to, ms: k.ms, end: k.end, cone: k.cone, say: say && own(st, e, [k.kind, 'task'], say) });
}

// true = dieser Schritt ist erledigt; false = Aufgabe abgebrochen (Rüther gesehen), weiter wie sonst
function taskStep(st, e, dt, ev, blk) {
  const k = e.task;
  if (k.cone) {
    const s = lookFor(st, e, blk, k.trust ?? -1);
    e.seen = s ? s.u.i : -1;
    if (s) {
      const sus = e.suspicion + s.rate * dt / 1000;
      if (sus >= SUS_SHOW) { endTask(st, e, ev, 'gestört'); return false; }
      e.suspicion = sus; e.lastSeen = { x: s.u.x, y: s.u.y };
    }
  }
  if (k.kind === 'raubkopie') return chase(st, e, k, dt, ev);
  if ((k.end != null && st.time >= k.end) || (k.phase === 'stay' && st.time >= k.until)) { endTask(st, e, ev, 'fertig'); return true; }
  if (k.phase === 'go') {
    if (e.path.length) { walk(e, enemySpeed(st, e), dt); return true; }
    k.phase = 'stay'; k.until = st.time + k.ms;
  }
  const f = k.faceEnemy != null ? st.enemies[k.faceEnemy] : k.face;
  if (f) turnTo(e, angTo(e, f), dt);
  return true;
}

function endTask(st, e, ev, why) {
  const k = e.task;
  e.task = null;
  Object.assign(e, { state: 'patrol', reason: null, path: [], goal: null, target: null, until: 0, waitUntil: 0 });
  const say = why === 'wach' ? 'Wer stört meine Mittagsruhe?!' : why === 'fertig' ? TASK_END[k.kind] || null : null;
  ev.push({ type: 'taskEnd', enemy: e.i, kind: k.kind, reason: why, x: e.x, y: e.y, say: say && own(st, e, ['taskEnd'], say) });
  if (why === 'gestört') return;
  if (k.kind === 'feierabend') return vanish(st, e, ev);
  if (k.kind === 'tratsch' && k.swap) { // Stufe 3: beleidigt Runden tauschen (einmal je Paar)
    const o = st.enemies[k.pair];
    if (o.task?.kind === 'tratsch' && o.task.pair === e.i && o.task.swap) {
      o.task.swap = false;
      for (const f of ['patrol', 'home', 'look']) [e[f], o[f]] = [o[f], e[f]];
      for (const x of [e, o]) Object.assign(x, { wp: 0, goal: null, waitUntil: 0 });
      ev.push({ type: 'routesSwapped', enemies: [e.i, o.i] });
    }
  }
  if (k.kind === 'crash' && k.panic) return setTask(st, e, { kind: 'panik', to: st.gate, near: REACH, ms: Infinity, end: st.time + k.panic, wasAlert: k.wasAlert, lastSeen: k.lastSeen }, ev, 'Verkaufen! Alles verkaufen!');
  if (k.kind === 'raubkopie') return investigate(st, e, k.last || e, 0.3);
  if (k.kind === 'kursalarm' && k.reset) { e.suspicion = 0; return; }
  if (k.kind === 'junge' && k.calm) { e.suspicion = 0; e.calmUntil = st.time + k.calm; return; }
  if (k.kind === 'mutter' && k.teary) e.tearyUntil = st.time + k.teary;
  if (k.wasAlert && k.lastSeen) investigate(st, e, k.lastSeen, 0.6); // hat dich aus den Augen verloren
}

// „Feierabend!“: am Tor (oder nach der Frist) weg für die Mission. state 'ko' mit gone, damit alles andere ihn ignoriert.
function vanish(st, e, ev) {
  Object.assign(e, { state: 'ko', reason: 'feierabend', gone: true, tied: false, path: [], goal: null, bait: null, suspicion: 0, seen: -1 });
  ev.push({ type: 'gone', enemy: e.i, x: e.x, y: e.y, say: 'Schönen Feierabend noch!' });
}

function wakeDozer(st, e, ev) {
  const g = e.task.grumpy;
  endTask(st, e, ev, 'wach');
  e.grumpyUntil = st.time + g;
}

// Raubkopie: hinterher, bis sie verpufft; Stufe 3 verwirrt jeden, der sie erreicht
function chase(st, e, k, dt, ev) {
  const d = st.effects.find(f => f.id === k.decoy && f.until > st.time);
  if (!d) { endTask(st, e, ev, 'fertig'); return true; }
  k.last = { x: d.x, y: d.y };
  if (dist(e, d) < TOUCH) {
    if (d.confuse && !d.hit.includes(e.i)) { d.hit.push(e.i); stun(st, e, 'lizenz', d.confuse, ev, 'Lizenz ungültig?!', 'stunned', { effect: d.id }); return true; }
    e.path = [];
    turnTo(e, angTo(e, d), dt);
    return true;
  }
  if (st.time >= e.repathAt) { e.repathAt = st.time + 500; e.path = pathTo(st, e, Math.floor(d.x), Math.floor(d.y)) || []; }
  if (e.path.length) walk(e, enemySpeed(st, e) * HUNT_SPEED, dt);
  return true;
}

const decoySeen = (st, e, blk) => st.effects.find(f => f.kind === 'decoy' && f.until > st.time && seesAt(st, e, f.x, f.y, blk));

// Firewall auf- oder abgebaut: Patrouillen-Cache leeren, Wege durch die Wand neu planen
function wallChanged(st) {
  st.paths.clear();
  for (const e of st.enemies) {
    if (e.state === 'ko') continue;
    if (e.state === 'patrol') { e.goal = null; continue; }
    const last = e.path[e.path.length - 1];
    if (last && e.path.some(n => st.wall[n.y * st.w + n.x] > st.time)) e.path = pathTo(st, e, last.x, last.y) || [];
  }
}

// Effekte, die jeden Schritt wirken: Kopie und Horde laufen, Pfütze, Sale-Schild, Spitzel
function effectsStep(st, dt, ev) {
  let spy = false;
  for (const e of st.enemies) { e.revealed = false; if (e.spyUntil > st.time && e.state !== 'ko') spy = true; }
  if (spy) for (const s of st.enemies) {
    if (!(s.spyUntil > st.time) || s.state === 'ko') continue;
    for (const e of st.enemies) if (e !== s && e.state !== 'ko' && dist(e, s) <= s.spyR) e.revealed = true;
  }
  for (const f of st.effects) {
    if (f.until <= st.time) continue;
    if (f.kind === 'decoy') { if (f.path.length) walk(f, SPEED, dt); } else if (f.kind === 'horde') hordeStep(st, f, dt, ev);
    else if (f.kind === 'puddle') {
      const e = st.enemies.find(x => !ENEMY_TYPES[x.type].flying && canTask(x) && dist(x, f) <= PUDDLE_R);
      if (e) { stun(st, e, 'slip', f.slip, ev, 'Huch!', 'stunned', { effect: f.id }); f.until = st.time; } // leise, Pfütze verbraucht
    } else if (f.kind === 'sale') {
      for (const e of st.enemies) {
        if (!CALM.has(e.state) || e.bait != null || e.saleAt > st.time || dist(e, f) > f.r) continue;
        e.saleAt = st.time + f.every;
        setTask(st, e, { kind: 'sale', ms: f.stop, face: { x: f.x, y: f.y }, effect: f.id }, ev, 'SALE? Wie viel Prozent?');
      }
    }
  }
}

// Trollkids: alle Wachen im Quadrat stehen fest (Kegel aus), solange die Horde über ihnen ist
function hordeStep(st, f, dt, ev) {
  if (dt && f.path.length) walk(f, HORDE_SPEED, dt);
  const cx = Math.floor(f.x), cy = Math.floor(f.y), end = Math.min(f.until, st.time + 300);
  for (const e of st.enemies) {
    if (!canTask(e) || Math.abs(Math.floor(e.x) - cx) > f.half || Math.abs(Math.floor(e.y) - cy) > f.half) continue;
    if (e.state === 'task' && e.task.kind === 'horde') e.task.end = end;
    else setTask(st, e, { kind: 'horde', ms: Infinity, end, effect: f.id }, ev, 'Hilfe, Kinder!');
  }
}

// Geräusch: ablenkbare Gegner im Umkreis gehen nachsehen (außer der Quelle selbst), Dösende in ihrem Weckradius wachen gereizt auf.
// Liefert die Angelockten. emit=false: kein eigenes noise-Event (Bellen meldet sich selbst).
function noise(st, x, y, r, kind, ev, src = null, emit = true) {
  const hit = [];
  for (const e of st.enemies) {
    if (e.state === 'task' && e.task.kind === 'mittag' && Math.hypot(e.x - x, e.y - y) <= Math.min(r, e.task.wakeR)) wakeDozer(st, e, ev);
    if (e === src || !CALM.has(e.state) || e.bait != null || Math.hypot(e.x - x, e.y - y) > r) continue;
    e.state = 'distracted'; e.reason = 'noise'; e.target = { x, y }; e.until = 0; e.goal = null;
    e.path = pathTo(st, e, Math.floor(x), Math.floor(y), REACH) || [];
    hit.push(e.i);
  }
  if (emit) ev.push({ type: 'noise', kind, x, y, r, enemies: hit });
  return hit;
}

// Dackel: Sichtung = Bellen, lockt Kollegen im Umkreis zum Hund
function bark(st, e, ev) {
  if (!ENEMY_TYPES[e.type].bark || st.time < e.barkAt || funkloch(st, e)) return;
  e.barkAt = st.time + BARK_CD;
  const at = ev.length;
  const enemies = noise(st, e.x, e.y, BARK_R, 'bark', ev, e, false);
  ev.splice(at, 0, { type: 'bark', enemy: e.i, x: e.x, y: e.y, r: BARK_R, enemies, say: 'WAU!' });
}
const funkloch = (st, e) => st.effects.length > 0 && !!zoneOf(st, 'wlan', e, 'funkloch'); // WLAN-Störung Stufe 3

// Brennende Bäume: ruhige Ranger in FIRE_R Kacheln bemerken sie FIRE_MS nach dem Anzünden und laufen löschen (der Baum brennt weiter)
function spotFires(st, ev) {
  for (const o of st.objs) {
    if (o.kind !== 'tree' || !o.done || o.spotted || st.time < o.litAt + FIRE_MS) continue;
    const at = mid(o), hit = [], taken = new Set();
    const endOf = (e, p) => { const t = p[p.length - 1] || { x: Math.floor(e.x), y: Math.floor(e.y) }; return t.y * st.w + t.x; };
    for (const e of st.enemies) {
      if (!ENEMY_TYPES[e.type].fire || !CALM.has(e.state) || e.bait != null || dist(e, at) > FIRE_R) continue;
      let path = pathTo(st, e, o.x, o.y, REACH);
      if (!path) continue;
      if (taken.has(endOf(e, path))) { // Kollege steht schon dort: kürzester Weg zu einer freien Nachbarkachel des Baums
        let alt = null;
        for (let y = o.y - 1; y <= o.y + 1; y++) for (let x = o.x - 1; x <= o.x + 1; x++) {
          if (taken.has(y * st.w + x) || !WALK.has(tileAt(st, x, y))) continue;
          const p = pathTo(st, e, x, y);
          if (p && (!alt || p.length < alt.length)) alt = p;
        }
        if (alt) path = alt;
      }
      taken.add(endOf(e, path));
      Object.assign(e, { state: 'distracted', reason: 'fire', target: at, until: 0, goal: null, path });
      hit.push(e.i);
    }
    if (!hit.length) continue;
    o.spotted = true;
    ev.push({ type: 'fireSpotted', obj: o.id, x: at.x, y: at.y, enemies: hit, say: line(st, st.enemies[hit[0]], 'fire') });
  }
}

// Erwischt: 'kieser' pausiert bis resume, 'caught' beendet sofort mit Strafe
function catchUnit(st, e, u, ev) {
  const T = ENEMY_TYPES[e.type];
  cancelBusy(u, 'erwischt', ev);
  u.path = []; u.intent = null; u.goal = null;
  if (T.catches === 'kieser') {
    st.kieser++; st.paused = 'kieser'; st.pausedBy = { enemy: e.i, unit: u.i };
    return ev.push({ type: 'kieser', unit: u.i, enemy: e.i, count: st.kieser, x: u.x, y: u.y, say: line(st, e, 'alert') });
  }
  st.fine = T.fine || 0;
  ev.push({ type: 'caught', by: e.i, unit: u.i, fine: st.fine, x: u.x, y: u.y, say: line(st, e, 'caught') });
  end(st, 'fail', 'caught', ev);
}

// Nach der Kieser-Cutscene: Rüther mit voller HP auf die Plattform, der Fänger zurück auf Anfang seiner Runde,
// alle anderen beruhigen sich an Ort und Stelle, Alarm aus. Erledigte Ziele bleiben erledigt.
function resume(st, ev) {
  const reason = st.paused, by = st.pausedBy;
  st.paused = null; st.pausedBy = null;
  const u = st.units[by.unit];
  const busy = new Set(st.units.filter(o => o !== u && !o.down).map(o => Math.floor(o.y) * st.w + Math.floor(o.x)));
  const p = st.spots.find(s => !busy.has(s.y * st.w + s.x)) || st.spots[0];
  Object.assign(u, { x: p.x + 0.5, y: p.y + 0.5, dir: 0, hp: u.maxHp, down: false, state: 'idle', path: [], goal: { x: p.x, y: p.y }, intent: null, busy: null });
  for (const e of st.enemies) {
    if (isOut(e) || TIMED.has(e.state)) continue;
    Object.assign(e, { state: 'patrol', reason: null, suspicion: 0, path: [], goal: null, target: null, until: 0, bait: null, lostT: 0, seen: -1, lastSeen: null, waitUntil: 0, task: null });
    const T = ENEMY_TYPES[e.type];
    if (T.coffee) { e.buzzUntil = 0; e.coffeeAt = st.time + rollMs(st, T.coffee.every); }
    if (e.i === by.enemy) Object.assign(e, { x: e.home.x + 0.5, y: e.home.y + 0.5, dir: e.home.dir, wp: 0, hp: e.maxHp });
  }
  st.alarm = 0; st.contact = false; st.lastSighting = null;
  if (st.fullAlarm) { st.fullAlarm = false; ev.push({ type: 'alarmOff', alarm: 0 }); }
  ev.push({ type: 'resumed', reason, unit: u.i, enemy: by.enemy, x: u.x, y: u.y, hp: u.hp });
  return true;
}

// M&Ms: der nächste Wachgänger (patrol oder abgelenkt, keine Drohne) in b.r Kacheln geht hin
function assignBaits(st, ev) {
  for (const b of st.effects) {
    if (b.kind !== 'mms') continue;
    if (b.enemy >= 0 && st.enemies[b.enemy].bait === b.id) continue;
    b.enemy = -1;
    let best = null, bd = b.r, bp = null;
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

// Wer im Deo-Nebel Stufe 3 steht, ist in Deckung: nicht einmal Anrempeln verrät ihn
function sees(st, e, u, blk) {
  if (u.down || !coneOn(e)) return false;
  return dist(e, u) < TOUCH ? !muted(st, u) : seesAt(st, e, u.x, u.y, blk);
}

function seesAt(st, e, x, y, blk) {
  const d = Math.hypot(x - e.x, y - e.y);
  if (d < TOUCH) return true;
  if (blind(st, e)) return false;
  const { range, half } = coneOf(st, e);
  const near = e.state === 'alert' && d <= 2; // im Kampf spürt er dich auch seitlich
  if (!near && (d > range || Math.abs(angDiff(e.dir, Math.atan2(y - e.y, x - e.x))) > half)) return false;
  return lineOfSight(blk, e.x, e.y, x, y);
}

// Getarnte (Vice President) machen ruhige Wachen nicht misstrauisch, Himmler zählt mit disguiseK mit.
// Junge Stufe 3 (calmUntil): sieht niemanden; gereizt nach der Mittagsruhe: doppelt so schnell misstrauisch.
// skip: diese Einheit zählt nicht (Insider-Tipp, Tratsch: dem Tippgeber bzw. Hildegard glaubt die Wache)
function lookFor(st, e, blk, skip = -1) {
  if (e.calmUntil > st.time) return null;
  const T = ENEMY_TYPES[e.type];
  let best = null;
  for (const u of st.units) {
    if (u.i === skip || !sees(st, e, u, blk)) continue;
    let k = 1;
    if (u.disguiseUntil > st.time && e.state !== 'alert') { if (!T.clipboard) continue; k = u.disguiseK; }
    const d = dist(e, u);
    if (!best || d < best.d) best = { u, d, k };
  }
  if (best) {
    const range = coneOf(st, e).range;
    best.rate = (best.d < TOUCH ? 3 : 0.4 + 1.6 * Math.max(0, 1 - best.d / range)) * (T.clipboard ? 2 : 1) * best.k * (e.grumpyUntil > st.time ? 2 : 1);
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
  const T = ENEMY_TYPES[e.type], fx = st.effects.length > 0;
  e.melee = false;
  const gasEnd = T.flying || quitting(e) ? 0 : st.gas[Math.floor(e.y) * st.w + Math.floor(e.x)];
  if (gasEnd > st.time) {
    if (e.state === 'stunned' && e.reason === 'gas') e.until = Math.max(e.until, gasEnd);
    else if (!TIMED.has(e.state)) stun(st, e, 'gas', gasEnd - st.time, ev, '*hust*');
  }
  // WLAN-Störung: Sicht darin ×sight, Drohnen fallen aus; verheult (Mutter Stufe 3): halbe Sicht
  const wz = fx ? zoneOf(st, 'wlan', e) : null;
  e.sightK = (wz ? wz.sight : 1) * (e.tearyUntil > st.time ? 0.5 : 1);
  if (wz && T.flying && !TIMED.has(e.state)) stun(st, e, 'wlan', wz.until - st.time, ev, '*kein Netz*');
  if (TIMED.has(e.state)) {
    if (st.time < e.until) return;
    wake(st, e, ev);
  }
  if (e.state === 'task' && taskStep(st, e, dt, ev, blk)) return;
  if (T.coffee && coffee(st, e, T.coffee, ev)) return;
  const seen = lookFor(st, e, blk);
  e.seen = seen ? seen.u.i : -1;
  if (e.state === 'alert') return hunt(st, e, seen, dt, ev);
  if (!seen && fx && e.bait == null && (CALM.has(e.state) || e.state === 'suspicious')) { // Raubkopie entdeckt: hinterher
    const d = decoySeen(st, e, blk);
    if (d) return setTask(st, e, { kind: 'raubkopie', decoy: d.id, cone: true, last: { x: d.x, y: d.y } }, ev, 'Da! Hinterher!');
  }
  if (seen) {
    e.suspicion = Math.min(1, e.suspicion + seen.rate * dt / 1000);
    e.lastSeen = { x: seen.u.x, y: seen.u.y };
    if (e.suspicion >= 1) return raiseAlert(st, e, seen.u, ev);
    if (e.suspicion >= SUS_SHOW) {
      if (e.state !== 'suspicious') {
        e.state = 'suspicious'; e.reason = null; e.bait = null; e.repathAt = 0;
        ev.push({ type: 'suspicious', enemy: e.i, unit: seen.u.i, x: e.x, y: e.y, say: line(st, e, 'sus') });
        bark(st, e, ev);
      }
      // dreht sich zum Rüther und schleicht zur Sichtung
      if (st.time >= e.repathAt) { e.repathAt = st.time + 500; e.path = pathTo(st, e, Math.floor(seen.u.x), Math.floor(seen.u.y)) || []; }
      walk(e, enemySpeed(st, e) * 0.5, dt, false);
      return turnTo(e, angTo(e, seen.u), dt * 2);
    }
  } else if (e.state === 'suspicious') {
    investigate(st, e, e.lastSeen, e.suspicion);
  } else if (e.state !== 'investigate') e.suspicion = Math.max(0, e.suspicion - SUS_DECAY * dt / 1000);

  const speed = enemySpeed(st, e);
  if (e.state === 'patrol') return patrol(st, e, dt);
  if (e.state === 'investigate') {
    if (e.path.length) return walk(e, speed, dt);
    if (!e.until) { e.until = st.time + LOOK_MS; e.lookBase = e.dir; }
    scan(st, e, dt, e.lookBase);
    if (st.time >= e.until) calm(st, e, ev);
    return;
  }
  if (e.state === 'distracted') {
    if (e.bait != null) {
      const b = st.effects.find(f => f.id === e.bait);
      if (!b) return calm(st, e, ev);
      if (e.path.length) return walk(e, speed, dt);
      if (Math.hypot(e.x - b.x, e.y - b.y) > REACH) { b.enemy = -1; return calm(st, e, ev); } // Weg versperrt (Firewall): nicht durch die Wand essen
      if (--b.portions > 0) b.enemy = -1; // Familienpackung: reicht für den Nächsten
      else st.effects.splice(st.effects.indexOf(b), 1);
      return stun(st, e, 'eat', b.eat, ev, 'Mmh ... Moment, die sind von 2017.', 'eating', { effect: b.id, left: Math.max(0, b.portions) });
    }
    if (e.path.length) return walk(e, speed, dt);
    // angekommen: Geräusch absuchen bzw. Feuer ausschlagen (reason 'fire', Blick auf den Baum)
    const fire = e.reason === 'fire';
    if (!e.until) e.until = st.time + (fire ? DOUSE_MS : NOISE_MS);
    if (fire) turnTo(e, angTo(e, e.target), dt); else scan(st, e, dt, angTo(e, e.target));
    if (st.time >= e.until) calm(st, e, ev);
  }
}

// Stefans Kaffeepause: alle every ms (ab Pausenbeginn) 5 s stehen und schlürfen (Kegel aus), danach boost ms koffeiniert.
// Nur aus der Patrouille heraus; true = diesen Schritt nichts weiter tun.
function coffee(st, e, C, ev) {
  if (e.state === 'coffee') {
    if (st.time < e.until) return true;
    Object.assign(e, { state: 'patrol', reason: null, until: 0, buzzUntil: st.time + C.boost });
    ev.push({ type: 'coffee', phase: 'end', enemy: e.i, x: e.x, y: e.y });
    ev.push({ type: 'caffeinated', enemy: e.i, ms: C.boost, until: e.buzzUntil, x: e.x, y: e.y, say: line(st, e, 'buzz') });
    return false;
  }
  if (e.state !== 'patrol' || st.time < e.coffeeAt) return false;
  Object.assign(e, { state: 'coffee', reason: 'coffee', until: st.time + C.ms, path: [], goal: null, suspicion: 0, seen: -1 });
  e.coffeeAt = st.time + rollMs(st, C.every);
  ev.push({ type: 'coffee', phase: 'start', enemy: e.i, ms: C.ms, x: e.x, y: e.y, say: line(st, e, 'coffee') });
  return true;
}

// Patrouillen-Wege zwischen festen Kacheln wiederholen sich: Cache je (Start, Ziel), geleert, wenn eine Tür aufgeht
function patrolPath(st, e, wp) {
  const k = (Math.floor(e.y) * st.w + Math.floor(e.x)) * st.w * st.h + wp.y * st.w + wp.x;
  let p = st.paths.get(k);
  if (p === undefined) {
    if (st.paths.size > 4000) st.paths.clear(); // ponytail: grob begrenzt, reicht für 15+ Wachen auf 64×48
    p = pathTo(st, e, wp.x, wp.y);
    st.paths.set(k, p);
  }
  return p ? p.slice() : [];
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
  if (e.goal !== wp) { e.path = patrolPath(st, e, wp); e.goal = wp; }
  if (!e.path.length) return; // Wegpunkt unerreichbar: stehen bleiben statt jeden Schritt neu suchen
  walk(e, enemySpeed(st, e), dt);
}

function investigate(st, e, pos, sus = 0) {
  Object.assign(e, { state: 'investigate', reason: null, target: { x: pos.x, y: pos.y }, until: 0, goal: null, bait: null, suspicion: Math.max(sus, 0) });
  e.path = pathTo(st, e, Math.floor(pos.x), Math.floor(pos.y)) || [];
}

function calm(st, e, ev) {
  Object.assign(e, { state: 'patrol', reason: null, suspicion: 0, path: [], goal: null, target: null, until: 0, bait: null, lostT: 0 });
  ev.push({ type: 'calm', enemy: e.i, x: e.x, y: e.y, say: line(st, e, 'calm') });
}

const WAKE = { eat: 'Mir ist schlecht ...', bribe: 'Das Geld ist alle.', slip: 'Wer kippt hier Bier aus?', lizenz: 'Lizenz … egal.' };

function wake(st, e, ev) {
  const r = e.reason;
  ev.push({ type: 'wake', enemy: e.i, reason: r, x: e.x, y: e.y, say: WAKE[r] || line(st, e, 'wake') });
  if (r === 'eat' || r === 'bribe') Object.assign(e, { state: 'patrol', reason: null, suspicion: 0, path: [], goal: null, until: 0 });
  else investigate(st, e, e, 0.4); // nach KO, Gas oder Argument: misstrauisch umsehen
}

function raiseAlert(st, e, u, ev) {
  const T = ENEMY_TYPES[e.type];
  Object.assign(e, { state: 'alert', reason: null, suspicion: 1, lostT: 0, lastSeen: { x: u.x, y: u.y }, path: [], goal: null, bait: null, repathAt: 0 });
  st.alarmEver = true; st.contact = true; st.lastSighting = { x: u.x, y: u.y };
  // Funkloch (WLAN Stufe 3): der Alarm verbreitet sich nicht – kein Rufen, kein Megafon, keine Pfeife, kein Bellen
  const quiet = funkloch(st, e), called = [];
  if (!quiet) {
    st.alarm = T.megafon ? 1 : Math.min(1, st.alarm + (T.whistle || ALARM_STEP));
    // Ruf: Kollegen in der Nähe sehen nach
    for (const o of st.enemies) if (o !== e && CALM.has(o.state) && o.bait == null && dist(o, e) <= SHOUT_R) { investigate(st, o, e.lastSeen, 0.5); called.push(o.i); }
  }
  ev.push({ type: 'alert', enemy: e.i, unit: u.i, x: e.x, y: e.y, megafon: !!T.megafon && !quiet, muted: quiet, alarm: st.alarm, called, say: line(st, e, 'alert') });
  if (T.whistle && !quiet) ev.push({ type: 'whistle', enemy: e.i, x: e.x, y: e.y, alarm: st.alarm });
  if (!quiet) bark(st, e, ev);
  cancelBusy(u, 'entdeckt', ev);
  if (T.catches && dist(e, u) <= MELEE) catchUnit(st, e, u, ev); // Misstrauen voll direkt daneben: sofort erwischt
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
  if (foe && T.catches) return catchUnit(st, e, foe, ev); // Stefan und Ranger schlagen nicht, sie greifen zu
  if (foe) { // Nahkampf: melee = roter Schadens-Indikator
    e.path = []; e.melee = true;
    turnTo(e, angTo(e, foe), dt * 3);
    if (st.time >= e.swingAt) { e.swingAt = st.time + SWING_MS; hurtUnit(st, foe, Math.max(1, Math.round(T.dps * MELEE_DPS * st.dmgScale)), e, ev); }
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
  if (e.path.length) walk(e, enemySpeed(st, e) * HUNT_SPEED, dt);
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
