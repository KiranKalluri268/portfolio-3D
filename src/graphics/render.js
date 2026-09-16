import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { CameraDragControls } from "../camera/CameraDragControls";
import { Observer } from "../camera/Observer";
import { Vector2 } from 'three/src/math/Vector2';
import { applyComposeShiftProjection } from './composeShift';
import { CELL_SIZE, nearbyCells, generateCell } from '../experiments/worldModel.mjs';
import fragmentShader from './fragmentShader.glsl?raw';
import starUrl from '../../assets/star_noise-generated.png';
import milkywayUrl from '../../assets/milkyway-preview.jpg';
import diskUrl from '../../assets/accretion_disk.png';

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer()
  renderer.setClearColor(0x000000, 1.0)
  renderer.setSize(window.innerWidth, window.innerHeight) // res
  renderer.autoClear = false
  return renderer;
}

export function createScene(renderer) {
  // scene and camera
  const scene = new THREE.Scene()
  // this camera is THREE.js camera fixated at position z=1
  // since drawing happens only with shader on a 2D plane, actual camera control is done by Observer
  const camera = new THREE.Camera()
  camera.position.z = 1

  // render pass composing
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera)
  // strength, kernelSize, sigma, res
  // resolution, strength, radius, threshold
  const bloomPass = new UnrealBloomPass(new Vector2(128, 128), 0.8, 2.0, 0.0)
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  function dispose() {
    renderPass.dispose?.();
    bloomPass.dispose?.();
    composer.renderTarget1?.dispose();
    composer.renderTarget2?.dispose();
  }

  return {
    scene, camera, composer, bloomPass, renderPass, disposeScene: dispose
  }
}

export function createCamera(renderer) {
  const observer = new Observer(60.0, window.innerWidth / window.innerHeight, 1, 80000)
  const cameraControl = new CameraDragControls(observer, renderer.domElement) // take care of camera view
  return {
    observer, cameraControl
  }
}

export function loadTextures(onProgress = () => {}, { sky = true } = {}) {
  const textures = new Map();
  const textureLoader = new THREE.TextureLoader()
  const pending = [];
  let loadedCount = 0;
  const totalCount = sky ? 3 : 1;

  if (sky) {
    loadTexture('bg1', milkywayUrl, THREE.NearestFilter)
    loadTexture('star', starUrl, THREE.LinearFilter)
  }
  loadTexture('disk', diskUrl, THREE.LinearFilter)

  function dispose() {
    for (const texture of textures.values()) {
      if (texture) texture.dispose();
    }
  }

  // resolves when all textures have loaded
  const ready = Promise.all(pending);

  return { textures, ready, disposeTextures: dispose };

  function loadTexture(name, image, interpolation, wrap = THREE.ClampToEdgeWrapping) {
    textures.set(name, null);
    const p = new Promise((resolve, reject) => {
      textureLoader.load(image, (texture) => {
        texture.magFilter = interpolation
        texture.minFilter = interpolation
        texture.wrapT = wrap
        texture.wrapS = wrap
        textures.set(name, texture);
        loadedCount++;
        onProgress({ name, loaded: loadedCount, total: totalCount });
        resolve();
      }, undefined, (error) => {
        console.error(`Failed to load texture "${name}"`, error);
        loadedCount++;
        onProgress({ name, loaded: loadedCount, total: totalCount, failed: true });
        reject(error);
      });
    });
    pending.push(p);
  }
}

// Equirectangular view of the same seeded cells used by the 3D particle field.
// The tunnel uses this as a world-facing wall/exit sample; it is regenerated
// from worldModel rather than being an authored sky asset.
export function createWorldSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#010207';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [cellX, cellY, cellZ] of nearbyCells([0, 0, 0])) {
    const data = generateCell(cellX, cellY, cellZ);
    for (let i = 0; i < 288; i++) {
      const p = i * 3;
      const x = cellX * CELL_SIZE + data.positions[p];
      const y = cellY * CELL_SIZE + data.positions[p + 1];
      const z = cellZ * CELL_SIZE + data.positions[p + 2];
      const radius = Math.max(0.001, Math.hypot(x, y, z));
      const u = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * canvas.width;
      const v = (0.5 - Math.asin(Math.max(-1, Math.min(1, y / radius))) / Math.PI) * canvas.height;
      const size = data.sizes[i] * (data.sizes[i] > 1.5 ? 1.3 : 0.75);
      context.fillStyle = `rgba(${Math.round(data.colors[p] * 255)},${Math.round(data.colors[p + 1] * 255)},${Math.round(data.colors[p + 2] * 255)},${Math.min(1, 0.45 + size * 0.2)})`;
      context.fillRect(u, v, size, size);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}


export async function createShaderProjectionPlane(uniforms, { openSpace = false } = {}) {

  const vertexShader = document.getElementById('vertexShader')?.textContent
  if (!vertexShader) {
    throw new Error('Error reading vertex shader!');
  }

  const defines = getShaderDefineConstant('high');
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader,
    fragmentShader: defines + fragmentShader,
  })
  material.needsUpdate = true;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)

  function dispose() {
    mesh.geometry.dispose();
    material.dispose();
  }


  async function changePerformanceQuality(quality) {
    const defines = getShaderDefineConstant(quality);
    material.fragmentShader = defines + fragmentShader;
    material.needsUpdate = true;
  }


  function getShaderDefineConstant(quality) {
    let STEP, NSTEPS;
    switch (quality) {
      case 'low':
        STEP = 0.16;
        NSTEPS = 280;
        break;
      case 'medium':
        STEP = 0.09;
        NSTEPS = 500;
        break;
      case 'high':
        STEP = 0.055;
        NSTEPS = 850;
        break;
      default:
        STEP = 0.09;
        NSTEPS = 500;
    }
    return `
  ${openSpace ? '#define OPEN_SPACE_EXPERIMENT' : ''}
  #define STEP ${STEP} 
  #define NSTEPS ${NSTEPS} 
`
  }

  return {
    mesh,
    changePerformanceQuality,
    disposeShaderPlane: dispose
  };
}

/**
 * @param {Readonly<{ dust: boolean }>} [skyLayers] - `?sky=nodust` empties the
 *   shell without removing the plumbing, so the field can be ruled in or out by
 *   eye. Defaults to on, so a caller that does not care keeps the old behaviour.
 */
export function createParticleSystem(skyLayers = { dust: true }) {
  const targetLensed = new THREE.WebGLRenderTarget(
    window.innerWidth, window.innerHeight,
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
  );
  const targetUnlensed = new THREE.WebGLRenderTarget(
    window.innerWidth, window.innerHeight,
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
  );

  // The same off-centre frustum the raymarcher uses. Centred, this camera drew
  // the sprites into a rectangle of sky that the shifted screen only partly
  // overlaps, so the leftmost third of the frame sampled outside the target and
  // got nothing — the one part of the scene with no parallax in it, in the part
  // of the scene that most needed some.
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100000);
  applyComposeShiftProjection(camera, camera.fov, camera.aspect);

  const sceneLensed = new THREE.Scene();
  const sceneUnlensed = new THREE.Scene();
  let targetWidth = window.innerWidth;
  let targetHeight = window.innerHeight;

  // The raymarcher samples these render targets along its bent rays. Keep the
  // source identical to LAB 03: signed seeded cells, not a radial shell.
  // ── Shared circular sprite — tight core, fast falloff (no large shadow halo)
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0,    'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.30, 'rgba(255,255,255,0.4)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const pointTex = new THREE.CanvasTexture(canvas);

  const matBase = {
    map: pointTex,
    color: 0xffffff,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.005,
  };

  const worldCells = nearbyCells([0, 0, 0]);
  const worldCount = skyLayers.dust ? worldCells.length * 288 : 0;
  const posS = new Float32Array(worldCount * 3);
  const colorS = new Float32Array(worldCount * 3);
  let worldIndex = 0;
  for (const [cellX, cellY, cellZ] of worldCells) {
    const data = generateCell(cellX, cellY, cellZ);
    for (let i = 0; i < 288 && worldIndex < worldCount; i++, worldIndex++) {
      const source = i * 3;
      const target = worldIndex * 3;
      posS[target] = cellX * CELL_SIZE + data.positions[source];
      posS[target + 1] = cellY * CELL_SIZE + data.positions[source + 1];
      posS[target + 2] = cellZ * CELL_SIZE + data.positions[source + 2];
      colorS[target] = data.colors[source];
      colorS[target + 1] = data.colors[source + 1];
      colorS[target + 2] = data.colors[source + 2];
    }
  }
  const geoS = new THREE.BufferGeometry();
  geoS.setAttribute('position', new THREE.BufferAttribute(posS, 3));
  geoS.setAttribute('color', new THREE.BufferAttribute(colorS, 3));
  const materialS = new THREE.PointsMaterial({ ...matBase, size: 0.09, vertexColors: true });
  sceneLensed.add(new THREE.Points(geoS, materialS));

  // A second pass adds a little emphasis to the same positions. It is not a
  // second world: it reuses the seeded data and only changes point size.
  const posB = new Float32Array(worldCount * 3);
  const colorB = new Float32Array(worldCount * 3);
  posB.set(posS); colorB.set(colorS);
  const geoB = new THREE.BufferGeometry();
  geoB.setAttribute('position', new THREE.BufferAttribute(posB, 3));
  geoB.setAttribute('color', new THREE.BufferAttribute(colorB, 3));
  const materialB = new THREE.PointsMaterial({ ...matBase, size: 0.13, vertexColors: true, opacity: 0.15 });
  sceneUnlensed.add(new THREE.Points(geoB, materialB));

  function resize(width, height) {
    if (width === targetWidth && height === targetHeight) return;

    targetWidth = width;
    targetHeight = height;
    targetLensed.setSize(width, height);
    targetUnlensed.setSize(width, height);
    camera.aspect = width / height;
    applyComposeShiftProjection(camera, camera.fov, camera.aspect);
  }

  function dispose() {
    geoS.dispose();
    geoB.dispose();
    materialS.dispose();
    materialB.dispose();
    pointTex.dispose();
    targetLensed.dispose();
    targetUnlensed.dispose();
  }

  return { 
    particleSceneLensed: sceneLensed, 
    particleTargetLensed: targetLensed,
    particleSceneUnlensed: sceneUnlensed, 
    particleTargetUnlensed: targetUnlensed,
    particleCamera: camera,
    resizeParticleTargets: resize,
    disposeParticleSystem: dispose
  };
}
