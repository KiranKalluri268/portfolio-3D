import * as THREE from 'three';

// Blend two fully lit renders. Only the overlap pays for both destinations.
export function createSceneBlend(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1);
  const size = new THREE.Vector2();
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { first: { value: target.texture }, second: { value: null }, blend: { value: 0 } },
    vertexShader: 'varying vec2 texCoord; void main(){ texCoord = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'varying vec2 texCoord; uniform sampler2D first; uniform sampler2D second; uniform float blend; void main(){ gl_FragColor = mix(texture2D(first, texCoord), texture2D(second, texCoord), blend); }',
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene(); scene.add(quad);
  const camera = new THREE.Camera();
  return {
    render(amount, drawFirst, drawSecond) {
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target); drawFirst();
        material.uniforms.second.value = drawSecond();
        material.uniforms.blend.value = amount;
        renderer.setRenderTarget(previous); renderer.render(scene, camera);
      } finally { renderer.setRenderTarget(previous); }
    },
    dispose() { target.dispose(); material.dispose(); quad.geometry.dispose(); },
  };
}
