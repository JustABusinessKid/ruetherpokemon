import { CONST } from './data.js';
import { ringBonus, catchChance, landing, isHit, rollCatch, isFlick } from './catch-logic.js';

const FLY_MS = 700, ARC = 120, GROUND = 60;
const rand = (a, b) => a + Math.random() * (b - a);

// el = section#screen-catch. onDone({ spawn, caught }) genau einmal, onCancel() bei ✕ (nur in idle).
export function createCatchScreen({ el, onDone, onCancel }) {
  const stage = el.querySelector('.catch-stage');
  const target = el.querySelector('.target');
  const sprite = target.querySelector('.sprite');
  const ring = target.querySelector('.ring');
  const fx = el.querySelector('.catch-fx');
  const msg = el.querySelector('.catch-msg');
  const coin = el.querySelector('.coin');
  const name = el.querySelector('.name');
  const title = el.querySelector('.title');
  const desc = el.querySelector('.desc');
  const throwsEl = el.querySelector('.throws');

  let spawn = null, def = null, rng = Math.random, left = 0;
  let state = 'done'; // idle | drag | flying | seq | done
  let drag = null;

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
  }
  function resetCoin() { coin.className = 'coin'; setCoin(0, 0); }
  function spriteAnim(cls) { sprite.classList.remove('hop', 'suck', 'pop', 'flee'); if (cls) sprite.classList.add(cls); }
  function say(text) {
    clearTimeout(msgTimer); timers.delete(msgTimer);
    msg.textContent = text; msg.classList.add('show');
    msgTimer = after(1200, () => msg.classList.remove('show'));
  }
  function renderThrows() { throwsEl.textContent = `Ausbrüche übrig: ${left}`; }
  const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  function place(cls, text, p) { // Client-Punkt → Element in .catch-fx
    const s = stage.getBoundingClientRect();
    const node = document.createElement('div');
    node.className = cls; node.textContent = text;
    node.style.left = `${p.x - s.left}px`; node.style.top = `${p.y - s.top}px`;
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
      coin.classList.add('return'); setCoin(0, 0);
      after(300, () => coin.classList.remove('return'));
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
  function fly(rest, start, land) {
    setState('flying');
    msg.textContent = '';
    coin.classList.add('fly');
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / FLY_MS);
      const px = start.x + (land.x - start.x) * t;
      const py = start.y + (land.y - start.y) * t - ARC * Math.sin(Math.PI * t);
      setCoin(px - rest.x, py - rest.y, 720 * t, 1 - 0.5 * t);
      if (t < 1) { raf = requestAnimationFrame(step); return; }
      coin.classList.remove('fly');
      setCoin(land.x - rest.x, land.y - rest.y, 0, 0.5);
      resolve(rest, land);
    };
    raf = requestAnimationFrame(step);
  }

  function resolve(rest, land) {
    if (!isHit(land, sprite.getBoundingClientRect())) { // daneben: fällt aus dem Bild
      coin.classList.add('fall'); say('Daneben!');
      after(500, idle);
      return;
    }
    if (target.classList.contains('angry')) { // abgewehrt: prallt zurück
      coin.classList.add('return'); setCoin(0, 0, -360, 1); say('Abgewehrt!');
      after(400, idle);
      return;
    }
    hitSequence(rest, land);
  }

  // ---- Treffer: einsaugen, wackeln, gefangen oder Ausbruch ----
  async function hitSequence(rest, land) {
    setState('seq');
    const scale = ringScale();
    const { label } = ringBonus(scale);
    const sc = center(sprite.getBoundingClientRect());
    if (label) {
      const r = place('rating', label, { x: sc.x, y: sc.y - 100 });
      after(1000, () => r.remove());
    }
    sprite.style.setProperty('--sx', `${land.x - sc.x}px`);
    sprite.style.setProperty('--sy', `${land.y - sc.y}px`);
    spriteAnim('suck');
    await wait(400);

    setCoin(land.x - rest.x, land.y - rest.y + GROUND, 0, 0.5);
    coin.classList.add('drop');
    await wait(200);
    coin.classList.remove('drop');

    const { caught, wobbles } = rollCatch(catchChance(def.catchChance, scale), rng);
    for (let i = 0; i < wobbles; i++) {
      await wait(250);
      coin.classList.add('wobble');
      await wait(600);
      coin.classList.remove('wobble');
    }

    if (caught) {
      coin.classList.add('glow');
      const c = center(coin.getBoundingClientRect());
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const star = place('star', '★', c);
        star.style.setProperty('--dx', `${Math.cos(a) * 130}px`);
        star.style.setProperty('--dy', `${Math.sin(a) * 130}px`);
      }
      say('Gefangen!');
      await wait(1000);
      finish(true);
      return;
    }

    coin.classList.add('burst');
    spriteAnim('pop');
    say('Rausgehauen!');
    left -= 1; renderThrows();
    await wait(400);
    if (left <= 0) {
      spriteAnim('flee');
      say(`${def.name} ist abgehauen.`);
      await wait(1000);
      finish(false);
      return;
    }
    await wait(600);
    fx.replaceChildren();
    idle();
  }

  el.querySelector('.back').addEventListener('click', () => {
    if (state !== 'idle') return;
    clearAll(); setState('done');
    onCancel();
  });

  return {
    start(s, d, r = Math.random) {
      clearAll();
      spawn = s; def = d; rng = r; left = CONST.BREAKOUTS; drag = null;
      sprite.src = `sprites/${d.id}.png`;
      sprite.style.removeProperty('--sx'); sprite.style.removeProperty('--sy');
      target.classList.remove('angry');
      name.textContent = d.name; title.textContent = d.title; desc.textContent = d.desc;
      renderThrows();
      msg.classList.remove('show');
      fx.replaceChildren();
      idle();
      scheduleHop();
      scheduleAngry();
    },
  };
}
