import * as THREE from 'three';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { flightPose } from './flightPath.mjs';
import './openSpace.css';

// A finite, world-fixed volume surrounding the whole authored flight, not a
// shell around the hole and not attached to the camera. A larger traversable
// world would stream cells; this short experiment does not need that machinery.
export function createOpenSpaceExperiment(composer, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
  const pass = new RenderPass(scene, camera);
  pass.clear = false;
  pass.clearDepth = true;
  composer.insertPass(pass, 1);
  const abort = new AbortController();
  let mode = 'free';
  let yaw = 0;
  let currentProgress = 0;
  const target = new THREE.Vector3();

  // Seeded positions let both modes show the exact same world after reload.
  let seed = 82619;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(1800 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (random() - 0.5) * 220;
    positions[i + 1] = (random() - 0.5) * 160;
    positions[i + 2] = (random() - 0.5) * 220;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pixelHeight: { value: 900 } },
    vertexShader: `
      uniform float pixelHeight;
      varying float alpha;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        float d = length(p.xyz);
        alpha = smoothstep(0.8, 2.0, d) * (1.0 - smoothstep(65.0, 105.0, d));
        gl_Position = projectionMatrix * p;
        gl_PointSize = clamp(pixelHeight * 0.018 / max(0.1, -p.z), 0.8, 3.0);
      }`,
    fragmentShader: `
      varying float alpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(0.68, 0.78, 0.95, alpha * (1.0 - r) * 0.65);
      }`,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  // Foreground landmarks, all on the camera side of the central system for
  // the authored forward view. They demonstrate depth, not project placement.
  // This raster pass has local depth, but no relativistic lensing / disk depth.
  scene.add(new THREE.AmbientLight(0x7187b7, 0.38));
  const light = new THREE.DirectionalLight(0xffd6a0, 2.2);
  light.position.set(8, 5, -10);
  scene.add(light);
  const bodies = new THREE.Group();
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const materials = [];
  for (const [x, y, z, radius, color] of [
    [-12.4, 3.0, 23, 0.85, 0x758c99],
    [-3.8, 0.0, 17, 1.15, 0xb18065],
    [4.5, 4.6, 10, 1.55, 0x597b91],
    [-15, -6, 5, 1.8, 0x716c89],
  ]) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.94, flatShading: true });
    materials.push(material);
    const body = new THREE.Mesh(geometry, material);
    body.position.set(x, y, z);
    body.scale.setScalar(radius);
    bodies.add(body);
  }
  scene.add(bodies);

  const panel = document.createElement('section');
  panel.className = 'space-lab';
  panel.setAttribute('aria-label', 'Open space experiment');
  panel.innerHTML = `
    <div class="space-lab-heading"><span>LAB / 01</span><a href="/">Original journey ↗</a></div>
    <h1>Through open space</h1>
    <p>Scroll to travel. Look sideways to see the world continue.</p>
    <div class="space-lab-modes" role="group" aria-label="Camera comparison">
      <button type="button" data-camera="free" aria-pressed="true">Open flight</button>
      <button type="button" data-camera="orbit" aria-pressed="false">Orbit camera</button>
    </div>
    <label class="space-lab-look">Look around <input aria-label="Look around" type="range" min="-180" max="180" value="0" step="1"><output>0°</output></label>
    <div class="space-lab-options">
      <label><input type="checkbox" data-layer="bodies" checked> Landmarks</label>
      <label><input type="checkbox" data-layer="dust" checked> Nearby dust</label>
      <button type="button" data-reset>Look ahead</button>
    </div>
    <div class="space-lab-position"><span data-progress>Departure · 0%</span><span>Same sky · same lens</span></div>`;
  document.body.appendChild(panel);
  document.body.classList.add('open-space-lab');
  const slider = panel.querySelector('input[type="range"]');
  const output = panel.querySelector('output');
  const progressLabel = panel.querySelector('[data-progress]');
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button?.dataset.camera) {
      mode = button.dataset.camera;
      panel.querySelectorAll('[data-camera]').forEach((el) =>
        el.setAttribute('aria-pressed', String(el.dataset.camera === mode)));
    }
    if (button?.hasAttribute('data-reset')) {
      yaw = 0; slider.value = '0'; output.textContent = '0°';
    }
  }, { signal: abort.signal });
  slider.addEventListener('input', () => {
    yaw = Number(slider.value); output.textContent = `${yaw}°`;
  }, { signal: abort.signal });
  panel.addEventListener('change', (event) => {
    if (event.target.dataset.layer === 'bodies') bodies.visible = event.target.checked;
    if (event.target.dataset.layer === 'dust') dust.visible = event.target.checked;
  }, { signal: abort.signal });
  // A native range input owns its horizontal touch gesture, while vertical
  // swipes on the rest of the page continue to scroll the journey.
  slider.style.touchAction = 'pan-y';

  return {
    update(progress, observer) {
      currentProgress = Math.max(0, Math.min(1, progress));
      const pose = flightPose(currentProgress, mode, yaw);
      observer.position.copy(pose.position);
      observer.direction.copy(pose.direction);
      observer.up.copy(pose.up);
      observer.velocity.set(0, 0, 0);
      observer.fov = pose.fov;
      camera.position.copy(pose.position);
      camera.up.copy(pose.up);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      camera.lookAt(target.copy(pose.position).add(pose.direction));
      dustMaterial.uniforms.pixelHeight.value = canvas.height;
      const label = `${currentProgress < 0.33 ? 'Departure' : currentProgress < 0.75 ? 'Passing through' : 'Approach'} · ${Math.round(currentProgress * 100)}%`;
      if (progressLabel.textContent !== label) progressLabel.textContent = label;
    },
    dispose() {
      abort.abort(); panel.remove(); document.body.classList.remove('open-space-lab');
      composer.removePass(pass); pass.dispose?.();
      dustGeometry.dispose(); dustMaterial.dispose(); geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}
