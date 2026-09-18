import { TUNNEL_BLEND_START, TUNNEL_BLEND_END } from './wormholeApproach.mjs';

const smooth = (value, start, end) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export function tunnelScrollSpeed(units) {
  const enter = smooth(units, TUNNEL_BLEND_START, TUNNEL_BLEND_END);
  const leave = smooth(units, 10.3, 11.5);
  return 1 + enter * (1 - leave);
}

// Integrate input across the ramps, rather than multiplying a large wheel
// event by its starting speed and carrying that boost past the exit.
// Units are viewport heights, making the feel independent of screen size.
export function tunnelScrollDelta(units, input) {
  if (!Number.isFinite(units) || !Number.isFinite(input)) return 0;
  const steps = Math.max(1, Math.ceil(Math.abs(input) / 0.025));
  const step = input / steps;
  let position = units;
  for (let i = 0; i < steps; i++) {
    const a = tunnelScrollSpeed(position);
    const b = tunnelScrollSpeed(position + step * a / 2);
    const c = tunnelScrollSpeed(position + step * b / 2);
    const d = tunnelScrollSpeed(position + step * c);
    position += step * (a + 2 * b + 2 * c + d) / 6;
  }
  return position - units;
}
