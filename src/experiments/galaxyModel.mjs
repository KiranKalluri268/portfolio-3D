// Procedural galaxy as world-space point sets: no texture plate, no sky shell.
// Populations follow a simple astrophysical layout — exponential disk with
// logarithmic spiral arms, flattened bulge, sparse halo, HII knots on the arm
// ridges and dust along each arm's inner edge.
export const GALAXY_RADIUS = 42;
export const STAR_COUNT = 24000;
export const HAZE_COUNT = 1200;
export const DUST_COUNT = 1600;

const SCALE_LENGTH = 12;
const PITCH = Math.tan(14 * Math.PI / 180);
const ARMS = [
  { phase: 0, weight: 1 },
  { phase: Math.PI, weight: 1 },
  { phase: Math.PI / 2, weight: 0.45 },
  { phase: Math.PI * 1.5, weight: 0.45 },
];
const ARM_WEIGHT = ARMS.reduce((sum, arm) => sum + arm.weight, 0);

export function createRandom(seed = 81723) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  random.gaussian = () => {
    const u = Math.max(1e-9, random()), v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return random;
}

export function armAngle(armIndex, radius) {
  return ARMS[armIndex].phase + Math.log(Math.max(radius, 1.5) / 1.5) / PITCH;
}

function pickArm(random) {
  let target = random() * ARM_WEIGHT;
  for (let i = 0; i < ARMS.length; i++) {
    target -= ARMS[i].weight;
    if (target <= 0) return i;
  }
  return 0;
}

function diskRadius(random) {
  let r = GALAXY_RADIUS + 1;
  while (r > GALAXY_RADIUS) r = -SCALE_LENGTH * Math.log(1 - random());
  return r;
}

export function generateGalaxy(seed = 81723, count = STAR_COUNT) {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const populations = { disk: 0, bulge: 0, halo: 0, knot: 0 };
  for (let i = 0; i < count; i++) {
    const roll = random();
    let x, y, z, r, g, b, size, brightness;
    if (roll < 0.07) {
      populations.bulge++;
      x = random.gaussian() * 5; y = random.gaussian() * 5 * 0.6; z = random.gaussian() * 5;
      const warm = random();
      r = 1.0; g = 0.74 + warm * 0.1; b = 0.45 + warm * 0.17;
      // Dense but individually faint, so the core glows warm instead of clipping.
      brightness = Math.exp(random.gaussian() * 0.6) * 0.14;
      size = 0.6 + random() * 0.3;
    } else if (roll < 0.12) {
      populations.halo++;
      x = random.gaussian() * 30; y = random.gaussian() * 30; z = random.gaussian() * 30;
      r = 1.0; g = 0.78; b = 0.62;
      brightness = Math.exp(random.gaussian() * 0.5) * 0.35;
      size = 0.6 + random() * 0.3;
    } else if (roll < 0.14) {
      populations.knot++;
      const radius = 8 + random() * 27;
      const angle = armAngle(pickArm(random), radius) + random.gaussian() * 0.05;
      x = Math.cos(angle) * radius; z = Math.sin(angle) * radius; y = random.gaussian() * 0.3;
      r = 1.0; g = 0.55 + random() * 0.15; b = 0.65 + random() * 0.15;
      brightness = 1.6 + random() * 1.2;
      size = 2.5 + random() * 1.5;
    } else {
      populations.disk++;
      const radius = diskRadius(random);
      const onArm = random() > 0.3;
      const scatter = 0.12 + radius * 0.012;
      const angle = onArm
        ? armAngle(pickArm(random), radius) + random.gaussian() * scatter
        : random() * Math.PI * 2;
      x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
      y = random.gaussian() * (0.35 + radius * 0.02);
      const young = onArm && random() < 0.6;
      if (young) { r = 0.6 + random() * 0.15; g = 0.75 + random() * 0.1; b = 1.0; }
      else { const warm = random(); r = 1.0; g = 0.9 - warm * 0.12; b = 0.85 - warm * 0.3; }
      brightness = Math.exp(random.gaussian() * 0.8) * (young ? 1.3 : 0.8);
      size = random() < 0.04 ? 2.0 + random() * 1.5 : 0.6 + random() * 0.45;
    }
    brightness = Math.min(brightness, 3.0);
    positions.set([x, y, z], i * 3);
    colors.set([r * brightness, g * brightness, b * brightness], i * 3);
    sizes[i] = size;
  }
  return { positions, colors, sizes, populations };
}

// Large soft sprites standing in for unresolved starlight: arm haze plus a
// warm bulge glow. Radii are world units; alpha stays low so they only add up.
export function generateHaze(seed = 4021, count = HAZE_COUNT) {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const radii = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x, y, z, r, g, b, alpha, radius;
    if (i < 16) {
      x = random.gaussian() * 2; y = random.gaussian() * 1; z = random.gaussian() * 2;
      r = 1.0; g = 0.74; b = 0.45; alpha = 0.02; radius = 3 + random() * 5;
    } else {
      const distance = 3 + Math.pow(random(), 0.8) * (GALAXY_RADIUS - 5);
      const onArm = random() > 0.25;
      const angle = onArm
        ? armAngle(pickArm(random), distance) + random.gaussian() * (0.08 + distance * 0.006)
        : random() * Math.PI * 2;
      x = Math.cos(angle) * distance; z = Math.sin(angle) * distance; y = random.gaussian() * 0.4;
      const cool = random();
      r = 0.35 + (1 - cool) * 0.4; g = 0.55 + (1 - cool) * 0.2; b = 0.95 + cool * 0.05;
      alpha = (onArm ? 0.03 : 0.015) + random() * 0.03; radius = 1.5 + random() * 3.5;
    }
    positions.set([x, y, z], i * 3);
    colors.set([r, g, b, alpha], i * 4);
    radii[i] = radius;
  }
  return { positions, colors, radii };
}

// Dust hugs the inner (smaller-angle) edge of each arm and thins outward.
export function generateDust(seed = 9907, count = DUST_COUNT) {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const radii = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const distance = 5 + Math.pow(random(), 0.9) * 30;
    const arm = pickArm(random);
    const inset = 0.06 + Math.abs(random.gaussian()) * 0.05 + distance * 0.004;
    const angle = armAngle(arm, distance) - inset;
    positions.set([Math.cos(angle) * distance, random.gaussian() * 0.25, Math.sin(angle) * distance], i * 3);
    colors.set([0.02, 0.015, 0.03, 0.45 + random() * 0.25], i * 4);
    radii[i] = 1.2 + random() * 2.3;
  }
  return { positions, colors, radii };
}
