import * as THREE from 'three';
import { journeyAt, DESTINATION_Z } from './guidedPath.mjs';
import { departureAt } from './galaxyDeparture.mjs';
import { generateGalaxy, generateHaze, generateDust, GALAXY_RADIUS, STAR_COUNT } from './galaxyModel.mjs';
import './guidedWorld.css';

export function createGuidedWorld({ scene, camera, panel, canvas, options, starMaterial, connected = false }) {
  document.body.classList.add('guided-world');
  if (connected) document.body.classList.add('connected-world');
  canvas.setAttribute('aria-label', 'Scroll-driven flight to a galaxy');
  camera.far = 6000;
  camera.updateProjectionMatrix();
  panel.querySelector('header').innerHTML = '<span>LAB / 04</span><a href="/?world=free">Free flight ↗</a>';
  panel.querySelector('h1').textContent = 'A journey through space';
  panel.querySelector('[data-instructions]').textContent = 'Scroll to travel. Scroll back to retrace your flight. The galaxy is a fixed destination ahead.';
  panel.querySelector('[data-enter]').hidden = true;
  panel.querySelector('.world-settings').hidden = true;
  panel.querySelector('.world-footnote').textContent = 'Galaxy geometry is a placeholder, not the final portfolio layout.';
  const controls = document.createElement('div');
  controls.className = 'guided-controls';
  controls.innerHTML = '<label><input type="checkbox" data-look> Look around with cursor</label><label><input type="checkbox" data-gentle> Gentle motion (no trails)</label><button type="button" data-restart>Restart journey</button><button type="button" data-collapse>Hide panel</button>';
  panel.appendChild(controls);
  const restore = document.createElement('button');
  restore.className = 'guided-restore'; restore.textContent = 'Show controls'; restore.hidden = true;
  document.body.appendChild(restore);
  const marker = document.createElement('div');
  marker.className = 'guided-stage'; marker.setAttribute('aria-live', 'polite');
  document.body.appendChild(marker);
  const gentle = controls.querySelector('[data-gentle]');
  gentle.checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.querySelector('[data-restart]').addEventListener('click', () => window.scrollTo(0, 0), options);
  controls.querySelector('[data-collapse]').addEventListener('click', () => { panel.hidden = true; restore.hidden = false; }, options);
  restore.addEventListener('click', () => { panel.hidden = false; restore.hidden = true; }, options);
  let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0, progress = 0, state = journeyAt(0);
  window.addEventListener('mousemove', (event) => {
    targetYaw = -(event.clientX / innerWidth - 0.5) * 0.35;
    targetPitch = -(event.clientY / innerHeight - 0.5) * 0.22;
  }, options);

  // Seeded volumetric galaxy. No sky plate, camera-parented geometry or
  // time-driven rotation: changing perspective comes only from camera travel.
  // Stars share the world's trail material so the fly-through streaks them the
  // same way as resident stars; only the far fade and pixel floor differ.
  const galaxy = new THREE.Group();
  galaxy.rotation.set(0.95, 0.15, -0.2);
  scene.add(galaxy);
  const quad = new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3);
  const disposables = [];
  const stars = generateGalaxy();
  const starGeometry = new THREE.InstancedBufferGeometry();
  starGeometry.setAttribute('position', quad);
  starGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  starGeometry.setAttribute('starPosition', new THREE.InstancedBufferAttribute(stars.positions, 3));
  starGeometry.setAttribute('color', new THREE.InstancedBufferAttribute(stars.colors, 3));
  starGeometry.setAttribute('starSize', new THREE.InstancedBufferAttribute(stars.sizes, 1));
  starGeometry.setAttribute('imageBranch', new THREE.InstancedBufferAttribute(new Float32Array(STAR_COUNT), 1));
  starGeometry.instanceCount = STAR_COUNT;
  starGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GALAXY_RADIUS * 2.5);
  const galaxyStarMaterial = starMaterial.clone();
  // Share the per-frame uniforms by reference so one update drives both meshes.
  for (const name of ['resolution', 'previousViewProjection', 'shutterScale', 'lensPosition', 'previousEye', 'lensRadius']) {
    galaxyStarMaterial.uniforms[name] = starMaterial.uniforms[name];
  }
  galaxyStarMaterial.uniforms.viewDistance.value = 6000;
  galaxyStarMaterial.uniforms.sizeFloor.value = 1.7;
  disposables.push(starGeometry, galaxyStarMaterial);
  galaxy.add(new THREE.Mesh(starGeometry, galaxyStarMaterial));

  // Soft view-aligned discs: unresolved starlight (additive) and dust (normal).
  const spriteShader = {
    vertexShader: `
      attribute vec3 spritePosition; attribute vec4 spriteColor; attribute float spriteRadius;
      varying vec4 tint; varying vec2 uv2;
      void main() {
        uv2 = position.xy;
        vec4 p = modelViewMatrix * vec4(spritePosition, 1.0);
        // Unresolved light dissolves into individual stars as the camera closes in.
        float near = smoothstep(spriteRadius * 4.0, spriteRadius * 16.0, -p.z);
        tint = vec4(spriteColor.rgb, spriteColor.a * near);
        p.xy += vec2(position.x * 2.0 - 1.0, position.y) * spriteRadius;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `
      varying vec4 tint; varying vec2 uv2;
      void main() {
        vec2 c = vec2(uv2.x * 2.0 - 1.0, uv2.y);
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        gl_FragColor = vec4(tint.rgb, tint.a * exp(-r2 * 2.2) * (1.0 - r2) * (1.0 - r2));
      }`,
  };
  const sprites = (data, blending, order) => {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', quad);
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('spritePosition', new THREE.InstancedBufferAttribute(data.positions, 3));
    geometry.setAttribute('spriteColor', new THREE.InstancedBufferAttribute(data.colors, 4));
    geometry.setAttribute('spriteRadius', new THREE.InstancedBufferAttribute(data.radii, 1));
    geometry.instanceCount = data.radii.length;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GALAXY_RADIUS * 1.5);
    const material = new THREE.ShaderMaterial({ ...spriteShader, transparent: true, depthWrite: false, depthTest: false, blending });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    disposables.push(geometry, material);
    galaxy.add(mesh);
  };
  sprites(generateDust(), THREE.NormalBlending, 1);
  sprites(generateHaze(), THREE.AdditiveBlending, 2);
  let lastStage = '';
  return {
    update(dt, externalProgress) {
      const target = Math.max(0, Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)));
      if (externalProgress !== undefined) progress = externalProgress;
      else {
        progress += (target - progress) * (1 - Math.exp(-dt * 12));
        if (Math.abs(target - progress) < 0.000001) progress = target;
      }
      state = connected && progress > 1 ? departureAt((progress - 1) * 6) : journeyAt(progress);
      const look = controls.querySelector('[data-look]').checked && !gentle.checked;
      yaw += ((look ? targetYaw : 0) - yaw) * (1 - Math.exp(-dt * 8));
      pitch += ((look ? targetPitch : 0) - pitch) * (1 - Math.exp(-dt * 8));
      if (state.stage !== lastStage || marker.textContent !== state.stage) { marker.textContent = state.stage; lastStage = state.stage; }
      const position = [progress > 1 ? 0 : Math.sin(progress * Math.PI) * 12, 0, -state.distance];
      return { position, yaw, pitch };
    },
    place(origin) {
      // Offset sideways so the straight fly-through threads an inter-arm gap
      // instead of the bulge.
      galaxy.position.set(10, 0, DESTINATION_Z).sub(origin);
    },
    status() { return `${Math.round(progress * 100)}% · ${state.stage} · Scroll to continue / reverse`; },
    inspect() { return { progress, stage: state.stage, distance: state.distance, gentle: gentle.checked }; },
    get gentle() { return gentle.checked; },
    setVisible(value) { galaxy.visible = value; },
    dispose() { scene.remove(galaxy); for (const item of disposables) item.dispose(); restore.remove(); marker.remove(); },
  };
}
