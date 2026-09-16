import * as THREE from 'three';

const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };

// World positions, independent of the black hole's location at the origin.
// No time input: returning to a scroll position returns to exactly the same shot.
export function flightPose(progress, mode = 'free', yaw = 0) {
  const t = ease(progress);
  const position = new THREE.Vector3(
    -9 + 6 * t + 2 * Math.sin(Math.PI * t),
    4.5 - 3 * t,
    30 - 22 * t,
  );
  const direction = mode === 'orbit'
    ? position.clone().negate().normalize()
    : new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0), -0.10 * ease((t - 0.3) / 0.7),
    );

  if (mode === 'orbit') {
    // Same distance and elevation as free flight, but position travels around
    // the subject. Deliberately scroll-driven, not the original time-based spin.
    const bearing = 0.55 * Math.sin(Math.PI * t);
    position.applyAxisAngle(new THREE.Vector3(0, 1, 0), bearing);
    direction.copy(position).negate().normalize();
  }
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * Math.PI / 180);
  return { position, direction, up: new THREE.Vector3(0, 1, 0), fov: 58 };
}
