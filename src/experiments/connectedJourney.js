import { createFreeWorld } from './freeWorld.js';
import { departureAt, blackHoleProgress } from './galaxyDeparture.mjs';
import { createWorldWormhole } from './worldWormhole.js';
import { createWorldBlackHole } from './worldBlackHole.js';
import { wormholeApproach, TUNNEL_BLEND_END } from './wormholeApproach.mjs';
import './connectedJourney.css';

export async function createConnectedJourney(renderer) {
  const world = await createFreeWorld({ externalRenderer: renderer });
  const wormhole = await createWorldWormhole(world.scene, renderer, world.camera, world.starMaterial);
  const blackHole = await createWorldBlackHole(world.scene, renderer, world.camera);
  const arrivalDistance = departureAt(6).distance;
  blackHole.position.set(8, 0, -arrivalDistance - 40);
  wormhole.setVisible(false); blackHole.setVisible(false);
  const panel = world.panel;
  panel.querySelector('header').innerHTML = '<span>LAB / 05</span><a href="/?world=guided">Guided reference ↗</a>';
  panel.querySelector('h1').textContent = 'Through the wormhole';
  panel.querySelector('[data-instructions]').textContent = 'Scroll through the wormhole and its tunnel, then fly to the galaxy. Scroll backward to return.';
  const nav = document.createElement('nav');
  nav.className = 'connected-nav';
  nav.innerHTML = '<button data-unit="0">Wormhole</button><button data-unit="9">Tunnel</button><button data-unit="13">Open space</button><button data-unit="21.25">Fast travel</button><button data-unit="31">Galaxy</button><button data-unit="34">Hyperspace 2</button><button data-unit="40">Black hole</button>';
  panel.appendChild(nav);
  let navigate = () => {}, active = false;
  nav.addEventListener('click', event => {
    if (event.target.dataset.unit !== undefined) navigate(Number(event.target.dataset.unit));
  });
  return {
    setTextures() {},
    setNavigator(callback) { navigate = callback; },
    update(units) {
      const atWormhole = units <= TUNNEL_BLEND_END;
      const atBlackHole = units > 37;
      wormhole.setVisible(atWormhole);
      blackHole.setVisible(atBlackHole);
      world.setGalaxyVisible(units > 11.5);
      world.setDestination(atWormhole ? wormhole : atBlackHole ? blackHole : null);
      if (atWormhole) {
        const approach = wormholeApproach(units, renderer.domElement.clientWidth / renderer.domElement.clientHeight);
        wormhole.setFunnel(approach.throatFunnel);
        world.update(0, !active, approach);
        active = true;
        panel.dataset.activeScene = 'wormhole';
        panel.querySelector('[data-status]').textContent = 'Wormhole approach';
        const marker = document.querySelector('.guided-stage');
        if (marker) marker.textContent = 'Wormhole approach';
        return { scene: world.scene, camera: world.camera, direct: true,
          render: () => wormhole.render(), tunnelBlend: approach.tunnelBlend,
          reduced: world.gentle, state: { veil: 0, streak: 0 } };
      }
      if (units > 37) {
        const t = blackHoleProgress(units);
        const approach = t * t * (3 - 2 * t);
        world.update(2, !active, [7.5 * approach, 0, -arrivalDistance - 37.8 * approach]);
        active = true;
        panel.dataset.activeScene = 'black-hole';
        panel.querySelector('[data-status]').textContent = 'Black-hole approach';
        const marker = document.querySelector('.guided-stage');
        if (marker) marker.textContent = 'Black-hole approach';
        return { scene: world.scene, camera: world.camera, direct: true,
          render: () => blackHole.render(), reduced: world.gentle,
          state: { veil: 1 - Math.min(1, (units - 37) / 0.65), streak: 0 } };
      }
      const next = units > 11.5;
      panel.dataset.activeScene = next ? 'world' : 'tunnel';
      if (!next) {
        active = false;
        const stage = 'Inside the tunnel';
        panel.querySelector('[data-status]').textContent = stage;
        const label = document.querySelector('.guided-stage');
        if (label) label.textContent = stage;
        return null;
      }
      // Continue past arrival in world coordinates, without replaying the first trip.
      const progress = units > 31
        ? 1 + (units - 31) / 6
        : Math.max(0, Math.min(1, (units - 11.5) / 19.5));
      world.update(progress, !active);
      active = true;
      if (units > 31) {
        const stage = departureAt(units - 31).stage;
        panel.querySelector('[data-status]').textContent = stage;
        const marker = document.querySelector('.guided-stage');
        if (marker) marker.textContent = stage;
      }
      return {
        // Open space keeps the direct, bloom-free trail exposure; from the
        // deceleration on, the galaxy fills the frame and goes through bloom.
        scene: world.scene, camera: world.camera, direct: world.gentle || units < 28, reduced: world.gentle,
        state: {
          veil: units > 36.35
            ? Math.min(1, (units - 36.35) / 0.65)
            : 1 - Math.min(1, (units - 11.5) / 0.65),
          streak: units > 31 ? 1 : 0,
        },
      };
    },
    inspect() { return { destination: world.panel.dataset.activeScene === 'wormhole'
      ? wormhole.inspect(world.camera) : world.panel.dataset.activeScene === 'black-hole'
      ? blackHole.inspect(world.camera) : null }; },
    dispose() { wormhole.dispose(); blackHole.dispose(); world.dispose(); document.body.classList.remove('connected-world', 'guided-world'); },
  };
}
