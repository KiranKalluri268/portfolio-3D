# Open-space camera experiment

Added 2026-09-09. Lab only; nothing has been ported to `my-portfolio`.

Run `npm.cmd run dev -- --host 0.0.0.0` on Windows, then open
`http://localhost:5173/?flight=open` (use the port Vite prints).
Without `flight=open`, the original full journey remains available.

## What to compare

The experiment isolates the final approach. Scroll from departure to approach;
use **Open flight** and **Orbit camera** to compare at the same scroll position.
Both use the same seeded scenery, 58-degree vertical FOV, centred projection,
lighting, sky textures, and distance from the black hole. The orbit comparison
is a deterministic subject-facing path, not an exact replay of the original
time-driven orbit. **Original journey** opens that existing experience.

**Look around** turns the view through a full 360 degrees without changing the
camera position. **Look ahead** resets it. Landmark and dust switches allow the
depth cues to be isolated. Scroll still has one owner: Lenis.

The free camera moves along world coordinates and controls its heading
independently. Four stationary foreground bodies and a seeded three-dimensional
dust volume provide parallax. The far sky stays direction-sampled at infinity.
The dust fades with distance before the bounds of its finite volume can be seen;
there is no camera-parented sphere. This is enough for the authored path, not an
implementation of an endlessly traversable universe.

## Rendering boundaries

The GLSL's `OPEN_SPACE_EXPERIMENT` define centres the projection only in this
mode. Default shader compilation retains both original composition shifts.
The experiment dynamically loads its own module and styles and adds one raster
pass before the existing bloom. It creates no additional render targets.

Landmarks have ordinary mesh lighting and depth among themselves. They are
foreground depth references, not the future project-body system: they are not
gravitationally lensed and do not share raymarched disk/horizon depth. Unusual
views can therefore expose compositing inaccuracies. Dust is also unlensed.
Do not port this prototype as a finished multi-body renderer.

## Validation

- `npm.cmd run build` passed (existing large-chunk warning).
- `node --test src/experiments/flightPath.test.mjs` checks look independence,
  reverse scrubbing, fair lens/distance comparison, and path clearance.
- Desktop visual verification was blocked: Computer Use could not determine
  the current browser URL reliably enough to proceed. No screenshots or
  real-device performance approval are claimed.

Next: judge the movement and depth on desktop and portrait, then resolve
compositing and measure cost before extending the experiment to the wormhole
crossing or porting anything into the portfolio.
