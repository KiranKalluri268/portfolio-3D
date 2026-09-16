import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { flightPose } from './flightPath.mjs';

test('looking around rotates the view without orbiting or moving the camera', () => {
  for (let step = 0; step <= 100; step++) {
    const forward = flightPose(step / 100);
    const sideways = flightPose(step / 100, 'free', 90);
    assert.deepEqual(sideways.position.toArray(), forward.position.toArray());
    assert.ok(Math.abs(sideways.direction.dot(forward.direction)) < 1e-12);
    assert.ok(Math.abs(forward.direction.length() - 1) < 1e-12);
  }
});

test('reverse scrubbing returns the same world pose and both modes share distance and lens', () => {
  const positions = Array.from({ length: 101 }, (_, i) => flightPose(i / 100));
  for (let i = 100; i >= 0; i--) {
    const free = flightPose(i / 100);
    const orbit = flightPose(i / 100, 'orbit');
    assert.deepEqual(free.position.toArray(), positions[i].position.toArray());
    assert.deepEqual(free.direction.toArray(), positions[i].direction.toArray());
    assert.ok(Math.abs(free.position.length() - orbit.position.length()) < 1e-12);
    assert.equal(free.fov, orbit.fov);
    assert.ok(orbit.direction.dot(orbit.position.clone().normalize()) < -0.999999);
    // Free flight deliberately does not automatically aim at the origin.
    assert.ok(free.direction.dot(free.position.clone().negate().normalize()) < 0.995);
  }
});

test('the flight stays clear of the disk, landmarks and raymarch distance limit', () => {
  const landmarks = [
    [-12.4, 3, 23, .85], [-3.8, 0, 17, 1.15],
    [4.5, 4.6, 10, 1.55], [-15, -6, 5, 1.8],
  ];
  for (const mode of ['free', 'orbit']) {
    for (let step = 0; step <= 1000; step++) {
      const { position } = flightPose(step / 1000, mode);
      assert.ok(position.length() > 6 && position.length() < 40);
      for (const [x, y, z, radius] of landmarks) {
        assert.ok(position.distanceTo(new THREE.Vector3(x, y, z)) > radius + 0.5,
          `${mode} collides with landmark at ${step / 1000}`);
      }
    }
  }
});
