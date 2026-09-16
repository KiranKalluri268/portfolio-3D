export const GALAXY_TIMELINE = Object.freeze({
  crossingEnd: 5, tunnelStart: 6.5, tunnelEnd: 11.5,
  arrivalEnd: 13, accelerateStart: 15, warpStart: 17,
  warpEnd: 20, settleEnd: 22, end: 27,
});

export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const ramp = (u, a, b) => clamp01((u - a) / (b - a));

// An opaque plateau straddles each handover, including reverse scrolling.
// Never blend two expensive destinations; switch the active scene under light.
function handover(u, midpoint) {
  return smooth((u - midpoint + 0.3) / 0.2) *
    (1 - smooth((u - midpoint - 0.1) / 0.2));
}

export function galaxyJourneyState(units) {
  const u = Math.max(0, Math.min(GALAXY_TIMELINE.end, units));
  const t = GALAXY_TIMELINE;
  let active = 'wormhole';
  if (u > t.tunnelStart && u <= t.tunnelEnd) active = 'tunnel';
  else if (u > t.tunnelEnd && u < t.warpStart) active = 'space';
  else if (u >= t.warpStart && u < t.warpEnd) active = 'hyperspace';
  else if (u >= t.warpEnd) active = 'galaxy';

  let phase = active;
  if (active === 'space') phase = u < t.arrivalEnd ? 'arrival' : u < t.accelerateStart ? 'coast' : 'accelerate';
  if (active === 'galaxy' && u < t.settleEnd) phase = 'decelerate';
  const arrivalVeil = active === 'space'
    ? 1 - clamp01((ramp(u, t.tunnelEnd, t.arrivalEnd) - 0.05) / 0.35)
    : 0;

  return {
    units: u, active, phase,
    coast: ramp(u, t.tunnelEnd, t.warpStart),
    acceleration: smooth(ramp(u, t.accelerateStart, t.warpStart)),
    warp: ramp(u, t.warpStart, t.warpEnd),
    galaxy: ramp(u, t.warpEnd, t.end),
    streak: active === 'space' ? smooth(ramp(u, t.accelerateStart, t.warpStart))
      : active === 'hyperspace' ? 1
        : active === 'galaxy' ? 1 - smooth(ramp(u, t.warpEnd, t.settleEnd)) : 0,
    veil: Math.max(arrivalVeil, handover(u, t.warpStart), handover(u, t.warpEnd)),
  };
}
