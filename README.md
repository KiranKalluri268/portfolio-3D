# Portfolio 3D

The animated background for the portfolio: one continuous point-of-view flight,
driven entirely by scroll position. Every value on the journey is a pure
function of how far down the page you are, so scrubbing backwards retraces it
exactly.

## The journey

The default `/` runs the connected live-world journey: wormhole, tunnel,
star flight, galaxy fly-through, second hyperspace leg, and black-hole fall.
`/?journey=connected` remains an alias. The original four-act experience is
available at `/?world=old`. Standalone world and other experiment routes remain
available at their existing query URLs.

The original route remains a four-act legacy reference, laid out in `JOURNEY` in
`src/main.js` in viewport units of scroll. The accepted direction is now a shared
infinite star world with shader destinations placed inside it.

1. **The crossing** (0 → 5.0). Cross to a wormhole and close on it until its
   mouth runs off every edge of the frame.
2. **The flash** (5.0 → 6.5). The frame overexposes into a burst of light that
   burns down to black. The scene swap happens under the black.
3. **The passage** (6.5 → 11.5). A bending tunnel with the world's own stars
   wrapped onto its walls, opening into the light at the far end.
4. **The fall** (11.5 → 27.0). Come out in front of the black hole and fall
   toward it.

The wormhole and the black hole are **the same shader**. `throat_throughput`
switches what happens at the horizon — absorb, or hand back the far side — and
`updateWorldAppearance()` lerps the rest of the look between two presets. The
lensing that sells one sells the other, and nothing tuned on the wormhole can
reach the black hole.

The tunnel is a separate Three.js scene (`src/graphics/tunnel.js`), swapped in
behind the flash while the raymarcher is switched off entirely. That swap is
also where the frame budget for it comes from.

## Layout

| Path | What it is |
|---|---|
| `src/main.js` | The journey, the camera, the uniforms, the phase switching |
| `src/graphics/fragmentShader.glsl` | The raymarcher — geodesics, both worlds, the disk |
| `src/graphics/tunnel.js` | The passage, its own scene and shader |
| `src/graphics/planet.js` | A planet for the fall. Built, and currently switched off — see [`status.md`](status.md) |
| `src/story/` | Scroll-timed overlay text |
| `scripts/` | Generators for the procedural sky plates |

## Development

Three opt-in LAB views are available alongside the original journey:

- `/?world=free` — current foundation: a seeded 3D particle world, first-person
  mouse look and scroll travel along the viewing direction. Click to capture,
  Escape to release. See [the free-world notes](references/free-world-experiment.md).

- `/?world=guided` — scroll-driven reference timing: calm flight, acceleration,
  hyperspace, deceleration and galaxy arrival. See [the guided-world notes](references/guided-world-experiment.md).

- `/?journey=connected` — integration checkpoint: existing wormhole/tunnel handoff
  into the guided world. It is the place to continue shared-world lensing work;
  see [the connected-journey notes](references/connected-journey-experiment.md).

- `/?journey=galaxy` — current wormhole and tunnel → open-space arrival →
  hyperspace → portfolio-galaxy placeholder. See
  [the experiment notes](references/galaxy-journey-experiment.md).
- `/?flight=open` — compare independent camera movement with an orbit camera.
  See [the camera study](references/open-space-experiment.md).

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.
For phone access on the same network, use `npm.cmd run dev -- --host 0.0.0.0`
and open the Network URL Vite prints.

```bash
npm install
npm run dev
```

Create the original procedural space textures with:

```bash
node scripts/generate-star-noise.mjs
python scripts/generate_milkyway.py --output assets/milkyway-preview.jpg
```

The star field is meant to be re-run and looked at. `--help` lists every knob;
`--range` sets how far the brightest star is above the faintest, `--band` how
hard the stars crowd into the galactic plane, and `--clump` how much of the
field belongs to clusters rather than being scattered. It takes about a second.

## Licensing

This project contains GPL-derived black-hole rendering work and is distributed
under the **GNU General Public License, version 3 or any later version**. See
[`LICENSE`](LICENSE) for the full terms.

The project also uses and derives from third-party work under compatible open
source licenses. Copyright, attribution, asset provenance, and dependency
details are recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The generated Milky Way and star-data textures are original project assets
created by the scripts in `scripts/`; they are covered by the project's GPL
license and do not incorporate the former CC BY-NC Milky Way image.
