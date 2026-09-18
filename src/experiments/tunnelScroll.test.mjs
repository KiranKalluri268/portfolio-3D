import test from 'node:test';
import assert from 'node:assert/strict';
import { tunnelScrollSpeed, tunnelScrollDelta } from './tunnelScroll.mjs';

test('speed eases from normal to double and back within the tunnel', () => {
  for (const u of [0, 4, 6.2, 11.5, 20, 40]) assert.equal(tunnelScrollSpeed(u), 1);
  for (const u of [7.2, 8, 9, 10.3]) assert.equal(tunnelScrollSpeed(u), 2);
  assert.ok(Math.abs(tunnelScrollSpeed(6.7) - 1.5) < 1e-12);
  assert.ok(Math.abs(tunnelScrollSpeed(10.9) - 1.5) < 1e-12);
  for (const u of [6.2, 7.2, 10.3, 11.5]) {
    assert.ok(Math.abs(tunnelScrollSpeed(u + .0001) - tunnelScrollSpeed(u)) < 1e-7);
    assert.ok(Math.abs(tunnelScrollSpeed(u - .0001) - tunnelScrollSpeed(u)) < 1e-7);
  }
});

test('same input moves twice as far in the tunnel, not outside it', () => {
  assert.ok(Math.abs(tunnelScrollDelta(8, .25) - .5) < 1e-12);
  assert.ok(Math.abs(tunnelScrollDelta(8, -.25) + .5) < 1e-12);
  assert.ok(Math.abs(tunnelScrollDelta(12, .25) - .25) < 1e-12);
});

test('large inputs cross ramps smoothly and reverse along the same route', () => {
  for (const [start, input] of [[6, 1.2], [10, 2], [5, 7], [12, -4]]) {
    const end = start + tunnelScrollDelta(start, input);
    const restored = end + tunnelScrollDelta(end, -input);
    assert.ok(Math.abs(restored - start) < 1e-6);
    let split = start;
    for (let i = 0; i < 20; i++) split += tunnelScrollDelta(split, input / 20);
    assert.ok(Math.abs(end - split) < 1e-6);
  }
});
