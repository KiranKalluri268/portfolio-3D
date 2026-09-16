import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyAt, DESTINATION_Z } from './guidedPath.mjs';
test('guided path stays continuous, forward and reversible at every seam', () => {
  for (const boundary of [0.36, 0.54, 0.80, 1.06].map(value => value / 1.3)) {
    const a = journeyAt(boundary - 1e-7), b = journeyAt(boundary + 1e-7);
    assert.ok(Math.abs(a.distance - b.distance) < 0.003);
    assert.ok(Math.abs(a.velocity - b.velocity) < 0.002);
  }
  const samples = Array.from({ length: 1001 }, (_, i) => journeyAt(i / 1000));
  samples.forEach((s, i) => { if (i) assert.ok(s.distance > samples[i - 1].distance); });
  for (let i = 1000; i >= 0; i--) assert.deepEqual(journeyAt(i / 1000), samples[i]);
  assert.equal(journeyAt(0).distance, 0);
  assert.equal(-DESTINATION_Z - journeyAt(1).distance, 90);
  assert.equal(journeyAt(0.5).velocity, 8000);
  assert.equal(journeyAt(1).velocity, 100);
  assert.equal(journeyAt(0.36 / 1.3).distance, 36);
  assert.ok(Math.abs(journeyAt(1).distance - journeyAt(1.06 / 1.3).distance - 24) < 1e-6);
});
