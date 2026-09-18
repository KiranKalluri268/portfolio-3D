import { TUNNEL_BLEND_START } from './wormholeApproach.mjs';

// The tunnel is a separate optical/geometry scene, not part of free space.
export function canFreeFly(units) {
  return Number.isFinite(units) && (units < TUNNEL_BLEND_START || units > 11.5);
}
