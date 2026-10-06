import { CONST, RARITY_BY_ID, pickLine } from './data.js';
import { ringBonus, landing, isHit, rollCatch, isFlick } from './catch-logic.js';
import { catchChanceV3 } from './progress.js';
import { sfx, haptic } from './audio.js';
import { playSheet, confetti, say as bubble, btcRain, spinCoin } from './fx.js';
import { isNarration } from './format.js';

const FLY_MS = 700, ARC = 120, GROUND = 60, REWARD_MS = 2800, COIN = 112;
const CONFETTI = ['#F2C94C', '#E0A52B', '#F4E8C8', '#F2C94C']; // Gold, Bernstein, Creme
const ICO = n => `<img class="ico" src="art/icon-${n}.png" alt="">`;
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = n => n.toLocaleString('de-DE');
// Schwert als Pixelgrafik (wie die freien Arenen in js/map.js): O = Ink, W = Klinge, L = Licht, G = Messing, B = Griff
const SWORD = ['....OO......', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....', '...OWLO.....',
  'OOOOOOOOOO..', 'OGGGGGGGGO..', 'OOOOOOOOOO..', '...OBBO.....', '...OBBO.....', '...OBBO.....', '...OGGO.....', '...OOOO.....'];
const PX = { O: '#1E2A22', W: '#C9CED1', L: '#F4E8C8', G: '#F2C94C', B: '#5A3A1E' };
const SWORD_SVG = `<svg class="sword" viewBox="-2 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${SWORD.flatMap((row, y) =>
  [...row].map((c, x) => (PX[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${PX[c]}"/>` : ''))).join('')}</svg>`;

// el = section#screen-catch.
// onDone({ spawn, caught }) genau einmal; onCancel() beim Zurück-Knopf .back (nur in idle);
// onCaught({ spawn, usedSuperCoin }) -> { sats, newDex } synchron im Moment „Gefangen!";
// onSuperCoinUsed() -> Restanzahl, beim Treffer mit aktiver Super-Münze (auch wenn der Rüther ausbricht);
// onThrow({ hit, label }) nach jeder Trefferprüfung (label 'Super!' | 'Gut!' | '', bei Fehlwurf/Abwehr hit false);
// onFight({ spawn }) beim Knopf „Kämpfen" (nur in idle, nur mit Team). Der Fang-Screen ist danach beendet, onDone kommt nicht.
export function createCatchScreen({ el, onDone, onCancel, onCaught, onSuperCoinUsed, onThrow, onFight }) {
  const stage = el.querySelector('.catch-stage');
  const target = el.querySelector('.target');
  const sprite = target.querySelector('.sprite');
  const ring = target.querySelector('.ring');
  const fx = el.querySelector('.catch-fx');
  const msg = el.querySelector('.catch-msg');
  const coin = el.querySelector('.coin');
  const badge = el.querySelector('.rarity-badge');
  const reward = el.querySelector('.reward');
  const superBtn = el.querySelector('.supercoin');
  const name = el.querySelector('.name');
  const title = el.querySelector('.title');
  const desc = el.querySelector('.desc');
  const throwsEl = el.querySelector('.throws');
  const fight = document.createElement('div');
  fight.className = 'catch-fight';
  fight.innerHTML = `<span class="fight-hint"></span><button class="fight-btn">${SWORD_SVG}Kämpfen</button>`;
  stage.appendChild(fight);
  const fightBtn = fight.querySelector('.fight-btn');

  let spawn = null, def = null, rng = Math.random, left = 0;
  let rarity = 'normal', superCoins = 0, superActive = false, canFight = false;
  let state = 'done'; // idle | drag | flying | seq | done
  let drag = null;
  let sparkle = null; // Funkel-Loop über der Super-Münze, folgt ihr über setCoin

  // ---- Timer ----
  const timers = new Set();
  let raf = 0, msgTimer = 0;
  const after = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const wait = ms => new Promise(r => after(ms, r));
  function clearAll() { timers.forEach(clearTimeout); timers.clear(); cancelAnimationFrame(raf); }

  // ---- Hilfen ----
  function setState(s) { state = s; el.dataset.state = s; }
  function setCoin(x, y, r = 0, s = 1) {
    coin.style.setProperty('--x', `${x}px`); coin.style.setProperty('--y', `${y}px`);
    coin.style.setProperty('--r', `${r}deg`); coin.style.setProperty('--s', s);
    if (sparkle) { sparkle.el.style.setProperty('--x', `${sparkle.x + x}px`); sparkle.el.style.setProperty('--y', `${sparkle.y + y}px`); }
  }
  // Das Funkeln springt mit setCoin sofort, die Münze gleitet/fällt per CSS: solange ausblenden, resetCoin zeigt es wieder
  const sparkleVisible = on => { if (sparkle) sparkle.el.style.visibility = on ? '' : 'hidden'; };
  function resetCoin() { coin.className = superActive ? 'coin super' : 'coin'; setCoin(0, 0); sparkleVisible(true); }
  function spriteAnim(cls) { sprite.classList.remove('hop', 'suck', 'pop'); if (cls) sprite.classList.add(cls); }
  // Spruch als Sprechblase über dem Rüther; hängt in .target und läuft so mit ihm mit
  const talk = (kind, ms = 2600, t = pickLine(def.id, kind)) => {
    if (!t) return;
    target.querySelectorAll('.fx-say').forEach(n => n.remove()); // nie zwei Blasen übereinander
    bubble(target, t, { x: '22%', y: '-4%', ms });
  };
  function say(text, ms = 1200, cls = '') {
    clearTimeout(msgTimer); timers.delete(msgTimer);
    msg.className = `catch-msg show ${cls}`.trim(); msg.textContent = text;
    msgTimer = after(ms, () => msg.classList.remove('show'));
  }
  function renderThrows() { throwsEl.textContent = `Ausbrüche übrig: ${left}`; }
  function renderSuper() {
    superBtn.innerHTML = `${ICO('coin')} Super-Münze (${superCoins})`;
    superBtn.classList.toggle('hidden', superCoins <= 0);
    superBtn.classList.toggle('active', superActive);
    if (superActive === !!sparkle) return;
    if (sparkle) { sparkle.stop(); sparkle = null; return; }
    // Ruhemitte der Münze ohne Transform: left 50 % + translate(-50 %) → Mitte = offsetLeft
    const x = coin.offsetLeft, y = coin.offsetTop + coin.offsetHeight / 2;
    sparkle = { ...playSheet(fx, 'sparkle', { x, y, size: 144, ms: 864e5 }), x, y };
  }
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const local = p => { const s = stage.getBoundingClientRect(); return { x: p.x - s.left, y: p.y - s.top }; }; // Client → .catch-fx
  function place(cls, text, p) {
    const q = local(p), node = document.createElement('div');
    node.className = cls; node.textContent = text;
    node.style.left = `${q.x}px`; node.style.top = `${q.y}px`;
    fx.appendChild(node);
    return node;
  }
  function ringScale() { return new DOMMatrixReadOnly(getComputedStyle(ring).transform).a || 1; }

  function idle() {
    setState('idle');
    resetCoin();
    spriteAnim(null);
  }
  function finish(caught) {
    if (state === 'done') return;
    clearAll(); setState('done');
    onDone({ spawn, caught });
  }
  const alive = () => state === 'idle' || state === 'drag' || state === 'flying';

  // ---- Rüther lebt: hüpfen, wehren ----
  function scheduleHop() {
    after(rand(3000, 6000), () => {
      if (alive() && !target.classList.contains('angry')) {
        spriteAnim('hop'); after(500, () => sprite.classList.remove('hop'));
      }
      scheduleHop();
    });
  }
  function scheduleAngry() {
    after(rand(5000, 9000), () => {
      if (alive() && !sprite.classList.contains('hop')) { // .target.angry .sprite würde den Hop abschneiden
        target.classList.add('angry');
        after(1200, () => target.classList.remove('angry'));
      }
      scheduleAngry();
    });
  }

  // ---- Super-Münze: Schalter, Verbrauch erst beim Treffer ----
  superBtn.addEventListener('click', () => {
    if (state !== 'idle' || superCoins <= 0) return;
    superActive = !superActive;
    coin.classList.toggle('super', superActive);
    renderSuper();
  });

  // ---- Münze ziehen und schnippen ----
  coin.draggable = false;
  coin.addEventListener('pointerdown', e => {
    if (state !== 'idle') return;
    e.preventDefault();
    try { coin.setPointerCapture(e.pointerId); } catch { /* synthetische Pointer ohne Capture */ }
    setState('drag');
    coin.classList.remove('return'); coin.classList.add('drag');
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, samples: [{ t: performance.now(), x: 0, y: 0 }] };
  });
  coin.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const x = e.clientX - drag.x0, y = e.clientY - drag.y0, t = performance.now();
    setCoin(x, y);
    drag.samples.push({ t, x, y });
    while (drag.samples.length > 1 && t - drag.samples[0].t > 100) drag.samples.shift();
  });
  function release(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    coin.classList.remove('drag');
    const x = e.clientX - d.x0, y = e.clientY - d.y0, t = performance.now();
    const s0 = d.samples[0], dt = Math.max(1, t - s0.t);
    const vx = (x - s0.x) / dt, vy = (y - s0.y) / dt;
    if (!isFlick(vy)) { // zu schwach: zurückgleiten
      coin.classList.add('return'); setCoin(0, 0); sparkleVisible(false);
      after(300, () => { coin.classList.remove('return'); sparkleVisible(true); });
      setState('idle');
      return;
    }
    setCoin(x, y);
    const cur = center(coin.getBoundingClientRect()), rest = { x: cur.x - x, y: cur.y - y };
    const land = landing(rest, vx, vy); // ab Ruheposition: der Ziehweg zählt nicht zur Wurfweite
    land.y = Math.max(stage.getBoundingClientRect().top + 40, land.y); // nie über die Bühne hinaus
    fly(rest, cur, land);
  }
  coin.addEventListener('pointerup', release);
  coin.addEventListener('pointercancel', release);

  // rest = Münzmitte in Ruhe (Client-Koordinaten); Flug als Parabel per rAF
  // Im Flug ersetzt eine drehende Bitcoin-Münze (sheet-btc-spin) das Münzbild und folgt der Parabel.
  function fly(rest, start, land) {
    setState('flying');
    msg.textContent = '';
    coin.classList.add('fly');
    sfx.play('throw');
    const spin = spinCoin(fx, { ...local(start), size: COIN });
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / FLY_MS);
      const px = start.x + (land.x - start.x) * t;
      const py = start.y + (land.y - start.y) * t - ARC * Math.sin(Math.PI * t);
      setCoin(px - rest.x, py - rest.y, 720 * t, 1 - 0.5 * t);
      const q = local({ x: px, y: py });
      spin.el.style.setProperty('--x', `${q.x}px`); spin.el.style.setProperty('--y', `${q.y}px`);
      spin.el.style.setProperty('--size', `${Math.round(COIN * (1 - 0.5 * t))}px`);
      if (t < 1) { raf = requestAnimationFrame(step); return; }
      spin.stop();
      coin.classList.remove('fly');
      setCoin(land.x - rest.x, land.y - rest.y, 0, 0.5);
      resolve(rest, land);
    };
    raf = requestAnimationFrame(step);
  }

  function resolve(rest, land) {
    if (!isHit(land, sprite.getBoundingClientRect())) { // daneben: fällt aus dem Bild
      coin.classList.add('fall'); sparkleVisible(false); say('Daneben!');
      onThrow?.({ hit: false, label: '' });
      after(500, idle);
      return;
    }
    if (target.classList.contains('angry')) { // abgewehrt: prallt zurück
      coin.classList.add('return'); setCoin(0, 0, -360, 1); sparkleVisible(false); say('Abgewehrt!'); talk('fight', 1800);
      onThrow?.({ hit: false, label: '' });
      after(400, idle);
      return;
    }
    hitSequence(rest, land);
  }

  // ---- Burst: Bitcoin-Einschlag + ₿-Regen, Legendär mit Gold-Konfetti und Schriftzug ----
  function burst() {
    const c = local(center(coin.getBoundingClientRect()));
    playSheet(fx, 'btcburst', { x: c.x, y: c.y, size: 256 });
    btcRain(fx, { n: 20 });
    if (rarity !== 'legendaer') return;
    const s = stage.getBoundingClientRect();
    place('legend', 'LEGENDÄR!', { x: s.left + s.width / 2, y: s.top + s.height * 0.14 }); // über dem Sprite, Belohnung kommt darunter
    confetti(fx, 40, CONFETTI, 2200);
  }

  // ---- Treffer: einsaugen, wackeln, gefangen oder Ausbruch ----
  async function hitSequence(rest, land) {
    setState('seq');
    const scale = ringScale();
    const { label } = ringBonus(scale);
    sfx.play('coin');
    onThrow?.({ hit: true, label });
    const sc = center(sprite.getBoundingClientRect());
    const lp = local(land);
    playSheet(fx, 'btcburst', { x: lp.x, y: lp.y, size: 160 });
    if (label) {
      const r = place('rating', label, { x: sc.x, y: sc.y - 100 });
      after(1000, () => r.remove());
    }
    sprite.style.setProperty('--sx', `${land.x - sc.x}px`);
    sprite.style.setProperty('--sy', `${land.y - sc.y}px`);
    target.querySelectorAll('.fx-say').forEach(n => n.remove()); // die Blase schwebt nicht weiter, wenn er in der Münze steckt
    spriteAnim('suck');
    await wait(400);

    setCoin(land.x - rest.x, land.y - rest.y + GROUND, 0, 0.5);
    coin.classList.add('drop');
    await wait(200);
    coin.classList.remove('drop');

    const usedSuperCoin = superActive;
    if (usedSuperCoin) { // Treffer verbraucht die Münze, Fehlwürfe nicht
      const n = onSuperCoinUsed?.();
      superCoins = typeof n === 'number' ? n : superCoins - 1;
      superActive = false; renderSuper();
    }
    const { caught, wobbles } = rollCatch(catchChanceV3(def.catchChance, rarity, scale, usedSuperCoin), rng);
    for (let i = 0; i < wobbles; i++) {
      await wait(250);
      coin.classList.add('wobble');
      await wait(600);
      coin.classList.remove('wobble');
    }

    if (caught) {
      coin.classList.add('glow');
      burst();
      say('Gefangen!');
      sfx.play('catch'); haptic([20, 30, 60]);
      const r = onCaught?.({ spawn, usedSuperCoin });
      if (r) {
        reward.innerHTML = `<div class="amount"><span class="spin-slot"></span>+${fmt(r.sats)} <small>Sats</small></div>${r.newDex ? `<div class="newdex">${ICO('star')}Neu im Rütherdex!</div>` : ''}<div class="line"><img class="face" src="sprites/${def.id}.png" alt=""><q></q></div>`;
        reward.querySelector('q').textContent = pickLine(def.id, 'caught');
        spinCoin(reward.querySelector('.spin-slot'), { x: '50%', y: '50%', size: 40 });
        reward.classList.remove('hidden');
      }
      await wait(REWARD_MS);
      finish(true);
      return;
    }

    coin.classList.add('burst');
    const c = local(center(coin.getBoundingClientRect()));
    playSheet(fx, 'smoke', { x: c.x, y: c.y - 48, size: 192 });
    spriteAnim('pop');
    say('Rausgehauen!');
    sfx.play('breakout');
    left -= 1; renderThrows();
    await wait(400);
    if (left <= 0) {
      target.classList.add('flee'); // ganzes Ziel rennt weg, die Sprechblase in .target läuft mit
      const line = pickLine(def.id, 'flee');
      if (line && isNarration(line, def.name)) say(line, 2200, 'narr'); // „Viktor ist zur Börse gelaufen." erzählt der Streifen, keine Blase
      else { say('Abgehauen!'); talk('flee', 2400, line); }
      await wait(2200);
      finish(false);
      return;
    }
    await wait(600);
    idle(); // Effekte räumen sich selbst ab (fx.js), der Rauch darf auslaufen
  }

  fightBtn.addEventListener('click', () => {
    if (state !== 'idle' || !canFight) return;
    clearAll(); setState('done');
    onFight?.({ spawn });
  });

  el.querySelector('.back').addEventListener('click', () => {
    if (state !== 'idle') return;
    clearAll(); setState('done');
    onCancel();
  });

  return {
    start(s, d, { rng: r = Math.random, rarity: ra = 'normal', superCoins: sc = 0, canFight: cf = false, fightHint = 'Fang erst einen per Münze' } = {}) {
      clearAll();
      spawn = s; def = d; rng = r; left = CONST.BREAKOUTS; drag = null;
      rarity = RARITY_BY_ID[ra] ? ra : 'normal'; superCoins = sc; superActive = false;
      const R = RARITY_BY_ID[rarity];
      sprite.src = `sprites/${d.id}.png`;
      sprite.style.removeProperty('--sx'); sprite.style.removeProperty('--sy');
      target.className = `target r-${rarity}`; // räumt auch angry weg
      stage.dataset.rarity = rarity;
      badge.innerHTML = rarity === 'legendaer' ? `${ICO('star')}${R.name}${ICO('star')}` : R.name;
      reward.classList.add('hidden'); reward.innerHTML = '';
      name.textContent = d.name; title.textContent = d.title; desc.textContent = d.desc;
      renderThrows(); renderSuper();
      canFight = cf; fightBtn.disabled = !cf; fight.classList.toggle('locked', !cf);
      fight.querySelector('.fight-hint').textContent = fightHint;
      msg.classList.remove('show');
      fx.replaceChildren();
      idle();
      talk('appear', 3200);
      scheduleHop();
      scheduleAngry();
    },
  };
}
