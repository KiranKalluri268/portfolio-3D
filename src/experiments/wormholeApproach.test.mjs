import test from 'node:test';
import assert from 'node:assert/strict';
import { wormholeApproach } from './wormholeApproach.mjs';

const distance = position => Math.hypot(position[0] - 8, position[1], position[2] + 40);
const speed = units => {
  const a = wormholeApproach(units).position, b = wormholeApproach(units + .001).position;
  return Math.hypot(...b.map((v, i) => v - a[i])) / .001;
};
test('approach curves from a distant view into the throat and brakes near entry', () => {
  assert.ok(distance(wormholeApproach(0).position) > 140);
  assert.ok(distance(wormholeApproach(6.5).position) < 1);
  assert.ok(wormholeApproach(1).position[0] < wormholeApproach(0).position[0], 'initial sideways arc');
  assert.ok(speed(2) > speed(0), 'accelerates along the approach');
  assert.ok(speed(6) < speed(2) * .1, 'slows substantially in front of the mouth');
  let previous = Infinity;
  for (let u = 0; u <= 6.5; u += .01) {
    const pose = wormholeApproach(u);
    const d = distance(pose.position);
    assert.ok(d <= previous + .00001, 'distance decreases continuously');
    assert.ok(Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch));
    previous = d;
  }
});
test('blend is bounded and reversible, with exact endpoints', () => {
  assert.equal(wormholeApproach(5.5).tunnelBlend, 0);
  assert.equal(wormholeApproach(6).tunnelBlend, .5);
  assert.equal(wormholeApproach(6.5).tunnelBlend, 1);
  assert.deepEqual(wormholeApproach(-2), wormholeApproach(0));
  assert.deepEqual(wormholeApproach(9), wormholeApproach(6.5));
  const forward = [5.5, 6, 6.5].map(u => wormholeApproach(u));
  assert.deepEqual([6.5, 6, 5.5].map(u => wormholeApproach(u)).reverse(), forward);
});
