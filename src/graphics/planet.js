import * as THREE from 'three';

// The new world needs somewhere to be, not just a different colour of sky. The
// planet is a mesh rendered to its own target and sampled back by the raymarcher,
// the same trick the star field already uses — see createParticleSystem() — with
// two differences that matter.
//
// Stars are emitters and composite additively. A planet has a night side, and
// adding it would leave that side transparent with the sky showing through, so
// this target is composited alpha-over: the material writes an opaque alpha and
// the target is cleared to a transparent one.
//
// And the stars are sampled along the bent ray, where the planet is sampled along
// the straight one. Bending it is more nearly correct, and does produce a second
// lensed image of the planet beside the throat — but that image reads as a
// detached sliver rather than as physics, and the bending visibly warps the planet
// itself. Both are worst in portrait, where the throat fills much more of the
// frame.

const SEGMENTS = 64;

// Mirrors COMPOSE_SHIFT in fragmentShader.glsl — the rays are aimed half a screen
// left of the camera axis so the orbited object composes at 3/4 width. Placement
// below has to allow for it, or a requested screen position lands half a screen
// away from where it was asked for.
const COMPOSE_SHIFT = 0.5;

// How far in front of the observer the planet rides. Fixed, so its apparent size
// is set by its own scale rather than by wherever the camera has got to.
const RANGE = 96.0;

// Narrow enough that the planet is never near the edge of its own frustum, where
// the projection would stretch it.
const PLANET_FOV = 50;

// How far round from the viewing axis the light sits. At 0 the planet is flatly
// lit and reads as a disc; too far and it is mostly night. This holds a gibbous
// phase with the terminator visible down one side.
const TERMINATOR_SWING = 42 * Math.PI / 180;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const toCamera = new THREE.Vector3();
const placement = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const frameUp = new THREE.Vector3();

const vertexShader = /* glsl */ `
  varying vec3 vObjectPos;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vObjectPos = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Procedural, matching the project's no-licensed-textures approach.
const fragmentShader = /* glsl */ `
  varying vec3 vObjectPos;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  uniform vec3 uLightDir;
  uniform vec3 uLandLow;
  uniform vec3 uLandHigh;
  uniform vec3 uOcean;
  uniform vec3 uAtmosphere;
  uniform float uSeed;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int k = 0; k < 5; k++) {
      total += amplitude * vnoise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 p = normalize(vObjectPos) * 2.4 + uSeed;

    float elevation = fbm(p);
    // Continents rather than an even scatter: the ridged term clusters the high
    // ground instead of leaving noise spread flat across the whole sphere.
    float ridged = 1.0 - abs(fbm(p * 1.8) * 2.0 - 1.0);
    elevation = elevation * 0.75 + ridged * 0.35;

    float land = smoothstep(0.48, 0.56, elevation);
    vec3 surface = mix(uOcean, mix(uLandLow, uLandHigh, smoothstep(0.5, 0.78, elevation)), land);

    // Lit from off-screen. The throat transmits rather than emits, so there is no
    // light source in frame to justify lighting it from the middle of the shot.
    float lambert = max(dot(n, normalize(uLightDir)), 0.0);
    // A little wrap so the terminator is a band rather than a hard edge, and a
    // floor so the night side is dark without being a hole in the sky.
    float lighting = pow(lambert, 0.85) * 0.95 + 0.05;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    // Atmosphere tracks the light, so the limb glows on the lit side only.
    vec3 atmosphere = uAtmosphere * fresnel * (0.25 + lambert * 1.35);

    gl_FragColor = vec4(surface * lighting + atmosphere, 1.0);
  }
`;

export function createPlanet(width, height) {
  const scene = new THREE.Scene();
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });
  const camera = new THREE.PerspectiveCamera(PLANET_FOV, width / height, 0.1, 100000);
  const viewProjection = new THREE.Matrix4();

  const geometry = new THREE.SphereGeometry(1, SEGMENTS, SEGMENTS / 2);
  const uniforms = {
    uLightDir: { value: new THREE.Vector3(-0.5, 0.35, 0.8).normalize() },
    uLandLow: { value: new THREE.Color(0x2f5d3a) },
    uLandHigh: { value: new THREE.Color(0xb2a279) },
    uOcean: { value: new THREE.Color(0x14315e) },
    uAtmosphere: { value: new THREE.Color(0x6fa8ff) },
    uSeed: { value: 3.7 },
  };

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  /**
   * @param progress  0 as the departure begins, 1 at the end of the journey
   * @param observer  the camera being flown, for its position and orientation
   * @param aspect    viewport aspect ratio
   */
  function update(progress, observer, aspect) {
    const eased = progress * progress * (3.0 - 2.0 * progress);

    // Aimed at the screen position it should occupy, rather than put at a point in
    // the world and hoped over. The orbit angle drifts with scroll momentum and
    // the camera's distance changes fivefold across the departure, so any fixed
    // world point sweeps through frame at a rate that depends on how the visitor
    // scrolled — earlier attempts at this put the planet behind the camera, or off
    // the edge, depending on the run. Built from the observer's own basis, the
    // framing is exact by construction and a pure function of progress.
    //
    // sx and sy are screen coordinates in [-1, 1]. The planet swings in from the
    // left edge and settles left of the throat, which composes at sx = +0.5.
    //
    // How far left it settles is not a free choice. The screen is a rectilinear
    // projection about 116 degrees across on a wide viewport, and a sphere at
    // angle theta off its axis is drawn stretched by 1/cos(theta) — measured at
    // 1.52 resting near the left edge, against 1.04 near the middle. Nothing about
    // how the planet is rendered can undo that; it is the final projection doing
    // it, so the only lever is where the planet sits. Settling at around 0.15
    // holds the stretch near 1.3 while still leaving clear air before the throat.
    // Portrait never had the problem, its frustum being roughly 50 degrees across.
    const sx = -0.95 + 1.00 * eased;
    const sy = -0.14 + 0.05 * eased;

    const uvfov = Math.tan(observer.fov / 2 * Math.PI / 180);
    forward.copy(observer.position).negate().normalize();
    right.crossVectors(forward, observer.up).normalize();
    frameUp.crossVectors(right, forward);

    // Mirrors how the raymarcher casts its rays, COMPOSE_SHIFT and all, so a
    // requested screen position lands on that exact pixel.
    placement.copy(forward)
      .addScaledVector(right, (sx - COMPOSE_SHIFT) * aspect * uvfov)
      .addScaledVector(frameUp, sy * uvfov)
      .normalize();

    mesh.position.copy(observer.position).addScaledVector(placement, RANGE);
    // Apparent size is radius over range, so scaling by range keeps growth a
    // straight function of progress rather than a side effect of the camera's own
    // retreat.
    // Apparent size is set against the vertical field of view, which on a tall
    // narrow screen is most of the frame — left alone, the planet grows until it
    // is touching the throat in portrait while still looking right on desktop.
    // Held back a little as the viewport narrows.
    const framing = Math.min(1, 0.55 + 0.45 * aspect);
    mesh.scale.setScalar(RANGE * (0.095 + 0.075 * eased) * framing);
    mesh.rotation.y = progress * 0.35 + 0.6;

    // Pointed at the planet, through a much narrower lens than the raymarcher's.
    // The raymarcher's frustum is around 116 degrees across on a wide screen, and
    // a sphere sitting 40-odd degrees off its axis projects to an ellipse — 1.66
    // wide to tall, measured, and only on desktop, portrait being narrow enough to
    // escape it. Giving the planet its own centred, narrow camera keeps it round
    // wherever it is put, and the shader locates it by this camera's matrix rather
    // than by a mapping that would have to be kept in step by hand.
    camera.position.copy(observer.position);
    camera.up.copy(observer.up);
    camera.lookAt(mesh.position);
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    // Lit relative to where the planet is being viewed from, not from a fixed
    // point in the world — which would make the phase depend on where the orbit
    // had drifted to, and arriving at a black disc a coin toss. Anchored to the
    // view, the terminator sits in the same place every time.
    toCamera.subVectors(camera.position, mesh.position).normalize();
    uniforms.uLightDir.value
      .copy(toCamera)
      .applyAxisAngle(WORLD_UP, TERMINATOR_SWING)
      .addScaledVector(WORLD_UP, 0.28)
      .normalize();
  }

  function resize(nextWidth, nextHeight) {
    target.setSize(nextWidth, nextHeight);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    target.dispose();
  }

  return {
    planetScene: scene,
    planetTarget: target,
    planetCamera: camera,
    planetViewProjection: viewProjection,
    planetRange: RANGE,
    updatePlanet: update,
    resizePlanetTarget: resize,
    disposePlanet: dispose,
  };
}
