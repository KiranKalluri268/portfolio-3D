# Wormhole to galaxy — LAB 02

Implemented 2026-09-09. Open `/?journey=galaxy` on the lab's Vite server.
The existing `/` journey and `/?flight=open` camera study remain available.
Nothing from this experiment is ported to `my-portfolio`.

## Accepted direction

The camera study established the direction: travel through world coordinates
with an independently controlled heading. The next decision is to visit separate
locations, with only one expensive environment rendering at a time.

The wormhole retains its current crossing, flash and bending tunnel. Hyperspace
is reserved for travel to and from the portfolio galaxy. There is a short calm
arrival in open space between emerging from the tunnel and accelerating again.
The galaxy is a destination of its own; the black hole is absent there.

This revises the older world plan's assumption that the portfolio lives in the
fall toward the black hole. A subsequent black-hole/contact destination remains
possible but is not part of this experiment. The existing site plan is not yet
rewritten or implemented in the main portfolio.

## Sequence

Viewport units continue to use the existing 28-viewport document and Lenis.

| Units | Stage | Renderer |
|---|---|---|
| 0–5 | Existing wormhole approach | Existing raymarcher |
| 5–6.5 | Existing flash and blackout | Existing raymarcher |
| 6.5–11.5 | Existing bending tunnel | Existing tunnel scene |
| 11.5–13 | Emerge into open space | Open-space scene |
| 13–15 | Calm flight with parallax | Open-space scene |
| 15–17 | Accelerate, stretch stars | Open-space scene plus streak geometry |
| 17–20 | Hyperspace | Hyperspace scene |
| 20–22 | Galaxy arrival and deceleration | Galaxy scene plus fading streak geometry |
| 22–27 | Slow approach to galaxy | Galaxy scene |

The new handovers have an opaque interval around 17 and 20 units. A single
RenderPass switches scene and camera beneath the light, using the existing bloom
and composer. No extra render targets or dual-destination crossfade are added.
The raymarcher and its particle targets are skipped after the tunnel. Assets and
geometry remain in memory so reverse scrolling can return without reloading.

The benchmark uses the wormhole opening in this route; benchmarking the old
black-hole fall would measure something the new route never renders. This is a
provisional budget choice and still needs reference-device measurement.

## Controls and visuals

- Scroll forward or backward; the new travel and streak positions derive from
  scroll, not elapsed time. The original wormhole/tunnel retain their idle motion.
- Stage buttons jump using the same Lenis scroll position.
- Look around turns the view in open space and at the galaxy. It eases back toward
  the travel direction during acceleration, then returns on arrival.
- Minimise the panel to inspect the frame; it expands again without losing state.
- Gentle transitions remove the new streaks and FOV expansion and use dark
  handovers. It defaults on with reduced-motion preference. This does not make
  the inherited wormhole/tunnel a complete reduced-motion experience.

The sky is direction-sampled. Nearby particles and landmarks have world-space
positions. The galaxy is a visual layout placeholder: five coloured arms, three
orbital traces and eleven anonymous bodies. Colours and positions are illustrative,
not a new source of portfolio facts or final project-to-role assignments.

Hyperspace uses 1,000 instanced soft-edged ribbons. The first version used native
WebGL lines, but browser screenshots showed stepped edges at the selected render
scale. Ribbons provide controlled width and a faded tail without another pass.

## Verification

- `npm.cmd run build` — passes, with the existing large-chunk warning.
- `node --test src/experiments/flightPath.test.mjs src/experiments/galaxyTimeline.test.mjs`
  — seven tests pass. Covers phase boundaries, opaque handovers, streak continuity,
  reverse scrubbing, camera look independence and camera-study clearance.
- `node scripts/check-galaxy-browser.mjs` — passes in installed headless Chrome.
  The checker uses Playwright already installed in the sibling portfolio. Set
  `PLAYWRIGHT_MODULE` to another installed module URL if necessary, and `LAB_URL`
  to the Vite address when its port differs from 5173.
- Browser tests observe actual WebGL draw submissions: the wormhole shader draws
  at entry and draws zero times in the tunnel, open space, hyperspace and galaxy.
  The tunnel draws in its stage and zero times in the three new destinations.
- Real wheel input crosses the galaxy handover forward and backward. All stage
  controls, look-around, panel collapse and reduced-motion default are checked.
- No browser runtime or shader errors. The original route does not load the
  galaxy experiment module.
- Desktop screenshots at 1440×900 and portrait screenshots at 430×932 were
  inspected. The portrait galaxy fits the frame and the controls do not overflow.
  Images are in ignored `screenshots/galaxy-journey/`.

These are local browser checks, not phone performance measurements. Before
porting, review the complete motion on the Realme and iPhone, tune the arrival
and acceleration pacing, and measure each stage and seam at the same tier and
power conditions. Final galaxy content layout and a further destination remain
separate work.
