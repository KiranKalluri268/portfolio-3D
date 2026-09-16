import * as THREE from 'three';
import { CELL_SIZE, STARS_PER_CELL, VIEW_DISTANCE, cellAt, cellKey, generateCell, nearbyCells, heading } from './worldModel.mjs';
import './freeWorld.css';
import starLensing from './starLensing.glsl?raw';

export async function createFreeWorld({ externalRenderer = null } = {}) {
if (!externalRenderer) {
  document.body.className = 'free-world';
  document.body.replaceChildren();
}
const canvas = externalRenderer?.domElement ?? document.createElement('canvas');
canvas.setAttribute('aria-label', 'First-person star field. Click to capture the mouse; scroll to travel, W/A/S/D or arrow keys to slide; Escape releases it.');
canvas.tabIndex = 0;
if (!externalRenderer) document.body.appendChild(canvas);

const panel = document.createElement('section');
panel.className = 'world-panel';
panel.setAttribute('aria-label', 'Free world controls');
panel.innerHTML = `
  <header><span>LAB / 03</span><a href="/?journey=galaxy">Journey study ↗</a></header>
  <h1>A world to move through</h1>
  <p data-instructions>Click to capture the mouse. Look freely, scroll to travel where you face, and use W/A/S/D or the arrows to slide up, down, left and right.</p>
  <button type="button" data-enter>Enter world</button>
  <div class="world-settings">
    <label>Travel speed <select aria-label="Travel speed"><option value="1">1×</option><option value="5">5×</option><option value="10">10×</option><option value="20">20×</option><option value="50">50×</option></select></label>
    <label>Mouse sensitivity <input aria-label="Mouse sensitivity" type="range" min="0.3" max="2" step="0.1" value="1"></label>
    <button type="button" data-reset>Return to origin</button>
  </div>
  <p class="world-footnote">Scroll down: forward · Scroll up: backward<br>W/S or ↑/↓: up, down · A/D or ←/→: left, right<br>Mouse: look · Esc: release cursor</p>
  <output data-status aria-label="World status"></output>`;
document.body.appendChild(panel);
const crosshair = document.createElement('div');
crosshair.className = 'world-crosshair';
crosshair.setAttribute('aria-hidden', 'true');
document.body.appendChild(crosshair);
const hint = document.createElement('div');
hint.className = 'world-hint';
hint.textContent = 'Mouse to look · Scroll to travel · WASD / arrows to slide · Esc to release';
document.body.appendChild(hint);

const instructions = panel.querySelector('[data-instructions]');
const enter = panel.querySelector('[data-enter]');
const status = panel.querySelector('[data-status]');
const abort = new AbortController();
const options = { signal: abort.signal };
let renderer;
try {
  renderer = externalRenderer ?? new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  instructions.textContent = 'This browser could not start WebGL. Try the lab in a browser with graphics acceleration available.';
  enter.disabled = true;
  throw new Error('The free-world experiment requires WebGL.');
}
if (!externalRenderer) renderer.setClearColor(0x000104, 1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000104);
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, VIEW_DISTANCE + 10);
const blackHoleWorld = !externalRenderer && new URLSearchParams(location.search).get('world') === 'blackhole';
const wormholeWorld = !externalRenderer && new URLSearchParams(location.search).get('world') === 'wormhole';
const lensedWorld = blackHoleWorld || wormholeWorld || !!externalRenderer;
if (lensedWorld) { camera.far = 10000; camera.updateProjectionMatrix(); }
let starLensingEnabled = lensedWorld;
const material = new THREE.ShaderMaterial({
  vertexColors: true, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    resolution: { value: new THREE.Vector2(1600, 900) },
    previousViewProjection: { value: new THREE.Matrix4() },
    shutterScale: { value: 0 },
    viewDistance: { value: VIEW_DISTANCE },
    sizeFloor: { value: 1.0 },
    lensPosition: { value: new THREE.Vector3() },
    previousEye: { value: new THREE.Vector3() },
    lensRadius: { value: 0 },
  },
  vertexShader: `
    ${starLensing}
    uniform vec2 resolution; uniform float viewDistance; uniform float sizeFloor;
    uniform mat4 previousViewProjection; uniform float shutterScale;
    attribute float starSize; attribute vec3 starPosition;
    varying vec3 tint; varying float fade;
    varying vec2 trailUV; varying float trailLength; varying float radius; varying float energy;
    void main() {
      vec4 world = modelMatrix * vec4(starPosition, 1.0);
      float lensGain;
      vec3 apparent = lensStar(world.xyz, cameraPosition, lensGain);
      vec4 p = viewMatrix * vec4(apparent, 1.0);
      float distance = length(p.xyz);
      tint = color;
      fade = smoothstep(0.2, 1.0, distance) * (1.0 - smoothstep(viewDistance * 0.72, viewDistance, distance)) * lensGain;
      vec4 current = projectionMatrix * p;
      float previousGain;
      vec4 previous = previousViewProjection * vec4(lensStar(world.xyz, previousEye, previousGain), 1.0);
      vec2 motion = vec2(0.0);
      if (current.w > 0.05 && previous.w > 0.05) {
        motion = (current.xy / current.w - previous.xy / previous.w) * resolution * 0.5 * shutterScale;
      }
      float apparentSpeed = length(motion);
      // Keep tiny movements point-like; ease into streaks as motion increases.
      float response = smoothstep(0.5, 3.0, apparentSpeed);
      trailLength = min(apparentSpeed * starSize * response, resolution.y * 0.6);
      vec2 axis = apparentSpeed > 0.001 ? motion / apparentSpeed : vec2(1.0, 0.0);
      vec2 normal = vec2(-axis.y, axis.x);
      radius = clamp(resolution.y * 0.065 * starSize / max(0.1, -p.z), sizeFloor, 12.0) * 0.5;
      energy = min(apparentSpeed * starSize * response * 0.018, 2.5);
      float extent = radius * (1.0 + energy * 0.35);
      trailUV = vec2(mix(-trailLength - extent, extent, position.x), position.y * extent);
      vec2 offset = axis * trailUV.x + normal * trailUV.y;
      gl_Position = current;
      gl_Position.xy += offset * 2.0 / resolution * current.w;
      if (current.w <= 0.05) fade = 0.0;
    }`,
  fragmentShader: `
    varying vec3 tint; varying float fade;
    varying vec2 trailUV; varying float trailLength; varying float radius; varying float energy;
    void main() {
      float nearest = clamp(trailUV.x, -trailLength, 0.0);
      float r = length(trailUV - vec2(nearest, 0.0)) / radius;
      float taper = trailLength > 0.01 ? mix(0.08, 1.0, clamp(1.0 + trailUV.x / trailLength, 0.0, 1.0)) : 1.0;
      float core = exp(-r * r * 9.0);
      float halo = exp(-r * r * 3.0 / (1.0 + energy)) * (0.18 + energy * 0.25);
      gl_FragColor = vec4(tint, (core + halo) * fade * taper);
    }`,
});

const chunks = new Map();
const worldPosition = new THREE.Vector3(0, 0, 0);
const renderOrigin = new THREE.Vector3();
const direction = new THREE.Vector3();
const previousPosition = new THREE.Vector3();
const previousRotation = new THREE.Quaternion();
const trailRotation = new THREE.Quaternion();
const previousCameraMatrix = new THREE.Matrix4();
const previousRelativePosition = new THREE.Vector3();
const unitScale = new THREE.Vector3(1, 1, 1);
let resetTrail = true;
let currentCell = '';
let yaw = 0, pitch = 0, pendingDistance = 0, speed = 1, sensitivity = 1;
// Held-key strafing: W/S ride the camera's own up axis, A/D its right axis, so
// the pair stays square to whatever the mouse is looking at. Velocity is eased
// rather than applied outright, to match the glide the wheel already has.
const heldKeys = new Set();
const strafeVelocity = new THREE.Vector2();
const cameraRight = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
const STRAFE_SPEED = 6;
const STRAFE_KEYS = {
  KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0],
  ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};
let lastTime = performance.now(), lastStatus = 0, frame = 0;
let disposed = false;
let guided = null;
let destination = null;

function updateCells() {
  const coords = cellAt(worldPosition.toArray());
  const nextCell = cellKey(...coords);
  if (currentCell === nextCell) return;
  currentCell = nextCell;
  renderOrigin.set(...coords).multiplyScalar(CELL_SIZE);
  const wanted = new Set();
  for (const coord of nearbyCells(worldPosition.toArray())) {
    const key = cellKey(...coord);
    wanted.add(key);
    if (!chunks.has(key)) {
      const data = generateCell(...coord);
      // Two apparent images of the SAME sources, not a second generated sky.
      const copies = lensedWorld ? 2 : 1;
      const repeat = (values) => {
        if (copies === 1) return values;
        const result = new Float32Array(values.length * copies);
        result.set(values); result.set(values, values.length); return result;
      };
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.setAttribute('starPosition', new THREE.InstancedBufferAttribute(repeat(data.positions), 3));
      geometry.setAttribute('color', new THREE.InstancedBufferAttribute(repeat(data.colors), 3));
      geometry.setAttribute('starSize', new THREE.InstancedBufferAttribute(repeat(data.sizes), 1));
      const branches = new Float32Array(STARS_PER_CELL * copies);
      if (copies === 2) branches.fill(1, STARS_PER_CELL);
      geometry.setAttribute('imageBranch', new THREE.InstancedBufferAttribute(branches, 1));
      geometry.instanceCount = STARS_PER_CELL * copies;
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3().setScalar(CELL_SIZE / 2), CELL_SIZE * Math.sqrt(3) / 2);
      const stars = new THREE.Mesh(geometry, material);
      // An off-screen source can have an on-screen secondary image.
      if (lensedWorld) stars.frustumCulled = false;
      chunks.set(key, { coord, stars });
      scene.add(stars);
    }
  }
  for (const [key, chunk] of chunks) {
    if (!wanted.has(key)) {
      scene.remove(chunk.stars);
      chunk.stars.geometry.dispose();
      chunks.delete(key);
    } else {
      // Floating origin keeps GPU coordinates small. Absolute star positions
      // never change: only the common rendering coordinate system is shifted.
      chunk.stars.position.set(...chunk.coord).multiplyScalar(CELL_SIZE).sub(renderOrigin);
    }
  }
}

function resize() {
  if (!externalRenderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  material.uniforms.resolution.value.set(canvas.width, canvas.height);
  resetTrail = true;
}

async function capture() {
  if (guided) return;
  if (document.pointerLockElement === canvas) return;
  try {
    // Standard pointer lock gives unlimited relative mouse movement, with no
    // viewport edge and no orbit target. It must originate from a user gesture.
    await canvas.requestPointerLock();
  } catch {
    instructions.textContent = 'Mouse capture was declined. Click Enter world to try again; Escape always releases the cursor.';
  }
}
enter.addEventListener('click', capture, options);
canvas.addEventListener('click', capture, options);
canvas.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') capture();
}, options);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('world-locked', locked);
  pendingDistance = 0; heldKeys.clear(); strafeVelocity.set(0, 0);
  instructions.textContent = 'Click to capture the mouse. Look freely, scroll to travel where you face, and use W/A/S/D or the arrows to slide up, down, left and right.';
  if (!locked) enter.focus({ preventScroll: true });
}, options);
document.addEventListener('pointerlockerror', () => {
  instructions.textContent = 'The browser did not capture the mouse. Click Enter world again.';
}, options);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.pointerLockElement === canvas) {
    pendingDistance = 0;
    document.exitPointerLock();
  }
}, options);
document.addEventListener('keydown', (event) => {
  if (document.pointerLockElement !== canvas) return;
  if (!(event.code in STRAFE_KEYS) || event.ctrlKey || event.metaKey || event.altKey) return;
  // Arrows would otherwise scroll the page out from under the captured cursor.
  event.preventDefault();
  heldKeys.add(event.code);
}, { ...options, passive: false });
document.addEventListener('keyup', (event) => { heldKeys.delete(event.code); }, options);
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= event.movementX * 0.002 * sensitivity;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002 * sensitivity, -Math.PI * 0.497, Math.PI * 0.497);
}, options);
document.addEventListener('wheel', (event) => {
  if (document.pointerLockElement !== canvas) return;
  event.preventDefault();
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  pendingDistance += THREE.MathUtils.clamp(pixels, -600, 600) * 0.035 * speed;
}, { ...options, passive: false });
panel.querySelector('select').addEventListener('change', (event) => { speed = Number(event.target.value); }, options);
panel.querySelector('input').addEventListener('input', (event) => { sensitivity = Number(event.target.value); }, options);
panel.querySelector('[data-reset]').addEventListener('click', () => {
  worldPosition.set(0, 0, 0); yaw = 0; pitch = 0; pendingDistance = 0;
  heldKeys.clear(); strafeVelocity.set(0, 0);
  resetTrail = true;
}, options);
window.addEventListener('resize', resize, options);
window.addEventListener('blur', () => { pendingDistance = 0; heldKeys.clear(); }, options);
document.addEventListener('visibilitychange', () => { pendingDistance = 0; heldKeys.clear(); lastTime = performance.now(); }, options);

function update(now, progress, positionOverride) {
  if (disposed) return;
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  direction.set(...heading(yaw, pitch));
  if (document.pointerLockElement === canvas) {
    // Smooth wheel steps over roughly 100ms. Heading is sampled each frame, so
    // mouse look steers travel; speed changes distance, never particle motion.
    const distance = pendingDistance * (1 - Math.exp(-dt * 22));
    pendingDistance -= distance;
    if (Math.abs(pendingDistance) < 0.0001) pendingDistance = 0;
    worldPosition.addScaledVector(direction, distance);
    let targetX = 0, targetY = 0;
    for (const code of heldKeys) {
      const [x, y] = STRAFE_KEYS[code];
      targetX += x; targetY += y;
    }
    const magnitude = Math.hypot(targetX, targetY);
    if (magnitude > 1) { targetX /= magnitude; targetY /= magnitude; }
    // Ramp on press and coast on release, so a tap never snaps the frame.
    const blend = 1 - Math.exp(-dt * 8);
    strafeVelocity.x += (targetX * STRAFE_SPEED * speed - strafeVelocity.x) * blend;
    strafeVelocity.y += (targetY * STRAFE_SPEED * speed - strafeVelocity.y) * blend;
    if (strafeVelocity.lengthSq() > 0.000001) {
      cameraRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
      cameraUp.crossVectors(cameraRight, direction);
      worldPosition.addScaledVector(cameraRight, strafeVelocity.x * dt);
      worldPosition.addScaledVector(cameraUp, strafeVelocity.y * dt);
    } else strafeVelocity.set(0, 0);
  }
  if (guided) {
    const pose = guided.update(dt, progress);
    worldPosition.set(...pose.position);
    yaw = pose.yaw; pitch = pose.pitch;
  }
  if (positionOverride) worldPosition.set(...positionOverride);
  updateCells();
  guided?.place(renderOrigin);
  destination?.update(renderOrigin, now / 1000);
  if (destination) {
    material.uniforms.lensPosition.value.copy(destination.position).sub(renderOrigin);
    material.uniforms.lensRadius.value = starLensingEnabled ? destination.horizonRadius : 0;
  } else material.uniforms.lensRadius.value = 0;
  camera.position.copy(worldPosition).sub(renderOrigin);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  // Express both camera poses in the SAME floating-origin coordinates. The
  // resulting screen displacement belongs to each real star, not an overlay.
  if (resetTrail) {
    previousPosition.copy(worldPosition);
    previousRotation.copy(camera.quaternion);
  }
  previousRelativePosition.copy(previousPosition).sub(renderOrigin);
  material.uniforms.previousEye.value.copy(previousRelativePosition);
  // Attenuate look-induced blur without changing the actual camera controls.
  trailRotation.copy(previousRotation).slerp(camera.quaternion, 0.8);
  previousCameraMatrix.compose(previousRelativePosition, trailRotation, unitScale).invert();
  material.uniforms.previousViewProjection.value.multiplyMatrices(camera.projectionMatrix, previousCameraMatrix);
  material.uniforms.shutterScale.value = resetTrail || guided?.gentle ? 0 : 0.005 / Math.max(dt, 0.001);
  if (!externalRenderer) {
    if (destination) destination.render();
    else renderer.render(scene, camera);
  }
  previousPosition.copy(worldPosition);
  previousRotation.copy(camera.quaternion);
  resetTrail = false;
  if (now - lastStatus > 150) {
    status.textContent = guided ? guided.status() : `Position ${worldPosition.toArray().map((n) => n.toFixed(1)).join(' / ')} · ${speed}× · ${chunks.size} cells · ${chunks.size * STARS_PER_CELL} stars loaded`;
    lastStatus = now;
  }
  if (!externalRenderer) frame = requestAnimationFrame(update);
}

// Read-only inspection for browser checks: no synthetic input / capture bypass.
if (new URLSearchParams(location.search).has('inspect')) {
  window.__freeWorld = () => ({
    position: worldPosition.toArray(), direction: direction.toArray(), yaw, pitch,
    cells: chunks.size, cell: currentCell, geometries: renderer.info.memory.geometries,
    speed, locked: document.pointerLockElement === canvas,
    journey: guided?.inspect(),
    destination: destination?.inspect(camera),
    starLensingEnabled,
  });
}
function dispose() {
  if (disposed) return;
  disposed = true; abort.abort(); cancelAnimationFrame(frame);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  guided?.dispose();
  if (!externalRenderer) destination?.dispose();
  for (const chunk of chunks.values()) chunk.stars.geometry.dispose();
  chunks.clear(); material.dispose();
  if (!externalRenderer) renderer.dispose();
  panel.remove(); crosshair.remove(); hint.remove();
  delete window.__freeWorld;
}
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
async function start() {
  if (lensedWorld && !externalRenderer) {
    if (wormholeWorld) {
      const { createWorldWormhole } = await import('./worldWormhole.js');
      destination = await createWorldWormhole(scene, renderer, camera, material);
    } else {
      const { createWorldBlackHole } = await import('./worldBlackHole.js');
      destination = await createWorldBlackHole(scene, renderer, camera);
    }
    if (disposed) { destination.dispose(); return; }
    panel.querySelector('header').innerHTML = '<span>LAB / 06</span><a href="/?journey=connected">Connected reference ↗</a>';
    panel.querySelector('h1').textContent = 'Black hole in the live world';
    panel.querySelector('.world-footnote').innerHTML = 'Curved disk + live-star lensing<br>Same stars and camera · Scroll to pass beside it<br>W/A/S/D or arrows: slide up, down, left, right<br>Mouse: look · Esc: release cursor';
    if (wormholeWorld) {
      panel.querySelector('header').innerHTML = '<span>LAB / 07</span><a href="/?world=blackhole">Black-hole study ↗</a>';
      panel.querySelector('h1').textContent = 'Wormhole in the live world';
      panel.querySelector('.world-footnote').innerHTML = 'A distant sky through the throat · Live stars outside<br>Scroll to approach or pass · WASD / arrows to slide<br>Mouse: look · Esc: release cursor';
    }
    const lensControl = document.createElement('label');
    lensControl.innerHTML = '<input type="checkbox" checked aria-label="Star lensing"> Star lensing (compare)';
    panel.querySelector('.world-settings').appendChild(lensControl);
    lensControl.querySelector('input').addEventListener('change', event => {
      starLensingEnabled = event.target.checked; resetTrail = true;
    }, options);
  }
  if (externalRenderer || new URLSearchParams(location.search).get('world') === 'guided') {
    const { createGuidedWorld } = await import('./guidedWorld.js');
    if (disposed) return;
    guided = createGuidedWorld({ scene, camera, panel, canvas, options, connected: !!externalRenderer, starMaterial: material });
  }
  resize(); updateCells(); lastTime = performance.now();
  if (!externalRenderer) frame = requestAnimationFrame(update);
}
await start();
return {
  scene, camera, panel, dispose, starMaterial: material,
  setDestination(value) { if (destination !== value) resetTrail = true; destination = value; },
  setGalaxyVisible(value) { guided?.setVisible(value); },
  update(progress, reset = false, positionOverride) {
    resetTrail ||= reset;
    if (material.uniforms.resolution.value.x !== canvas.width ||
        material.uniforms.resolution.value.y !== canvas.height ||
        camera.aspect !== innerWidth / innerHeight) resize();
    update(performance.now(), progress, positionOverride);
  },
  get gentle() { return guided?.gentle; },
};
}
