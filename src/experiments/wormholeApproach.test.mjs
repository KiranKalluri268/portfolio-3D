import test from 'node:test';
import assert from 'node:assert/strict';
import { wormholeApproach, TUNNEL_BLEND_START, TUNNEL_BLEND_END, TUNNEL_VISUAL_HANDOFF, THROAT_FUNNEL_START, caveRadiusAt, CAVE_ENTRY_RADIUS } from './wormholeApproach.mjs';

const distance = position => Math.hypot(position[0] - 8, position[1], position[2] + 40);
test('cave radius contracts continuously to a finite, reversible handoff', () => {
  assert.equal(caveRadiusAt(0), 1);
  assert.equal(caveRadiusAt(THROAT_FUNNEL_START), 1);
  assert.equal(caveRadiusAt(TUNNEL_BLEND_END), CAVE_ENTRY_RADIUS);
  assert.equal(caveRadiusAt(9), CAVE_ENTRY_RADIUS);
  let previous = 1;
  for (let u = THROAT_FUNNEL_START + .001; u < TUNNEL_BLEND_END; u += .001) {
    const radius = caveRadiusAt(u);
    assert.ok(radius < previous && radius > CAVE_ENTRY_RADIUS);
    assert.ok(previous - radius < .001);
    assert.equal(wormholeApproach(u).caveRadius, radius);
    previous = radius;
  }
  assert.ok(caveRadiusAt(TUNNEL_BLEND_END - .001) - CAVE_ENTRY_RADIUS < 1e-8);
  const samples = [4, 5, 6, 6.8, 7.2, 8];
  assert.deepEqual(samples.map(caveRadiusAt), samples.reverse().map(caveRadiusAt).reverse());
});
const speed = units => {
  const a = wormholeApproach(units).position, b = wormholeApproach(units + .001).position;
  return Math.hypot(...b.map((v, i) => v - a[i])) / .001;
};
test('approach curves from a distant view into the throat and brakes near entry', () => {
  assert.ok(distance(wormholeApproach(0).position) > 140);
  assert.ok(distance(wormholeApproach(TUNNEL_BLEND_END).position) < 1);
  assert.ok(wormholeApproach(1).position[0] < wormholeApproach(0).position[0], 'initial sideways arc');
  assert.ok(speed(2) > speed(0), 'accelerates along the approach');
  assert.ok(speed(TUNNEL_BLEND_END - .5) < speed(2) * .1, 'slows substantially in front of the mouth');
  let previous = Infinity;
  for (let u = 0; u <= TUNNEL_BLEND_END; u += .01) {
    const pose = wormholeApproach(u);
    const d = distance(pose.position);
    assert.ok(d <= previous + .00001, 'distance decreases continuously');
    assert.ok(Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch));
    previous = d;
  }
});
test('blend is bounded and reversible, with exact endpoints', () => {
  assert.equal(wormholeApproach(TUNNEL_BLEND_START).tunnelBlend, 0);
  assert.equal(wormholeApproach((TUNNEL_BLEND_START + TUNNEL_VISUAL_HANDOFF) / 2).tunnelBlend, .5);
  assert.equal(wormholeApproach(TUNNEL_VISUAL_HANDOFF).tunnelBlend, 1);
  assert.equal(wormholeApproach(6.7).tunnelBlend, 1, 'no wormhole bleed after the quick handoff');
  assert.equal(wormholeApproach(TUNNEL_BLEND_END).tunnelBlend, 1);
  assert.equal(wormholeApproach(THROAT_FUNNEL_START).throatFunnel, 0);
  assert.ok(wormholeApproach(4.7).throatFunnel > .1, 'cave forms before the previous onset');
  assert.ok(wormholeApproach(5.5).throatFunnel > 0, 'funnel develops before the tunnel blend');
  assert.equal(wormholeApproach(TUNNEL_BLEND_END).throatFunnel, 1);
  assert.deepEqual(wormholeApproach(-2), wormholeApproach(0));
  assert.deepEqual(wormholeApproach(9), wormholeApproach(TUNNEL_BLEND_END));
  const forward = [5.5, 6, 6.5].map(u => wormholeApproach(u));
  assert.deepEqual([6.5, 6, 5.5].map(u => wormholeApproach(u)).reverse(), forward);
});
