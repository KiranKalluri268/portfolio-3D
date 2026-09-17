# Connected journey — LAB 05 (integration checkpoint)

## Live-world destination integration — 2026-09-16

The opening now mounts `worldWormhole.js` in the same resident world used by
the galaxy flight. This includes the accepted textured interior, brighter
curved sky halo and 0.05 rad/s optical drift. The galaxy is hidden until after
the tunnel. The original crossing veil and tunnel timing remain in use.

After unit 37, `worldBlackHole.js` replaces the legacy fullscreen destination.
Its position is fixed 40 units beyond the second flight's endpoint; the camera
continues toward it through unit 47. Both destinations use the resident stars'
lensing and floating origin. Only the active destination mesh is visible.
Trail history resets when changing destinations. The black hole uses its HDR
bloom pass; the wormhole uses the standalone study's direct rendering.

The old no-sky-texture assertion is superseded: textures are intentional in
the wormhole throat and localized halo. The black hole and ordinary flight
still use the live stars. The tests now distinguish both destination shaders
from the legacy renderer and verify that only the active destination draws.

Everything below describes the earlier integration checkpoint where it differs
from this update. Nothing has been ported to `my-portfolio`.

## Live-world destination integration (2026-09-16)

### Curved approach and lit tunnel blend (2026-09-17)

Latest timing: the blend runs at units 6.2-7.2 (0.7 viewports later). Earlier
5.5-6.5 timings below are superseded. The connected tunnel starts at radius 2
and FOV 70 to match the wormhole mouth and camera, then flares to radius 4.8
and FOV 78. Entry drift and roll ease in after the handoff begins. Geometry
and projection are matched as a starting point; appearance awaits user review.

The throat now begins an inward funnel deformation at unit 4.7, ahead of the
5.5-6.5 tunnel crossfade. Its destination image stretches toward a slightly
bent vanishing point, with a gentle depth gradient. The shader deformation is
scroll-driven and reverses with the approach; standalone wormholes default to
zero deformation. This is an optical morph, not a change to world geometry.

Opening framing now places the mouth at roughly 73% of viewport width and 29%
of viewport height, matching the supplied reference. A broader sideways arc
and gradual centering make the turn visible. The tunnel uses its original
encoded star and Milky Way textures again, with radius 4.8 (diameter 9.6),
50% wider than the old route's radius 3.2. The fully lit entry blend remains.

The opening now starts about 145 world units from the mouth and follows a cubic
curve, aimed toward the wormhole. The integrated speed profile accelerates
gently then brakes near entry; the camera ends 0.9 units from the center.
`wormholeApproach.mjs` owns the reversible position, heading and blend timing.

Units 5.5-6.5 crossfade the live wormhole render into the fully revealed tunnel.
Both scenes render only during that overlap. The tunnel progresses from unit
5.5 to its existing exit at 11.5. The opening flash, black veil and blackout
message are disabled for the connected route. The exit veil remains in use.
The original `?world=old` transition remains available unchanged.

Build and path tests pass; browser appearance awaits user review.

### Curved approach and lit tunnel blend (2026-09-17)

The opening now starts about 145 world units from the mouth and follows a cubic
curve, aimed toward the wormhole. The integrated speed profile accelerates
gently then brakes near entry; the camera ends 0.9 units from the center.
`wormholeApproach.mjs` owns the reversible position, heading and blend timing.

Units 5.5-6.5 crossfade the live wormhole render into the fully revealed tunnel.
Both scenes render only during that overlap. The tunnel progresses from unit
5.5 to its existing exit at 11.5. The opening flash, black veil and blackout
message are disabled for the connected route. The exit veil remains in use.
The original `?world=old` transition remains available unchanged.

Build and path tests pass; browser appearance awaits user review.

Open `/` for this journey. `/?journey=connected` remains an alias, and the
original cinematic reference has moved to `/?world=old`.

The opening now mounts `worldWormhole.js` in the resident world used by the
galaxy flight: textured interior, brighter curved sky halo and 0.05 rad/s
optical drift. The galaxy stays hidden until after the tunnel. The original
crossing veil and tunnel timing remain in use.

After unit 37, `worldBlackHole.js` replaces the legacy fullscreen destination.
Its position is fixed 40 units beyond the second flight's endpoint; the camera
continues toward it through unit 47. Both destinations use resident-star
lensing and the floating origin. Only the active destination mesh is visible.
Trail history resets on destination changes. The black hole uses its HDR bloom
pass; the wormhole retains the standalone study's direct rendering.

Sky textures are now intentional in the wormhole throat and localized halo.
The black hole and ordinary flight use the live stars. Browser checks distinguish
both destination shaders from the legacy renderer and check draw isolation.

The older checkpoint notes below are historical where they differ from this
update. Nothing has been ported to `my-portfolio`.

## Live-world destination integration (2026-09-16)

The opening now mounts `worldWormhole.js` in the resident world used by the
galaxy flight: textured interior, brighter curved sky halo and 0.05 rad/s
optical drift. The galaxy stays hidden until after the tunnel. The original
crossing veil and tunnel timing remain in use.

After unit 37, `worldBlackHole.js` replaces the legacy fullscreen destination.
Its position is fixed 40 units beyond the second flight's endpoint; the camera
continues toward it through unit 47. Both destinations use resident-star
lensing and the floating origin. Only the active destination mesh is visible.
Trail history resets on destination changes. The black hole uses its HDR bloom
pass; the wormhole retains the standalone study's direct rendering.

Sky textures are now intentional in the wormhole throat and localized halo.
The black hole and ordinary flight use the live stars. Browser checks distinguish
both destination shaders from the legacy renderer and check draw isolation.

The older checkpoint notes below are historical where they differ from this
update. Nothing has been ported to `my-portfolio`.

Open `/?journey=connected`. The free and guided reference routes remain intact.

Sequence in viewport scroll units:

- 0–5: original wormhole approach.
- 5–6.5: original crossing flash and blackout.
- 6.5–11.5: existing bending tunnel.
- 11.5–31: accepted guided star world, including the doubled calm stretches.
- 31–33: forward galaxy fly-through.
- 33–34: acceleration toward the black hole.
- 34–35.4: second hyperspace cruise using actual star-motion trails.
- 35.4–37: deceleration toward the black-hole handoff.
- 37–47: black-hole raymarcher, approaching from its distant pose into the fall.

The second leg uses the continuous distance curve in `galaxyDeparture.mjs`,
starting exactly where the first guided path ends. It does not replay that path
or add a camera-space streak layer. The outgoing flash ramps over 36.35–37;
the incoming flash clears over 37–37.65. Black-hole camera progress is remapped
from 37–47 instead of passing these raw scroll units into an already-ended fall.

The tunnel's original white exit veil covers the scene switch at 11.5 and
reveals the star field over 0.65 viewport units. Reverse scrolling restores
the tunnel beneath the same opaque boundary. Star trails reset on re-entry
to avoid connecting camera history across scenes.

One renderer and the existing Lenis scroll owner drive the connected route.
The wormhole and tunnel use the existing composer. In open space the
shared free-world renderer is called directly, retaining its tuned 0.005
trail exposure without adding the older journey's bloom or fake streaks.
From the deceleration (unit 28) onward the same scene goes through the
composer so the galaxy blooms; gentle mode stays on the direct path.

The galaxy (`galaxyModel.mjs`) is procedural world-space geometry: an
exponential disk with logarithmic arms, a flattened bulge, a sparse halo,
HII knots and dust along the inner arm edges. Its stars share the world's
instanced trail material (own far fade and pixel floor), so the fly-through
streaks them like resident stars; soft additive haze sprites stand in for
unresolved starlight and fade out as the camera closes in.
The world module is now a factory, allowing this host to update it without
a second animation loop, renderer or scroll smoother.

Geometry remains allocated for reverse travel, but only the active scene
renders. The black-hole destination is connected; real portfolio content is not.
Gentle mode applies to the new world, not the inherited wormhole/tunnel.

## Current architectural decision

This route is being redesigned around one shared world: the seeded, bounded
resident chunk field from LAB 03 is the only universe. The wormhole and black
hole borrow their existing raymarching shaders only for their characteristic
distortion, horizon and disk appearance. They must not recreate a surrounding
star shell, Milky Way plate, sky texture or separate galaxy texture.

The next implementation must feed the shared world into the raymarcher's
bent-ray lookup. A screen-space star overlay behind the shader is not enough:
the stars need to bend with the wormhole/black-hole ray while remaining the same
seeded positions used during ordinary flight.

The wormhole integration now uses the shared particle render target along its
bent rays. The same seeded stars are visible outside the throat and stretch into
the wormhole distortion. The connected route no longer requests
`star_noise-generated.png` or `milkyway-preview.jpg`. The tunnel now receives a
generated seeded-star texture. The current particle target and generated texture
are integration approximations; all-direction world-consistent lensing remains
to be validated separately from the repaired camera journey.

## Handoff: do next

1. ~~Extract the shared star-world representation into the raymarcher's particle
   targets.~~ **Done:** `createParticleSystem()` now uses the deterministic
   125-cell field from `worldModel.mjs` rather than a radial shell.
2. ~~Add a wormhole-only bent-world lookup in the shader.~~ **Done:** the throat
   and background branches sample the shared particle target along the bent ray.
3. ~~Convert the tunnel's legacy texture inputs to the shared-world treatment.~~
   **Done for LAB 05:** connected mode generates an equirectangular texture from
   the same seeded cells and supplies it to the tunnel's wall/exit shader. The
   tunnel's warm geometry lighting remains; its star signal no longer comes from
   the old image assets. Keep the accretion-disk texture only where the
   black-hole shader actually needs it; it is not a world-generation asset.
4. **In progress:** the connected route now hands back to the existing
   black-hole raymarcher after the galaxy/second-hyperspace handoff. The disk,
   horizon and fall are retained, while the background samples the shared
   particle target. Fly-through pacing and the black-hole approach still need
   visual tuning. Only one expensive raymarch destination renders at a time.
5. Replace placeholder galaxy geometry with real portfolio content anchors only
   after the shared-world handover and black-hole pass are visually stable.

Do not port this into `my-portfolio` yet. Do not change the accepted free-world
trail exposure or movement controls while solving the lensing integration.

Verification: build, free-flight and guided browser regression checks, plus
`node scripts/check-connected-browser.mjs`. The connected check exercises
the entry gate, all stage controls, reverse navigation, genuine wheel input
across the seam, runtime/shader errors and actual WebGL draw isolation.
It also asserts forward galaxy clearance, second-leg camera displacement,
reverse retracing, an opaque black-hole seam and a distant-to-close fall.
Screenshots are in `screenshots/connected/`. Physical-phone performance and
subjective seam pacing still need review before porting to the main portfolio.

The connected browser check now proves scene isolation, reversible handoffs,
absence of legacy sky-image requests, and runtime/shader cleanliness. It does
not yet prove black-hole shared-world sampling; add that assertion with the
black-hole leg.
