import test from 'node:test';
import assert from 'node:assert/strict';
import { departureAt, blackHoleProgress, blackHoleVisible, connectedArrivalVeil } from './galaxyDeparture.mjs';
import { journeyAt, DESTINATION_Z } from './guidedPath.mjs';

test('departure starts at galaxy arrival and travels through and beyond the galaxy', () => {
  assert.equal(departureAt(0).distance, journeyAt(1).distance);
  assert.ok(departureAt(2).distance > -DESTINATION_Z);
  assert.ok(departureAt(3).distance > -DESTINATION_Z + 42);
  let previous = departureAt(0).distance;
  for (let i = 1; i <= 600; i++) {
    const distance = departureAt(i / 100).distance;
    assert.ok(distance > previous, `camera must keep travelling forward at ${i / 100}`);
    previous = distance;
  }
});
test('departure ramps remain continuous and reverse scroll retraces them', () => {
  for (const seam of [0, 2, 3, 4.4, 6]) {
    const before = departureAt(seam - 1e-6), after = departureAt(seam + 1e-6);
    assert.ok(Math.abs(before.distance - after.distance) < 0.002);
    assert.ok(Math.abs(before.velocity - after.velocity) < 0.001);
  }
  const positions = Array.from({ length: 61 }, (_, i) => departureAt(i / 10).distance);
  for (let i = 60; i >= 0; i--) assert.equal(departureAt(i / 10).distance, positions[i]);
  assert.ok(departureAt(3.7).velocity > departureAt(0).velocity * 50);
  assert.ok(departureAt(6).velocity < departureAt(3.7).velocity / 50);
});
test('black hole starts distant at the new handoff and falls over the next ten viewports', () => {
  assert.equal(blackHoleProgress(37), 0);
  assert.ok(blackHoleProgress(37.001) < 0.001);
  assert.equal(blackHoleProgress(42), 0.5);
  assert.equal(blackHoleProgress(47), 1);
});

test('black hole is visible far ahead throughout galaxy departure, with no flash', () => {
  const blackHoleDistance = departureAt(6).distance + 40;
  assert.equal(blackHoleVisible(30.99), false);
  assert.ok(blackHoleDistance - departureAt(0).distance > 1000);
  for (let units = 31; units <= 47; units += .01) {
    assert.equal(blackHoleVisible(units), true);
    assert.equal(connectedArrivalVeil(units), 0);
  }
  for (const units of [36.35, 36.9, 37, 37.001, 37.65]) {
    assert.equal(connectedArrivalVeil(units), 0);
  }
  assert.equal(connectedArrivalVeil(11.5), 1, 'preserve the tunnel exit handoff');
  assert.equal(connectedArrivalVeil(13), 0);
});
