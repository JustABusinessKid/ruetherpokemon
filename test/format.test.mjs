import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashrateText, reachText, isNarration } from '../js/format.js';
import { LINES, RUETHER_BY_ID } from '../js/data.js';

test('hashrateText: Power als TH/s mit Komma', () => {
  assert.equal(hashrateText(1.04), '1,04 TH/s');
  assert.equal(hashrateText(2.816), '2,82 TH/s');
});

test('isNarration: flee-Sprüche in der dritten Person sind Erzähltext', () => {
  const narr = id => LINES[id].flee.map(l => isNarration(l, RUETHER_BY_ID[id].name));
  assert.deepEqual(narr('christian'), [false, true]);
  assert.deepEqual(narr('hildegard'), [true, false]);
  assert.deepEqual(narr('micha'), [true, true]);
  assert.deepEqual(narr('viktor'), [true, true]);
  assert.deepEqual(narr('ramona'), [true, true]);
  assert.equal(isNarration('Ungeschlagene Argumentationslogik: Du hast gewonnen.', 'Viktor'), false);
});

test('reachText: aufgerundet, mindestens 1 m', () => {
  assert.equal(reachText(154, 120), 'Noch 34 m näher ran');
  assert.equal(reachText(120.2, 120), 'Noch 1 m näher ran');
  assert.equal(reachText(120, 120), 'Noch 1 m näher ran');
});
