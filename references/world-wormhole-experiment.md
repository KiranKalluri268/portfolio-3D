# Live-world wormhole — LAB 07

Open `/?world=wormhole`. Uses the same resident stars, floating origin,
movement controls and finite-distance exterior star lensing as LAB 06.

The throat alone samples the original `/` destination sky: encoded stars from
`star_noise-generated.png`, `milkyway-preview.jpg`, and the procedural galaxy
band. The original throat rotation, tint, gains, blur, bend compression and
twist are reproduced in `worldWormhole.glsl`. Escaped rays near the mouth now
sample the original exterior star/nebula sky along the curved ray. This halo
fades between impact parameters 4.5 and 8 throat radii; beyond it rays discard
and expose the live world. The halo writes far depth so resident stars keep
their existing depth and thin-lens mapping. The comparison checkbox disables
both exterior star lensing and this halo, leaving the throat unchanged.
There is no accretion disk.

The halo uses nebula gain 0.8 and star gain 1.8 for visibility. The optical sky
drifts at 0.05 radians/second, matching the original idle orbit's pace without
moving the free-flight camera. Reduced-motion preference stops this drift.

This replaces LAB 07's first resident-star cubemap prototype. The far side is
intentionally a different sky, as requested, and no longer requires six scene
captures. Its textures are disposed with the destination.

Limits: the far-side sky is a distant angular image, not a nearby 3D destination.
The halo is a localized textured-sky approximation, not a curved-ray lookup of
the resident stars. The exterior stars use the LAB 06 thin-lens approximation; the throat uses the
bounded curved-ray integrator. The camera can pass the mouth but does not yet
transition into the tunnel or teleport. The connected journey is unchanged.

Check: `node scripts/check-world-wormhole-browser.mjs`.
