// Generate the equirectangular star data texture the black hole shader samples.
//
// Channel encoding matches sample_sky() in src/graphics/fragmentShader.glsl:
//   red   = normalised stellar temperature, decoded to MIN_TEMPERATURE + RANGE*r
//   green = emitted brightness, which is what the shader actually multiplies out
//   blue  = radial velocity around 0.5, for the Doppler shift
//   alpha = opaque
//
// Replaces scripts/generate_star_noise.py. Not a translation of it — that one
// had three problems and the point of rewriting was to fix them:
//
//   1. Every star was the same size. It graded brightness into `radii`, then
//      assigned 1 to both the bright and the very bright branch, so the second
//      did nothing. Measured on the shipped texture: 60 percent of stars exactly
//      9 texels, 22 percent exactly 1, and no third size anywhere.
//
//   2. Every star was the same brightness. The comment said "most stars are dim
//      single pixels" but `rng.power(5.8)` has mean 0.85, so it produced mostly
//      bright ones: 95 percent of star cores landed between 116 and 190 of 255.
//      A 1.6x spread across an entire sky.
//
//   3. Density was uniform on the sphere, deliberately and exactly — measured
//      flat to within 3 percent across eight equal-solid-angle bands. Real skies
//      are not; they have a galactic plane and they clump.
//
// Node rather than Python because Python is not on every machine this repo gets
// cloned onto, and a tuning script nobody can run is not a tuning script. No
// dependencies either: the PNG is written straight out through zlib.
//
// Usage:
//   node scripts/generate-star-noise.mjs [--flag value ...]
//   node scripts/generate-star-noise.mjs --help

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Everything here is a knob. The defaults are a starting point, not a result.
const OPTIONS = {
  width:      [4096,  'Texture width. Equirectangular, so it must be twice the height.'],
  height:     [2048,  'Texture height.'],
  seed:       [24680, 'Any change to this reshuffles the entire sky.'],
  count:      [220000,'How many stars to place. Most land faint, so this is not how many you see.'],

  range:      [40,    'Brightness of the brightest star over the faintest, as a ratio.\n' +
                      '                 THE CONTRAST KNOB. 1 is the old texture (all stars alike);\n' +
                      '                 40 gives a carpet of faint ones under a scattering of bright;\n' +
                      '                 200 gives a few standouts over near-darkness.'],

  band:       [0.8,   'How much the stars crowd into the galactic plane, 0 to 1.\n' +
                      '                 0 is a uniform sphere, which is what shipped. 0.8 puts roughly\n' +
                      '                 five times as many on the plane as at the poles. The plane is\n' +
                      '                 the one already painted into milkyway-preview.jpg, meander and\n' +
                      '                 all, so the stars and the nebula plate agree.'],
  bandWidth:  [0.20,  'Half-width of that plane, in units where 1.0 is pole to equator.\n' +
                      '                 0.20 is about 18 degrees.'],

  clump:      [0.35,  'Fraction of stars belonging to a cluster rather than scattered, 0 to 1.\n' +
                      '                 This is what stops the field looking machine-generated.'],
  clumps:     [140,   'How many clusters those stars are shared between.'],
  clumpSpread:[2.6,   'Angular radius of a cluster, in degrees.'],

  gamma:      [1.0,   'Applied to brightness after the distribution. Below 1 lifts the faint\n' +
                      '                 end without touching the bright end; above 1 crushes it.'],

  output:     ['assets/star_noise-generated.png', 'Where to write it.'],
};

function parseArgs(argv) {
  const opts = Object.fromEntries(Object.entries(OPTIONS).map(([k, [v]]) => [k, v]));
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Generate the star data texture.\n');
    for (const [key, [value, help]] of Object.entries(OPTIONS)) {
      console.log(`  --${key.padEnd(12)} default ${String(value).padEnd(34)} ${help}`);
    }
    process.exit(0);
  }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in opts)) throw new Error(`Unknown option --${key}. Try --help.`);
    const raw = argv[i + 1];
    if (raw === undefined) throw new Error(`--${key} needs a value.`);
    opts[key] = typeof opts[key] === 'number' ? Number(raw) : raw;
    if (typeof opts[key] === 'number' && !Number.isFinite(opts[key])) {
      throw new Error(`--${key} must be a number, got "${raw}".`);
    }
  }
  if (opts.width !== opts.height * 2) {
    throw new Error('Equirectangular output must use a 2:1 width-to-height ratio.');
  }
  if (opts.range < 1) throw new Error('--range must be at least 1.');
  if (opts.band < 0 || opts.band > 1) throw new Error('--band must be between 0 and 1.');
  if (opts.clump < 0 || opts.clump > 1) throw new Error('--clump must be between 0 and 1.');
  return opts;
}

// ── Random numbers ──────────────────────────────────────────────────────────
// Seeded so a sky can be reproduced from its flags alone.
function makeRng(seed) {
  let a = seed >>> 0, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  const next = () => {
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11) + t | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 20; i++) next();
  return next;
}

// Marsaglia-Tsang, so temperatures can follow a real beta rather than a ramp.
function gammaSample(rng, shape) {
  if (shape < 1) return gammaSample(rng, shape + 1) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      // Box-Muller for the normal deviate.
      const u1 = Math.max(rng(), 1e-12), u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const betaSample = (rng, a, b) => {
  const x = gammaSample(rng, a);
  return x / (x + gammaSample(rng, b));
};

// ── The galactic plane ──────────────────────────────────────────────────────
// Copied from scripts/generate_milkyway.py so the star density and the painted
// nebula sit on the same band. `y` is latitude normalised to +-1 at the poles,
// which is what both textures use for their vertical axis; `x` is longitude in
// radians. Both textures are sampled through the same tex_coord, so they stay
// aligned however the shader rotates the sky.
function bandProfile(x, y, bandWidth) {
  const centre = 0.08 * Math.sin(x + 0.7) + 0.035 * Math.sin(x * 3 - 0.9);
  const middleWidth = 1 + 0.55 * Math.exp(-(((x - Math.PI) / 0.85) ** 2));
  const latitude = y - centre;
  return Math.exp(-((latitude / (bandWidth * middleWidth)) ** 2));
}

// ── Brightness ──────────────────────────────────────────────────────────────
// Euclidean number counts: in a uniformly filled volume the number of sources
// brighter than flux f goes as f^-1.5, because you see further for brighter
// ones and volume grows faster than flux falls. That single fact is the whole
// difference between a sky and a spray of dots — it is what makes most stars
// faint and a few unmistakable.
//
// Inverted over [1/range, 1] so the faintest star lands exactly at the floor.
function makeBrightnessSampler(range) {
  const floor = 1 / range;
  const span = Math.pow(floor, -1.5) - 1;
  return (rng) => Math.pow(1 + rng() * span, -1 / 1.5);
}

// ── Drawing ─────────────────────────────────────────────────────────────────
// Bright stars get a wider point spread than faint ones, which is the second
// half of looking like a sky: a star's apparent size is its brightness, both
// here and again in the bloom pass afterwards.
function radiusFor(brightness) {
  if (brightness > 0.80) return 3;
  if (brightness > 0.55) return 2;
  if (brightness > 0.22) return 1;
  return 0;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { width, height } = opts;
  const rng = makeRng(opts.seed);
  const sampleBrightness = makeBrightnessSampler(opts.range);

  const bright = new Float32Array(width * height);
  const temp = new Uint8Array(width * height);
  const vel = new Uint8Array(width * height).fill(128);

  // Place one star, keeping the brighter of any overlap so a faint neighbour
  // cannot eat a bright core.
  function addStar(x, y, temperature, brightness, velocity, radius) {
    const sigma = Math.max(0.42, radius * 0.48);
    const twoSigmaSq = 2 * sigma * sigma;
    for (let dy = -radius; dy <= radius; dy++) {
      const py = y + dy;
      if (py < 0 || py >= height) continue;          // poles do not wrap onto themselves
      for (let dx = -radius; dx <= radius; dx++) {
        const px = (x + dx + width) % width;         // longitude does
        const emitted = brightness * Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
        const i = py * width + px;
        if (emitted <= bright[i]) continue;
        bright[i] = emitted;
        temp[i] = Math.round(temperature * 255);
        vel[i] = Math.round(velocity * 255);
      }
    }
  }

  // Draw a direction from the band-weighted distribution. Latitude is sampled
  // as sin(lat) so the underlying sphere stays evenly covered, and the band is
  // then imposed by rejection on top of that — weighting texels directly would
  // have crowded the poles, where a texel covers almost no sky.
  function sampleDirection() {
    for (;;) {
      const lon = rng() * 2 * Math.PI;
      const y = (Math.asin(rng() * 2 - 1) / Math.PI) * 2;   // -1..1, linear in latitude
      const weight = (1 - opts.band) + opts.band * bandProfile(lon, y, opts.bandWidth);
      if (rng() <= weight) return { lon, y };
    }
  }

  const toTexel = (lon, y) => ({
    x: Math.min(width - 1, Math.floor((lon / (2 * Math.PI)) * width)),
    y: Math.min(height - 1, Math.floor(((y + 1) / 2) * height)),
  });

  const clumpCount = Math.max(0, Math.round(opts.count * opts.clump));
  const scatterCount = opts.count - clumpCount;
  const centres = [];
  for (let i = 0; i < opts.clumps; i++) centres.push(sampleDirection());
  const spreadY = opts.clumpSpread / 90;   // degrees into the +-1 latitude scale

  function emit(lon, y) {
    const { x: tx, y: ty } = toTexel(lon, y);
    let brightness = sampleBrightness(rng);
    if (opts.gamma !== 1) brightness = Math.pow(brightness, opts.gamma);
    const temperature = Math.min(1, Math.max(0, betaSample(rng, 2.2, 2.6)));
    const velocity = Math.min(0.82, Math.max(0.18, 0.5 + gaussian(rng) * 0.075));
    addStar(tx, ty, temperature, brightness, velocity, radiusFor(brightness));
  }

  for (let i = 0; i < scatterCount; i++) {
    const { lon, y } = sampleDirection();
    emit(lon, y);
  }
  for (let i = 0; i < clumpCount && centres.length > 0; i++) {
    const centre = centres[Math.floor(rng() * centres.length)];
    const y = Math.max(-1, Math.min(1, centre.y + gaussian(rng) * spreadY));
    // Longitude spreads wider near the poles, where a degree of sky is fewer
    // degrees of longitude, so a cluster stays round instead of becoming a bar.
    const shrink = Math.max(0.15, Math.cos(y * Math.PI / 2));
    const lon = centre.lon + (gaussian(rng) * spreadY * Math.PI) / shrink;
    emit((lon + 2 * Math.PI) % (2 * Math.PI), y);
  }

  writePng(opts.output, width, height, bright, temp, vel);
  report(opts, bright);
}

function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

// ── PNG ─────────────────────────────────────────────────────────────────────
// Written by hand rather than through an image library, so this script has no
// dependencies at all and runs anywhere node does.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function writePng(path, width, height, bright, temp, vel) {
  // One filter byte per scanline, filter type 0 (None): the data is mostly
  // zeroes and deflate handles the runs better than a predictor would.
  const raw = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      raw[o++] = temp[i];
      raw[o++] = Math.min(255, Math.round(bright[i] * 255));
      raw[o++] = vel[i];
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ── What came out ───────────────────────────────────────────────────────────
// Printed rather than assumed. The old texture's problems were all visible in
// numbers like these, and nobody was looking at them.
function report(opts, bright) {
  const lit = [];
  for (let i = 0; i < bright.length; i++) if (bright[i] > 0) lit.push(bright[i]);
  lit.sort((a, b) => a - b);
  const at = (q) => lit[Math.floor(q * (lit.length - 1))];
  const visible = lit.filter((b) => b > 0.25).length;
  console.log(`Wrote ${opts.output}  ${opts.width}x${opts.height}`);
  console.log(`  stars requested   ${opts.count}`);
  console.log(`  lit texels        ${lit.length} (${(100 * lit.length / bright.length).toFixed(2)}% of the map)`);
  console.log(`  brightness        p50 ${(at(0.5) * 255).toFixed(0)}/255   ` +
              `p90 ${(at(0.9) * 255).toFixed(0)}   p99 ${(at(0.99) * 255).toFixed(0)}   ` +
              `max ${(at(1) * 255).toFixed(0)}`);
  console.log(`  above 0.25        ${visible} texels (${(100 * visible / lit.length).toFixed(1)}% of lit) — the ones you actually see`);
  console.log(`  band ${opts.band}  range ${opts.range}  clump ${opts.clump}  seed ${opts.seed}`);
}

main();
