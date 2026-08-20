# Portfolio 3D

The animated background for the portfolio: one continuous point-of-view flight,
driven entirely by scroll position. Every value on the journey is a pure
function of how far down the page you are, so scrubbing backwards retraces it
exactly.

## The journey

Four acts, laid out in `JOURNEY` in `src/main.js` in viewport units of scroll.

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

```bash
npm install
npm run dev
```

Create the original procedural space textures with:

```bash
python scripts/generate_milkyway.py --output assets/milkyway-preview.jpg
python scripts/generate_star_noise.py
```

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
