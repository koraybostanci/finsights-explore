import { test } from 'node:test';
import assert from 'node:assert/strict';

import { smaSeries, lastSma, distancePct, lastCross, trend } from '../src/sma.ts';

test('smaSeries ve lastSma', () => {
  const c = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(smaSeries(c, 3), [null, null, 2, 3, 4, 5]);
  assert.equal(lastSma(c, 3), 5);
  assert.equal(lastSma(c, 10), null);
  assert.equal(distancePct(110, 100), 10.000000000000009);
  assert.equal(distancePct(null, 100), null);
});

test('lastCross altın ve ölüm kesişimini bulur', () => {
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  const up = Array.from({ length: 30 }, (_, i) => 71 + i * 3);
  assert.equal(lastCross([...down, ...up], 5, 20, 40)?.kind, 'golden');
  assert.equal(lastCross([...up, ...down.map((v) => v + 60)], 5, 20, 40)?.kind, 'death');
  assert.equal(lastCross(down, 5, 20, 40), null);
});

test('trend', () => {
  assert.equal(trend(120, 110, 100), 'up');
  assert.equal(trend(90, 100, 110), 'down');
  assert.equal(trend(105, 110, 100), 'mixed');
  assert.equal(trend(null, 110, 100), null);
});
