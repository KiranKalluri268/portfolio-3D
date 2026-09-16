import * as THREE from 'three';
import { galaxyJourneyState, smooth } from './galaxyTimeline.mjs';
import './galaxyJourney.css';

const PALETTE = [0x66cce5, 0xae94ed, 0xe1a271, 0x78d2b0, 0xe08bb1];
const UP = new THREE.Vector3(0, 1, 0);

// Destinations are ordinary scenes. The caller selects exactly one RenderPass
// source. No raymarcher, hidden destination or second composer is drawn here.
export function createGalaxyJourney(canvas) {
  const scenes = {
    space: new THREE.Scene(), hyperspace: new THREE.Scene(), galaxy: new THREE.Scene(),
  };
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  const owned = new Set();
  const own = (value) => { owned.add(value); return value; };
  const controller = new AbortController();
  const target = new THREE.Vector3();
  let yaw = 0;
  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = galaxyJourneyState(0);
  let seed = 90826;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Direction-only background: no physical sky shell and no near/far boundary.
  // Inverse projection and camera rotation make it follow looking, not position.
  const skyUniforms = {
    starMap: { value: null }, nebulaMap: { value: null }, ready: { value: 0 },
    inverseProjection: { value: new THREE.Matrix4() }, rotation: { value: new THREE.Matrix3() },
  };
  const skyMaterial = own(new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: skyUniforms,
    vertexShader: `varying vec2 screenUV;
      void main() { screenUV = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: `
      varying vec2 screenUV;
      uniform sampler2D starMap; uniform sampler2D nebulaMap; uniform float ready;
      uniform mat4 inverseProjection; uniform mat3 rotation;
      void main() {
        vec4 p = inverseProjection * vec4(screenUV, 1.0, 1.0);
        vec3 d = normalize(rotation * normalize(p.xyz / p.w));
        vec2 uv = vec2(atan(d.z, d.x) / 6.2831853, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265) + 0.5;
        vec4 star = texture2D(starMap, uv);
        vec3 tint = mix(vec3(1.0, 0.66, 0.39), vec3(0.65, 0.8, 1.0), smoothstep(0.05, 0.65, star.r));
        vec3 nebula = texture2D(nebulaMap, uv).rgb;
        gl_FragColor = vec4(vec3(0.001, 0.002, 0.005) + ready * (tint * star.g * 2.2 + nebula * 0.07), 1.0);
      }`,
  }));
  const skyGeometry = own(new THREE.PlaneGeometry(2, 2));
  for (const scene of Object.values(scenes)) {
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    scene.add(sky);
  }

  const pointMaterial = (size, opacity = 1) => own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { pixelHeight: { value: 900 }, size: { value: size }, opacity: { value: opacity } },
    vertexShader: `
      uniform float pixelHeight; uniform float size; varying vec3 tint;
      void main() {
        tint = color;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_PointSize = clamp(pixelHeight * size / max(1.0, -p.z), 1.0, 6.0);
      }`,
    fragmentShader: `
      varying vec3 tint; uniform float opacity;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(tint, exp(-r * r * 5.0) * opacity);
      }`,
  }));
  const points = (positions, colors, material) => {
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Points(geometry, material);
  };
  const pointMaterials = [];
  // All-direction volume with middle-distance landmarks; no radial shell.
  const dustPosition = [], dustColor = [];
  for (let i = 0; i < 2800; i++) {
    dustPosition.push((random() - 0.5) * 360, (random() - 0.5) * 260, (random() - 0.5) * 400);
    const level = 0.25 + random() * 0.55;
    dustColor.push(level * 0.7, level * 0.85, level);
  }
  const dustMaterial = pointMaterial(0.035, 0.65);
  pointMaterials.push(dustMaterial);
  const dust = points(dustPosition, dustColor, dustMaterial);
  scenes.space.add(dust);
  const galaxyDust = new THREE.Points(dust.geometry, dustMaterial);
  scenes.galaxy.add(galaxyDust);

  const rockGeometry = own(new THREE.IcosahedronGeometry(1, 2));
  const rockMaterial = own(new THREE.MeshStandardMaterial({ color: 0x738999, roughness: 0.95, flatShading: true }));
  scenes.space.add(new THREE.AmbientLight(0x8daacc, 0.4));
  const spaceLight = new THREE.DirectionalLight(0xc5d9ff, 1.6);
  spaceLight.position.set(-15, 24, -35);
  scenes.space.add(spaceLight);
  for (const [x, y, z, scale] of [
    [-10, 1, 15, 1.1], [8, -4, 0, 1.5], [-21, 10, -35, 2],
    [28, 16, -65, 3], [-24, -17, 45, 1.8], [22, 24, 68, 2.3],
  ]) {
    const body = new THREE.Mesh(rockGeometry, rockMaterial);
    body.position.set(x, y, z); body.scale.setScalar(scale);
    scenes.space.add(body);
  }

  // Layout study: five coloured star arms, three orbital traces and eleven
  // anonymous project bodies. These are placeholders, not duplicated content.
  const galaxy = new THREE.Group();
  galaxy.position.set(0, 0, -45);
  galaxy.rotation.set(0.18, 0.12, -0.22);
  scenes.galaxy.add(galaxy);
  const armPositions = [], armColors = [];
  const tint = new THREE.Color();
  for (let i = 0; i < 7500; i++) {
    const arm = i % 5;
    const radius = 1.8 + Math.pow(random(), 0.65) * 29;
    const angle = arm * Math.PI * 2 / 5 + radius * 0.13 + (random() - 0.5) * 0.28;
    armPositions.push(Math.cos(angle) * radius, (random() - 0.5) * (1.8 - radius * 0.035), Math.sin(angle) * radius);
    tint.setHex(PALETTE[arm]).multiplyScalar(0.45 + random() * 0.8);
    armColors.push(tint.r, tint.g, tint.b);
  }
  const armMaterial = pointMaterial(0.20);
  pointMaterials.push(armMaterial);
  galaxy.add(points(armPositions, armColors, armMaterial));
  const core = new THREE.Mesh(own(new THREE.SphereGeometry(1.1, 24, 16)),
    own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.45, 0.8) })));
  galaxy.add(core);
  galaxy.add(new THREE.PointLight(0xffd5a4, 2.5, 100, 1));
  scenes.galaxy.add(new THREE.AmbientLight(0x718dbc, 0.65));
  const ringMaterial = own(new THREE.LineBasicMaterial({ color: 0x708697, transparent: true, opacity: 0.28 }));
  for (const radius of [11, 19, 27]) {
    const vertices = [];
    for (let i = 0; i < 160; i++) {
      const angle = i / 160 * Math.PI * 2;
      vertices.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    galaxy.add(new THREE.LineLoop(own(new THREE.BufferGeometry().setFromPoints(vertices)), ringMaterial));
  }
  for (let i = 0; i < 11; i++) {
    const radius = [11, 19, 27][i % 3];
    const angle = i * 2.39996;
    const body = new THREE.Mesh(rockGeometry, own(new THREE.MeshStandardMaterial({
      color: PALETTE[i % 5], roughness: 0.8, emissive: PALETTE[i % 5], emissiveIntensity: 0.08,
    })));
    body.position.set(Math.cos(angle) * radius, 0.7, Math.sin(angle) * radius);
    body.scale.setScalar(0.65 + (i % 3) * 0.12);
    galaxy.add(body);
  }

  // View-aligned streaks with world-depth perspective. Their distance advances
  // from scroll, so stopping holds the shot and reverse scroll retraces it.
  const streakMaterial = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { travel: { value: 0 }, strength: { value: 0 }, resolution: { value: new THREE.Vector2(1440, 900) } },
    vertexShader: `
      attribute vec3 start; uniform float travel; uniform float strength; uniform vec2 resolution;
      varying float fade; varying vec2 stroke;
      void main() {
        float z = mod(start.z + travel, 180.0);
        fade = smoothstep(0.0, 8.0, z) * (1.0 - smoothstep(155.0, 180.0, z));
        vec4 head = projectionMatrix * vec4(start.xy, -8.0 - z, 1.0);
        vec4 tail = projectionMatrix * vec4(start.xy, -8.0 - z - 0.25 - strength * 32.0, 1.0);
        vec2 delta = (tail.xy / tail.w - head.xy / head.w) * resolution;
        vec2 normal = normalize(vec2(-delta.y, delta.x));
        vec4 p = mix(head, tail, position.y);
        p.xy += normal * position.x * 2.2 / resolution * p.w;
        gl_Position = p;
        stroke = position.xy;
      }`,
    fragmentShader: `
      uniform float strength; varying float fade; varying vec2 stroke;
      void main() {
        float edge = 1.0 - smoothstep(0.25, 1.0, abs(stroke.x));
        float tip = smoothstep(0.0, 0.06, stroke.y) * (1.0 - smoothstep(0.65, 1.0, stroke.y));
        gl_FragColor = vec4(0.55, 0.8, 1.0, edge * tip * fade * strength * 0.85);
      }`,
  }));
  const linePositions = [];
  for (let i = 0; i < 1000; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 3 + random() * 65;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius, z = random() * 180;
    linePositions.push(x, y, z);
  }
  // Thin instanced ribbons give the streaks soft edges at every render scale;
  // native WebGL lines were visibly stair-stepped on the lower quality tiers.
  const streakGeometry = own(new THREE.InstancedBufferGeometry());
  streakGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  streakGeometry.setIndex([0, 1, 2, 2, 1, 3]);
  streakGeometry.setAttribute('start', new THREE.InstancedBufferAttribute(new Float32Array(linePositions), 3));
  streakGeometry.instanceCount = 1000;
  for (const scene of Object.values(scenes)) {
    const streaks = new THREE.Mesh(streakGeometry, streakMaterial);
    streaks.frustumCulled = false;
    streaks.renderOrder = 10;
    scene.add(streaks);
  }

  const panel = document.createElement('section');
  panel.className = 'journey-lab';
  panel.setAttribute('aria-label', 'Galaxy journey experiment');
  panel.innerHTML = `
    <header><span>LAB / 02</span><button type="button" data-collapse aria-expanded="true">Minimise</button></header>
    <h1 data-phase>Through the wormhole</h1>
    <p data-copy>The original crossing and tunnel. Scroll to enter.</p>
    <div class="journey-lab-controls">
      <nav aria-label="Jump to a part of the journey">
        <button type="button" data-pose="0">Wormhole</button>
        <button type="button" data-pose="8.6">Tunnel</button>
        <button type="button" data-pose="13.5">Open space</button>
        <button type="button" data-pose="18.5">Hyperspace</button>
        <button type="button" data-pose="24">Galaxy</button>
      </nav>
      <label class="journey-lab-look">Look around <input type="range" aria-label="Look around" min="-180" max="180" value="0" step="1"><output>0°</output></label>
      <label class="journey-lab-reduced"><input type="checkbox" data-reduced> Gentle transitions</label>
      <div class="journey-lab-links"><a href="/">Original journey</a><a href="/?flight=open">Camera study</a></div>
    </div>
    <footer><span data-position>0.0 / 27</span><span data-renderer>Wormhole active</span></footer>`;
  document.body.appendChild(panel);
  document.body.classList.add('galaxy-journey-lab');
  const phaseLabel = panel.querySelector('[data-phase]');
  const copyLabel = panel.querySelector('[data-copy]');
  const positionLabel = panel.querySelector('[data-position]');
  const rendererLabel = panel.querySelector('[data-renderer]');
  const slider = panel.querySelector('input[type="range"]');
  const output = panel.querySelector('output');
  panel.querySelector('[data-reduced]').checked = reduced;
  let navigate = () => {};
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button?.dataset.pose !== undefined) navigate(Number(button.dataset.pose));
    if (button?.hasAttribute('data-collapse')) {
      const collapsed = panel.classList.toggle('collapsed');
      button.textContent = collapsed ? 'Expand' : 'Minimise';
      button.setAttribute('aria-expanded', String(!collapsed));
    }
  }, { signal: controller.signal });
  slider.addEventListener('input', () => {
    yaw = Number(slider.value); output.textContent = `${yaw}°`;
  }, { signal: controller.signal });
  panel.querySelector('[data-reduced]').addEventListener('change', (event) => {
    reduced = event.target.checked;
  }, { signal: controller.signal });

  const descriptions = {
    wormhole: ['Through the wormhole', 'The original crossing and tunnel. Scroll to enter.'],
    tunnel: ['Inside the passage', 'Travel through the wormhole, then emerge into open space.'],
    arrival: ['On the other side', 'Let the light settle. There is space beyond the passage.'],
    coast: ['A moment in open space', 'Look around. Nearby landmarks pass; distant stars hold.'],
    accelerate: ['Leaving for the galaxy', 'Depth stretches into speed as we leave this location.'],
    hyperspace: ['Between destinations', 'Scroll forward to travel, or back to retrace the passage.'],
    decelerate: ['Arriving at the galaxy', 'The streaks settle into stars, bodies and orbital paths.'],
    galaxy: ['The portfolio galaxy', 'Layout study: five skill arms, project bodies and experience rings.'],
  };
  let lastPhase = '';
  let lastPosition = '';

  return {
    get state() { return state; },
    setNavigator(callback) { navigate = callback; },
    setTextures(stars, nebula) {
      skyUniforms.starMap.value = stars;
      skyUniforms.nebulaMap.value = nebula;
      skyUniforms.ready.value = stars && nebula ? 1 : 0;
    },
    update(units) {
      state = galaxyJourneyState(units);
      panel.dataset.activeScene = state.active;
      panel.dataset.phase = state.phase;
      if (state.phase !== lastPhase) {
        [phaseLabel.textContent, copyLabel.textContent] = descriptions[state.phase];
        rendererLabel.textContent = `${state.active} active`;
        slider.disabled = !['space', 'galaxy'].includes(state.active);
        panel.querySelectorAll('[data-pose]').forEach((button) => {
          const scene = galaxyJourneyState(Number(button.dataset.pose)).active;
          button.setAttribute('aria-current', scene === state.active ? 'step' : 'false');
        });
        lastPhase = state.phase;
      }
      const label = `${state.units.toFixed(1)} / 27`;
      if (label !== lastPosition) { positionLabel.textContent = label; lastPosition = label; }
      if (!scenes[state.active]) return null;

      const aspect = window.innerWidth / window.innerHeight;
      // Back up in portrait so the galaxy is framed rather than chopped off.
      const portrait = Math.max(0, 1 / Math.max(0.4, aspect) - 1);
      const look = new THREE.Vector3(0, 0, -1);
      if (state.active === 'space') {
        const t = state.coast;
        camera.position.set(-5 + t * 5, 3 - t * 1.2, 30 - t * 16 - state.acceleration * 20);
        look.set(0.04 * smooth(t), -0.025, -1).normalize();
      } else if (state.active === 'hyperspace') {
        camera.position.set(0, 0, 0);
      } else {
        const t = smooth(state.galaxy);
        camera.position.set(-6 + t * 6, 24 - t * 6 + portrait * 12, 40 - t * 18 + portrait * 45);
        look.set(0.03, -0.27, -1).normalize();
      }
      // Ease look offset out before warp and back in on arrival, avoiding a
      // sideways destination snapping into a forward-aligned streak field.
      const lookWeight = state.active === 'space' ? 1 - state.acceleration
        : state.active === 'galaxy' ? 1 - state.streak : 0;
      look.applyAxisAngle(UP, yaw * Math.PI / 180 * lookWeight);
      camera.up.copy(UP);
      camera.lookAt(target.copy(camera.position).add(look));
      const fov = 58 + (reduced ? 0 : state.streak * 14);
      if (camera.aspect !== aspect || camera.fov !== fov) {
        camera.aspect = aspect; camera.fov = fov; camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
      skyUniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      skyUniforms.rotation.value.setFromMatrix4(camera.matrixWorld);
      for (const material of pointMaterials) material.uniforms.pixelHeight.value = canvas.height;
      streakMaterial.uniforms.strength.value = reduced ? 0 : state.streak;
      streakMaterial.uniforms.travel.value = -(state.units - 15) * 120;
      streakMaterial.uniforms.resolution.value.set(canvas.width, canvas.height);

      return { scene: scenes[state.active], camera, state, reduced };
    },
    dispose() {
      controller.abort(); panel.remove(); document.body.classList.remove('galaxy-journey-lab');
      for (const resource of owned) resource.dispose();
    },
  };
}
