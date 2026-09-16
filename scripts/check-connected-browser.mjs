import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import('../../my-portfolio/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const requests = [];
  page.on('request', request => { if (request.resourceType() === 'image') requests.push(request.url()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    window.draws = { wormhole: 0, blackhole: 0, legacy: 0, tunnel: 0, world: 0 };
    const sources = new WeakMap(), programs = new WeakMap(), current = new WeakMap();
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const method of ['shaderSource', 'attachShader', 'useProgram', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = proto[method]; if (!original) continue;
        proto[method] = function(...args) {
          if (method === 'shaderSource') sources.set(args[0], args[1]);
          if (method === 'attachShader') {
            const s = sources.get(args[1]) ?? '';
            if (s.includes('float h2 = dot(c,c)')) programs.set(args[0], 'legacy');
            if (s.includes('vec3 destinationSky')) programs.set(args[0], 'wormhole');
            if (s.includes('uniform sampler2D diskTexture')) programs.set(args[0], 'blackhole');
            if (s.includes('float toExit = 1.0 - vUv.y')) programs.set(args[0], 'tunnel');
            if (s.includes('attribute vec3 starPosition')) programs.set(args[0], 'world');
          }
          if (method === 'useProgram') current.set(this, args[0]);
          if (method.startsWith('draw')) { const kind = programs.get(current.get(this)); if (kind) window.draws[kind]++; }
          return original.apply(this, args);
        };
      }
    }
  });
  await page.goto('http://127.0.0.1:5174/?journey=connected&inspect');
  await page.locator('#loading-overlay.ready-to-enter').waitFor({ timeout: 90000 });
  await page.keyboard.press('Enter');
  await page.locator('#loading-overlay').waitFor({ state: 'detached', timeout: 15000 });
  await mkdir('screenshots/connected', { recursive: true });
  for (const [label, kind, scene] of [['Wormhole', 'wormhole', 'wormhole'], ['Tunnel', 'tunnel', 'tunnel'], ['Open space', 'world', 'world'], ['Fast travel', 'world', 'world'], ['Galaxy', 'world', 'world'], ['Hyperspace 2', 'world', 'world'], ['Black hole', 'blackhole', 'black-hole'], ['Wormhole', 'wormhole', 'wormhole'], ['Tunnel', 'tunnel', 'tunnel'], ['Open space', 'world', 'world']]) {
    await page.locator('.connected-nav').getByText(label, { exact: true }).click();
    await page.waitForFunction(scene => document.querySelector('.world-panel').dataset.activeScene === scene, scene);
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.draws = { wormhole: 0, blackhole: 0, legacy: 0, tunnel: 0, world: 0 }; });
    await page.waitForTimeout(250);
    const draws = await page.evaluate(() => window.draws);
    assert.ok(draws[kind] > 0, `${label} draws`);
    const allowed = kind === 'wormhole' || kind === 'blackhole' ? [kind, 'world'] : [kind];
    for (const other of Object.keys(draws).filter(k => !allowed.includes(k))) assert.equal(draws[other], 0, `${other} must not draw behind ${label}`);
    if (kind === 'wormhole' || kind === 'blackhole') {
      assert.ok(draws.world > 0, 'Destination shares the resident star world');
      const destination = await page.evaluate(() => window.__freeWorld().destination);
      assert.equal(destination.renderer, kind === 'wormhole' ? 'local-transmitting-geodesic-volume' : 'local-geodesic-volume');
    }
    await page.screenshot({ path: `screenshots/connected/${label.replaceAll(' ', '-')}.png` });
    console.log(label, draws);
  }
  await page.mouse.move(650, 450);
  await page.mouse.wheel(0, -1800);
  await page.waitForFunction(() => document.querySelector('.world-panel').dataset.activeScene === 'tunnel');
  await page.mouse.wheel(0, 1800);
  await page.waitForFunction(() => document.querySelector('.world-panel').dataset.activeScene === 'world');
  // Regression for the reported bug: labels/draw calls alone passed while the
  // camera replayed galaxy arrival and then jumped to the black-hole end pose.
  const seek = async units => {
    await page.mouse.move(650, 450);
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.waitForTimeout(700);
      const offset = await page.evaluate(u => (u - window.__connectedJourney.units) * innerHeight, units);
      if (Math.abs(offset) < 0.8) break;
      await page.mouse.wheel(0, offset);
    }
    await page.waitForFunction(u => Math.abs(window.__connectedJourney.units - u) < 0.001, units);
  };
  await seek(31);
  const galaxyZ = await page.evaluate(() => window.__freeWorld().position[2]);
  await seek(31.01);
  const departureZ = await page.evaluate(() => window.__freeWorld().position[2]);
  assert.ok(departureZ < galaxyZ && galaxyZ - departureZ < 0.1, 'continuous forward departure');
  await seek(33);
  assert.ok(await page.evaluate(() => window.__freeWorld().journey.distance > 4000), 'camera flies through the galaxy');
  await page.screenshot({ path: 'screenshots/connected/galaxy-fly-through.png' });
  await seek(34);
  const warpStart = await page.evaluate(() => window.__freeWorld().position[2]);
  await page.getByRole('button', { name: 'Hide panel', exact: true }).click();
  await page.mouse.wheel(0, 450);
  await page.screenshot({ path: 'screenshots/connected/second-leg-moving.png' });
  await page.waitForTimeout(700);
  const warpEnd = await page.evaluate(() => window.__freeWorld().position[2]);
  assert.ok(warpStart - warpEnd > 250, 'second hyperspace physically moves through hundreds of world units');
  await seek(34);
  assert.ok(Math.abs((await page.evaluate(() => window.__freeWorld().position[2])) - warpStart) < 0.01, 'reverse returns to the same world position');
  await seek(36.995);
  assert.ok((await page.evaluate(() => window.__connectedJourney.veil)) > 0.99);
  await seek(37.005);
  const entry = await page.evaluate(() => window.__connectedJourney);
  assert.ok(entry.veil > 0.99 && entry.distance > 29, 'handoff covered, black hole starts far away');
  await seek(37.8);
  await page.screenshot({ path: 'screenshots/connected/black-hole-arrival.png' });
  const farDistance = await page.evaluate(() => window.__connectedJourney.distance);
  await seek(46);
  assert.ok((await page.evaluate(() => window.__connectedJourney.distance)) < farDistance / 3, 'scroll actually falls toward the black hole');
  await seek(37.005);
  assert.ok((await page.evaluate(() => window.__connectedJourney.distance)) > 29, 'reverse restores far arrival');
  await seek(36.995);
  assert.ok((await page.evaluate(() => window.__connectedJourney.veil)) > 0.99, 'reverse seam stays covered');
  console.log('Galaxy fly-through, real second-leg travel, reverse retracing, covered seam and distant-to-close fall pass.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  for (const [label, scene] of [['Wormhole', 'wormhole'], ['Black hole', 'black-hole']]) {
    await page.locator('.connected-nav').getByText(label, { exact: true }).click();
    await page.waitForFunction(s => document.querySelector('.world-panel').dataset.activeScene === s, scene);
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Hide panel', exact: true }).click();
    await page.screenshot({ path: `screenshots/connected/${scene}-portrait.png` });
    await page.getByRole('button', { name: 'Show controls', exact: true }).click();
  }
  assert.equal(await page.locator('canvas').count() >= 1, true);
  assert.deepEqual(errors, []);
  assert.ok(requests.some(url => /star_noise-generated/.test(url)), 'Wormhole destination loads its star texture');
  assert.ok(requests.some(url => /milkyway-preview/.test(url)), 'Wormhole destination loads its nebula texture');
  console.log('Connected journey: entry, scene draw isolation and reversible wheel handover pass.');
} finally { await browser.close(); }
