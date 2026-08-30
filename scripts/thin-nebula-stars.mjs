// Remove a fraction of the stars baked into the nebula plate, in place.
//
// Why this and not the generator: generate_milkyway.py bakes 105,000 stars into
// the plate, but re-running it (or the Node port beside it) redraws the nebula
// too, with different noise. The nebula is the part that is wanted as it is —
// only the dots are up for debate. So this works on the shipped plate and edits
// nothing but the stars.
//
// A star here is not just its core. The generator blooms the image before
// saving — a Gaussian blur composited back at 0.42 — so every star carries a
// halo several pixels wide. The first version of this script found cores with a
// 5x5 median and removed only those, which left the halos behind as soft
// coreless discs: bigger and more obvious than the stars they replaced. So the
// halo has to go with the core, and the background underneath has to be
// estimated from sky that has no star in it at all.
//
// The method:
//
//   1. A 5x5 median is blind to single-texel spikes, so the difference between
//      the plate and its median finds the CORES.
//   2. Those cores are dilated by --halo to cover the bloom around them. That is
//      the full footprint of every star on the plate.
//   3. The background is estimated by normalised convolution: blur the plate
//      with the whole footprint masked out, blur the mask itself, and divide.
//      Star light never enters the estimate, so removing a star does not leave
//      its own glow smeared into what replaces it.
//   4. Cores are grouped into blobs, a fraction are chosen at random, and their
//      footprints are painted with that background through a feathered alpha so
//      there is no visible patch edge.
//
//   node scripts/thin-nebula-stars.mjs [--keep 0.5] [--threshold 7] [--halo 4]
//        [--sigma 10] [--feather 1.5] [--seed 1]
//        [--big 0.03] [--bigSigma 1.25] [--shine 0.004] [--shineHalo 4.5]
//        [--shineSpike 15] [--floor 40]
//        [--input assets/milkyway-preview.jpg] [--output <same as input>]
//
// Run it from the committed plate rather than from its own output: the plate is
// a JPEG and every pass re-encodes the whole image.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const opts = {
  keep: 0.5,        // fraction of star blobs to leave in place
  threshold: 7,     // how far above the local background a core must sit, 0-255
  halo: 4,          // radius the bloom reaches beyond the core, in pixels
  sigma: 10,        // width of the background estimate
  feather: 1.5,     // softness of the edge of a removed patch
  // How many of the surviving stars get to be more than one texel, and how far
  // each effect has to reach to be seen at all.
  //
  // The first attempt at this used 3% and 0.4% at half these widths, and was
  // invisible in the scene for two compounding reasons. Only ~11.5% of the
  // sphere is on screen at once, so a fraction of the plate is a much smaller
  // fraction of the frame — 3% of survivors is about 170 stars in view, lost
  // among some 12,000. And the generator already bloomed every star, so a disc
  // no wider than that bloom rewrites pixels that were bright already: it
  // measured as 0.87% of the map touched, 0.1% of it meaningfully.
  //
  // 64% of the plate's stars are already saturated at 255, so there is no
  // headroom for "brighter" — only wider, and spikier.
  // Both are off. They worked — 4,602 wider discs and 924 spiked stars, all
  // plainly visible — and neither was wanted: small even dots read better than a
  // field with a size hierarchy in it, and a diffraction spike is a lens
  // artefact, which this sky is not seen through. The code stays because the
  // only thing wrong with it was the look, and the widths below are the ones
  // that were actually visible in the scene rather than a first guess.
  // `--big 0.10` and `--shine 0.02` bring them back.
  big: 0,           // fraction drawn as a wider disc
  bigSigma: 2.2,    // how wide, in pixels — must beat the bloom already there
  shine: 0,         // fraction given a halo and four spikes
  shineHalo: 7,     // radius of that halo
  shineSpike: 22,   // length of each spike
  floor: 200,       // only the bright ones are worth the trouble, 0-255
  seed: 1,
  input: 'assets/milkyway-preview.jpg',
  output: '',       // defaults to input
  quality: 94,
};
for (let i = 0; i < argv.length; i++) {
  const key = argv[i].replace(/^--/, '');
  if (!(key in opts)) throw new Error(`unknown option ${argv[i]}`);
  const raw = argv[++i];
  opts[key] = typeof opts[key] === 'number' ? Number(raw) : raw;
}
if (!opts.output) opts.output = opts.input;
if (!(opts.keep >= 0 && opts.keep <= 1)) throw new Error('--keep must be 0..1');

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

const inPath = path.resolve(process.cwd(), opts.input);
const { data: img, info } = await sharp(inPath)
  .toColourspace('srgb')
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
if (C !== 3) throw new Error(`expected 3 channels, got ${C}`);
const N = W * H;

// Longitude wraps and the blurs do not know that, so everything blurred here is
// padded with a wrapped copy of the opposite edge and cropped back afterwards.
const PAD = Math.ceil(3 * opts.sigma) + opts.halo + 4;

async function blurWrapped(buf, channels, sigma) {
  const pw = W + 2 * PAD;
  const padded = Buffer.alloc(pw * H * channels);
  for (let y = 0; y < H; y++) {
    const src = y * W * channels;
    const dst = y * pw * channels;
    buf.copy(padded, dst + PAD * channels, src, src + W * channels);
    buf.copy(padded, dst, src + (W - PAD) * channels, src + W * channels);
    buf.copy(padded, dst + (PAD + W) * channels, src, src + PAD * channels);
  }
  // toColourspace, because sharp will happily hand back three interleaved
  // channels for a one-channel input and the stride silently becomes wrong —
  // which reads every third pixel and stripes the whole plate.
  let pipeline = sharp(padded, { raw: { width: pw, height: H, channels } }).blur(sigma);
  if (channels === 1) pipeline = pipeline.toColourspace('b-w');
  const { data: blurred, info: blurInfo } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (blurInfo.channels !== channels) {
    throw new Error(`blur returned ${blurInfo.channels} channels, expected ${channels}`);
  }
  const out = Buffer.alloc(N * channels);
  for (let y = 0; y < H; y++) {
    Buffer.from(blurred.buffer, blurred.byteOffset, blurred.length).copy(out, y * W * channels,
      y * pw * channels + PAD * channels,
      y * pw * channels + (PAD + W) * channels);
  }
  return out;
}

// ── 1. Cores ────────────────────────────────────────────────────────────────
// Green alone is a good enough luminance proxy here and costs a third as much.
const median = await sharp(img, { raw: { width: W, height: H, channels: 3 } })
  .median(5)
  .raw()
  .toBuffer();

const core = new Uint8Array(N);
let corePixels = 0;
for (let i = 0; i < N; i++) {
  if (img[i * 3 + 1] - median[i * 3 + 1] > opts.threshold) {
    core[i] = 1;
    corePixels++;
  }
}

// ── 2. Footprints ───────────────────────────────────────────────────────────
// A separable box dilation: the halo is round enough at these radii and this is
// two linear passes instead of a quadratic one.
function dilate(mask, radius) {
  const tmp = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let d = -radius; d <= radius && !hit; d++) hit = mask[row + ((x + d + W) % W)];
      tmp[row + x] = hit;
    }
  }
  const out = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let d = -radius; d <= radius && !hit; d++) {
        const ny = y + d;
        if (ny < 0 || ny >= H) continue;   // poles do not wrap onto themselves
        hit = tmp[ny * W + x];
      }
      out[y * W + x] = hit;
    }
  }
  return out;
}
const footprint = dilate(core, opts.halo);

// ── 3. The sky with no stars in it ──────────────────────────────────────────
// Normalised convolution: blur the plate with every star masked out, blur the
// mask, divide. Where a whole neighbourhood is stars the weight collapses, so
// those pixels fall back to a plain blur of the plate.
const masked = Buffer.alloc(N * 3);
const weight = Buffer.alloc(N);
for (let i = 0; i < N; i++) {
  const clear = footprint[i] ? 0 : 1;
  weight[i] = clear * 255;
  if (clear) {
    masked[i * 3] = img[i * 3];
    masked[i * 3 + 1] = img[i * 3 + 1];
    masked[i * 3 + 2] = img[i * 3 + 2];
  }
}
const maskedBlur = await blurWrapped(masked, 3, opts.sigma);
const weightBlur = await blurWrapped(weight, 1, opts.sigma);
const plainBlur = await blurWrapped(img, 3, opts.sigma);

const background = Buffer.alloc(N * 3);
for (let i = 0; i < N; i++) {
  const w = weightBlur[i];
  for (let c = 0; c < 3; c++) {
    background[i * 3 + c] = w < 16
      ? plainBlur[i * 3 + c]
      : Math.min(255, Math.round((maskedBlur[i * 3 + c] * 255) / w));
  }
}

// ── 4. Group the cores, and pick ────────────────────────────────────────────
// So that a star two texels across is one star and not two.
const label = new Int32Array(N).fill(-1);
const blobs = [];
const stack = [];
for (let seedIdx = 0; seedIdx < N; seedIdx++) {
  if (!core[seedIdx] || label[seedIdx] !== -1) continue;
  const id = blobs.length;
  const pixels = [];
  stack.length = 0;
  stack.push(seedIdx);
  label[seedIdx] = id;
  while (stack.length) {
    const p = stack.pop();
    pixels.push(p);
    const y = (p / W) | 0;
    const x = p - y * W;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const q = ny * W + ((x + dx + W) % W);
        if (!core[q] || label[q] !== -1) continue;
        label[q] = id;
        stack.push(q);
      }
    }
  }
  blobs.push(pixels);
}

const doomed = new Uint8Array(N);
const kept = [];
let removed = 0;
for (const pixels of blobs) {
  if (rng() < opts.keep) {
    kept.push(pixels);
    continue;
  }
  removed++;
  for (const p of pixels) doomed[p] = 1;
}

// ── 5. Paint them out, feathered ────────────────────────────────────────────
const alphaHard = dilate(doomed, opts.halo);
// A star that survives must not be half-erased because a neighbour did not.
// Its own core is held out of the alpha before the edge is softened.
for (let i = 0; i < N; i++) if (core[i] && !doomed[i]) alphaHard[i] = 0;
const alphaBuf = Buffer.alloc(N);
for (let i = 0; i < N; i++) alphaBuf[i] = alphaHard[i] ? 255 : 0;
const alpha = await blurWrapped(alphaBuf, 1, opts.feather);
// Holding the kept cores out of the mask is not enough on its own: the feather
// blurs a neighbour's 255 straight back over them, and a surviving star next to
// a removed one comes out dimmed. Zeroed again after the blur, so a star that
// survives is untouched rather than merely less erased.
for (let i = 0; i < N; i++) if (core[i] && !doomed[i]) alpha[i] = 0;

for (let i = 0; i < N; i++) {
  const a = alpha[i] / 255;
  if (a <= 0) continue;
  for (let c = 0; c < 3; c++) {
    const o = i * 3 + c;
    img[o] = Math.round(img[o] * (1 - a) + background[o] * a);
  }
}

// ── 6. A few of the survivors get to be more than one texel ─────────────────
// A field where every star is the same size reads as noise. The generator knew
// that — `range` gives it a brightness spread and `big` a handful of wider ones
// — but thinning takes as many of the wide ones as the narrow, so the variety
// gets thinner with the field. These two passes put it back, on the stars that
// are still here, so the sky has a scale to it: most of them points, some of
// them discs, a few bright enough to throw spikes.
//
// Everything below composites by keeping the brighter of the two values, which
// is what the Python generator's addStar does. A faint neighbour cannot eat a
// bright core, and nothing sums its way past white.
function stamp(cx, cy, radius, draw) {
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= H) continue;              // poles do not wrap onto themselves
    for (let dx = -radius; dx <= radius; dx++) {
      const x = (cx + dx + W) % W;              // longitude does
      const level = draw(dx, dy);
      if (level <= 0) continue;
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(255, Math.round(level * colour[c]));
        if (v > img[o + c]) img[o + c] = v;
      }
    }
  }
}

let colour = [0, 0, 0];
let enlarged = 0;
let shining = 0;

for (const pixels of kept) {
  const wantBig = rng() < opts.big;
  const wantShine = rng() < opts.shine;
  if (!wantBig && !wantShine) continue;

  // The brightest pixel of the blob is the star: its position and its colour.
  let best = pixels[0];
  for (const p of pixels) if (img[p * 3 + 1] > img[best * 3 + 1]) best = p;
  const cy = (best / W) | 0;
  const cx = best - cy * W;
  const peak = img[best * 3 + 1];
  // Too faint to be worth enlarging — blowing up a dim smudge just makes a
  // bigger dim smudge.
  if (peak < opts.floor) continue;
  colour = [img[best * 3] / peak, img[best * 3 + 1] / peak, img[best * 3 + 2] / peak];

  if (wantBig) {
    enlarged++;
    const sigma = opts.bigSigma;
    const r = Math.ceil(sigma * 2.5);
    stamp(cx, cy, r, (dx, dy) => peak * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
  }

  if (wantShine) {
    shining++;
    // A soft halo, and four spikes. The spikes are what reads as "bright" —
    // a real lens does this to a point source, and the eye knows it.
    const hs = opts.shineHalo;
    stamp(cx, cy, Math.ceil(hs * 2.5), (dx, dy) =>
      peak * 0.45 * Math.exp(-(dx * dx + dy * dy) / (2 * hs * hs)));
    const len = opts.shineSpike;
    stamp(cx, cy, len, (dx, dy) => {
      const along = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
      const across = Math.abs(dx) > Math.abs(dy) ? Math.abs(dy) : Math.abs(dx);
      return peak * 0.85 * Math.exp(-along / (len * 0.42)) * Math.exp(-across / 0.7);
    });
  }
}

const jpeg = await sharp(img, { raw: { width: W, height: H, channels: 3 } })
  .jpeg({ quality: opts.quality, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toBuffer();
await writeFile(path.resolve(process.cwd(), opts.output), jpeg);

let painted = 0;
for (let i = 0; i < N; i++) if (alpha[i] > 0) painted++;
console.log(`Wrote ${opts.output}  ${W}x${H}  ${(jpeg.length / 1e6).toFixed(2)} MB`);
console.log(`  core pixels    ${corePixels} (${(100 * corePixels / N).toFixed(2)}% of the map)`);
console.log(`  star blobs     ${blobs.length}`);
console.log(`  removed        ${removed} (${(100 * removed / blobs.length).toFixed(1)}%)`);
console.log(`  kept           ${blobs.length - removed}`);
console.log(`  repainted      ${painted} pixels (${(100 * painted / N).toFixed(2)}%, halo included)`);
console.log(`  enlarged       ${enlarged}`);
console.log(`  shining        ${shining}`);
console.log(`  keep ${opts.keep}  threshold ${opts.threshold}  halo ${opts.halo}  ` +
            `sigma ${opts.sigma}  feather ${opts.feather}  seed ${opts.seed}`);
