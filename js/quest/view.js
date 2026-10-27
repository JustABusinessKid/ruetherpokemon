// Haunebu-Quests: Kommando-Ansicht wie Commandos 2 (Spec §5.5). Canvas-Draufsicht mit 32-px-Kacheln, HUD als DOM.
// createQuestScreen({ el, onEnd }) -> { start({ mission, setup, team, fighters, loadouts, rng, tutorial }), stop(), send(cmd), debug() }
//   mission: Objekt oder id; setup: { layoutId, variantId, mirror, seed } (leer = gewürfelt; variant geht noch als Kompatibilität).
//   fighters: makeFighter-Kampfwerte (oder team als Exemplare { id, rarity, level, uid }), 1–3; bei mission.solo das stärkste Exemplar.
//   loadouts[i]: [{id, level}, {id, level}, {id, level}|null] je Kämpfer (progress.loadoutFor), geht als team[i].loadout an createQuest.
//   tutorial: erzwingen/aus. send(cmd): Befehl an die Engine samt Animationen, liefert die Events (Debug „Stefan ruft“: send({ type: 'catch' })).
//   onEnd(questSummary + { text, team, setup, kieser, fine }) genau einmal: nach Abheben, Scheitern oder Aufgeben (result 'success'|'fail'|'abort').
// v9: Kieser- und Erwischt-Cutscene als DOM-Overlay (.q-cut), Minikarte (.q-mini) ab 41 Kacheln Breite.
// v10: 3 Fähigkeiten je Rüther mit Stufen-Punkten, Abklingzeit und Ladungen (Leiste und Kreismenü); Zielmodi in Schritten
// (aim.first = erste Wahl): Tür/Gegner/Tresor aus abilityTargets, Punkt, self mit Bestätigen, Wache→Punkt, Punkt→Punkt,
// Punkt→Richtung, Gesicht+Start→Ziel. Animationen für alle 25, Gegnerzustände (state 'task') und platzierte Objekte (st.effects).
// Schleife: feste 50-ms-Logik (engine.tick) mit Aufholen, rAF-Zeichnen mit Interpolation zwischen den Schritten.
// Befehle gehen sofort per tick(st, 0, [cmd]) an die Engine, auch in der taktischen Pause.
// Uhren: gt = Spielzeit (steht in der Pause, treibt Effekte, Würfe, Blasen), rt = echte Zeit (Auswahl-Puls, Untertasse, Abspann).
// Bedienung: Antippen wählt/läuft/interagiert, Doppeltipp auf einen Rüther = Kreismenü, Zielmodus mit Reichweite, Ziehen = Kamera,
// Zwei-Finger-Zoom und ±. Sounds: vorhandene sfx plus step/alarm/steal/gas (audio.js; unbekannte Namen sind stumm).
// v11 (Spec Mehrspieler §4/§5): createQuestScreen({ el, onEnd, onProgress }) -> { start, stop, send, setRival, debug }.
//   start({ …, coop: { link, role: 'host'|'guest', partner: { name, avatar } } }): Koop mit bis zu 4 Einheiten (fighters erst Host,
//   dann Gast, je mit owner). Host rechnet wie sonst und schickt alle 200 ms qs; der Gast tickt nie, schickt Befehle als qc (coop.js).
//   onProgress({ done, total, min, timeMs, alarm, over, result }) höchstens 1× pro s und beim Ende (Rennen);
//   setRival({ name, avatar, done, total, over, result, lost? } | null): Gegner-Chip in der oberen Leiste.
import { createQuest, tick, canExtract, visibleCone, abilitiesFor, abilityTargets, tratschMeet, questSummary, questSnapshot, applyQuestSnapshot, packEvents, ABILITIES, ENEMY_TYPES } from './engine.js';
import { MISSION_BY_ID, MELEE_HINT } from './missions.js';
import { COOP, cleanCmd, cleanSummary } from './coop.js';
import { RACE } from './race.js';
import { makeFighter } from '../battle.js';
import { RUETHER_BY_ID } from '../data.js';
import { QUEST_SATS } from '../progress.js';
import { sfx, haptic } from '../audio.js';
import { banner } from '../fx.js';
import { popup, esc } from '../ui.js';
import { TILE, INK, PAPER, GOLD, THEMES, BLUE_FIRE, loadImg, img, variant, paintMap, paintMini, doorHoriz, drawDoor, faceFrame, bitmap, bubble, dither, hash, flames, smoke, mug, fountain, swatter,
  zigzag, phone, eye, suit, glitchFace, wifi, scold, puddle, fan } from './draw.js';

const STEP = 50, MAX_CATCHUP = 1500;
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.6, 2], ZOOM_MIN = 0.5, ZOOM_MAX = 2.4;
const TUT_KEY = 'ruether-go-quest-tut';
const DOUBLE_MS = 350, DOUBLE_PX = 30, DRAG_PX = 10, SPREAD = 0.9; // SPREAD: Mindestabstand der Gesichter in Kacheln (Gesicht 28 px)
const RING_UP = 30; // Kreismenü: Abstand der oberen Plätze über der Rüther-Mitte (Gesicht bis Zoom 2 frei)
const RING_W = [78, 100]; // Kreismenü: Abstand der Seitenplätze, weiter raus, wenn ein Teamkamerad drunter läge
const SUS_BAR = new Set(['patrol', 'suspicious', 'investigate', 'distracted']); // Misstrauens-Balken nur bei eingeschaltetem Kegel
const face = id => `sprites/${RUETHER_BY_ID[id] ? id : 'unknown'}.png`; // Koop: ids kommen auch vom Host (Spec §0), nur bekannte
const fxArt = n => `art/fx-${n}.png`;
const short = id => id[0].toUpperCase() + id.slice(1); // „Onkel Micha“ → Micha
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { const d = (b - a) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const GOAL_ART = { steal: 'art/q-coin.png', sabotage: 'art/q-saucer.png', fetch: 'art/q-ps3.png', unplug: 'art/q-plug.png', valve: 'art/q-valve.png', ignite: 'art/q-tree.png' };
const FACE_LEFT = new Set(['dackel']); // Sprite schaut nach links: Spiegeln umgekehrt
const KIESER_LINES = [['bernd', 'Erst Kieser, dann Kaffee!'], ['viktor', 'Ich wollte doch nur nicht duschen …'], ['bernd', 'Danach bin ich so breit, ich pass durch keine Tür mehr!']];
const MINI_W = 40; // Minikarte ab mehr als 40 Kacheln Breite
const fmt = n => (Number(n) || 0).toLocaleString('de-DE'); // landet in innerHTML: nie fremder Text (Koop-Events)
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const whose = n => (/[sßxz]$/i.test(n) ? `${n}’` : `${n}s`); // „Papas Rüther“, „Klaus’ Rüther“
const THROWN = { can: fxArt('beer-can'), mms: fxArt('mms'), controller: fxArt('controller'), phone: 'art/q-phone.png' };
const MMS = ['#B03B2B', '#3F8EF5', '#5BB55A', '#F2C94C', '#E0A52B', '#7A4A2A'];
const RED = '#E0634C', GREEN = '#5BB55A', TEAL = '#3FC1B0', AMBER = '#E0A52B', PINK = '#F29BC8', LILAC = '#C77DFF', SKY = '#9fd0ea';
const NOISE = { can: { c: AMBER, t: 'SCHEPPER!' }, alarmanlage: { c: RED, t: 'PIEP PIEP PIEP' }, tuer: { c: PAPER, t: 'KNARZ!' }, familie: { c: GOLD, t: 'RÜTHER!' } };
const STUN_TXT = { controller: 'KLONK!', hack: 'Firmware 0.0.1', slip: 'RUTSCH!', lizenz: 'ERROR 0x70!' }; // Blase sagt den Rest (WLAN: Blase und blinkendes „kein Netz“)
// v10: Zielmodus-Hinweise je Schritt (Wahl 0 bzw. 1) und wiederkehrende Sprüche (Schimpfen, Streiten)
const HINT = {
  door: ['Verschlossene Tür antippen'], point: ['Ziel wählen: Punkt antippen'], enemy: ['Ziel wählen: Gegner antippen'],
  vaultOrDrone: ['Tresor oder Drohne antippen'], self: ['Kreis = Reichweite. Tippen zum Auslösen'], selfNoR: ['Tippen oder Los! zum Auslösen'],
  enemyThenPoint: ['Wache antippen', 'Zielpunkt antippen'], pointThenPoint: ['Startpunkt antippen', 'Ziel wählen: Hier zieht die Horde hin'],
  pointDir: ['Punkt antippen', 'Richtung tippen: quer oder längs'], teammatePoint: ['Gesicht wählen, dann Startpunkt antippen', 'Zielpunkt antippen: Dahin läuft die Kopie'], teammatePointSolo: ['Startpunkt antippen'],
};
const LIST = new Set(['door', 'enemy', 'vaultOrDrone']); // Ziel aus abilityTargets
const selfR = ab => ab.r ?? ab.range ?? ab.sendR; // Kreis bei self (VP erst ab Stufe 3: „Gehen Sie mal zum Tor!“)
const SCOLD = ['Wie siehst du denn aus?', 'Zieh dir mal eine Jacke an!', 'Und wann räumst du dein Zimmer auf?', 'So hab ich dich nicht erzogen!', 'Ruf mal wieder an!'];
const QUARREL = ['Die Grillzange war meine!', 'Du hast doch angefangen!', 'Und dein Vorzelt ist auch hässlich!', 'Das sag ich dem Chef!'];
const KURS = ['+7 %', '+12 %', '+70 %', '−3 %', '+21 %'], DEPOT = ['−80 %', '−99 %', 'MARGIN CALL', '−42 %'];
const DISGUISE_END = { zeit: 'Auftritt vorbei', klau: 'Tarnung aufgeflogen!', angriff: 'Tarnung weg!' };
const TUT = [
  { at: 'team', text: 'Tipp auf ein Gesicht, um einen Rüther zu wählen. „Alle“ wählt das ganze Team.' },
  { at: 'stage', text: 'Tipp auf den Boden: Er läuft hin. Die gestrichelte Linie zeigt seinen Weg.' },
  { at: 'powers', text: 'Unten stehen seine 3 Fähigkeiten. Doppeltipp auf einen Rüther öffnet das Kreismenü.' },
];
const ART = [
  'art/q-coin.png', 'art/q-vault.png', 'art/q-saucer.png', 'art/q-ps3.png', 'art/q-plug.png', 'art/q-valve.png', 'art/q-tree.png', 'art/q-pad.png', 'art/fx-haunebu.png', 'art/fx-tractor-beam.png',
  ...new Set(Object.values(ENEMY_TYPES).map(t => `art/${t.sprite}.png`)), ...Object.values(ABILITIES).map(a => a.icon), ...Object.values(THROWN),
  fxArt('chart-up'), fxArt('wallet'), fxArt('bags'), 'art/q-sign.png', 'art/q-kids.png', 'art/q-box.png', face('christian'), face('micha'), face('hildegard'),
];

const HTML = `
<div class="q-top wood">
  <div class="q-goal"><img class="q-goal-ico" alt=""><span class="q-goal-label"></span><b class="q-goal-n"></b></div>
  <b class="q-time">0:00</b>
  <div class="q-alarm"><span>Alarm</span><div class="bar"><div class="fill"></div></div><b class="q-note hidden"></b></div>
  <div class="q-rival hidden"><span class="q-rival-tag">Rennen</span><img alt=""><span class="q-rival-name"></span><b class="q-rival-n"></b></div>
</div>
<div class="q-stage">
  <canvas class="q-cv"></canvas>
  <div class="q-edge"></div>
  <div class="q-fx"></div>
  <div class="q-zoom"><button class="q-zin" aria-label="Näher ran">+</button><button class="q-zout" aria-label="Weiter weg">−</button><button class="q-mapbtn hidden">Karte</button></div>
  <div class="q-mini hidden"><div class="q-mini-box panel"><canvas class="q-mini-cv"></canvas><p>Tipp auf die Karte: Die Kamera springt hin.</p><button class="q-mini-x">Zurück</button></div></div>
  <div class="q-cut hidden"></div>
  <div class="q-paused hidden">Pause · Befehle gehen trotzdem</div>
  <div class="q-aim hidden"><span class="q-aim-ico"></span><span class="q-aim-hint"></span><button class="q-aim-x">Abbrechen</button><p class="q-aim-txt"></p><div class="q-aim-opts"></div></div>
  <div class="q-msg hidden"></div>
  <div class="q-ring hidden"></div>
  <div class="q-tut hidden"><p></p><button>OK</button></div>
  <div class="q-card panel hidden"></div>
  <div class="q-stamp hidden"><b></b><p></p><span>Tippen für weiter</span></div>
</div>
<div class="q-bottom wood">
  <div class="q-row"><div class="q-team"></div><div class="q-powers"></div></div>
  <div class="q-row q-ctrl"><button class="q-pause">Pause</button><button class="q-extract primary" disabled>Abheben</button><button class="q-quit danger">Aufgeben</button></div>
</div>`;

export function createQuestScreen({ el, onEnd, onProgress }) {
  el.classList.add('q-screen');
  el.innerHTML = HTML;
  const $ = s => el.querySelector(s);
  const stage = $('.q-stage'), cv = $('.q-cv'), g = cv.getContext('2d'), fxLayer = $('.q-fx'), edge = $('.q-edge');
  const goalIco = $('.q-goal-ico'), goalLabel = $('.q-goal-label'), goalN = $('.q-goal-n'), timeEl = $('.q-time');
  const alarmBox = $('.q-alarm'), alarmFill = $('.q-alarm .fill');
  const teamEl = $('.q-team'), powersEl = $('.q-powers'), pauseBtn = $('.q-pause'), extractBtn = $('.q-extract'), quitBtn = $('.q-quit');
  const aimEl = $('.q-aim'), aimOpts = $('.q-aim-opts'), pausedEl = $('.q-paused'), msgEl = $('.q-msg'), ringEl = $('.q-ring'), tutEl = $('.q-tut'), cardEl = $('.q-card'), stampEl = $('.q-stamp');
  const noteEl = $('.q-note'), mapBtn = $('.q-mapbtn'), miniEl = $('.q-mini'), miniCv = $('.q-mini-cv'), cutEl = $('.q-cut'), rivalEl = $('.q-rival');

  let st = null, th = null, mapCv = null, gasPat = null, deoPat = null, seq = 0, abs = []; // abs[i]: abilitiesFor(st.units[i]), fest für die Quest
  let mini = null, cut = null, caught = null, hasWater = false, catcher = {}; // mini: { s, base, was } solange offen; cut: laufende Cutscene
  const valveAt = new Map(), seenE = new Set(); // seenE: Gegner, die schon im Bild waren (Minikarte zeigt nur bekannte)
  let running = false, raf = 0, lastTs = 0, acc = 0, overClock = 0, paused = false, gt = 0, rt = 0, frameDt = 16;
  let sel = [], follow = true, zoom = 1, cam = { x: 0, y: 0 }, vw = 0, vh = 0, dpr = 1;
  let inspect = null, menuFor = -1, aim = null, tut = -1, ending = null, ended = false, lastTap = {}, hitSfxAt = 0, reached = false, warned = false;
  let fx = freshFx(), labels = [], doorH = [], pad = null, powersKey = '', quitAsk = false, msgT = 0, ringBox = [], ringW = 78;
  let prev = new WeakMap(), flash = new WeakMap(), popAt = new WeakMap();
  const doorAt = new Map(), effAt = new Map(), timers = new Set();
  const scolder = new Map(), chatAt = new Map(); // Junge: Gegner → schimpfende Einheit; nächster Spruch je Gegner (Schimpfen, Streit)
  const ptrs = new Map();
  let gesture = null;
  // v11 Koop: { link, role, partner, ready (Gast hat qr geschickt), gone (Verbindung weg), alone (Host allein weiter), out (Events fürs
  // nächste qs), endEv, offs (Link-Abos), timer, qrAt } oder null. Rennen läuft ohne coop (nur onProgress/setRival).
  let coop = null, progAt = -1e9;
  const remote = () => coop?.role === 'guest'; // Gast: tickt nie, zeigt den Zustand des Hosts
  const hosting = () => coop?.role === 'host' && !coop.alone;
  const isMine = i => { const o = st.units[i]?.owner; return !coop || !o || o === coop.role; };
  const istep = () => (remote() ? COOP.SEND_MS : STEP); // Interpolation: Gast über ein qs-Intervall

  function freshFx() { return { parts: [], texts: [], bubbles: [], rings: [], projs: [], sprites: [], helpers: [], bolts: [] }; }
  function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  const setText = (n, s) => { if (n.textContent !== s) n.textContent = s; };
  const age = born => Math.max(0, gt - born);

  // ---------- Positionen (interpoliert zwischen zwei Logik-Schritten) ----------
  // shown: von der gerade gezeichneten Lage aus (Koop-Gast: ein früh eintreffendes qs lässt nichts springen)
  function snap(shown = false) {
    const keep = o => prev.set(o, shown ? pos(o) : { x: o.x, y: o.y, dir: o.dir });
    for (const u of st.units) keep(u);
    for (const e of st.enemies) keep(e);
    for (const f of st.effects) if (f.kind === 'decoy' || f.kind === 'horde') keep(f);
  }
  function pos(ent) {
    const p = prev.get(ent), a = Math.min(1, acc / istep());
    return p ? { x: p.x + (ent.x - p.x) * a, y: p.y + (ent.y - p.y) * a, dir: p.dir + angDiff(p.dir, ent.dir) * a, moved: p.x !== ent.x || p.y !== ent.y } : { x: ent.x, y: ent.y, dir: ent.dir, moved: false };
  }
  // Rüther dicht beieinander auffächern, damit kein echtes Gesicht verdeckt ist (§0); Zeichnen und Tippen nutzen dasselbe (draw.js fan)
  const upos = u => fan(st.units.map(o => pos(o)), SPREAD)[u.i];
  const toScreen = (wx, wy) => ({ x: (wx - cam.x) * zoom + vw / 2, y: (wy - cam.y) * zoom + vh / 2 });
  const toWorld = (sx, sy) => ({ x: (sx - vw / 2) / zoom + cam.x, y: (sy - vh / 2) / zoom + cam.y });
  const at = (ref) => { // Weltpixel eines Ankers: { u } | { e } | { x, y } (Kacheln)
    if (ref.u != null) { const p = upos(st.units[ref.u]); return { x: p.x * TILE, y: p.y * TILE }; }
    if (ref.e != null) { const p = pos(st.enemies[ref.e]); return { x: p.x * TILE, y: p.y * TILE }; }
    return { x: ref.x * TILE, y: ref.y * TILE };
  };

  // ---------- Effekt-Bausteine (alles in Spielzeit gt, Weltpixel) ----------
  // Geburtszeit der Effekte: Engine-Zeit; in der Pause die stehende Zeichenzeit gt (< st.time), sonst fehlten Wurf, Ring und Blase bis „Weiter“
  // Gast: gt läuft der Host-Zeit ein qs-Intervall hinterher, Effekte starten sofort
  const now = () => (paused || remote() ? gt : st.time);
  function text(ref, t, color = PAPER, size = 16, ms = 1100) { fx.texts.push({ ref, t, color, size, ms, born: now() }); }
  function say(ref, t, ms = 2600, delay = 0) { // eine Blase je Figur, höchstens 5 gleichzeitig; delay in Spielzeit
    if (!t) return;
    fx.bubbles = fx.bubbles.filter(b => !((ref.u != null && b.ref.u === ref.u) || (ref.e != null && b.ref.e === ref.e)));
    fx.bubbles.push({ ref, t, ms: ms + delay, born: now(), at: now() + delay });
    if (fx.bubbles.length > 5) fx.bubbles.shift();
  }
  const ring = (x, y, r, color, ms = 700, delay = 0) => fx.rings.push({ x: x * TILE, y: y * TILE, r: r * TILE, color, ms, born: now() + delay });
  // to: Anker ({ e }), dem der Wurf folgt (sonst fester Endpunkt x1/y1)
  function throwArc(src, x0, y0, x1, y1, ms, { size = 18, spin = 4 * Math.PI, h = null, delay = 0, to = null } = {}) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    fx.projs.push({ src, x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE, ms, size, spin, h: h ?? 14 + d * 7, born: now() + delay, to });
  }
  const pop = (src, x, y, { size = 28, ms = 900, kind = 'pop', delay = 0 } = {}) => fx.sprites.push({ src, x: x * TILE, y: y * TILE, size, ms, kind, born: now() + delay });
  // side ±1: nur nach links bzw. rechts (seitlich am echten Gesicht vorbei)
  function burst(x, y, n, { kind = 'sq', colors = [GOLD, PAPER], speed = 60, up = 40, grav = 140, ms = 700, size = 3, src = '', side = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 2 * Math.PI, v = speed * (0.4 + Math.random() * 0.6), cx = Math.cos(a);
      fx.parts.push({ x: x * TILE, y: y * TILE, vx: (side ? side * Math.abs(cx) : cx) * v, vy: Math.sin(a) * v - up, grav, kind, src, size, color: colors[k % colors.length], ms: ms * (0.7 + Math.random() * 0.5), born: now() });
    }
  }
  const coinsFly = (x0, y0, x1, y1, n, ms = 450) => { for (let k = 0; k < n; k++) throwArc('art/q-coin.png', x0, y0, x1, y1, ms, { size: 12, spin: 0, h: 18, delay: k * 90 }); };
  function msg(t, ms = 2200) {
    if (!t) return;
    msgEl.textContent = t;
    msgEl.classList.remove('hidden', 'pop'); void msgEl.offsetWidth; msgEl.classList.add('pop');
    clearTimeout(msgT); msgT = later(() => msgEl.classList.add('hidden'), ms);
  }
  function pulseEdge() { edge.classList.remove('pulse'); void edge.offsetWidth; edge.classList.add('pulse'); }

  // ---------- Befehle ----------
  // Koop: der Gast schickt den Befehl an den Host (liefert []), der Host stempelt eigene Befehle mit by: 'host'
  function send(cmd) {
    if (!st || st.over) return [];
    if (remote()) { coop.link.send({ t: 'qc', cmd }); return []; }
    const ev = tick(st, 0, [coop ? { ...cmd, by: 'host' } : cmd]);
    feed(ev);
    return ev;
  }
  // Events animieren; der Host legt sie fürs nächste qs auf den Stapel und schickt nach dem Ende sofort
  function feed(ev) {
    handle(ev);
    if (!hosting() || !ev.length) return;
    coop.out.push(...ev);
    if (st.over) flush();
  }
  const abOf = (i, id) => abs[i]?.find(a => a.id === id);
  const upUnits = () => st.units.filter(u => !u.down && isMine(u.i)).map(u => u.i);
  const actors = () => sel.filter(i => !st.units[i].down);
  const nearest = (ids, x, y) => ids.reduce((b, i) => (b == null || Math.hypot(st.units[i].x - x, st.units[i].y - y) < Math.hypot(st.units[b].x - x, st.units[b].y - y) ? i : b), null);

  function select(ids, { keepFollow = false } = {}) {
    if (coop) { ids = ids.filter(isMine); if (!ids.length) return; } // Koop: nur eigene
    const up = ids.filter(i => st.units[i] && !st.units[i].down);
    sel = up.length ? up : ids.slice(0, 1);
    if (!keepFollow) follow = true;
    if (aim && !sel.includes(aim.unit)) endAim();
    tutStep(0);
  }

  // ---------- Eingabe: Tippen, Doppeltipp, Ziehen, Zwei-Finger-Zoom ----------
  const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    if (!st) return;
    try { cv.setPointerCapture(e.pointerId); } catch { /* egal */ }
    const p = local(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) gesture = { x0: p.x, y0: p.y, cx: cam.x, cy: cam.y, drag: false };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { pinch: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, drag: true }; }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    const p = local(e);
    ptrs.set(e.pointerId, p);
    if (gesture.pinch) {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      zoom = clamp(gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.pinch, ZOOM_MIN, ZOOM_MAX);
      return;
    }
    if (!gesture.drag && Math.hypot(p.x - gesture.x0, p.y - gesture.y0) > DRAG_PX) gesture.drag = true;
    if (gesture.drag) { follow = false; cam.x = gesture.cx - (p.x - gesture.x0) / zoom; cam.y = gesture.cy - (p.y - gesture.y0) / zoom; }
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    const p = local(e);
    ptrs.delete(e.pointerId);
    if (gesture && !gesture.drag && !gesture.pinch && e.type === 'pointerup') tap(p.x, p.y);
    if (!ptrs.size) gesture = null;
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  $('.q-zin').addEventListener('click', () => stepZoom(1));
  $('.q-zout').addEventListener('click', () => stepZoom(-1));
  function stepZoom(d) {
    const next = d > 0 ? ZOOMS.find(z => z > zoom + 1e-3) : [...ZOOMS].reverse().find(z => z < zoom - 1e-3);
    if (next) zoom = next;
  }

  // Was liegt unter dem Finger? Trefferfläche ≥ 44 px (Radius 22), Rüther haben Vorrang.
  function pick(sx, sy, list = null) {
    const R = Math.max(22, 0.6 * TILE * zoom);
    let best = null;
    const consider = (kind, ref, wx, wy, bonus = 0) => {
      const s = toScreen(wx, wy), d = Math.hypot(s.x - sx, s.y - sy);
      if (d <= R && (!best || d - bonus < best.d)) best = { kind, ref, d: d - bonus };
    };
    if (list) { for (const t of list) consider('target', t, t.x * TILE, t.y * TILE); return best; }
    for (const u of st.units) { const p = upos(u); consider(u.down ? 'down' : 'unit', u, p.x * TILE, p.y * TILE - 2, u.down ? 0 : 8); }
    for (const e of st.enemies) { if (e.gone) continue; const p = pos(e); consider('enemy', e, p.x * TILE, p.y * TILE - 4); }
    for (const o of st.objs) if (!(o.kind === 'item' && o.taken)) consider('obj', o, (o.x + 0.5) * TILE, (o.y + 0.5) * TILE);
    for (const d of st.doors) if (d.locked && !d.opening) consider('door', d, (d.x + 0.5) * TILE, (d.y + 0.5) * TILE);
    return best;
  }

  const briefingOpen = () => !cardEl.classList.contains('hidden');
  function tap(sx, sy) {
    if (!st || st.over) { if (ending) finish(); return; }
    if (briefingOpen()) return; // Tipps neben die Briefing-Karte sind keine Befehle
    if (menuFor >= 0) return closeMenu();
    if (aim) return aimTap(sx, sy);
    // Doppeltipp an derselben Bildschirmstelle: Die Kamera schwenkt nach dem ersten Tipp schon zur Figur, pick() träfe sie nicht mehr
    const t = performance.now();
    if (lastTap.u != null && t - lastTap.t < DOUBLE_MS && Math.hypot(sx - lastTap.sx, sy - lastTap.sy) < DOUBLE_PX) { const i = lastTap.u; lastTap = {}; return openMenu(i); }
    const hit = pick(sx, sy), w = toWorld(sx, sy), wx = w.x / TILE, wy = w.y / TILE;
    if (hit?.kind === 'unit') {
      const i = hit.ref.i;
      if (!isMine(i)) { lastTap = {}; return msg(`Das ist ${whose(coop.partner.name)} Rüther.`); }
      if (lastTap.u === i && t - lastTap.t < DOUBLE_MS) { lastTap = {}; return openMenu(i); }
      lastTap = { u: i, t, sx, sy };
      select([i]); sfx.play('tap');
      return;
    }
    lastTap = {};
    const ids = actors();
    if (hit?.kind === 'enemy') {
      const e = hit.ref;
      inspect = { e: e.i, until: rt + 5000 };
      return;
    }
    if (!ids.length) return msg('Erst einen Rüther antippen.');
    if (hit?.kind === 'down') {
      const i = nearest(ids, hit.ref.x, hit.ref.y);
      return send({ type: 'interact', unit: i, obj: { unit: hit.ref.i } });
    }
    if (hit?.kind === 'obj') {
      const o = hit.ref, i = nearest(ids, o.x + 0.5, o.y + 0.5);
      send({ type: 'interact', unit: i, obj: o.id });
      for (const j of ids) if (j !== i) send({ type: 'move', unit: j, to: { x: o.x + 0.5, y: o.y + 0.5 } });
      return;
    }
    if (hit?.kind === 'door') {
      const c = ids.find(i => abOf(i, 'plus70'));
      if (c == null) return msg('Verschlossen. Das kann nur Christian: Plus 70 Prozent.');
      return send({ type: 'ability', unit: c, ability: 'plus70', target: { door: hit.ref.id } });
    }
    for (const i of ids) send({ type: 'move', unit: i, to: { x: wx, y: wy } });
  }

  // ---------- Fähigkeiten: Kreismenü, Leiste und Zielmodus ----------
  function abilityBlocked(u, ab) {
    if (u.down) return 'Liegt flach.';
    if (u.item) return 'Mit der PS3 im Arm geht das nicht.';
    if (ab.charges != null && !(u.charges[ab.id] > 0)) return `${ab.name}: für heute aufgebraucht.`;
    const left = (u.cd[ab.id] || 0) - st.time;
    return left > 0 ? `${ab.name}: noch ${Math.ceil(left / 1000)} s` : '';
  }
  function chooseAbility(i, id) {
    if (briefingOpen()) return; // erst „Los!“
    closeMenu();
    const u = st.units[i], ab = abOf(i, id);
    if (!ab) return;
    const why = abilityBlocked(u, ab);
    if (why) { sfx.play('warn'); return msg(why); }
    select([i], { keepFollow: true });
    tutStep(2);
    aim = { unit: i, ab, first: null, face: i };
    aimEl.querySelector('.q-aim-ico').innerHTML = abIcon(ab);
    // Grundtext, ab Stufe 2 die Verbesserungen dazu
    aimEl.querySelector('.q-aim-txt').innerHTML = esc(ab.texts[0]) + ab.texts.slice(1, ab.level).map((t, k) => ` <b>Stufe ${k + 2}:</b> ${esc(t)}`).join('');
    aimEl.classList.remove('hidden');
    aimStep(null);
    if (ab.id === 'feierabend' && !abilityTargets(st, i, id).length) msg('Hier arbeitet keiner, der kündigen darf.', 2600);
  }
  // Schritt des Zielmodus: Hinweis und Zusatzknöpfe (Los, Quer/Längs, Gesicht der Kopie)
  function aimStep(first) {
    aim.first = first; aim.h = 0;
    const { ab } = aim, T = ab.target, k = first ? 1 : 0;
    aimEl.classList.toggle('next', !!k); // ab der zweiten Wahl nur noch der Hinweis, der Text ist gelesen
    // ohne Radius (VP Stufe 1–2) kein Kreis; allein im Team gibt es kein Gesicht zu wählen
    const H = T === 'self' && !selfR(ab) ? 'selfNoR' : T === 'teammatePoint' && st.units.length < 2 ? 'teammatePointSolo' : T;
    const hint = (HINT[H][k] ?? HINT[T][k]) + (T === 'enemyThenPoint' && k ? ` (bis ${ab.range2} Kacheln von der Wache)` : '');
    setText(aimEl.querySelector('.q-aim-hint'), `${ab.name.replace(/­/g, '')}: ${hint}`);
    const faces = T === 'teammatePoint' && !k && st.units.length > 1;
    aimEl.classList.toggle('faces', faces); // Gesichter in die erste Zeile neben „Abbrechen“: Leiste niedriger
    aimOpts.innerHTML = T === 'self' ? '<button class="primary" data-go>Los!</button>'
      : T === 'pointDir' && k ? '<button data-dir="h"><i class="q-dir h"></i>Quer</button><button data-dir="v"><i class="q-dir v"></i>Längs</button>'
        : faces ? st.units.map(t => `<button class="q-aim-face${t.i === aim.face ? ' on' : ''}" data-face="${t.i}" aria-label="Gesicht: ${esc(short(t.id))}"><img class="r-${esc(t.rarity)}" src="${face(t.id)}" alt=""></button>`).join('')
          : '';
  }
  aimOpts.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !aim) return;
    if (b.dataset.go != null) return fire({ target: {} });
    if (b.dataset.dir) return fire({ target: aim.first, dir: b.dataset.dir });
    if (b.dataset.face) { aim.face = +b.dataset.face; aimStep(aim.first); }
  });
  function endAim() { aim = null; aimEl.classList.add('hidden'); }
  $('.q-aim-x').addEventListener('click', endAim);
  // Befehl an die Engine. Scheitert er, bleibt der Zielmodus offen: zu weit = zweiten Punkt neu, sonst von vorn (Wache→Punkt: Punkt neu)
  function fire(cmd) {
    const { unit, ab } = aim;
    const bad = send({ type: 'ability', unit, ability: ab.id, ...cmd }).find(e => e.type === 'fail' && e.unit === unit);
    if (!bad) return endAim();
    if (aim?.first && ab.target !== 'enemyThenPoint' && bad.reason !== 'far') aimStep(null);
  }
  function aimTap(sx, sy) {
    const { unit, ab } = aim, T = ab.target, w = toWorld(sx, sy), q = { x: w.x / TILE, y: w.y / TILE };
    if (T === 'self') return fire({ target: {} });
    if (T === 'point') return fire({ target: q });
    if (LIST.has(T) || (T === 'enemyThenPoint' && !aim.first)) {
      const hit = pick(sx, sy, abilityTargets(st, unit, ab.id));
      if (!hit) {
        const any = ab.id === 'feierabend' && pick(sx, sy); // Stefan, Ranger & Co.: die Engine sagt „Der kündigt nicht.“
        if (any?.kind === 'enemy') return fire({ target: { enemy: any.ref.i } });
        sfx.play('warn'); return msg('Kein gültiges Ziel. Tipp auf ein leuchtendes Ziel.');
      }
      const t = hit.ref, target = t.door != null ? { door: t.door } : t.enemy != null ? { enemy: t.enemy } : { obj: t.obj };
      if (T !== 'enemyThenPoint') return fire({ target });
      sfx.play('tap');
      return aimStep(target);
    }
    if (!aim.first) { sfx.play('tap'); return aimStep(q); } // Punkt→Punkt, Punkt→Richtung, Kopie: erst der Startpunkt
    if (T === 'pointDir') return fire({ target: aim.first, dir: Math.abs(q.x - aim.first.x) >= Math.abs(q.y - aim.first.y) ? 'h' : 'v' });
    fire({ target: aim.first, target2: q, face: aim.face });
  }

  function abIcon(ab) { // Familientreffen: die echten Gesichter von Christian und Micha statt Cartoon
    return ab.id === 'family' ? `<span class="q-fam"><img src="${face('christian')}" alt=""><img src="${face('micha')}" alt=""></span>` : `<img src="${ab.icon}" alt="">`;
  }
  const dots = lv => `<span class="q-lv" aria-hidden="true">${[1, 2, 3].map(k => `<i${k <= lv ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const chg = ab => (ab.charges != null ? '<b class="q-chg"></b>' : '');
  function openMenu(i) {
    const u = st.units[i];
    if (!u || u.down || st.over || briefingOpen() || !isMine(i)) return;
    select([i], { keepFollow: true });
    endAim();
    menuFor = i;
    // Plätze links/rechts neben dem Rüther, Namen weit genug seitlich: sein echtes Gesicht in der Mitte bleibt frei.
    // Obere Plätze (ohne y) hängen mit der Unterkante RING_UP px über der Gesichtsreihe, der Name steht über dem Symbol:
    // so landet kein Name auf den Gesichtern der Teamkameraden daneben (§0)
    const list = abs[i], at = list.length >= 3 ? [[-78], [78], [-78, 56], [78, 56]] : [[-78], [78], [0, 72]];
    ringEl.innerHTML = '';
    [...list.map(a => ({ a })), { stop: true }].forEach((it, k) => {
      const b = document.createElement('button');
      b.className = 'q-ring-item';
      b.style.left = `${at[k][0]}px`; b.dataset.sd = Math.sign(at[k][0]);
      if (at[k][1] == null) { b.classList.add('up'); b.style.bottom = `${RING_UP}px`; } else b.style.top = `${at[k][1]}px`;
      if (it.stop) { b.classList.add('stop'); b.innerHTML = '<span class="q-ring-ico"><i></i></span><span class="q-ring-name">Stopp</span>'; b.addEventListener('click', () => { closeMenu(); send({ type: 'stop', unit: i }); }); }
      else {
        b.dataset.ab = it.a.id;
        b.setAttribute('aria-label', `${it.a.name}, Stufe ${it.a.level}`);
        b.innerHTML = `<span class="q-ring-ico">${abIcon(it.a)}<span class="q-cd"></span>${chg(it.a)}</span>${dots(it.a.level)}<span class="q-ring-name">${esc(it.a.name)}</span>`;
        b.addEventListener('click', () => chooseAbility(i, it.a.id));
      }
      ringEl.appendChild(b);
    });
    ringEl.classList.remove('hidden');
    // Symbole und Namen relativ zur Ringmitte (offset* ohne die Einblend-Animation), für placeMenu
    ringBox = [...ringEl.querySelectorAll('.q-ring-ico, .q-ring-name')].map(n => {
      const b = n.closest('.q-ring-item');
      return { sd: +b.dataset.sd, x: b.offsetLeft + n.offsetLeft, y: b.offsetTop + n.offsetTop, w: n.offsetWidth, h: n.offsetHeight };
    });
    ringW = RING_W[0];
    sfx.play('special');
    tutStep(2);
  }
  function closeMenu() { menuFor = -1; ringEl.classList.add('hidden'); }

  // ---------- HUD ----------
  function buildTeam() {
    teamEl.innerHTML = '';
    for (const u of st.units) {
      const b = document.createElement('button'), theirs = !isMine(u.i); // Koop: Rüther des Partners mit Namens-Etikett, Gesicht unverändert
      b.className = theirs ? 'q-por theirs' : 'q-por';
      b.dataset.u = u.i;
      b.setAttribute('aria-label', theirs ? `${short(u.id)} (${coop.partner.name})` : short(u.id));
      b.innerHTML = `<img class="r-${esc(u.rarity)}" src="${face(u.id)}" alt=""><span class="q-hp"><i></i></span><span class="q-carry hidden"></span>`
        + (theirs ? `<span class="q-owner">${esc(coop.partner.name)}</span>` : '');
      b.addEventListener('click', () => {
        if (!st || st.over) return;
        if (!isMine(u.i)) return msg(`Das ist ${whose(coop.partner.name)} Rüther.`);
        if (lastTap.p === u.i && performance.now() - lastTap.t < DOUBLE_MS) { lastTap = {}; return openMenu(u.i); }
        lastTap = { p: u.i, t: performance.now() };
        select([u.i]);
      });
      teamEl.appendChild(b);
    }
    const all = document.createElement('button');
    all.className = 'q-all';
    all.textContent = 'Alle';
    all.addEventListener('click', () => { if (st && !st.over) select(upUnits()); });
    if (!st.solo) teamEl.appendChild(all); // solo: nur einer, „Alle“ wäre sinnlos
  }
  function buildPowers() {
    const one = sel.length === 1 ? st.units[sel[0]] : null, key = one ? `${one.i}` : 'team';
    if (key === powersKey) return;
    powersKey = key;
    powersEl.innerHTML = '';
    if (!one) { powersEl.innerHTML = `<span class="q-powers-none">${coop && !coop.alone ? 'Deine Rüther gewählt' : 'Ganzes Team gewählt'}</span>`; return; }
    for (const ab of abs[one.i]) {
      const b = document.createElement('button');
      b.className = 'q-ab';
      b.dataset.ab = ab.id;
      b.setAttribute('aria-label', `${ab.name}, Stufe ${ab.level}`);
      b.innerHTML = `${abIcon(ab)}<span class="q-cd"></span>${chg(ab)}${dots(ab.level)}`;
      b.addEventListener('click', () => { if (st && !st.over) chooseAbility(one.i, ab.id); });
      powersEl.appendChild(b);
    }
    if (abs[one.i].length < 3) { // dritter Slot leer: Hinweis auf die Sammlung
      const b = document.createElement('button');
      b.className = 'q-ab free';
      b.textContent = 'frei';
      b.addEventListener('click', () => msg('Dritter Slot frei. Kauf in der Sammlung eine Fähigkeit aus seinem Pool.', 2600));
      powersEl.appendChild(b);
    }
  }
  // Abklingzeit als Tortenstück und Sekunden, Ladungen als Zahl (Feierabend: 0 = aufgebraucht)
  function cdView(node, u, ab) {
    const left = Math.max(0, (u.cd[ab.id] || 0) - st.time), n = ab.charges != null ? u.charges[ab.id] || 0 : null;
    node.classList.toggle('cool', left > 0 || n === 0 || !!u.item || u.down);
    node.style.setProperty('--cd', ab.cd ? (left / ab.cd).toFixed(3) : '0');
    setText(node.querySelector('.q-cd'), left > 0 ? `${Math.ceil(left / 1000)}` : '');
    if (n != null) setText(node.querySelector('.q-chg'), `${n}×`);
  }
  // HUD-Hinweis aus den Fänger-Typen der Karte: Kieser-Zähler mit aktuellem Belohnungsstand bzw. die Strafe fürs Erwischtwerden
  const kieserReward = n => { const r = QUEST_SATS[st.missionId]; return r?.kieser ? Math.max(r.min || 0, r.base - r.kieser * n) : null; };
  function noteText() {
    if (catcher.kieser) { const r = kieserReward(st.kieser); return `Kieser: ${st.kieser}${r == null ? '' : ` · ${fmt(r)}`}`; }
    return catcher.fine ? `Erwischt = −${fmt(catcher.fine)}` : '';
  }
  function hud() {
    const o = st.objective, need = o.type === 'steal' ? o.min : o.total;
    setText(goalN, o.type === 'steal' && o.done >= o.min ? `${o.done}` : `${o.done}/${need}`);
    goalN.classList.toggle('done', o.done >= o.min);
    const left = st.timeLimit == null ? Infinity : st.timeLimit - st.time;
    setText(timeEl, left === Infinity ? 'Keine Eile' : mmss(left));
    timeEl.classList.toggle('low', left < 30_000);
    const note = noteText();
    setText(noteEl, note);
    noteEl.classList.toggle('hidden', !note);
    const w = `${Math.round(st.alarm * 100)}%`;
    if (alarmFill.style.width !== w) alarmFill.style.width = w;
    alarmBox.classList.toggle('full', st.fullAlarm);
    edge.classList.toggle('full', st.fullAlarm && !st.over);
    for (const b of teamEl.querySelectorAll('.q-por')) {
      const u = st.units[b.dataset.u], hp = `${Math.round(100 * u.hp / u.maxHp)}%`, fill = b.querySelector('.q-hp i');
      if (fill.style.width !== hp) fill.style.width = hp;
      fill.classList.toggle('low', u.hp / u.maxHp <= 0.3);
      b.classList.toggle('on', sel.includes(u.i));
      b.classList.toggle('down', u.down);
      b.classList.toggle('busy', !!u.busy);
      const c = b.querySelector('.q-carry'), t = u.item ? 'PS3' : u.carry ? `${u.carry}` : '';
      setText(c, t);
      c.classList.toggle('hidden', !t);
      c.classList.toggle('ps3', !!u.item);
    }
    buildPowers();
    const one = sel.length === 1 ? st.units[sel[0]] : null;
    if (one) for (const b of powersEl.querySelectorAll('.q-ab[data-ab]')) cdView(b, one, abOf(one.i, b.dataset.ab));
    if (menuFor >= 0) for (const b of ringEl.querySelectorAll('[data-ab]')) cdView(b, st.units[menuFor], abOf(menuFor, b.dataset.ab));
    el.classList.toggle('q-over', st.over);
    extractBtn.disabled = !canExtract(st);
    extractBtn.classList.toggle('ready', !extractBtn.disabled);
    const briefing = briefingOpen() || tut >= 0; // Briefing/Tutorial halten das Spiel selbst an
    pauseBtn.disabled = briefing;
    setText(pauseBtn, paused && !briefing ? 'Weiter' : 'Pause');
    pauseBtn.classList.toggle('on', paused && !briefing);
    const gone = !!coop?.gone; // Koop: Verbindung weg
    setText(pausedEl, gone ? `Verbindung zu ${coop.partner.name} weg …` : 'Pause · Befehle gehen trotzdem');
    pausedEl.classList.toggle('hidden', !(paused || gone) || !!ending || briefing || !!mini || !!cut);
    if (mini) drawMini();
  }

  // Koop-Gast: Pause ist ein Wunsch an den Host (qp); paused selbst kommt mit jedem qs zurück
  function setPaused(p) {
    if (remote()) { if (!st?.over) coop.link.send({ t: 'qp', on: !!p }); return; }
    paused = !!p; if (!paused) lastTs = 0;
  }
  // Bei offener Minikarte heißt der Knopf „Weiter“: Karte zu und weiter, nicht blind hinter der Karte weiterspielen
  function togglePause() { if (mini) { closeMini(); setPaused(false); } else setPaused(!paused); }
  pauseBtn.addEventListener('click', () => { if (st && !st.over && tut < 0) togglePause(); });
  extractBtn.addEventListener('click', () => send({ type: 'extract' }));
  quitBtn.addEventListener('click', async () => {
    if (!st || st.over || quitAsk) return;
    quitAsk = true;
    const was = paused, run = seq;
    setPaused(true);
    const why = coop && !coop.alone ? 'Aufgeben beendet die Quest für euch beide.' : 'Die Haunebu hebt ohne Beute ab. Die Quest zählt als nicht geschafft.';
    const i = await popup({ title: 'Aufgeben?', html: `<p>${why}</p>`, buttons: [{ label: 'Weiterspielen', primary: true }, { label: 'Aufgeben', danger: true }] });
    quitAsk = false;
    if (run !== seq || !st || st.over) return;
    if (i === 1) send({ type: 'abort' }); else setPaused(was);
  });
  el.addEventListener('click', e => { if (e.target.closest('button')) sfx.play('click'); });
  stampEl.addEventListener('click', () => finish());
  function onKey(e) {
    if (!st || st.over) return;
    if (e.key === ' ' && tut < 0 && cardEl.classList.contains('hidden')) { togglePause(); e.preventDefault(); }
    if (e.key === 'Escape') { endAim(); closeMenu(); closeMini(); }
  }
  function onHide() { if (document.hidden && st && !st.over) setPaused(true); }

  // ---------- Einstieg: Briefing und Tutorial ----------
  function showIntro(withTut) {
    const m = st.mission, v = st.variant, solo = st.solo ? ` · Solo: ${esc(short(st.units[0].id))}` : '';
    const where = st.layoutId != null && st.layout?.name ? `<span class="q-card-layout">Karte: ${esc(st.layout.name)}${st.mirror ? ' · gespiegelt' : ''}</span>` : '';
    const warn = catcher.fine ? `<p class="q-card-warn">Erwischt = −${fmt(catcher.fine)} Sats Strafe</p>` : '';
    cardEl.innerHTML = `<p class="q-card-place">${esc(m.place)}</p><h2>${esc(m.name)}</h2>`
      + `<p class="q-card-var">${where}<b>Variante: ${esc(v.name)}.</b> ${esc(v.desc)}</p><p>${esc(m.intro)}</p><p class="q-card-hint">${esc(m.hint)}</p><p class="q-card-melee">${esc(MELEE_HINT)}</p>${warn}`
      + `<div class="q-card-team">${st.units.map(u => `<img class="r-${esc(u.rarity)}" src="${face(u.id)}" alt="${esc(short(u.id))}">`).join('')}</div>`
      + `<p class="q-card-meta">${esc(m.objective.label)} · ${st.timeLimit == null ? 'Keine Eile' : mmss(st.timeLimit)}${solo}${coop ? ` · Koop mit ${esc(coop.partner.name)}` : ''}</p><button class="primary q-go">Los!</button>`;
    cardEl.classList.remove('hidden');
    cardEl.querySelector('.q-go').addEventListener('click', () => {
      if (goWait()) return;
      cardEl.classList.add('hidden');
      if (withTut) { tut = 0; showTut(); } else setPaused(false);
    });
    updateGo();
  }
  // Koop: Host wartet auf qr des Gasts, der Gast auf das erste qs ohne Pause (Host hat „Los!“ gedrückt)
  const goWait = () => remote() || (hosting() && !coop.ready);
  function updateGo() {
    const b = cardEl.querySelector('.q-go');
    if (!b) return;
    b.disabled = goWait();
    setText(b, goWait() ? `Warte auf ${coop.partner.name} …` : 'Los!');
  }
  function showTut() {
    const s = TUT[tut];
    tutEl.className = `q-tut at-${s.at}`;
    setText(tutEl.querySelector('p'), tut === 0 && st.solo ? `Tipp auf ${short(st.units[0].id)}s Gesicht, um ihn zu wählen. Diesmal ist er allein unterwegs.` : s.text);
  }
  function tutStep(k) {
    if (tut !== k) return;
    tut++;
    if (tut < TUT.length) return showTut();
    tut = -1;
    tutEl.classList.add('hidden');
    try { localStorage.setItem(TUT_KEY, '1'); } catch { /* egal */ }
    setPaused(false);
  }
  tutEl.querySelector('button').addEventListener('click', () => tutStep(tut));
  const tutSeen = () => { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return true; } };

  // ---------- Events der Engine → Animationen, Sounds ----------
  function handle(events) {
    for (const e of events) {
      const U = e.unit != null ? st.units[e.unit] : null;
      switch (e.type) {
        case 'path':
          if (!isMine(e.unit)) break; // Wege des Partners zeigt die gestrichelte Linie
          ring(e.to.x + 0.5, e.to.y + 0.5, 0.45, PAPER, 450);
          sfx.play('step');
          tutStep(1);
          break;
        case 'fail': // Koop: nur beim Absender des Befehls (by), sonst für eigene Einheiten und ohne Einheit
          if (e.by ? !coop || e.by === coop.role : e.unit == null || isMine(e.unit)) { msg(e.text); sfx.play('warn'); }
          break;
        case 'interactStart':
          sfx.play('tap');
          if (e.kind === 'revive') say({ u: e.unit }, 'Steh auf, wir sind noch nicht fertig!', 2000);
          break;
        case 'interactCancel':
          if (e.reason !== 'befehl') text({ u: e.unit }, e.reason === 'entdeckt' ? 'Entdeckt!' : e.reason === 'erwischt' ? 'Erwischt!' : 'Autsch!', RED, 14);
          break;
        case 'steal':
          if (!e.instant) coinsFly(e.x, e.y, U.x, U.y - 0.6, 1);
          if (e.shared) coinsFly(e.x, e.y, U.x, U.y - 0.6, e.n, 420); // Wallet Stufe 3: Teamkamerad kriegt mit
          sfx.play('steal');
          if (!e.instant || e.shared) text({ x: e.x, y: e.y - 0.5 }, `+${e.n}`, GOLD, 16); // Wallet: das „+n“ steht schon am Rüther (case 'wallet')
          break;
        case 'vaultEmpty': text({ x: e.x, y: e.y - 0.4 }, 'leer', PAPER, 13); break;
        case 'sabotage':
          burst(e.x, e.y, 14, { colors: ['#4a4a4a', '#7a7a7a', AMBER], up: 50, grav: -20, speed: 30, ms: 1200, size: 4 });
          text({ x: e.x, y: e.y - 1.4 }, `Sabotiert ${e.done}/${e.total}`, GOLD, 15, 1400);
          say({ u: e.unit }, 'Dosenbier im Tank. Die fliegt nie wieder.', 2200);
          sfx.play('hit');
          break;
        case 'pickup':
          pop('art/q-ps3.png', e.x, e.y - 0.4, { size: 30, ms: 700 });
          text({ x: e.x, y: e.y - 0.6 }, 'PS3!', GOLD, 18);
          sfx.play('catch');
          break;
        case 'unplug':
          burst(e.x, e.y, 18, { kind: 'spark', colors: [GOLD, PAPER, TEAL], speed: 90, up: 20, grav: 60, ms: 700, size: 1.4 });
          text({ x: e.x, y: e.y - 0.6 }, 'Stecker raus!', GOLD, 16, 1400);
          sfx.play('breakout');
          break;
        case 'revive':
          burst(e.x, e.y, 8, { kind: 'heart', colors: [RED, '#F07A8A'], speed: 25, up: 50, grav: -10, ms: 1100, size: 1.4 });
          text({ u: e.target }, `+${e.hp}`, TEAL, 16);
          sfx.play('levelup');
          break;
        case 'deliver':
          // Texte über der Untertasse, nicht auf den Gesichtern der oberen Plattform-Reihe
          if (e.coins) { coinsFly(e.x, e.y - 0.5, pad.x, pad.y, e.coins, 500); text({ x: pad.x, y: pad.y0 - 1.2 }, `+${e.coins}`, GOLD, 20, 1300); sfx.play('coin'); }
          if (e.item) { text({ x: pad.x, y: pad.y0 - 1.2 }, 'PS3 an Bord!', GOLD, 18, 1500); sfx.play('win'); }
          break;
        case 'objective':
          goalN.classList.remove('pop'); void goalN.offsetWidth; goalN.classList.add('pop');
          if (e.reached && !reached) { reached = true; msg('Ziel erfüllt! Alle auf die Plattform und abheben.', 3200); sfx.play('quest'); }
          break;
        case 'ability': ability(e, U); break;
        case 'doorOpen':
          burst(e.x, e.y, 8, { colors: [GOLD, TEAL], speed: 40, up: 30, ms: 600 });
          if (e.by != null) say({ u: e.by }, 'Plus 70 Prozent. Auch auf Türen.', 2000);
          if (e.silent) text({ x: e.x, y: e.y - 1.6 }, 'lautlos', PAPER, 12, 1300);
          if (miniBase) miniBase.cv = paintMini(st, th, miniBase.s); // Minikarte zeigt die Tür offen
          sfx.play('coin');
          break;
        case 'noise': {
          const n = NOISE[e.kind] || NOISE.can;
          for (let k = 0; k < (e.kind === 'alarmanlage' ? 3 : 2); k++) ring(e.x, e.y, e.r, n.c, 800, k * 220);
          if (n.t) text({ x: e.x, y: e.y - 1 }, n.t, n.c, 18, 1200);
          sfx.play(e.kind === 'alarmanlage' ? 'warn' : 'hit');
          break;
        }
        case 'bait': effAt.set(e.effect, now()); burst(e.x, e.y, 10, { colors: MMS, speed: 40, up: 30, ms: 500 }); break;
        case 'baitTaken': say({ e: e.enemy }, e.say); break;
        case 'stun': {
          flash.set(st.enemies[e.enemy], now() + 140);
          if (e.bounce != null) throwArc(THROWN.controller, e.fromX, e.fromY - 0.3, e.x, e.y, 320, { size: 22, spin: 5 * Math.PI }); // Abpraller
          if (e.reason === 'controller' || e.reason === 'slip') burst(e.x, e.y - 0.3, 6, { kind: 'star', colors: [GOLD], speed: 50, up: 30, ms: 700, size: 1.3 });
          if (STUN_TXT[e.reason]) text({ e: e.enemy }, STUN_TXT[e.reason], e.reason === 'hack' || e.reason === 'lizenz' ? TEAL : GOLD, 16);
          if (e.reason === 'eat') {
            burst(e.x, e.y, 6, { colors: ['#7FD36B', '#4E9A3C'], speed: 20, up: 20, grav: -30, ms: 1000 });
            if (e.left > 0) text({ x: e.x, y: e.y - 1.3 }, 'Da ist noch eine Portion!', MMS[3], 13, 1600);
          }
          if (e.reason === 'slip') burst(e.x, e.y + 0.2, 12, { colors: [GOLD, PAPER, AMBER], speed: 50, up: 40, grav: 160, ms: 700, size: 3 });
          if (e.reason === 'lizenz') burst(e.x, e.y - 0.3, 10, { kind: 'spark', colors: [TEAL, PINK], speed: 60, up: 20, grav: 0, ms: 600, size: 1.3 });
          if (e.listener) text({ x: e.x, y: e.y - 1.4 }, 'hört zu …', PAPER, 13, 1500);
          say({ e: e.enemy }, e.say);
          if (e.reason === 'controller' || e.reason === 'slip') sfx.play('hit');
          break;
        }
        case 'wake': say({ e: e.enemy }, e.say); break;
        case 'ko':
          burst(e.x, e.y - 0.3, 8, { kind: 'star', colors: [GOLD, PAPER], speed: 60, up: 40, ms: 800, size: 1.3 });
          if (e.tied) text({ e: e.enemy }, 'Gefesselt!', GOLD, 18, 1300); // „KO“ steht schon als Dauer-Label
          sfx.play('hit');
          break;
        case 'suspicious': popAt.set(st.enemies[e.enemy], now()); say({ e: e.enemy }, e.say); sfx.play('tap'); break;
        case 'alert': {
          const en = st.enemies[e.enemy];
          popAt.set(en, now());
          say({ e: e.enemy }, e.say);
          if (e.megafon) { for (let k = 0; k < 3; k++) ring(e.x, e.y, 3, RED, 700, k * 180); text({ e: e.enemy }, 'MEGAFON!', RED, 18, 1300); }
          if (e.muted) { text({ x: e.x, y: e.y - 1.5 }, 'Funkloch: keiner hört ihn', '#9AA0A6', 13, 1800); sfx.play('warn'); break; } // WLAN Stufe 3
          pulseEdge(); sfx.play('alarm'); haptic([60, 40, 60]);
          break;
        }
        case 'calm': case 'lost': say({ e: e.enemy }, e.say); break;
        case 'hit': {
          const target = e.from === 'enemy' ? U : st.enemies[e.enemy];
          flash.set(target, now() + 160);
          text(e.from === 'enemy' ? { u: e.unit } : { e: e.enemy }, `-${e.damage}`, e.from === 'enemy' ? RED : PAPER, 15, 900);
          if (rt - hitSfxAt > 160) { hitSfxAt = rt; sfx.play('hit'); }
          if (e.from === 'enemy') haptic(20);
          break;
        }
        case 'down':
          text({ u: e.unit }, 'K.O.', RED, 20, 1400);
          burst(e.x, e.y, 6, { kind: 'star', colors: [GOLD], speed: 40, up: 30, ms: 900, size: 1.3 });
          say({ u: e.unit }, 'Ich bleib hier liegen. Holt mich!', 2400);
          sfx.play('lose'); haptic(90);
          if (sel.includes(e.unit)) { const rest = sel.filter(i => !st.units[i].down); select(rest.length ? rest : upUnits().slice(0, 1), { keepFollow: true }); }
          break;
        case 'fullAlarm': msg('VOLLALARM! Gleich kommt Verstärkung.', 3000); sfx.play('alarm'); haptic([80, 50, 80, 50, 80]); break;
        case 'alarmOff': msg('Der Alarm ist vorbei.'); sfx.play('quest'); break;
        case 'reinforce':
          ring(e.x, e.y, 1.5, RED, 900);
          text({ x: e.x, y: e.y - 0.5 }, 'Verstärkung!', RED, 18, 1500);
          sfx.play('rage');
          break;
        case 'effectEnd': effectEnd(e); break;
        // ---------- v9 ----------
        case 'valve':
          valveAt.set(e.obj, now());
          burst(e.x, e.y - 0.3, 14, { colors: ['#9fd0ea', PAPER, '#5c9fcf'], speed: 50, up: 50, grav: 160, ms: 800, size: 3 });
          text({ x: e.x, y: e.y - 1.3 }, `${st.mission.texts?.valve || 'Kein Wasser mehr!'} ${e.done}/${e.total}`, TEAL, 15, 1600);
          say({ u: e.unit }, e.done >= e.total ? 'Ohne Wasser keine Dusche. Ungeschlagen logisch.' : 'Zugedreht. Weiter.', 2200, 1500); // erst nach dem Text überm Ventil
          sfx.play('breakout');
          break;
        case 'ignite':
          burst(e.x, e.y - 0.5, 16, { kind: 'spark', colors: [GOLD, AMBER, RED], speed: 70, up: 60, grav: 40, ms: 900, size: 1.4 });
          text({ x: e.x, y: e.y - 1.6 }, `${st.mission.texts?.fire || 'Es brennt!'} ${e.done}/${e.total}`, AMBER, 15, 1600);
          sfx.play('hit');
          break;
        case 'fireSpotted':
          for (let k = 0; k < 2; k++) ring(e.x, e.y, 1.6, RED, 800, k * 250);
          if (e.enemies?.length) say({ e: e.enemies[0] }, e.say);
          msg('Ein Ranger hat das Feuer gesehen und kommt löschen. Weg da!', 2600);
          sfx.play('warn');
          break;
        case 'bark':
          for (let k = 0; k < 3; k++) ring(e.x, e.y, e.r, AMBER, 700, k * 200);
          text({ e: e.enemy }, 'WAU!', AMBER, 20, 1100);
          sfx.play('warn');
          break;
        case 'whistle':
          for (let k = 0; k < 2; k++) ring(e.x, e.y, 3, PAPER, 600, k * 160);
          text({ e: e.enemy }, 'TRIIIL!', PAPER, 18, 1200);
          break;
        case 'coffee':
          if (e.phase === 'start') { say({ e: e.enemy }, e.say, 3200); sfx.play('tap'); }
          else burst(e.x, e.y - 0.6, 5, { colors: [PAPER], speed: 10, up: 30, grav: -30, ms: 900, size: 2 });
          break;
        case 'caffeinated':
          text({ e: e.enemy }, 'KOFFEIN!', GOLD, 16, 1300);
          say({ e: e.enemy }, e.say, 2400);
          sfx.play('rage');
          break;
        case 'kieser': kieserScene(e); break;
        case 'resumed': {
          const u = st.units[e.unit];
          prev = new WeakMap(); // harter Schnitt: Rüther und Stefan springen, nicht gleiten
          if (isMine(e.unit)) { cam = { x: u.x * TILE, y: u.y * TILE }; select([e.unit]); }
          msg(`Kieser-Training #${st.kieser} überstanden. Zurück an der Haunebu, alles ist ruhig.`, 3000);
          break;
        }
        case 'caught': caught = e; haptic([120, 60, 120]); break;
        case 'end': endSequence(e); break;
        default: v10Event(e);
      }
    }
  }

  // v10: neue Engine-Events (Verhalten, platzierte Objekte, Tarnung)
  function v10Event(e) {
    const en = e.enemy != null ? st.enemies[e.enemy] : null;
    switch (e.type) {
      case 'task': say({ e: e.enemy }, e.say); if (e.kind === 'sale' || e.kind === 'raubkopie') popAt.set(en, now()); break;
      case 'taskEnd':
        say({ e: e.enemy }, e.say);
        if (e.reason === 'wach') { popAt.set(en, now()); text({ e: e.enemy }, 'WACH!', RED, 18, 1200); sfx.play('warn'); }
        scolder.delete(e.enemy);
        break;
      case 'phone':
        for (let k = 0; k < 2; k++) ring(e.x, e.y, e.r, GREEN, 900, k * 260);
        text({ x: e.x, y: e.y - 1 }, 'KURS-ALARM!', GREEN, 16, 1400);
        sfx.play('coin');
        break;
      case 'puddle':
        burst(e.x, e.y, 14, { colors: [GOLD, PAPER, AMBER], speed: 45, up: 50, grav: 180, ms: 700, size: 3 });
        text({ x: e.x, y: e.y - 0.8 }, 'Pfütze!', GOLD, 14);
        break;
      case 'disguiseEnd':
        if (DISGUISE_END[e.reason]) text({ u: e.unit }, DISGUISE_END[e.reason], e.reason === 'zeit' ? PAPER : RED, 14, 1500);
        for (const sd of [-1, 1]) burst(e.x + sd * 0.65, e.y - 0.2, 4, { kind: 'spark', colors: [GOLD, PAPER], speed: 50, up: 20, grav: 0, ms: 600, size: 1.3, side: sd });
        break;
      case 'vpSend': say({ u: e.unit }, e.say, 2200); text({ e: e.enemy }, 'Zum Tor!', GOLD, 15, 1500); break;
      case 'routesSwapped': for (const i of e.enemies) text({ e: i }, 'Runde getauscht!', AMBER, 13, 1700); sfx.play('tap'); break;
      case 'gone':
        burst(e.x, e.y, 14, { colors: ['#8a8f94', PAPER], speed: 50, up: 40, grav: -20, ms: 800, size: 4 });
        pop('art/q-box.png', e.x, e.y - 0.4, { size: 26, ms: 1300, kind: 'rise' });
        text({ x: e.x, y: e.y - 1.2 }, 'Gekündigt!', GOLD, 16, 1600);
        say({ x: e.x, y: e.y }, e.say, 2200);
        sfx.play('quest');
        break;
      case 'alarmDrop': msg(`Der Kurs hat sich erholt: alle tiefenentspannt, Alarm −${Math.round(e.drop * 100)} %.`, 2800); sfx.play('quest'); break;
      case 'heard': popAt.set(en, now()); say({ e: e.enemy }, e.say); break;
    }
  }
  function effectEnd(e) {
    if (e.kind === 'gas') burst(e.x, e.y, 10, { colors: ['#9BE36B', '#5BB55A'], speed: 30, up: 10, grav: -20, ms: 900, size: 4 });
    else if (e.kind === 'deo') burst(e.x, e.y, 12, { colors: [PINK, '#FFD3EA'], speed: 40, up: 10, grav: -20, ms: 1000, size: 4 });
    else if (e.kind === 'wlan') text({ x: e.x, y: e.y - 0.5 }, 'Netz wieder da', TEAL, 13, 1300);
    else if (e.kind === 'firewall') burst(e.x, e.y, 12, { kind: 'spark', colors: [TEAL, '#BFF5EC'], speed: 60, up: 30, grav: 40, ms: 700, size: 1.3 });
    else if (e.kind === 'decoy') { burst(e.x, e.y, 12, { colors: [TEAL, PINK, PAPER], speed: 50, up: 20, grav: 0, ms: 600, size: 3 }); text({ x: e.x, y: e.y - 0.8 }, 'verpufft', PINK, 13); }
    else if (e.kind === 'sale' || e.kind === 'horde') burst(e.x, e.y, 10, { colors: e.kind === 'sale' ? ['#8a8f94', PAPER] : [RED, GOLD, TEAL, '#3F8EF5'], speed: 50, up: 40, grav: 60, ms: 700, size: 3 });
  }

  function ability(e, u) {
    const x = e.x, y = e.y, ens = ids => ids.filter(i => i >= 0).map(i => st.enemies[i]);
    if (e.say) say({ u: e.unit }, e.say, e.ability === 'argue' ? 3200 : 2600);
    switch (e.ability) {
      case 'plus70':
        doorAt.set(e.door, now());
        pop(fxArt('chart-up'), e.tx, e.ty - 0.4, { size: 48, ms: 1300, kind: 'rise' });
        for (let k = 0; k < 10; k++) fx.parts.push({ x: (e.tx + (Math.random() - 0.5) * 2.4) * TILE, y: (e.ty - 2.2) * TILE, vx: (Math.random() - 0.5) * 20, vy: 10, grav: 260, kind: 'img', src: 'art/q-coin.png', size: 10, ms: 900 + Math.random() * 300, born: now() + k * 60 });
        text({ x: e.tx, y: e.ty - 1 }, '+70 %', GOLD, 24, 1500);
        if (e.quick) text({ u: e.unit }, 'Nächster Klau: sofort!', GOLD, 13, 1800);
        sfx.play('special');
        break;
      case 'beer': case 'mms': case 'controller': case 'kursalarm':
        throwArc(THROWN[e.item], x, y - 0.3, e.tx, e.ty, e.ms, { size: e.item === 'controller' ? 24 : 22, spin: e.item === 'mms' ? Math.PI : e.item === 'phone' ? 2 * Math.PI : 5 * Math.PI, to: e.item === 'controller' ? { e: e.enemy } : null });
        if (e.item !== 'controller') ring(e.tx, e.ty, 0.45, PAPER, 450); // Landepunkt (auch in der Pause sichtbar, die Dose liegt da noch unterm Gesicht)
        if (e.portions > 1) text({ u: e.unit }, 'Familienpackung!', MMS[3], 14, 1500);
        if (e.ability === 'kursalarm') say({ u: e.unit }, 'Schaut mal, der Kurs!', 2000);
        sfx.play('throw');
        break;
      case 'vp':
        for (const sd of [-1, 1]) burst(x + sd * 0.65, y - 0.2, 7, { kind: 'spark', colors: [GOLD, PAPER], speed: 70, up: 30, grav: 0, ms: 800, size: 1.4, side: sd });
        text({ u: e.unit }, 'Vice President', GOLD, 15, 1600);
        sfx.play('special');
        break;
      case 'wlan':
        for (let k = 0; k < 3; k++) ring(e.tx, e.ty, e.size / 2, TEAL, 800, k * 220);
        text({ x: e.tx, y: e.rect.y0 - 0.9 }, 'WLAN-STÖRUNG', TEAL, 15, 1600); // über der Zone, nicht auf der Drohne; „FUNKLOCH“ steht dauerhaft am Rand darunter
        say({ u: e.unit }, 'Moment, ich starte mal kurz den Router neu.', 2200);
        sfx.play('special');
        break;
      case 'family':
        banner(fxLayer, { title: 'Familientreffen', sub: 'Christian! Micha! Kommt sofort her!', portrait: face(u.id), rarity: u.rarity, ms: 1500 });
        for (const h of e.helpers) fx.helpers.push({ id: h.id, x0: h.x * TILE, y0: h.y * TILE, x1: h.tx * TILE, y1: h.ty * TILE, ms: e.ms, born: now(), enemy: h.enemy });
        if (e.silent) text({ u: e.unit }, 'ganz leise', PAPER, 12, 1500);
        sfx.play('special'); haptic(40);
        break;
      case 'junge':
        scolder.set(e.enemy, e.unit); chatAt.delete(e.enemy);
        popAt.set(st.enemies[e.enemy], now());
        ring(e.tx, e.ty, 1, AMBER, 600);
        sfx.play('warn');
        break;
      case 'mittag': case 'crash':
        for (let k = 0; k < 2; k++) ring(x, y, e.r, e.ability === 'mittag' ? SKY : RED, 1100, k * 300);
        for (const en of ens(e.enemies)) {
          if (e.ability === 'mittag') text({ e: en.i }, 'Zzz', SKY, 15, 1500);
          else pop('art/ab-crash.png', en.x, en.y - 1.1, { size: 22, ms: 1200, kind: 'rise' });
        }
        sfx.play(e.ability === 'mittag' ? 'tap' : 'warn');
        break;
      case 'tratsch':
        for (const en of ens(e.enemies)) ring(en.x, en.y, 0.9, AMBER, 700);
        pop('art/ab-tratsch.png', e.meet.x, e.meet.y - 0.8, { size: 28, ms: 1400, kind: 'rise' });
        sfx.play('tap');
        break;
      case 'mutter':
        pop('art/ab-mutter.png', e.tx, e.ty - 1.1, { size: 26, ms: 1400, kind: 'rise' });
        for (let k = 0; k < 3; k++) ring(e.tx, e.ty, 1.4, RED, 500, k * 180);
        text({ e: e.enemy }, 'RING RING!', RED, 16, 1500);
        sfx.play('warn');
        break;
      case 'gas':
        say({ u: e.unit }, 'Riecht ihr das? Ich nicht.', 2000);
        sfx.play('gas');
        break;
      case 'argue': sfx.play('special'); break;
      case 'insider':
        pop('art/ab-insider.png', e.tx, e.ty - 1.1, { size: 24, ms: 1300, kind: 'rise' });
        ring(e.to.x, e.to.y, 1, GOLD, 900);
        sfx.play('tap');
        break;
      case 'deo':
        throwArc('art/ab-deo.png', x, y - 0.3, e.tx, e.ty, 380, { size: 22, spin: 2 * Math.PI });
        effAt.set(e.effect, now() + 380); // der Nebel quillt erst, wenn die Dose landet (drawOverlay)
        say({ u: e.unit }, 'Duschen? Ich hab Deo.', 2000);
        if (e.mute) text({ x: e.tx, y: e.ty - e.size / 2 - 0.3 }, 'gedämpft', PINK, 13, 1500);
        sfx.play('gas');
        break;
      case 'wallet':
        pop(fxArt('wallet'), e.tx, e.ty - 0.5, { size: 28, ms: 800 });
        if (e.mode === 'vault') { coinsFly(e.tx, e.ty, x, y - 0.6, e.coins, 420); text({ u: e.unit }, `+${e.coins}`, GOLD, 18); sfx.play('coin'); }
        else { fx.bolts.push({ x0: x * TILE, y0: y * TILE, x1: e.tx * TILE, y1: e.ty * TILE, ms: 500, born: now() }); sfx.play('special'); }
        break;
      case 'firewall':
        fx.bolts.push({ x0: x * TILE, y0: y * TILE, x1: e.tx * TILE, y1: e.ty * TILE, ms: 450, born: now() });
        text({ x: e.tx, y: e.ty - 1.3 }, e.opaque ? 'FIREWALL: BLICKDICHT' : 'FIREWALL', TEAL, 15, 1500);
        say({ u: e.unit }, 'Zugriff verweigert. Nur für Rüther.', 2200);
        sfx.play('special');
        break;
      case 'raubkopie':
        burst(e.from.x, e.from.y, 12, { kind: 'spark', colors: [TEAL, PINK], speed: 60, up: 20, grav: 0, ms: 600, size: 1.4 });
        text({ x: e.from.x, y: e.from.y - 1 }, 'RAUBKOPIE', PINK, 15, 1500);
        say({ u: e.unit }, 'Die ist nicht ganz legal.', 2000);
        sfx.play('special');
        break;
      case 'vibra':
        for (const en of ens([e.enemy, e.second])) { ring(en.x, en.y, 1, TEAL, 500); ring(en.x, en.y, 1, TEAL, 500, 200); }
        sfx.play('tap');
        break;
      case 'credits':
        coinsFly(x, y - 0.3, e.tx, e.ty - 0.3, 5, 380);
        pop(fxArt('bags'), e.tx, e.ty - 0.8, { size: 26, ms: 1000, delay: 380 });
        if (e.spy) text({ e: e.enemy }, 'Spitzel!', LILAC, 15, 1600);
        say({ u: e.unit }, 'Unlimited Credits. Kauf dir was Schönes.', 2200);
        sfx.play('coin');
        break;
      case 'horde':
        burst(e.tx, e.ty, 16, { colors: [RED, GOLD, TEAL, '#3F8EF5'], speed: 70, up: 50, grav: 120, ms: 800, size: 3 });
        say({ u: e.unit }, 'Kinder! Da drüben gibt’s Eis!', 2000);
        sfx.play('rage');
        break;
      case 'sale':
        text({ x: e.tx, y: e.ty - 1.2 }, 'SALE!', RED, 18, 1500);
        say({ u: e.unit }, 'Alles muss raus!', 1800);
        sfx.play('coin');
        break;
      case 'feierabend':
        pop('art/q-box.png', e.tx, e.ty - 0.6, { size: 24, ms: 900 });
        text({ u: e.unit }, `Feierabend: noch ${e.charges}×`, PAPER, 12, 1600);
        sfx.play('quest');
        break;
    }
  }

  function endSequence(e) {
    closeMenu(); endAim(); closeMini(); closeCut();
    tut = -1; tutEl.classList.add('hidden'); msgEl.classList.add('hidden'); cardEl.classList.add('hidden');
    progress(true);
    const lift = e.result === 'success' && (e.reason === 'extract' || e.reason === 'time'); // Raub: Zeit um, Beute an Bord, sie hebt ab
    ending = { at: rt, lift, text: e.text, summary: e.summary, result: e.result, ready: false };
    if (e.reason === 'caught') return caughtScene(e);
    sfx.play(lift ? 'ufo' : e.result === 'success' ? 'win' : 'lose');
    const title = e.result === 'success' ? 'Geschafft!' : e.result === 'abort' ? 'Abgebrochen' : 'Gescheitert';
    later(() => {
      setText(stampEl.querySelector('b'), title);
      setText(stampEl.querySelector('p'), e.text);
      stampEl.className = `q-stamp ${e.result}`;
      ending.ready = true;
    }, lift ? 1500 : 400);
    later(finish, lift ? 4200 : 3400);
  }
  function finish() {
    if (!ending?.ready || ended) return;
    ended = true;
    let r = {
      ...ending.summary, text: ending.text, setup: st.setup, kieser: st.kieser, fine: st.fine,
      team: st.units.map(u => ({ id: u.id, name: u.name, rarity: u.rarity, level: u.level, hp: u.hp, maxHp: u.maxHp, down: u.down })),
    };
    if (remote()) r = cleanSummary(r); // Koop-Gast: Zahlen und Ergebnis kommen vom Host (Spec §0), der Ergebnis-Screen setzt sie in HTML
    stop();
    onEnd?.(r);
  }

  // ---------- Cutscenes (DOM-Overlay über dem Canvas, echte Gesichter); Tippen überspringt nach kurzer Sperre ----------
  function playCut(kind, html, ms, done) {
    const c = cut = { kind, done, at: performance.now(), closing: false };
    cutEl.className = `q-cut ${kind}`;
    cutEl.innerHTML = html;
    later(() => { if (cut === c) endCut(); }, ms); // eine früher weggetippte Szene beendet nicht die nächste
  }
  function endCut() {
    if (!cut || cut.closing) return;
    cut.closing = true;
    cut.done();
  }
  function closeCut() { cut = null; cutEl.className = 'q-cut hidden'; cutEl.innerHTML = ''; }
  cutEl.addEventListener('click', () => { if (cut && performance.now() - cut.at > 600) endCut(); });
  const frameFace = (u, cls = '', style = '') => `<span class="q-cut-face r-${esc(u.rarity)} ${cls}" style="${style}"><img src="${face(u.id)}" alt="${esc(short(u.id))}"><i></i></span>`;

  // Stefan zieht den Rüther am Kragen in den Kraftraum; danach Schnitt zurück zur Plattform (resume)
  function kieserScene(e) {
    closeMenu(); endAim(); closeMini();
    const u = st.units[e.unit], n = e.count, r = kieserReward(n), r0 = kieserReward(n - 1);
    const sub = r == null ? '' : r < r0 ? `−${fmt(r0 - r)} Sats` : `Belohnung bleibt bei ${fmt(r)}`;
    const says = (st.mission.texts?.kieser || KIESER_LINES).map(([who, t], k) => `<p class="q-cut-say ${who === 'bernd' ? 'boss' : 'hero'}" style="--d:${(0.8 + 1.6 * k).toFixed(1)}s">${esc(t)}</p>`).join('');
    sfx.play('rage'); haptic([60, 40, 60]);
    playCut('kieser', `<div class="q-cut-scene"><div class="q-cut-walk"><img class="q-cut-boss" src="art/boss-bernd.png" alt="${esc(ENEMY_TYPES.bernd.name)}"><i class="q-cut-rope"></i>${frameFace(u, 'dragged')}</div>${says}</div>`
      + `<div class="q-cut-stamp"><b>Kieser-Training #${n}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div><span class="q-cut-skip">Tippen zum Überspringen</span>`, 7000, () => { // 3 Zeilen à 1,6 s, Stempel bei 4,6 s, die letzte Zeile bleibt
      const mine = cut;
      cutEl.classList.add('black');
      if (remote()) return; // Koop-Gast: resume schickt nur der Host, die Szene schließt der nächste unpausierte Zustand (onSnapshot)
      // nur die eigene Szene schließen: erwischt Stefan (oder der Ranger) gleich nach dem Resume wieder, läuft schon die nächste,
      // und deren Ende (resume bzw. Abspann) bliebe sonst nie aus, die Quest stünde still
      later(() => { send({ type: 'resume' }); later(() => { if (cut === mine) closeCut(); }, 300); }, 240);
    });
  }

  // Ranger zückt den Block, das Team schaut betreten, Stempel mit der Strafe; danach Abspann (onEnd)
  function caughtScene(e) {
    const by = caught && st.enemies[caught.by], T = ENEMY_TYPES[by?.type] || ENEMY_TYPES.ranger, fine = e.fine || st.fine;
    sfx.play('lose');
    const team = st.units.map((u, k) => frameFace(u, 'sorry', `--k:${k}`)).join('');
    playCut('caught', `<div class="q-cut-scene"><img class="q-cut-ranger" src="art/${T.sprite}.png" alt="${esc(T.name)}"><div class="q-cut-pad"><i></i><i></i><i></i><i></i></div>`
      + `<p class="q-cut-say boss" style="--d:.6s">${esc(caught?.say || st.mission.texts?.caught || 'Das wird teuer!')}</p><div class="q-cut-team">${team}</div></div>`
      + `<div class="q-cut-stamp fail"><b>Erwischt!</b><span>−${fmt(fine)} Sats</span></div><span class="q-cut-skip">Tippen für weiter</span>`, 5200, () => { ending.ready = true; finish(); });
  }

  // ---------- Minikarte (Karten über 40 Kacheln Breite): Rüther, Ziele, bekannte Gegner, Kamera-Ausschnitt; Antippen springt hin ----------
  let miniBase = null;
  mapBtn.addEventListener('click', () => (mini ? closeMini() : openMini()));
  $('.q-mini-x').addEventListener('click', () => closeMini());
  miniEl.addEventListener('click', e => { if (e.target === miniEl) closeMini(); });
  miniCv.addEventListener('click', e => {
    if (!mini) return;
    const r = miniCv.getBoundingClientRect();
    follow = false;
    cam = { x: (e.clientX - r.left) / r.width * st.w * TILE, y: (e.clientY - r.top) / r.height * st.h * TILE };
    closeMini();
  });
  function openMini() {
    if (!st || st.over || cut || briefingOpen() || tut >= 0) return;
    closeMenu(); endAim();
    const s = Math.max(2, Math.floor(Math.min((vw - 40) / st.w, (vh - 110) / st.h)));
    if (miniBase?.s !== s) miniBase = { s, cv: paintMini(st, th, s) };
    miniCv.width = st.w * s * dpr; miniCv.height = st.h * s * dpr;
    miniCv.style.width = `${st.w * s}px`; miniCv.style.height = `${st.h * s}px`;
    mini = { was: paused };
    setPaused(true); // nicht hinterrücks erwischt werden, während man die Karte liest
    miniEl.classList.remove('hidden');
    drawMini();
  }
  function closeMini() {
    if (!mini) return;
    const was = mini.was;
    mini = null;
    miniEl.classList.add('hidden');
    setPaused(was);
  }
  function drawMini() {
    const s = miniBase.s, m = miniCv.getContext('2d'), box = (x, y, r, c) => { m.fillStyle = INK; m.fillRect(Math.round(x - r - 1), Math.round(y - r - 1), 2 * r + 2, 2 * r + 2); m.fillStyle = c; m.fillRect(Math.round(x - r), Math.round(y - r), 2 * r, 2 * r); };
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.imageSmoothingEnabled = false;
    m.drawImage(miniBase.cv, 0, 0);
    for (const o of st.objs) {
      if (o.kind === 'item' && o.taken && !o.delivered) continue;
      const open = o.kind === 'vault' ? o.coins > 0 : o.kind === 'item' ? !o.delivered : !o.done;
      box((o.x + 0.5) * s, (o.y + 0.5) * s, Math.max(3, Math.round(s * 0.7)), o.kind === 'tree' && o.done ? (Math.floor(rt / 220) % 2 ? RED : AMBER) : open ? GOLD : '#8a8f94');
    }
    for (const e of st.enemies) {
      if (!seenE.has(e.i) || e.gone) continue;
      const p = pos(e), T = ENEMY_TYPES[e.type], z = Math.max(14, s * 3), im = e.state === 'ko' ? variant(`art/${T.sprite}.png`, 'grey') : img(`art/${T.sprite}.png`);
      if (e.state === 'alert') box(p.x * s, p.y * s, Math.round(z / 2), RED);
      if (im) { m.imageSmoothingEnabled = true; m.drawImage(im, p.x * s - z / 2, p.y * s - z / 2, z, z); m.imageSmoothingEnabled = false; }
    }
    const hw = vw / 2 / zoom / TILE * s, hh = vh / 2 / zoom / TILE * s, cx = cam.x / TILE * s, cy = cam.y / TILE * s;
    m.strokeStyle = INK; m.lineWidth = 3; m.strokeRect(cx - hw, cy - hh, 2 * hw, 2 * hh);
    m.strokeStyle = PAPER; m.lineWidth = 1; m.strokeRect(cx - hw, cy - hh, 2 * hw, 2 * hh);
    for (const u of st.units) { const p = pos(u); faceFrame(m, img(face(u.id)), p.x * s, p.y * s, Math.max(16, s * 3.4), u.rarity, { grey: u.down, src: face(u.id) }); }
  }

  // ---------- Zeichnen ----------
  const CQ = CSS.supports('width', '1cqw'); // Container-Einheiten (fehlen auf iOS 15)
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = Math.round(r.width); vh = Math.round(r.height);
    if (!CQ) { stage.style.setProperty('--cw', `${r.width / 100}px`); stage.style.setProperty('--ch', `${r.height / 100}px`); } // 1 % der Bühne für die Cutscene (quest.css)
    const w = Math.round(vw * dpr), h = Math.round(vh * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(stage);

  function camera() {
    if (follow && sel.length) {
      let x = 0, y = 0;
      for (const i of sel) { const p = pos(st.units[i]); x += p.x; y += p.y; }
      const k = 1 - Math.exp(-frameDt / 160);
      cam.x += (x / sel.length * TILE - cam.x) * k; cam.y += (y / sel.length * TILE - cam.y) * k;
    }
    const W = st.w * TILE, H = st.h * TILE, hw = vw / 2 / zoom, hh = vh / 2 / zoom, m = 24;
    cam.x = W + 2 * m <= 2 * hw ? W / 2 : clamp(cam.x, hw - m, W + m - hw);
    cam.y = H + 2 * m <= 2 * hh ? H / 2 : clamp(cam.y, hh - m, H + m - hh);
  }

  function sprite(im, x, y, s, { rot = 0, flip = false, alpha = 1 } = {}) {
    if (!im) return;
    g.save();
    g.translate(Math.round(x), Math.round(y));
    if (rot) g.rotate(rot);
    if (flip) g.scale(-1, 1);
    if (alpha < 1) g.globalAlpha = alpha;
    g.imageSmoothingEnabled = s * zoom * dpr < (im.naturalWidth || im.width) * 0.9; // nur beim Verkleinern glätten
    g.drawImage(im, -s / 2, -s / 2, s, s);
    g.restore();
    g.imageSmoothingEnabled = false;
  }
  function shadow(x, y, w) {
    g.fillStyle = 'rgba(30,42,34,.32)';
    g.fillRect(Math.round(x - w / 2), Math.round(y - 2), Math.round(w), 4);
    g.fillRect(Math.round(x - w / 2 + 3), Math.round(y - 3), Math.round(w - 6), 6);
  }
  const label = (wx, wy, t, color = PAPER, size = 16) => labels.push({ wx, wy, t, color, size });

  function draw() {
    camera();
    labels = [];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = th.bg; g.fillRect(0, 0, cv.width, cv.height);
    const s = dpr * zoom;
    g.setTransform(s, 0, 0, s, Math.round(dpr * (vw / 2 - cam.x * zoom)), Math.round(dpr * (vh / 2 - cam.y * zoom)));
    g.imageSmoothingEnabled = false;
    const view = { x0: (cam.x - vw / 2 / zoom) / TILE - 1, y0: (cam.y - vh / 2 / zoom) / TILE - 1, x1: (cam.x + vw / 2 / zoom) / TILE + 1, y1: (cam.y + vh / 2 / zoom) / TILE + 1 };
    const inView = (x, y, m = 0) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    // nur den sichtbaren Ausschnitt der Offscreen-Karte kopieren (64×48-Karten auf dem Handy)
    const sx = clamp(Math.floor(view.x0 * TILE), 0, mapCv.width), sy = clamp(Math.floor(view.y0 * TILE), 0, mapCv.height);
    const sw = clamp(Math.ceil(view.x1 * TILE), 0, mapCv.width) - sx, sh = clamp(Math.ceil(view.y1 * TILE), 0, mapCv.height) - sy;
    if (sw > 0 && sh > 0) g.drawImage(mapCv, sx, sy, sw, sh, sx, sy, sw, sh);
    if (hasWater) drawWater(view);
    drawDoors(); drawObjs(); drawSaucer(); drawEffects(); drawCones(inView); drawPaths(); drawAim();
    // Würfe, Blitze, Ringe, Partikel unter den echten Gesichtern (§0); die Familientreffen-Helfer über den Effekten
    drawEnemies(inView); drawOverlay(); drawDecoys(); drawFx(); drawHelpers(); drawUnits();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScreen();
    placeMenu(); placeTut();
  }

  // Wellen-Glitzer auf sichtbaren Wasserkacheln (die Wasserfläche selbst liegt im Karten-Cache)
  function drawWater(v) {
    const x0 = Math.max(0, Math.floor(v.x0)), y0 = Math.max(0, Math.floor(v.y0)), x1 = Math.min(st.w - 1, Math.ceil(v.x1)), y1 = Math.min(st.h - 1, Math.ceil(v.y1));
    g.fillStyle = th.ql || PAPER;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (st.tiles[y * st.w + x] !== 'W') continue;
      const h = hash(x, y, 7), ph = (rt / 2400 + h * 5) % 1;
      if (h < 0.5 && ph < 0.55) g.fillRect(x * TILE + 4 + Math.floor(ph * 8) * 2, y * TILE + 6 + Math.floor(h * 36), 6, 2);
    }
  }

  function drawDoors() {
    for (const d of st.doors) {
      const k = !d.locked ? 1 : d.opening ? clamp(age(doorAt.get(d.id) ?? now()) / 900) : 0;
      drawDoor(g, th, d, doorH[d.id], k, d.locked, rt);
    }
  }

  function drawObjs() {
    for (const o of st.objs) {
      const x = (o.x + 0.5) * TILE, y = (o.y + 0.5) * TILE;
      if (o.kind === 'vault') {
        shadow(x, y + 13, 26);
        sprite(o.coins > 0 ? img('art/q-vault.png') : variant('art/q-vault.png', 'grey'), x, y - 1, 30);
        for (let k = 0; k < Math.min(o.coins, 5); k++) sprite(img('art/q-coin.png'), x + 11, y + 10 - k * 3, 10);
        if (o.coins > 0 && (rt / 1500 + o.id * 0.37) % 1 < 0.12) bitmap(g, 'spark', x + 7, y - 11, 1, PAPER);
      } else if (o.kind === 'sabotage') {
        shadow(x, y + 12, 26);
        sprite(o.done ? variant('art/q-saucer.png', 'tint', INK, 0.5) : img('art/q-saucer.png'), x, y - 2, 30, { rot: o.done ? 0.35 : 0 });
        if (o.done) for (let k = 0; k < 3; k++) {
          const ph = (gt / 1400 + k / 3) % 1, sz = 3 + ph * 6;
          g.globalAlpha = 0.7 * (1 - ph); g.fillStyle = k % 2 ? '#6a6a6a' : '#4a4a4a';
          g.fillRect(Math.round(x - sz / 2 + Math.sin(ph * 6 + k) * 3), Math.round(y - 8 - ph * 22), Math.round(sz), Math.round(sz));
        }
        g.globalAlpha = 1;
      } else if (o.kind === 'plug') {
        if (!o.done) { const p = (Math.sin(rt / 220) + 1) / 2; g.fillStyle = `rgba(224,99,76,${0.18 + 0.2 * p})`; g.fillRect(x - 18, y - 18, 36, 36); }
        sprite(img('art/q-plug.png'), x + (o.done ? -5 : 0), y + (o.done ? 4 : 0), 28, { rot: o.done ? -0.5 : 0 });
        if (!o.done && Math.floor(rt / 140) % 4 === 0) bitmap(g, 'spark', x + 9, y - 9, 1, GOLD);
      } else if (o.kind === 'item' && !o.taken) {
        g.fillStyle = INK; g.fillRect(x - 15, y - 15, 30, 30);
        g.fillStyle = '#E8D7A8'; g.fillRect(x - 13, y - 13, 26, 26); // helle Gitterbox, damit die schwarze PS3 sichtbar ist
        sprite(img('art/q-ps3.png'), x, y - 1 + Math.sin(rt / 300) * 1, 26);
        if ((rt / 1300) % 1 < 0.12) bitmap(g, 'spark', x + 8, y - 9, 1, GOLD);
      } else if (o.kind === 'item' && o.delivered) sprite(img('art/q-ps3.png'), x, y, 22);
      else if (o.kind === 'valve') {
        // sprudelt, bis er zu ist; dann versiegt die Fontäne in 1,6 s und die Pfütze trocknet
        const k = o.done ? clamp(age(valveAt.get(o.id) ?? -1e9) / 1600) : 0, busy = st.units.some(u => u.busy?.obj === o.id);
        if (k < 1) { g.globalAlpha = 0.6 * (1 - k); g.fillStyle = '#5c9fcf'; g.fillRect(x - 13, y + 9, 26, 5); g.fillRect(x - 8, y + 7, 16, 9); g.globalAlpha = 1; }
        shadow(x, y + 13, 18);
        sprite(o.done ? variant('art/q-valve.png', 'tint', INK, 0.25) : img('art/q-valve.png'), x, y - 3, 30);
        if (busy) { // Handrad dreht sich
          const a = gt / 90;
          g.strokeStyle = PAPER; g.lineWidth = 2; g.beginPath();
          for (const q of [0, Math.PI / 2]) { g.moveTo(x + Math.cos(a + q) * 6, y - 12 + Math.sin(a + q) * 2.5); g.lineTo(x - Math.cos(a + q) * 6, y - 12 - Math.sin(a + q) * 2.5); }
          g.stroke();
        }
        fountain(g, x + 6, y - 1, rt, busy ? 0.6 : 1 - k);
      } else if (o.kind === 'tree') {
        // brennt dauerhaft: Krone verkohlt in 3 Stufen, Flammen, Rauchsäule, Funken; beim Anzünden ein Flämmchen am Stamm
        const a = o.done ? age(o.litAt) : 0, burnt = o.done ? Math.min(3, 1 + Math.floor(a / 4000)) : 0, lit = st.units.find(u => u.busy?.obj === o.id);
        shadow(x, y + 13, 28);
        sprite(burnt ? variant('art/q-tree.png', 'tint', '#2a1a10', burnt * 0.15) : img('art/q-tree.png'), x, y - 8, 44);
        if (o.done) { smoke(g, x, y - 26, gt, clamp(a / 800)); flames(g, x, y - 10, gt, clamp(a / 500)); }
        else if ((rt / 1700 + o.id * 0.41) % 1 < 0.14) bitmap(g, 'spark', x + 11, y - 22, 1, GOLD);
        if (lit) flames(g, x, y + 10, gt, 0.3 + 0.5 * lit.busy.t / lit.busy.ms, 3, 12);
      }
    }
  }

  function drawSaucer() {
    if (!pad) return;
    let lift = 0, sc = 1, beam = 0.22 + 0.06 * Math.sin(rt / 260);
    if (ending?.lift) { const k = clamp((rt - ending.at - 900) / 1600); lift = k * k * 700; sc = 1 - 0.25 * k; beam = k > 0 ? 0 : 0.55; }
    const x = pad.x * TILE, top = pad.y0 * TILE, bottom = pad.y1 * TILE, y = top - 22 + Math.sin(rt / 420) * 2 - lift;
    const b = img('art/fx-tractor-beam.png');
    if (b && beam > 0) { g.globalAlpha = beam; g.drawImage(b, x - 34, y + 10, 68, bottom - y - 10); g.globalAlpha = 1; }
    if (!lift) shadow(x, bottom - 6, 44);
    sprite(img('art/fx-haunebu.png'), x, y, 78 * sc);
  }

  // Platzierte Objekte am Boden (unter den Figuren); Deo-Nebel und Kinderhorde liegen darüber (drawOverlay)
  function drawEffects() {
    for (const f of st.effects) {
      const kin = clamp(age(f.until - (f.ms || 0)) / 600), kout = clamp((f.until - gt) / 800);
      if (f.kind === 'gas') {
        const kin = clamp(age(f.until - f.ms) / 700), kout = clamp((f.until - gt) / 900);
        g.fillStyle = gasPat;
        g.globalAlpha = 0.92 * kout;
        g.beginPath(); g.arc(f.x * TILE, f.y * TILE, (0.3 + 0.7 * kin) * (36 + 3 * Math.sin(gt / 400)), 0, 2 * Math.PI); g.fill();
        for (const t of f.tiles) for (let k = 0; k < 3; k++) { // Wolke quillt auf und wabert: überlappende Blasen je Kachel
          const ph = gt / 520 + k * 2.1 + t.x * 1.3 + t.y * 0.7;
          const r = (14 + 3 * Math.sin(ph * 2)) * (k ? 0.85 : 1.1) * (0.3 + 0.7 * kin);
          g.beginPath(); g.arc((t.x + 0.5 + Math.cos(ph) * 0.2) * TILE, (t.y + 0.5 + Math.sin(ph * 1.3) * 0.2) * TILE, r, 0, 2 * Math.PI); g.fill();
        }
        g.fillStyle = '#9BE36B';
        for (let k = 0; k < 8; k++) { // aufsteigende Stinkpixel
          const ph = (gt / 1500 + hash(f.id, k)) % 1;
          g.globalAlpha = (1 - ph) * kout * kin;
          g.fillRect(Math.round((f.x + (hash(f.id, k, 1) - 0.5) * 2.6) * TILE + Math.sin(ph * 9) * 3), Math.round((f.y + 0.6) * TILE - ph * 46), 2, 2);
        }
        g.globalAlpha = 1;
      } else if (f.kind === 'mms') {
        const k = clamp(age(effAt.get(f.id) ?? now()) / 350), n = f.portions > 1 ? 18 : 12;
        for (let j = 0; j < n; j++) {
          const a = hash(f.id, j) * 2 * Math.PI, d = (3 + hash(f.id, j, 2) * (n > 12 ? 13 : 10)) * k;
          g.fillStyle = INK; g.fillRect(Math.round(f.x * TILE + Math.cos(a) * d) - 2, Math.round(f.y * TILE + Math.sin(a) * d) - 2, 5, 5);
          g.fillStyle = MMS[j % MMS.length]; g.fillRect(Math.round(f.x * TILE + Math.cos(a) * d) - 2, Math.round(f.y * TILE + Math.sin(a) * d) - 2, 4, 4);
        }
      } else if (f.kind === 'wlan') drawWlan(f, kin * kout, kout);
      else if (f.kind === 'puddle') { g.globalAlpha = kout; puddle(g, f.x * TILE, f.y * TILE + 6, gt, kin); g.globalAlpha = 1; }
      else if (f.kind === 'phone') drawPhoneFx(f, kout);
      else if (f.kind === 'sale') drawSign(f, kin, kout);
      else if (f.kind === 'firewall') drawFirewall(f, kin, kout);
    }
  }
  const rectPx = f => ({ x: f.x0 * TILE, y: f.y0 * TILE, w: (f.x1 - f.x0 + 1) * TILE, h: (f.y1 - f.y0 + 1) * TILE });
  // WLAN-Störung: dunkle Zone mit Rauschen, Wellen aus der Mitte, gestörtes WLAN-Symbol; Funkloch beschriftet
  function drawWlan(f, a, kout) {
    const r = rectPx(f), fr = Math.floor(gt / 120);
    g.globalAlpha = 0.38 * a; g.fillStyle = INK; g.fillRect(r.x, r.y, r.w, r.h);
    g.globalAlpha = 0.6 * a; g.fillStyle = '#0d1626';
    for (let k = 0; k < 18; k++) g.fillRect(Math.round(r.x + hash(fr, k, f.id) * (r.w - 4)), Math.round(r.y + hash(fr, k, f.id + 1) * (r.h - 4)), 4, 2);
    g.strokeStyle = TEAL; g.lineWidth = 2;
    for (let k = 0; k < 2; k++) { const ph = (gt / 1400 + k / 2) % 1; g.globalAlpha = (1 - ph) * 0.7 * a; g.beginPath(); g.arc(f.x * TILE, f.y * TILE, 6 + ph * r.w / 2, 0, 2 * Math.PI); g.stroke(); }
    g.globalAlpha = 0.85 * kout; g.setLineDash([4, 4]); g.lineDashOffset = -gt / 80; g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); g.setLineDash([]);
    g.globalAlpha = kout; wifi(g, f.x * TILE, f.y * TILE + 4, gt);
    g.globalAlpha = 1;
    if (f.funkloch) label(f.x * TILE, r.y - 8, 'FUNKLOCH', AMBER, 12);
  }
  // Kurs-Alarm: Handy mit Chart am Boden, grüner Puls, wechselnde Kurse
  function drawPhoneFx(f, kout) {
    const x = f.x * TILE, y = f.y * TILE, ph = (gt / 900) % 1;
    g.globalAlpha = (1 - ph) * 0.7 * kout; g.strokeStyle = GREEN; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 8 + ph * 22, 0, 2 * Math.PI); g.stroke();
    g.globalAlpha = 1;
    shadow(x, y + 9, 18);
    sprite(img('art/q-phone.png'), x, y - 2 + Math.round(Math.sin(rt / 200)), 24, { alpha: kout });
    if ((gt / 800) % 1 < 0.55) label(x, y - 22, KURS[Math.floor(gt / 800) % KURS.length], GREEN, 12);
  }
  // Sale-Schild mit Wirkkreis
  function drawSign(f, kin, kout) {
    const x = f.x * TILE, y = f.y * TILE;
    g.globalAlpha = 0.4 * kout; g.setLineDash([3, 5]); g.strokeStyle = GOLD; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, f.r * TILE, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    shadow(x, y + 13, 24);
    sprite(img('art/q-sign.png'), x, y - 4, 34 * (0.5 + 0.5 * kin), { rot: Math.sin(gt / 500) * 0.05, alpha: kout });
    if (Math.floor(rt / 300) % 3 === 0) bitmap(g, 'spark', x + 13, y - 18, 1, GOLD);
  }
  // Firewall: Flammen-Pixel in Blau-Teal je Kachel, Schild in der Mitte; blickdicht (Stufe 3) mit dunklem Grund
  function drawFirewall(f, kin, kout) {
    for (const t of f.tiles) {
      const tx = t.x * TILE, ty = t.y * TILE;
      g.globalAlpha = (f.opaque ? 0.65 : 0.3) * kin * kout; g.fillStyle = '#123247'; g.fillRect(tx, ty, TILE, TILE);
      g.globalAlpha = kout; g.fillStyle = INK; g.fillRect(tx + 1, ty + TILE - 9, TILE - 2, 6); g.fillStyle = '#1F5E8A'; g.fillRect(tx + 2, ty + TILE - 8, TILE - 4, 4);
      flames(g, tx + TILE / 2, ty + TILE - 6, gt + t.x * 137 + t.y * 71, kin * (f.opaque ? 1.35 : 1.15), 4, 26, BLUE_FIRE);
    }
    g.globalAlpha = 1;
    sprite(img('art/ab-firewall.png'), f.x * TILE, f.y * TILE - 10 + Math.sin(gt / 300) * 2, 28 * kin, { alpha: kout });
  }
  // Über den Gegnern, unter den Rüthern (echte Gesichter bleiben frei): rosa Deo-Nebel, Kinderhorde
  function drawOverlay() {
    for (const f of st.effects) {
      const kin = clamp(age(f.until - (f.ms || 0)) / 700), kout = clamp((f.until - gt) / 900);
      if (f.kind === 'deo') {
        const land = effAt.get(f.id) ?? f.until - f.ms, kd = clamp(age(land) / 700);
        if (gt < land) continue;
        g.fillStyle = deoPat; g.globalAlpha = 0.9 * kout;
        for (const t of f.tiles) for (let k = 0; k < 2; k++) {
          const ph = gt / 700 + k * 2.4 + t.x * 1.1 + t.y * 0.6, r = (19 + 3 * Math.sin(ph * 1.7)) * (0.25 + 0.75 * kd);
          g.beginPath(); g.arc((t.x + 0.5 + Math.cos(ph) * 0.18) * TILE, (t.y + 0.5 + Math.sin(ph * 1.2) * 0.18) * TILE, r, 0, 2 * Math.PI); g.fill();
        }
        g.fillStyle = '#FFE3F2'; // Duft-Glitzer
        for (let k = 0; k < 10; k++) {
          const ph = (gt / 1700 + hash(f.id, k)) % 1;
          g.globalAlpha = (1 - ph) * kout * kd;
          g.fillRect(Math.round((f.x + (hash(f.id, k, 1) - 0.5) * (f.x1 - f.x0 + 1)) * TILE), Math.round((f.y + 0.4) * TILE - ph * 50), 2, 2);
        }
        g.globalAlpha = 1;
      } else if (f.kind === 'horde') drawHorde(f, kin, kout);
    }
  }
  // Trollkids: Gruppen rennen von außen herein und toben im Quadrat herum, Konfetti; Stufe 3 zieht mit
  function drawHorde(f, kin, kout) {
    const p = pos(f), W = (2 * f.half + 1) * TILE, cx = p.x * TILE, cy = p.y * TILE, kid = img('art/q-kids.png');
    g.globalAlpha = 0.5 * kout; g.setLineDash([5, 4]); g.lineDashOffset = -gt / 60; g.strokeStyle = AMBER; g.lineWidth = 2;
    g.strokeRect(cx - W / 2, cy - W / 2, W, W); g.setLineDash([]); g.globalAlpha = 1;
    for (let k = 0; k < 5; k++) {
      const a = gt / (600 + k * 70) + k * 2.1, run = (1 - kin) * (k % 2 ? 1 : -1) * W;
      const kx = cx + (hash(f.id, k) - 0.5) * (W - 30) * kin + Math.cos(a) * 9 + run, ky = cy + (hash(f.id, k, 1) - 0.5) * (W - 30) * kin + Math.sin(a * 1.3) * 6;
      shadow(kx, ky + 12, 18);
      sprite(kid, kx, ky - Math.abs(Math.sin(gt / 110 + k)) * 4, 28, { flip: Math.cos(a) < 0, alpha: kout });
    }
    for (let k = 0; k < 8; k++) {
      const ph = (gt / 900 + hash(f.id, k, 2)) % 1;
      g.globalAlpha = (1 - ph) * kout; g.fillStyle = [RED, GOLD, TEAL, '#3F8EF5'][k % 4];
      g.fillRect(Math.round(cx + (hash(f.id, k, 3) - 0.5) * W), Math.round(cy - W / 4 - ph * 30), 3, 3);
    }
    g.globalAlpha = 1;
  }
  // Raubkopie: das echte Gesicht des gewählten Teammitglieds, halbtransparent und geglitcht (vor den echten Rüthern gezeichnet)
  function drawDecoys() {
    for (const f of st.effects) {
      if (f.kind !== 'decoy') continue;
      const p = pos(f), k = clamp(age(f.until - f.ms) / 400) * clamp((f.until - gt) / 500), x = p.x * TILE, y = p.y * TILE, src = face(f.face);
      shadow(x, y + 13, 22);
      glitchFace(g, img(src), x, y - 2 - (p.moved ? Math.abs(Math.sin(gt / 105)) * 3 : 0), 28, st.units[f.faceUnit]?.rarity || 'normal', gt, k, src);
    }
  }

  // Sichtkegel aller Gegner schwach, der angetippte deutlich; grün Patrouille, gelb misstrauisch, rot alarmiert
  function drawCones(inView) {
    const strongE = inspect && rt < inspect.until ? inspect.e : -1;
    for (const e of st.enemies) {
      if (e.state === 'ko') continue;
      const p = pos(e), range = ENEMY_TYPES[e.type].sight * 1.3;
      if (!inView(p.x, p.y, range)) continue;
      // visibleCone mit der interpolierten Lage rechnen (kurz tauschen), damit der Kegel flüssig mitläuft
      const ox = e.x, oy = e.y, od = e.dir;
      e.x = p.x; e.y = p.y; e.dir = p.dir;
      const pts = visibleCone(st, e.i);
      e.x = ox; e.y = oy; e.dir = od;
      if (pts.length < 3) continue;
      const strong = e.i === strongE, c = e.state === 'alert' ? RED : e.state === 'patrol' ? th.cone || GREEN : GOLD, k2 = th.coneK || 1;
      g.beginPath();
      g.moveTo(pts[0].x * TILE, pts[0].y * TILE);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x * TILE, pts[k].y * TILE);
      g.closePath();
      g.fillStyle = c;
      g.globalAlpha = strong ? 0.4 : (e.state === 'alert' ? 0.26 : 0.15) * k2;
      g.fill();
      if (strong || k2 > 1) { g.globalAlpha = strong ? 0.9 : 0.45; g.strokeStyle = c; g.lineWidth = 1.5; g.stroke(); }
      g.globalAlpha = 1;
    }
  }

  function drawPaths() {
    for (const u of st.units) {
      if (u.down || !u.path.length) continue;
      const p = pos(u), on = sel.includes(u.i);
      g.globalAlpha = on ? 1 : 0.5;
      g.beginPath();
      g.moveTo(p.x * TILE, p.y * TILE);
      for (const n of u.path) g.lineTo((n.x + 0.5) * TILE, (n.y + 0.5) * TILE);
      g.setLineDash([5, 5]); g.lineDashOffset = -gt / 40;
      g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.strokeStyle = u.intent ? GOLD : PAPER; g.lineWidth = 2; g.stroke();
      g.setLineDash([]);
      const n = u.path[u.path.length - 1], x = (n.x + 0.5) * TILE, y = (n.y + 0.5) * TILE, k = 5 + Math.sin(rt / 160) * 1.5;
      g.fillStyle = INK; g.fillRect(x - k - 1, y - 1, 2 * k + 2, 3); g.fillRect(x - 1, y - k - 1, 3, 2 * k + 2);
      g.fillStyle = u.intent ? GOLD : PAPER; g.fillRect(x - k, y, 2 * k, 1); g.fillRect(x, y - k, 1, 2 * k);
      g.globalAlpha = 1;
    }
  }

  function circle(x, y, r, color, fill) {
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI);
    g.globalAlpha = fill; g.fillStyle = color; g.fill();
    g.globalAlpha = 0.9; g.setLineDash([6, 4]); g.lineDashOffset = -rt / 60; g.strokeStyle = color; g.lineWidth = 2; g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }
  function corners(x, y, on) { // leuchtendes Ziel: türkis = sofort, gelb = er läuft erst hin
    const k = 11 + Math.sin(rt / 140) * 2;
    g.fillStyle = INK;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(x + sx * k - 3, y + sy * k - 3, 6, 6);
    g.fillStyle = on ? TEAL : AMBER;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(x + sx * k - 2, y + sy * k - 2, 4, 4);
  }
  function ghost(r, color, txt, lx, ly) { // Vorschau einer Fläche (Wand, Horde)
    g.globalAlpha = 0.2; g.fillStyle = color; g.fillRect(r.x, r.y, r.w, r.h);
    g.globalAlpha = 0.9; g.setLineDash([5, 4]); g.lineDashOffset = -rt / 60; g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.setLineDash([]); g.globalAlpha = 1;
    if (txt) label(lx, ly, txt, color, 13);
  }
  // Wand für Punkt q und Richtung d wie rectEffect in der Engine (um die Kachel von q): Gas 3×5, Firewall len×1
  function dirRect(ab, q, d) {
    const [w, h] = ab.id === 'firewall' ? (d === 'v' ? [1, ab.len] : [ab.len, 1]) : d === 'v' ? [ab.w, ab.h] : [ab.h, ab.w];
    return { x: (Math.floor(q.x) - Math.floor(w / 2)) * TILE, y: (Math.floor(q.y) - Math.floor(h / 2)) * TILE, w: w * TILE, h: h * TILE };
  }
  // Zielmodus: Reichweitenkreis um den Rüther und leuchtende Ziele; nach der ersten Wahl deren Marke, zweiter Kreis bzw. Vorschau
  function drawAim() {
    if (!aim) return;
    const u = st.units[aim.unit];
    if (!u || u.down) return endAim();
    const { ab, first } = aim, T = ab.target, p = pos(u);
    if (!first) {
      const r = T === 'self' ? selfR(ab) : ab.range;
      if (Number.isFinite(r)) circle(p.x * TILE, p.y * TILE, r * TILE, TEAL, 0.08);
      if (ab.vaultRange) circle(p.x * TILE, p.y * TILE, ab.vaultRange * TILE, GOLD, 0.06);
      if (!(LIST.has(T) || T === 'self' || T === 'enemyThenPoint')) return;
      const ts = abilityTargets(st, aim.unit, ab.id), tps = ts.map(t => (t.enemy != null ? { ...pos(st.enemies[t.enemy]), on: t.inRange } : { ...t, on: t.inRange }));
      for (const t of tps) corners(t.x * TILE, t.y * TILE, t.on);
      if (ab.id === 'tratsch' && tps.length === 2) { // Treffpunkt der beiden Streithähne (auf ihrem Weg, wie in der Engine)
        const [a, b] = tps, m = tratschMeet(st, st.enemies[ts[0].enemy], st.enemies[ts[1].enemy]), mx = m.x * TILE, my = m.y * TILE;
        g.globalAlpha = 0.8; g.setLineDash([3, 5]); g.strokeStyle = AMBER; g.lineWidth = 2;
        g.beginPath(); g.moveTo(a.x * TILE, a.y * TILE); g.lineTo(mx, my); g.lineTo(b.x * TILE, b.y * TILE); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        bitmap(g, 'spark', mx, my, 1.4, AMBER);
        label(mx, my - 14, 'Treffpunkt', AMBER, 11);
      }
      return;
    }
    // Insider-Tipp: die gewählte Wache ist inzwischen betäubt, KO oder gekündigt: von vorn statt Schleife „Kein gültiges Ziel.“
    if (first.enemy != null && !abilityTargets(st, aim.unit, ab.id).some(t => t.enemy === first.enemy)) { aimStep(null); return msg('Die Wache ist weg. Neue Wache antippen.'); }
    const q = first.enemy != null ? pos(st.enemies[first.enemy]) : first, qx = q.x * TILE, qy = q.y * TILE;
    if (ab.range2) circle(qx, qy, ab.range2 * TILE, GOLD, 0.06);
    if (T === 'pointDir') {
      const h = dirRect(ab, q, 'h'), v = dirRect(ab, q, 'v');
      ghost(h, TEAL, 'quer', h.x + h.w + 18, qy);
      ghost(v, GOLD, 'längs', qx, v.y + v.h + 10);
    } else if (T === 'pointThenPoint') { const n = ab.size * TILE; ghost({ x: (Math.floor(q.x) + 0.5) * TILE - n / 2, y: (Math.floor(q.y) + 0.5) * TILE - n / 2, w: n, h: n }, AMBER); }
    else if (T === 'teammatePoint') { const t = st.units[aim.face], src = face(t.id); glitchFace(g, img(src), qx, qy - 2, 28, t.rarity, gt, 0.9, src); }
    corners(qx, qy, true);
  }

  const NO_STARS = new Set(['gas', 'argue', 'hack', 'wlan', 'lizenz']);
  function drawEnemies(inView) {
    for (const e of st.enemies) {
      if (e.gone) continue; // gekündigt: für die Mission weg
      const p = pos(e);
      if (!inView(p.x, p.y, 1)) continue;
      seenE.add(e.i);
      const T = ENEMY_TYPES[e.type], src = `art/${T.sprite}.png`, boss = T.sprite.startsWith('boss'), s = boss ? 36 : 30;
      const stun = e.state === 'stunned' ? e.reason : null, task = e.state === 'task' ? e.task : null;
      const hacked = stun === 'hack' || stun === 'wlan', ko = e.state === 'ko', buzz = !ko && e.buzzUntil > st.time;
      const shake = task && (task.kind === 'vibra' || task.kind === 'horde' || task.kind === 'panik');
      const jit = buzz || shake ? Math.floor(rt / 45) : 0; // koffeiniert, Handy brummt, Kinder zerren: Zittern
      const x = p.x * TILE + apart(e) + (jit ? Math.round((hash(jit, e.i) - 0.5) * 3) : 0), y = p.y * TILE + (jit ? Math.round((hash(jit, e.i, 1) - 0.5) * 2) : 0), ph = gt / 95 + e.i * 1.9;
      const fly = T.flying && !hacked && !ko, lift = fly ? 9 + Math.sin(rt / 260 + e.i) * 2 : 0;
      const lying = ko || stun === 'slip', doze = task?.kind === 'mittag';
      const walk = p.moved && !fly && !lying ? Math.sin(ph) * (e.type === 'pinguin' ? 0.2 : 0.1) : 0;
      if (e.melee) { // Nahkampf: roter Schadens-Indikator
        const k = Math.floor(rt / 140) % 2;
        g.globalAlpha = k ? 0.95 : 0.55; g.beginPath(); g.arc(x, y - 2, 18 + k, 0, 2 * Math.PI);
        g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.strokeStyle = RED; g.lineWidth = 3; g.stroke(); g.globalAlpha = 1;
      }
      shadow(x, y + 12, fly ? 16 : 22);
      if (buzz) { // Aura und gelbe Speed-Linien hinter ihm
        g.globalAlpha = Math.floor(rt / 120) % 2 ? 0.75 : 0.4; g.strokeStyle = GOLD; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y - 3, 18, 0, 2 * Math.PI); g.stroke(); g.globalAlpha = 1;
        if (p.moved) {
          const c = Math.cos(p.dir), sn = Math.sin(p.dir);
          g.beginPath();
          for (let k = -1; k <= 1; k++) { const d0 = 17 + (k & 1) * 4, ox = -sn * k * 7, oy = c * k * 7; g.moveTo(x - c * d0 + ox, y - 3 - sn * d0 + oy); g.lineTo(x - c * (d0 + 11) + ox, y - 3 - sn * (d0 + 11) + oy); }
          g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
        }
      }
      let im = img(src);
      if (ko || hacked) im = variant(src, 'grey');
      else if (e.state === 'eating' || stun === 'gas') im = variant(src, 'tint', '#5BB55A', 0.45);
      else if (stun === 'lizenz' && Math.floor(rt / 90) % 3 === 0) im = variant(src, 'tint', TEAL, 0.5);
      if ((flash.get(e) || 0) > gt) im = variant(src, 'tint', '#FFFFFF', 0.75);
      const left = Math.cos(p.dir) < 0;
      if (stun === 'slip') puddle(g, x, y + 8, gt, 0.9); // liegt in der Bierpfütze
      sprite(im, x, y - 3 - lift - (p.moved && !fly ? Math.abs(Math.sin(ph)) * 2 : 0), s, { rot: lying ? Math.PI / 2 : doze ? (left ? -0.35 : 0.35) : walk, flip: left !== FACE_LEFT.has(e.type) });
      const head = y - s / 2 - 6 - lift;
      const bounce = 1 + 0.5 * Math.max(0, 1 - age(popAt.get(e) ?? -1e9) / 250); // ? und ! hüpfen beim Wechsel
      if (e.melee) { const k = Math.floor(rt / 140) % 2; bitmap(g, 'spark', x + Math.cos(p.dir) * 17, y - 4 + Math.sin(p.dir) * 10, 1.2, k ? RED : GOLD); }
      if (e.state === 'coffee') { // Bulletproof Coffee: Becher an den Mund, Dampf, *schlürf*
        mug(g, x + (left ? -10 : 10), y - 9, rt);
        if ((rt / 1600 + e.i * 0.3) % 1 < 0.55) label(x, head - 4, '*schlürf*', PAPER, 12);
      }
      if (e.state === 'distracted' && e.reason === 'fire' && e.target) { // Ranger: hin zum Feuer, dort mit der Feuerpatsche draufhauen
        if (!e.path.length) {
          swatter(g, x + 3, y - 5, Math.atan2(e.target.y * TILE - y, e.target.x * TILE - x) - 0.5 + Math.abs(Math.sin(gt / 140)) * 1.1);
          if ((gt / 900 + e.i * 0.37) % 1 < 0.3) label(x, head - 2, 'PATSCH!', AMBER, 13);
        } else label(x, head - 2, '!', AMBER, 18);
      }
      if (ko && e.tied) { g.fillStyle = '#8a5a2b'; g.fillRect(x - 14, y - 6, 28, 3); g.fillRect(x - 14, y + 2, 28, 3); g.fillStyle = INK; g.fillRect(x - 2, y - 8, 4, 12); }
      if (ko) label(x, y - 16, 'KO', GOLD, 13);
      else if (stun && !NO_STARS.has(stun)) {
        for (let k = 0; k < 3; k++) { const a = rt / 260 + k * 2.09; bitmap(g, 'star', x + Math.cos(a) * 11, (lying ? y - 8 : head + 2) + Math.sin(a) * 3, 1, GOLD); }
      }
      if (hacked && Math.floor(rt / 110) % 3 === 0) bitmap(g, 'spark', x + 7, y - 8, 1, TEAL);
      if (stun === 'wlan' && blink(e, 1200, 0.5)) label(x, head, 'kein Netz', '#9AA0A6', 11);
      if (stun === 'lizenz') { label(x, head, '?', TEAL, 18); if (Math.floor(rt / 120) % 2) bitmap(g, 'spark', x - 9, y - 10, 1, PINK); }
      if (stun === 'argue') label(x, head, '…', PAPER, 18);
      if (stun === 'gas' && (gt / 1300 + e.i * 0.3) % 1 < 0.35) label(x + 10, head, '*hust*', '#9BE36B', 12);
      if (e.state === 'eating') { g.fillStyle = '#7FD36B'; for (let k = 0; k < 5; k++) g.fillRect(Math.round(x - 8 + k * 4), Math.round(head + Math.sin(rt / 120 + k) * 2), 3, 2); } // Pixel-Übelkeit
      if (e.state === 'bribed') { const sx = Math.abs(Math.cos(rt / 160)); const c = img('art/q-coin.png'); if (c) g.drawImage(c, x - 6 * sx, head - 8, 12 * sx, 12); }
      if (task) taskFx(e, task, x, y, head, left, bounce);
      moodFx(e, x, y, head);
      if (e.state === 'alert') label(x, head - 2, '!', RED, Math.round(22 * bounce));
      else if (e.state === 'suspicious' || e.state === 'investigate') label(x, head - 2, '?', GOLD, Math.round(20 * bounce));
      else if (e.state === 'distracted' && e.reason !== 'fire') label(x, head - 2, '?', PAPER, 16);
      if (e.suspicion > 0.02 && (SUS_BAR.has(e.state) || task?.cone)) bar(x, y + 15, 20, e.suspicion, GOLD);
      if (!ko && e.hp < e.maxHp) bar(x, y + 19, 20, e.hp / e.maxHp, RED);
      if (inspect?.e === e.i && rt < inspect.until) label(x, y + 30, e.name, PAPER, 13);
    }
  }
  // Tratsch: Streithähne auf derselben Stelle seitlich auseinander zeichnen, damit beide und die Blitze dazwischen zu sehen sind
  function apart(e) {
    const o = e.state === 'task' && e.task.kind === 'tratsch' ? st.enemies[e.task.pair] : null;
    if (!o) return 0;
    const a = pos(e), b = pos(o), d = Math.hypot(a.x - b.x, a.y - b.y);
    return d < 1.2 ? (e.i < o.i ? -1 : 1) * (1.2 - d) / 2 * TILE : 0;
  }
  const blink = (e, period, duty) => (gt / period + e.i * 0.37) % 1 < duty; // Spruch blitzt in Abständen auf
  // Verhalten aus Fähigkeiten über dem Gegner: Handys, Zzz, Schimpf-Blase, Streit-Blitze, Wegweiser, Karton …
  function taskFx(e, k, x, y, head, left, bounce) {
    const stay = k.phase === 'stay', hand = x + (left ? -11 : 11), own = ENEMY_TYPES[e.type].labels?.[k.kind]; // Stefan: eigene Beschriftung
    switch (k.kind) {
      case 'kursalarm': if (!stay) label(x, head - 2, '!', GREEN, 18); else if (blink(e, 1100, 0.45)) label(x, head - 2, 'Kurs!', GREEN, 12); break;
      case 'junge': {
        if (!stay) { label(x, head - 2, '!', AMBER, 18); break; }
        scold(g, x + (left ? 20 : -20), y - 12, gt); // Schimpf-Wolke neben ihm, die Blasen darüber gehören Hildegard
        const u = st.units[scolder.get(e.i)];
        if (u && !u.down && gt >= (chatAt.get(e.i) ?? 0)) { chatAt.set(e.i, gt + 2800); say({ u: u.i }, SCOLD[Math.floor(gt / 2800) % SCOLD.length], 2400); }
        break;
      }
      case 'mittag': for (let j = 0; j < 3; j++) { const ph = (gt / 1800 + j / 3) % 1; label(x + 8 + ph * 10, head - ph * 22, 'z', SKY, Math.round(9 + ph * 8)); } break;
      case 'tratsch': {
        if (!stay) { label(x, head - 2, '!', AMBER, 18); break; }
        const o = st.enemies[k.pair];
        if (o && e.i < o.i && o.state === 'task' && o.task.kind === 'tratsch' && o.task.phase === 'stay') { const q = pos(o); zigzag(g, x, y - 12, q.x * TILE + apart(o), q.y * TILE - 12, rt, GOLD, 6, 10); }
        if (gt >= (chatAt.get(e.i) ?? 0)) { chatAt.set(e.i, gt + 3400); say({ e: e.i }, QUARREL[(Math.floor(gt / 1700) + e.i) % QUARREL.length], 2200); }
        break;
      }
      case 'mutter': sprite(img('art/ab-mutter.png'), hand, y - 12, 16); if (blink(e, 1500, 0.4)) label(x, head - 2, 'Ja, Mama …', PAPER, 11); break;
      case 'crash': phone(g, hand, y - 6, false, gt); if (blink(e, 1200, 0.45)) label(x, head - 2, own || DEPOT[Math.floor(gt / 1200 + e.i) % DEPOT.length], own ? GOLD : RED, 12); break;
      case 'panik': drops(x + 10, head + 6, SKY); if (blink(e, 900, 0.5)) label(x, head - 2, own || 'VERKAUFEN!', RED, 12); break;
      case 'insider': if (!stay) signpost(x, y, k.to); else if (blink(e, 1400, 0.45)) label(x, head - 2, own || 'Freibier?', GOLD, 12); break;
      case 'vp': if (!stay && k.to) signpost(x, y, { x: k.to.x + 0.5, y: k.to.y + 0.5 }); break;
      case 'vibra': vibes(x, y - 6); phone(g, hand, y - 6, true, gt); if (blink(e, 700, 0.5)) label(x, head - 2, '*brrr*', TEAL, 12); break;
      case 'sale': label(x, head - 2, '%', GOLD, Math.round(18 * bounce)); break;
      case 'horde': if (blink(e, 1000, 0.5)) label(x, head - 2, 'Hilfe!', AMBER, 12); break;
      case 'raubkopie': label(x, head - 2, '!', AMBER, Math.round(20 * bounce)); break;
      case 'feierabend': sprite(img('art/q-box.png'), hand, y + 1, 18); if (blink(e, 1600, 0.4)) label(x, head - 2, 'Tschüss!', PAPER, 12); break;
    }
  }
  // Nachwirkungen: verheult, gereizt, brav, Spitzel-Auge, aufgedeckt
  function moodFx(e, x, y, head) {
    if (e.tearyUntil > st.time) { drops(x - 5, head + 12, SKY); if (blink(e, 1800, 0.35)) label(x, head - 14, '*schnief*', SKY, 11); }
    if (e.grumpyUntil > st.time) bitmap(g, 'vein', x + 11, head + 4, 1.2, RED);
    if (e.calmUntil > st.time && blink(e, 2200, 0.4)) label(x, head - 14, 'brav', TEAL, 11);
    if (e.state === 'bribed' && e.spyUntil > st.time) {
      eye(g, x, head - 12, rt);
      g.globalAlpha = 0.5; g.setLineDash([2, 5]); g.strokeStyle = LILAC; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, e.spyR * TILE, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
    if (e.revealed) {
      eye(g, x - 15, head + 4, rt, 1);
      g.globalAlpha = Math.floor(rt / 300) % 2 ? 0.9 : 0.5; g.setLineDash([3, 3]); g.strokeStyle = LILAC; g.lineWidth = 2;
      g.strokeRect(x - 17, y - 22, 34, 36); g.setLineDash([]); g.globalAlpha = 1;
    }
  }
  function drops(x, y, c) { // Tränen bzw. Schweiß
    for (let j = 0; j < 2; j++) {
      const ph = (gt / 700 + j / 2) % 1, dx = Math.round(x + j * 10), dy = Math.round(y + ph * 10);
      g.globalAlpha = 1 - ph; g.fillStyle = INK; g.fillRect(dx - 1, dy - 1, 4, 5); g.fillStyle = c; g.fillRect(dx, dy, 2, 3);
    }
    g.globalAlpha = 1;
  }
  function vibes(x, y) { // Vibrations-Wellen links und rechts
    const k = Math.floor(rt / 120) % 2;
    g.strokeStyle = TEAL; g.lineWidth = 2;
    for (const sd of [0, Math.PI]) for (let j = 0; j < 2; j++) { g.beginPath(); g.arc(x, y, 13 + j * 5 + k * 2, sd - 0.45, sd + 0.45); g.stroke(); }
  }
  // Wegweiser-Pfeil: gestrichelte Linie zum Ziel mit Pfeilspitze (Insider-Tipp, „Gehen Sie mal zum Tor!“)
  function signpost(x, y, to) {
    if (!to) return;
    const tx = to.x * TILE, ty = to.y * TILE, a = Math.atan2(ty - y, tx - x);
    g.globalAlpha = 0.85; g.setLineDash([4, 6]); g.lineDashOffset = -gt / 50;
    g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - Math.cos(a - 0.5) * 11, ty - Math.sin(a - 0.5) * 11); g.lineTo(tx - Math.cos(a + 0.5) * 11, ty - Math.sin(a + 0.5) * 11); g.closePath();
    g.fillStyle = GOLD; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  }

  function bar(x, y, w, k, color, h = 3) {
    g.fillStyle = INK; g.fillRect(Math.round(x - w / 2 - 1), Math.round(y - 1), w + 2, h + 2);
    g.fillStyle = '#E8D7A8'; g.fillRect(Math.round(x - w / 2), Math.round(y), w, h);
    g.fillStyle = color; g.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * clamp(k)), h);
  }

  function drawUnits() {
    for (const u of st.units) {
      const p = upos(u), x = p.x * TILE, y = p.y * TILE, on = sel.includes(u.i), src = face(u.id);
      const ph = gt / 105 + u.i * 1.7, moving = u.state === 'move' && p.moved;
      const bob = moving ? -Math.abs(Math.sin(ph)) * 3 : 0, tilt = moving ? Math.sin(ph) * 0.09 : 0;
      let rise = 0, alpha = 1;
      // an Bord ist, wer auf der Plattform steht oder liegt (wie questSummary), der Rest bleibt sichtbar zurück
      if (ending?.lift && st.tiles[Math.floor(u.y) * st.w + Math.floor(u.x)] === 'P') { const k = clamp((rt - ending.at) / 1000); rise = k * 46; alpha = 1 - k; }
      if (alpha <= 0) continue;
      shadow(x, y + 13, 22);
      if (on && !u.down) { // Auswahl: goldene Ecken, pulsierend
        const k = 18 + Math.sin(rt / 180) * 1.5;
        g.fillStyle = INK;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillRect(x + sx * k - (sx > 0 ? 6 : 0) - 1, y + sy * k - (sy > 0 ? 2 : 0) - 1 - 2, 8, 4); g.fillRect(x + sx * k - (sx > 0 ? 2 : 0) - 1, y + sy * k - (sy > 0 ? 6 : 0) - 1 - 2, 4, 8); }
        g.fillStyle = GOLD;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillRect(x + sx * k - (sx > 0 ? 6 : 0), y + sy * k - (sy > 0 ? 2 : 0) - 2, 6, 2); g.fillRect(x + sx * k - (sx > 0 ? 2 : 0), y + sy * k - (sy > 0 ? 6 : 0) - 2, 2, 6); }
      }
      g.save();
      g.globalAlpha = alpha;
      g.translate(Math.round(x), Math.round(y + bob - 2 - rise));
      g.rotate(u.down ? Math.PI / 2 : tilt);
      const vp = u.disguiseUntil > st.time && !u.down;
      if (vp) suit(g, 0, 0); // Vice President: Anzug unterm echten Gesicht
      faceFrame(g, img(src), 0, 0, 28, u.rarity, { grey: u.down, src });
      if ((flash.get(u) || 0) > gt) { g.fillStyle = 'rgba(224,99,76,.55)'; g.fillRect(-14, -14, 28, 28); }
      g.restore();
      const top = y - 22 + bob - rise;
      if (vp) for (let k = 0; k < 4; k++) { // Anzug-Glitzer links und rechts neben dem Gesicht
        const f = Math.floor(rt / 240) + k * 7, h = hash(f, u.i, k);
        if (h < 0.55) bitmap(g, 'spark', x + (k % 2 ? 1 : -1) * (18 + h * 8), y - 14 + hash(f, u.i, k + 9) * 30, 1, k % 2 ? GOLD : PAPER);
      }
      if (u.down) {
        const k = Math.sin(rt / 200) > 0;
        bitmap(g, 'plus', x + 15, y - 14, 1.6, INK); bitmap(g, 'plus', x + 15, y - 14, 1.2, k ? RED : '#F07A8A');
        for (let k2 = 0; k2 < 3; k2++) { const a = rt / 300 + k2 * 2.09; bitmap(g, 'star', x + Math.cos(a) * 12, y - 18 + Math.sin(a) * 3, 0.8, GOLD); }
      }
      if (u.busy) bar(x, top - 8, 34, u.busy.t / u.busy.ms, u.busy.kind === 'revive' ? TEAL : GOLD, 5); // Klau-/Sabotage-Fortschritt
      for (let k = 0; k < u.carry; k++) sprite(img('art/q-coin.png'), x - 6 + k * 12, top - 6 - (u.busy ? 10 : 0) - Math.abs(Math.sin(rt / 180 + k * 1.3)) * 4, 12);
      if (u.item) { g.fillStyle = INK; g.fillRect(x - 11, top - 23, 22, 20); g.fillStyle = '#E8D7A8'; g.fillRect(x - 10, top - 22, 20, 18); sprite(img('art/q-ps3.png'), x, top - 13 - Math.abs(Math.sin(rt / 220)) * 2, 18); }
    }
  }

  // Familientreffen-Helfer zur Spielzeit t: Weltpixel, fy = Gesichtsmitte (drawHelpers und die Ausweichliste in drawScreen)
  function helperAt(h, t) {
    const a = t - h.born, side = h.id === 'micha' ? 1 : -1, k = clamp(a / h.ms), e = 1 - (1 - k) ** 2;
    const x = h.x0 + (h.x1 - h.x0) * e + side * 13 * Math.min(1, k * 3), y = h.y0 + (h.y1 - h.y0) * e + side * 5;
    const bob = k < 1 ? -Math.abs(Math.sin(a / 70)) * 5 : -Math.abs(Math.sin(a / 140)) * 3;
    return { a, k, x, y, fy: y - 4 + bob, alpha: clamp((h.ms + 1400 - a) / 300) };
  }
  // Familientreffen: die echten Christian und Micha rennen vom Rand heran, fesseln und jubeln.
  // Sterne über der Wache rechts der Mitte und vor den Gesichtern: Christian steht links, Micha rechts tiefer, keiner liegt drunter
  function drawHelpers() {
    fx.helpers = fx.helpers.filter(h => gt - h.born < h.ms + 1400);
    const hs = fx.helpers.filter(h => gt >= h.born).map(h => ({ h, ...helperAt(h, gt) }));
    for (const { h, a, k, alpha } of hs) {
      const en = k >= 1 && st.enemies[h.enemy];
      if (!en) continue;
      const ep = pos(en);
      g.globalAlpha = alpha; bitmap(g, 'star', ep.x * TILE + 7 + Math.sin(a / 90) * 4, ep.y * TILE - 20, 1, GOLD);
    }
    for (const { h, x, y, fy, alpha } of hs) {
      g.globalAlpha = alpha;
      shadow(x, y + 12, 20);
      faceFrame(g, img(face(h.id)), x, fy, 24, 'normal');
    }
    g.globalAlpha = 1;
  }

  function drawFx() {
    const t = gt;
    fx.projs = fx.projs.filter(p => t - p.born < p.ms);
    for (const p of fx.projs) {
      const a = t - p.born;
      if (a < 0) continue;
      const end = p.to ? at(p.to) : { x: p.x1, y: p.y1 }; // Controller: fliegt der laufenden Wache hinterher
      const k = a / p.ms, x = p.x0 + (end.x - p.x0) * k, y = p.y0 + (end.y - p.y0) * k - Math.sin(Math.PI * k) * p.h;
      sprite(img(p.src), x, y, p.size, { rot: p.spin * k });
    }
    fx.sprites = fx.sprites.filter(p => t - p.born < p.ms);
    for (const p of fx.sprites) {
      const a = t - p.born;
      if (a < 0) continue;
      const k = a / p.ms, fade = clamp((1 - k) / 0.3);
      if (p.kind === 'rise') sprite(img(p.src), p.x, p.y - 34 * (1 - (1 - k) ** 3), p.size * (0.5 + 0.7 * Math.min(1, k * 3)), { alpha: fade });
      else if (p.kind === 'swing') sprite(img(p.src), p.x, p.y, p.size, { rot: -1.4 + 2.6 * Math.min(1, k * 1.6) });
      else sprite(img(p.src), p.x, p.y - k * 10, p.size * (k < 0.2 ? k / 0.2 * 1.2 : 1), { alpha: fade });
    }
    fx.parts = fx.parts.filter(p => t - p.born < p.ms);
    for (const p of fx.parts) {
      const a = (t - p.born) / 1000;
      if (a < 0) continue;
      const x = p.x + p.vx * a, y = p.y + p.vy * a + 0.5 * p.grav * a * a, fade = clamp((1 - a * 1000 / p.ms) / 0.35);
      g.globalAlpha = fade;
      if (p.kind === 'img') sprite(img(p.src), x, y, p.size);
      else if (p.kind === 'sq') { g.fillStyle = p.color; g.fillRect(Math.round(x), Math.round(y), p.size, p.size); }
      else bitmap(g, p.kind, x, y, p.size, p.color);
      g.globalAlpha = 1;
    }
    fx.rings = fx.rings.filter(r => t - r.born < r.ms);
    for (const r of fx.rings) {
      const a = t - r.born;
      if (a < 0) continue;
      const k = a / r.ms;
      g.globalAlpha = 1 - k; g.strokeStyle = INK; g.lineWidth = 4;
      g.beginPath(); g.arc(r.x, r.y, Math.max(1, r.r * (0.2 + 0.8 * k)), 0, 2 * Math.PI); g.stroke();
      g.strokeStyle = r.color; g.lineWidth = 2; g.stroke();
      g.globalAlpha = 1;
    }
    fx.bolts = fx.bolts.filter(b => t - b.born < b.ms);
    for (const b of fx.bolts) zigzag(g, b.x0, b.y0, b.x1, b.y1, rt, TEAL); // Hack-Blitz, Firewall
  }

  // Bildschirmraum: Beschriftungen, schwebende Texte, Sprechblasen (Schrift bleibt bei jedem Zoom gleich groß)
  function pixelText(t, x, y, color, size) {
    g.font = `700 ${size}px "Pixelify Sans", ui-monospace, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const hw = g.measureText(t).width / 2 + 4;
    x = clamp(x, hw, Math.max(hw, vw - hw)); // nicht über den Rand schreiben
    g.fillStyle = INK;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) g.fillText(t, x + dx, y + dy);
    g.fillStyle = color; g.fillText(t, x, y);
  }
  function drawScreen() {
    // nur Anker auf dem Schirm: sonst zöge pixelText/bubble Texte unsichtbarer Figuren an den Rand
    const vis = (s, m = 8) => s.x > -m && s.x < vw + m && s.y > -m && s.y < vh + m;
    const faces = st.units.map(u => { const p = upos(u), s = toScreen(p.x * TILE, p.y * TILE), r = 17 * zoom; return { i: u.i, down: u.down, x: s.x - r, y: s.y - r, w: 2 * r, h: 2 * r }; });
    for (const h of fx.helpers) { // die echten Christian und Micha vom Familientreffen: „KO“, „Gefesselt!“ und Blasen weichen auch ihnen aus
      if (gt < h.born) continue;
      const p = helperAt(h, gt), s = toScreen(p.x, p.fy), r = 14 * zoom;
      faces.push({ i: null, down: false, x: s.x - r, y: s.y - r, w: 2 * r, h: 2 * r });
    }
    for (const l of labels) { // Gegner-Beschriftungen rutschen über ein echtes Gesicht, statt es zu verdecken
      const s = toScreen(l.wx, l.wy);
      if (!vis(s)) continue;
      const hw = l.t.length * l.size * 0.3 + 2, hh = l.size / 2 + 2;
      let y = s.y;
      for (let n = 0; n < 4; n++) { // auch über mehrere übereinanderstehende Gesichter hinweg
        const f = faces.find(r => !r.down && s.x + hw > r.x && s.x - hw < r.x + r.w && y + hh > r.y && y - hh < r.y + r.h);
        if (!f) break;
        y = f.y - hh - 2;
      }
      pixelText(l.t, Math.round(s.x), Math.round(y), l.color, l.size);
    }
    fx.bubbles = fx.bubbles.filter(b => gt - b.born < b.ms);
    // Gesichter der Rüther freihalten: Blasen weichen ihnen nach oben aus
    const base = faces.filter(f => !f.down).map(({ x, y, w, h }) => ({ x, y, w, h })), nFaces = base.length, live = [];
    for (let k = fx.bubbles.length - 1; k >= 0; k--) { // neueste zuerst an ihren Platz, ältere weichen nach oben aus
      const b = fx.bubbles[k], p = at(b.ref), s = toScreen(p.x, p.y);
      if (gt < b.at) continue; // verzögerte Blase (Ventil-Text zuerst)
      if (s.x < -8 || s.x > vw + 8 || s.y < -8 || s.y > vh + 80) continue; // unten mehr Rand: die Blase sitzt über dem Kopf
      live.push({ b, s });
    }
    // zwei Durchgänge mit derselben Anordnung: erst alle Stiele, dann alle Kästen, damit kein Stiel durch eine Blase läuft
    let avoid = base;
    for (const phase of ['stem', 'box']) {
      avoid = base.slice();
      for (const { b, s } of live) bubble(g, s.x, s.y - 32 * zoom - 10, b.t, { vw, maxW: Math.min(170, vw - 40), avoid, head: s.y - 15 * zoom, phase });
    }
    // Schwebetexte weichen fremden Gesichtern und den Blasen nach oben aus
    const blocks = [...faces, ...avoid.slice(nFaces)];
    fx.texts = fx.texts.filter(t => gt - t.born < t.ms);
    for (const t of fx.texts) {
      const a = age(t.born), k = a / t.ms, p = at(t.ref), s = toScreen(p.x, p.y - (t.ref.u != null || t.ref.e != null ? 22 : 0));
      if (!vis(s)) continue;
      g.font = `700 ${t.size}px "Pixelify Sans", ui-monospace, monospace`;
      const hw = g.measureText(t.t).width / 2 + 2, hh = t.size / 2 + 2;
      let y = s.y - 30 * (1 - (1 - k) ** 2);
      for (let n = 0; n < 4; n++) {
        const f = blocks.find(r => (r.i == null || r.i !== t.ref.u) && s.x + hw > r.x && s.x - hw < r.x + r.w && y + hh > r.y && y - hh < r.y + r.h);
        if (!f) break;
        y = f.y - hh - 2;
      }
      g.globalAlpha = clamp((1 - k) / 0.35);
      pixelText(t.t, Math.round(s.x), Math.round(y), t.color, t.size);
      g.globalAlpha = 1;
      blocks.push({ x: s.x - hw, y: y - hh, w: 2 * hw, h: 2 * hh }); // gleichzeitige Texte am selben Anker stapeln sich
    }
  }

  // Zielleiste oben oder unten: auf die Seite, wo im Streifen der Leiste (Höhe + Abstand + halbe Zielmarke) weniger Ziele liegen
  // (Liste: leuchtende Ziele, sonst Mitte und Rand des Reichweitenkreises; dazu die Gesichter der Teamkameraden, §0);
  // Gleichstand: unten, wenn der Rüther oben im Bild steht.
  // Höhe je Schritt nur wachsend gemerkt: oben/unten ändert die Breite, sonst kippte die Wahl hin und her
  function placeAim() {
    const { ab, first } = aim, T = ab.target, me = upos(st.units[aim.unit]), sp = q => toScreen(q.x * TILE, q.y * TILE), pts = [sp(me)];
    for (const o of st.units) if (o.i !== aim.unit && !o.down) pts.push(sp(upos(o)));
    if (!first && (LIST.has(T) || T === 'enemyThenPoint')) {
      const ts = abilityTargets(st, aim.unit, ab.id), near = ts.filter(t => t.inRange);
      for (const t of near.length ? near : ts) pts.push(sp(t.enemy != null ? pos(st.enemies[t.enemy]) : t));
    } else {
      const c = sp(first ? (first.enemy != null ? pos(st.enemies[first.enemy]) : first) : me), r = (first ? ab.range2 : T === 'self' ? selfR(ab) : ab.range) * TILE * zoom;
      pts.push(c);
      if (Number.isFinite(r)) for (const k of [-1, -0.5, 0.5, 1]) pts.push({ x: c.x, y: c.y + k * r });
    }
    const h = aim.h = Math.max(aim.h || 0, aimEl.offsetHeight + 28), on = pts.filter(q => q.x >= 0 && q.x <= vw);
    const top = on.filter(q => q.y >= 0 && q.y < h).length, low = on.filter(q => q.y > vh - h && q.y <= vh).length;
    aimEl.classList.toggle('low', top !== low ? top > low : pts[0].y < vh * 0.45);
  }
  // Tutorial „Tipp auf den Boden“: Box unten (die Kamera stellt das Team in die Mitte); steht es dort, weil die Kamera am
  // Kartenrand hängt, kommt die Box nach oben (§0). Bei offener Zielleiste weg: die hat ihren eigenen Hinweis, und die Box
  // läge sonst über „Los!“/„Abbrechen“ (320×568)
  function placeTut() {
    if (tut < 0 || TUT[tut].at !== 'stage') return;
    if (tutEl.classList.toggle('hidden', !!aim)) return;
    const h = tutEl.offsetHeight + 14 + 18 * zoom, ys = st.units.map(u => toScreen(0, upos(u).y * TILE).y);
    tutEl.classList.toggle('top', ys.filter(y => y > vh - h).length > ys.filter(y => y < h).length);
  }
  function placeMenu() {
    if (aim) placeAim();
    if (menuFor < 0) return;
    const p = upos(st.units[menuFor]), s = toScreen(p.x * TILE, p.y * TILE), four = abs[menuFor].length >= 3;
    // kein echtes Gesicht (Teamkameraden, auch das eigene am Rand) unter Symbolen oder Namen (§0): sonst die Seitenplätze
    // weiter raus bzw. den Ring etwas runter oder hoch; passt nichts, bleibt er normal
    const r = 15 * zoom, fs = st.units.map(o => { const q = upos(o), c = toScreen(q.x * TILE, q.y * TILE); return { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r }; });
    let pick = null;
    for (const W of RING_W) for (const dy of [0, 40, -40, 80]) {
      const x = clamp(s.x, W + 52, vw - W - 52), y = clamp(s.y + dy, RING_UP + 106, vh - (four ? 124 : 104)); // oben: Symbol, Punkte, zweizeiliger Name
      const hit = ringBox.some(b => { const bx = x + b.x + b.sd * (W - RING_W[0]), by = y + b.y; return fs.some(f => bx < f.x + f.w && bx + b.w > f.x && by < f.y + f.h && by + b.h > f.y); });
      pick ||= { W, x, y };
      if (!hit) { pick = { W, x, y }; break; }
    }
    if (pick.W !== ringW) { ringW = pick.W; for (const b of ringEl.children) if (+b.dataset.sd) b.style.left = `${b.dataset.sd * ringW}px`; }
    ringEl.style.transform = `translate(${Math.round(pick.x)}px, ${Math.round(pick.y)}px)`;
  }

  // ---------- Schleife ----------
  function frame(ts) {
    if (!running) return;
    rt = ts;
    const real = Math.min(MAX_CATCHUP, lastTs ? Math.max(0, ts - lastTs) : 16);
    lastTs = ts; frameDt = real;
    if (remote()) { acc += real; if (st.over) overClock += real; watchHost(); } // Koop-Gast: keine Logik, nur Interpolation bis zum nächsten qs
    else if (!st.over && !paused) {
      acc += real;
      while (acc >= STEP && !st.over) { snap(); feed(tick(st, STEP)); acc -= STEP; }
    } else if (st.over) overClock += real;
    if (!st.over && !paused && !warned && st.timeLimit != null && st.timeLimit - st.time <= 60_000) { warned = true; msg('Noch 1 Minute!'); sfx.play('warn'); }
    gt = Math.max(0, st.time - istep() + (remote() ? Math.min(acc, istep()) : acc) + overClock);
    if (vw && vh) draw();
    hud();
    progress();
    raf = requestAnimationFrame(frame);
  }

  // Zwischenstand fürs Rennen (§5): höchstens 1× pro s, beim Ende sofort (force)
  function progress(force = false) {
    if (!onProgress || !st || (!force && (st.over || rt - progAt < RACE.PROGRESS_MS))) return;
    progAt = rt;
    const o = st.objective;
    onProgress({ done: o.done, total: o.total, min: o.min, timeMs: st.time, alarm: Math.round(st.alarm * 100) / 100, over: st.over, result: st.result });
  }

  // Rennen: Chip mit dem echten Gesicht des Gegners und seinem Stand. r: { name, avatar, done, total, over, result, lost? } | null
  function setRival(r) {
    if (!isObj(r)) return rivalEl.classList.add('hidden');
    const n = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    const id = typeof r.avatar === 'string' && RUETHER_BY_ID[r.avatar] ? r.avatar : null, im = rivalEl.querySelector('img');
    im.classList.toggle('hidden', !id);
    if (id && !im.src.endsWith(face(id))) im.src = face(id);
    setText(rivalEl.querySelector('.q-rival-name'), String(r.name ?? '').slice(0, 24));
    const o = st?.objective, steal = o?.type === 'steal', done = n(r.done); // dieselbe Mission: Raub zählt wie hud() gegen min
    const goal = steal && done >= o.min ? `${done}` : `${done}/${steal ? o.min : n(r.total)}`;
    setText(rivalEl.querySelector('.q-rival-n'), r.lost ? 'Verbindung weg' : r.over ? (r.result === 'success' ? 'fertig' : 'gescheitert') : goal);
    rivalEl.classList.toggle('done', !r.lost && !!r.over && r.result === 'success');
    rivalEl.classList.toggle('lost', !!r.lost);
    rivalEl.classList.remove('hidden');
  }

  // ---------- v11 Koop: Netz ----------
  function flush() { // Host → Gast: voller Schnappschuss, Events seit dem letzten qs; nach dem Ende wiederholt er das end-Event
    if (!hosting() || !st) return;
    const ev = coop.out.length ? coop.out : st.over && coop.endEv ? [coop.endEv] : [];
    coop.endEv ||= ev.find(e => e.type === 'end') || null;
    coop.out = [];
    coop.link.send({ t: 'qs', s: questSnapshot(st), ev: packEvents(ev), p: paused });
  }
  function sendQr() { coop.qrAt = performance.now(); coop.link.send({ t: 'qr' }); }
  function linkUp() {
    const L = coop.link, on = (type, fn) => { const off = L.on?.(type, fn); if (typeof off === 'function') coop.offs.push(off); };
    on('message', onMsg);
    on('lost', () => partnerAway(true));
    on('connected', e => { if (e?.again) partnerAway(false); });
    on('disconnected', () => partnerLeft());
    coop.qsAt = performance.now();
    if (L.state !== 'connected' && L.state !== 'lost') return partnerLeft(); // schon weg, während die Bilder luden (disconnected verpasst)
    if (hosting()) coop.timer = setInterval(flush, COOP.SEND_MS); // auch in der Pause: Echtzeit, nicht rAF
    else sendQr();
  }
  // Gast: Der Host schickt qs alle 200 ms, auch in der Pause. Steht die Verbindung, aber es kommt nichts mehr (Host hat in einer
  // Funkstille beendet und den Screen verlassen), endet die Quest wie bei 'disconnected'. Vor dem ersten qs lädt der Host evtl. noch.
  function watchHost() {
    if (!coop || coop.alone || coop.gone || ending || st.over || coop.link.state !== 'connected') return; // gone: away (Timer gedrosselt)
    if (performance.now() - coop.qsAt > (coop.gotQs ? COOP.SILENT_MS : COOP.FIRST_MS)) partnerLeft();
  }
  function onMsg(m) {
    if (!coop || !st || !isObj(m)) return;
    if (m.t === 'away' || m.t === 'back') return partnerAway(m.t === 'away'); // Lobby: App im Hintergrund bzw. zurück
    if (hosting()) {
      if (m.t === 'qr') { coop.ready = true; updateGo(); } else if (m.t === 'qc') {
        const c = cleanCmd(m.cmd, st.units.length);
        if (c && !st.over) feed(tick(st, 0, [c]));
      } else if (m.t === 'qp' && !briefingOpen() && !st.over) setPaused(!!m.on);
    } else if (remote() && m.t === 'qs') onSnapshot(m);
  }
  // Gast: alte Lage merken, Zustand übernehmen (Objekte bleiben dieselben), Events animieren, Interpolation neu
  function onSnapshot(m) {
    if (ending || !isObj(m.s)) return;
    coop.qsAt = performance.now(); coop.gotQs = true;
    try {
      // Interpolation nur neu starten, wenn die Host-Zeit weiterlief: in der Pause kommt qs auch, gt bliebe sonst nicht stehen
      const moved = m.s.time !== st.time;
      if (moved) snap(true);
      applyQuestSnapshot(st, m.s);
      if (moved) acc = 0;
      paused = !!m.p;
      if (Array.isArray(m.ev)) handle(m.ev.filter(isObj));
    } catch (e) { console.warn('Koop: Schnappschuss kaputt', e); }
    if (cut?.kind === 'kieser' && !st.paused) closeCut();
    if (briefingOpen() && !ending) { if (!paused) cardEl.classList.add('hidden'); else if (performance.now() - coop.qrAt > 1000) sendQr(); }
  }
  function partnerAway(on) {
    if (!coop || coop.alone || !st || st.over || coop.gone === on) return;
    coop.gone = on; coop.qsAt = performance.now(); // Wächter des Gasts (watchHost) zählt ab jetzt neu
    if (!on) return msg(`${coop.partner.name} ist zurück.`, 3000);
    if (hosting()) setPaused(true); // „Verbindung zu <Name> weg …“ steht im Pause-Banner (hud)
  }
  // Endgültig weg: Gast beendet ohne Wertung, Host fragt Aufgeben / Allein weiter (dann steuert er alle Einheiten)
  async function partnerLeft() {
    if (!coop || coop.alone || !st || st.over) return;
    coop.gone = false;
    const n = coop.partner.name;
    if (remote()) {
      Object.assign(st, { over: true, result: 'abort', reason: 'lost', paused: null });
      return endSequence({ type: 'end', result: 'abort', reason: 'lost', text: `Verbindung zu ${n} weg. Die Quest ist abgebrochen.`, summary: questSummary(st) });
    }
    coop.alone = true; // ab jetzt kein qs mehr
    clearInterval(coop.timer);
    setPaused(true);
    const run = seq;
    const i = await popup({ title: `${n} ist weg.`, html: `<p>Die Verbindung zu ${esc(n)} ist abgerissen. Allein weiter: Du steuerst ab jetzt alle Rüther.</p>`, buttons: [{ label: 'Aufgeben', danger: true }, { label: 'Allein weiter', primary: true }] });
    if (run !== seq || !st || st.over) return;
    if (i === 0) return send({ type: 'abort' });
    for (const u of st.units) u.owner = 'host';
    buildTeam(); updateGo(); powersKey = '';
    msg('Du spielst allein weiter.');
  }

  async function start({ mission, setup, variant, team, fighters, loadouts, rng = Math.random, tutorial, coop: co } = {}) {
    stop();
    const run = seq, m = typeof mission === 'string' ? MISSION_BY_ID[mission] : mission;
    coop = co?.link ? {
      link: co.link, role: co.role === 'guest' ? 'guest' : 'host', partner: { name: String(co.partner?.name || 'Partner').slice(0, 24), avatar: co.partner?.avatar ?? null },
      ready: false, gone: false, alone: false, out: [], endEv: null, offs: [], timer: 0, qrAt: 0, qsAt: 0, gotQs: false,
    } : null;
    el.classList.toggle('coop', !!coop);
    // Koop: Picks des Partners sind Daten von außen; unbekannte Rüther fallen raus
    let squad = (fighters?.length ? fighters : team || []).map((f, i) => {
      if (!f || !(f.maxBtc || RUETHER_BY_ID[f.id])) return null;
      const x = f.maxBtc ? f : makeFighter(RUETHER_BY_ID[f.id], f), lo = loadouts?.[i] ?? f.loadout;
      return lo ? { ...x, loadout: lo } : x; // v10: createQuest liest team[i].loadout
    }).filter(Boolean);
    if (m?.solo) { const own = squad.filter(f => f.id === m.solo).sort((a, b) => b.maxBtc - a.maxBtc); if (own.length) squad = own; } // sein stärkstes Exemplar
    st = createQuest({ mission: m, setup, variant, team: squad, rng, maxUnits: coop ? COOP.MAX_UNITS : 3 });
    abs = st.units.map(u => abilitiesFor(u));
    th = THEMES[st.theme] || THEMES.neuschwabenland;
    el.dataset.theme = st.theme;
    goalIco.src = GOAL_ART[st.objective.type] || GOAL_ART.steal;
    setText(goalLabel, st.objective.label);
    const types = [...new Set([...st.enemies.map(e => e.type), st.mission.reinforce])].map(t => ENEMY_TYPES[t]).filter(Boolean);
    catcher = { kieser: types.some(T => T.catches === 'kieser'), fine: Math.max(0, ...types.map(T => T.fine || 0)) };
    timeEl.classList.toggle('calm', st.timeLimit == null);
    noteEl.classList.toggle('warn', !!catcher.fine);
    mapBtn.classList.toggle('hidden', st.w <= MINI_W);
    hasWater = st.tiles.includes('W'); miniBase = null;
    buildTeam();
    const me = st.units.find(u => isMine(u.i)) || st.units[0]; // Koop: der erste eigene Rüther
    sel = [me.i]; powersKey = ''; follow = true; zoom = 1.25; progAt = -1e9;
    cam = { x: me.x * TILE, y: me.y * TILE };
    resize();
    // Cutscene-Kulissen laden nebenbei (groß, erst später gebraucht)
    for (const src of [...(catcher.kieser ? ['art/bg-kieser.png', 'art/boss-bernd.png'] : []), ...(catcher.fine ? ['art/bg-ranger.png'] : [])]) loadImg(src);
    await Promise.all([...ART, ...st.units.map(u => face(u.id))].map(loadImg));
    if (run !== seq) return; // inzwischen gestoppt oder neu gestartet
    mapCv = paintMap(st, th);
    gasPat = dither(g, 'rgba(91,181,90,.95)', 'rgba(155,227,107,.6)');
    deoPat = dither(g, 'rgba(242,155,200,.95)', 'rgba(255,214,235,.8)');
    doorH = st.doors.map(d => doorHoriz(st, d));
    const xs = st.pads.map(p => p.x), ys = st.pads.map(p => p.y);
    pad = st.pads.length ? { x: (Math.min(...xs) + Math.max(...xs) + 1) / 2, y: (Math.min(...ys) + Math.max(...ys) + 1) / 2, y0: Math.min(...ys), y1: Math.max(...ys) + 1 } : null;
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    running = true; paused = true; lastTs = 0;
    raf = requestAnimationFrame(frame);
    showIntro(coop ? false : tutorial ?? !tutSeen()); // Koop: nie Tutorial
    if (coop) linkUp(); // erst jetzt: vorher fehlen Karte und Bilder für Schnappschüsse und Events
  }

  function stop() {
    seq++;
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    fx = freshFx(); labels = []; fxLayer.innerHTML = '';
    prev = new WeakMap(); flash = new WeakMap(); popAt = new WeakMap(); doorAt.clear(); effAt.clear(); scolder.clear(); chatAt.clear(); ptrs.clear(); gesture = null;
    acc = 0; overClock = 0; gt = 0; paused = false; ending = null; ended = false; inspect = null; lastTap = {}; reached = false; warned = false; quitAsk = false;
    tut = -1; endAim(); closeMenu();
    mini = null; caught = null; valveAt.clear(); seenE.clear(); closeCut();
    for (const n of [tutEl, cardEl, stampEl, msgEl, pausedEl, miniEl, rivalEl]) n.classList.add('hidden');
    edge.className = 'q-edge';
    if (coop) { for (const off of coop.offs) off(); clearInterval(coop.timer); coop = null; }
  }

  // debug(): Zustand und Kachel → Bildschirmpunkt (CSS-px im Canvas) für Tests und das Debug-Panel
  const debug = () => ({ st, paused, sel, aim, menuFor, cut: cut && cutEl.className, mini: !!mini, send, fx, ending, tile: (x, y) => toScreen(x * TILE, y * TILE),
    coop: coop && { role: coop.role, ready: coop.ready, gone: coop.gone, alone: coop.alone } });
  return { start, stop, send, setRival, debug };
}
