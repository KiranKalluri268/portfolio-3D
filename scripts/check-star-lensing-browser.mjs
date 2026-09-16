import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? '../../my-portfolio/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.LAB_URL ?? 'http://127.0.0.1:5174'}/?world=blackhole&inspect`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { default: lens } = await import('/src/experiments/starLensing.glsl?import&raw');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1, 1);
    const target = new THREE.WebGLRenderTarget(1, 1);
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0], 3));
    geometry.setAttribute('imageBranch', new THREE.Float32BufferAttribute([0], 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { lensPosition: { value: new THREE.Vector3(0,0,-40) },
        lensRadius: { value: 2 }, eye: { value: new THREE.Vector3() },
        source: { value: new THREE.Vector3() } },
      vertexShader: `${lens}
        uniform vec3 source; uniform vec3 eye; varying vec4 encoded;
        void main() {
          float gain; vec3 apparent = lensStar(source, eye, gain);
          encoded = vec4((apparent-eye)/200.0+0.5, min(gain/8.0,1.0));
          gl_Position=vec4(0,0,0,1); gl_PointSize=1.0;
        }`,
      fragmentShader: 'varying vec4 encoded; void main(){gl_FragColor=encoded;}',
    });
    const mesh = new THREE.Points(geometry, material); mesh.frustumCulled = false; scene.add(mesh);
    const sample = (source, branch = 0, eye = [0,0,0], lens = [0,0,-40]) => {
      material.uniforms.source.value.set(...source); material.uniforms.eye.value.set(...eye);
      material.uniforms.lensPosition.value.set(...lens);
      geometry.attributes.imageBranch.setX(0, branch); geometry.attributes.imageBranch.needsUpdate = true;
      renderer.setRenderTarget(target); renderer.render(scene,camera);
      const bytes = new Uint8Array(4); renderer.readRenderTargetPixels(target,0,0,1,1,bytes);
      return { position: Array.from(bytes.slice(0,3), n => (n/255-.5)*200), gain: bytes[3]/255*8 };
    };
    const results = {
      foreground: sample([3,0,-20]), foregroundSecondary: sample([3,0,-20],1),
      primary: sample([18,0,-80]), secondary: sample([18,0,-80],1),
      // Source is outside a 70-degree square camera; secondary is inside.
      offscreen: sample([60,0,-80],1),
      lensBehind: sample([3,0,-20],0,[0,0,0],[0,0,40]),
      shifted: sample([66,48,-32],0,[48,48,48],[48,48,8]),
      exactAlignment: sample([0,0,-80]),
    };
    geometry.dispose(); material.dispose(); target.dispose(); renderer.dispose();
    return results;
  });
  const close = (a,b) => a.every((n,i) => Math.abs(n-b[i]) < 0.8);
  assert.ok(close(result.foreground.position,[3,0,-20]));
  assert.equal(result.foregroundSecondary.gain,0);
  assert.ok(close(result.lensBehind.position,[3,0,-20]));
  assert.ok(result.primary.position[0] > 23);
  assert.ok(result.secondary.position[0] < -5);
  assert.ok(result.secondary.gain > 0);
  assert.ok(Math.abs(result.offscreen.position[0]/result.offscreen.position[2]) < Math.tan(35*Math.PI/180));
  assert.ok(close(result.shifted.position,result.primary.position));
  assert.ok(result.exactAlignment.position.every(Number.isFinite));
  console.log('Actual star GLSL: foreground unchanged, two background images, off-screen source, floating-origin invariance and alignment pass.');
} finally { await browser.close(); }
