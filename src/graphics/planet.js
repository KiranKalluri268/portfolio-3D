import * as THREE from 'three';

// The system we arrive in needs a body in it, not just a black hole in an empty
// sky. The planet is a mesh rendered to its own target and sampled back by the
// raymarcher, the same trick the star field already uses — see
// createParticleSystem() — with two differences that matter.
//
// Stars are emitters and composite additively. A planet has a night side, and
// adding it would leave that side transparent with the sky showing through, so
// this target is composited alpha-over: the material writes an opaque alpha and
// the target is cleared to a transparent one.
//
// And the stars are sampled along the bent ray, where the planet is sampled along
// the straight one. Bending it is more nearly correct, and does produce a second
// lensed image of the planet beside the black hole — but that image reads as a
// detached sliver rather than as physics, and the bending visibly warps the planet
// itself. Both are worst in portrait, where the black hole fills much more of the
// frame.

const SEGMENTS = 64;

// How far from the black hole the planet orbits. This has to stay comfortably
// above the largest camera distance in the journey (25 at the arrival, see
// JOURNEY in src/main.js) — that is what guarantees the planet is always further
// from the camera than the black hole is, and so that the black hole can only
// ever be in front of it. Also outside the star shell, which reaches r = 42.
const ORBIT_RADIUS = 55.0;

// Narrow enough that the planet stays round wherever it is placed. See the note
// in update() — the raymarcher's own frustum is far too wide to draw a sphere
// off-axis without flattening it.
const PLANET_FOV = 45;

const placement = new THREE.Vector3();

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

    // Lit by the accretion disk at the centre of the system, which is the only
    // source out here.
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
   * @param progress  0 as the fall toward the black hole begins, 1 at the end
   * @param observer  the camera being flown, for its position and orientation
   * @param aspect    viewport aspect ratio
   */
  function update(progress, observer, aspect) {
    const eased = progress * progress * (3.0 - 2.0 * progress);

    // The camera rides with the observer and looks where it looks, so the planet
    // is lit and shaded consistently with the rest of the scene. It sees through a
    // much narrower lens, and that is deliberate: the raymarcher's frustum is
    // around 116 degrees across on a wide screen, and a sphere well off its axis
    // is drawn stretched by 1/cos of that angle — the upper-left corner is some 65
    // degrees out, which turned the planet into a flat ellipse. Its own lens keeps
    // it round wherever it is put.
    camera.position.copy(observer.position);
    camera.up.copy(observer.up);
    camera.lookAt(0, 0, 0);
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    camera.updateMatrixWorld();

    // sx and sy are screen coordinates in [-1, 1], and the target is sampled by
    // screen position, so they land exactly. The black hole composes at sx = +0.5
    // — see COMPOSE_SHIFT — and the planet rides above and left of it, arcing over
    // and in toward it across the fall: near enough to read as being in its system,
    // clear enough of the disk not to be drawn over it.
    //
    // How far in it gets has to give way on a narrow viewport. The black hole is
    // the same angular size either way, but portrait has far less width for it to
    // be that size in, so by the last unit it owns most of the frame — and a
    // planet that settles nicely beside it on desktop ends up buried behind it.
    const narrow = Math.min(1, Math.max(0, (1.2 - aspect) / 0.8));
    const sxEnd = -0.10 - 0.48 * narrow;
    const sx = -0.80 + (sxEnd + 0.80) * eased;
    const sy = 0.30 + 0.22 * Math.sin(Math.PI * (0.15 + 0.70 * eased));

    // Placed by unprojecting that screen position and pushing out along it until
    // the planet is ORBIT_RADIUS from the black hole.
    //
    // Unprojecting, because a point picked in world space cannot be kept in frame:
    // the orbit angle drifts with scroll momentum rather than scroll position, so
    // earlier attempts at this put the planet behind the camera or off the edge
    // depending on how the visitor had scrolled. Aimed, the framing is exact by
    // construction and a pure function of progress.
    //
    // The radius, because it is what makes the occlusion right. The planet is
    // composited in the background block, which rays terminating at the horizon
    // never reach — so the black hole covers whatever is behind it, and nothing
    // else does. Holding the planet further from the black hole than the camera
    // ever gets means it is always the further of the two, so "behind" is the only
    // case that can arise and the free occlusion is always the correct one.
    placement.set(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize();

    // Distance along the aim that lands on the orbit: solve |C + t*d| = R. The
    // camera is always inside that sphere, which makes the discriminant larger
    // than (C.d) squared, so the root is positive and the planet is never behind
    // us however the orbit has drifted.
    const co = placement.dot(observer.position);
    const range = -co + Math.sqrt(co * co - observer.position.lengthSq() + ORBIT_RADIUS * ORBIT_RADIUS);
    mesh.position.copy(observer.position).addScaledVector(placement, range);

    // Apparent size is radius over distance, so scaling by the distance just
    // solved for keeps growth a straight function of progress rather than a side
    // effect of the camera closing on the black hole.
    //
    // It is set against the vertical field of view, which on a tall narrow screen
    // is most of the frame — left alone the planet grows until it crowds the black
    // hole in portrait while still looking right on desktop, so it is held back a
    // little as the viewport narrows.
    const framing = Math.min(1, 0.55 + 0.45 * aspect);
    mesh.scale.setScalar(range * (0.075 + 0.040 * eased) * framing);
    mesh.rotation.y = progress * 0.35 + 0.6;

    // Lit by the accretion disk, which is the only light in this system and sits
    // at the origin the planet orbits. It used to be lit relative to the view,
    // because on the far side of the wormhole there was no source in frame to
    // justify anything else — the throat transmits rather than emits.
    //
    // Being lit from the middle of the shot is also why the phase is stable now.
    // A world-fixed light direction was a coin toss when the planet's own position
    // followed the drifting orbit angle; pointing at the origin, the terminator
    // falls in the same place whatever the camera has done.
    uniforms.uLightDir.value.copy(mesh.position).negate().normalize();
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
    updatePlanet: update,
    resizePlanetTarget: resize,
    disposePlanet: dispose,
  };
}
