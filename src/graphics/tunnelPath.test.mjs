import test from 'node:test';
import assert from 'node:assert/strict';
import { createTunnelCurve } from './tunnelPath.mjs';

test('connected tunnel remains straight and centered throughout wall reveal', () => {
  const curve = createTunnelCurve(2, true);
  for (let t = .02; t <= .26; t += .01) {
    const position = curve.getPointAt(t);
    const ahead = curve.getPointAt(t + .02);
    assert.ok(Math.abs(position.x) < 1e-10 && Math.abs(position.y) < 1e-10);
    assert.ok(Math.abs(ahead.x) < 1e-10 && Math.abs(ahead.y) < 1e-10);
    assert.ok(ahead.z < position.z);
  }
  assert.ok(Math.abs(curve.getPointAt(.7).x) > 1, 'retain bends deeper inside');
});
test('new connected tunnel is longer while legacy dimensions remain unchanged', () => {
  assert.ok(createTunnelCurve(2, true).getLength() > createTunnelCurve(1.5).getLength() * 1.3);
  assert.equal(createTunnelCurve().getPoint(0).z, 200);
  assert.equal(createTunnelCurve().getPoint(1).z, -200);
});
