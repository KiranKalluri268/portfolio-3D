import { TUNNEL_BLEND_START, TUNNEL_BLEND_END } from '../experiments/wormholeApproach.mjs';

export const ENTRY_HANDOFF = (TUNNEL_BLEND_END - TUNNEL_BLEND_START) / (11.5 - TUNNEL_BLEND_START);
const smooth = (x, a, b) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Geometry, banking and bloom stay out of the optical handoff, including when
// jumping into the passage or scrubbing backward.
export function tunnelEntryAt(progress) {
  return {
    walls: smooth(progress, ENTRY_HANDOFF, 0.43),
    detail: smooth(progress, ENTRY_HANDOFF, 0.65),
    travel: Math.max(0, progress - ENTRY_HANDOFF) ** 2 * 1.4,
    bloom: smooth(progress, ENTRY_HANDOFF, 0.6),
    // Keep the sky walls for the whole passage; only the final exit fades out.
    exit: smooth(progress, 0.94, 1),
  };
}
