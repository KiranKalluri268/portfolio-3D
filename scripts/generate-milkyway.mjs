// Generate the equirectangular nebula plate - the galaxy the scene sits in.
//
// A port of generate_milkyway.py, beside it, with one deliberate
// omission: this one paints NO stars.
//
// The Python original baked 105,000 stars plus a handful of feature stars into
// the plate, and the plate is loaded with NearestFilter, so those baked stars
// came through as hard single-texel dots that read exactly like real stars -
// while being completely deaf to `starGain` and to regenerating the star plate.
// Two star fields, one knob. The sky's stars belong to star_noise-generated.png
// and to `bg_star_gain`; this file carries the haze, the core and the dust lanes
// and nothing else.
//
// Ported to Node because the machine has no Python. sharp does the two array
// jobs numpy was here for - the bicubic upscale behind the noise and the
// Gaussian blur behind the bloom - and is a devDependency for that reason
// alone; nothing in the bundle imports it. The other generator beside this one,
// generate-star-noise.mjs, needs no dependencies at all, so this is the one
// script here that does.
//
//   node scripts/generate-milkyway.mjs [--width 6000] [--seed 73194]
//        [--output assets/milkyway-preview.jpg]

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// -- Options -----------------------------------------------------------------
const argv = process.argv.slice(2);
const opts = {
  width: 6000,
  seed: 73194,
  quality: 94,
  output: 'assets/milkyway-preview.jpg',
};
for (let i = 0; i < argv.length; i++) {
  const key = argv[i].replace(/^--/, '');
  if (!(key in opts)) throw new Error(`unknown option ${argv[i]}`);
  const raw = argv[++i];
  opts[key] = typeof opts[key] === 'number' ? Number(raw) : raw;
}
const WIDTH = opts.width;
const HEIGHT = WIDTH / 2; // equirectangular is 2:1 or it is not equirectangular
if (!Number.isInteger(HEIGHT)) throw new Error('width must be even');
const N = WIDTH * HEIGHT;

// -- Seeded RNG --------------------------------------------------------------
// numpy's Generator cannot be reproduced here, so the noise pattern differs
// from the Python run. The character of it does not: same scales, same weights,
// same seam treatment.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(opts.seed);

// -- Smooth noise whose left and right edges match ---------------------------
// A coarse random grid blown up bicubically, then cross-faded with a wrapped
// copy of itself across a wide seam so the sphere closes without a visible join.
async function periodicNoise(scale) {
  const gridW = Math.max(8, Math.floor(WIDTH / scale));
  const gridH = Math.max(4, Math.floor(HEIGHT / scale));
  const grid = Buffer.alloc(gridW * gridH);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.floor(rng() * 256);

  // toColourspace, because sharp will happily hand back three interleaved
  // channels for a one-channel input and the stride silently becomes wrong -
  // which reads every third pixel and stripes the whole plate.
  const { data, info } = await sharp(grid, { raw: { width: gridW, height: gridH, channels: 1 } })
    .resize(WIDTH, HEIGHT, { kernel: 'cubic', fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`expected 1 channel, got ${info.channels}`);

  const noise = new Float32Array(N);
  for (let i = 0; i < N; i++) noise[i] = data[i] / 255;

  const seam = Math.max(32, Math.floor(WIDTH / 12));
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * WIDTH;
    for (let s = 0; s < seam; s++) {
      const ramp = s / (seam - 1);
      const left = noise[row + s];
      const right = noise[row + WIDTH - seam + s];
      const blend = right * (1 - ramp) + left * ramp;
      noise[row + s] = blend;
      noise[row + WIDTH - seam + s] = blend;
    }
  }
  return noise;
}

// -- The plate ---------------------------------------------------------------
const TWO_PI = Math.PI * 2;

const large = await periodicNoise(180);
const medium = await periodicNoise(70);
const fine = await periodicNoise(24);
const dustNoise = await periodicNoise(45);

// Overlapping coloured clouds embedded in the warm core:
// [longitude, latitude offset, x radius, y radius, colour, strength]
const clouds = [
  [0.65, 0.018, 0.30, 0.050, [0.90, 0.25, 0.58], 0.16],
  [1.48, -0.020, 0.38, 0.060, [0.55, 0.25, 0.95], 0.15],
  [2.32, 0.024, 0.34, 0.055, [0.16, 0.72, 0.68], 0.14],
  [3.02, -0.012, 0.42, 0.070, [1.00, 0.34, 0.16], 0.20],
  [3.72, 0.020, 0.32, 0.055, [0.86, 0.28, 0.72], 0.17],
  [4.50, -0.022, 0.38, 0.060, [0.20, 0.62, 0.82], 0.15],
  [5.35, 0.016, 0.30, 0.050, [0.95, 0.40, 0.18], 0.16],
];

const image = new Float32Array(N * 3);

for (let py = 0; py < HEIGHT; py++) {
  const y = -1 + (2 * py) / (HEIGHT - 1);
  const row = py * WIDTH;

  for (let px = 0; px < WIDTH; px++) {
    const i = row + px;
    const x = (TWO_PI * px) / WIDTH;

    // A periodic, gently warped galactic plane.
    const center = 0.08 * Math.sin(x + 0.7) + 0.035 * Math.sin(x * 3 - 0.9);
    const lat = y - center;
    const midWidth = 1 + 0.55 * Math.exp(-(((x - Math.PI) / 0.85) ** 2));
    const broadBand = Math.exp(-((lat / (0.20 * midWidth)) ** 2));
    const core = Math.exp(-((lat / (0.075 * midWidth)) ** 2));

    const structure = 0.48 * large[i] + 0.34 * medium[i] + 0.18 * fine[i];

    // Dark dust lanes run through the brightest part of the galaxy.
    const dustMidWidth = 1 + 1.15 * Math.exp(-(((x - Math.PI) / 0.78) ** 2));
    const dustLane = Math.exp(
      -(((lat + 0.018 * Math.sin(x * 5)) / (0.038 * dustMidWidth)) ** 2),
    );
    const dust = dustLane * Math.min(1, Math.max(0, (dustNoise[i] - 0.35) * 1.8));

    let r = 0.0015;
    let g = 0.002;
    let b = 0.0045;

    const coolHaze = broadBand * (0.035 + 0.18 * structure);
    r += coolHaze * 0.38;
    g += coolHaze * 0.52;
    b += coolHaze * 0.82;

    const centerBrightness = 0.42 + 1.15 * Math.exp(-(((x - Math.PI) / 0.78) ** 2));
    const warmCore = core * (0.055 + 0.42 * structure) * centerBrightness;
    r += warmCore * 1.0;
    g += warmCore * 0.68;
    b += warmCore * 0.38;

    const cloudTexture = 0.30 + 0.70 * (0.55 * medium[i] + 0.45 * fine[i]);
    for (const [cx, cy, rx, ry, color, strength] of clouds) {
      let dx = Math.abs(x - cx);
      dx = Math.min(dx, TWO_PI - dx);
      const cloud = Math.exp(-((dx / rx) ** 2 + ((lat - cy) / ry) ** 2));
      const amount = cloud * cloudTexture * strength;
      if (amount < 1e-5) continue;
      r += amount * color[0];
      g += amount * color[1];
      b += amount * color[2];
    }

    const lane = 1 - 0.72 * dust;
    const o = i * 3;
    image[o] = r * lane;
    image[o + 1] = g * lane;
    image[o + 2] = b * lane;
  }
}

// -- Bloom, on the brightest pixels only -------------------------------------
// Without the stars this is doing far less work than it did in the Python
// original - what is left above the threshold is the galactic core - which is
// the point: the plate glows where the galaxy is, not everywhere a dot was.
const highlights = Buffer.alloc(N * 3);
for (let i = 0; i < N * 3; i++) {
  const v = Math.min(1, Math.max(0, image[i]));
  image[i] = v;
  highlights[i] = Math.round(Math.min(1, Math.max(0, (v - 0.45) * 2.2)) * 255);
}

const glow = await sharp(highlights, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
  .blur(Math.max(1, WIDTH / 3000))
  .raw()
  .toBuffer();

// Composite the glow back, then a mild display gamma that preserves dark sky.
const out = Buffer.alloc(N * 3);
for (let i = 0; i < N * 3; i++) {
  const v = Math.min(1, image[i] + (glow[i] / 255) * 0.42);
  out[i] = Math.round(Math.pow(v, 1 / 2.2) * 255);
}

const target = path.resolve(process.cwd(), opts.output);
const jpeg = await sharp(out, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
  .jpeg({ quality: opts.quality, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toBuffer();
await writeFile(target, jpeg);

console.log(
  `Generated ${opts.output} (${WIDTH}x${HEIGHT}, seed=${opts.seed}, ` +
    `${(jpeg.length / 1e6).toFixed(1)} MB, no stars)`,
);
