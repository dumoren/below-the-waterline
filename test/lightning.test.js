import test from 'node:test';
import assert from 'node:assert/strict';
import { strikeChannels } from '../src/world/lightning.js';

test('lightning has a continuous descending trunk and connected tapered branches', () => {
  for (let seed = 0; seed < 50; seed++) {
    const channels = strikeChannels(seed);
    const trunk = channels[0].points;
    assert.ok(trunk[0][1] > 40);
    assert.equal(trunk.at(-1)[1], 0.3);
    channels.forEach(({ points, width, energy }, i) => {
      assert.ok(points.flat().every(Number.isFinite));
      assert.ok(width > 0 && energy > 0);
      for (let j = 1; j < points.length; j++) assert.ok(points[j][1] < points[j - 1][1]);
      if (i > 0) assert.ok(channels.slice(0, i).some((c) => c.points.includes(points[0])));
    });
  }
  assert.deepEqual(strikeChannels(8), strikeChannels(8));
  assert.notDeepEqual(strikeChannels(8), strikeChannels(9));
});
