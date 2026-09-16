import test from 'node:test';
import assert from 'node:assert/strict';
import { galaxyJourneyState, GALAXY_TIMELINE } from './galaxyTimeline.mjs';

test('the wormhole uses its existing tunnel, then open space, hyperspace and galaxy', () => {
  for (const [units, active, phase] of [
    [0, 'wormhole', 'wormhole'], [5.8, 'wormhole', 'wormhole'],
    [6.5, 'wormhole', 'wormhole'], [6.51, 'tunnel', 'tunnel'], [11.5, 'tunnel', 'tunnel'],
    [11.51, 'space', 'arrival'], [13.5, 'space', 'coast'], [16, 'space', 'accelerate'],
    [17, 'hyperspace', 'hyperspace'], [19.99, 'hyperspace', 'hyperspace'],
    [20, 'galaxy', 'decelerate'], [22, 'galaxy', 'galaxy'], [27, 'galaxy', 'galaxy'],
  ]) {
    const state = galaxyJourneyState(units);
    assert.equal(state.active, active, `wrong renderer at ${units}`);
    assert.equal(state.phase, phase);
  }
});

test('hyperspace handovers happen under an opaque plateau on both sides', () => {
  for (const seam of [GALAXY_TIMELINE.warpStart, GALAXY_TIMELINE.warpEnd]) {
    for (const delta of [-0.09, -0.001, 0, 0.001, 0.09]) {
      assert.ok(galaxyJourneyState(seam + delta).veil > 0.9999);
    }
    assert.equal(galaxyJourneyState(seam - 0.31).veil, 0);
    assert.equal(galaxyJourneyState(seam + 0.31).veil, 0);
  }
  assert.equal(galaxyJourneyState(11.5001).veil, 1);
  assert.equal(galaxyJourneyState(13).veil, 0);
});

test('coasting is calm; acceleration and arrival join the warp without a streak jump', () => {
  assert.equal(galaxyJourneyState(14).streak, 0);
  assert.equal(galaxyJourneyState(27).streak, 0);
  for (const seam of [15, 17, 20, 22]) {
    assert.ok(Math.abs(galaxyJourneyState(seam - 0.0001).streak -
      galaxyJourneyState(seam + 0.0001).streak) < 0.00001);
  }
});

test('reverse scrolling retraces phase, pose progress and handover opacity', () => {
  const forward = Array.from({ length: 2701 }, (_, i) => galaxyJourneyState(i / 100));
  for (let i = 2700; i >= 0; i--) {
    assert.deepEqual(galaxyJourneyState(i / 100), forward[i]);
    assert.ok(['wormhole', 'tunnel', 'space', 'hyperspace', 'galaxy'].includes(forward[i].active));
    for (const key of ['coast', 'acceleration', 'warp', 'galaxy', 'streak', 'veil']) {
      assert.ok(forward[i][key] >= 0 && forward[i][key] <= 1);
    }
  }
});
