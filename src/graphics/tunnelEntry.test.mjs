import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tunnelEntryAt, ENTRY_HANDOFF } from './tunnelEntry.mjs';
import { wormholeApproach, TUNNEL_BLEND_START, TUNNEL_BLEND_END } from '../experiments/wormholeApproach.mjs';

test('optical handoff finishes before geometry, motion and bloom appear', () => {
  for (let units = TUNNEL_BLEND_START; units <= TUNNEL_BLEND_END; units += .01) {
    const state = tunnelEntryAt((units - TUNNEL_BLEND_START) / (11.5 - TUNNEL_BLEND_START));
    assert.deepEqual(state, { walls: 0, detail: 0, travel: 0, bloom: 0, exit: 0 });
  }
  assert.deepEqual(tunnelEntryAt(ENTRY_HANDOFF), { walls: 0, detail: 0, travel: 0, bloom: 0, exit: 0 });
  const end = tunnelEntryAt(1);
  assert.equal(end.walls, 1); assert.equal(end.detail, 1); assert.equal(end.bloom, 1);
});

test('entry progression is continuous, monotonic and reversible', () => {
  let previous = tunnelEntryAt(0);
  for (let p = .001; p <= 1; p += .001) {
    const state = tunnelEntryAt(p);
    for (const key of Object.keys(state)) {
      assert.ok(state[key] >= previous[key]);
      assert.ok(state[key] - previous[key] < (key === 'exit' ? .026 : .01));
    }
    previous = state;
  }
  const samples = [0, ENTRY_HANDOFF, .3, .6, 1];
  assert.deepEqual(samples.map(tunnelEntryAt), samples.reverse().map(tunnelEntryAt).reverse());
});

test('sky texture persists through the cave until the final exit handoff', () => {
  for (const p of [0, .25, .5, .75, .9, .94]) assert.equal(tunnelEntryAt(p).exit, 0);
  assert.ok(Math.abs(tunnelEntryAt(.97).exit - .5) < 1e-12);
  assert.equal(tunnelEntryAt(1).exit, 1);
});

test('entrance projection reconstructs the same wormhole rays across aspect ratios and look offsets', () => {
  for (const aspect of [.6, 1, 2.1]) {
    for (const units of [TUNNEL_BLEND_START, 6.7, TUNNEL_BLEND_END]) {
      const pose = wormholeApproach(units, aspect);
      const camera = new THREE.PerspectiveCamera(70, aspect, .1, 2000);
      camera.position.fromArray(pose.position);
      camera.rotation.set(pose.pitch + .08, pose.yaw - .12, 0, 'YXZ');
      camera.updateMatrixWorld();
      for (const [x, y] of [[0, 0], [-.8, .6], [.9, -.7]]) {
        const optical = new THREE.Vector3(x, y, 1).applyMatrix4(camera.projectionMatrixInverse)
          .applyMatrix3(new THREE.Matrix3().setFromMatrix4(camera.matrixWorld)).normalize();
        const world = new THREE.Vector3(x, y, 1).unproject(camera).sub(camera.position).normalize();
        assert.ok(optical.distanceTo(world) < 1e-10);
      }
    }
  }
});
