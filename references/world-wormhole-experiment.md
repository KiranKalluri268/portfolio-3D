# Live-world wormhole — LAB 07

Open `/?world=wormhole`. Uses the same resident stars, floating origin,
movement controls and finite-distance exterior star lensing as LAB 06.

The throat samples the original destination sky: encoded stars from
`star_noise-generated.png` and `milkyway-preview.jpg`. The September 17 revision
uses neutral grading, star gain 0.12 and nebula gain 1.0. The extra warm floor
and procedural galaxy band have been removed so the image's clouds and dust
lanes define the interior. The integrated ray direction, logarithmic bend
compression and axis twist drive the transmitted view, preserving the strong
stretching and winding through the throat. A simpler angular portal mapping
was removed because it flattened the distortion into a plain window.
The curved-ray integrator also defines the throat boundary. Escaped rays near the mouth
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
bounded curved-ray integrator with artistic bend compression and twist
for the transmitted view. The standalone camera can pass the mouth but does
not teleport. Both `/` and `/?world=wormhole` use this shared destination shader;
the connected journey transitions into its existing tunnel.

Check: `node scripts/check-world-wormhole-browser.mjs`.
