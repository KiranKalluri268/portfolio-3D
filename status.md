# Status

Running notes on work that is parked mid-flight. Anything here is unfinished by
choice, not forgotten — each section records where it was left, why, and what
has to be decided before it can be picked up again.

The journey itself is done: the crossing, the flash into the passage, the
passage, and the fall all read the way they are meant to. Two things below are
parked, and neither blocks anything.

---

## The wormhole-to-tunnel handover — flash, not a cross-fade

**State:** shipped and good. Parked only in the sense that the more exact
version of it was considered and deliberately not built.

The seam is covered by overexposing the frame into a burst of light which then
burns down to black; the scene swap happens under the black. Three pieces:
the `exposure` uniform driving the whole render up, the bloom threshold dropping
through the crossing to let that spread, and the DOM veil in
`updateTransitionVeil()`. All three are needed — the veil alone is a white
rectangle appearing in front of the scene, which goes bright without anything
having got brighter.

**The alternative, if the flash ever stops being enough:** render both the
raymarcher and the tunnel for the few frames of the overlap and cross-fade
between them. Exact, and expensive at the worst possible moment — the throat
fills the screen right where the second scene would start rendering. It needs a
render target and a compositing step that neither scene has today. The framing
and colour work it depends on is already in place, so it can be built on top
rather than instead.

---

## The planet — unmounted

**State:** built, working, and switched off. `PLANET_ENABLED` in `src/main.js`
is `false`. Nothing is deleted and nothing is unwired: the target is simply
never created, never drawn, and `planet_amount` stays at 0 so the shader's
planet block never runs. Setting the flag back to `true` restores it exactly as
it was at `9c9aead`.

**Why it is off:** the geometry is solved and the compositing works, but the
last two passes traded away two things that have not been looked at in the
running app. Both are described under *Open questions* below. It was parked to
be picked up with time to iterate visually rather than to be left half-tuned in
a shipped build.

### What it is

A procedural planet orbiting the black hole, visible through the final fall
(`arrivalEnd` → `approachEnd`). It is a mesh in its own scene, rendered to its
own `WebGLRenderTarget`, and sampled back by the raymarcher rather than being
drawn into the main scene — the raymarcher owns every pixel, so anything sharing
the frame with it has to be composited this way. Same trick the star field uses.

Two things separate it from the star field:

- Stars are emitters and composite additively. A planet has a night side, so its
  target is composited **alpha-over**, cleared transparent, with the material
  writing opaque alpha.
- It is composited **before** the disk and the star field, so both add over it.

Files: `src/graphics/planet.js` (all of it), the planet block in
`src/graphics/fragmentShader.glsl`, and the `PLANET_ENABLED` wiring in
`src/main.js`.

### How it is placed

This is the part that took the longest and is worth not re-deriving.

The planet is **anchored once**, on the first frame of the fall, and then left
alone in world space. Everything it appears to do afterwards — drawing away from
the black hole, growing, sliding as the camera's elevation drops — is the camera
moving against a body that is not moving.

That matters because the earlier version authored its **screen position** as a
curve in scroll progress. It had no parallax at all: drag the view or let the
idle spin drift, and the star field and the lensing moved while the planet sat
exactly where it was. That single missing cue is what made it read as a decal
composited over the scene rather than an object inside it, and no amount of
tuning the curve fixes it, because the curve is the problem.

Two things in the camera had to give way for a fixed point to stay framed, both
in `src/main.js`:

- The **idle orbit** (`BASE_ORBIT_SPEED`, 0.05 rad/s ≈ 3°/s) now damps to zero
  across the fall. Left running, it carries a world-fixed planet out of the shot
  inside a minute for anyone who parks on the last frame.
- The camera's **elevation swing** across the fall was cut from 55° to 9°
  (`startElev` 60° → 14°). A world-fixed body swings further from the camera
  rotating than it ever does from the camera approaching, and inward, which is
  backwards — the rotation was burying the parallax the approach was meant to
  produce.

The anchor is dropped whenever the fall is left (scrolled back into the tunnel)
so returning re-frames against wherever the azimuth has drifted to. It is
deliberately **not** dropped on resize: holding through one is the honest
behaviour for a body that is actually out there, and re-aiming on every resize
event would make it jump around on mobile, where hiding and showing the address
bar fires them continuously.

### The projection bug that was fixed along the way

The planet's camera ran a **45° FOV against the raymarcher's 90°**, and did not
apply the shader's off-centre `COMPOSE_SHIFT`. Because the planet is composited
by screen coordinate, that meant a world direction landed at *half* the screen
offset it should, horizontally displaced from where the shader would draw it.

Invisible while the screen position was hand-authored — the numbers were tuned
against the output rather than against correctness — but decisive once the
planet became a fixed world point. `applyProjection()` in `planet.js` now derives
the frustum from the shader's own ray construction. Verified: the world origin
projects to NDC `(0.50, 0.00)`, exactly where the shader composes the black hole.

**If anything else is ever composited into this scene from a separate camera, it
has to do the same thing.** The particle layers get away without the shift only
because their cameras are centred, which is why they sample nothing across the
left quarter of the frame — stars survive that, a planet would be sliced down a
hard vertical edge.

### The geometry, so it does not have to be re-derived

Let `R` = `ORBIT_RADIUS`, `f` = the anchor's total angular offset, `d` = camera
distance. The angular separation the camera sees is:

```
separation = atan( R·sin(f) / (d + R·cos(f)) )
```

Consequences, all of which cost a pass each to discover:

- **Far out**, `d` dominates the denominator, so `R` scales the separation almost
  linearly. `R` owns the first half of the fall.
- **Close in**, `d` drops out and the separation tends toward `f` regardless of
  `R`. The last frame is governed by the anchor angles alone.
- **In shadow radii at the arrival**, the separation is ≈ `R·sin(f) / 2.6` — the
  impact parameter over the shadow's world radius. The camera distance cancels
  entirely, which is why reducing `arriveDist` did **not** bring the planet
  closer to the black hole (measured: 42 → 18 moved it 2.70 R → 2.31 R).
- Only the **total** offset has to clear the shadow, so the elevation/azimuth
  split is free — and it is spent against whichever frame axis has room. A wide
  viewport has width and no height, so the offset goes sideways and the planet
  rides low. A phone is the reverse. Hence `NARROW_AZIMUTH_GIVE` /
  `NARROW_ELEVATION_GAIN`.

### Bent-ray sampling

The planet used to be sampled at `gl_FragCoord` — straight down the unbent ray.
That is why it had to stay angularly clear of the shadow for the whole fall: a
straight ray aimed behind the black hole terminates at the horizon and never
reaches the compositing block, so the planet would not be occluded so much as
deleted. That clearance was a hard floor on how near the black hole it could be
placed.

It is now sampled along the **bent** ray, like the star field. Rays that pass
close curve around the black hole rather than ending on it, so they find the
planet even when it is geometrically behind. Near the rim the image is pushed
outward and drawn into an arc; directly behind, it wraps the photon ring instead
of vanishing.

This was tried and backed out once before, when the second lensed image read as
a detached sliver and the sphere visibly warped — but that was at roughly three
times the current planet size and five times the current orbit radius.
**Whether it holds up at the current scale is untested in the running app.**

### Current values

All in `src/graphics/planet.js` unless noted.

| Constant | Value | Note |
|---|---|---|
| `ORBIT_RADIUS` | 12.0 | Floor ≈ 8: the accretion disk stops at r = 6 and the camera's closest approach is 5.1 |
| `ANCHOR_AZIMUTH_OFFSET` | 17.0° | From the anti-camera direction |
| `ANCHOR_ELEVATION` | 5.4° | Absolute, from the disk plane |
| `NARROW_AZIMUTH_GIVE` | 3.6° | Given back as the viewport narrows |
| `NARROW_ELEVATION_GAIN` | 5.4° | Taken in exchange |
| `PLANET_RADIUS` | 0.26 | World units; apparent size is this over the real distance |
| `arriveDist` (`main.js`) | 30.0 | Was 42; ceiling is ~43 before the raymarcher's step budget breaks the ring on `low` |
| `startElev` (`main.js`) | 14° | Was 60° |

Measured at `9c9aead` on a 1888×820 frame, separation as a multiple of the
shadow radius:

| | arrival | mid | end |
|---|---|---|---|
| 1888×820 | 1.16 R | 0.86 R | 0.42 R |
| 1440×900 | 1.16 R | 0.86 R | 0.42 R |
| 390×844 | 1.26 R | 0.94 R | 0.54 R |

### Open questions — what to look at first

1. **The planet grazes the accretion disk.** `ANCHOR_ELEVATION` is 5.4° against a
   camera running 14° → 5°, so it is close to edge-on with the disk for the whole
   fall and passes near the near-side arc rather than reading against open sky.
   It is outside the disk at all only because the disk stops at r = 6 and the
   orbit is at 12. This was the known cost of halving the separation while
   keeping the bearing — scaling both angles was the only way to do that. If it
   reads as buried in the glow, raise elevation and cut azimuth to compensate,
   which shifts the bearing slightly.

2. **The end of the fall is governed by the photon ring, not by the anchor.** At
   0.42 of the shadow radius the planet is well inside it geometrically. It will
   not appear there — lensing displaces images outward, and an object that far
   behind the rim comes back out pinned to the ring. So the last stretch
   converges on the ring wherever the planet is anchored, and asking for
   "closer" again will not move that frame. Whether that reads as the planet
   being caught on the ring (correct, and what the reference frame shows) or as a
   smear is the open question, and it is the regime the earlier lensing attempt
   was rejected in.

3. **Portrait is untested on hardware.** All the portrait numbers here are
   computed, not observed. It is also the case where the earlier lensing attempt
   was reported worst.

### Fallback positions

If the lensing does not hold up, revert `52dc0a4` and `9c9aead` and set
`ANCHOR_AZIMUTH_OFFSET` to 44°. That is the nearest placement that stands up
**without** lensing, at 1.10 R at the end — clear of the shadow by geometry
alone.

Known-good waypoints, newest first:

| Commit | What it is |
|---|---|
| `9c9aead` | Current. Separation halved; grazes the disk |
| `52dc0a4` | Lensing spent on proximity; 0.94 R at the end |
| `da35be6` | Bent-ray sampling, no placement change — comparable frame-for-frame against the old sampling |
| `aba7b04` | Last version with comfortable clearance on every viewport, straight-ray sampling |
| `8092fe4` | Where the projection was fixed. Anything before this has the 45°/90° mismatch |

### Reference

The target frame is the Interstellar Gargantua still in `public/goal/last_frame.jpg`: planet
small, dark, up and to the left, just outside the glow of the near-side arc.
Note that the film still's own black hole is smaller in frame than ours at the
end of the fall, so its planet sits ~3 shadow radii out where ours is inside 1 —
the still is a guide to the *look*, not a target for the numbers.

---

## The tiers, measured on real phones

**State:** measured, and two of the three problems it turned up are fixed on this
branch. The third is written down here and deliberately not built.

Held each tier still with the preset lock and read the FPS counter. Two devices:

| | Realme 9 Speed Edition | iPhone 16 Pro |
|---|---|---|
| low | 50-75 fps | — |
| medium | 15-20 fps | — |
| high | 5-10 fps | 40-60 fps, smooth |
| high, inside the tunnel | 75 fps | — |

### What that says

**The Realme falls off a cliff, not a slope.** The presets are pure resolution
ladders — `low/medium/high` differ in `resolution` and `maxPixelRatio` and in
nothing else — so cost should track the square of the effective pixel ratio.
At that device's DPR the rungs are 1.0, 1.25 and 1.5, predicting medium at
~1.6x low and high at ~2.25x. Observed is a 3-5x collapse. Low is already
sitting at that GPU's limit and everything above it goes off a bandwidth or
occupancy edge rather than costing proportionally more.

So for that phone the ladder is not three rungs. Low is the only rung it has,
and medium at 15-20fps is not a fallback but a tier it cannot reach. That is
worth remembering before any future work tries to tune medium for mobile: on
this hardware there is nothing in between to tune.

**The manager's heavy line was set at 50fps and that is what took high off the
iPhone.** Any frame over 20ms scored heavy, six heavy frames inside 1.5s is a
downgrade, and at 40-60fps essentially every frame breached it. The tier was
working and the manager removed it. Moved to 25ms — 40fps — which is the honest
bar for a scroll-driven cinematic where the fall is supposed to be expensive.
Panic stayed at 50ms; that path behaved correctly throughout, dropping the
Realme off high at 5-10fps exactly as it should. The lesson is that strictness
was right on the protection path and wrong on the judgement path, and those two
had been sharing one set of numbers.

**The benchmark was measuring the opening.** Fixed here: it now parks the camera
at 0.85 of the approach and judges the device on the fall. See
`BENCHMARK_POSE_UNITS` in `src/main.js`.

**Moving the heavy line turned the medium probe into a loop, and that had to be
fixed in the same breath.** `healthyFrameMs` is not only the downgrade bar — it
also gates `trackUpgradeHeadroom`, which after 8s of unbroken healthy frames at
low fires a medium probe, on a path the benchmark never touches. The Realme runs
low at 50-75fps, or 13.3-20ms. Under the old 18ms bar every dip toward 50fps
scored not-healthy and reset the timer, so the probe almost never accumulated
its 8 seconds. Under 22ms every frame in that range qualifies and nothing resets
it, so it reaches the probe every time — and medium at 15-20fps fails instantly.

Simulated against the real class at that device's measured frame times, three
minutes of falling:

| | probes | failures |
|---|---|---|
| old 18/20 | 0 | 0 |
| new 22/25, no fix | **6** | 6 |
| new 22/25, with fix | 1 | 1 |

Six climbs and six collapses in three minutes, one every thirty seconds, each a
visible jump in quality and a visible drop. The fix is that a failed probe is
now remembered for the session rather than retried after a cooldown: the device
has rendered medium and could not hold it, and nothing about that changes while
the page is open.

A latent trap came out with it. `startMediumProbe()` silently refuses when the
tier is pinned or locked, and `onWarmupComplete` in `main.js` called it and
returned, waiting on `onMediumProbeComplete` to finish loading. A refusal that
went unnoticed left the visitor at 96% on a screen that never opened. Unreachable
before, because nothing could be pinned that early — but the session flag adds a
third way to refuse, so the probe now reports whether it started and the caller
settles when it did not.

### Parked: one tier cannot fit the whole journey

75fps in the tunnel and 5-10fps in the fall, same tier and same device. The
journey's own cost varies by roughly tenfold between its acts, which means there
is no single correct tier for it — one that survives the fall wastes the tunnel,
and one that suits the tunnel dies in the fall. Benchmarking the most expensive
moment, which is what this branch now does, buys correctness by giving up
everything the cheap acts could have had.

The fix would be a per-act budget, and there is a free place to change it: the
wormhole-to-tunnel handover is already covered by a flash that burns to black,
and a resolution change under that flash cannot be seen. The other seams are the
arrival veil and the blackout.

Not built, because it is a real feature rather than a tuning change and the two
fixes above should be measured on their own before something structural lands on
top of them. It is the next thing worth doing here.

### Still to check

The fixes above are reasoned from the numbers, not yet observed on either phone.
What the fixed benchmark should now do:

- **Realme** — starts at medium, the fall pose panics it within a frame or two,
  settles on low before the entry gate arms. It should never see medium again.
- **iPhone** — starts at medium, finds headroom at the fall pose, upgrades to
  high, and *stays* there through the fall instead of walking down to low.

If the Realme lands anywhere but low, or the iPhone still walks down, the
numbers above are the place to start.
