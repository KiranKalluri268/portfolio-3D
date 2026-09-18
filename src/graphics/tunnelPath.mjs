import * as THREE from 'three';

export function createTunnelCurve(lengthScale = 1, straightEntry = false) {
  const points = straightEntry ? [
    // Collinear lead-in keeps the entrance centered while the walls appear.
    // Extra straight points prevent spline tangents pulling it into a turn.
    [0, 0, 200], [0, 0, 140], [0, 0, 70], [0, 0, 20],
    [10, -6, -30], [-14, 8, -90], [12, 10, -150], [0, 0, -200],
  ] : [[0, 0, 200], [10, -6, 100], [-14, 8, 0], [12, 10, -100], [0, 0, -200]];
  return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p).multiplyScalar(lengthScale)));
}
