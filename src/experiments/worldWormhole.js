import * as THREE from 'three';
import fragmentShader from './worldWormhole.glsl?raw';
import starUrl from '../../assets/star_noise-generated.png';
import nebulaUrl from '../../assets/milkyway-preview.jpg';

export const WORMHOLE_POSITION = [8, 0, -40];
export const THROAT_RADIUS = 2;
// Original sky imagery is confined to the throat and a fading curved-ray halo.
// The rest of the scene remains the resident star world.
export async function createWorldWormhole(scene, renderer, camera, starMaterial) {
  const position = new THREE.Vector3(...WORMHOLE_POSITION);
  const loader = new THREE.TextureLoader();
  const loaded = await Promise.allSettled([loader.loadAsync(starUrl), loader.loadAsync(nebulaUrl)]);
  if (loaded.some(result => result.status === 'rejected')) {
    for (const result of loaded) if (result.status === 'fulfilled') result.value.dispose();
    throw new Error('Could not load the wormhole destination sky.');
  }
  const [stars, nebula] = loaded.map(result => result.value);
  stars.minFilter = stars.magFilter = THREE.LinearFilter;
  nebula.minFilter = nebula.magFilter = THREE.NearestFilter;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: true,
    extensions: { fragDepth: true },
    uniforms: {
      farStars: { value: stars },
      farNebula: { value: nebula },
      exteriorLensing: { value: 1 },
      skyDrift: { value: 0 },
      throatFunnel: { value: 0 },
      localCamera: { value: new THREE.Vector3() },
      localToClip: { value: new THREE.Matrix4() },
    },
    vertexShader: `varying vec3 localSurface;
      void main() {
        localSurface = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader,
  });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(18, 48, 32), material);
  mouth.scale.setScalar(THROAT_RADIUS);
  mouth.frustumCulled = false;
  const inverse = new THREE.Matrix4();
  mouth.onBeforeRender = (_renderer, _scene, eye) => {
    inverse.copy(mouth.matrixWorld).invert();
    material.uniforms.localCamera.value.copy(eye.position).applyMatrix4(inverse);
    material.uniforms.localToClip.value.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse).multiply(mouth.matrixWorld);
  };
  scene.add(mouth);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastSeconds = null;

  return {
    position, horizonRadius: THROAT_RADIUS,
    setVisible(value) { mouth.visible = value; },
    setFunnel(value) { material.uniforms.throatFunnel.value = THREE.MathUtils.clamp(value, 0, 1); },
    update(origin, seconds) {
      mouth.position.copy(position).sub(origin);
      const dt = lastSeconds === null ? 0 : Math.max(0, Math.min(0.05, seconds - lastSeconds));
      lastSeconds = seconds;
      // The original camera idles at 0.05 rad/s. Animate the optical view here
      // to preserve that pace without moving the free-flight camera or stars.
      if (!reducedMotion.matches) material.uniforms.skyDrift.value =
        (material.uniforms.skyDrift.value + dt * 0.05) % (Math.PI * 2);
    },
    render() {
      material.uniforms.exteriorLensing.value = starMaterial.uniforms.lensRadius.value > 0 ? 1 : 0;
      renderer.render(scene, camera);
    },
    inspect(eye) {
      return {
        position: position.toArray(), renderPosition: mouth.position.toArray(),
        projected: mouth.position.clone().project(eye).toArray(),
        inFront: mouth.position.clone().applyMatrix4(eye.matrixWorldInverse).z < 0,
        distance: mouth.position.distanceTo(eye.position), lensing: true,
        renderer: 'local-transmitting-geodesic-volume',
        starLensing: 'finite-distance-point-mass',
        throatSource: 'original-destination-sky',
        exteriorSource: 'localized-original-sky-halo',
        skyDrift: material.uniforms.skyDrift.value,
        throatFunnel: material.uniforms.throatFunnel.value,
      };
    },
    dispose() {
      scene.remove(mouth);
      mouth.geometry.dispose(); material.dispose(); stars.dispose(); nebula.dispose();
    },
  };
}
