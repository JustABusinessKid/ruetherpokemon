import { CONST, RARITIES, RARITY_BY_ID, LINES, pickLine } from './data.js';
import { createBattle, tick, msToChargedWarn } from './battle.js';
import { sfx, haptic } from './audio.js';
import { playSheet, propFx, confetti, floatText, btcRain, banner } from './fx.js';
import { hashrateText, isNarration } from './format.js';

// Kampf-Bildschirm: VS-Intro mit Countdown, requestAnimationFrame-Schleife um die Engine,
// Pointer-Eingabe, Events → Grafik-Effekte aus art/ über js/fx.js (Requisiten mit echten Gesichtern als Reiter, Sheets,
// Zahlen, ₿-Regen, Banner, Sprechblasen), kampfeigene Kleinanimationen in css/battle.css, Sounds, Haptik, Combo, Wut, End-Overlay.
// Gegner-Sprüche und Ausrufe stehen in der eigenen Blase .enemy-say unter der Gegner-Leiste, außerhalb der Bühne (Spec v7 §2c).
// Spezial-Attacken laufen als Kinosequenz: die Spielzeit friert ein (pauseUntil), Banner mit Gesicht + Spruch (Spec §6).
// createBattleScreen({ el, onEnd, onResult, onEvent }) -> { start({ team, enemy, rng, mode, arena, arenaLevel, reward, masteredAfter, wild, shownLine, canRetry }), stop() }
// shownLine: appear-Spruch, der schon vor dem Kampf zu sehen war (Beschwörungs-Banner); das Intro nimmt einen anderen.
// mode 'arena' | 'wild' | 'haunebu'; wild = { id, rarity, name } (Gegner = wilder Rüther mit echtem Gesicht, kein „Nochmal").
// 'haunebu' (v7): Beschwörung aus dem Shop gegen Hitler, ohne arena; Sieg = Flugscheibe erbeutet, kein „Nochmal".
// Gegner-Helfer (v7b, Wolfsschanzen-Beschwörung): state.enemySummons → .enemy-helpers neben dem Boss (art/boss-<id>.png).
// Tachionenbitcoin (v8, Neuschwabenland): eigene Kampfdauer enemy.duration (Timer, Intro), Pixel-Echos, Riss, Negativ, Zeitschleife.
// onResult({ won, reason, activeIndex }) genau einmal pro Kampf, sobald er entschieden ist (Engine-Ende oder Aufgeben, reason 'quit'):
// dort verbucht die App und speichert, damit Neuladen oder App-Kill vor „Weiter" nichts verliert.
// onEnd({ won, retry, reason, activeIndex }) genau einmal pro Kampf danach: Overlay-Button oder Aufgeben, nur noch Navigation.
// canRetry(): false blendet „Nochmal" aus (Haunebu-Fenster inzwischen zu).
// onEvent(e) für jedes Engine-Event, zusätzlich { type: 'combo', value } bei jeder Combo-Erhöhung.

const sprite = id => `sprites/${id}.png`;
const bossArt = id => `art/boss-${id}.png`;
const BOSS_FALLBACK = 'sprites/unknown.png'; // fehlt art/boss-<id>.png noch (Spec v7 §7)
const HAUNEBU_ART = 'art/fx-haunebu.png';
const ICON_FALLBACK = 'art/icon-coin.png';
function icon(name, cls = '') {
  const i = Object.assign(document.createElement('img'), { className: `ico ${cls}`.trim(), src: `art/icon-${name}.png`, alt: '' });
  i.addEventListener('error', () => { if (!i.src.endsWith(ICON_FALLBACK)) i.src = ICON_FALLBACK; });
  return i;
}
const fmt = n => n.toLocaleString('de-DE');
const freshInput = () => ({ taps: 0, dodge: false, special: null, switchTo: null });
const RARITY_COLORS = RARITIES.map(r => `var(--r-${r.id})`);
// Ankerpunkte auf der Bühne = die Pfad-Anker aus css/theme.css (--fx-enemy-*, --fx-me-*), Texte etwas darüber.
// hit = Tipp-Treffer am Gegner (--fx-hit-*, css/battle.css): rechts neben dem Gesicht, solange dort ein echtes ist
const AT = { enemy: { x: 'var(--fx-enemy-x)', y: 'var(--fx-enemy-y)' }, me: { x: 'var(--fx-me-x)', y: 'var(--fx-me-y)' }, hit: { x: 'var(--fx-hit-x)', y: 'var(--fx-hit-y)' } };
// Zahlen am Gegner über den Tipp-Treffern (nicht über den rechten Rand); bei mir: --fx-me-num-y (css/battle.css), über der
// Helferreihe, solange Christian und Micha dort stehen; beside = rechts neben meinem Gesicht im Flugscheiben-Strahl;
// wildMe = bei mir im Wildkampf: rechts neben seinem echten Gesicht unter den Tipp-Zahlen (sein Rempler geht nach links unten), wenig Streuung
const TXT = {
  enemy: { x: 'min(var(--fx-hit-x), calc(100% - 44px))', y: 'calc(var(--fx-hit-y) - 12%)' },
  me: { x: 'calc(var(--fx-me-x) + 4%)', y: 'var(--fx-me-num-y)' },
  beside: { x: 'calc(var(--fx-me-x) + 30%)', y: 'var(--fx-me-num-y)' },
  wildMe: { x: 'calc(100% - 40px)', y: 'var(--fx-me-num-y)', spread: 32 },
};
// Info-Texte zum eigenen Rüther (Ausgewichen!, … du bist dran!): mittig, damit lange Namen nicht links aus der Bühne laufen,
// 12 % über den Schadenszahlen; im Wildkampf unter seinem echten Gesicht (--fx-info-me-y, css/battle.css).
// Kurze (Ausgewichen!, betäubt, im Strahl) weichen der angekündigten bzw. letzten Boss-Attacke aus: bei der Krupp-Rede nach links
// (Sprechblase rechts), im Flugscheiben-Strahl nach rechts (mein Gesicht steigt links hoch), im Wildkampf rechts der Mitte
// (meine Reiter-Requisiten steigen links vom Bühnenboden auf)
const INFO_ME = { x: '50%', y: 'var(--fx-info-me-y)' };
const INFO_SIDE = { krupp: '30%', ray: '60%' }, INFO_WILD = '64%';
// Wildkampf: Hinweise zum Gegner (geschwächt) ebenso unten rechts der Mitte; neben seinem echten Gesicht ragten lange Wörter hinein
const INFO_WILD_ENEMY = { x: INFO_WILD, y: INFO_ME.y };
const jitter = (x, px) => `calc(${x} + ${Math.round((Math.random() - 0.5) * px)}px)`;
// Einschlag-Sheet wächst mit dem Schaden: Tipp (3) ≈ 76 px, Spezial (40) = 224 px
const impactSize = dmg => Math.min(256, 64 + Math.round(dmg) * 4);
// Beben nach Schaden: klein < 15, mittel < 30, groß darüber; Lade-Attacken mindestens mittel
const quakeFor = (dmg, charged) => dmg >= 30 ? 'quake-l' : dmg >= 15 || charged ? 'quake-m' : 'quake-s';
const QUAKE_MS = { 'quake-s': 300, 'quake-m': 500, 'quake-l': 700 };
const COUNTDOWN = ['3', '2', '1', 'Kampf!'];
const COUNT_STEP = 500, INTRO_LEAD = CONST.INTRO_MS - COUNTDOWN.length * COUNT_STEP;
const COMBO_HIDE = 1000;
// Freeze je Spezial-Attacke (Spec §6), sonst CONST.CINEMATIC_MS
const FREEZE = { 'chart-up': 2400, handshake: 1600, can: 1500, handbag: 1500, controller: 1500, wallet: 2000, gas: 1800, speech: 2200, mms: 1600, bags: 1400, family: 1400 };
// Höhe, die Requisit mit Reiter samt Zugabe (css/battle.css) zwischen Brett und Bühnenboden braucht: [px bei voller Größe, Anteil der
// Bühnenhöhe]. Fehlt sie (kleine Bühne), verkleinert --k Requisit und Zugabe, damit das echte Gesicht ganz drin bleibt
const NEED = { 'chart-up': [142, 0], handshake: [200, 0], can: [182, 0], handbag: [191, 0], controller: [192, 0], bags: [174, 0], gas: [172, 0.1], mms: [148, 0.1], wallet: [161, 0] };
const BOSS_SLOW = 1.4; // Boss-Requisiten laufen 1,4× so lang (ohne Freeze)
const slow = ms => Math.round(ms * BOSS_SLOW);
const arcHit = ms => Math.round(ms * 0.86); // Wurfbahnen (path-arc-to-me) schlagen bei 86 % ein
const LINE_MIN = 8000, LINE_SPREAD = 4000; // Gegner-Sprüche alle 8–12 s Spielzeit
const SAY_MS = 3000; // so lange steht ein Spruch in der Gegner-Blase
// Betäubung des eigenen Rüthers je Gegner-Attacke (fx) als Text; alles andere zeigt den Firmware-Balken der PS3
const STUN_TEXT = { wild: 'sprachlos', fan: 'benebelt', ray: 'im Strahl', causality: 'aus der Zeit gefallen' };
const BUNKER_MS = 1500; // = bt-bunker in css/battle.css
const KRUPP_MS = 1500; // Krupp-Rede kommt alle 2,3 s (Wut 1,8 s): Pult, Wutblase und Sprechblase sind nach ~1,6 s weg
const WOLF_MS = 1600; // Wolfsschanzen-Beschwörung: Banner + Freeze, Goebbels und Himmler rennen derweil über dem Dimmer herein
const bubbleText = s => { const t = document.createElement('span'); t.className = 'bubble-text'; t.textContent = s; return t.outerHTML; };
// Tachionenbitcoin (v8, Neuschwabenland): Pixel-Echos der Münze, Bildschirm-Riss, Zeitschleife. Das Vor-Echo („Ich treff dich,
// bevor ich werfe.") blitzt mit dem Beginn der Warnung auf, nicht mehr davor: wer darauf wischt, ist im Fenster (v11)
const ECHO_ART = 'art/fx-echo.png'; // optional; fehlt es, ist das Echo eine getönte Kopie des Boss-Bilds
const ECHO_DASH_MS = 420, ECHO_GAP = 70; // = bt-echo-dash in css/battle.css; 3 Echos gestaffelt
const REWIND_MS = 1400; // Zeitschleife: so lange spult die Bühne zurück
const CRACK_LINES = ['62,0 55,14 60,22 48,38 53,47 41,63 46,72 35,88 38,100', '48,38 30,44 22,40', '53,47 70,55 78,52', '41,63 28,70', '46,72 60,82 66,92'];
const CRACK_SVG = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" shape-rendering="crispEdges">${['k', 'v', 'p'].map(c => CRACK_LINES.map(l => `<polyline class="${c}" points="${l}"/>`).join('')).join('')}</svg>`;
const HEAT_WAVE_AT = 280; // Dosenbier-Aufguss: die Hitzewelle rollt los, sobald die Dose auf der Heizung klatscht

// Abwehr (v11): Boss-Angriffe fliegen schon während der Warnung und schlagen genau beim Feuern der Engine ein (firesAt);
// wer auf das fliegende Requisit wischt, ist also noch im Fenster. BOSS_HIT = ms vom Start der Animation bis zum Einschlag
// bei mir, nie länger als die Warnzeit (test/dodge.test.mjs). 0 = startet erst beim Feuern (Heilung am Boss, Banner, Firmware-Balken).
const BOSS_HIT = {
  disc: slow(360), yellow: slow(450), firmware: 0, crash: slow(550), chain: slow(650), mining: 0, block: slow(360), half: slow(500), key: 0,
  heat: HEAT_WAVE_AT + arcHit(slow(400)), overheat: arcHit(slow(900)), fan: arcHit(slow(900)), found: slow(450),
  krupp: 450, wolfsschanze: 0, ray: slow(500), bunker: Math.round(BUNKER_MS * 0.75),
  tachyon: 2 * ECHO_GAP + Math.round(ECHO_DASH_MS * 0.85), thalving: Math.round(slow(900) * 0.72), causality: Math.round(slow(900) * 0.6),
  timeloop: REWIND_MS - 300, 'wild-fast': 220,
  wild: atk => (atk.prop === 'family' ? 760 : atk.damage > 0 ? arcHit(slow(800)) : 0),
};
export const bossHitMs = atk => { const h = BOSS_HIT[atk.fx]; return (typeof h === 'function' ? h(atk) : h) || 0; };
// Wisch = Ausweichen, sobald der Finger SWIPE_PX weit gezogen ist, in jede Richtung (schon beim Ziehen, nicht erst beim Loslassen);
// darunter ist es ein Tipp. Rückgabe: Richtung der Ausweich-Animation oder null
export const SWIPE_PX = 28;
export const swipeDir = (dx, dy) => (Math.hypot(dx, dy) < SWIPE_PX ? null : dx < 0 ? 'left' : 'right');
const MISS_TEXT = { early: 'Zu früh!', late: 'Zu spät!', immune: 'Nicht abwehrbar!' };
const LOCK_TEXT = { ...MISS_TEXT, immune: 'Zwecklos!' }; // auf dem Knopf (116 px): „Nicht abwehrbar!" passt nicht hinein
// „JETZT!" kommt NOW_LEAD ms vor dem Perfekt-Fenster (die Kerbe): wer darauf reagiert (Reaktion + Wisch bis zur Schwelle), landet
// darin. Genau an der Kerbe gezeigt, kam jede Reaktion zu spät (stand nur 300 ms, Reaktion + Wisch dauern länger)
export const NOW_LEAD = 250;
const NOTE_MS = 700; // so lange steht „Ausgewichen!"/„Perfekt!" nach dem Einschlag noch auf dem Knopf
const DODGE_STATES = ['on', 'now', 'fast', 'charged', 'done', 'perfect', 'locked', 'immune'];

export function createBattleScreen({ el, onEnd, onResult, onEvent }) {
  const $ = s => el.querySelector(s);
  const flash = $('.flash'), battleTop = $('.battle-top'), stage = $('.stage'), bgEl = $('.stage .bg'), fx = $('.fx'), helpers = $('.helpers'), comboEl = $('.combo');
  const enemyHelpers = $('.enemy-helpers');
  const enemySay = $('.enemy-say'), sayFace = enemySay.querySelector('.say-face'), sayText = enemySay.querySelector('.say-text');
  const enemySprite = $('.enemy-sprite'), timerEl = $('.timer');
  const enemyPanel = $('.fighter.enemy'), mePanel = $('.fighter.me');
  const frame = mePanel.querySelector('.frame'), meSprite = frame.querySelector('.sprite'), energyFill = mePanel.querySelector('.energy .fill');
  const specials = $('.specials'), sw = $('.switch'), overlay = $('.overlay');
  const intro = $('.intro'), countdown = intro.querySelector('.countdown'), introBoss = intro.querySelector('.intro-boss');
  const introLine = Object.assign(document.createElement('p'), { className: 'intro-line' });
  intro.insertBefore(introLine, countdown);
  for (const img of [enemySprite, introBoss, overlay.querySelector('.boss'), sayFace]) {
    img.addEventListener('error', () => { if (!img.src.endsWith(BOSS_FALLBACK)) img.src = BOSS_FALLBACK; });
  }

  // HUD v6 (Markup aus index.html einmal umgebaut): BTC mit Icon, Hashrate des aktiven Rüthers, Mining-Leiste mit Label
  function slot(parent, iconName) {
    const v = document.createElement('span');
    parent.append(icon(iconName, 'ico-sm'), v);
    return v;
  }
  const enemyBtcEl = enemyPanel.querySelector('.btc'), meBtcEl = mePanel.querySelector('.btc');
  enemyBtcEl.textContent = ''; meBtcEl.textContent = '';
  const enemyBtcV = slot(enemyBtcEl, 'btc'), meBtcV = slot(meBtcEl, 'btc');
  meBtcEl.append(Object.assign(document.createElement('span'), { className: 'sep', textContent: '·' }));
  const meHashV = slot(meBtcEl, 'hashrate');
  const energyBar = mePanel.querySelector('.bar.energy'), mining = document.createElement('div'), miningV = document.createElement('b');
  mining.className = 'mining';
  energyBar.replaceWith(mining);
  mining.append(icon('mining', 'ico-sm'), Object.assign(document.createElement('span'), { textContent: 'Mining' }), energyBar, miningV);
  // v11 Abwehr: Ausweich-Knopf unten rechts in .fx (über Effekten und Banner-Dimmer, unter echten Gesichtern; start() hängt ihn
  // nach dem Aufräumen wieder ein), Warnrahmen als blinkender Pixel-Rand innen an der Bühne statt Vollflächen-Tönung
  const dodgeBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'dodge-btn' });
  dodgeBtn.setAttribute('aria-label', 'Ausweichen');
  dodgeBtn.innerHTML = '<span class="dl"></span><span class="dbar"><i></i></span>';
  const dodgeLabel = dodgeBtn.querySelector('.dl'), dodgeFill = dodgeBtn.querySelector('.dbar i');
  stage.append(flash);
  $('.stage-hint').textContent = 'Tippen: Angriff · Wischen: Ausweichen'; // kürzer, links neben dem Knopf

  let state = null, raf = 0, countRaf = 0, lastTs = 0, running = false, ended = false;
  const ptrs = new Map(); // pointerId -> { x, y, swiped }: jeder Finger für sich (zweiter Daumen tippt, ohne den Wisch zu löschen)
  let input = freshInput(), dodgeDir = 'left', koPending = false, batchDelay = 0, lockText = '', dodgeNote = null, dodgeFloat = null; // dodgeNote: { cls, label, until }
  // Boss-Angriff der laufenden Warnung: { w, hit, launched, impactAt, parts, timers }. Startet so, dass er bei w.firesAt einschlägt
  // (launchShot); bricht die Warnung ab (Betäubung, Boss pleite), verpufft er (cancelShot). shot = Sammler, solange seine
  // Animation Teile anlegt: prop/node/sheet/mega und later() merken sich dort, was beim Abbruch weg muss
  let bossShot = null, shot = null;
  let combo = 0, lastHitAt = -Infinity, stunTextAt = -Infinity;
  let pauseUntil = 0, heldBtc = null, nextLineAt = Infinity, sayTimer = 0, bossFx = '', bossHit = null;
  // Spieler-Leiste wie heldBtc: zeigt Treffer erst beim Einschlag (meHoldUntil) und nach einem K.o. den alten Rüther,
  // bis der neue hereinrutscht (shownMe); so passen Gesicht, Name, Balken und Knöpfe zusammen
  let shownMe = null, meHoldUntil = 0;
  let rede = []; // laufende Krupp-Rede (Pult, Wutblase, Sprechblase): die nächste Rede baut sie ab
  let echoSrc = ECHO_ART;
  let ctx = {}; // { mode, arena, arenaLevel, reward, masteredAfter, wild }
  const timers = new Set();
  const pending = new Map(); // node -> { cls: timerId }: Neustart derselben Animation löscht den alten Entfern-Timer
  const paused = () => performance.now() < pauseUntil;

  // ---------- Timer und Einmal-Animationen (alles wird in stop() aufgeräumt) ----------
  function later(fn, ms, own = shot) {
    const id = setTimeout(() => {
      timers.delete(id);
      const was = shot;
      shot = own;
      try { fn(); } finally { shot = was; }
    }, ms);
    timers.add(id);
    own?.timers.push(id);
    return id;
  }
  const keep = part => { shot?.parts.push(part); return part; };
  function anim(node, cls, ms) {
    const m = pending.get(node) || pending.set(node, {}).get(node);
    if (m[cls]) { clearTimeout(m[cls]); timers.delete(m[cls]); }
    node.classList.remove(cls);
    void node.offsetWidth; // Reflow, damit die Animation neu startet
    node.classList.add(cls);
    const id = m[cls] = later(() => { delete m[cls]; node.classList.remove(cls); }, ms, null); // Klasse fällt immer wieder ab, auch nach Abbruch
    // … und beim Abbruch eines Boss-Wurfs sofort (z. B. Hitler im Bunker unsichtbar, Bühne im Umluft-Wind), solange sie noch seine ist
    if (shot) keep({ stop: () => { if (m[cls] !== id) return; clearTimeout(id); timers.delete(id); delete m[cls]; node.classList.remove(cls); } });
  }
  const setText = (n, s) => { if (n.textContent !== s) n.textContent = s; };
  const setWidth = (n, pct) => { const w = `${pct}%`; if (n.style.width !== w) n.style.width = w; };
  const setFrame = f => { frame.className = `frame r-${f.rarity || 'normal'}`; };

  // ---------- Effekt-Elemente (fx.js; Verzögerungen nur über later(), damit stop() alles abräumt) ----------
  // Kampfeigener Knoten (Tipp-Ring, M&M-Splitter, Münz-Bahn, Mond), entfernt sich nach ms
  function node(cls, ms, parent = fx) {
    const d = document.createElement('div');
    d.className = cls;
    parent.appendChild(d);
    later(() => d.remove(), ms);
    keep({ stop: () => d.remove() });
    return d;
  }
  // Requisit in .fx; vars setzt Pfad-Variablen am Element (--spin, --dx, --rider-*)
  function prop(name, path, opts, vars = {}) {
    const p = keep(propFx(fx, name, path, opts));
    for (const [k, v] of Object.entries(vars)) p.el.style.setProperty(k, v);
    return p;
  }
  // Reiter = echtes Gesicht des Angreifers im Requisit (Spec §0.2)
  const rider = f => ({ rider: f.id, riderRarity: f.rarity || 'normal' });
  const sheet = (name, at, opts = {}) => keep(playSheet(fx, name, { ...AT[at], ...opts }));
  let numSeq = 0; // Zahlen in drei Höhen (−22/0/+22 px) staffeln, damit schnelle Tipps nicht übereinander liegen
  const num = (t, at, kind = 'info', ms = 900) => {
    const p = TXT[at === 'me' && ctx.wild ? 'wildMe' : at];
    return floatText(fx, t, { x: jitter(p.x, p.spread || 60), y: `calc(${p.y} + ${(numSeq++ % 3 - 1) * 22}px)`, kind, ms });
  };
  const dmgNum = (n, at) => num(`-${n}`, at, n >= 25 ? 'big' : 'hurt');
  const text = (t, at, kind = 'info', aside = false) => {
    const x = aside && (INFO_SIDE[state.enemy.warning?.attack.fx || bossFx] || (ctx.wild && INFO_WILD));
    return floatText(fx, t, { ...(at === 'me' ? INFO_ME : ctx.wild ? INFO_WILD_ENEMY : TXT[at]), ...(x && { x }), kind, ms: 1200 });
  };
  function hitEnemy(n) {
    anim(enemySprite, 'shake', 300);
    anim(enemySprite, 'hit', 70); // 2 Frames weiß (echtes Gesicht nur heller, css/battle.css)
    // steht eine Mega-Zahl („+70 °C“) über ihm: Einschlag und Zahl rechts daneben (.side, css/battle.css), nicht darunter
    const side = !!fx.querySelector(':scope > .fx-text.mega');
    sheet('impact', 'hit', { size: impactSize(n) }).el.classList.toggle('side', side);
    later(() => dmgNum(n, 'enemy').el.classList.toggle('side', side), 50);
  }
  // Mega-Zahl über dem Gegner (1,4 s); Tipp-Zahlen und -Einschläge darunter rücken rechts daneben (.side), neue landen dort (hitEnemy)
  function mega(t) {
    fx.querySelectorAll(':scope > .fx-text:not(.burst), :scope > .fx-sheet[data-sheet="impact"]').forEach(n => n.classList.add('side'));
    keep(floatText(fx, t, { x: '50%', y: 'calc(var(--fx-enemy-y) - 10%)', kind: 'mega', ms: 1400 }));
  }
  // Einschlag einer Spezial-Attacke: ₿-Explosion, große Zahl 1,6 s, Beben, Boss blitzt zweimal, ab 20 Schaden ₿-Regen
  function specialHit(n) {
    anim(enemySprite, 'shake', 300);
    anim(enemySprite, 'hit', 70);
    later(() => anim(enemySprite, 'hit', 70), 140);
    sheet('btcburst', 'hit', { size: Math.min(256, 160 + n * 3) }); // wie die Tipp-Treffer neben einem echten Gesicht
    const q = quakeFor(n, true);
    anim(stage, q, QUAKE_MS[q]);
    // unter der Mitte, damit die steigende Zahl nicht hinter dem Banner und „+70 %" verschwindet; Papierweiß auf der goldenen Explosion
    later(() => floatText(fx, `-${n}`, { x: TXT.enemy.x, y: 'calc(var(--fx-hit-y) + 22%)', kind: 'big burst', ms: 1600 }), 50);
    if (n >= 20) btcRain(fx, { n: n >= 40 ? 28 : 18 });
    sfx.play('hit'); haptic(30);
  }
  // 12 kleine M&Ms in den Seltenheitsfarben fliegen vom Boss auseinander
  function mmsBurst() {
    node('mms-burst', 1200).innerHTML = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 2 * Math.PI;
      return `<img src="art/fx-mms.png" alt="" style="--dx:${Math.round(Math.cos(a) * 120)}px;--dy:${Math.round(Math.sin(a) * 100)}px;--c:${RARITY_COLORS[i % RARITY_COLORS.length]}">`;
    }).join('');
  }
  // Drehender Bitcoin wandert vom Boss zum eigenen Rüther: die Hülle läuft die Bahn (css), das Sheet dreht darin
  const drainCoin = () => playSheet(node('drain', 900), 'btcspin', { x: '0px', y: '0px', size: 56, ms: 900 });
  // Familientreffen gegen dich (wilde Hildegard): die echten Christian und Micha rennen von rechts herein und kloppen (nach 760 ms, BOSS_HIT)
  function familyRush() {
    node('rush', 1600).innerHTML = ['christian', 'micha'].map((id, i) => `<img src="${sprite(id)}" alt="" style="--i:${i}">`).join('');
  }
  // Pixel-Echo der Tachionen-Münze (art/fx-echo.png, sonst das Boss-Bild violett-türkis getönt: .self); cls = Bahn in css/battle.css
  function echo(cls, ms, i = 1) {
    const d = node(`echo ${cls}`, ms);
    d.style.setProperty('--i', i);
    const img = Object.assign(document.createElement('img'), { src: echoSrc, alt: '' });
    img.classList.toggle('self', echoSrc !== ECHO_ART);
    img.addEventListener('error', () => {
      if (img.classList.contains('self')) return;
      echoSrc = bossArt(state.enemy.id); // einmal fehlgeschlagen: alle weiteren Echos gleich aus dem Boss-Bild
      img.classList.add('self'); img.src = echoSrc;
    });
    d.appendChild(img);
  }
  // Splitter der zerspringenden Uhr: 10 Pixel-Quadrate fliegen auseinander (Keyframes bt-mms)
  function shards() {
    node('shards', 900).innerHTML = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * 2 * Math.PI + 0.3;
      return `<i style="--dx:${Math.round(Math.cos(a) * 110)}px;--dy:${Math.round(Math.sin(a) * 90)}px"></i>`;
    }).join('');
  }
  // Combo: schnelle Treffer mit < COMBO_WINDOW Abstand (Spielzeit), Anzeige ab ×2, ab ×10 „hot"
  function comboHit() {
    const t = state.time;
    combo = t - lastHitAt < CONST.COMBO_WINDOW ? combo + 1 : 1;
    lastHitAt = t;
    onEvent?.({ type: 'combo', value: combo });
    if (combo < 2) { comboEl.classList.add('hidden'); return; } // Combo gerissen: alten Zähler sofort weg
    setText(comboEl, `×${combo}`);
    comboEl.classList.remove('hidden');
    comboEl.classList.toggle('hot', combo >= 10);
    anim(comboEl, 'bump', 200);
  }
  function resetCombo() {
    combo = 0; lastHitAt = -Infinity;
    comboEl.className = 'combo hidden';
  }
  // Gegner-Blase (Spec v7 §2c): hängt unter der Gegner-Leiste über der Bühne, Porträt = Boss-Bild bzw. echtes Gesicht
  // im Seltenheitsrahmen. Ein neuer Text ersetzt den alten sofort; shout = Attackenname in Rot. Solange sie steht,
  // rutschen Combo und Gegner-Banner unter sie (.talking, --say-clear = Abstand Bühnen-Oberkante → Blasen-Unterkante)
  let said = null; // was gerade in der Blase steht { line, shout, until }: steht nach einem Spezial-Freeze wieder da
  function talk(line, shout = false, ms = SAY_MS) {
    if (!line) return;
    const w = ctx.wild;
    sayFace.src = w ? sprite(w.id) : bossArt(state.enemy.id);
    sayFace.className = w ? `say-face face r-${w.rarity}` : 'say-face';
    setText(sayText, line);
    enemySay.classList.toggle('shout', shout);
    enemySay.style.top = `${battleTop.offsetTop + battleTop.offsetHeight - 4}px`;
    enemySay.classList.remove('hidden');
    anim(enemySay, 'pop', 300);
    el.style.setProperty('--say-clear', `${enemySay.offsetTop + enemySay.offsetHeight - stage.offsetTop + 6}px`);
    el.classList.add('talking');
    clearTimeout(sayTimer); timers.delete(sayTimer);
    sayTimer = later(hideSay, ms);
    said = { line, shout, until: performance.now() + ms };
  }
  function hideSay() { enemySay.classList.add('hidden'); el.classList.remove('talking'); said = null; }
  // Gegner sagt einen Spruch; nächster frühestens in 8–12 s Spielzeit. Nur wenn er ausreden kann, bevor der Ausruf
  // der nächsten Lade-Attacke ihn ersetzt (sonst später nochmal prüfen; der Ausruf legt den nächsten Spruch dahinter)
  function speak(kind = 'fight') {
    if (msToChargedWarn(state) < SAY_MS) return;
    nextLineAt = state.time + LINE_MIN + Math.random() * LINE_SPREAD;
    talk(pickLine(ctx.wild?.id || state.enemy.id, kind));
  }

  // Spezial-Attacken nach attack.fx (Spec §6): Requisit art/fx-<name>.png mit dem Gesicht des Angreifers als Reiter.
  // Rückgabe: ms bis zum Einschlag (₿-Explosion, Zahl, Beben, Folge-Effekte). Die Spielzeit steht derweil (FREEZE).
  const FX = {
    'chart-up'(atk, me) { // Mond hinter dem Boss, Kerzen steigen, Rakete mit Christians Gesicht auf dem Rumpf (unter dem Banner),
      // Einschlag und „+70 %" erst, wenn sie ausgeblendet ist (80 % von 1400 ms ab 500 ms), sonst lägen sie auf seinem Gesicht
      node('moon', 2600, bgEl);
      prop('candles', 'rise-from-bottom', { ms: 1600, size: 256 });
      later(() => prop('btc-rocket', 'launch', { ms: 1400, size: 176, ...rider(me) }, { '--rider-x': '34%', '--rider-y': '40%', '--rider-size': '42%' }), 500);
      later(() => mega('+70 %'), 1650);
      return 1650;
    },
    handshake(atk, me) {
      prop('handshake', 'pulse-at-enemy', { ms: 1600, size: 160, ...rider(me) }, { '--rider-x': '-30%', '--rider-y': '-8%', '--rider-size': '46%' });
      later(() => sheet('sparkle', 'enemy', { x: 'calc(var(--fx-enemy-x) + 14%)', size: 112, ms: 900 }), 500);
      return 800;
    },
    can(atk, me) { // Christian wirft: sein Gesicht fliegt hinter der Dose mit, Schaum am Ziel
      prop('beer-can', 'arc-to-enemy', { ms: 1100, size: 112, ...rider(me) }, { '--spin': '40deg', '--rider-x': '-26%', '--rider-y': '-22%', '--rider-size': '52%', '--rider-z': '-1' });
      later(() => sheet('smoke', 'enemy', { size: 112 }), 900);
      return 900;
    },
    handbag(atk, me) { prop('handbag', 'arc-to-enemy', { ms: 1100, size: 128, ...rider(me) }, { '--spin': '30deg', '--rider-x': '30%', '--rider-y': '-34%' }); return 900; },
    controller(atk, me) { prop('controller', 'arc-to-enemy', { ms: 1100, size: 112, ...rider(me) }, { '--rider-x': '28%', '--rider-y': '-38%', '--rider-size': '48%' }); return 900; },
    wallet(atk, me) { // Controller klappt zur Hardware-Wallet um (Michas Gesicht dahinter), Bitcoins rollen vom Boss herüber
      prop('controller', 'morph-at-me', { ms: 600, size: 112 });
      later(() => prop('wallet', 'morph-at-me', { ms: 1400, size: 128, ...rider(me) }, { '--rider-x': '46%', '--rider-y': '-26%', '--rider-size': '50%', '--rider-z': '-1' }), 500);
      [900, 1050, 1200].forEach(t => later(drainCoin, t));
      return 1100;
    },
    gas(atk, me) { // Viktors grünes Gesicht mitten in der Wolke
      prop('gas', 'rise-at-enemy', { ms: 1800, size: 208, ...rider(me) }, { '--rider-x': '30%', '--rider-y': '24%', '--rider-size': '40%', '--rider-filter': 'sepia(1) hue-rotate(60deg) saturate(2.2)' });
      sheet('smoke', 'enemy', { y: '62%', size: 192 });
      later(() => sheet('smoke', 'enemy', { y: '50%', size: 160 }), 800);
      return 600;
    },
    speech(atk, me) { // Sprechblase hängt an Viktors großem Gesicht, der Boss kippt grau (stun → render). Im Wildkampf kleiner unten
      // rechts mit Viktors Gesicht unter dem Text am Zipfel; das echte Gesicht des Gegners weicht derweil nach links aus (.aside, css/battle.css)
      const w = !!ctx.wild;
      if (w) anim(stage, 'aside', 2200);
      prop('speech', 'bubble-at-me', { ms: 2200, size: w ? 160 : 208, html: bubbleText(atk.flavour || pickLine(me.id, 'fight')), ...rider(me) },
        w ? { '--rider-x': '30%', '--rider-y': '70%', '--rider-size': '40%' } : { '--rider-x': '-34%', '--rider-y': '64%', '--rider-size': '54%' });
      return 400;
    },
    mms(atk, me) { prop('mms', 'rise-at-enemy', { ms: 1600, size: 160, ...rider(me) }, { '--rider-x': '28%', '--rider-y': '34%' }); later(mmsBurst, 500); return 700; }, // Gesicht im Haufen, sonst steckt es unter dem Banner
    bags(atk, me) { // drei Tüten, Ramonas Gesicht auf der mittleren; die Heilung bringt den kleinen ₿-Regen
      [-1, 0, 1].forEach(i => later(() => prop('bags', 'arc-to-enemy', { ms: 900, size: 96, ...(i === 0 ? rider(me) : {}) }, { '--dx': `${i * 48}px`, '--spin': '20deg', '--rider-y': '-44%', '--rider-size': '56%' }), (i + 1) * 150));
      return 600;
    },
    family() { return 0; }, // die echten Christian und Micha kommen mit dem summoned-Event
  };
  // Gegner-Attacken nach attack.fx, 1,4× so lang wie in v5. Einschlag bei mir nach BOSS_HIT[fx] ms (launchShot startet sie
  // so, dass er auf firesAt fällt). Requisit fliegt vom Gegner zu mir, ohne Drehung; Einschlag bei 86 % (path-arc-to-me)
  const toMe = (name, ms, size) => prop(name, 'arc-to-me', { ms, size }, { '--spin': '0deg' });
  const BOSS_FX = {
    disc() { prop('disc', 'drop-on-me', { ms: slow(500), size: 96 }); },
    yellow() { prop('yellow-light', 'rise-at-enemy', { ms: slow(1200), size: 192 }); },
    firmware() {}, // Requisit mit laufendem Balken kommt mit dem stun-Event (bar-on-me)
    crash() { prop('crash', 'crash-at-me', { ms: slow(700), size: 144 }); },
    chain() { prop('chain', 'drop-on-me', { ms: slow(900), size: 144 }); }, // drop-on-me rasselt nach dem Aufprall
    mining() { prop('pickaxe', 'swing-at-enemy', { ms: slow(900), size: 144 }); },
    block() { prop('block', 'drop-on-me', { ms: slow(500), size: 112 }); },
    half() { prop('halving', 'drop-on-me', { ms: slow(700), size: 192 }); },
    key() { prop('key', 'rise-at-enemy', { ms: slow(1200), size: 128 }); },
    // Bitcoin-Heizung (Keller): Aufguss, Überhitzung mit rot glühender Kulisse, Umluft weht die Bühne durch, Strom-Heilung.
    // Wer im Attackennamen steckt, ist mit echtem Gesicht dabei (Spec v7 §1): Viktor in der Gaswolke, Hildegard auf der Handtasche.
    heat() { // Dosenbier klatscht auf die Heizung, Dampf, dann rollt die Hitzewelle auf mich (passt in die 800 ms Warnzeit)
      prop('beer-can', 'arc-to-enemy', { ms: slow(250), size: 80 }, { '--spin': '40deg' });
      later(() => sheet('smoke', 'enemy', { size: 128 }), HEAT_WAVE_AT);
      later(() => toMe('heat', slow(400), 128), HEAT_WAVE_AT);
    },
    overheat() {
      toMe('heat', slow(900), 224);
      later(() => mega('+70 °C'), slow(200));
      later(() => anim(stage, 'overheat', 1000), BOSS_HIT.overheat);
    },
    // fan, found, ray: Ausruf-Blase weg, sobald ein echtes Gesicht losfliegt (Viktors bzw. Hildegards und meins im Strahl steigen
    // auf kleinen Bühnen bis unter sie); bis dahin steht dort der Attackenname
    fan() { // Lüfter dreht, bläst Viktors grüne Gaswolke mit seinem echten Gesicht auf mich
      later(hideSay, 300);
      prop('fan', 'spin-at-enemy', { ms: slow(1400), size: 176 });
      anim(stage, 'blow', slow(1400));
      anim(stage, 'side-hits', slow(900)); // Tipp-Treffer rechts neben Viktors Gesicht, solange er losfliegt
      prop('gas', 'arc-to-me', { ms: slow(900), size: 176, rider: 'viktor' }, { '--spin': '0deg', '--rider-x': '30%', '--rider-y': '24%', '--rider-size': '40%', '--rider-filter': 'sepia(1) hue-rotate(60deg) saturate(2.2)' });
    },
    found() { // Hildegard reitet auf ihrer Handtasche von unten zur Heizung und zahlt: ₿-Explosion, Heilung
      later(hideSay, slow(300));
      prop('handbag', 'rise-from-bottom', { ms: slow(1000), size: 128, rider: 'hildegard' }, { '--rider-x': '30%', '--rider-y': '-34%' });
      anim(stage, 'side-hits', slow(1000)); // Tipp-Treffer und Heilung rechts neben Hildegards Gesicht
      later(() => sheet('btcburst', 'enemy', { size: 208 }), BOSS_HIT.found);
    },
    // Adolf Hitler (Haunebu, lächerlicher Verlierer): Krupp-Rede, Wolfsschanzen-Beschwörung, Flugscheiben-Strahl, ab in den Bunker
    krupp(atk) { // Rednerpult steigt vor ihm hoch, er bebt, „!!", Sprechblase mit einem flavour-Text auf mich
      rede.forEach(p => p.stop());
      anim(enemySprite, 'shake', 300);
      later(() => anim(enemySprite, 'shake', 300), 300);
      const lines = [].concat(atk.flavour || []);
      const line = lines[Math.floor(Math.random() * lines.length)] || pickLine(state.enemy.id, 'fight') || '';
      // Sprechblase mit fx.js-delay statt later(): ihr stop() bricht auch das verzögerte Einhängen ab (nächste Rede, stop())
      const speech = prop('speech', 'bubble-at-me', { ms: KRUPP_MS - 250, delay: 250, size: 160, html: bubbleText(line) });
      speech.el.classList.add('krupp-speech'); // unten rechts, Zipfel zeigt auf ihn (css/battle.css)
      rede = [prop('lectern', 'lectern-up', { ms: KRUPP_MS, size: 144 }), prop('rant', 'rant-pop', { ms: 700, size: 72 }), speech];
    },
    wolfsschanze(atk) { // Holzbanner, Spielzeit steht; Goebbels und Himmler kommen mit dem enemySummoned-Event
      pauseUntil = Math.max(pauseUntil, performance.now() + WOLF_MS);
      hideSay(); // das Banner trägt den Namen selbst; der Ausruf stand die 1,2 s Warnzeit davor
      banner(fx, { title: `${atk.name}!`, sub: 'Goebbels! Himmler! Sofort zu mir!', portrait: bossArt(state.enemy.id), ms: WOLF_MS });
    },
    ray(atk, me) { // Flugscheibe schwebt über mir ein, der Strahl zieht mein echtes Gesicht (Reiter) hoch
      const ms = slow(1400);
      prop('haunebu', 'hover-over-me', { ms, size: 144 });
      later(() => {
        hideSay();
        prop('tractor-beam', 'beam-on-me', { ms: ms - slow(300), size: 208, ...rider(me) }, { '--rider-x': 'calc(50% - 40px)', '--rider-y': 'calc(100% - 92px)', '--rider-size': '80px' });
      }, slow(300));
    },
    bunker() { anim(enemySprite, 'hide', BUNKER_MS); sheet('smoke', 'enemy', { size: 176 }); }, // Heilung, wenn er wieder auftaucht
    // Tachionenbitcoin (v8, Neuschwabenland). Überlicht-Hash: 3 Pixel-Echos rasen gestaffelt auf mich (das Vor-Echo kam mit der Warnung)
    tachyon() {
      anim(enemySprite, 'blink', 240);
      for (let i = 0; i < 3; i++) later(() => echo('echo-dash', ECHO_DASH_MS, i), i * ECHO_GAP);
    },
    // Riss, Negativ und Glitch sind der Treffer: ausgewichen (shot.w = Warnung bzw. enemyAttack-Event) fallen sie weg wie sonst das Beben
    thalving() { // riesige Halving-Münze in Violett fällt auf mich, beim Aufprall (72 % von drop-on-me) reißt der Bildschirm
      prop('halving', 'drop-on-me', { ms: slow(900), size: 240 }).el.classList.add('thalving');
      later(() => { if (!shot?.w.dodged) node('crack', 1400).innerHTML = CRACK_SVG; }, BOSS_HIT.thalving);
    },
    causality() { // Uhr zwischen uns tickt rückwärts und zerspringt (60 % von bt-clock-burst); Bühne flackert negativ, meine Leiste glitcht
      prop('clock', 'clock-burst', { ms: slow(900), size: 128 });
      later(() => { shards(); if (!shot?.w.dodged) { anim(stage, 'negative', 700); anim(mePanel, 'glitch', 900); } }, BOSS_HIT.causality);
    },
    timeloop() { // Bühne spult zurück (Bandstreifen, ◀◀ in Pixeln), die Echos fliegen rückwärts in die Münze, dann heilt sie
      anim(stage, 'rewind', REWIND_MS);
      node('rewind', REWIND_MS).innerHTML = '<span class="rew"></span>';
      for (let i = 0; i < 3; i++) later(() => echo('echo-back', ECHO_DASH_MS, i), 200 + i * 150);
    },
    // Wilder Rüther: Rempler = er springt nach vorn; Lade-Attacke = sein Requisit mit seinem Gesicht fliegt zu dir
    'wild-fast'() { anim(enemySprite, 'lunge', 450); },
    wild(atk) {
      if (atk.prop === 'family') return familyRush();
      const hits = atk.damage > 0, size = atk.prop === 'speech' ? 176 : 128;
      const html = atk.prop === 'speech' ? bubbleText(atk.flavour || pickLine(atk.ownerId, 'fight')) : '';
      // Gesicht im Requisit statt darüber: am Scheitel von Bogen bzw. Aufstieg steckte es sonst unter der Gegner-Blase
      // (sein Ausruf steht dort); bei der Sprechblase unter dem Text. Vor seinem echten Gesicht eingehängt: kommt hinter ihm hervor
      const p = prop(atk.prop || 'chart-up', hits ? 'arc-to-me' : 'rise-at-enemy', { ms: slow(800), size, html, rider: atk.ownerId || ctx.wild?.id, riderRarity: ctx.wild?.rarity || 'normal' },
        // Sprechblase: Viktors Gesicht unter dem Text ragt um −30° gedreht bis me-y + 112 px, beim Ausblenden (1,075×) bis 126 px:
        // höher landen, sonst schnitte der Bühnenboden es ab
        { '--spin': '-30deg', '--rider-x': '30%', '--rider-y': atk.prop === 'speech' ? '72%' : '34%', ...(atk.prop === 'speech' && { '--fx-me-y': 'min(86%, calc(100% - 128px))' }) });
      p.el.classList.add('from-face');
      fx.prepend(p.el);
    },
  };
  const run = (table, atk, me) => (table[atk.fx] || (() => 0))(atk, me);
  // Boss-Animation mit Sammler b starten: alles, was sie anlegt, landet in b.parts/b.timers
  function own(b, fn) {
    const was = shot;
    shot = b;
    try { fn(); } finally { shot = was; }
  }
  // Wurf der laufenden Warnung starten, sobald er bis firesAt genau einschlägt (Spielzeit: im Freeze fliegt nichts los)
  function launchShot() {
    const b = bossShot, w = state.enemy.warning;
    if (!b) return;
    if (state.over || w !== b.w) return cancelShot(); // Betäubung, Boss pleite: der Wurf verpufft
    if (b.launched || !b.hit || paused() || state.time < w.firesAt - b.hit) return;
    b.launched = true;
    b.impactAt = performance.now() + b.hit;
    own(b, () => run(BOSS_FX, w.attack, state.team[state.active]));
  }
  function cancelShot() {
    const b = bossShot;
    bossShot = null;
    if (!b) return;
    for (const id of b.timers) { clearTimeout(id); timers.delete(id); }
    b.parts.forEach(p => p.stop());
  }

  // ---------- Events → Animationen ----------
  function handle(e) {
    onEvent?.(e);
    const at = e.target === 'me' ? 'me' : 'enemy';
    switch (e.type) {
      case 'fast': hitEnemy(e.damage); comboHit(); break;
      case 'special': { // Kinosequenz: Spielzeit steht, Banner mit Gesicht + Spruch, Requisit mit Reiter, dann Einschlag
        const me = e.fighter, atk = e.attack, freeze = FREEZE[atk.fx] || CONST.CINEMATIC_MS; // e.fighter: KO-Wechsel im selben Schritt steht schon in state.active
        // Ein Boss-Wurf, der schon fliegt, liefe im Freeze weiter (CSS-Animation, Echtzeit) und schlüge sichtbar ein, obwohl das
        // Fenster noch offen ist: abbrechen, nach dem Freeze neu werfen (launchShot) und den Einschlag der Engine so weit schieben,
        // dass er wieder genau aufs Requisit fällt. Der Wurf dauert nie länger als die Warnung (BOSS_HIT)
        if (bossShot?.launched && bossShot.impactAt > performance.now()) {
          const b = bossShot;
          cancelShot();
          bossShot = { ...b, launched: false, impactAt: 0, parts: [], timers: [] };
          b.w.firesAt = Math.max(b.w.firesAt, state.time + b.hit);
        }
        pauseUntil = performance.now() + freeze;
        // eigenes Banner oben frei: Reiter-Gesichter der Requisiten liegen knapp darunter. Was der Gegner gerade sagt
        // (z. B. der Ausruf seiner Lade-Attacke, die nach dem Freeze einschlägt), steht danach für den Rest wieder da
        const was = said, rest = said ? said.until - performance.now() : 0;
        hideSay();
        if (rest > 0) later(() => { if (!state.over) talk(was.line, was.shout, Math.max(rest, 1500)); }, freeze);
        const subs = (LINES[me.id]?.fight || []).filter(l => !l.includes(atk.name)); // Spruch wiederholt nicht den Titel
        const board = banner(fx, { title: atk.fx === 'family' ? 'Familientreffen!' : atk.name, sub: subs[Math.floor(Math.random() * subs.length)] || '', portrait: sprite(me.id), rarity: me.rarity, ms: freeze }).el.querySelector('.fx-board');
        const clear = board.offsetTop + board.offsetHeight + 8, h = fx.clientHeight, need = NEED[atk.fx];
        fx.style.setProperty('--board-clear', `${clear}px`); // Unterkante samt Schatten: darunter rückt das Gesicht des Wilden (css/battle.css)
        fx.style.setProperty('--k', need ? Math.max(0.3, Math.min(1, (h - clear - 6 - need[1] * h) / need[0])).toFixed(3) : '1');
        batchDelay = run(FX, atk, me);
        sheet('sparkle', 'me', { size: 128, ms: 700 });
        sfx.play('special'); haptic(20);
        if (e.damage > 0) {
          heldBtc = state.enemy.btc + e.damage; // Lebensbalken fällt erst beim Einschlag
          later(() => { heldBtc = null; specialHit(e.damage); render(); }, batchDelay); // render: nach KO läuft die Schleife nicht mehr
        }
        break;
      }
      case 'specialDenied': anim(specials, 'shake-x', 400); break;
      case 'stunnedTap': { // höchstens ein „betäubt" gleichzeitig (lebt 1,2 s)
        const now = performance.now();
        if (now - stunTextAt > 1200) { stunTextAt = now; text('betäubt', 'me', 'info', true); } // stunTextAt kann in der Zukunft liegen (stun)
        break;
      }
      case 'warn': // Rahmen, Ausholen und der Ausweich-Knopf mit Zeitbalken hängen am Zustand (render), der Wurf startet in launchShot
        sfx.play('warn');
        if (e.dodgeable) haptic(15);
        if (e.kind === 'charged') { // Lade-Attacke (Boss-Spezial bzw. die des Wilden) als Ausruf; schnelle Attacken kämen zu oft
          talk(`${e.attack.name}!`, true);
          nextLineAt = state.time + SAY_MS + 500; // nächster Spruch gleich nach dem Ausruf, damit er vor dem nächsten ausreden kann
        }
        if (e.attack.fx === 'tachyon') { anim(enemySprite, 'blink', 240); echo('echo-pre', 400); } // Vor-Echo = Beginn der Warnung
        cancelShot();
        bossShot = { w: state.enemy.warning, hit: bossHitMs(e.attack), launched: false, impactAt: 0, parts: [], timers: [] };
        break;
      // Mein Gesicht ist schon beim Wischen ausgewichen (dodgeNow); hier die Bestätigung. Perfekt = in den letzten 300 ms
      // Im Wildkampf nur auf dem Knopf: der Text läge unten rechts genau auf ihm und auf dem echten Gesicht des Wilden (Rempler)
      case 'dodge':
        dodgeNote = { cls: e.perfect ? 'done perfect' : 'done', label: e.perfect ? 'Perfekt!' : 'Ausgewichen!', until: performance.now() + e.ms + NOTE_MS };
        if (!ctx.wild) { dodgeFloat?.stop(); dodgeFloat = text(dodgeNote.label, 'me', e.perfect ? 'heal' : 'info', true); }
        if (e.perfect) anim(mining, 'glow', 600); // + Mining-Bonus
        sfx.play('dodge'); haptic(10);
        break;
      case 'dodgeMiss':
        lockText = LOCK_TEXT[e.reason] || ''; dodgeNote = null;
        if (!ctx.wild) { dodgeFloat?.stop(); dodgeFloat = text(MISS_TEXT[e.reason] || '', 'me', 'hurt', true); } // nur die letzte Rückmeldung, sonst stapeln sie sich
        anim(dodgeBtn, 'shake-x', 400);
        break;
      case 'enemyAttack': {
        bossFx = e.attack.fx; bossHit = e.fighter; // eine Betäubung danach im selben Schritt gehört zu dieser Attacke
        // Der Wurf fliegt seit der Warnung und schlägt jetzt ein; kam keiner (Aufholen, Heilung am Boss), startet die Animation jetzt
        const b = bossShot?.w.attack === e.attack ? bossShot : null;
        bossShot = null;
        if (b?.launched) batchDelay = Math.max(0, Math.round(b.impactAt - performance.now()));
        else { batchDelay = bossHitMs(e.attack); own({ w: e, parts: [], timers: [] }, () => run(BOSS_FX, e.attack, e.fighter)); } // nicht abbrechbar, kennt nur dodged
        if (e.dodged && dodgeNote) dodgeNote.until = performance.now() + batchDelay + NOTE_MS; // Rückmeldung bis kurz nach dem sichtbaren Einschlag
        if (batchDelay > 0) { // Balken, BTC und Status (Gift, betäubt) erst beim Einschlag
          const until = meHoldUntil = performance.now() + batchDelay;
          later(() => { if (meHoldUntil === until) meHoldUntil = 0; render(); }, batchDelay); // render: nach KO läuft die Schleife nicht mehr
        }
        const ray = e.attack.fx === 'ray', at = ray ? 'beside' : 'me'; // im Strahl hängt mein echtes Gesicht am Anker: kein Einschlag, Zahl daneben
        if (e.perfect) later(() => sheet('sparkle', at === 'beside' ? 'me' : at, { size: 112, ms: 600 }), batchDelay); // pariert: kein Kratzer
        if (e.damage > 0) later(() => {
          if (e.dodged) { num(`-${e.damage}`, at); return; } // gestreift: kleine graue Zahl, kein Beben
          const q = quakeFor(e.damage, e.kind === 'charged');
          anim(stage, q, QUAKE_MS[q]);
          anim(meSprite, 'shake', 300);
          if (!ray) sheet('impact', 'me', { size: impactSize(e.damage) });
          dmgNum(e.damage, at);
          sfx.play('hit'); haptic(20);
        }, batchDelay);
        break;
      }
      case 'poisoned': later(() => sheet('smoke', at, { size: 128 }), batchDelay); break;
      case 'poison': num(`-${e.damage}`, at); break;
      case 'stun': {
        const t = STUN_TEXT[bossFx]; // z. B. Viktors Argumentationslogik: sprachlos, keine PS3-Firmware
        if (at === 'enemy') later(() => { for (let i = 0; i < 3; i++) later(() => num('Z', 'enemy', 'info', 1400), i * 450); }, batchDelay);
        else if (t) { // kein „betäubt" darüber; geht er am Treffer K.o., steht dort nur „… ist pleite!"
          stunTextAt = performance.now() + batchDelay;
          if (bossHit?.btc > 0) later(() => text(t, 'me', 'info', true), batchDelay);
        }
        else later(() => prop('firmware', 'bar-on-me', { ms: e.ms, size: 144, html: '<span class="fw-label">Firmware-Update…</span>' }), batchDelay);
        break;
      }
      case 'weaken': later(() => text('geschwächt', 'enemy'), batchDelay); break;
      case 'heal':
        later(() => {
          anim(at === 'me' ? mePanel : enemyPanel, 'glow', 900);
          sheet('sparkle', at, { size: 160, ms: 900 });
          if (e.amount > 0) num(`+${e.amount}`, at, 'heal');
          if (at === 'me' && e.amount > 0) btcRain(fx, { n: 12, size: 32 });
        }, batchDelay);
        break;
      case 'summoned': showHelpers(helpers, e.ids || [], sprite, FREEZE.family); break;
      case 'summon': anim(helpers, 'hop', 300); num(`-${e.damage}`, 'enemy'); break;
      case 'enemySummoned': showHelpers(enemyHelpers, e.ids || [], bossArt, WOLF_MS); break;
      case 'enemySummon': anim(enemyHelpers, 'hop', 300); if (e.damage > 0) dmgNum(e.damage, 'me'); break; // beide schlagen im selben Tick: nach KO kein „-0"
      case 'rage': // Wutphase: roter Pixel-Rahmen bleibt bis Kampfende, Boss rot getönt und wackelt, „WUT!", Plakette am Namen (render)
        stage.classList.add('rage');
        anim(enemySprite, 'rage-shake', 1000);
        floatText(fx, 'WUT!', { ...TXT.enemy, kind: 'big wut', ms: 1200 }); // .wut liegt über den Tipp-Zahlen
        sfx.play('rage'); haptic([30, 30, 30, 30, 80]);
        break;
      case 'faint': // KO erst, wenn der auslösende Boss-Angriff eingeschlagen ist. Doppel-K.o. (der nächste geht pleite, bevor er
        // hereingerutscht ist): Leiste und Knöpfe bleiben beim zuletzt gezeigten, bis einer hereinrutscht, der noch steht
        koPending = true; shownMe ||= e.fighter;
        later(() => { meSprite.classList.add('ko'); text(`${e.fighter.name} ist pleite!`, 'me'); }, batchDelay);
        break;
      case 'switch': {
        const f = e.fighter, ko = koPending, gone = shownMe;
        later(() => {
          if (f.btc <= 0) return; // schon wieder pleite (Doppel-K.o.): nicht tot hereinrutschen, der nächste Wechsel folgt
          meSprite.className = 'sprite';
          meSprite.src = sprite(f.id);
          setFrame(f);
          anim(meSprite, 'slide-in', 500);
          text(`${f.name}, du bist dran!`, 'me');
          if (ko && shownMe === gone) { shownMe = null; buildSpecials(); render(); } // erst jetzt Leiste und Knöpfe des neuen
        }, ko ? batchDelay + 1000 : 0); // ko (900 ms) fertig, „ist pleite!" blendet schon aus
        if (!ko) buildSpecials();
        break;
      }
      case 'win':
        onResult?.(result(true, false, state.reason));
        hideSay();
        later(() => { enemySprite.classList.add('ko'); sfx.play('win'); haptic([30, 30, 30]); }, batchDelay);
        later(showOverlay, batchDelay + 900);
        break;
      case 'lose': onResult?.(result(false, false, state.reason)); later(() => sfx.play('lose'), batchDelay); later(showOverlay, batchDelay + 900); break;
    }
  }

  // Familientreffen: die echten Sprites von Christian und Micha rennen neben den eigenen Rüther (wie v3);
  // Wolfsschanzen-Beschwörung: Goebbels und Himmler (art/boss-<id>.png) rennen von links und rechts neben Hitler.
  // Die Ebene hüpft bei jedem Schlag (summon/enemySummon) und verschwindet mit dem Ende der Beschwörung (render)
  function showHelpers(box, ids, src, freeze) {
    box.innerHTML = '';
    box.classList.remove('hidden');
    anim(box, 'arrive', freeze); // während des Freezes über dem Banner-Dimmer, das Hereinrennen ist der Lacher
    ids.forEach((id, i) => {
      const img = Object.assign(document.createElement('img'), { className: 'helper', src: src(id), alt: '' });
      img.addEventListener('error', () => { if (!img.src.endsWith(BOSS_FALLBACK)) img.src = BOSS_FALLBACK; });
      img.dataset.id = id;
      img.style.setProperty('--i', i);
      box.appendChild(img);
    });
  }

  // ---------- Buttons ----------
  function buildSpecials() {
    const me = state.team[state.active];
    specials.innerHTML = '';
    sw.classList.add('hidden');
    me.attacks.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'btn special';
      const n = document.createElement('span'); n.className = 'sname'; n.textContent = a.name;
      const m = document.createElement('span'); m.className = 'smeta';
      const c = document.createElement('b'); c.textContent = a.cost;
      m.append(icon('mining', 'ico-sm'), c, (a.damage ? ` · ${a.damage} Schaden` : '') + (a.heal ? ` · +${a.heal} BTC` : ''));
      b.append(n, m);
      b.addEventListener('click', () => { if (running && !state.over) input.special = i; });
      specials.appendChild(b);
    });
    if (state.team.length > 1) {
      const b = document.createElement('button');
      b.className = 'btn swap'; b.textContent = 'Wechseln';
      b.addEventListener('click', toggleSwitch);
      specials.appendChild(b);
    }
  }
  function toggleSwitch() {
    if (!sw.classList.contains('hidden')) return sw.classList.add('hidden');
    sw.innerHTML = '';
    state.team.forEach((f, i) => {
      if (i === state.active || f.btc <= 0) return;
      const b = document.createElement('button');
      b.className = 'btn';
      const n = document.createElement('span'); n.textContent = f.name;
      const h = document.createElement('span'); h.textContent = `${f.btc} BTC · Mining ${f.energy}`;
      b.append(n, h);
      b.addEventListener('click', () => { input.switchTo = i; sw.classList.add('hidden'); });
      sw.appendChild(b);
    });
    const c = document.createElement('button');
    c.className = 'btn'; c.textContent = 'Abbrechen';
    c.addEventListener('click', () => sw.classList.add('hidden'));
    sw.appendChild(c);
    sw.classList.remove('hidden');
  }

  // ---------- Rendern pro Frame ----------
  // Name und Stufe getrennt: bei wenig Platz (WUT-Plakette) kürzt die Ellipse nur den Namen (css/battle.css)
  for (const p of [enemyPanel, mePanel]) p.querySelector('.fname').innerHTML = '<span class="nm"></span><span class="lv"></span>';
  function panel(p, f, t, btc = f.btc) {
    const name = p.querySelector('.fname');
    setText(name.firstChild, f.name);
    setText(name.lastChild, f.level ? ` · Lv. ${f.level}` : '');
    name.classList.toggle('rage', !!f.rage);
    const pct = Math.max(0, Math.round((100 * btc) / f.maxBtc));
    const fill = p.querySelector('.hp .fill');
    setWidth(fill, pct);
    fill.classList.toggle('low', pct <= 25);
    const st = [f.status.poison && 'Gift', f.status.stunUntil > t && 'betäubt', f.status.weakenedUntil > t && 'geschwächt'].filter(Boolean).join(' · ');
    setText(p.querySelector('.status'), st);
  }
  function render() {
    const t = state.time, e = state.enemy, me = shownMe || state.team[state.active], frozen = paused();
    const eBtc = heldBtc ?? e.btc;
    panel(enemyPanel, e, t, eBtc);
    setText(enemyBtcV, `${eBtc} / ${e.maxBtc} BTC`);
    if (performance.now() >= meHoldUntil) {
      panel(mePanel, me, t);
      setText(meBtcV, `${me.btc} / ${me.maxBtc} BTC`);
    }
    setText(meHashV, hashrateText(me.power));
    setText(miningV, String(me.energy));
    setWidth(energyFill, (100 * me.energy) / CONST.MAX_ENERGY);
    energyFill.classList.toggle('full', me.energy >= CONST.MAX_ENERGY);
    const left = Math.max(0, Math.ceil((state.duration - t) / 1000));
    setText(timerEl, String(left));
    timerEl.classList.toggle('low', left < 10 && !state.over);
    // Warnung bleibt auch im Freeze sichtbar (die Spielzeit steht, das Fenster auch): wer im Banner wischt, weicht danach aus
    // Rand und Knopf sagen dasselbe: in der Sperre (Weiterwischen nach einem Fehlversuch) steht der Rand grau statt zu blinken
    const w = state.over ? null : e.warning, open = !!w?.dodgeable && !w.dodged, locked = t < state.dodgeLockUntil, hot = open && !locked;
    flash.classList.toggle('yellow', hot && w.kind === 'fast');
    flash.classList.toggle('red', hot && w.kind === 'charged');
    flash.classList.toggle('locked', open && locked);
    enemySprite.classList.toggle('windup', !!w);
    renderDodge(w, t);
    enemySprite.classList.toggle('stunned', e.status.stunUntil > t);
    enemySprite.classList.toggle('weak', e.status.weakenedUntil > t);
    enemySprite.classList.toggle('poisoned', !!e.status.poison); // mein echtes Gesicht bleibt ungetönt, „Gift" steht in der Leiste
    helpers.classList.toggle('hidden', !state.summons.length);
    enemyHelpers.classList.toggle('hidden', !state.enemySummons?.length);
    if (combo && t - lastHitAt > COMBO_HIDE) resetCombo();
    const stunnedMe = me.status.stunUntil > t;
    specials.querySelectorAll('.special').forEach((b, i) => {
      const a = me.attacks[i];
      const ok = !shownMe && !state.over && !frozen && !stunnedMe && me.energy >= a.cost && !(a.once && me.used[a.name]);
      if (b.disabled === ok) b.disabled = !ok;
      b.classList.toggle('ready', ok);
    });
    const swap = specials.querySelector('.swap');
    if (swap) swap.disabled = !!shownMe || state.over || frozen || !state.team.some((f, i) => i !== state.active && f.btc > 0);
  }
  // Ausweich-Knopf = Warnung + Zeitbalken: gelb (schnell) bzw. rot (Lade-Attacke) „AUSWEICHEN!", der Balken läuft bis zum
  // Einschlag leer; die Kerbe markiert die letzten DODGE_PERFECT ms („Perfekt!"), „JETZT!" kommt eine Reaktionszeit davor
  // (NOW_LEAD). Danach die Rückmeldung (steht nach dem Einschlag noch NOTE_MS), in der Sperre nach einem Fehlversuch dessen
  // Grund (kurz), bei Heilung/Beschwörung „nicht abwehrbar"
  function renderDodge(w, t) {
    let cls = '', label = 'Ausweichen', left = 0;
    const locked = t < state.dodgeLockUntil, note = dodgeNote && performance.now() < dodgeNote.until ? dodgeNote : null;
    if (w?.dodgeable) {
      const total = Math.max(1, w.firesAt - w.startAt);
      left = Math.max(0, w.firesAt - t) / total;
      const zone = `${Math.min(100, (100 * CONST.DODGE_PERFECT) / total).toFixed(1)}%`;
      if (dodgeBtn.style.getPropertyValue('--zone') !== zone) dodgeBtn.style.setProperty('--zone', zone);
      if (w.dodged) { cls = w.perfect ? 'done perfect' : 'done'; label = w.perfect ? 'Perfekt!' : 'Ausgewichen!'; }
      else if (locked) { cls = 'locked'; label = lockText || 'Gesperrt'; }
      else if (w.firesAt - t <= CONST.DODGE_PERFECT + NOW_LEAD) { cls = `on now ${w.kind}`; label = 'JETZT!'; }
      else { cls = `on ${w.kind}`; label = 'AUSWEICHEN!'; }
    } else if (w) { cls = 'immune'; label = 'nicht abwehrbar'; }
    else if (note) { cls = note.cls; label = note.label; }
    else if (locked) { cls = 'locked'; label = lockText || 'Gesperrt'; }
    const on = cls.split(' ');
    for (const k of DODGE_STATES) dodgeBtn.classList.toggle(k, on.includes(k));
    setText(dodgeLabel, label);
    setWidth(dodgeFill, (100 * left).toFixed(1));
  }

  // ---------- Schleife ----------
  // Feste Zeitschritte mit Aufholen: auch bei gedrosseltem rAF (Hintergrund-Tab,
  // sparsamer Browser) folgt die Spielzeit der echten Zeit. Tipps werden auf die
  // Schritte verteilt, Spezial/Ausweichen/Wechsel gelten im ersten Schritt.
  // Freeze (pauseUntil, echte Zeit): Spielzeit steht, Tipps und Knöpfe verfallen, nur rendern. Ein Wisch im Freeze zählt sofort
  // zur stehenden Spielzeit (tick mit dt 0; die Warnung ist ja mit eingefroren). Startet ein Freeze
  // (Spezial, Wolfsschanze), wird der Rest des Aufholens verworfen, damit die Sequenz nicht in eingeholter Spielzeit verpufft.
  const STEP = 1000 / 60, MAX_CATCHUP = 1500;
  function loop(ts) {
    if (!running) return;
    if (ts < pauseUntil) {
      lastTs = ts;
      // Wisch im Freeze gleich verarbeiten (dt 0: die Spielzeit steht, das Fenster auch), damit Knopf und Text sofort bestätigen
      if (input.dodge) for (const e of tick(state, 0, { dodge: true })) handle(e);
      input = freshInput();
      launchShot();
      render();
      raf = requestAnimationFrame(loop);
      return;
    }
    let elapsed = Math.min(MAX_CATCHUP, lastTs ? ts - lastTs : STEP);
    lastTs = ts;
    const inp = input;
    input = freshInput();
    let taps = inp.taps || 0, first = true;
    while (elapsed > 0 && !state.over) {
      const dt = Math.min(STEP, elapsed);
      elapsed -= dt;
      const stepInput = first ? { ...inp, taps: 0 } : {};
      if (taps > 0) stepInput.taps = 1;
      const events = tick(state, dt, stepInput);
      if (events.some(e => e.type === 'fast' || e.type === 'stunnedTap')) taps -= 1;
      for (const e of events) handle(e);
      first = false;
      if (paused()) break;
    }
    batchDelay = 0; koPending = false;
    launchShot();
    if (!state.over && !paused() && state.time >= nextLineAt) speak();
    render();
    raf = state.over ? 0 : requestAnimationFrame(loop);
  }
  function begin() {
    running = true; lastTs = 0;
    nextLineAt = LINE_MIN + Math.random() * LINE_SPREAD;
    raf = requestAnimationFrame(loop);
  }

  // ---------- VS-Intro: Arena bzw. „Wilder Rüther", Gesichter, „VS", Spruch, Countdown; erst danach läuft die Schleife ----------
  function showIntro(then) {
    const me = state.team[state.active], boss = state.enemy, w = ctx.wild, h = ctx.mode === 'haunebu';
    setText(intro.querySelector('.intro-arena'), w ? 'Wilder Rüther' : h ? 'Haunebu-Landeplatz' : ctx.arena?.name || 'Arena');
    // eigene Kampfdauer des Bosses (Tachionenbitcoin: enemy.duration) steht mit im Intro
    const secs = !w && state.duration !== CONST.BATTLE_DURATION ? ` · ${Math.round(state.duration / 1000)} s` : '';
    setText(intro.querySelector('.intro-level'), w ? `${RARITY_BY_ID[w.rarity]?.name || 'Normal'} · Lv. ${boss.level || 1}`
      : (h ? 'Beschwörung' : `Arena Lv. ${ctx.arenaLevel}${ctx.masteredAfter ? ' · Meisterkampf' : ''}`) + secs);
    intro.querySelector('.intro-me').src = sprite(me.id);
    introBoss.src = w ? sprite(w.id) : bossArt(boss.id);
    introBoss.className = w ? `intro-boss sprite face r-${w.rarity}` : 'intro-boss sprite';
    setText(intro.querySelector('.intro-me-name'), me.name);
    setText(intro.querySelector('.intro-boss-name'), boss.name);
    // nicht derselbe Spruch wie gerade im Beschwörungs-Banner (ctx.shownLine)
    const pool = (LINES[w?.id || boss.id]?.appear || []).filter(l => l !== ctx.shownLine);
    const line = pool[Math.floor(Math.random() * pool.length)] || '';
    setText(introLine, line ? `${boss.name}: „${line}“` : '');
    introLine.classList.toggle('hidden', !line);
    countdown.textContent = ''; countdown.className = 'countdown';
    intro.classList.remove('hidden');
    COUNTDOWN.forEach((s, i) => later(() => {
      setText(countdown, s);
      countdown.classList.toggle('go', i === COUNTDOWN.length - 1);
      anim(countdown, 'pop', 450);
    }, INTRO_LEAD + i * COUNT_STEP));
    later(() => { intro.classList.add('hidden'); then(); talk(line); }, CONST.INTRO_MS); // Spruch steht danach noch 3 s in der Blase
  }

  // ---------- Eingabe ----------
  // Ausweichen: Wisch (ab SWIPE_PX schon beim Ziehen, jede Richtung), Knopf oder Pfeiltaste. Mein Gesicht weicht sofort aus,
  // auch im Freeze; ob es zählt, entscheidet die Engine im nächsten Schritt (Puffer, Sperre, Perfekt). In der Sperre wackelt der Knopf
  function dodgeNow(dir) {
    if (!running || state.over) return;
    dodgeDir = dir;
    input.dodge = true;
    if (state.time < state.dodgeLockUntil) anim(dodgeBtn, 'shake-x', 400);
    else anim(meSprite, `dodge-${dir}`, 450);
  }
  stage.addEventListener('pointerdown', e => {
    if (!running || state.over || e.target.closest('.dodge-btn')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, swiped: false });
    try { stage.setPointerCapture(e.pointerId); } catch { /* egal */ }
  });
  stage.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p || p.swiped) return;
    const dir = swipeDir(e.clientX - p.x, e.clientY - p.y);
    if (dir) { p.swiped = true; dodgeNow(dir); } // ein Wisch = ein Ausweichen, Loslassen tippt dann nicht mehr
  });
  stage.addEventListener('pointerup', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.swiped || !running || state.over) return;
    const dir = swipeDir(e.clientX - p.x, e.clientY - p.y);
    if (dir) return dodgeNow(dir); // ohne pointermove dazwischen (sehr schneller Wisch)
    if (paused()) return; // im Freeze verfallen Tipps
    input.taps += 1;
    sfx.play('tap');
    const r = stage.getBoundingClientRect();
    const ring = node('tap', 300);
    ring.style.left = `${e.clientX - r.left}px`;
    ring.style.top = `${e.clientY - r.top}px`;
  });
  stage.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); }); // z. B. Android-Zurück-Geste vom Rand: ein schon gezählter Wisch bleibt
  // Knopf: schon beim Drücken (nicht erst beim Loslassen); Tastatur (Enter/Leertaste) über click ohne Zeiger
  dodgeBtn.addEventListener('pointerdown', e => { e.preventDefault(); dodgeNow(dodgeDir === 'left' ? 'right' : 'left'); });
  dodgeBtn.addEventListener('click', e => { if (e.detail === 0) dodgeNow('left'); });
  el.addEventListener('click', e => { if (e.target.closest('button:not(.dodge-btn)')) sfx.play('click'); }); // alle Buttons im Kampf-Screen
  function onKey(e) {
    if (!running || state.over || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.repeat) return;
    dodgeNow(e.key === 'ArrowLeft' ? 'left' : 'right');
    e.preventDefault();
  }

  // ---------- Ende ----------
  // Sats-Zähler rollt in 1 s von 0 auf target (zeitbasiert, damit auch gedrosseltes rAF richtig endet)
  function countUp(node, target) {
    cancelAnimationFrame(countRaf);
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 1000);
      setText(node, `+${fmt(Math.round(target * (1 - (1 - k) ** 3)))} Sats`);
      countRaf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    setText(node, '+0 Sats');
    countRaf = requestAnimationFrame(step);
  }
  function showOverlay() {
    const won = !!state.won, boss = state.enemy, w = ctx.wild, h = ctx.mode === 'haunebu', img = overlay.querySelector('.boss');
    hideSay();
    const prize = h && won; // Beschwörung gewonnen: die Flugscheibe statt des fallenden Bosses
    img.src = w ? sprite(w.id) : prize ? HAUNEBU_ART : bossArt(boss.id);
    img.className = w ? `boss sprite face r-${w.rarity}` : prize ? 'boss sprite ufo' : `boss sprite${won ? ' fall' : ''}`;
    overlay.classList.toggle('lost', !won); // Niederlage: Papier mit Rotstempel statt Urkunde
    overlay.classList.toggle('wild', !!w);
    overlay.classList.toggle('haunebu', h);
    overlay.querySelector('.trophy').classList.toggle('hidden', !won || !!w || h);
    overlay.querySelector('.retry').classList.toggle('hidden', won || !!w || h || ctx.canRetry?.() === false); // Wildkampf und Beschwörung: kein „Nochmal"
    setText(overlay.querySelector('.done'), won || w || h ? 'Weiter' : 'Karte');
    if (h) { // Sieg: Flugscheibe erbeutet, Hitlers Abgang als Notiz; sonst ist er mit ihr weg und die Beschwörung kostet neu
      setText(overlay.querySelector('.title'), won ? 'Reichsflugscheibe erbeutet!' : 'Verloren');
      setText(overlay.querySelector('.sub'), won ? `Die Haunebu gehört dir für ${CONST.HAUNEBU_USE_MS / 60000} Minuten: freie Flüge zu jeder Arena, nach Neuschwabenland oder zu einer Quest.` : 'Hitler ist mit der Flugscheibe abgehauen. Beschwör sie neu.');
      const line = won ? pickLine(boss.id, 'defeat') : '';
      setText(overlay.querySelector('.arena-note'), line ? `„${line}“` : '');
    } else if (w) { // Sieg = gefangen, sonst haut er ab; dazu sein Spruch
      const timeout = state.reason === 'timeout' ? 'Die Zeit ist um. ' : '';
      setText(overlay.querySelector('.title'), won ? 'Gefangen!' : 'Abgehauen!');
      setText(overlay.querySelector('.sub'), won ? `${w.name} gehört dir.` : `${timeout}${w.name} ist abgehauen.`);
      const line = pickLine(w.id, won ? 'caught' : 'flee');
      setText(overlay.querySelector('.arena-note'), !line ? '' : isNarration(line, w.name) ? line : `„${line}“`); // Erzähltext ohne Anführungszeichen
    } else {
      setText(overlay.querySelector('.title'), won ? 'Arena erobert!' : 'Verloren');
      setText(overlay.querySelector('.sub'), won
        ? `${boss.name} ist pleite. Die Arena gehört jetzt ${state.team[0].name}.`
        : state.reason === 'timeout' ? 'Die Zeit ist um.' : 'Alle Rüthers sind pleite.');
      setText(overlay.querySelector('.arena-note'), !won ? ''
        : ctx.masteredAfter ? 'Arena gemeistert!' : `Arena Lv. ${(ctx.arenaLevel || 1) + 1} freigeschaltet`);
    }
    const conf = overlay.querySelector('.confetti');
    conf.innerHTML = '';
    if (won) {
      confetti(conf, 36);
      later(() => btcRain(conf, { n: 24, ms: 2600, size: 44 }), 500);
    }
    const gain = overlay.querySelector('.sats-gain');
    setText(gain, '+0 Sats');
    gain.classList.toggle('hidden', !won);
    if (won) later(() => countUp(gain, ctx.reward || 0), 800); // erst wenn .sats-gain eingeblendet ist (bt-sats-in startet nach .8s)
    overlay.classList.remove('hidden');
  }
  const result = (won, retry, reason) => ({ won, retry, reason, activeIndex: state.active });
  function end(retry) {
    if (ended || !state?.over) return;
    ended = true;
    const r = result(!!state.won, retry, state.reason);
    stop();
    onEnd(r);
  }
  overlay.querySelector('.done').addEventListener('click', () => end(false));
  // Aufgeben: Kampf sofort beenden (auch im Intro und im Freeze), zählt als Niederlage – außer der Kampf ist schon entschieden
  // (zwischen KO und Overlay liegen bis ~1,7 s, ein Tipp auf Aufgeben darf den Sieg nicht verwerfen). reason 'quit' = Spawn bleibt.
  el.querySelector('.quit').addEventListener('click', () => {
    if (!state || ended) return;
    ended = true;
    const r = state.over ? result(!!state.won, false, state.reason) : result(false, false, 'quit');
    if (!state.over) onResult?.(r); // sonst schon beim Engine-Ende verbucht
    stop();
    onEnd(r);
  });
  overlay.querySelector('.retry').addEventListener('click', () => end(true));

  function stop() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    cancelAnimationFrame(countRaf); countRaf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear(); pending.clear();
    window.removeEventListener('keydown', onKey);
    bgEl.after(enemySprite); // zurück aus .fx (Wildkampf, start)
    fx.innerHTML = ''; bgEl.innerHTML = ''; helpers.innerHTML = ''; helpers.className = 'helpers hidden';
    enemyHelpers.innerHTML = ''; enemyHelpers.className = 'enemy-helpers hidden';
    rede.forEach(p => p.stop()); rede = [];
    flash.className = 'flash'; stage.classList.remove('rage', 'quake-s', 'quake-m', 'quake-l', 'overheat', 'blow', 'side-hits', 'aside', 'negative', 'rewind');
    enemySprite.className = 'enemy-sprite sprite'; meSprite.className = 'sprite';
    specials.classList.remove('shake-x'); enemyPanel.classList.remove('glow'); mePanel.classList.remove('glow', 'glitch'); mining.classList.remove('glow');
    dodgeBtn.className = 'dodge-btn'; dodgeLabel.textContent = 'Ausweichen'; dodgeFill.style.width = '0%'; dodgeNote = null; lockText = ''; dodgeFloat = null;
    resetCombo(); stunTextAt = -Infinity;
    pauseUntil = 0; heldBtc = null; shownMe = null; meHoldUntil = 0; nextLineAt = Infinity; sayTimer = 0; bossFx = ''; bossHit = null;
    sw.classList.add('hidden'); overlay.classList.add('hidden'); intro.classList.add('hidden'); hideSay();
    overlay.querySelector('.confetti').innerHTML = '';
    ptrs.clear(); input = freshInput(); bossShot = null; shot = null;
  }

  function start({ team, enemy, rng = Math.random, mode = 'arena', arena = null, arenaLevel = 1, reward = 0, masteredAfter = false, wild = null, shownLine = '', canRetry = null }) {
    stop();
    const isWild = mode === 'wild';
    // Kampfdauer: Wildkampf 60 s, sonst die des Bosses (makeBoss übernimmt def.duration), ohne eigene die Engine-Vorgabe
    state = createBattle({ team, enemy, rng, duration: isWild ? CONST.WILD_DURATION : enemy.duration || undefined });
    const w = isWild ? { id: enemy.id, rarity: enemy.rarity || 'normal', name: enemy.name, ...wild } : null;
    ctx = { mode, arena, arenaLevel, reward, masteredAfter, wild: w, shownLine, canRetry };
    ended = false; koPending = false; batchDelay = 0;
    // Bühne und Intro zeigen art/bg-<arena>.png, im Wildkampf art/bg-catch.png, bei der Beschwörung art/bg-mondbasis.png (css)
    const scene = isWild ? 'wild' : mode === 'haunebu' ? 'haunebu' : arena?.id;
    if (scene) el.dataset.arena = scene; else delete el.dataset.arena;
    const me = state.team[state.active];
    enemySprite.src = w ? sprite(w.id) : bossArt(state.enemy.id);
    // echtes Gesicht im Seltenheitsrahmen, in der Effekt-Ebene über Dimmer, Requisiten und ₿-Regen (css/battle.css)
    if (w) { enemySprite.classList.add('face', `r-${w.rarity}`); fx.prepend(enemySprite); }
    fx.append(dodgeBtn);
    meSprite.src = sprite(me.id);
    setFrame(me);
    anim(meSprite, 'slide-in', 500);
    buildSpecials();
    render(); // Timer steht auf der vollen Kampfdauer (90, Wildkampf 60, Tachionen 120), bis das Intro vorbei ist
    window.addEventListener('keydown', onKey);
    showIntro(begin);
  }

  return { start, stop };
}
