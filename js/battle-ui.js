import { CONST, RARITIES } from './data.js';
import { createBattle, tick } from './battle.js';
import { sfx, haptic } from './audio.js';
import { playSheet, propFx, confetti, floatText } from './fx.js';

// Kampf-Bildschirm: VS-Intro mit Countdown, requestAnimationFrame-Schleife um die Engine,
// Pointer-Eingabe, Events → Grafik-Effekte aus art/ über js/fx.js (Requisiten auf Pfaden, Sheets, Zahlen, Konfetti),
// kampfeigene Kleinanimationen in css/battle.css, Sounds, Haptik, Combo, Wut, End-Overlay.
// createBattleScreen({ el, onEnd, onEvent }) -> { start({ team, enemy, rng, arena, arenaLevel, reward, masteredAfter }), stop() }
// onEnd({ won, retry }) genau einmal pro Kampf: Overlay-Button oder Aufgeben.
// onEvent(e) für jedes Engine-Event, zusätzlich { type: 'combo', value } bei jeder Combo-Erhöhung.

const sprite = id => `sprites/${id}.png`;
const bossArt = id => `art/boss-${id}.png`;
const icon = (name, cls = '') => Object.assign(document.createElement('img'), { className: `ico ${cls}`.trim(), src: `art/icon-${name}.png`, alt: '' });
const fmt = n => n.toLocaleString('de-DE');
const freshInput = () => ({ taps: 0, dodge: false, special: null, switchTo: null });
const RARITY_COLORS = RARITIES.map(r => `var(--r-${r.id})`);
// Ankerpunkte auf der Bühne = die Pfad-Anker aus css/theme.css (--fx-enemy-*, --fx-me-*), Texte etwas darüber
const AT = { enemy: { x: 'var(--fx-enemy-x)', y: 'var(--fx-enemy-y)' }, me: { x: 'var(--fx-me-x)', y: 'var(--fx-me-y)' } };
const TXT = { enemy: { x: 'var(--fx-enemy-x)', y: 'calc(var(--fx-enemy-y) - 12%)' }, me: { x: 'calc(var(--fx-me-x) + 4%)', y: 'calc(var(--fx-me-y) - 14%)' } };
// Info-Texte zum eigenen Rüther (Ausgewichen!, … du bist dran!): mittig, damit lange Namen nicht links aus der Bühne laufen,
// und 12 % über den Schadenszahlen, damit sich beides nicht überdeckt
const INFO_ME = { x: '50%', y: 'calc(var(--fx-me-y) - 26%)' };
const jitter = (x, px) => `calc(${x} + ${Math.round((Math.random() - 0.5) * px)}px)`;
// Einschlag-Sheet wächst mit dem Schaden: Tipp (3) ≈ 76 px, Spezial (40) = 224 px
const impactSize = dmg => Math.min(256, 64 + Math.round(dmg) * 4);
// Beben nach Schaden: klein < 15, mittel < 30, groß darüber; Lade-Attacken mindestens mittel
const quakeFor = (dmg, charged) => dmg >= 30 ? 'quake-l' : dmg >= 15 || charged ? 'quake-m' : 'quake-s';
const QUAKE_MS = { 'quake-s': 300, 'quake-m': 500, 'quake-l': 700 };
const COUNTDOWN = ['3', '2', '1', 'Kampf!'];
const COUNT_STEP = 500, INTRO_LEAD = CONST.INTRO_MS - COUNTDOWN.length * COUNT_STEP;
const COMBO_HIDE = 1000;

export function createBattleScreen({ el, onEnd, onEvent }) {
  const $ = s => el.querySelector(s);
  const flash = $('.flash'), stage = $('.stage'), fx = $('.fx'), helpers = $('.helpers'), comboEl = $('.combo');
  const enemySprite = $('.enemy-sprite'), timerEl = $('.timer');
  const enemyPanel = $('.fighter.enemy'), mePanel = $('.fighter.me');
  const frame = mePanel.querySelector('.frame'), meSprite = frame.querySelector('.sprite'), energyFill = mePanel.querySelector('.energy .fill');
  const specials = $('.specials'), sw = $('.switch'), overlay = $('.overlay');
  const intro = $('.intro'), countdown = intro.querySelector('.countdown');

  let state = null, raf = 0, countRaf = 0, lastTs = 0, running = false, ended = false, down = null;
  let input = freshInput(), dodgeDir = 'left', koPending = false, batchDelay = 0;
  let combo = 0, lastHitAt = -Infinity, stunTextAt = -Infinity;
  let ctx = {}; // { arena, arenaLevel, reward, masteredAfter }
  const timers = new Set();
  const pending = new Map(); // node -> { cls: timerId }: Neustart derselben Animation löscht den alten Entfern-Timer

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
  // Kampfeigener Knoten (Tipp-Ring, M&M-Splitter, Münz-Bahn), entfernt sich nach ms
  function node(cls, ms, parent = fx) {
    const d = document.createElement('div');
    d.className = cls;
    parent.appendChild(d);
    later(() => d.remove(), ms);
    return d;
  }
  // Requisit in .fx; vars setzt Pfad-Variablen am Element (--spin Drehung bei arc-to-enemy, --dx seitlicher Versatz)
  function prop(name, path, opts, vars = {}) {
    const p = propFx(fx, name, path, opts);
    for (const [k, v] of Object.entries(vars)) p.el.style.setProperty(k, v);
    return p;
  }
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
  // 12 kleine M&Ms in den Seltenheitsfarben fliegen vom Boss auseinander
  function mmsBurst() {
    node('mms-burst', 1200).innerHTML = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 2 * Math.PI;
      return `<img src="art/fx-mms.png" alt="" style="--dx:${Math.round(Math.cos(a) * 120)}px;--dy:${Math.round(Math.sin(a) * 100)}px;--c:${RARITY_COLORS[i % RARITY_COLORS.length]}">`;
    }).join('');
  }
  // Münzen wandern vom Boss zum eigenen Rüther: die Hülle läuft die Bahn (css), das Sheet spielt darin
  const drainCoins = () => playSheet(node('drain', 900), 'coins', { x: '0px', y: '0px', size: 112, ms: 900 });
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

  // Spezial-Attacken nach attack.fx (Spec §4): Requisit art/fx-<name>.png auf seinem Pfad plus Sheet.
  // Rückgabe: ms bis zum Einschlag (Sheet, Zahl, Wackeln, Folge-Effekte). Würfe fliegen 700 ms, Einschlag bei 600 ms.
  const FX = {
    'chart-up'() { prop('chart-up', 'rise-at-enemy', { ms: 1200, size: 192 }); sheet('coins', 'enemy', { y: '30%', size: 192, ms: 1200 }); return 500; },
    handshake() { prop('handshake', 'pulse-at-enemy', { ms: 1200, size: 144 }); return 400; },
    can() { prop('beer-can', 'arc-to-enemy', { ms: 700, size: 96 }); return 600; },
    family() { text('Familie!', 'me'); return 0; }, // fx-family kommt mit dem summoned-Event
    handbag() { prop('handbag', 'arc-to-enemy', { ms: 700, size: 128 }, { '--spin': '30deg' }); return 600; }, // ohne Drehung, nur Schwung
    wallet() { // Controller klappt zur Hardware-Wallet um, dann rollen die Münzen vom Boss herüber
      prop('controller', 'morph-at-me', { ms: 450, size: 112 });
      later(() => prop('wallet', 'morph-at-me', { ms: 900, size: 112 }), 400);
      later(drainCoins, 800);
      return 800;
    },
    controller() { prop('controller', 'arc-to-enemy', { ms: 700, size: 112 }); return 600; },
    gas() { prop('gas', 'rise-at-enemy', { ms: 1200, size: 192 }); sheet('smoke', 'enemy', { y: '62%', size: 192 }); return 400; },
    speech(atk) {
      const t = document.createElement('span');
      t.className = 'bubble-text';
      t.textContent = atk.flavour || 'Deutsche Bank ist kein Geringverdiener.';
      prop('speech', 'bubble-at-me', { ms: 2000, size: 208, html: t.outerHTML });
      return 400;
    },
    mms() { prop('mms', 'rise-at-enemy', { ms: 1200, size: 160 }); later(mmsBurst, 300); return 450; },
    bags() { [-1, 0, 1].forEach(i => later(() => prop('bags', 'arc-to-enemy', { ms: 700, size: 96 }, { '--dx': `${i * 44}px` }), (i + 1) * 150)); return 0; },
  };
  // Boss-Attacken nach attack.fx. Rückgabe: ms bis zum Einschlag beim Spieler.
  const BOSS_FX = {
    disc() { prop('disc', 'drop-on-me', { ms: 500, size: 96 }); return 360; },
    yellow() { prop('yellow-light', 'rise-at-enemy', { ms: 1200, size: 192 }); return 450; },
    firmware() { return 0; }, // Requisit mit laufendem Balken kommt mit dem stun-Event (bar-on-me)
    crash() { prop('crash', 'crash-at-me', { ms: 700, size: 144 }); return 550; },
    chain() { prop('chain', 'drop-on-me', { ms: 900, size: 144 }); return 650; }, // drop-on-me rasselt nach dem Aufprall
    mining() { prop('pickaxe', 'swing-at-enemy', { ms: 900, size: 144 }); return 0; },
    block() { prop('block', 'drop-on-me', { ms: 500, size: 112 }); return 360; },
    half() { prop('halving', 'drop-on-me', { ms: 700, size: 192 }); return 500; },
    key() { prop('key', 'rise-at-enemy', { ms: 1200, size: 128 }); return 0; },
  };
  const run = (table, atk) => (table[atk.fx] || (() => 0))(atk);

  // ---------- Events → Animationen ----------
  function handle(e) {
    onEvent?.(e);
    const at = e.target === 'me' ? 'me' : 'enemy';
    switch (e.type) {
      case 'fast': hitEnemy(e.damage); comboHit(); break;
      case 'special':
        batchDelay = run(FX, e.attack);
        sheet('sparkle', 'me', { size: 128, ms: 700 });
        sfx.play('special'); haptic(20);
        if (e.damage > 0) later(() => hitEnemy(e.damage), batchDelay);
        break;
      case 'specialDenied': anim(specials, 'shake-x', 400); break;
      case 'stunnedTap': { // höchstens ein „betäubt" gleichzeitig (lebt 1,2 s)
        const now = performance.now();
        if (now - stunTextAt > 1200) { stunTextAt = now; text('betäubt', 'me'); }
        break;
      }
      case 'warn': sfx.play('warn'); break; // Blinken und Ausholen hängen am Zustand (render)
      case 'dodge': anim(meSprite, `dodge-${dodgeDir}`, 450); text('Ausgewichen!', 'me'); sfx.play('dodge'); break;
      case 'enemyAttack':
        batchDelay = run(BOSS_FX, e.attack);
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
      case 'stun':
        if (at === 'enemy') later(() => { for (let i = 0; i < 3; i++) later(() => num('Z', 'enemy', 'info', 1400), i * 450); }, batchDelay);
        else later(() => prop('firmware', 'bar-on-me', { ms: e.ms, size: 144, html: '<span class="fw-label">Firmware-Update…</span>' }), batchDelay);
        break;
      case 'weaken': later(() => text('geschwächt', 'enemy'), batchDelay); break;
      case 'heal':
        later(() => {
          anim(at === 'me' ? mePanel : enemyPanel, 'glow', 900);
          sheet('sparkle', at, { size: 160, ms: 900 });
          if (e.amount > 0) num(`+${e.amount}`, at, 'heal');
        }, batchDelay);
        break;
      case 'summoned': showHelpers(e.ms); break;
      case 'summon': anim(helpers, 'hop', 300); num(`-${e.damage}`, 'enemy'); break;
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
        later(() => { enemySprite.classList.add('ko'); sfx.play('win'); haptic([30, 30, 30]); }, batchDelay);
        later(showOverlay, batchDelay + 900);
        break;
      case 'lose': later(() => sfx.play('lose'), batchDelay); later(showOverlay, batchDelay + 900); break;
    }
  }

  // Familientreffen: fx-family rutscht neben den eigenen Rüther; .helpers hüpft bei jedem Schlag (summon)
  function showHelpers(ms = 10_000) {
    helpers.innerHTML = '';
    helpers.classList.remove('hidden');
    propFx(helpers, 'family', 'helpers', { ms, size: 128 });
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
      m.append(icon('lightning', 'ico-sm'), c, (a.damage ? ` · ${a.damage} Schaden` : '') + (a.heal ? ` · +${a.heal} BTC` : ''));
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
      const h = document.createElement('span'); h.textContent = `${f.btc} BTC · Energie ${f.energy}`;
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
  function panel(p, f, t) {
    const name = p.querySelector('.fname');
    setText(name, `${f.name}${f.level ? ` · Lv. ${f.level}` : ''}`);
    name.classList.toggle('rage', !!f.rage);
    const pct = Math.max(0, Math.round((100 * f.btc) / f.maxBtc));
    const fill = p.querySelector('.hp .fill');
    setWidth(fill, pct);
    fill.classList.toggle('low', pct <= 25);
    const st = [f.status.poison && 'Gift', f.status.stunUntil > t && 'betäubt', f.status.weakenedUntil > t && 'geschwächt'].filter(Boolean).join(' · ');
    setText(p.querySelector('.status'), st);
  }
  function render() {
    const t = state.time, e = state.enemy, me = state.team[state.active];
    panel(enemyPanel, e, t);
    setText(enemyPanel.querySelector('.btc'), `${e.btc} / ${e.maxBtc} BTC`);
    panel(mePanel, me, t);
    setText(mePanel.querySelector('.btc'), `${me.btc} / ${me.maxBtc} BTC · Energie ${me.energy}`);
    setWidth(energyFill, (100 * me.energy) / CONST.MAX_ENERGY);
    energyFill.classList.toggle('full', me.energy >= CONST.MAX_ENERGY);
    const left = Math.max(0, Math.ceil((state.duration - t) / 1000));
    setText(timerEl, String(left));
    timerEl.classList.toggle('low', left < 10 && !state.over);
    const w = state.over ? null : e.warning;
    flash.classList.toggle('yellow', !!w && w.kind === 'fast');
    flash.classList.toggle('red', !!w && w.kind === 'charged');
    enemySprite.classList.toggle('windup', !!w);
    enemySprite.classList.toggle('stunned', e.status.stunUntil > t);
    enemySprite.classList.toggle('weak', e.status.weakenedUntil > t);
    enemySprite.classList.toggle('poisoned', !!e.status.poison);
    meSprite.classList.toggle('poisoned', !!me.status.poison);
    helpers.classList.toggle('hidden', !state.summons.length);
    if (combo && t - lastHitAt > COMBO_HIDE) resetCombo();
    const stunnedMe = me.status.stunUntil > t;
    specials.querySelectorAll('.special').forEach((b, i) => {
      const a = me.attacks[i];
      const ok = !state.over && !stunnedMe && me.energy >= a.cost && !(a.once && me.used[a.name]);
      if (b.disabled === ok) b.disabled = !ok;
      b.classList.toggle('ready', ok);
    });
    const swap = specials.querySelector('.swap');
    if (swap) swap.disabled = state.over || !state.team.some((f, i) => i !== state.active && f.btc > 0);
  }

  // ---------- Schleife ----------
  // Feste Zeitschritte mit Aufholen: auch bei gedrosseltem rAF (Hintergrund-Tab,
  // sparsamer Browser) folgt die Spielzeit der echten Zeit. Tipps werden auf die
  // Schritte verteilt, Spezial/Ausweichen/Wechsel gelten im ersten Schritt.
  const STEP = 1000 / 60, MAX_CATCHUP = 1500;
  function loop(ts) {
    if (!running) return;
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
    }
    batchDelay = 0; koPending = false;
    render();
    raf = state.over ? 0 : requestAnimationFrame(loop);
  }
  function begin() {
    running = true; lastTs = 0;
    raf = requestAnimationFrame(loop);
  }

  // ---------- VS-Intro: Arena, Sprites, „VS", Countdown; erst danach läuft die Schleife ----------
  function showIntro(then) {
    const me = state.team[state.active], boss = state.enemy;
    setText(intro.querySelector('.intro-arena'), ctx.arena?.name || 'Arena');
    setText(intro.querySelector('.intro-level'), `Arena Lv. ${ctx.arenaLevel}${ctx.masteredAfter ? ' · Meisterkampf' : ''}`);
    intro.querySelector('.intro-me').src = sprite(me.id);
    intro.querySelector('.intro-boss').src = bossArt(boss.id);
    setText(intro.querySelector('.intro-me-name'), me.name);
    setText(intro.querySelector('.intro-boss-name'), boss.name);
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
    if (!running || state.over) return;
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
    const won = !!state.won, boss = state.enemy, img = overlay.querySelector('.boss');
    img.src = bossArt(boss.id);
    img.classList.toggle('fall', won);
    overlay.classList.toggle('lost', !won); // Niederlage: Papier mit Rotstempel statt Urkunde
    overlay.querySelector('.trophy').classList.toggle('hidden', !won);
    overlay.querySelector('.retry').classList.toggle('hidden', won);
    setText(overlay.querySelector('.done'), won ? 'Weiter' : 'Karte');
    setText(overlay.querySelector('.title'), won ? 'Arena erobert!' : 'Verloren');
    setText(overlay.querySelector('.sub'), won
      ? `${boss.name} ist pleite. Die Arena gehört jetzt ${state.team[0].name}.`
      : state.reason === 'timeout' ? 'Die Zeit ist um.' : 'Alle Rüthers sind pleite.');
    const conf = overlay.querySelector('.confetti');
    conf.innerHTML = '';
    if (won) {
      confetti(conf, 36);
      later(() => playSheet(conf, 'coins', { x: '50%', y: '22%', size: 192, ms: 1800 }), 800);
    }
    const gain = overlay.querySelector('.sats-gain');
    setText(gain, '+0 Sats');
    gain.classList.toggle('hidden', !won);
    if (won) later(() => countUp(gain, ctx.reward || 0), 800); // erst wenn .sats-gain eingeblendet ist (bt-sats-in startet nach .8s)
    setText(overlay.querySelector('.arena-note'), !won ? ''
      : ctx.masteredAfter ? 'Arena gemeistert!' : `Arena Lv. ${(ctx.arenaLevel || 1) + 1} freigeschaltet`);
    overlay.classList.remove('hidden');
  }
  function end(retry) {
    if (ended || !state?.over) return;
    ended = true;
    const won = !!state.won;
    stop();
    onEnd({ won, retry });
  }
  overlay.querySelector('.done').addEventListener('click', () => end(false));
  // Aufgeben: Kampf sofort beenden (auch im Intro), zählt als Niederlage – außer der Kampf ist schon entschieden
  // (zwischen KO und Overlay liegen bis ~1,7 s, ein Tipp auf Aufgeben darf den Sieg nicht verwerfen)
  el.querySelector('.quit').addEventListener('click', () => {
    if (!state || ended) return;
    ended = true;
    stop();
    onEnd({ won: !!(state.over && state.won), retry: false });
  });
  overlay.querySelector('.retry').addEventListener('click', () => end(true));

  function stop() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    cancelAnimationFrame(countRaf); countRaf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear(); pending.clear();
    window.removeEventListener('keydown', onKey);
    fx.innerHTML = ''; helpers.innerHTML = ''; helpers.className = 'helpers hidden';
    flash.className = 'flash'; stage.classList.remove('rage', 'quake-s', 'quake-m', 'quake-l');
    enemySprite.className = 'enemy-sprite sprite'; meSprite.className = 'sprite';
    specials.classList.remove('shake-x'); enemyPanel.classList.remove('glow'); mePanel.classList.remove('glow');
    resetCombo(); stunTextAt = -Infinity;
    sw.classList.add('hidden'); overlay.classList.add('hidden'); intro.classList.add('hidden');
    overlay.querySelector('.confetti').innerHTML = '';
    down = null; input = freshInput();
  }

  function start({ team, enemy, rng = Math.random, arena = null, arenaLevel = 1, reward = 0, masteredAfter = false }) {
    stop();
    state = createBattle({ team, enemy, rng });
    ctx = { arena, arenaLevel, reward, masteredAfter };
    ended = false; koPending = false; batchDelay = 0;
    if (arena?.id) el.dataset.arena = arena.id; else delete el.dataset.arena; // Bühne und Intro zeigen art/bg-<arena>.png (css)
    const me = state.team[state.active];
    enemySprite.src = bossArt(state.enemy.id);
    meSprite.src = sprite(me.id);
    setFrame(me);
    anim(meSprite, 'slide-in', 500);
    buildSpecials();
    render(); // Timer steht auf 90, bis das Intro vorbei ist
    window.addEventListener('keydown', onKey);
    showIntro(begin);
  }

  return { start, stop };
}
