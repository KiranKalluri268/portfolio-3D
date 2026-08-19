import * as THREE from 'three';

// The black hole is a raymarched exterior solution — it has no inside to fly
// through, and pushing the camera past the horizon feeds garbage to the geodesic
// integrator. The passage is therefore a scene of its own, swapped in behind a
// blackout while the raymarcher is off. That swap is also a large saving: the
// tunnel costs a few thousand triangles where the raymarcher costs hundreds of
// ray steps per pixel.

const TUNNEL_LENGTH = 400;
const TUNNEL_RADIUS = 3.2;
const TRAVEL_HALF = TUNNEL_LENGTH / 2 - 12; // stay clear of both end caps

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Procedural, matching the project's no-licensed-textures approach. The noise
// lattice wraps on the u axis so the walls have no visible seam where the
// cylinder's UVs meet.
const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  uniform sampler2D uStarTex;
  uniform sampler2D uBgTex;
  uniform float uSkyAmount;
  uniform float uFlow;
  uniform float uExitGlow;
  uniform float uReveal;
  uniform vec3  uColorNear;
  uniform vec3  uColorFar;

  float hash(vec2 i, float period) {
    i.x = mod(i.x, period);
    return fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float vnoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i, period);
    float b = hash(i + vec2(1.0, 0.0), period);
    float c = hash(i + vec2(0.0, 1.0), period);
    float d = hash(i + vec2(1.0, 1.0), period);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p, float period) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int k = 0; k < 5; k++) {
      total += amplitude * vnoise(p, period);
      p *= 2.0;
      period *= 2.0;
      amplitude *= 0.5;
    }
    return total;
  }

  // Lifted from the raymarcher, because these are meant to be recognisably the
  // same stars: the star plate packs temperature in red and brightness in green
  // rather than storing colour, so sampling it raw gives a red-green field that
  // looks nothing like the sky outside.
  vec3 temp_to_color(float temp_kelvin){
    vec3 color;
    temp_kelvin = clamp(temp_kelvin, 1000.0, 40000.0) / 100.0;
    if (temp_kelvin <= 66.0){
      color.r = 255.0;
      color.g = clamp(99.4708025861 * log(temp_kelvin) - 161.1195681661, 0.0, 255.0);
    } else {
      color.r = clamp(329.698727446 * pow(max(temp_kelvin - 60.0, 0.0), -0.1332047592), 0.0, 255.0);
      color.g = clamp(288.1221695283 * pow(max(temp_kelvin - 60.0, 0.0), -0.0755148492), 0.0, 255.0);
    }
    if (temp_kelvin >= 66.0) {
      color.b = 255.0;
    } else if (temp_kelvin <= 19.0) {
      color.b = 0.0;
    } else {
      color.b = clamp(138.5177312231 * log(temp_kelvin - 10.0) - 305.0447927307, 0.0, 255.0);
    }
    return color / 255.0;
  }

  void main() {
    // vUv.y is 0 at the far mouth and 1 behind the camera, so "toExit" grows
    // toward the light we are heading for.
    float toExit = 1.0 - vUv.y;

    float body = fbm(vec2(vUv.x * 8.0, vUv.y * 50.0 - uFlow), 8.0);
    float streak = fbm(vec2(vUv.x * 26.0, vUv.y * 7.0 - uFlow * 0.5), 26.0);

    float wall = pow(body, 1.5) * 0.9 + pow(streak, 2.5) * 1.1;

    // Lit relative to the camera rather than to a fixed point on the tube.
    // Without this the walls hang in place as a static starburst; with it the
    // lit stretch travels with the ship and the surface streams past.
    float dist = length(vWorldPos - cameraPosition);
    float headlight = exp(-dist * 0.055) * 1.35 + 0.06;

    vec3 color = mix(uColorNear, uColorFar, smoothstep(0.1, 1.0, toExit));
    color *= wall * headlight;

    // ── The sky, wrapped onto the wall ──
    // The same two plates the world outside uses, read with the tube's own UVs:
    // x wraps around the wall, y runs along it. An equirectangular sky forced
    // onto a cylinder is the distortion — it arrives stretched down the tube and
    // wound around it, which is the point. The y scale is what sets how hard it
    // is drawn out; at 3 the field is stretched enough to read as motion rather
    // than as a photograph of the sky pasted inside a pipe.
    //
    // Scrolled by uFlow so it streams past with the walls instead of sitting
    // still while the noise underneath it moves — the two coming apart is
    // immediately obvious and reads as a texture sliding over a surface.
    vec2 skyUv = vec2(vUv.x, fract(vUv.y * 3.0 - uFlow * 0.02));

    vec4 star = texture2D(uStarTex, skyUv);
    vec3 sky = vec3(0.0);
    if (star.g > 0.0) {
      sky += temp_to_color(1000.0 + 39000.0 * star.r) * star.g * 0.6;
    }
    sky += texture2D(uBgTex, skyUv).rgb * 0.22;

    // Faded out toward the far end. The exit glow and the bloom threshold are
    // both already climbing there, and a broadband star field added on top of
    // them takes the last third of the passage to a flat white screen — the
    // walls, the mouth and the light all bleach into one thing.
    sky *= 1.0 - pow(toExit, 2.5);

    // Tinted toward the far end's warmth and lit by the same headlight, so the
    // stars belong to the tunnel's depth cue rather than floating on top of it
    // at full brightness all the way down the tube.
    color += sky * uColorFar * headlight * uSkyAmount;

    // Softens the rim so the tunnel opens into the light rather than stopping at
    // a disc. Confined to the far end — spread any wider and it floods the whole
    // tube through bloom and the passage becomes a white screen.
    color += uColorFar * pow(toExit, 12.0) * uExitGlow * 0.45;

    gl_FragColor = vec4(color * uReveal, 1.0);
  }
`;

export function createTunnel(aspect = 1) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, aspect, 0.1, 2000);

  const geometry = new THREE.CylinderGeometry(
    TUNNEL_RADIUS, TUNNEL_RADIUS, TUNNEL_LENGTH, 96, 1, true
  );
  // CylinderGeometry runs along Y; the camera flies along -Z.
  geometry.rotateX(Math.PI / 2);

  const uniforms = {
    uStarTex: { value: null },
    uBgTex: { value: null },
    uSkyAmount: { value: 1.0 },
    uFlow: { value: 0 },
    uExitGlow: { value: 0 },
    uReveal: { value: 0 },
    uColorNear: { value: new THREE.Color(0x3a2a6b) },
    uColorFar: { value: new THREE.Color(0xffdcc0) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const walls = new THREE.Mesh(geometry, material);
  scene.add(walls);

  // The mouth we are heading for. Additive so bloom picks it up as a light
  // source rather than a lit surface.
  const mouthGeometry = new THREE.CircleGeometry(TUNNEL_RADIUS * 0.995, 96);
  const mouthMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
  mouth.position.z = -TUNNEL_LENGTH / 2 + 1;
  scene.add(mouth);

  /**
   * @param progress  0 at the tunnel entrance, 1 at the mouth
   * @param reveal    0 hides the walls entirely, for handing off to the blackout
   * @param elapsed   seconds, for drift that does not depend on scrolling
   */
  function update(progress, reveal, elapsed) {
    const eased = progress * progress * (3.0 - 2.0 * progress);

    camera.position.z = TRAVEL_HALF - eased * (TRAVEL_HALF * 2);

    // A little unsteadiness so it reads as piloted rather than railed.
    camera.position.x = Math.sin(elapsed * 0.31) * 0.16;
    camera.position.y = Math.cos(elapsed * 0.24) * 0.13;
    camera.rotation.z = Math.sin(elapsed * 0.19) * 0.035;

    uniforms.uFlow.value = eased * 46 + elapsed * 0.6;
    uniforms.uReveal.value = reveal;
    // The mouth only starts to bite in the last third, so the arrival reads as
    // arriving somewhere rather than a light that was always on.
    uniforms.uExitGlow.value = Math.max(0, (progress - 0.35) / 0.65);
    mouthMaterial.opacity = Math.max(0, (progress - 0.45) / 0.55) * 0.4 * reveal;
  }

  // The plates arrive with the rest of the loader, after the tunnel is built.
  //
  // Cloned rather than used directly. The wall wraps the sky all the way around
  // the tube, so it needs RepeatWrapping to close without a seam — and the
  // originals are ClampToEdge because that is what the raymarcher wants. A clone
  // shares the uploaded image but carries its own sampler state, so the tunnel
  // gets its wrap without reaching into the world's copy.
  let ownedTextures = [];
  function setTextures(starTexture, bgTexture) {
    ownedTextures.forEach((t) => t.dispose());
    ownedTextures = [starTexture, bgTexture].filter(Boolean).map((source) => {
      const copy = source.clone();
      copy.wrapS = THREE.RepeatWrapping;
      copy.wrapT = THREE.RepeatWrapping;
      copy.needsUpdate = true;
      return copy;
    });
    uniforms.uStarTex.value = ownedTextures[0] ?? null;
    uniforms.uBgTex.value = ownedTextures[1] ?? null;
  }

  function resize(nextAspect) {
    if (camera.aspect === nextAspect) return;
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    mouthGeometry.dispose();
    mouthMaterial.dispose();
    ownedTextures.forEach((t) => t.dispose());
    ownedTextures = [];
  }

  return { tunnelScene: scene, tunnelCamera: camera, updateTunnel: update, resizeTunnel: resize, disposeTunnel: dispose, setTunnelTextures: setTextures };
}
