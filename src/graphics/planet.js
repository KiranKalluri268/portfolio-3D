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

// How far from the black hole the planet sits. This has to stay comfortably
// above the largest camera distance in the journey (42 at the arrival, see
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

  // The planet's world position, fixed the first frame of the fall and not
  // touched again until the fall is left. See update().
  const anchor = new THREE.Vector3();
  let anchored = false;

  /**
   * @param progress  0 as the fall toward the black hole begins, 1 at the end
   * @param observer  the camera being flown, for its position and orientation
   * @param aspect    viewport aspect ratio
   * @param time      elapsed seconds
   */
  function update(progress, observer, aspect, time) {
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

    // The planet is put somewhere once, on the first frame of the fall, and then
    // left alone. Everything the visitor sees it do after that — drawing out from
    // the black hole, growing, sliding as the camera's elevation drops — is the
    // camera moving against a body that isn't.
    //
    // This is the whole point of the arrangement. Its screen position used to be
    // authored as a curve in `progress`, which meant it had no parallax at all:
    // drag the view, or let the idle spin drift, and the star field and the
    // lensing moved while the planet sat exactly where it was. That one missing
    // cue is what made it read as a decal composited over the scene rather than
    // an object inside it, and no amount of tuning the curve fixes it, because
    // the curve is the problem.
    //
    // Two things had to give way for a fixed point to stay framed, both in
    // main.js: the idle orbit now damps to nothing across the fall, and the
    // camera's elevation swing was cut from 55 degrees to 9. A world-fixed body
    // seen from a camera rotating 55 degrees swings further from the rotation
    // than it ever does from the approach, and in the wrong direction.
    if (!anchored) {
      // Aimed rather than picked in world space, so the opening framing is exact
      // regardless of where the idle spin left the camera's azimuth on the way
      // through the tunnel. sx and sy are screen coordinates in [-1, 1] and the
      // target is sampled by screen position, so they land where they say.
      //
      // Around 21 degrees off the view axis, which is chosen backwards from where
      // it has to end up. By the last unit the black hole's shadow subtends some
      // 27 degrees, so anything nearer the axis than about 30 finishes the fall
      // behind it. Fixed at ORBIT_RADIUS, 21 degrees out at the start opens to
      // just past 30 by the end — clear, but not by much more than it needs.
      //
      // Further out again on a narrow viewport, where the black hole owns much
      // more of the frame for the same angular size.
      const narrow = Math.min(1, Math.max(0, (1.2 - aspect) / 0.8));
      const sx = -0.46 - 0.14 * narrow;
      const sy = 0.20;

      // Pushed out along the aim until it is ORBIT_RADIUS from the black hole.
      // That radius is what makes the occlusion right: the planet is composited
      // in the background block, which rays terminating at the horizon never
      // reach, so the black hole covers whatever is behind it and nothing else
      // does. Holding it further from the black hole than the camera ever gets
      // means it is always the further of the two, so "behind" is the only case
      // that can arise and the free occlusion is always the correct one.
      placement.set(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize();

      // Distance along the aim that lands on the orbit: solve |C + t*d| = R. The
      // camera is inside that sphere, which makes the discriminant larger than
      // (C.d) squared, so the root is positive and the planet is never behind us.
      const co = placement.dot(observer.position);
      const range = -co + Math.sqrt(co * co - observer.position.lengthSq() + ORBIT_RADIUS * ORBIT_RADIUS);
      anchor.copy(observer.position).addScaledVector(placement, range);

      // Set once, in world units, and never touched again — apparent size is now
      // radius over distance and the distance is real, so the growth across the
      // fall comes out of the geometry instead of being dialled in. It is a
      // little over half again by the end, against the black hole's eight times.
      // That ratio is the shot: everything grows, one thing grows much faster.
      //
      // The absolute size is set from the opening distance so it reads the same
      // there as it did before, and held back on a narrow viewport, where the
      // vertical field of view is most of the frame.
      const framing = Math.min(1, 0.55 + 0.45 * aspect);
      mesh.scale.setScalar(range * 0.016 * framing);
      anchored = true;
    }

    mesh.position.copy(anchor);
    // Spins on its own axis. Slow, and the only motion left that isn't the
    // camera's — a body this far out covers no meaningful arc of its orbit in the
    // time anyone spends here, so anything faster reads as a turntable.
    mesh.rotation.y = time * 0.012 + 0.6;

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

  // Called whenever the fall is left — scrolled back into the tunnel, where the
  // planet is not drawn — so that coming back down re-frames it. The camera's
  // azimuth drifts while the visitor is away and a point fixed against the old
  // one would be off the edge on return.
  //
  // Deliberately not called on resize. The anchor holding through a resize is the
  // honest behaviour for a body that is actually out there, and re-aiming on
  // every resize event would make the planet jump around on mobile, where hiding
  // and showing the address bar fires them continuously.
  function resetAnchor() {
    anchored = false;
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
    resetPlanetAnchor: resetAnchor,
    resizePlanetTarget: resize,
    disposePlanet: dispose,
  };
}
