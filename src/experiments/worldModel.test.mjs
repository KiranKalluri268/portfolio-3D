import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_SIZE, STARS_PER_CELL, cellAt, generateCell, nearbyCells, advance, heading } from './worldModel.mjs';

test('cells regenerate identically after eviction, including negative coordinates', () => {
  for (const coord of [[0, 0, 0], [-1, 2, -30], [10000, -20000, 30000]]) {
    const first = generateCell(...coord);
    generateCell(9, 8, 7);
    assert.deepEqual(generateCell(...coord), first);
    assert.equal(first.positions.length, STARS_PER_CELL * 3);
    assert.ok(first.positions.every((value) => value >= 0 && value < CELL_SIZE));
  }
  assert.notDeepEqual(generateCell(1, 0, 0), generateCell(-1, 0, 0));
  assert.deepEqual(cellAt([-0.1, -48, -48.1]), [-1, -1, -2]);
});

test('loaded world stays bounded during unlimited forward and sideways travel', () => {
  for (const position of [[0, 0, 0], [49, 1, -98], [1e7, -1e7, 1e7]]) {
    const cells = nearbyCells(position);
    assert.equal(cells.length, 125);
    assert.equal(new Set(cells.map(String)).size, 125);
  }
});

test('travel follows yaw and pitch; reversing retraces and 10x changes distance only', () => {
  const start = [15, -7, 10];
  for (const [yaw, pitch] of [[0, 0], [Math.PI / 2, 0], [-2, 1.2]]) {
    const direction = heading(yaw, pitch);
    assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-12);
    const next = advance(start, yaw, pitch, 10);
    const returned = advance(next, yaw, pitch, -10);
    assert.ok(returned.every((value, i) => Math.abs(value - start[i]) < 1e-12));
    const fast = advance(start, yaw, pitch, 100);
    assert.ok(fast.every((value, i) => Math.abs(value - start[i] - 10 * (next[i] - start[i])) < 1e-10));
  }
  assert.deepEqual(advance([0, 0, 0], 0, 0, 10), [0, 0, -10]);
});
