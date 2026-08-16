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

// Must match COMPOSE_SHIFT in fragmentShader.glsl, which slides the projection
// sideways so the black hole composes three quarters of the way across instead
// of dead centre. The planet is sampled by screen position, so its camera has to
// carry the same shift or the two disagree about where a direction lands.
const COMPOSE_SHIFT = 0.5;

// Where the planet is put, the first frame of the fall.
//
// Azimuth is relative to the camera's own, plus half a turn — so the planet sits
// beyond the black hole rather than off to one side of it. That is what the
// reference frame has, and it is also what makes the approach read: a body on
// the far side is one the fall genuinely closes on, so it grows, just far more
// slowly than the thing being fallen into. The small offset on top takes it off
// the exact axis and puts it to one side.
//
// Elevation is absolute, measured from the disk plane, and it is the number that
// does the most work in the final frame. The camera rides 14 to 5 degrees above
// that plane, so anything much under about 15 degrees comes out level with the
// disk or beneath it, which is where this used to sit. Well above it, the planet
// clears the near-side arc and reads against empty sky.
//
// Both are picked backwards from where the planet has to end up. By the last
// unit the black hole's shadow reaches about 0.51 of half the frame height, and
// the planet finishes just outside its upper left corner — close enough to read
// as being in its system, clear of the near-side arc. 32 and 24 degrees is what
// lands there on a wide viewport and still leaves it comfortably on screen on a
// phone, where the same world position throws far wider across a narrow frame.
const ANCHOR_AZIMUTH_OFFSET = 32.0 * Math.PI / 180;
const ANCHOR_ELEVATION = 24.0 * Math.PI / 180;

// World radius. Apparent size is this over the real distance and nothing else,
// so it is set once and the fall does the rest.
const PLANET_RADIUS = 2.2;

const DEG_TO_RAD = Math.PI / 180;

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
    // The reference frame has this as a near-black silhouette, and that is what
    // it was for a while. It does not survive being shrunk: at a couple of
    // percent of frame height a dark disc against dark sky is something you have
    // to go looking for, and a thing nobody finds is not scale reference. Exposed
    // enough to be picked out at a glance instead, which is the job it is here to
    // do — still well under the disk, so it reads as lit by it rather than as its
    // own source.
    float lighting = pow(lambert, 0.85) * 0.85 + 0.06;

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    // Atmosphere tracks the light, so the limb glows on the lit side only. At
    // this size the rim is a good part of the disc, and it is the blue that makes
    // the planet findable against a field of white stars.
    vec3 atmosphere = uAtmosphere * fresnel * (0.15 + lambert * 1.10);

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
  const camera = new THREE.PerspectiveCamera(90, width / height, 0.1, 100000);
  let projectionFov = -1;
  let projectionAspect = -1;

  // Reproduces the raymarcher's projection exactly, off-centre shift included.
  //
  // The two used to disagree: this camera ran a 45 degree lens against the
  // shader's 90, so a direction landed at half the screen offset it should have,
  // and the shift meant it landed on the wrong side of centre as well. That was
  // survivable while the planet's screen position was authored outright — the
  // numbers were tuned against what came out, not against what was correct — but
  // it is the whole game once the planet is a fixed point in the world and the
  // projection is what decides where it appears.
  //
  // Deriving the frustum: the shader builds its ray as forward + right*x*t +
  // up*y*t, where t = tan(fov/2), y runs -1 to 1 up the screen, and x runs -1 to
  // 1 across it, shifted by COMPOSE_SHIFT and then scaled by the aspect ratio.
  // Its right vector is cross(forward, up), which in three.js view space — where
  // forward is -Z and up is +Y — is +X. So the two agree on handedness, and the
  // near plane bounds fall straight out of substituting x and y at the edges.
  //
  // The wide lens costs a little shape: a sphere this far off axis is stretched
  // by 1/cos of the angle, around 12 percent out at 27 degrees. That is the
  // correct projection of a sphere through a wide lens rather than an error, and
  // at this size it is invisible. It was a real problem at the 65 degrees the
  // planet used to sit at, which is what the narrow lens was there to dodge.
  function applyProjection(fov, aspect) {
    if (fov === projectionFov && aspect === projectionAspect) return;
    projectionFov = fov;
    projectionAspect = aspect;

    const halfHeight = camera.near * Math.tan(fov / 2 * DEG_TO_RAD);
    const halfWidth = halfHeight * aspect;
    camera.projectionMatrix.makePerspective(
      (-1 - COMPOSE_SHIFT) * halfWidth,
      (1 - COMPOSE_SHIFT) * halfWidth,
      halfHeight,
      -halfHeight,
      camera.near,
      camera.far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

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
    // The camera rides with the observer, looks where it looks, and now sees
    // through the same lens — see applyProjection().
    camera.position.copy(observer.position);
    camera.up.copy(observer.up);
    camera.lookAt(0, 0, 0);
    applyProjection(observer.fov, aspect);
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
      // Spherical coordinates about the black hole, in the observer's own
      // convention — see applyOrbitPosition() in src/camera/Observer.js.
      //
      // The azimuth is taken from the camera's rather than fixed in the world,
      // because the idle spin leaves it somewhere arbitrary on the way through
      // the tunnel and a world-fixed azimuth would put the planet anywhere at
      // all. Everything that matters — the distance, the elevation above the
      // disk, and so how the fall changes both — is absolute.
      //
      // ORBIT_RADIUS is also what makes the occlusion right. The planet is
      // composited in the background block, which rays terminating at the horizon
      // never reach, so the black hole covers whatever is behind it and nothing
      // else does. Holding it further from the black hole than the camera ever
      // gets means it is always the further of the two, so "behind" is the only
      // case that can arise and the free occlusion is always the correct one.
      const azimuth = observer.theta + Math.PI + ANCHOR_AZIMUTH_OFFSET;
      const cosElevation = Math.cos(ANCHOR_ELEVATION);
      anchor.set(
        ORBIT_RADIUS * cosElevation * Math.sin(azimuth),
        ORBIT_RADIUS * Math.sin(ANCHOR_ELEVATION),
        ORBIT_RADIUS * cosElevation * Math.cos(azimuth),
      );
      anchored = true;
    }

    mesh.position.copy(anchor);
    mesh.scale.setScalar(PLANET_RADIUS);
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
