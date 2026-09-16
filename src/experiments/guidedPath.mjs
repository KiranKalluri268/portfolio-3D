// Integrated smooth velocity ramps: position and speed stay continuous at seams.
const segments = [
  [0.36, 100, 100, 'Calm flight'],
  [0.54, 100, 8000, 'Acceleration'],
  [0.80, 8000, 8000, 'Fast travel'],
  [1.06, 8000, 100, 'Deceleration'],
  [1.30, 100, 100, 'Galaxy arrival'],
];
export function journeyAt(progress) {
  // Double both calm stretches; retain the original hyperspace ramp lengths.
  const p = Math.max(0, Math.min(1, progress)) * 1.3;
  let start = 0, distance = 0;
  for (const [end, from, to, stage] of segments) {
    const span = end - start;
    const t = Math.max(0, Math.min(1, (p - start) / span));
    distance += span * (from * t + (to - from) * (t ** 3 - 0.5 * t ** 4));
    if (p <= end) return { distance, stage, velocity: from + (to - from) * t * t * (3 - 2 * t) };
    start = end;
  }
}
export const DESTINATION_Z = -journeyAt(1).distance - 90;
