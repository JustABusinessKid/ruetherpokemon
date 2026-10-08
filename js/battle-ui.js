import { CONST, RARITIES, RARITY_BY_ID, LINES, pickLine } from './data.js';
import { createBattle, tick } from './battle.js';
import { sfx, haptic } from './audio.js';
import { playSheet, propFx, confetti, floatText, btcRain, banner, say } from './fx.js';
import { hashrateText, isNarration } from './format.js';

// Kampf-Bildschirm: VS-Intro mit Countdown, requestAnimationFrame-Schleife um die Engine,
// Pointer-Eingabe, Events → Grafik-Effekte aus art/ über js/fx.js (Requisiten mit echten Gesichtern als Reiter, Sheets,
// Zahlen, ₿-Regen, Banner, Sprechblasen), kampfeigene Kleinanimationen in css/battle.css, Sounds, Haptik, Combo, Wut, End-Overlay.
// Spezial-Attacken laufen als Kinosequenz: die Spielzeit friert ein (pauseUntil), Banner mit Gesicht + Spruch (Spec §6).
// createBattleScreen({ el, onEnd, onEvent }) -> { start({ team, enemy, rng, mode, arena, arenaLevel, reward, masteredAfter, wild }), stop() }
// mode 'arena' | 'wild' | 'haunebu'; wild = { id, rarity, name } (Gegner = wilder Rüther mit echtem Gesicht, kein „Nochmal").
// 'haunebu' (v7): Beschwörung aus dem Shop gegen Hitler, ohne arena; Sieg = Flugscheibe erbeutet, kein „Nochmal".
// Gegner-Helfer (v7b, Wolfsschanzen-Beschwörung): state.enemySummons → .enemy-helpers neben dem Boss (art/boss-<id>.png).
// onEnd({ won, retry, reason, activeIndex }) genau einmal pro Kampf: Overlay-Button oder Aufgeben (reason 'quit').
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
// Ankerpunkte auf der Bühne = die Pfad-Anker aus css/theme.css (--fx-enemy-*, --fx-me-*), Texte etwas darüber
const AT = { enemy: { x: 'var(--fx-enemy-x)', y: 'var(--fx-enemy-y)' }, me: { x: 'var(--fx-me-x)', y: 'var(--fx-me-y)' } };
const TXT = { enemy: { x: 'var(--fx-enemy-x)', y: 'calc(var(--fx-enemy-y) - 12%)' }, me: { x: 'calc(var(--fx-me-x) + 4%)', y: 'calc(var(--fx-me-y) - 14%)' } };
// Info-Texte zum eigenen Rüther (Ausgewichen!, … du bist dran!): mittig, damit lange Namen nicht links aus der Bühne laufen,
// und 12 % über den Schadenszahlen, damit sich beides nicht überdeckt
const INFO_ME = { x: '50%', y: 'calc(var(--fx-me-y) - 26%)' };
// Sprechblase des Gegners: Zipfel links oben am Gegner, Blase läuft nach rechts
const SAY_AT = { x: 'calc(var(--fx-enemy-x) - 18%)', y: 'calc(var(--fx-enemy-y) - 14%)', side: 'left' };
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
const BOSS_SLOW = 1.4; // Boss-Requisiten laufen 1,4× so lang (ohne Freeze)
const slow = ms => Math.round(ms * BOSS_SLOW);
const LINE_MIN = 8000, LINE_SPREAD = 4000; // Gegner-Sprüche alle 8–12 s Spielzeit
// Betäubung des eigenen Rüthers je Gegner-Attacke (fx) als Text; alles andere zeigt den Firmware-Balken der PS3
const STUN_TEXT = { wild: 'sprachlos', fan: 'benebelt', ray: 'im Strahl' };
const BUNKER_MS = 1500; // = bt-bunker in css/battle.css
const KRUPP_MS = 1500; // Krupp-Rede kommt alle 2,3 s (Wut 1,8 s): Pult, Wutblase und Sprechblase sind nach ~1,6 s weg
const WOLF_MS = 1600; // Wolfsschanzen-Beschwörung: Banner + Freeze, Goebbels und Himmler rennen derweil über dem Dimmer herein
const bubbleText = s => { const t = document.createElement('span'); t.className = 'bubble-text'; t.textContent = s; return t.outerHTML; };

export function createBattleScreen({ el, onEnd, onEvent }) {
  const $ = s => el.querySelector(s);
  const flash = $('.flash'), stage = $('.stage'), bgEl = $('.stage .bg'), fx = $('.fx'), helpers = $('.helpers'), comboEl = $('.combo');
  const enemyHelpers = $('.enemy-helpers');
  const enemySprite = $('.enemy-sprite'), timerEl = $('.timer');
  const enemyPanel = $('.fighter.enemy'), mePanel = $('.fighter.me');
  const frame = mePanel.querySelector('.frame'), meSprite = frame.querySelector('.sprite'), energyFill = mePanel.querySelector('.energy .fill');
  const specials = $('.specials'), sw = $('.switch'), overlay = $('.overlay');
  const intro = $('.intro'), countdown = intro.querySelector('.countdown'), introBoss = intro.querySelector('.intro-boss');
  const introLine = Object.assign(document.createElement('p'), { className: 'intro-line' });
  intro.insertBefore(introLine, countdown);
  for (const img of [enemySprite, introBoss, overlay.querySelector('.boss')]) {
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

  let state = null, raf = 0, countRaf = 0, lastTs = 0, running = false, ended = false, down = null;
  let input = freshInput(), dodgeDir = 'left', koPending = false, batchDelay = 0;
  let combo = 0, lastHitAt = -Infinity, stunTextAt = -Infinity;
  let pauseUntil = 0, heldBtc = null, nextLineAt = Infinity, sayRef = null, bossFx = '';
  let rede = []; // laufende Krupp-Rede (Pult, Wutblase, Sprechblase): die nächste Rede baut sie ab
  let ctx = {}; // { mode, arena, arenaLevel, reward, masteredAfter, wild }
  const timers = new Set();
  const pending = new Map(); // node -> { cls: timerId }: Neustart derselben Animation löscht den alten Entfern-Timer
  const paused = () => performance.now() < pauseUntil;

  // ---------- Timer und Einmal-Animationen (alles wird in stop() aufgeräumt) ----------
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function anim(node, cls, ms) {
    const m = pending.get(node) || pending.set(node, {}).get(node);
    if (m[cls]) { clearTimeout(m[cls]); timers.delete(m[cls]); }
    node.classList.remove(cls);
    void node.offsetWidth; // Reflow, damit die Animation neu startet
    node.classList.add(cls);
    m[cls] = later(() => { delete m[cls]; node.classList.remove(cls); }, ms);
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
    return d;
  }
  // Requisit in .fx; vars setzt Pfad-Variablen am Element (--spin, --dx, --rider-*)
  function prop(name, path, opts, vars = {}) {
    const p = propFx(fx, name, path, opts);
    for (const [k, v] of Object.entries(vars)) p.el.style.setProperty(k, v);
    return p;
  }
  // Reiter = echtes Gesicht des Angreifers im Requisit (Spec §0.2)
  const rider = f => ({ rider: f.id, riderRarity: f.rarity || 'normal' });
  const sheet = (name, at, opts = {}) => playSheet(fx, name, { ...AT[at], ...opts });
  let numSeq = 0; // Zahlen in drei Höhen (−22/0/+22 px) staffeln, damit schnelle Tipps nicht übereinander liegen
  const num = (t, at, kind = 'info', ms = 900) => floatText(fx, t, { x: jitter(TXT[at].x, 60), y: `calc(${TXT[at].y} + ${(numSeq++ % 3 - 1) * 22}px)`, kind, ms });
  const dmgNum = (n, at) => num(`-${n}`, at, n >= 25 ? 'big' : 'hurt');
  const text = (t, at, kind = 'info') => floatText(fx, t, { ...(at === 'me' ? INFO_ME : TXT[at]), kind, ms: 1200 });
  function hitEnemy(n) {
    anim(enemySprite, 'shake', 300);
    anim(enemySprite, 'hit', 70); // 2 Frames weiß
    sheet('impact', 'enemy', { size: impactSize(n) });
    later(() => dmgNum(n, 'enemy'), 50);
  }
  // Einschlag einer Spezial-Attacke: ₿-Explosion, große Zahl 1,6 s, Beben, Boss blitzt zweimal, ab 20 Schaden ₿-Regen
  function specialHit(n) {
    anim(enemySprite, 'shake', 300);
    anim(enemySprite, 'hit', 70);
    later(() => anim(enemySprite, 'hit', 70), 140);
    sheet('btcburst', 'enemy', { size: Math.min(256, 160 + n * 3) });
    const q = quakeFor(n, true);
    anim(stage, q, QUAKE_MS[q]);
    // unter der Mitte, damit die steigende Zahl nicht hinter dem Banner verschwindet
    later(() => floatText(fx, `-${n}`, { x: TXT.enemy.x, y: 'calc(var(--fx-enemy-y) + 6%)', kind: 'big', ms: 1600 }), 50);
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
  // Familientreffen gegen dich (wilde Hildegard): die echten Christian und Micha rennen von rechts herein und kloppen
  function familyRush() {
    node('rush', 1600).innerHTML = ['christian', 'micha'].map((id, i) => `<img src="${sprite(id)}" alt="" style="--i:${i}">`).join('');
    return 760;
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
  // Gegner (wilder Rüther oder Boss) sagt einen Spruch als Sprechblase; nächster frühestens in 8–12 s Spielzeit
  function speak(kind = 'fight') {
    nextLineAt = state.time + LINE_MIN + Math.random() * LINE_SPREAD;
    const line = pickLine(ctx.wild?.id || state.enemy.id, kind);
    if (!line) return;
    sayRef?.stop();
    sayRef = say(fx, line, { ...SAY_AT, ms: 2600 });
  }

  // Spezial-Attacken nach attack.fx (Spec §6): Requisit art/fx-<name>.png mit dem Gesicht des Angreifers als Reiter.
  // Rückgabe: ms bis zum Einschlag (₿-Explosion, Zahl, Beben, Folge-Effekte). Die Spielzeit steht derweil (FREEZE).
  const FX = {
    'chart-up'(atk, me) { // Mond hinter dem Boss, Kerzen steigen, Rakete mit Christians Gesicht, „+70 %", Einschlag
      node('moon', 2600, bgEl);
      prop('candles', 'rise-from-bottom', { ms: 1600, size: 256 });
      later(() => prop('btc-rocket', 'launch', { ms: 1400, size: 176, ...rider(me) }, { '--rider-x': '22%', '--rider-y': '-14%', '--rider-size': '42%' }), 500);
      later(() => floatText(fx, '+70 %', { x: '50%', y: 'calc(var(--fx-enemy-y) - 10%)', kind: 'mega', ms: 1400 }), 1000);
      return 1300;
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
    speech(atk, me) { // Sprechblase hängt an Viktors großem Gesicht, der Boss kippt grau (stun → render)
      prop('speech', 'bubble-at-me', { ms: 2200, size: 208, html: bubbleText(atk.flavour || pickLine(me.id, 'fight')), ...rider(me) }, { '--rider-x': '-34%', '--rider-y': '64%', '--rider-size': '54%' });
      return 400;
    },
    mms(atk, me) { prop('mms', 'rise-at-enemy', { ms: 1600, size: 160, ...rider(me) }, { '--rider-x': '28%', '--rider-y': '34%' }); later(mmsBurst, 500); return 700; }, // Gesicht im Haufen, sonst steckt es unter dem Banner
    bags(atk, me) { // drei Tüten, Ramonas Gesicht auf der mittleren; die Heilung bringt den kleinen ₿-Regen
      [-1, 0, 1].forEach(i => later(() => prop('bags', 'arc-to-enemy', { ms: 900, size: 96, ...(i === 0 ? rider(me) : {}) }, { '--dx': `${i * 48}px`, '--spin': '20deg', '--rider-y': '-44%', '--rider-size': '56%' }), (i + 1) * 150));
      return 600;
    },
    family() { return 0; }, // die echten Christian und Micha kommen mit dem summoned-Event
  };
  // Gegner-Attacken nach attack.fx, 1,4× so lang wie in v5. Rückgabe: ms bis zum Einschlag beim Spieler.
  // Requisit fliegt vom Gegner zu mir, ohne Drehung; Einschlag bei 86 % (path-arc-to-me)
  const toMe = (name, ms, size) => { prop(name, 'arc-to-me', { ms, size }, { '--spin': '0deg' }); return Math.round(ms * 0.86); };
  const BOSS_FX = {
    disc() { prop('disc', 'drop-on-me', { ms: slow(500), size: 96 }); return slow(360); },
    yellow() { prop('yellow-light', 'rise-at-enemy', { ms: slow(1200), size: 192 }); return slow(450); },
    firmware() { return 0; }, // Requisit mit laufendem Balken kommt mit dem stun-Event (bar-on-me)
    crash() { prop('crash', 'crash-at-me', { ms: slow(700), size: 144 }); return slow(550); },
    chain() { prop('chain', 'drop-on-me', { ms: slow(900), size: 144 }); return slow(650); }, // drop-on-me rasselt nach dem Aufprall
    mining() { prop('pickaxe', 'swing-at-enemy', { ms: slow(900), size: 144 }); return 0; },
    block() { prop('block', 'drop-on-me', { ms: slow(500), size: 112 }); return slow(360); },
    half() { prop('halving', 'drop-on-me', { ms: slow(700), size: 192 }); return slow(500); },
    key() { prop('key', 'rise-at-enemy', { ms: slow(1200), size: 128 }); return 0; },
    // Bitcoin-Heizung (Keller): Aufguss, Überhitzung mit rot glühender Kulisse, Umluft weht die Bühne durch, Strom-Heilung.
    // Wer im Attackennamen steckt, ist mit echtem Gesicht dabei (Spec v7 §1): Viktor in der Gaswolke, Hildegard auf der Handtasche.
    heat() { // Dosenbier klatscht auf die Heizung, Dampf, dann rollt die Hitzewelle auf mich
      prop('beer-can', 'arc-to-enemy', { ms: slow(400), size: 80 }, { '--spin': '40deg' });
      later(() => sheet('smoke', 'enemy', { size: 128 }), slow(340));
      later(() => toMe('heat', slow(500), 128), slow(300));
      return slow(300) + Math.round(slow(500) * 0.86);
    },
    overheat() {
      const hit = toMe('heat', slow(900), 224);
      later(() => floatText(fx, '+70 °C', { x: '50%', y: 'calc(var(--fx-enemy-y) - 10%)', kind: 'mega', ms: 1400 }), slow(200));
      later(() => anim(stage, 'overheat', 1000), hit);
      return hit;
    },
    fan() { // Lüfter dreht, bläst Viktors grüne Gaswolke mit seinem echten Gesicht auf mich
      prop('fan', 'spin-at-enemy', { ms: slow(1400), size: 176 });
      anim(stage, 'blow', slow(1400));
      prop('gas', 'arc-to-me', { ms: slow(900), size: 176, rider: 'viktor' }, { '--spin': '0deg', '--rider-x': '30%', '--rider-y': '24%', '--rider-size': '40%', '--rider-filter': 'sepia(1) hue-rotate(60deg) saturate(2.2)' });
      return Math.round(slow(900) * 0.86);
    },
    found() { // Hildegard reitet auf ihrer Handtasche von unten zur Heizung und zahlt: ₿-Explosion, Heilung
      prop('handbag', 'rise-from-bottom', { ms: slow(1000), size: 128, rider: 'hildegard' }, { '--rider-x': '30%', '--rider-y': '-34%' });
      later(() => sheet('btcburst', 'enemy', { size: 208 }), slow(450));
      return slow(450);
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
      return 450;
    },
    wolfsschanze(atk) { // Holzbanner, Spielzeit steht; Goebbels und Himmler kommen mit dem enemySummoned-Event
      pauseUntil = Math.max(pauseUntil, performance.now() + WOLF_MS);
      sayRef?.stop();
      banner(fx, { title: `${atk.name}!`, sub: 'Goebbels! Himmler! Sofort zu mir!', portrait: bossArt(state.enemy.id), ms: WOLF_MS });
      return 0;
    },
    ray(atk, me) { // Flugscheibe schwebt über mir ein, der Strahl zieht mein echtes Gesicht (Reiter) hoch
      const ms = slow(1400);
      prop('haunebu', 'hover-over-me', { ms, size: 144 });
      later(() => prop('tractor-beam', 'beam-on-me', { ms: ms - slow(300), size: 208, ...rider(me) }, { '--rider-x': 'calc(50% - 40px)', '--rider-y': 'calc(100% - 92px)', '--rider-size': '80px' }), slow(300));
      return slow(500);
    },
    bunker() { anim(enemySprite, 'hide', BUNKER_MS); sheet('smoke', 'enemy', { size: 176 }); return Math.round(BUNKER_MS * 0.75); }, // Heilung, wenn er wieder auftaucht
    // Wilder Rüther: Rempler = er springt nach vorn; Lade-Attacke = sein Requisit mit seinem Gesicht fliegt zu dir
    'wild-fast'() { anim(enemySprite, 'lunge', 450); return 220; },
    wild(atk) {
      if (atk.prop === 'family') return familyRush();
      const hits = atk.damage > 0, ms = slow(800), size = atk.prop === 'speech' ? 176 : 128;
      const html = atk.prop === 'speech' ? bubbleText(atk.flavour || pickLine(atk.ownerId, 'fight')) : '';
      prop(atk.prop || 'chart-up', hits ? 'arc-to-me' : 'rise-at-enemy', { ms, size, html, rider: atk.ownerId || ctx.wild?.id, riderRarity: ctx.wild?.rarity || 'normal' },
        { '--spin': '-30deg', '--rider-x': '30%', '--rider-y': '-36%' });
      return hits ? Math.round(ms * 0.86) : 0;
    },
  };
  const run = (table, atk, me) => (table[atk.fx] || (() => 0))(atk, me);

  // ---------- Events → Animationen ----------
  function handle(e) {
    onEvent?.(e);
    const at = e.target === 'me' ? 'me' : 'enemy';
    switch (e.type) {
      case 'fast': hitEnemy(e.damage); comboHit(); break;
      case 'special': { // Kinosequenz: Spielzeit steht, Banner mit Gesicht + Spruch, Requisit mit Reiter, dann Einschlag
        const me = e.fighter, atk = e.attack, freeze = FREEZE[atk.fx] || CONST.CINEMATIC_MS; // e.fighter: KO-Wechsel im selben Schritt steht schon in state.active
        pauseUntil = performance.now() + freeze;
        sayRef?.stop();
        const subs = (LINES[me.id]?.fight || []).filter(l => !l.includes(atk.name)); // Spruch wiederholt nicht den Titel
        banner(fx, { title: atk.fx === 'family' ? 'Familientreffen!' : atk.name, sub: subs[Math.floor(Math.random() * subs.length)] || '', portrait: sprite(me.id), rarity: me.rarity, ms: freeze });
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
        if (now - stunTextAt > 1200) { stunTextAt = now; text('betäubt', 'me'); }
        break;
      }
      case 'warn':
        sfx.play('warn'); // Blinken und Ausholen hängen am Zustand (render)
        if (e.kind === 'charged' && e.attack.fx === 'wild') { // der Wilde ruft seine Lade-Attacke aus (zufällige Sprüche nennen oft die falsche)
          sayRef?.stop();
          sayRef = say(fx, `${e.attack.name}!`, { ...SAY_AT, ms: 2600 });
          nextLineAt = state.time + LINE_MIN;
        }
        break;
      case 'dodge': anim(meSprite, `dodge-${dodgeDir}`, 450); text('Ausgewichen!', 'me'); sfx.play('dodge'); break;
      case 'enemyAttack':
        bossFx = e.attack.fx; // eine Betäubung danach im selben Schritt gehört zu dieser Attacke
        batchDelay = run(BOSS_FX, e.attack, e.fighter);
        if (e.damage > 0) later(() => {
          if (e.dodged) { num(`-${e.damage}`, 'me'); return; }
          const q = quakeFor(e.damage, e.kind === 'charged');
          anim(stage, q, QUAKE_MS[q]);
          anim(meSprite, 'shake', 300);
          sheet('impact', 'me', { size: impactSize(e.damage) });
          dmgNum(e.damage, 'me');
          sfx.play('hit'); haptic(20);
        }, batchDelay);
        break;
      case 'poisoned': later(() => sheet('smoke', at, { size: 128 }), batchDelay); break;
      case 'poison': num(`-${e.damage}`, at); break;
      case 'stun': {
        const t = STUN_TEXT[bossFx]; // z. B. Viktors Argumentationslogik: sprachlos, keine PS3-Firmware
        if (at === 'enemy') later(() => { for (let i = 0; i < 3; i++) later(() => num('Z', 'enemy', 'info', 1400), i * 450); }, batchDelay);
        else if (t) later(() => text(t, 'me'), batchDelay);
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
        floatText(fx, 'WUT!', { ...TXT.enemy, kind: 'big', ms: 1200 });
        sfx.play('rage'); haptic([30, 30, 30, 30, 80]);
        break;
      case 'faint': // KO erst, wenn der auslösende Boss-Angriff eingeschlagen ist
        koPending = true;
        later(() => { meSprite.classList.add('ko'); text(`${e.fighter.name} ist pleite!`, 'me'); }, batchDelay);
        break;
      case 'switch': {
        const f = e.fighter;
        later(() => {
          meSprite.className = 'sprite';
          meSprite.src = sprite(f.id);
          setFrame(f);
          anim(meSprite, 'slide-in', 500);
          text(`${f.name}, du bist dran!`, 'me');
        }, koPending ? batchDelay + 1000 : 0); // ko (900 ms) fertig, „ist pleite!" blendet schon aus
        buildSpecials();
        break;
      }
      case 'win':
        sayRef?.stop();
        later(() => { enemySprite.classList.add('ko'); sfx.play('win'); haptic([30, 30, 30]); }, batchDelay);
        later(showOverlay, batchDelay + 900);
        break;
      case 'lose': later(() => sfx.play('lose'), batchDelay); later(showOverlay, batchDelay + 900); break;
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
  function panel(p, f, t, btc = f.btc) {
    const name = p.querySelector('.fname');
    setText(name, `${f.name}${f.level ? ` · Lv. ${f.level}` : ''}`);
    name.classList.toggle('rage', !!f.rage);
    const pct = Math.max(0, Math.round((100 * btc) / f.maxBtc));
    const fill = p.querySelector('.hp .fill');
    setWidth(fill, pct);
    fill.classList.toggle('low', pct <= 25);
    const st = [f.status.poison && 'Gift', f.status.stunUntil > t && 'betäubt', f.status.weakenedUntil > t && 'geschwächt'].filter(Boolean).join(' · ');
    setText(p.querySelector('.status'), st);
  }
  function render() {
    const t = state.time, e = state.enemy, me = state.team[state.active], frozen = paused();
    const eBtc = heldBtc ?? e.btc;
    panel(enemyPanel, e, t, eBtc);
    setText(enemyBtcV, `${eBtc} / ${e.maxBtc} BTC`);
    panel(mePanel, me, t);
    setText(meBtcV, `${me.btc} / ${me.maxBtc} BTC`);
    setText(meHashV, hashrateText(me.power));
    setText(miningV, String(me.energy));
    setWidth(energyFill, (100 * me.energy) / CONST.MAX_ENERGY);
    energyFill.classList.toggle('full', me.energy >= CONST.MAX_ENERGY);
    const left = Math.max(0, Math.ceil((state.duration - t) / 1000));
    setText(timerEl, String(left));
    timerEl.classList.toggle('low', left < 10 && !state.over);
    const w = state.over || frozen ? null : e.warning;
    flash.classList.toggle('yellow', !!w && w.kind === 'fast');
    flash.classList.toggle('red', !!w && w.kind === 'charged');
    enemySprite.classList.toggle('windup', !!w);
    enemySprite.classList.toggle('stunned', e.status.stunUntil > t);
    enemySprite.classList.toggle('weak', e.status.weakenedUntil > t);
    enemySprite.classList.toggle('poisoned', !!e.status.poison);
    meSprite.classList.toggle('poisoned', !!me.status.poison);
    helpers.classList.toggle('hidden', !state.summons.length);
    enemyHelpers.classList.toggle('hidden', !state.enemySummons?.length);
    if (combo && t - lastHitAt > COMBO_HIDE) resetCombo();
    const stunnedMe = me.status.stunUntil > t;
    specials.querySelectorAll('.special').forEach((b, i) => {
      const a = me.attacks[i];
      const ok = !state.over && !frozen && !stunnedMe && me.energy >= a.cost && !(a.once && me.used[a.name]);
      if (b.disabled === ok) b.disabled = !ok;
      b.classList.toggle('ready', ok);
    });
    const swap = specials.querySelector('.swap');
    if (swap) swap.disabled = state.over || frozen || !state.team.some((f, i) => i !== state.active && f.btc > 0);
  }

  // ---------- Schleife ----------
  // Feste Zeitschritte mit Aufholen: auch bei gedrosseltem rAF (Hintergrund-Tab,
  // sparsamer Browser) folgt die Spielzeit der echten Zeit. Tipps werden auf die
  // Schritte verteilt, Spezial/Ausweichen/Wechsel gelten im ersten Schritt.
  // Freeze (pauseUntil, echte Zeit): Spielzeit steht, Eingaben verfallen, nur rendern. Startet ein Freeze (Spezial,
  // Wolfsschanze), wird der Rest des Aufholens verworfen, damit die Sequenz nicht in eingeholter Spielzeit verpufft.
  const STEP = 1000 / 60, MAX_CATCHUP = 1500;
  function loop(ts) {
    if (!running) return;
    if (ts < pauseUntil) {
      lastTs = ts; input = freshInput();
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
    setText(intro.querySelector('.intro-level'), w ? `${RARITY_BY_ID[w.rarity]?.name || 'Normal'} · Lv. ${boss.level || 1}`
      : h ? 'Beschwörung' : `Arena Lv. ${ctx.arenaLevel}${ctx.masteredAfter ? ' · Meisterkampf' : ''}`);
    intro.querySelector('.intro-me').src = sprite(me.id);
    introBoss.src = w ? sprite(w.id) : bossArt(boss.id);
    introBoss.className = w ? `intro-boss sprite face r-${w.rarity}` : 'intro-boss sprite';
    setText(intro.querySelector('.intro-me-name'), me.name);
    setText(intro.querySelector('.intro-boss-name'), boss.name);
    const line = pickLine(w?.id || boss.id, 'appear');
    setText(introLine, line ? `${boss.name}: „${line}“` : '');
    introLine.classList.toggle('hidden', !line);
    countdown.textContent = ''; countdown.className = 'countdown';
    intro.classList.remove('hidden');
    COUNTDOWN.forEach((s, i) => later(() => {
      setText(countdown, s);
      countdown.classList.toggle('go', i === COUNTDOWN.length - 1);
      anim(countdown, 'pop', 450);
    }, INTRO_LEAD + i * COUNT_STEP));
    later(() => { intro.classList.add('hidden'); then(); }, CONST.INTRO_MS);
  }

  // ---------- Eingabe ----------
  stage.addEventListener('pointerdown', e => {
    if (!running || state.over) return;
    down = { x: e.clientX, y: e.clientY };
    try { stage.setPointerCapture(e.pointerId); } catch { /* egal */ }
  });
  stage.addEventListener('pointerup', e => {
    if (!down) return;
    const dx = e.clientX - down.x;
    down = null;
    if (!running || state.over || paused()) return; // im Freeze verfallen Tipps
    if (Math.abs(dx) > 40) { input.dodge = true; dodgeDir = dx < 0 ? 'left' : 'right'; return; }
    input.taps += 1;
    sfx.play('tap');
    const r = stage.getBoundingClientRect();
    const ring = node('tap', 300);
    ring.style.left = `${e.clientX - r.left}px`;
    ring.style.top = `${e.clientY - r.top}px`;
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('click', e => { if (e.target.closest('button')) sfx.play('click'); }); // alle Buttons im Kampf-Screen
  function onKey(e) {
    if (!running || state.over || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    input.dodge = true; dodgeDir = e.key === 'ArrowLeft' ? 'left' : 'right';
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
    const prize = h && won; // Beschwörung gewonnen: die Flugscheibe statt des fallenden Bosses
    img.src = w ? sprite(w.id) : prize ? HAUNEBU_ART : bossArt(boss.id);
    img.className = w ? `boss sprite face r-${w.rarity}` : prize ? 'boss sprite ufo' : `boss sprite${won ? ' fall' : ''}`;
    overlay.classList.toggle('lost', !won); // Niederlage: Papier mit Rotstempel statt Urkunde
    overlay.classList.toggle('wild', !!w);
    overlay.classList.toggle('haunebu', h);
    overlay.querySelector('.trophy').classList.toggle('hidden', !won || !!w || h);
    overlay.querySelector('.retry').classList.toggle('hidden', won || !!w || h); // Wildkampf und Beschwörung: kein „Nochmal"
    setText(overlay.querySelector('.done'), won || w || h ? 'Weiter' : 'Karte');
    if (h) { // Sieg: Flugscheibe erbeutet, Hitlers Abgang als Notiz; sonst ist er mit ihr weg und die Beschwörung kostet neu
      setText(overlay.querySelector('.title'), won ? 'Reichsflugscheibe erbeutet!' : 'Verloren');
      setText(overlay.querySelector('.sub'), won ? 'Die Haunebu gehört jetzt dir. Flieg damit zu jeder Arena.' : 'Hitler ist mit der Flugscheibe abgehauen. Beschwör sie neu.');
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
    fx.innerHTML = ''; bgEl.innerHTML = ''; helpers.innerHTML = ''; helpers.className = 'helpers hidden';
    enemyHelpers.innerHTML = ''; enemyHelpers.className = 'enemy-helpers hidden';
    rede.forEach(p => p.stop()); rede = [];
    flash.className = 'flash'; stage.classList.remove('rage', 'quake-s', 'quake-m', 'quake-l', 'overheat', 'blow');
    enemySprite.className = 'enemy-sprite sprite'; meSprite.className = 'sprite';
    specials.classList.remove('shake-x'); enemyPanel.classList.remove('glow'); mePanel.classList.remove('glow');
    resetCombo(); stunTextAt = -Infinity;
    pauseUntil = 0; heldBtc = null; nextLineAt = Infinity; sayRef = null; bossFx = '';
    sw.classList.add('hidden'); overlay.classList.add('hidden'); intro.classList.add('hidden');
    overlay.querySelector('.confetti').innerHTML = '';
    down = null; input = freshInput();
  }

  function start({ team, enemy, rng = Math.random, mode = 'arena', arena = null, arenaLevel = 1, reward = 0, masteredAfter = false, wild = null }) {
    stop();
    const isWild = mode === 'wild';
    state = createBattle({ team, enemy, rng, duration: isWild ? CONST.WILD_DURATION : undefined });
    const w = isWild ? { id: enemy.id, rarity: enemy.rarity || 'normal', name: enemy.name, ...wild } : null;
    ctx = { mode, arena, arenaLevel, reward, masteredAfter, wild: w };
    ended = false; koPending = false; batchDelay = 0;
    // Bühne und Intro zeigen art/bg-<arena>.png, im Wildkampf art/bg-catch.png, bei der Beschwörung art/bg-mondbasis.png (css)
    const scene = isWild ? 'wild' : mode === 'haunebu' ? 'haunebu' : arena?.id;
    if (scene) el.dataset.arena = scene; else delete el.dataset.arena;
    const me = state.team[state.active];
    enemySprite.src = w ? sprite(w.id) : bossArt(state.enemy.id);
    if (w) enemySprite.classList.add('face', `r-${w.rarity}`); // echtes Gesicht im Seltenheitsrahmen
    meSprite.src = sprite(me.id);
    setFrame(me);
    anim(meSprite, 'slide-in', 500);
    buildSpecials();
    render(); // Timer steht auf 90 bzw. 60, bis das Intro vorbei ist
    window.addEventListener('keydown', onKey);
    showIntro(begin);
  }

  return { start, stop };
}
