import test from 'node:test';
import assert from 'node:assert/strict';
import { canFreeFly } from './journeyFlightMode.mjs';

test('free flight is available around the wormhole, galaxy and black hole', () => {
  for (const units of [0, 4, 6.19, 11.51, 21, 31, 37, 40, 47]) assert.equal(canFreeFly(units), true);
});
test('free flight is unavailable during optical handoff and the separate tunnel', () => {
  for (const units of [6.2, 6.5, 7.2, 9, 11.5, NaN, Infinity]) assert.equal(canFreeFly(units), false);
});
