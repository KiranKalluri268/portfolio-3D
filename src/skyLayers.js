/**
 * URL switches for the sky, ported from my-portfolio's `worldConfig.js`.
 *
 * Diagnostics, not features. The scene has a long-standing complaint — the
 * world reads as the inside of a sphere rather than as open space — and there
 * are four things stacked on top of each other that could each be causing it:
 *
 * - `dust`   the point shell, a hollow field with a wall at one radius and a
 *            void at another, which the camera crosses end to end.
 * - `glow`   `mix(space_color_plane, space_color_pole, ...)` on `abs(dir.y)`,
 *            which paints a bright equator fading to dark poles. That is a
 *            sphere, drawn.
 * - `nebula` the background plate, sampled equirectangularly, so it pinches and
 *            converges at the poles the way a panorama on a ball does.
 * - `stars`  the star plate, sampled the same way.
 *
 * Reasoning about which from the source has already produced one wrong answer.
 * `?sky=nodust`, `?sky=noglow,nonebula` and so on turn them off one at a time so
 * the question can be settled by looking instead.
 *
 * @param {string} search location.search, or anything URLSearchParams accepts
 * @returns {Readonly<{ dust: boolean, glow: boolean, nebula: boolean, stars: boolean }>}
 */
export function resolveSkyLayers(search) {
  const layers = { dust: true, glow: true, nebula: true, stars: true };

  let requested = [];
  try {
    requested = (new URLSearchParams(search).get('sky') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return Object.freeze(layers);
  }

  for (const name of requested) {
    // The `no` prefix is required. `?sky=dust` reads like "give me dust", and
    // turning it off would be the opposite of what was asked for.
    if (!name.startsWith('no')) continue;
    const layer = name.slice(2);
    if (Object.prototype.hasOwnProperty.call(layers, layer)) {
      layers[layer] = false;
    }
  }

  return Object.freeze(layers);
}

/**
 * How brightly the background star plate is rendered, from `?starGain=6`.
 *
 * The texture decides the distribution of stars — how many are faint, how few
 * are bright, where they crowd — and this decides the level the whole field is
 * drawn at. They are separate questions and separate knobs: regenerating the
 * texture with `scripts/generate-star-noise.mjs` is how you change the shape of
 * the sky, and this is how you change how brightly it burns.
 *
 * @param {string} search
 * @param {number} fallback the value to use when the parameter is absent or unusable
 * @returns {number}
 */
export function resolveStarGain(search, fallback) {
  let raw = null;
  try {
    raw = new URLSearchParams(search).get('starGain');
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;

  const value = Number.parseFloat(raw);
  // Zero is meaningful — it is the same as ?sky=nostars — so the floor is
  // inclusive. The ceiling is high enough to be obviously too much.
  if (!Number.isFinite(value) || value < 0 || value > 40) return fallback;
  return value;
}
