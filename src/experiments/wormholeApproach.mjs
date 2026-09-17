const clamp = value => Math.max(0, Math.min(1, value));
export const TUNNEL_BLEND_START = 5.5;
export const TUNNEL_BLEND_END = 6.5;

export function wormholeApproach(units, aspect = 1881 / 913) {
  const t = clamp(units / TUNNEL_BLEND_END);
  // Integrated speed: modest acceleration, then a long braking approach.
  const q = (.7 * t + 1.3 * t * t - (3.22 / 3) * t * t * t) / (.7 + 1.3 - 3.22 / 3);
  const points = [[-28, 10, 100], [-95, -28, 65], [8, 0, -30], [8, 0, -39.1]];
  const weights = [(1-q)**3, 3*(1-q)**2*q, 3*(1-q)*q*q, q**3];
  const position = [0, 1, 2].map(axis => points.reduce((sum, p, i) => sum + p[axis] * weights[i], 0));
  const dx = 8 - position[0], dy = -position[1], dz = -40 - position[2];
  const blend = clamp((units - TUNNEL_BLEND_START) / (TUNNEL_BLEND_END - TUNNEL_BLEND_START));
  const funnel = clamp((units - 4.7) / (TUNNEL_BLEND_END - 4.7));
  // Match the reference's upper-right opening, then gradually aim into the
  // mouth. Tracking its center from frame one disguises the sideways flight.
  const framing = 1 - q * q * (3 - 2 * q);
  const verticalFov = 70 * Math.PI / 180;
  const horizontalOffset = Math.atan(.44 * Math.tan(verticalFov / 2) * aspect);
  const verticalOffset = Math.atan(.43 * Math.tan(verticalFov / 2));
  return { position, yaw: -Math.atan2(dx, -dz) + horizontalOffset * framing,
    pitch: Math.atan2(dy, Math.hypot(dx, dz)) - verticalOffset * framing,
    tunnelBlend: blend * blend * (3 - 2 * blend),
    throatFunnel: funnel * funnel * (3 - 2 * funnel) };
}
