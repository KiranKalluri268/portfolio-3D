# Continuation handoff

## Latest checkpoint (2026-09-16)

`/?journey=connected` now uses the LAB 07 textured, animated wormhole and LAB 06
live-world black hole around the existing tunnel, upgraded galaxy and second
hyperspace leg. See the first section of `connected-journey-experiment.md`.
The older replacement-not-yet-ported notes below are historical: the lab route
is now integrated; `my-portfolio` remains untouched.

Updated 2026-09-10. This is the short resume point for the next session.

## Current decision

### New active checkpoint: LAB 06 (2026-09-10)

Open `/?world=blackhole`. The flat sphere/ring baseline has now been replaced.
`worldBlackHole.js` mounts a bounded curved-ray shader (`worldBlackHole.glsl`)
inside the actual free-world scene. It restores the enlarged shadow, wrapped
disk images, disk Doppler brightness and HDR bloom, borrowing the reference
acceleration and disk texture formula without its surrounding sky. The live
camera, floating origin and stars continue throughout. Only the disk image loads.

`starLensing.glsl` transforms each actual resident star using a finite-distance
point-mass lens approximation. Foreground stars are unshifted; background sources
can produce primary and secondary images, including off-screen sources. Both
current and previous lensed positions feed the accepted motion trails. The
36,000 source stars remain bounded to 125 cells (up to two image instances each).
Use the Star lensing checkbox to compare at a fixed camera position.

Verification passes: build, original free/guided browser checks,
`node scripts/check-world-blackhole-browser.mjs` (real movement, reverse, origin
shifts, portrait, no replacement sky, actual star-pixel change on toggling), and
`node scripts/check-star-lensing-browser.mjs` (executes the shared GLSL on the GPU
with known sources to check foreground, image branches, off-screen sources and
origin invariance). Screenshots: `screenshots/world-blackhole/`.

Limits: stars use a thin-lens approximation, not the disk's full curved-ray
solver; exact strong-field star images/Einstein arcs are not simulated. Disk
integration is bounded to 18 horizon radii, and occlusion uses ray-path distance
as a depth approximation. Physical-phone performance is not yet measured.
The point-mass equation follows the distance-dependent formulation in
[Bovy's lensing chapter](https://galaxiesbook.org/chapters/III-04.-Gravitational-Lensing_1-The-lensing-equation.html).

Next: review LAB 06 movement/appearance, integrate the wormhole into the same
live-world architecture, then reconnect the journey. Do not describe the older
connected route's separate particle targets as the same live world. It remains
an unchanged reference; LAB 06 is the replacement integration, not yet ported.

The final cinematic world is one seeded, effectively infinite 3D star field.
The same world exists before, during and after destinations. Wormhole and black
hole code is used only for the distinctive gravitational shader: horizon,
distortion, accretion disk and fall. Their old surrounding star/galaxy textures
are not part of the new world.

Target sequence:

`shared stars → wormhole → existing tunnel → shared-space flight → hyperspace →
galaxy fly-through → hyperspace → black-hole approach/fall`

## What is complete

- LAB 03 `/?world=free`: seeded 48-unit cells, 288 stars/cell, 125-cell
  residency, pointer-lock look, scroll travel along heading, 1×/5×/10×/20×/50×.
- Star variation: about 12% larger stars, stable positions/colours/sizes.
- Motion trails: derived from actual projected star movement; current accepted
  exposure is `0.005` in `src/experiments/freeWorld.js`.
- LAB 04 `/?world=guided`: reversible scroll path with extended normal flight,
  acceleration, hyperspace, deceleration and placeholder galaxy.
- LAB 05 `/?journey=connected`: existing wormhole and tunnel hand off to the
  guided world. Scene isolation and reverse handover are browser-tested.
- Tests/scripts: `check-free-world-browser.mjs`, `check-guided-browser.mjs`,
  `check-connected-browser.mjs`; production build is green.

## Important incomplete state

The wormhole integration checkpoint is now working in LAB 05: its bent-ray and
background branches sample the same seeded particle target as ordinary flight.
The connected route no longer requests the old star/Milky Way images. Do not
port it to `my-portfolio` yet. The tunnel now uses a generated seeded-star
texture and the black hole samples a particle render target; these are LAB
approximations, not yet a verified all-direction bent-ray world lookup.

### Galaxy → black-hole fix (2026-09-10)

The second leg no longer replays the first camera path backward. It continues
through the galaxy, accelerates using the accepted projected-motion star trails,
cruises, then decelerates. No separate fake streak mesh is used. At scroll unit
37 the black hole starts at its distant pose; units 37–47 drive the approach/fall.
A short opaque flash covers the renderer handoff in both scroll directions.

`src/experiments/galaxyDeparture.mjs` owns the continuous departure distance and
fall mapping. Its unit tests cover continuity, speed and fall limits. The
connected browser check now uses actual wheel input to verify galaxy clearance,
second-leg displacement, reverse retracing, seam coverage and distant-to-close
fall. See `screenshots/connected/second-leg-moving.png` and
`screenshots/connected/black-hole-arrival.png`. Subjective pacing awaits review.

## Next implementation order

1. ~~Convert the tunnel's legacy texture inputs to the shared-world treatment.~~
   **Done for LAB 05:** connected mode generates the tunnel texture from the
   same seeded cells; the old star/Milky Way files are not requested.
2. **Review the repaired black-hole leg:** tune galaxy clearance, second-flight
   pacing and the arrival flash after user review. Preserve the accepted trails.
3. Re-run all browser checks, add explicit no-legacy-texture and shared-signal
   assertions, then tune seams before considering a port to `my-portfolio`.

## Useful commands

```powershell
npm.cmd run dev -- --host 0.0.0.0 --port 5174
npm.cmd run build
node --test src/experiments/worldModel.test.mjs src/experiments/guidedPath.test.mjs src/experiments/galaxyDeparture.test.mjs
node scripts/check-free-world-browser.mjs
node scripts/check-guided-browser.mjs
node scripts/check-connected-browser.mjs
```

The running previews are `/?world=free`, `/?world=guided` and
`/?journey=connected`. All work belongs in `portfolio3D`; `my-portfolio` has
not been changed for this LAB direction.

The latest successful visual checkpoint is
`screenshots/connected/wormhole-near.png`: the seeded world is visibly bent
around the wormhole. Production build, connected browser QA and free-world
browser QA were last verified together.
