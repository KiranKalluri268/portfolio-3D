import { journeyAt } from './guidedPath.mjs';

export const GALAXY_UNITS = 31;
export const BLACK_HOLE_UNITS = 37;
export const FALL_END_UNITS = 47;
// The black hole is already in the shared world during galaxy departure;
// BLACK_HOLE_UNITS marks only the start of the close approach.
export function blackHoleVisible(units) { return units >= GALAXY_UNITS; }
export function connectedArrivalVeil(units) {
  return Math.max(0, Math.min(1, 1 - (units - 11.5) / 0.65));
}
const calmSpeed = 100 / 15; // matches the end of the accepted first journey
// Distances per viewport of scroll, integrated to preserve continuity.
const stages = [
  [2, calmSpeed, 110, 'Galaxy fly-through'],
  [3, 110, 600, 'Acceleration to the black hole'],
  [4.4, 600, 600, 'Hyperspace to the black hole'],
  [6, 600, calmSpeed, 'Black-hole arrival'],
];
export function departureAt(units) {
  const u = Math.max(0, Math.min(6, units));
  let start = 0, distance = journeyAt(1).distance;
  for (const [end, from, to, stage] of stages) {
    const span = end - start;
    const t = Math.max(0, Math.min(1, (u - start) / span));
    distance += span * (from * t + (to - from) * (t ** 3 - t ** 4 / 2));
    if (u <= end) return { distance, stage, velocity: from + (to - from) * t * t * (3 - 2 * t) };
    start = end;
  }
}
export function blackHoleProgress(units) {
  return Math.max(0, Math.min(1, (units - BLACK_HOLE_UNITS) / (FALL_END_UNITS - BLACK_HOLE_UNITS)));
}
