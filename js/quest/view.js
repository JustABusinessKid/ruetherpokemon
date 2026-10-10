// Haunebu-Quests: Kommando-Ansicht wie Commandos 2 (Spec §5.5). Canvas-Draufsicht mit 32-px-Kacheln, HUD als DOM.
// createQuestScreen({ el, onEnd }) -> { start({ mission, variant, team, fighters, rng, tutorial }), stop() }
//   fighters: makeFighter-Kampfwerte (oder team als Exemplare { id, rarity, level, uid }), 1–3. tutorial: erzwingen/aus.
//   onEnd(questSummary + { text, team }) genau einmal: nach Abheben, Scheitern oder Aufgeben (result 'success'|'fail'|'abort').
// Schleife: feste 50-ms-Logik (engine.tick) mit Aufholen, rAF-Zeichnen mit Interpolation zwischen den Schritten.
// Befehle gehen sofort per tick(st, 0, [cmd]) an die Engine, auch in der taktischen Pause.
// Uhren: gt = Spielzeit (steht in der Pause, treibt Effekte, Würfe, Blasen), rt = echte Zeit (Auswahl-Puls, Untertasse, Abspann).
// Bedienung: Antippen wählt/läuft/interagiert, Doppeltipp auf einen Rüther = Kreismenü, Zielmodus mit Reichweite, Ziehen = Kamera,
// Zwei-Finger-Zoom und ±. Sounds: vorhandene sfx plus step/alarm/steal/gas (audio.js; unbekannte Namen sind stumm).
import { createQuest, tick, canExtract, questSummary, visibleCone, abilitiesFor, abilityTargets, ABILITIES, ENEMY_TYPES } from './engine.js';
import { makeFighter } from '../battle.js';
import { RUETHER_BY_ID } from '../data.js';
import { sfx, haptic } from '../audio.js';
import { banner } from '../fx.js';
import { popup, esc } from '../ui.js';
import { TILE, INK, PAPER, GOLD, THEMES, loadImg, img, variant, paintMap, doorHoriz, drawDoor, faceFrame, bitmap, bubble, dither, hash } from './draw.js';

const STEP = 50, MAX_CATCHUP = 1500;
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.6, 2], ZOOM_MIN = 0.5, ZOOM_MAX = 2.4;
const TUT_KEY = 'ruether-go-quest-tut';
const DOUBLE_MS = 350, DOUBLE_PX = 30, DRAG_PX = 10, SPREAD = 0.9; // SPREAD: Mindestabstand der Gesichter in Kacheln (Gesicht 28 px)
const SUS_BAR = new Set(['patrol', 'suspicious', 'investigate', 'distracted']); // Misstrauens-Balken nur bei eingeschaltetem Kegel
const face = id => `sprites/${id}.png`;
const fxArt = n => `art/fx-${n}.png`;
const short = id => id[0].toUpperCase() + id.slice(1); // „Onkel Micha“ → Micha
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { const d = (b - a) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const GOAL_ART = { steal: 'art/q-coin.png', sabotage: 'art/q-saucer.png', fetch: 'art/q-ps3.png', unplug: 'art/q-plug.png' };
const THROWN = { can: 'beer-can', mms: 'mms', controller: 'controller' };
const MMS = ['#B03B2B', '#3F8EF5', '#5BB55A', '#F2C94C', '#E0A52B', '#7A4A2A'];
const RED = '#E0634C', GREEN = '#5BB55A', TEAL = '#3FC1B0', AMBER = '#E0A52B';
const NOISE = { can: { c: AMBER, t: 'SCHEPPER!' }, hieb: { c: PAPER, t: '' }, alarmanlage: { c: RED, t: 'PIEP PIEP PIEP' } }; // Hieb: „BONK!“ kommt schon vom stun-Event
const STUN_TXT = { handbag: 'BONK!', controller: 'KLONK!', hack: 'Firmware 0.0.1', gas: '*hust*' };
const TUT = [
  { at: 'team', text: 'Tipp auf ein Gesicht, um einen Rüther zu wählen. „Alle“ wählt das ganze Team.' },
  { at: 'stage', text: 'Tipp auf den Boden: Er läuft hin. Die gestrichelte Linie zeigt seinen Weg.' },
  { at: 'powers', text: 'Doppeltipp auf einen Rüther öffnet seine Kräfte. Oder unten auf „Kräfte“.' },
];
const ART = [
  'art/q-coin.png', 'art/q-vault.png', 'art/q-saucer.png', 'art/q-ps3.png', 'art/q-plug.png', 'art/q-pad.png', 'art/fx-haunebu.png', 'art/fx-tractor-beam.png',
  ...new Set(Object.values(ENEMY_TYPES).map(t => `art/${t.sprite}.png`)), ...Object.values(ABILITIES).map(a => fxArt(a.icon)),
  fxArt('beer-can'), fxArt('chart-up'), face('christian'), face('micha'), face('hildegard'),
];

const HTML = `
<div class="q-top wood">
  <div class="q-goal"><img class="q-goal-ico" alt=""><span class="q-goal-label"></span><b class="q-goal-n"></b></div>
  <b class="q-time">0:00</b>
  <div class="q-alarm"><span>Alarm</span><div class="bar"><div class="fill"></div></div></div>
</div>
<div class="q-stage">
  <canvas class="q-cv"></canvas>
  <div class="q-edge"></div>
  <div class="q-fx"></div>
  <div class="q-zoom"><button class="q-zin" aria-label="Näher ran">+</button><button class="q-zout" aria-label="Weiter weg">−</button></div>
  <div class="q-paused hidden">Pause · Befehle gehen trotzdem</div>
  <div class="q-aim hidden"><img alt=""><span></span><button class="q-aim-x">Abbrechen</button></div>
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

export function createQuestScreen({ el, onEnd }) {
  el.classList.add('q-screen');
  el.innerHTML = HTML;
  const $ = s => el.querySelector(s);
  const stage = $('.q-stage'), cv = $('.q-cv'), g = cv.getContext('2d'), fxLayer = $('.q-fx'), edge = $('.q-edge');
  const goalIco = $('.q-goal-ico'), goalLabel = $('.q-goal-label'), goalN = $('.q-goal-n'), timeEl = $('.q-time');
  const alarmBox = $('.q-alarm'), alarmFill = $('.q-alarm .fill');
  const teamEl = $('.q-team'), powersEl = $('.q-powers'), pauseBtn = $('.q-pause'), extractBtn = $('.q-extract'), quitBtn = $('.q-quit');
  const aimEl = $('.q-aim'), pausedEl = $('.q-paused'), msgEl = $('.q-msg'), ringEl = $('.q-ring'), tutEl = $('.q-tut'), cardEl = $('.q-card'), stampEl = $('.q-stamp');

  let st = null, th = null, mapCv = null, gasPat = null, seq = 0;
  let running = false, raf = 0, lastTs = 0, acc = 0, overClock = 0, paused = false, gt = 0, rt = 0, frameDt = 16;
  let sel = [], follow = true, zoom = 1, cam = { x: 0, y: 0 }, vw = 0, vh = 0, dpr = 1;
  let inspect = null, menuFor = -1, aim = null, tut = -1, ending = null, ended = false, lastTap = {}, hitSfxAt = 0, reached = false, warned = false;
  let fx = freshFx(), labels = [], doorH = [], pad = null, powersKey = '', quitAsk = false, msgT = 0;
  let prev = new WeakMap(), flash = new WeakMap(), popAt = new WeakMap();
  const doorAt = new Map(), effAt = new Map(), timers = new Set();
  const ptrs = new Map();
  let gesture = null;

  function freshFx() { return { parts: [], texts: [], bubbles: [], rings: [], projs: [], sprites: [], helpers: [], bolts: [] }; }
  function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  const setText = (n, s) => { if (n.textContent !== s) n.textContent = s; };
  const age = born => Math.max(0, gt - born);

  // ---------- Positionen (interpoliert zwischen zwei Logik-Schritten) ----------
  function snap() {
    for (const u of st.units) prev.set(u, { x: u.x, y: u.y, dir: u.dir });
    for (const e of st.enemies) prev.set(e, { x: e.x, y: e.y, dir: e.dir });
  }
  function pos(ent) {
    const p = prev.get(ent), a = acc / STEP;
    return p ? { x: p.x + (ent.x - p.x) * a, y: p.y + (ent.y - p.y) * a, dir: p.dir + angDiff(p.dir, ent.dir) * a, moved: p.x !== ent.x || p.y !== ent.y } : { x: ent.x, y: ent.y, dir: ent.dir, moved: false };
  }
  // Rüther auf (fast) derselben Stelle seitlich auffächern, damit kein echtes Gesicht verdeckt ist (§0); Zeichnen und Tippen nutzen dasselbe
  function upos(u) {
    const p = pos(u);
    for (const o of st.units) {
      if (o === u) continue;
      const q = pos(o), d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < SPREAD) p.x += (SPREAD - d) / 2 * (u.i < o.i ? -1 : 1);
    }
    return p;
  }
  const toScreen = (wx, wy) => ({ x: (wx - cam.x) * zoom + vw / 2, y: (wy - cam.y) * zoom + vh / 2 });
  const toWorld = (sx, sy) => ({ x: (sx - vw / 2) / zoom + cam.x, y: (sy - vh / 2) / zoom + cam.y });
  const at = (ref) => { // Weltpixel eines Ankers: { u } | { e } | { x, y } (Kacheln)
    if (ref.u != null) { const p = upos(st.units[ref.u]); return { x: p.x * TILE, y: p.y * TILE }; }
    if (ref.e != null) { const p = pos(st.enemies[ref.e]); return { x: p.x * TILE, y: p.y * TILE }; }
    return { x: ref.x * TILE, y: ref.y * TILE };
  };

  // ---------- Effekt-Bausteine (alles in Spielzeit gt, Weltpixel) ----------
  const now = () => st.time;
  function text(ref, t, color = PAPER, size = 16, ms = 1100) { fx.texts.push({ ref, t, color, size, ms, born: now() }); }
  function say(ref, t, ms = 2600) { // eine Blase je Figur, höchstens 5 gleichzeitig
    if (!t) return;
    fx.bubbles = fx.bubbles.filter(b => !((ref.u != null && b.ref.u === ref.u) || (ref.e != null && b.ref.e === ref.e)));
    fx.bubbles.push({ ref, t, ms, born: now() });
    if (fx.bubbles.length > 5) fx.bubbles.shift();
  }
  const ring = (x, y, r, color, ms = 700, delay = 0) => fx.rings.push({ x: x * TILE, y: y * TILE, r: r * TILE, color, ms, born: now() + delay });
  function throwArc(src, x0, y0, x1, y1, ms, { size = 18, spin = 4 * Math.PI, h = null, delay = 0 } = {}) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    fx.projs.push({ src, x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE, ms, size, spin, h: h ?? 14 + d * 7, born: now() + delay });
  }
  const pop = (src, x, y, { size = 28, ms = 900, kind = 'pop', delay = 0 } = {}) => fx.sprites.push({ src, x: x * TILE, y: y * TILE, size, ms, kind, born: now() + delay });
  function burst(x, y, n, { kind = 'sq', colors = [GOLD, PAPER], speed = 60, up = 40, grav = 140, ms = 700, size = 3, src = '' } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 2 * Math.PI, v = speed * (0.4 + Math.random() * 0.6);
      fx.parts.push({ x: x * TILE, y: y * TILE, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, grav, kind, src, size, color: colors[k % colors.length], ms: ms * (0.7 + Math.random() * 0.5), born: now() });
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
  function send(cmd) { if (st && !st.over) handle(tick(st, 0, [cmd])); }
  const upUnits = () => st.units.filter(u => !u.down).map(u => u.i);
  const actors = () => sel.filter(i => !st.units[i].down);
  const nearest = (ids, x, y) => ids.reduce((b, i) => (b == null || Math.hypot(st.units[i].x - x, st.units[i].y - y) < Math.hypot(st.units[b].x - x, st.units[b].y - y) ? i : b), null);

  function select(ids, { keepFollow = false } = {}) {
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
    for (const e of st.enemies) { const p = pos(e); consider('enemy', e, p.x * TILE, p.y * TILE - 4); }
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
      if (ids.length === 1 && st.units[ids[0]].id === 'hildegard' && e.state !== 'ko') send({ type: 'ability', unit: ids[0], ability: 'handbag', target: { enemy: e.i } });
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
      const c = ids.find(i => st.units[i].id === 'christian');
      if (c == null) return msg('Verschlossen. Das kann nur Christian: Plus 70 Prozent.');
      return send({ type: 'ability', unit: c, ability: 'plus70', target: { door: hit.ref.id } });
    }
    for (const i of ids) send({ type: 'move', unit: i, to: { x: wx, y: wy } });
  }

  // ---------- Kräfte: Kreismenü und Zielmodus ----------
  function abilityBlocked(u, ab) {
    if (u.down) return 'Liegt flach.';
    if (u.item) return 'Mit der PS3 im Arm geht das nicht.';
    const left = (u.cd[ab.id] || 0) - st.time;
    return left > 0 ? `${ab.name}: noch ${Math.ceil(left / 1000)} s` : '';
  }
  function chooseAbility(i, id) {
    if (briefingOpen()) return; // erst „Los!“
    closeMenu();
    const u = st.units[i], ab = ABILITIES[id], why = abilityBlocked(u, ab);
    if (why) { sfx.play('warn'); return msg(why); }
    select([i], { keepFollow: true });
    if (ab.target === 'self') return send({ type: 'ability', unit: i, ability: id, target: {} });
    aim = { unit: i, ab: id };
    aimEl.querySelector('img').src = fxArt(ab.icon);
    const what = ab.target === 'point' ? 'Punkt' : ab.target === 'door' ? 'verschlossene Tür' : ab.target === 'vaultOrDrone' ? 'Tresor oder Drohne' : 'Gegner';
    setText(aimEl.querySelector('span'), `${ab.name}: ${what} antippen`);
    aimEl.classList.remove('hidden');
  }
  function endAim() { aim = null; aimEl.classList.add('hidden'); }
  $('.q-aim-x').addEventListener('click', endAim);
  function aimTap(sx, sy) {
    const { unit, ab: id } = aim, ab = ABILITIES[id];
    if (ab.target === 'point') {
      const w = toWorld(sx, sy);
      endAim();
      return send({ type: 'ability', unit, ability: id, target: { x: w.x / TILE, y: w.y / TILE } });
    }
    const hit = pick(sx, sy, abilityTargets(st, unit, id));
    if (!hit) { sfx.play('warn'); return msg('Kein gültiges Ziel. Tipp auf ein leuchtendes Ziel.'); }
    const t = hit.ref;
    endAim();
    send({ type: 'ability', unit, ability: id, target: t.door != null ? { door: t.door } : t.enemy != null ? { enemy: t.enemy } : { obj: t.obj } });
  }

  function abIcon(ab) { // Familientreffen: die echten Gesichter von Christian und Micha statt Cartoon
    return ab.id === 'family' ? `<span class="q-fam"><img src="${face('christian')}" alt=""><img src="${face('micha')}" alt=""></span>` : `<img src="${fxArt(ab.icon)}" alt="">`;
  }
  function openMenu(i) {
    const u = st.units[i];
    if (!u || u.down || st.over || briefingOpen()) return;
    select([i], { keepFollow: true });
    endAim();
    menuFor = i;
    const items = [...abilitiesFor(u.id).map(a => ({ a })), { stop: true }];
    const ang = [-150, -30, 90], R = 72;
    ringEl.innerHTML = '';
    items.forEach((it, k) => {
      const b = document.createElement('button');
      b.className = 'q-ring-item';
      b.style.left = `${Math.round(Math.cos(ang[k] * Math.PI / 180) * R)}px`;
      b.style.top = `${Math.round(Math.sin(ang[k] * Math.PI / 180) * R)}px`;
      if (it.stop) { b.classList.add('stop'); b.innerHTML = '<span class="q-ring-ico"><i></i></span><span class="q-ring-name">Stopp</span>'; b.addEventListener('click', () => { closeMenu(); send({ type: 'stop', unit: i }); }); }
      else {
        b.dataset.ab = it.a.id;
        b.innerHTML = `<span class="q-ring-ico">${abIcon(it.a)}<span class="q-cd"></span></span><span class="q-ring-name">${esc(it.a.name)}</span>`;
        b.addEventListener('click', () => chooseAbility(i, it.a.id));
      }
      ringEl.appendChild(b);
    });
    ringEl.classList.remove('hidden');
    sfx.play('special');
    tutStep(2);
  }
  function closeMenu() { menuFor = -1; ringEl.classList.add('hidden'); }

  // ---------- HUD ----------
  function buildTeam() {
    teamEl.innerHTML = '';
    for (const u of st.units) {
      const b = document.createElement('button');
      b.className = 'q-por';
      b.dataset.u = u.i;
      b.setAttribute('aria-label', short(u.id));
      b.innerHTML = `<img class="r-${esc(u.rarity)}" src="${face(u.id)}" alt=""><span class="q-hp"><i></i></span><span class="q-carry hidden"></span>`;
      b.addEventListener('click', () => {
        if (!st || st.over) return;
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
    teamEl.appendChild(all);
  }
  function buildPowers() {
    const one = sel.length === 1 ? st.units[sel[0]] : null, key = one ? `${one.i}` : 'team';
    if (key === powersKey) return;
    powersKey = key;
    powersEl.innerHTML = '';
    if (!one) { powersEl.innerHTML = '<span class="q-powers-none">Ganzes Team gewählt</span>'; return; }
    for (const ab of abilitiesFor(one.id)) {
      const b = document.createElement('button');
      b.className = 'q-ab';
      b.dataset.ab = ab.id;
      b.setAttribute('aria-label', ab.name);
      b.innerHTML = `${abIcon(ab)}<span class="q-cd"></span>`;
      b.addEventListener('click', () => { if (st && !st.over) chooseAbility(one.i, ab.id); });
      powersEl.appendChild(b);
    }
    const m = document.createElement('button');
    m.className = 'q-menu';
    m.textContent = 'Kräfte';
    m.addEventListener('click', () => { if (st && !st.over) openMenu(one.i); });
    powersEl.appendChild(m);
  }
  function cdView(node, u, id) {
    const ab = ABILITIES[id], left = Math.max(0, (u.cd[id] || 0) - st.time), cd = node.querySelector('.q-cd');
    const off = left > 0 || u.item || u.down;
    node.classList.toggle('cool', off);
    node.style.setProperty('--cd', (left / ab.cd).toFixed(3));
    setText(cd, left > 0 ? `${Math.ceil(left / 1000)}` : '');
  }
  function hud() {
    const o = st.objective, need = o.type === 'steal' ? o.min : o.total;
    setText(goalN, o.type === 'steal' && o.done >= o.min ? `${o.done}` : `${o.done}/${need}`);
    goalN.classList.toggle('done', o.done >= o.min);
    const left = st.timeLimit - st.time;
    setText(timeEl, mmss(left));
    timeEl.classList.toggle('low', left < 30_000);
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
    if (one) for (const b of powersEl.querySelectorAll('.q-ab')) cdView(b, one, b.dataset.ab);
    if (menuFor >= 0) for (const b of ringEl.querySelectorAll('[data-ab]')) cdView(b, st.units[menuFor], b.dataset.ab);
    el.classList.toggle('q-over', st.over);
    extractBtn.disabled = !canExtract(st);
    extractBtn.classList.toggle('ready', !extractBtn.disabled);
    const briefing = briefingOpen() || tut >= 0; // Briefing/Tutorial halten das Spiel selbst an
    pauseBtn.disabled = briefing;
    setText(pauseBtn, paused && !briefing ? 'Weiter' : 'Pause');
    pauseBtn.classList.toggle('on', paused && !briefing);
    pausedEl.classList.toggle('hidden', !paused || !!ending || briefing);
  }

  function setPaused(p) { paused = !!p; if (!paused) lastTs = 0; }
  pauseBtn.addEventListener('click', () => { if (st && !st.over && tut < 0) setPaused(!paused); });
  extractBtn.addEventListener('click', () => send({ type: 'extract' }));
  quitBtn.addEventListener('click', async () => {
    if (!st || st.over || quitAsk) return;
    quitAsk = true;
    const was = paused, run = seq;
    setPaused(true);
    const i = await popup({ title: 'Aufgeben?', html: '<p>Die Haunebu hebt ohne Beute ab. Die Quest zählt als nicht geschafft.</p>', buttons: [{ label: 'Weiterspielen', primary: true }, { label: 'Aufgeben', danger: true }] });
    quitAsk = false;
    if (run !== seq || !st || st.over) return;
    if (i === 1) send({ type: 'abort' }); else setPaused(was);
  });
  el.addEventListener('click', e => { if (e.target.closest('button')) sfx.play('click'); });
  stampEl.addEventListener('click', () => finish());
  function onKey(e) {
    if (!st || st.over) return;
    if (e.key === ' ' && tut < 0 && cardEl.classList.contains('hidden')) { setPaused(!paused); e.preventDefault(); }
    if (e.key === 'Escape') { endAim(); closeMenu(); }
  }
  function onHide() { if (document.hidden && st && !st.over) setPaused(true); }

  // ---------- Einstieg: Briefing und Tutorial ----------
  function showIntro(withTut) {
    const m = st.mission, v = st.variant;
    cardEl.innerHTML = `<p class="q-card-place">${esc(m.place)}</p><h2>${esc(m.name)}</h2>`
      + `<p class="q-card-var"><b>${esc(v.name)}.</b> ${esc(v.desc)}</p><p>${esc(m.intro)}</p><p class="q-card-hint">${esc(m.hint)}</p>`
      + `<div class="q-card-team">${st.units.map(u => `<img class="r-${esc(u.rarity)}" src="${face(u.id)}" alt="${esc(short(u.id))}">`).join('')}</div>`
      + `<p class="q-card-meta">${esc(m.objective.label)} · ${mmss(st.timeLimit)}</p><button class="primary q-go">Los!</button>`;
    cardEl.classList.remove('hidden');
    cardEl.querySelector('.q-go').addEventListener('click', () => {
      cardEl.classList.add('hidden');
      if (withTut) { tut = 0; showTut(); } else setPaused(false);
    });
  }
  function showTut() {
    const s = TUT[tut];
    tutEl.className = `q-tut at-${s.at}`;
    setText(tutEl.querySelector('p'), s.text);
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
          ring(e.to.x + 0.5, e.to.y + 0.5, 0.45, PAPER, 450);
          sfx.play('step');
          tutStep(1);
          break;
        case 'fail': msg(e.text); sfx.play('warn'); break;
        case 'interactStart':
          sfx.play('tap');
          if (e.kind === 'revive') say({ u: e.unit }, 'Steh auf, wir sind noch nicht fertig!', 2000);
          break;
        case 'interactCancel':
          if (e.reason !== 'befehl') text({ u: e.unit }, e.reason === 'entdeckt' ? 'Entdeckt!' : 'Autsch!', RED, 14);
          break;
        case 'steal':
          if (!e.instant) coinsFly(e.x, e.y, U.x, U.y - 0.6, 1);
          sfx.play('steal');
          text({ x: e.x, y: e.y - 0.5 }, `+${e.n}`, GOLD, 16);
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
          if (e.reason === 'handbag' || e.reason === 'controller') { burst(e.x, e.y - 0.3, 6, { kind: 'star', colors: [GOLD], speed: 50, up: 30, ms: 700, size: 1.3 }); }
          if (STUN_TXT[e.reason] && e.reason !== 'gas') text({ e: e.enemy }, STUN_TXT[e.reason], e.reason === 'hack' ? TEAL : GOLD, 16);
          if (e.reason === 'eat') burst(e.x, e.y, 6, { colors: ['#7FD36B', '#4E9A3C'], speed: 20, up: 20, grav: -30, ms: 1000 });
          say({ e: e.enemy }, e.say);
          if (e.reason === 'controller' || e.reason === 'handbag') sfx.play('hit');
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
        case 'effectEnd':
          if (e.kind === 'gas') burst(e.x, e.y, 10, { colors: ['#9BE36B', '#5BB55A'], speed: 30, up: 10, grav: -20, ms: 900, size: 4 });
          break;
        case 'end': endSequence(e); break;
      }
    }
  }

  function ability(e, u) {
    const x = e.x, y = e.y;
    switch (e.ability) {
      case 'plus70':
        doorAt.set(e.door, now());
        pop(fxArt('chart-up'), e.tx, e.ty - 0.4, { size: 48, ms: 1300, kind: 'rise' });
        for (let k = 0; k < 10; k++) fx.parts.push({ x: (e.tx + (Math.random() - 0.5) * 2.4) * TILE, y: (e.ty - 2.2) * TILE, vx: (Math.random() - 0.5) * 20, vy: 10, grav: 260, kind: 'img', src: 'art/q-coin.png', size: 10, ms: 900 + Math.random() * 300, born: now() + k * 60 });
        text({ x: e.tx, y: e.ty - 1 }, '+70 %', GOLD, 24, 1500);
        sfx.play('special');
        break;
      case 'beer': case 'mms': case 'controller':
        throwArc(fxArt(THROWN[e.item]), x, y - 0.3, e.tx, e.ty, e.ms, { size: e.item === 'controller' ? 24 : 22, spin: e.item === 'mms' ? Math.PI : 5 * Math.PI });
        sfx.play('throw');
        break;
      case 'family':
        banner(fxLayer, { title: 'Familientreffen', sub: 'Christian! Micha! Kommt sofort her!', portrait: face(u.id), rarity: u.rarity, ms: 1500 });
        for (const h of e.helpers) fx.helpers.push({ id: h.id, x0: h.x * TILE, y0: h.y * TILE, x1: h.tx * TILE, y1: h.ty * TILE, ms: e.ms, born: now(), enemy: h.enemy });
        sfx.play('special'); haptic(40);
        break;
      case 'handbag':
        pop(fxArt('handbag'), (x + e.tx) / 2, (y + e.ty) / 2 - 0.3, { size: 26, ms: 450, kind: 'swing' });
        if (e.silent) text({ x: e.tx, y: e.ty - 0.9 }, 'leise', PAPER, 12);
        break;
      case 'gas':
        say({ u: e.unit }, 'Riecht ihr das? Ich nicht.', 2000);
        sfx.play('gas');
        break;
      case 'argue': say({ u: e.unit }, e.say, 3200); sfx.play('special'); break;
      case 'wallet':
        pop(fxArt('wallet'), e.tx, e.ty - 0.5, { size: 28, ms: 800 });
        if (e.mode === 'vault') { coinsFly(e.tx, e.ty, x, y - 0.6, e.coins, 420); text({ u: e.unit }, `+${e.coins}`, GOLD, 18); sfx.play('coin'); }
        else { fx.bolts.push({ x0: x * TILE, y0: y * TILE, x1: e.tx * TILE, y1: e.ty * TILE, ms: 500, born: now() }); sfx.play('special'); }
        break;
      case 'credits':
        coinsFly(x, y - 0.3, e.tx, e.ty - 0.3, 5, 380);
        pop(fxArt('bags'), e.tx, e.ty - 0.8, { size: 26, ms: 1000, delay: 380 });
        say({ u: e.unit }, 'Unlimited Credits. Kauf dir was Schönes.', 2200);
        sfx.play('coin');
        break;
    }
  }

  function endSequence(e) {
    closeMenu(); endAim();
    tut = -1; tutEl.classList.add('hidden'); msgEl.classList.add('hidden');
    const lift = e.result === 'success' && e.reason === 'extract';
    ending = { at: rt, lift, text: e.text, summary: e.summary, result: e.result };
    sfx.play(lift ? 'ufo' : e.result === 'success' ? 'win' : 'lose');
    const title = e.result === 'success' ? 'Geschafft!' : e.result === 'abort' ? 'Abgebrochen' : 'Gescheitert';
    later(() => {
      setText(stampEl.querySelector('b'), title);
      setText(stampEl.querySelector('p'), e.text);
      stampEl.className = `q-stamp ${e.result}`;
    }, lift ? 1500 : 400);
    later(finish, lift ? 4200 : 3400);
  }
  function finish() {
    if (!ending || ended || stampEl.classList.contains('hidden')) return;
    ended = true;
    const r = { ...ending.summary, text: ending.text, team: st.units.map(u => ({ id: u.id, name: u.name, rarity: u.rarity, level: u.level, hp: u.hp, maxHp: u.maxHp, down: u.down })) };
    stop();
    onEnd?.(r);
  }

  // ---------- Zeichnen ----------
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = Math.round(r.width); vh = Math.round(r.height);
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
    g.drawImage(mapCv, 0, 0);
    const view = { x0: (cam.x - vw / 2 / zoom) / TILE - 1, y0: (cam.y - vh / 2 / zoom) / TILE - 1, x1: (cam.x + vw / 2 / zoom) / TILE + 1, y1: (cam.y + vh / 2 / zoom) / TILE + 1 };
    const inView = (x, y, m = 0) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    drawDoors(); drawObjs(); drawSaucer(); drawEffects(); drawCones(inView); drawPaths(); drawAim();
    drawEnemies(inView); drawUnits(); drawFx();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScreen();
    placeMenu();
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

  function drawEffects() {
    for (const f of st.effects) {
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
        const k = clamp(age(effAt.get(f.id) ?? now()) / 350);
        for (let j = 0; j < 12; j++) {
          const a = hash(f.id, j) * 2 * Math.PI, d = (3 + hash(f.id, j, 2) * 10) * k;
          g.fillStyle = INK; g.fillRect(Math.round(f.x * TILE + Math.cos(a) * d) - 2, Math.round(f.y * TILE + Math.sin(a) * d) - 2, 5, 5);
          g.fillStyle = MMS[j % MMS.length]; g.fillRect(Math.round(f.x * TILE + Math.cos(a) * d) - 2, Math.round(f.y * TILE + Math.sin(a) * d) - 2, 4, 4);
        }
      }
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
      const strong = e.i === strongE, c = e.state === 'alert' ? RED : e.state === 'patrol' ? GREEN : GOLD;
      g.beginPath();
      g.moveTo(pts[0].x * TILE, pts[0].y * TILE);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x * TILE, pts[k].y * TILE);
      g.closePath();
      g.fillStyle = c;
      g.globalAlpha = strong ? 0.4 : e.state === 'alert' ? 0.26 : 0.15;
      g.fill();
      if (strong) { g.globalAlpha = 0.9; g.strokeStyle = c; g.lineWidth = 1.5; g.stroke(); }
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
  function drawAim() {
    if (!aim) return;
    const u = st.units[aim.unit];
    if (!u || u.down) return endAim();
    const ab = ABILITIES[aim.ab], p = pos(u);
    circle(p.x * TILE, p.y * TILE, ab.range * TILE, TEAL, 0.08);
    if (ab.vaultRange) circle(p.x * TILE, p.y * TILE, ab.vaultRange * TILE, GOLD, 0.06);
    const k = 11 + Math.sin(rt / 140) * 2;
    for (const t of abilityTargets(st, aim.unit, ab.id)) {
      const tp = t.enemy != null ? pos(st.enemies[t.enemy]) : t, x = tp.x * TILE, y = tp.y * TILE;
      g.fillStyle = INK;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillRect(x + sx * k - 3, y + sy * k - 3, 6, 6); }
      g.fillStyle = t.inRange ? TEAL : AMBER;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillRect(x + sx * k - 2, y + sy * k - 2, 4, 4); }
    }
  }

  function drawEnemies(inView) {
    for (const e of st.enemies) {
      const p = pos(e);
      if (!inView(p.x, p.y, 1)) continue;
      const T = ENEMY_TYPES[e.type], src = `art/${T.sprite}.png`, boss = T.sprite.startsWith('boss'), s = boss ? 36 : 30;
      const x = p.x * TILE, y = p.y * TILE, ph = gt / 95 + e.i * 1.9;
      const hacked = e.state === 'stunned' && e.reason === 'hack', ko = e.state === 'ko';
      const fly = T.flying && !hacked && !ko, lift = fly ? 9 + Math.sin(rt / 260 + e.i) * 2 : 0;
      const walk = p.moved && !fly && !ko ? Math.sin(ph) * (e.type === 'pinguin' ? 0.2 : 0.1) : 0;
      shadow(x, y + 12, fly ? 16 : 22);
      let im = img(src);
      if (ko || hacked) im = variant(src, 'grey');
      else if (e.state === 'eating' || (e.state === 'stunned' && e.reason === 'gas')) im = variant(src, 'tint', '#5BB55A', 0.45);
      if ((flash.get(e) || 0) > gt) im = variant(src, 'tint', '#FFFFFF', 0.75);
      sprite(im, x, y - 3 - lift - (p.moved && !fly ? Math.abs(Math.sin(ph)) * 2 : 0), s, { rot: ko ? Math.PI / 2 : walk, flip: Math.cos(p.dir) < 0 });
      const head = y - s / 2 - 6 - lift;
      if (ko && e.tied) { g.fillStyle = '#8a5a2b'; g.fillRect(x - 14, y - 6, 28, 3); g.fillRect(x - 14, y + 2, 28, 3); g.fillStyle = INK; g.fillRect(x - 2, y - 8, 4, 12); }
      if (ko) label(x, y - 16, 'KO', GOLD, 13);
      else if (e.state === 'stunned' && e.reason !== 'gas' && e.reason !== 'argue' && !hacked) {
        for (let k = 0; k < 3; k++) { const a = rt / 260 + k * 2.09; bitmap(g, 'star', x + Math.cos(a) * 11, head + 2 + Math.sin(a) * 3, 1, GOLD); }
      }
      if (hacked && Math.floor(rt / 110) % 3 === 0) bitmap(g, 'spark', x + 7, y - 8, 1, TEAL);
      if (e.state === 'stunned' && e.reason === 'argue') label(x, head, '…', PAPER, 18);
      if (e.state === 'stunned' && e.reason === 'gas' && (gt / 1300 + e.i * 0.3) % 1 < 0.35) label(x + 10, head, '*hust*', '#9BE36B', 12);
      if (e.state === 'eating') { g.fillStyle = '#7FD36B'; for (let k = 0; k < 5; k++) g.fillRect(Math.round(x - 8 + k * 4), Math.round(head + Math.sin(rt / 120 + k) * 2), 3, 2); } // Pixel-Übelkeit
      if (e.state === 'bribed') { const sx = Math.abs(Math.cos(rt / 160)); const c = img('art/q-coin.png'); if (c) g.drawImage(c, x - 6 * sx, head - 8, 12 * sx, 12); }
      // ? und ! mit kleinem Hüpfer beim Wechsel
      const bounce = 1 + 0.5 * Math.max(0, 1 - age(popAt.get(e) ?? -1e9) / 250);
      if (e.state === 'alert') label(x, head - 2, '!', RED, Math.round(22 * bounce));
      else if (e.state === 'suspicious' || e.state === 'investigate') label(x, head - 2, '?', GOLD, Math.round(20 * bounce));
      else if (e.state === 'distracted') label(x, head - 2, '?', PAPER, 16);
      if (e.suspicion > 0.02 && SUS_BAR.has(e.state)) bar(x, y + 15, 20, e.suspicion, GOLD);
      if (!ko && e.hp < e.maxHp) bar(x, y + 19, 20, e.hp / e.maxHp, RED);
      if (inspect?.e === e.i && rt < inspect.until) label(x, y + 30, e.name, PAPER, 13);
    }
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
      if (ending?.lift && !u.down) { const k = clamp((rt - ending.at) / 1000); rise = k * 46; alpha = 1 - k; }
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
      faceFrame(g, img(src), 0, 0, 28, u.rarity, { grey: u.down, src });
      if ((flash.get(u) || 0) > gt) { g.fillStyle = 'rgba(224,99,76,.55)'; g.fillRect(-14, -14, 28, 28); }
      g.restore();
      const top = y - 22 + bob - rise;
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

  function drawFx() {
    const t = gt;
    // Familientreffen: die echten Christian und Micha rennen vom Rand heran, fesseln und jubeln
    fx.helpers = fx.helpers.filter(h => t - h.born < h.ms + 1400);
    for (const h of fx.helpers) {
      const a = t - h.born;
      if (a < 0) continue;
      const side = h.id === 'micha' ? 1 : -1, k = clamp(a / h.ms), e = 1 - (1 - k) ** 2;
      const x = h.x0 + (h.x1 - h.x0) * e + side * 13 * Math.min(1, k * 3), y = h.y0 + (h.y1 - h.y0) * e + side * 5;
      const bob = k < 1 ? -Math.abs(Math.sin(a / 70)) * 5 : -Math.abs(Math.sin(a / 140)) * 3;
      g.globalAlpha = clamp((h.ms + 1400 - a) / 300);
      shadow(x, y + 12, 20);
      faceFrame(g, img(face(h.id)), x, y - 4 + bob, 24, 'normal');
      if (k >= 1) { const en = st.enemies[h.enemy]; if (en) { const ep = pos(en); bitmap(g, 'star', ep.x * TILE + Math.sin(a / 90) * 8, ep.y * TILE - 20, 1, GOLD); } }
      g.globalAlpha = 1;
    }
    fx.projs = fx.projs.filter(p => t - p.born < p.ms);
    for (const p of fx.projs) {
      const a = t - p.born;
      if (a < 0) continue;
      const k = a / p.ms, x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k - Math.sin(Math.PI * k) * p.h;
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
    for (const b of fx.bolts) { // Hack-Blitz: Zickzack in Türkis, neu gewürfelt alle 50 ms
      const seed = Math.floor(rt / 50);
      g.beginPath(); g.moveTo(b.x0, b.y0);
      for (let k = 1; k < 8; k++) g.lineTo(b.x0 + (b.x1 - b.x0) * k / 8 + (hash(seed, k) - 0.5) * 12, b.y0 + (b.y1 - b.y0) * k / 8 + (hash(seed, k, 1) - 0.5) * 12);
      g.lineTo(b.x1, b.y1);
      g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.strokeStyle = TEAL; g.lineWidth = 2; g.stroke();
    }
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
    for (const l of labels) { const s = toScreen(l.wx, l.wy); if (vis(s)) pixelText(l.t, Math.round(s.x), Math.round(s.y), l.color, l.size); }
    const faces = st.units.map(u => { const p = upos(u), s = toScreen(p.x * TILE, p.y * TILE), r = 17 * zoom; return { i: u.i, down: u.down, x: s.x - r, y: s.y - r, w: 2 * r, h: 2 * r }; });
    fx.bubbles = fx.bubbles.filter(b => gt - b.born < b.ms);
    // Gesichter der Rüther freihalten: Blasen weichen ihnen nach oben aus
    const avoid = faces.filter(f => !f.down).map(({ x, y, w, h }) => ({ x, y, w, h })), nFaces = avoid.length;
    for (let k = fx.bubbles.length - 1; k >= 0; k--) { // neueste zuerst an ihren Platz, ältere weichen nach oben aus
      const b = fx.bubbles[k], p = at(b.ref), s = toScreen(p.x, p.y);
      if (s.x < -8 || s.x > vw + 8 || s.y < -8 || s.y > vh + 80) continue; // unten mehr Rand: die Blase sitzt über dem Kopf
      bubble(g, s.x, s.y - 32 * zoom - 10, b.t, { vw, maxW: Math.min(170, vw - 40), avoid, head: s.y - 15 * zoom });
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
    }
  }

  function placeMenu() {
    if (menuFor < 0) return;
    const p = upos(st.units[menuFor]), s = toScreen(p.x * TILE, p.y * TILE);
    const x = clamp(s.x, 118, vw - 118), y = clamp(s.y, 112, vh - 96);
    ringEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  // ---------- Schleife ----------
  function frame(ts) {
    if (!running) return;
    rt = ts;
    const real = Math.min(MAX_CATCHUP, lastTs ? Math.max(0, ts - lastTs) : 16);
    lastTs = ts; frameDt = real;
    if (!st.over && !paused) {
      acc += real;
      while (acc >= STEP && !st.over) { snap(); handle(tick(st, STEP)); acc -= STEP; }
      if (!st.over && !warned && st.timeLimit - st.time <= 60_000) { warned = true; msg('Noch 1 Minute!'); sfx.play('warn'); }
    } else if (st.over) overClock += real;
    gt = Math.max(0, st.time - STEP + acc + overClock);
    if (vw && vh) draw();
    hud();
    raf = requestAnimationFrame(frame);
  }

  async function start({ mission, variant, team, fighters, rng = Math.random, tutorial } = {}) {
    stop();
    const run = seq;
    const squad = (fighters?.length ? fighters : team || []).slice(0, 3).map(f => (f.maxBtc ? f : makeFighter(RUETHER_BY_ID[f.id], f)));
    st = createQuest({ mission, variant, team: squad, rng });
    th = THEMES[st.theme] || THEMES.neuschwabenland;
    el.dataset.theme = st.theme;
    goalIco.src = GOAL_ART[st.objective.type];
    setText(goalLabel, st.objective.label);
    buildTeam();
    sel = [0]; powersKey = ''; follow = true; zoom = 1.25;
    cam = { x: st.units[0].x * TILE, y: st.units[0].y * TILE };
    resize();
    await Promise.all([...ART, ...st.units.map(u => face(u.id))].map(loadImg));
    if (run !== seq) return; // inzwischen gestoppt oder neu gestartet
    mapCv = paintMap(st, th);
    gasPat = dither(g, 'rgba(91,181,90,.95)', 'rgba(155,227,107,.6)');
    doorH = st.doors.map(d => doorHoriz(st, d));
    const xs = st.pads.map(p => p.x), ys = st.pads.map(p => p.y);
    pad = st.pads.length ? { x: (Math.min(...xs) + Math.max(...xs) + 1) / 2, y: (Math.min(...ys) + Math.max(...ys) + 1) / 2, y0: Math.min(...ys), y1: Math.max(...ys) + 1 } : null;
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    running = true; paused = true; lastTs = 0;
    raf = requestAnimationFrame(frame);
    showIntro(tutorial ?? !tutSeen());
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
    prev = new WeakMap(); flash = new WeakMap(); popAt = new WeakMap(); doorAt.clear(); effAt.clear(); ptrs.clear(); gesture = null;
    acc = 0; overClock = 0; gt = 0; paused = false; ending = null; ended = false; inspect = null; lastTap = {}; reached = false; warned = false; quitAsk = false;
    tut = -1; endAim(); closeMenu();
    for (const n of [tutEl, cardEl, stampEl, msgEl, pausedEl]) n.classList.add('hidden');
    edge.className = 'q-edge';
  }

  // debug(): Zustand und Kachel → Bildschirmpunkt (CSS-px im Canvas) für Tests und das Debug-Panel
  const debug = () => ({ st, paused, sel, aim, menuFor, tile: (x, y) => toScreen(x * TILE, y * TILE) });
  return { start, stop, debug };
}
