// Browser QA using an installed Playwright, without downloading a browser.
// This workspace already has Playwright in the sibling portfolio's dev tools.
// Elsewhere, set PLAYWRIGHT_MODULE to an installed Playwright module URL.
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '../../my-portfolio/node_modules/playwright/index.mjs');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const base = process.env.LAB_URL ?? 'http://127.0.0.1:5173';
await mkdir('screenshots/galaxy-journey', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Audit actual GPU submissions, not only the selected-scene label. A hidden
  // raymarcher continuing to draw would violate the experiment's main budget.
  await page.addInitScript(() => {
    window.__drawAudit = { raymarcher: 0, tunnel: 0 };
    const sources = new WeakMap(), programs = new WeakMap(), active = new WeakMap();
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const method of ['shaderSource', 'attachShader', 'useProgram', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = prototype[method];
        if (!original) continue;
        prototype[method] = function (...args) {
          if (method === 'shaderSource') sources.set(args[0], args[1]);
          if (method === 'attachShader') {
            const source = sources.get(args[1]) ?? '';
            if (source.includes('float h2 = dot(c,c)')) programs.set(args[0], 'raymarcher');
            if (source.includes('float toExit = 1.0 - vUv.y')) programs.set(args[0], 'tunnel');
          }
          if (method === 'useProgram') active.set(this, args[0]);
          if (method.startsWith('draw')) {
            const kind = programs.get(active.get(this));
            if (kind) window.__drawAudit[kind]++;
          }
          return original.apply(this, args);
        };
      }
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/?journey=galaxy`, { waitUntil: 'networkidle' });
  await page.locator('#loading-overlay.ready-to-enter').waitFor({ timeout: 90000 });
  await page.keyboard.press('Enter');
  await page.locator('#loading-overlay').waitFor({ state: 'detached', timeout: 10000 });
  console.log('Entry gate opens with the original wormhole.');

  const panel = page.locator('.journey-lab');
  const snapshot = async (name) => {
    await page.screenshot({ path: `screenshots/galaxy-journey/${name}.png` });
    console.log(name, await panel.getAttribute('data-active-scene'));
  };
  await snapshot('01-wormhole');
  assert.ok((await page.evaluate(() => window.__drawAudit)).raymarcher > 0,
    'The audit must detect the real wormhole shader before testing absence');
  for (const [label, active, file] of [
    ['Tunnel', 'tunnel', '02-tunnel'],
    ['Open space', 'space', '03-open-space'],
    ['Hyperspace', 'hyperspace', '04-hyperspace'],
    ['Galaxy', 'galaxy', '05-galaxy'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction((active) => document.querySelector('.journey-lab')?.dataset.activeScene === active, active);
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__drawAudit = { raymarcher: 0, tunnel: 0 }; });
    await page.waitForTimeout(150);
    const draws = await page.evaluate(() => window.__drawAudit);
    assert.equal(draws.raymarcher, 0, `Hidden raymarcher still draws during ${active}`);
    if (active === 'tunnel') assert.ok(draws.tunnel > 0, 'Original tunnel must render');
    else assert.equal(draws.tunnel, 0, `Hidden tunnel still draws during ${active}`);
    await snapshot(file);
    if (active === 'hyperspace') {
      const shot = await page.screenshot();
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let streakPixels = 0;
      // Ignore the controls. The warp must actually draw bright blue streaks,
      // not merely select the right scene while its ribbons are culled.
      for (let y = 380; y < info.height; y++) {
        for (let x = 120; x < 1000; x++) {
          const offset = (y * info.width + x) * info.channels;
          if (data[offset + 2] > 90 && data[offset + 2] > data[offset] * 1.4) streakPixels++;
        }
      }
      assert.ok(streakPixels > 2000, `Hyperspace streaks are missing: ${streakPixels} bright blue pixels`);
      console.log('Visible hyperspace streak pixels:', streakPixels);
    }
  }
  // Real wheel input through the transition, in both directions.
  await page.getByRole('button', { name: 'Hyperspace', exact: true }).click();
  await page.mouse.move(650, 450);
  await page.mouse.wheel(0, 1800);
  await page.waitForFunction(() => document.querySelector('.journey-lab')?.dataset.activeScene === 'galaxy');
  await page.mouse.wheel(0, -1800);
  await page.waitForFunction(() => document.querySelector('.journey-lab')?.dataset.activeScene === 'hyperspace');
  console.log('Wheel crosses the galaxy handover forward and backward.');

  await page.getByRole('button', { name: 'Open space', exact: true }).click();
  await page.getByRole('slider', { name: 'Look around' }).fill('90');
  await snapshot('06-look-sideways');
  await page.getByRole('slider', { name: 'Look around' }).fill('0');
  await page.getByRole('button', { name: 'Galaxy', exact: true }).click();
  await page.setViewportSize({ width: 430, height: 932 });
  await page.getByRole('button', { name: 'Galaxy', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await snapshot('07-portrait-galaxy');
  await page.getByRole('button', { name: 'Minimise', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Expand', exact: true }).getAttribute('aria-expanded'), 'false');
  await snapshot('08-portrait-minimised');

  // Browser emulation verifies the default, not physical-phone performance.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#loading-overlay.ready-to-enter').waitFor({ timeout: 90000 });
  await page.keyboard.press('Enter');
  await page.locator('#loading-overlay').waitFor({ state: 'detached', timeout: 10000 });
  assert.equal(await page.getByRole('checkbox', { name: 'Gentle transitions' }).isChecked(), true);
  console.log('Reduced-motion preference defaults new transitions to gentle mode.');

  // Original routes must not mount or fetch the galaxy module.
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.journey-lab').count(), 0);
  assert.equal(requests.some((url) => url.includes('/experiments/galaxyJourney')), false);
  console.log('Original route does not load the galaxy experiment.');
  assert.deepEqual(errors, [], 'Browser runtime / shader errors');
  console.log('Browser QA passed.');
} finally {
  await browser.close();
}
