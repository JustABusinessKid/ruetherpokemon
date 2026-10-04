import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringBonus, catchChance, landing, isHit, rollCatch, isFlick, MAX_FLICK } from '../js/catch-logic.js';

test('ringBonus-Stufen', () => {
  assert.deepEqual(ringBonus(0.4), { label: 'Super!', bonus: 0.25 });
  assert.deepEqual(ringBonus(0.6), { label: 'Gut!', bonus: 0.12 });
  assert.deepEqual(ringBonus(0.9), { label: '', bonus: 0 });
});

test('catchChance addiert Bonus und kappt bei 0,95', () => {
  assert.equal(catchChance(0.5, 0.6), 0.62);
  assert.equal(catchChance(0.8, 0.4), 0.95);
});

test('landing: 160 px + 100 px je px/ms in Flick-Richtung, bei MAX_FLICK gedeckelt', () => {
  assert.deepEqual(landing({ x: 100, y: 600 }, 0, -1), { x: 100, y: 340 });
  assert.deepEqual(landing({ x: 100, y: 600 }, 3, -4), { x: 436, y: 152 }); // 5 px/ms → 4 → 560 px, Richtung 3:4
});

test('Flick mit 2 px/ms nach 150 px Drag trifft Sprite-Box', () => {
  const rest = { x: 187, y: 650 }; // catch.js reicht die Ruheposition durch, der Ziehweg (hier 150 px) geht nicht ein
  const sprite = { left: 107, right: 267, top: 210, bottom: 370 }; // 160 px, Mitte 360 px über der Münze
  assert.equal(isHit(landing(rest, 0, -2), sprite), true);
  assert.equal(isHit(landing(rest, 0, -1), sprite), true); // Unterkante des Fensters
  assert.equal(isHit(landing(rest, 0, -3), sprite), true); // Oberkante des Fensters
  assert.equal(isHit(landing(rest, 0, -0.6), sprite), false); // zu schwach: fällt davor runter
  assert.equal(isHit(landing(rest, 0, -MAX_FLICK), sprite), false); // zu stark: schießt drüber
});

test('isHit mit 20 px Rand', () => {
  const rect = { left: 100, top: 100, right: 200, bottom: 200 };
  assert.equal(isHit({ x: 150, y: 150 }, rect), true);
  assert.equal(isHit({ x: 215, y: 150 }, rect), true);
  assert.equal(isHit({ x: 225, y: 150 }, rect), false);
  assert.equal(isHit({ x: 150, y: 75 }, rect), false);
});

test('isFlick: nur schnell genug nach oben', () => {
  assert.equal(isFlick(-0.7), true);
  assert.equal(isFlick(-0.2), false);
  assert.equal(isFlick(1), false);
});

test('rollCatch: gefangen = 3 Wackler, sonst 1–3', () => {
  assert.deepEqual(rollCatch(0.5, () => 0.1), { caught: true, wobbles: 3 });
  const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
  assert.deepEqual(rollCatch(0.5, seq(0.9, 0.0)), { caught: false, wobbles: 1 });
  assert.deepEqual(rollCatch(0.5, seq(0.9, 0.99)), { caught: false, wobbles: 3 });
});
