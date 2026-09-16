import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '../../my-portfolio/node_modules/playwright/index.mjs');
const world = process.env.WORLD_DESTINATION ?? 'blackhole';
assert.ok(['blackhole', 'wormhole'].includes(world));
const screenshots = `screenshots/world-${world}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir(screenshots, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  await page.goto(`${process.env.LAB_URL ?? 'http://127.0.0.1:5174'}/?world=${world}&inspect`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__freeWorld?.().destination && window.__freeWorld().cells === 125);
  const read = () => page.evaluate(() => window.__freeWorld());
  const start = await read();
  assert.equal(start.destination.lensing, true);
  assert.equal(start.destination.inFront, true);
  assert.ok(!requests.some(u => /\/src\/main.js|\/graphics\/render.js/.test(u)));
  if (world === 'blackhole') assert.ok(!requests.some(u => /star_noise|milkyway/.test(u)));
  if (world === 'wormhole') {
    assert.equal(start.destination.throatSource, 'original-destination-sky');
    assert.ok(requests.some(u => /star_noise-generated/.test(u)));
    assert.ok(requests.some(u => /milkyway-preview/.test(u)));
    assert.ok(!requests.some(u => /accretion_disk|worldBlackHole/.test(u)));
  }
  await page.screenshot({ path: `${screenshots}/01-arrival.png` });
  const on = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
  await page.getByRole('checkbox', { name: 'Star lensing' }).uncheck();
  await page.waitForTimeout(150);
  assert.equal((await read()).starLensingEnabled, false);
  const off = await sharp(await page.screenshot({ path: `${screenshots}/05-lensing-off.png` })).removeAlpha().raw().toBuffer();
  let changedStars = 0;
  for (let y = 0; y < 900; y++) for (let x = 0; x < 1440; x++) {
    // Exclude the animated disk/glow and controls. Measure live stars only.
    if (x > 550 && y > 190 && y < 760 || x > 1030 && y < 550) continue;
    const i = (y * 1440 + x) * 3;
    if (Math.max(on[i],off[i]) > 40 && Math.abs(on[i]-off[i]) > 20) changedStars++;
  }
  assert.ok(changedStars > 10, `Expected live-star pixels to move, got ${changedStars}`);
  assert.deepEqual((await read()).position,start.position);
  await page.getByRole('checkbox', { name: 'Star lensing' }).check();
  await page.getByRole('combobox', { name: 'Travel speed' }).selectOption('5');
  await page.getByRole('button', { name: 'Enter world' }).click();
  await page.waitForFunction(() => window.__freeWorld().locked);
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(700);
  const near = await read();
  assert.ok(near.destination.distance < start.destination.distance / 2);
  assert.deepEqual(near.destination.position, start.destination.position);
  await page.screenshot({ path: `${screenshots}/02-beside.png` });
  if (world === 'wormhole') {
    const before = await read();
    const first = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
    await page.waitForTimeout(900);
    const after = await read();
    const second = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
    assert.ok(after.destination.skyDrift > before.destination.skyDrift + 0.015, 'Optical sky should drift while idle');
    assert.ok(Math.hypot(...after.position.map((v, i) => v - before.position[i])) < 0.03, 'Drift must not move the camera');
    let changed = 0;
    for (let y = 250; y < 650; y++) for (let x = 1050; x < 1400; x++) {
      const i = (y * 1440 + x) * 3;
      if (Math.abs(first[i] - second[i]) > 8) changed++;
    }
    assert.ok(changed > 100, `Expected interior motion, got ${changed} changed pixels`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    const stopped = (await read()).destination.skyDrift;
    await page.waitForTimeout(200);
    assert.equal((await read()).destination.skyDrift, stopped);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(700);
  const passed = await read();
  assert.equal(passed.destination.inFront, false);
  assert.equal(passed.cells, 125);
  assert.ok(passed.geometries <= 127);
  assert.deepEqual(passed.destination.position, start.destination.position);
  await page.screenshot({ path: `${screenshots}/03-passed.png` });
  await page.mouse.wheel(0, -480);
  await page.waitForTimeout(700);
  const back = await read();
  assert.ok(Math.hypot(...back.position) < 0.03);
  assert.ok(Math.abs(back.destination.distance - start.destination.distance) < 0.03);
  await page.mouse.move(1100, 400);
  await page.waitForTimeout(100);
  const looked = await read();
  assert.ok(Math.abs(looked.yaw) > 0.01);
  assert.deepEqual(looked.destination.position, start.destination.position);
  assert.ok(Math.abs(looked.destination.projected[0] - back.destination.projected[0]) > 0.1);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Return to origin' }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${screenshots}/04-portrait.png` });
  assert.deepEqual(errors, []);
  console.log(`Live-world ${world}: approach, pass, origin shifts, reverse, free look, portrait and no replacement sky pass.`);
} finally { await browser.close(); }
