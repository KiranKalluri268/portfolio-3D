import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { CameraDragControls } from "../camera/CameraDragControls";
import { Observer } from "../camera/Observer";
import { Vector2 } from 'three/src/math/Vector2';
import fragmentShader from './fragmentShader.glsl?raw';
import starUrl from '../../assets/star_noise.png';
import milkywayUrl from '../../assets/milkyway.jpg';
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

  return {
    scene, composer, bloomPass
  }
}

export function createCamera(renderer) {
  const observer = new Observer(60.0, window.innerWidth / window.innerHeight, 1, 80000)
  const cameraControl = new CameraDragControls(observer, renderer.domElement) // take care of camera view
  return {
    observer, cameraControl
  }
}

export function loadTextures() {
  const textures = new Map();
  const textureLoader = new THREE.TextureLoader()
  const pending = [];

  loadTexture('bg1', milkywayUrl, THREE.NearestFilter)
  loadTexture('star', starUrl, THREE.LinearFilter)
  loadTexture('disk', diskUrl, THREE.LinearFilter)

  window.onbeforeunload = () => {
    for (const texture of textures.values()) {
      if (texture) texture.dispose();
    }
  }

  // resolves when all textures have loaded
  const ready = Promise.all(pending);

  return { textures, ready };

  function loadTexture(name, image, interpolation, wrap = THREE.ClampToEdgeWrapping) {
    textures.set(name, null);
    const p = new Promise((resolve, reject) => {
      textureLoader.load(image, (texture) => {
        texture.magFilter = interpolation
        texture.minFilter = interpolation
        texture.wrapT = wrap
        texture.wrapS = wrap
        textures.set(name, texture);
        resolve();
      }, undefined, (error) => {
        console.error(`Failed to load texture "${name}"`, error);
        reject(error);
      });
    });
    pending.push(p);
  }
}


export async function createShaderProjectionPlane(uniforms) {

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
  #define STEP ${STEP} 
  #define NSTEPS ${NSTEPS} 
`
  }

  return {
    mesh,
    changePerformanceQuality
  };
}

export function createParticleSystem() {
  const targetLensed = new THREE.WebGLRenderTarget(
    window.innerWidth, window.innerHeight,
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
  );
  const targetUnlensed = new THREE.WebGLRenderTarget(
    window.innerWidth, window.innerHeight,
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
  );

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100000);

  const sceneLensed = new THREE.Scene();
  const sceneUnlensed = new THREE.Scene();
  let targetWidth = window.innerWidth;
  let targetHeight = window.innerHeight;

  // 2500 points in a flattened shell (r = 8..42) around the BH
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

  // Layer 1: many small crisp stars (bulk of the field)
  const COUNT_S = 2200;
  const posS = new Float32Array(COUNT_S * 3);
  for (let i = 0; i < COUNT_S; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 8 + Math.random() * 34;
    posS[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    posS[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.25;
    posS[i * 3 + 2] = r * Math.cos(phi);
  }
  const geoS = new THREE.BufferGeometry();
  geoS.setAttribute('position', new THREE.BufferAttribute(posS, 3));
  sceneLensed.add(new THREE.Points(geoS, new THREE.PointsMaterial({ ...matBase, size: 0.08 })));

  // Layer 2: fewer brighter slightly-larger stars (foreground highlights)
  const COUNT_B = 300;
  const posB = new Float32Array(COUNT_B * 3);
  for (let i = 0; i < COUNT_B; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 8 + Math.random() * 30;
    posB[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    posB[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.25;
    posB[i * 3 + 2] = r * Math.cos(phi);
  }
  const geoB = new THREE.BufferGeometry();
  geoB.setAttribute('position', new THREE.BufferAttribute(posB, 3));
  sceneUnlensed.add(new THREE.Points(geoB, new THREE.PointsMaterial({ ...matBase, size: 0.11 })));

  function resize(width, height) {
    if (width === targetWidth && height === targetHeight) return;

    targetWidth = width;
    targetHeight = height;
    targetLensed.setSize(width, height);
    targetUnlensed.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return { 
    particleSceneLensed: sceneLensed, 
    particleTargetLensed: targetLensed,
    particleSceneUnlensed: sceneUnlensed, 
    particleTargetUnlensed: targetUnlensed,
    particleCamera: camera,
    resizeParticleTargets: resize
  };
}
