# Free world — LAB 03

2026-09-10. Open `/?world=free` on the running lab server.

This is the current foundation experiment: fixed random particles throughout
three-dimensional space, first-person mouse look, and scroll movement along the
current heading. There is no sky plate, orbit target, hyperspace overlay or
automatic camera path. The earlier camera and journey studies remain accessible.

## Controls

- Click **Enter world** or the canvas to capture the pointer. Mouse movement
  changes yaw and pitch continuously without hitting the viewport edges.
- Scroll down to travel forward along the direction you face; scroll up to
  travel backward. Turning upward or downward changes the travel direction too.
- Escape releases the pointer and stops pending travel. Controls reappear.
- Select **1×**, **5×**, **10×**, **20×** or **50×**, adjust sensitivity, or return to the origin before
  entering again. Speed multiplies camera distance per wheel input.

This desktop mouse-and-wheel study uses browser pointer lock. It does not add
WASD, mobile gestures, roll, or collision. Pitch is limited just below vertical,
as in first-person mouse controls; horizontal turning is unrestricted.

## World and rendering

`worldModel.mjs` seeds each 48-unit cell by its signed coordinates. Each cell
contains 288 fixed stars at uniformly distributed local positions. The nearby
5×5×5 cells are loaded: 125 cells and 36,000 stars, regardless of travel distance.
About 12% of stars have a larger diameter (1.6–2.4× the original size); the rest
vary gently between 0.9–1.2×. Sizes are seeded, just like positions and colours.
Returning to a discarded cell regenerates the same positions and colours.

Visibility fades between 64.8 and 90 units. Cells outside that loaded region are
disposed, and Three.js frustum-culls cells outside the view. Loaded stars are
not all drawn. The field has no radial shell or inner void. A common floating
origin keeps GPU coordinates small while preserving absolute world positions.

Wheel input is normalised for pixel, line and page events, then smoothed briefly
over frames. Movement uses the facing direction on each frame, so looking while
travelling steers the camera. Looking while stopped does not translate it.

Stars are rendered as camera-facing ribbons rather than only points. A star's
trail is derived from its real projected displacement between frames; larger
stars and faster travel produce more length and glow. The current LAB tuning
uses a low shutter exposure (`0.005` in `freeWorld.js`) and a motion threshold,
so ordinary mouse movement remains mostly point-like.

The new `src/entry.js` loads either this study or the existing cinematic app.
This view never downloads the raymarcher, cinematic sky textures or Lenis.
The main portfolio has not been changed.

## Verification

- Production build passes.
- `node --test src/experiments/worldModel.test.mjs`: three tests cover seeded
  regeneration, negative cell boundaries, bounded residency, directional travel,
  reversing, and the 10× distance relationship.
- `node scripts/check-free-world-browser.mjs`: installed Chrome with genuine
  pointer-lock acquisition, relative mouse movement and wheel input. Checks
  heading changes without translation, travel along the changed heading,
  Escape release, recapture, 10× travel across cells, return travel and bounded
  uploaded geometry. Browser runtime and shader errors are checked too.
- Desktop screenshots inspected at 1440×900 in `screenshots/free-world/`.

The browser checker uses Playwright installed in the sibling portfolio, as the
galaxy checker does. Its default URL is `http://127.0.0.1:5174`; override `LAB_URL`
when needed. `PLAYWRIGHT_MODULE` can identify another installed module URL.

The stars are intentionally simple for assessing depth and navigation. Density,
size, visibility distance, trail exposure and speed still need visual judgment in the running view;
this is not a claim of final cinematic appearance or phone performance.
