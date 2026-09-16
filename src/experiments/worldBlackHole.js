import * as THREE from 'three';
import diskUrl from '../../assets/accretion_disk.png';
import fragmentShader from './worldBlackHole.glsl?raw';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const BLACK_HOLE_POSITION = [8, 0, -40];
export const HORIZON_RADIUS = 2;

// Bounded live-world raymarch volume: no sky sampler or separate star scene.
export async function createWorldBlackHole(scene, renderer, camera) {
  const texture = await new THREE.TextureLoader().loadAsync(diskUrl);
  const position = new THREE.Vector3(...BLACK_HOLE_POSITION);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: true,
    extensions: { fragDepth: true },
    uniforms: { diskTexture: { value: texture }, time: { value: 0 },
      localCamera: { value: new THREE.Vector3() },
      localToClip: { value: new THREE.Matrix4() } },
    vertexShader: `varying vec3 localSurface;
      void main() {
        localSurface = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader,
  });
  const group = new THREE.Mesh(new THREE.SphereGeometry(18, 48, 32), material);
  group.rotation.set(0.18, 0, -0.16);
  group.scale.setScalar(HORIZON_RADIUS);
  group.frustumCulled = false;
  const inverse = new THREE.Matrix4();
  group.onBeforeRender = (_renderer, _scene, camera) => {
    inverse.copy(group.matrixWorld).invert();
    material.uniforms.localCamera.value.copy(camera.position).applyMatrix4(inverse);
    material.uniforms.localToClip.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld);
  };
  scene.add(group);
  // HDR threshold keeps ordinary stars out of bloom; only the hot disk and
  // genuinely overbright signal glow. Star size/trail controls stay untouched.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.65, 1.0);
  composer.addPass(renderPass); composer.addPass(bloom);
  const size = new THREE.Vector2();
  let width = 0, height = 0;
  return {
    position, horizonRadius: HORIZON_RADIUS,
    setVisible(value) { group.visible = value; },
    update(origin, seconds) {
      group.position.copy(position).sub(origin);
      material.uniforms.time.value = seconds * 0.12;
    },
    render() {
      renderer.getDrawingBufferSize(size);
      if (width !== size.x || height !== size.y) {
        width = size.x; height = size.y; composer.setSize(width, height);
      }
      composer.render();
    },
    inspect(camera) {
      const projected = group.position.clone().project(camera);
      const relative = group.position.clone().applyMatrix4(camera.matrixWorldInverse);
      return { position: position.toArray(), renderPosition: group.position.toArray(),
        projected: projected.toArray(), inFront: relative.z < 0,
        distance: group.position.distanceTo(camera.position), lensing: true,
        renderer: 'local-geodesic-volume', starLensing: 'finite-distance-point-mass' };
    },
    dispose() {
      scene.remove(group); group.geometry.dispose(); material.dispose(); texture.dispose();
      renderPass.dispose(); bloom.dispose(); composer.dispose();
    },
  };
}
