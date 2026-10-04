import { CONST } from './data.js';
import { createBattle, tick } from './battle.js';

// Kampf-Bildschirm: requestAnimationFrame-Schleife um die Engine, Pointer-Eingabe,
// Events → CSS-Animationen (css/battle.css), End-Overlay.
// createBattleScreen({ el, onEnd }) -> { start({ team, enemy, rng }), stop() }
// onEnd({ won, retry }) genau einmal pro Kampf, wenn der Spieler im Overlay tippt.

const sprite = id => `sprites/${id}.png`;
const freshInput = () => ({ taps: 0, dodge: false, special: null, switchTo: null });
const svgLine = pts => `<svg viewBox="0 0 200 120" preserveAspectRatio="none"><polyline pathLength="100" points="${pts}"/></svg>`;
const COLORS = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa'];
const coins = n => Array.from({ length: n }, (_, i) =>
  `<img class="coin" src="sprites/coin.png" alt="" style="--x:${Math.round(8 + Math.random() * 84)}%;--d:${(i * 0.09).toFixed(2)}s">`).join('');
const dots = n => Array.from({ length: n }, (_, i) =>
  `<i style="--x:${Math.round((Math.random() - 0.5) * 120)}px;--d:${(i * 0.05).toFixed(2)}s;--c:${COLORS[i % COLORS.length]}"></i>`).join('');
const buzz = ms => navigator.vibrate?.(ms);

export function createBattleScreen({ el, onEnd }) {
  const $ = s => el.querySelector(s);
  const flash = $('.flash'), stage = $('.stage'), fx = $('.fx'), helpers = $('.helpers');
  const enemySprite = $('.enemy-sprite'), timerEl = $('.timer');
  const enemyPanel = $('.fighter.enemy'), mePanel = $('.fighter.me');
  const meSprite = mePanel.querySelector('.sprite'), energyFill = mePanel.querySelector('.energy .fill');
  const specials = $('.specials'), sw = $('.switch'), overlay = $('.overlay');

  let state = null, raf = 0, lastTs = 0, running = false, ended = false, down = null;
  let input = freshInput(), dodgeDir = 'left', koPending = false, batchDelay = 0;
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

  // ---------- Effekt-Elemente ----------
  function item(cls, at, ms, { text = '', html = '', vars = {} } = {}) {
    const d = document.createElement('div');
    d.className = `fx-item at-${at} ${cls}`;
    if (html) d.innerHTML = html; else if (text) d.textContent = text;
    for (const [k, v] of Object.entries(vars)) d.style.setProperty(k, v);
    fx.appendChild(d);
    later(() => d.remove(), ms);
    return d;
  }
  const num = (n, at, cls = '') => item(`num ${cls}`, at, 900, { text: n, vars: { '--x': `${Math.round((Math.random() - 0.5) * 60)}px` } });
  const text = (t, at) => item('text', at, 1200, { text: t });
  const emoji = (ch, cls, at, ms) => item(`emoji ${cls}`, at, ms, { text: ch });
  const glow = color => item('glow-ring', 'enemy', 900, { vars: { '--c': color } });
  // Versatz vom Boss (Bühnenmitte) zum eigenen Rüther (unten links), für Wurf- und Drain-Bahnen
  function meOffset() {
    const r = stage.getBoundingClientRect();
    return { '--dx': `${Math.round(-0.33 * r.width)}px`, '--dy': `${Math.round(0.5 * r.height)}px` };
  }
  function hitEnemy(n) {
    anim(enemySprite, 'shake', 350);
    num(`-${n}`, 'enemy');
    item('boom', 'enemy', 400, { text: '💥' });
  }

  // Spezial-Attacken nach attack.fx. Rückgabe: ms bis zum Einschlag (Zahl, Wackeln, Folge-Effekte).
  const FX = {
    'chart-up'() { item('chart-up', 'enemy', 1800, { html: svgLine('0,110 40,90 70,100 110,60 140,70 200,10') + '<div class="big">+70 %</div>' + coins(9) }); return 500; },
    handshake() { emoji('🤝', 'handshake', 'enemy', 1300); return 300; },
    can() { item('emoji can', 'enemy', 600, { text: '🍺', vars: meOffset() }); return 560; },
    family() { text('📣 Familie!', 'me'); return 0; },
    handbag() { emoji('👜', 'handbag', 'enemy', 600); return 420; },
    wallet() {
      item('emoji wallet', 'me', 1000, { html: '<span class="a">🎮</span><span class="b">₿</span>' });
      later(() => item('drain', 'enemy', 1200, { html: coins(6), vars: meOffset() }), 800);
      return 800;
    },
    controller() { item('emoji controller', 'enemy', 600, { text: '🎮', vars: meOffset() }); return 520; },
    gas() { item('gas', 'enemy', 1600); return 300; },
    speech(atk) { item('bubble', 'me', 2000, { text: atk.flavour || 'Deutsche Bank ist kein Geringverdiener.' }); return 400; },
    mms() { item('mms', 'enemy', 1500, { html: dots(14) }); return 450; },
    bags() { item('bags', 'me', 1100, { html: [0, 0.15, 0.3].map(d => `<span style="--d:${d}s">🛍️</span>`).join('') }); return 0; },
  };
  // Boss-Attacken nach attack.fx. Rückgabe: ms bis zum Einschlag beim Spieler.
  const BOSS_FX = {
    disc() { emoji('💿', 'disc', 'me', 550); return 500; },
    yellow() { glow('#ffd600'); return 450; },
    firmware() { return 0; }, // Beschriftung trägt der .firmware-Balken (stun-Event)
    crash() { item('crash', 'me', 900, { html: svgLine('0,10 40,40 70,25 110,80 140,65 200,118') }); return 450; },
    chain() { emoji('⛓️⛓️⛓️', 'chain', 'me', 700); return 300; },
    mining() { emoji('⛏️', 'mining', 'enemy', 800); glow('#3ddc84'); return 0; },
    block() { emoji('🧱', 'block', 'me', 700); return 400; },
    half() { item('half', 'enemy', 900, { text: '½' }); return 300; },
    key() { emoji('🔑', 'key', 'enemy', 900); glow('#3ddc84'); return 0; },
  };
  const run = (table, atk) => (table[atk.fx] || (() => 0))(atk);

  // ---------- Events → Animationen ----------
  function handle(e) {
    const at = e.target === 'me' ? 'me' : 'enemy';
    switch (e.type) {
      case 'fast': hitEnemy(e.damage); break;
      case 'special':
        batchDelay = run(FX, e.attack);
        buzz(20);
        if (e.damage > 0) later(() => hitEnemy(e.damage), batchDelay);
        break;
      case 'specialDenied': anim(specials, 'shake-x', 400); break;
      case 'stunnedTap': if (!fx.querySelector('.stunned-tap')) item('text stunned-tap', 'me', 1200, { text: 'betäubt' }); break;
      case 'warn': break; // Blinken und Ausholen hängen am Zustand (render)
      case 'dodge': anim(meSprite, `dodge-${dodgeDir}`, 450); text('Ausgewichen!', 'me'); break;
      case 'enemyAttack':
        batchDelay = run(BOSS_FX, e.attack);
        if (e.kind === 'charged' && e.damage > 0) later(() => anim(stage, 'quake', 500), batchDelay);
        if (e.damage > 0) later(() => {
          if (e.dodged) { num(`-${e.damage}`, 'me', 'small'); return; }
          anim(meSprite, 'shake', 350);
          num(`-${e.damage}`, 'me', 'hurt');
          buzz(e.kind === 'charged' ? 60 : 25);
        }, batchDelay);
        break;
      case 'poisoned': later(() => item('puff', at, 800), batchDelay); break;
      case 'poison': num(`-${e.damage}`, at, 'small'); break;
      case 'stun':
        if (at === 'enemy') later(() => { for (let i = 0; i < 3; i++) item('emoji zz', 'enemy', e.ms, { text: '💤', vars: { '--d': `${i * 0.45}s` } }); }, batchDelay);
        else later(() => item('firmware', 'me', e.ms, { html: '<span>Firmware-Update…</span>', vars: { '--ms': `${e.ms}ms` } }), batchDelay);
        break;
      case 'weaken': later(() => item('arrow', 'enemy', 900, { text: '↓' }), batchDelay); break;
      case 'heal':
        later(() => {
          anim(at === 'me' ? mePanel : enemyPanel, 'glow', 900);
          if (e.amount > 0) num(`+${e.amount}`, at, 'heal');
        }, batchDelay);
        break;
      case 'summoned': showHelpers(e.ids || []); break;
      case 'summon': {
        const h = helpers.querySelector(`[data-id="${e.id}"]`);
        if (h) anim(h, 'hop', 400);
        num(`-${e.damage}`, 'enemy');
        break;
      }
      case 'faint': // KO erst, wenn der auslösende Boss-Angriff eingeschlagen ist
        koPending = true;
        later(() => { meSprite.classList.add('ko'); text(`${e.fighter.name} ist pleite!`, 'me'); }, batchDelay);
        break;
      case 'switch': {
        const f = e.fighter;
        later(() => {
          meSprite.className = 'sprite';
          meSprite.src = sprite(f.id);
          anim(meSprite, 'slide-in', 500);
          text(`${f.name}, du bist dran!`, 'me');
        }, koPending ? batchDelay + 1000 : 0); // ko (900 ms) fertig, „ist pleite!" blendet schon aus
        buildSpecials();
        break;
      }
      case 'win':
        later(() => { enemySprite.classList.add('ko'); buzz([40, 40, 80]); }, batchDelay);
        later(showOverlay, batchDelay + 900);
        break;
      case 'lose': later(showOverlay, batchDelay + 900); break;
    }
  }

  function showHelpers(ids) {
    helpers.innerHTML = '';
    helpers.classList.remove('hidden');
    for (const id of ids) {
      const img = document.createElement('img');
      img.src = sprite(id); img.dataset.id = id; img.alt = '';
      helpers.appendChild(img);
      anim(img, 'slide-in', 500);
    }
  }

  // ---------- Buttons ----------
  function buildSpecials() {
    const me = state.team[state.active];
    specials.innerHTML = '';
    sw.classList.add('hidden');
    me.attacks.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'special';
      const n = document.createElement('span'); n.className = 'sname'; n.textContent = a.name;
      const m = document.createElement('span'); m.className = 'smeta';
      m.textContent = `⚡${a.cost}` + (a.damage ? ` · ${a.damage} Schaden` : '') + (a.heal ? ` · +${a.heal} BTC` : '');
      b.append(n, m);
      b.addEventListener('click', () => { if (running && !state.over) input.special = i; });
      specials.appendChild(b);
    });
    if (state.team.length > 1) {
      const b = document.createElement('button');
      b.className = 'swap'; b.textContent = '🔁 Wechseln';
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
      const n = document.createElement('span'); n.textContent = f.name;
      const h = document.createElement('span'); h.textContent = `${f.btc} BTC · ⚡${f.energy}`;
      b.append(n, h);
      b.addEventListener('click', () => { input.switchTo = i; sw.classList.add('hidden'); });
      sw.appendChild(b);
    });
    const c = document.createElement('button');
    c.textContent = 'Abbrechen';
    c.addEventListener('click', () => sw.classList.add('hidden'));
    sw.appendChild(c);
    sw.classList.remove('hidden');
  }

  // ---------- Rendern pro Frame ----------
  function panel(p, f, t) {
    setText(p.querySelector('.fname'), f.name);
    const pct = Math.max(0, Math.round((100 * f.btc) / f.maxBtc));
    const fill = p.querySelector('.hp .fill');
    setWidth(fill, pct);
    fill.classList.toggle('low', pct <= 25);
    const st = [f.status.poison && '☠ Gift', f.status.stunUntil > t && '💤 betäubt', f.status.weakenedUntil > t && '↓ geschwächt'].filter(Boolean).join(' · ');
    setText(p.querySelector('.status'), st);
  }
  function render() {
    const t = state.time, e = state.enemy, me = state.team[state.active];
    panel(enemyPanel, e, t);
    setText(enemyPanel.querySelector('.btc'), `${e.btc} / ${e.maxBtc} BTC`);
    panel(mePanel, me, t);
    setText(mePanel.querySelector('.btc'), `${me.btc} / ${me.maxBtc} BTC · ⚡ ${me.energy}`);
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
  function frame(ts) {
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
    raf = state.over ? 0 : requestAnimationFrame(frame);
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
    const r = stage.getBoundingClientRect();
    const ring = item('tap', 'enemy', 350);
    ring.style.left = `${e.clientX - r.left}px`;
    ring.style.top = `${e.clientY - r.top}px`;
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  function onKey(e) {
    if (!running || state.over || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    input.dodge = true; dodgeDir = e.key === 'ArrowLeft' ? 'left' : 'right';
    e.preventDefault();
  }

  // ---------- Ende ----------
  function showOverlay() {
    const won = !!state.won, boss = state.enemy, img = overlay.querySelector('.boss');
    img.src = sprite(boss.id);
    img.classList.toggle('fall', won);
    overlay.querySelector('.trophy').classList.toggle('hidden', !won);
    overlay.querySelector('.retry').classList.toggle('hidden', won);
    setText(overlay.querySelector('.done'), won ? 'Weiter' : 'Karte');
    setText(overlay.querySelector('.title'), won ? 'Arena erobert!' : 'Verloren');
    setText(overlay.querySelector('.sub'), won
      ? `${boss.name} ist pleite. Die Arena gehört jetzt ${state.team[0].name}.`
      : state.reason === 'timeout' ? 'Die Zeit ist um.' : 'Alle Rüthers sind pleite.');
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
  // Aufgeben: Kampf sofort beenden, zählt als Niederlage
  el.querySelector('.quit').addEventListener('click', () => {
    if (!state || ended) return;
    ended = true;
    stop();
    onEnd({ won: false, retry: false });
  });
  overlay.querySelector('.retry').addEventListener('click', () => end(true));

  function stop() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear(); pending.clear();
    window.removeEventListener('keydown', onKey);
    fx.innerHTML = ''; helpers.innerHTML = ''; helpers.classList.add('hidden');
    flash.className = 'flash'; stage.classList.remove('quake');
    enemySprite.className = 'enemy-sprite sprite'; meSprite.className = 'sprite';
    specials.classList.remove('shake-x'); enemyPanel.classList.remove('glow'); mePanel.classList.remove('glow');
    sw.classList.add('hidden'); overlay.classList.add('hidden');
    down = null; input = freshInput();
  }

  function start({ team, enemy, rng = Math.random }) {
    stop();
    state = createBattle({ team, enemy, rng });
    ended = false; lastTs = 0; running = true; koPending = false; batchDelay = 0;
    enemySprite.src = sprite(state.enemy.id);
    meSprite.src = sprite(state.team[state.active].id);
    anim(meSprite, 'slide-in', 500);
    buildSpecials();
    render();
    window.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(frame);
  }

  return { start, stop };
}
