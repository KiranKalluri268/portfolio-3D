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
// above the largest camera distance in the journey (45 at the arrival, see
// arriveDist in src/main.js) — that is what guarantees the planet is always
// further from the camera than the black hole is, and so that the black hole can
// only ever be in front of it. Also outside the star shell, which reaches r = 42.
const ORBIT_RADIUS = 65.0;

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
    //
    // Kept far below full exposure. This body is tens of units out from the only
    // source in the system and is seen against the disk's own glow, so a fully
    // exposed globe reads as a foreground prop lit by something off-camera. What
    // it should read as is a dark disc with a lit edge — scale reference, not a
    // second subject.
    float lighting = pow(lambert, 0.85) * 0.30 + 0.015;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    // Atmosphere tracks the light, so the limb glows on the lit side only. It
    // carries most of what is visible now that the surface is held down, which is
    // the right split: the limb is what separates the silhouette from the sky.
    vec3 atmosphere = uAtmosphere * fresnel * (0.06 + lambert * 0.55);

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
   * @param time      elapsed seconds, so the orbit keeps turning even while
   *                  scroll is still — a body in orbit doesn't stop when the
   *                  visitor's hand does
   */
  function update(progress, observer, aspect, time) {
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
    // — see COMPOSE_SHIFT — and the planet sits above and left of it, moving
    // *outward* from it across the fall.
    //
    // Outward, because that is the direction the approach actually takes it. The
    // planet holds a fixed distance from the black hole (ORBIT_RADIUS) while the
    // camera closes from 42 units to around 5. Far out, the two distances are
    // comparable and the planet appears close beside the black hole in the sky.
    // Falling in, the black hole swells to fill the frame while the planet — no
    // nearer than it was, and increasingly off to one side rather than ahead —
    // opens up a wider and wider angle from it. It used to run the other way,
    // starting at the edge and sliding inward, which is the parallax of a body
    // being approached rather than one being passed.
    //
    // How far out it ends has to give way on a narrow viewport. The black hole is
    // the same angular size either way, but portrait has far less width for it to
    // be that size in, so by the last unit it owns most of the frame and the
    // planet has to clear further to stay out from under it.
    const narrow = Math.min(1, Math.max(0, (1.2 - aspect) / 0.8));
    const sxStart = -0.22;
    const sxEnd = -0.70 - 0.18 * narrow;
    const sxHome = sxStart + (sxEnd - sxStart) * eased;
    // Rises as it draws out, so the drift is radial from the black hole rather
    // than a flat slide across the frame.
    const syHome = 0.16 + 0.26 * eased;

    // Revolves around that home point rather than sitting still on it, so it
    // reads as a body in orbit and not a cutout pasted beside the black hole. The
    // orbit is on screen, not in world space: a true orbit at ORBIT_RADIUS (see
    // below for why that distance is fixed) would sweep tens of degrees across
    // the sky, carrying the planet on and off screen and out of scale with
    // everything it needs to stay framed against. Faded in by `eased` so it does
    // not wobble while still arcing in from the edge, and slow enough — one turn
    // every 46 seconds — to look orbital rather than jittery.
    const orbitAngle = time * ((2 * Math.PI) / 46);
    const orbitAmountX = 0.06 * eased;
    const orbitAmountY = orbitAmountX * 0.55; // foreshortened, as a tilted orbital plane would be
    const sx = sxHome + orbitAmountX * Math.cos(orbitAngle);
    const sy = syHome + orbitAmountY * Math.sin(orbitAngle);

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
    // solved for makes the angular size a straight function of progress rather
    // than a side effect of the camera closing on the black hole.
    //
    // Held flat and edging down, for the same reason the drift runs outward: the
    // camera closes on the black hole, not on the planet, and the planet's own
    // distance barely moves across the whole fall. It should not appear to grow.
    // The slight fall is the small real one — the approach ends up slightly
    // further from a body off to the side than it started.
    //
    // It is set against the vertical field of view, which on a tall narrow screen
    // is most of the frame, so it is held back a little as the viewport narrows.
    //
    // Small in absolute terms. Against a black hole that owns most of the frame by
    // the last unit, this is scale reference — the thing that says how big the
    // other thing is — and it stops doing that job the moment it is large enough
    // to read as a subject of its own.
    const framing = Math.min(1, 0.55 + 0.45 * aspect);
    mesh.scale.setScalar(range * (0.016 - 0.003 * eased) * framing);
    mesh.rotation.y = progress * 0.35 + orbitAngle * 0.2 + 0.6;

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
