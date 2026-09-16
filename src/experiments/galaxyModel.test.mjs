import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGalaxy, generateHaze, generateDust, armAngle, GALAXY_RADIUS, STAR_COUNT, HAZE_COUNT, DUST_COUNT } from './galaxyModel.mjs';

test('galaxy stars are deterministic, bounded and split across populations', () => {
  const a = generateGalaxy(), b = generateGalaxy();
  assert.deepEqual(a.positions, b.positions);
  assert.deepEqual(a.colors, b.colors);
  assert.equal(a.positions.length, STAR_COUNT * 3);
  assert.equal(a.colors.length, STAR_COUNT * 3);
  assert.equal(a.sizes.length, STAR_COUNT);
  const { disk, bulge, halo, knot } = a.populations;
  assert.equal(disk + bulge + halo + knot, STAR_COUNT);
  assert.ok(disk / STAR_COUNT > 0.83 && disk / STAR_COUNT < 0.89);
  assert.ok(bulge / STAR_COUNT > 0.05 && bulge / STAR_COUNT < 0.09);
  assert.ok(halo > 500);
  assert.ok(knot > 100);
  let planar = 0;
  for (let i = 0; i < STAR_COUNT; i++) {
    const x = a.positions[i * 3], y = a.positions[i * 3 + 1], z = a.positions[i * 3 + 2];
    if (Math.hypot(x, z) <= GALAXY_RADIUS && Math.abs(y) < 3) planar++;
    assert.ok(a.sizes[i] > 0.5 && a.sizes[i] <= 4);
    assert.ok(a.colors[i * 3] <= 3 && a.colors[i * 3] >= 0);
  }
  // Only the sparse halo sits outside the thin disk volume.
  assert.ok(planar / STAR_COUNT > 0.9);
  assert.notDeepEqual(generateGalaxy(7).positions, a.positions);
});

test('arm angle is a logarithmic spiral that opens with radius', () => {
  const steps = [2, 4, 8, 16, 32].map(r => armAngle(0, r));
  for (let i = 1; i < steps.length; i++) {
    const increment = steps[i] - steps[i - 1];
    assert.ok(increment > 0);
    if (i > 1) assert.ok(Math.abs(increment - (steps[i - 1] - steps[i - 2])) < 1e-9);
  }
  assert.ok(Math.abs(armAngle(1, 10) - armAngle(0, 10) - Math.PI) < 1e-9);
});

test('haze and dust stay within the disk and dust hugs the inner arm edge', () => {
  const haze = generateHaze(), dust = generateDust();
  assert.equal(haze.positions.length, HAZE_COUNT * 3);
  assert.equal(haze.colors.length, HAZE_COUNT * 4);
  assert.equal(dust.positions.length, DUST_COUNT * 3);
  for (let i = 0; i < HAZE_COUNT; i++) {
    assert.ok(Math.hypot(haze.positions[i * 3], haze.positions[i * 3 + 2]) <= GALAXY_RADIUS + 6);
    assert.ok(haze.colors[i * 4 + 3] > 0 && haze.colors[i * 4 + 3] <= 0.06);
    assert.ok(haze.radii[i] >= 1.5 && haze.radii[i] <= 8);
  }
  for (let i = 0; i < DUST_COUNT; i++) {
    const x = dust.positions[i * 3], z = dust.positions[i * 3 + 2];
    const distance = Math.hypot(x, z);
    assert.ok(distance >= 5 && distance <= 35);
    const angle = Math.atan2(z, x);
    // Nearest arm ridge should sit slightly ahead (larger angle) of the dust.
    const lead = [0, 1, 2, 3].map(arm => {
      const delta = (armAngle(arm, distance) - angle) % (Math.PI * 2);
      return (delta + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    }).reduce((best, delta) => Math.abs(delta) < Math.abs(best) ? delta : best, Infinity);
    assert.ok(lead > 0 && lead < 0.6, `dust leads arm by ${lead}`);
    assert.ok(dust.colors[i * 4] < 0.1);
  }
});
