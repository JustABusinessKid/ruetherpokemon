// Synthetische Effekte per Web Audio, keine Dateien. Lautstärke 0,25.
// sfx.play(name) · sfx.setEnabled(bool) · sfx.unlock() · haptic(pattern) · setHapticsEnabled(bool)

let ctx = null, enabled = true, hapticsOn = true;
function ac() {
  if (!ctx) { const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone({ f = 440, f2 = null, type = 'square', t = 0.08, g = 0.25, delay = 0 }) {
  const c = ac(); if (!c || !enabled) return;
  const o = c.createOscillator(), v = c.createGain(), t0 = c.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  v.gain.setValueAtTime(g, t0); v.gain.exponentialRampToValueAtTime(0.001, t0 + t);
  o.connect(v).connect(c.destination); o.start(t0); o.stop(t0 + t + 0.02);
}
const seq = (freqs, opts, gap) => freqs.forEach((f, i) => tone({ ...opts, f, delay: i * gap, ...(opts.last && i === freqs.length - 1 ? opts.last : {}) }));

const SFX = {
  tap: () => tone({ f: 900, f2: 500, t: 0.05, g: 0.15 }),
  hit: () => tone({ f: 220, f2: 60, type: 'sawtooth', t: 0.18, g: 0.3 }),
  special: () => seq([523, 659, 784], { t: 0.12 }, 0.08),
  dodge: () => tone({ f: 1800, f2: 150, type: 'sawtooth', t: 0.15, g: 0.12 }),
  warn: () => seq([1200, 1200], { t: 0.06, g: 0.15 }, 0.12),
  win: () => seq([523, 659, 784, 1047], { t: 0.15, last: { t: 0.45 } }, 0.13),
  lose: () => seq([440, 349, 262], { type: 'sawtooth', t: 0.25, g: 0.2 }, 0.22),
  throw: () => tone({ f: 300, f2: 1400, type: 'sine', t: 0.3, g: 0.2 }),
  catch: () => seq([1047, 1319, 1568, 2093], { type: 'sine', t: 0.3, g: 0.2 }, 0.09),
  breakout: () => tone({ f: 160, f2: 60, type: 'sine', t: 0.2, g: 0.35 }),
  levelup: () => seq([523, 659, 784, 1047, 1319], { t: 0.1, g: 0.2, last: { t: 0.5 } }, 0.09),
  quest: () => seq([880, 659], { type: 'sine', t: 0.35 }, 0.25),
  spin: () => seq(Array(8).fill(1500), { f2: 900, t: 0.03, g: 0.12 }, 0.25),
  click: () => tone({ f: 1500, t: 0.02, g: 0.1 }),
  rage: () => tone({ f: 70, f2: 50, type: 'sawtooth', t: 0.8, g: 0.3 }),
  coin: () => tone({ f: 1760, f2: 2200, t: 0.1, g: 0.15 }),
  ufo: theremin,
};

// Haunebu: Theremin-Sweep, Sinus rauf und runter, Vibrato wird immer wabbeliger (~2,6 s)
function theremin() {
  const c = ac(); if (!c || !enabled) return;
  const o = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), v = c.createGain(), t0 = c.currentTime;
  o.type = 'sine';
  o.frequency.setValueAtTime(320, t0);
  o.frequency.exponentialRampToValueAtTime(940, t0 + 1.1);
  o.frequency.exponentialRampToValueAtTime(410, t0 + 2.5);
  lfo.frequency.setValueAtTime(5, t0); lfo.frequency.linearRampToValueAtTime(8, t0 + 2.5);
  depth.gain.setValueAtTime(8, t0); depth.gain.linearRampToValueAtTime(45, t0 + 2.5);
  v.gain.setValueAtTime(0.001, t0); v.gain.exponentialRampToValueAtTime(0.2, t0 + 0.25);
  v.gain.setValueAtTime(0.2, t0 + 2.1); v.gain.exponentialRampToValueAtTime(0.001, t0 + 2.6);
  lfo.connect(depth).connect(o.frequency);
  o.connect(v).connect(c.destination);
  o.start(t0); lfo.start(t0); o.stop(t0 + 2.65); lfo.stop(t0 + 2.65);
}

export const sfx = {
  play(name) { if (enabled) try { SFX[name]?.(); } catch { /* kein Audio */ } },
  setEnabled(b) { enabled = !!b; },
  unlock() { try { ac(); } catch { /* kein Audio */ } },
};
export function haptic(pattern) { if (hapticsOn) try { globalThis.navigator?.vibrate?.(pattern); } catch { /* egal */ } }
export function setHapticsEnabled(b) { hapticsOn = !!b; }

// Erste Geste schaltet den AudioContext frei (Autoplay-Regeln)
globalThis.addEventListener?.('pointerdown', sfx.unlock, { once: true });
globalThis.addEventListener?.('keydown', sfx.unlock, { once: true });
