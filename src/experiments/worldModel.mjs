export const CELL_SIZE = 48;
export const CELL_RADIUS = 2;
export const STARS_PER_CELL = 288;
export const VIEW_DISTANCE = 90;

export function cellAt(position) {
  return position.map((value) => Math.floor(value / CELL_SIZE));
}

export function cellKey(x, y, z) { return `${x},${y},${z}`; }

// Hash the full coordinate string, including negatives. Re-entering an evicted
// cell reproduces its exact stars; nothing wraps back in front of the camera.
export function generateCell(x, y, z) {
  let seed = 2166136261;
  for (const c of cellKey(x, y, z)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(STARS_PER_CELL * 3);
  const colors = new Float32Array(STARS_PER_CELL * 3);
  for (let i = 0; i < STARS_PER_CELL; i++) {
    positions.set([random() * CELL_SIZE, random() * CELL_SIZE, random() * CELL_SIZE], i * 3);
    const warmth = random(), brightness = 0.45 + random() * 0.55;
    colors.set([
      brightness * (0.72 + warmth * 0.28),
      brightness * (0.83 + warmth * 0.08),
      brightness * (1.0 - warmth * 0.3),
    ], i * 3);
  }
  // Keep size sampling separate so increasing density preserves the positions
  // and colours of the stars that were already present in each cell.
  const sizes = new Float32Array(STARS_PER_CELL);
  for (let i = 0; i < STARS_PER_CELL; i++) {
    sizes[i] = random() < 0.12 ? 1.6 + random() * 0.8 : 0.9 + random() * 0.3;
  }
  return { positions, colors, sizes };
}

export function nearbyCells(position) {
  const [cx, cy, cz] = cellAt(position);
  const cells = [];
  for (let x = cx - CELL_RADIUS; x <= cx + CELL_RADIUS; x++) {
    for (let y = cy - CELL_RADIUS; y <= cy + CELL_RADIUS; y++) {
      for (let z = cz - CELL_RADIUS; z <= cz + CELL_RADIUS; z++) cells.push([x, y, z]);
    }
  }
  return cells;
}

// FPS convention: initial forward is -Z, yaw rotates around world Y, pitch
// rotates up/down. Mouse input changes heading only, never world position.
export function heading(yaw, pitch) {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

export function advance(position, yaw, pitch, distance) {
  const direction = heading(yaw, pitch);
  return position.map((value, axis) => value + direction[axis] * distance);
}
