# Guided real-world journey — LAB 04

Open `/?world=guided`. Free flight remains at `/?world=free`.

Native document scroll drives a reversible path: calm flight, acceleration,
fast travel, deceleration, galaxy arrival. Integrated smooth velocity ramps
keep position and speed continuous. Scroll smoothing does not advance the
journey independently. Optional cursor look changes heading, not the route.

The existing bounded star field and user's 0.005 trail exposure are shared.
No separate hyperspace ribbons, sky plate or FOV animation are added. A seeded
14,000-point volumetric spiral sits at a fixed world position, 90 units beyond
the final camera position. The camera has a small lateral path offset for
perspective change. The galaxy is a layout placeholder, not portfolio content.

Gentle motion disables trails and optional look; it is selected initially for
reduced-motion preference. This remains a LAB prototype, not a complete site
accessibility or device-performance validation.

Checks: production build; guidedPath.test.mjs for continuity, monotonic travel,
reversibility and arrival clearance; check-guided-browser.mjs for native wheel,
arrival, reverse, bounded cells, portrait overflow and runtime errors. Existing
free-flight browser checks remain green.

The connected prototype is now LAB 05 at `/?journey=connected`; this standalone
route remains the reference for the guided timing and galaxy approach.
