/* globals THREE dat Stats Observer*/
import * as THREE from 'three';
import { createCamera, createRenderer, createScene, createShaderProjectionPlane, loadTextures, createParticleSystem } from './graphics/render';
import { createStatsGUI } from './gui/statsGUI';
import { createConfigGUI } from './gui/datGUI';
import { ThreeDQualityManager } from './performance/ThreeDQualityManager';
import Lenis from 'lenis';


(async () => {

  let lastframe = performance.now()
  let delta = 0
  let time = 0
  let lastScrollY = window.scrollY
  let orbitDirection = 1;         // 1 for forward, -1 for backward
  let currentOrbitSpeed = 0.05;   // current smoothly interpolated speed
  const BASE_ORBIT_SPEED = 0.05;  // constant idle spin
  const PERFORMANCE_PRESETS = {
    low: {
      resolution: 0.5,
      maxPixelRatio: 1.0,
      quality: 'low',
      bloomStrength: 1,
      bloomRadius: 0.4,
      particleScale: 1.0,
    },
    medium: {
      resolution: 0.75,
      maxPixelRatio: 1.25,
      quality: 'medium',
      bloomStrength: 1,
      bloomRadius: 0.4,
      particleScale: 1.0,
    },
    high: {
      resolution: 1.0,
      maxPixelRatio: 1.5,
      quality: 'high',
      bloomStrength: 1,
      bloomRadius: 0.4,
      particleScale: 1.0,
    },
  };

  // Initial loading and frame-time benchmark state.
  let texturesLoaded = false;
  let initialQualityBenchmarkComplete = false;
  let loadingOverlayDismissed = false;

  // set variables types for shader
  const uniforms = {
    time: { type: "f", value: 0.0 },
    resolution: { type: "v2", value: new THREE.Vector2() },
    accretion_disk: { type: "b", value: false },
    use_disk_texture: { type: "b", value: true },
    lorentz_transform: { type: "b", value: false },
    doppler_shift: { type: "b", value: false },
    beaming: { type: "b", value: false },
    cam_pos: { type: "v3", value: new THREE.Vector3() },
    cam_vel: { type: "v3", value: new THREE.Vector3() },
    cam_dir: { type: "v3", value: new THREE.Vector3() },
    cam_up: { type: "v3", value: new THREE.Vector3() },
    fov: { type: "f", value: 0.0 },
    bg_texture: { type: "t", value: null },
    star_texture: { type: "t", value: null },
    disk_texture: { type: "t", value: null },
    particle_texture: { type: "t", value: null },
    particle_texture_unlensed: { type: "t", value: null },
    show_lensing: { type: "b", value: true }
  }

  // create scene, 3d context, etc.. instances
  const renderer = createRenderer()
  const { composer, bloomPass, scene } = createScene(renderer);
  document.body.appendChild(renderer.domElement)

  // init graphics — textures load async; ready resolves when all are done
  const { textures, ready } = loadTextures();
  const { mesh, changePerformanceQuality } = await createShaderProjectionPlane(uniforms);
  // add shader plane to scene
  scene.add(mesh);

  // setup camera
  const { observer, cameraControl } = createCamera(renderer);
  scene.add(observer)

  // particle system — 3D stars rendered to offscreen target, lensed in shader
  const { 
    particleSceneLensed, 
    particleTargetLensed,
    particleSceneUnlensed, 
    particleTargetUnlensed,
    particleCamera,
    resizeParticleTargets
  } = createParticleSystem();
  uniforms.particle_texture.value = particleTargetLensed.texture;
  uniforms.particle_texture_unlensed.value = particleTargetUnlensed.texture;

  // GUI
  let cameraConfig, effectConfig, performanceConfig, bloomConfig;
  let qualityManager;
  ({ cameraConfig, effectConfig, performanceConfig, bloomConfig } = createConfigGUI(
    changePerformanceQuality,
    applyPerformancePreset,
    saveToScreenshot
  ));
  const stats = createStatsGUI();
  document.body.appendChild(stats.dom);

  const DEFAULT_ELEVATION = 5 * Math.PI / 180 // 5° — default camera elevation above disk

  // Resize handler — only fires on actual window resize, not every frame
  let renderWidth = 0
  let renderHeight = 0
  let renderPixelRatio = 0

  function applyRenderScale(
    resolution = performanceConfig.resolution,
    maxPixelRatio = PERFORMANCE_PRESETS[performanceConfig.preset]?.maxPixelRatio ?? 1.5
  ) {
    performanceConfig.resolution = resolution
    const pixelRatio = Math.min(window.devicePixelRatio * resolution, maxPixelRatio)
    const nextRenderWidth = Math.max(1, Math.floor(window.innerWidth * pixelRatio))
    const nextRenderHeight = Math.max(1, Math.floor(window.innerHeight * pixelRatio))

    if (
      nextRenderWidth === renderWidth &&
      nextRenderHeight === renderHeight &&
      pixelRatio === renderPixelRatio
    ) return

    renderWidth = nextRenderWidth
    renderHeight = nextRenderHeight
    renderPixelRatio = pixelRatio

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    composer.setPixelRatio(pixelRatio)
    composer.setSize(window.innerWidth, window.innerHeight)
    resizeParticleTargets(renderWidth, renderHeight)
    uniforms.resolution.value.set(renderWidth, renderHeight)
  }

  function setPerformanceQuality(quality) {
    performanceConfig.quality = quality
    changePerformanceQuality(quality)
  }

  function applyPerformancePreset(presetName, syncQualityManager = true) {
    const preset = PERFORMANCE_PRESETS[presetName] ?? PERFORMANCE_PRESETS.high

    performanceConfig.preset = presetName
    performanceConfig.particleScale = preset.particleScale
    bloomConfig.strength = preset.bloomStrength
    bloomConfig.radius = preset.bloomRadius
    setPerformanceQuality(preset.quality)
    applyRenderScale(preset.resolution, preset.maxPixelRatio)

    if (syncQualityManager && qualityManager) {
      qualityManager.setTier(presetName)
    }
  }

  function handleResize() {
    applyRenderScale()
  }
  window.addEventListener('resize', handleResize)

  qualityManager = new ThreeDQualityManager({
    tiers: ['low', 'medium', 'high'],
    initialTier: 'medium',
    warmupMs: 3000,
    healthyFrameMs: 18,
    heavyFrameMs: 20,
    panicFrameMs: 50,
    maxFrameGapMs: 250,
    heavyFrameLimit: 5,
    cooldownMs: 7000,
    ignoredFramesAfterChange: 5,
    upgradeStableMs: 8000,
    mediumHeavyFrameLimit: 20,
    lowToMediumProbeMs: 8000,
    mediumProbeEvaluationMs: 6000,
    failedProbeCooldownMs: 20000,
    allowHighAutoUpgrade: false,
    onQualityDowngrade: (newTier, { reason }) => {
      console.log("Quality Manager: Downgraded to " + newTier + " (" + reason + ")");
      applyPerformancePreset(newTier, false);
    },
    onQualityUpgrade: (newTier, { reason }) => {
      console.log("Quality Manager: Upgraded to " + newTier + " (" + reason + ")");
      applyPerformancePreset(newTier, false);
    },
    onWarmupComplete: ({ tier, heavyFrames, panicFrames }) => {
      console.log(
        "Quality Manager: Warmup complete at " + tier +
        " (" + heavyFrames + " heavy frames, " + panicFrames + " panic frames)"
      );
      initialQualityBenchmarkComplete = true;
      dismissLoadingOverlayIfReady();
    },
  });

  applyPerformancePreset('medium', false);
  handleResize()

  document.addEventListener('visibilitychange', () => {
    const now = performance.now();
    qualityManager.resetTiming(document.hidden ? null : now);
    lastframe = now;
  });

  ready
    .then(() => {
      texturesLoaded = true;
      dismissLoadingOverlayIfReady();
    })
    .catch((error) => {
      texturesLoaded = true;
      console.error('One or more textures failed to load.', error);
      dismissLoadingOverlayIfReady();
    });

  // Initialize Lenis for smooth scrolling
  const lenis = new Lenis({
    lerp: 0.1, // Smoothness
    smoothWheel: true,
  });

  // start render loop immediately (renders black until textures arrive)
  // requestAnimationFrame passes a high-res timestamp automatically
  requestAnimationFrame(update);

  // The overlay is dismissed after textures load and the benchmark completes.


  // UPDATING

  function update(timeNow) {
    // Lenis needs the high-res timestamp
    if (timeNow) lenis.raf(timeNow);

    const frameTimestamp = timeNow ?? performance.now()
    delta = (frameTimestamp - lastframe) / 1000
    time += delta

    // scroll logic
    const scrollHeight = Math.max(1, document.body.scrollHeight - window.innerHeight);
    const scrollFraction = Math.max(0, Math.min(1, lenis.scroll / scrollHeight));
    qualityManager.update(frameTimestamp);

    // Frame-time quality sampling is handled by ThreeDQualityManager.

    // ── Cinematic Camera Trajectory ──
    // 0.0 -> High Above (Dist: 25, Elev: 60°)
    // 1.0 -> Edge-On Rings (Dist: 4, Elev: 5°)
    const startDist = 25.0;
    const endDist = 5.1;
    const startElev = 60.0 * Math.PI / 180;
    const endElev = 5.0 * Math.PI / 180;

    // Use smoothstep for a softer ease-in/ease-out cinematic swoop
    const ease = scrollFraction * scrollFraction * (3.0 - 2.0 * scrollFraction);
    cameraConfig.distance = startDist + (endDist - startDist) * ease;
    
    // We only force elevation if drag is not active
    if (!cameraConfig.enableDrag) {
      observer.elevationAngle = startElev + (endElev - startElev) * ease;
    }

    const currentScrollY = lenis.scroll;
    const scrollDelta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // 1. Set continuous direction based on last scroll
    if (scrollDelta > 0) orbitDirection = 1;
    else if (scrollDelta < 0) orbitDirection = -1;

    // 2. Calculate target speed (base speed + scroll momentum)
    const extraSpeed = Math.abs(scrollDelta) * 0.1; 
    const targetOrbitSpeed = (BASE_ORBIT_SPEED + extraSpeed) * orbitDirection;

    // 3. Smoothly accelerate/decelerate towards target speed
    currentOrbitSpeed += (targetOrbitSpeed - currentOrbitSpeed) * 5 * delta;

    // 4. Apply continuous momentum to camera
    observer.theta -= currentOrbitSpeed * delta;

    // update peripherals
    stats.update()

    // update renderer
    observer.update(delta)
    cameraControl.update(delta)

    // slowly revolve particles around the BH when toggle is on
    if (cameraConfig.particleOrbit) {
      particleSceneLensed.rotation.y += delta * 0.01  // ~1 full revolution per ~2.5 min
      particleSceneUnlensed.rotation.y -= delta * 0.01 // rotate in opposite direction
    }

    // update shader variables
    updateUniforms()

    // render
    render();

    // loop
    requestAnimationFrame(update)
    lastframe = frameTimestamp
  }

  function render() {
    const particleTarget = effectConfig.show_lensing
      ? particleTargetLensed
      : particleTargetUnlensed
    const particleScene = effectConfig.show_lensing
      ? particleSceneLensed
      : particleSceneUnlensed

    // Render only the particle target sampled by the current shader path.
    renderer.setRenderTarget(particleTarget)
    renderer.clear()
    renderer.render(particleScene, particleCamera)
    
    renderer.setRenderTarget(null)

    // Main ray-marching + bloom.
    composer.render()
  }

  function updateUniforms() {
    uniforms.time.value = time

    uniforms.cam_pos.value = observer.position
    uniforms.cam_dir.value = observer.direction
    uniforms.cam_up.value = observer.up
    uniforms.fov.value = observer.fov

    uniforms.cam_vel.value = observer.velocity

    uniforms.bg_texture.value = textures.get('bg1')
    uniforms.star_texture.value = textures.get('star')
    uniforms.disk_texture.value = textures.get('disk')

    // sync particle camera to observer so 3D positions are correct
    particleCamera.fov = observer.fov
    particleCamera.aspect = window.innerWidth / window.innerHeight
    particleCamera.updateProjectionMatrix()
    particleCamera.position.copy(observer.position)
    particleCamera.up.copy(observer.up)
    particleCamera.lookAt(0, 0, 0)
    particleCamera.updateMatrixWorld()


    bloomPass.strength = bloomConfig.strength
    bloomPass.radius = bloomConfig.radius
    bloomPass.threshold = bloomConfig.threshold


    observer.distance = cameraConfig.distance
    observer.moving = cameraConfig.orbit
    observer.fov = cameraConfig.fov
    cameraControl.enabled = cameraConfig.enableDrag  // gate mouse drag via GUI toggle
    uniforms.lorentz_transform.value = effectConfig.lorentz_transform
    uniforms.accretion_disk.value = effectConfig.accretion_disk
    uniforms.use_disk_texture.value = effectConfig.use_disk_texture
    uniforms.doppler_shift.value = effectConfig.doppler_shift
    uniforms.beaming.value = effectConfig.beaming
    uniforms.show_lensing.value = effectConfig.show_lensing
  }

  function dismissLoadingOverlayIfReady() {
    if (loadingOverlayDismissed || !texturesLoaded || !initialQualityBenchmarkComplete) return;

    loadingOverlayDismissed = true;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('loaded');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }
  }

  // https://r105.threejsfundamentals.org/threejs/lessons/threejs-tips.html
  function saveToScreenshot() {
    render();
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      let URLObj = window.URL || window.webkitURL;
      let a = document.createElement("a")
      a.href = URLObj.createObjectURL(blob)
      a.download = `blackhole-image-${new Date(Date.now()).toLocaleDateString('en-GB').replace(/\//g, '-')}.png`
      document.body.appendChild(a)
      a.click();
      document.body.removeChild(a)
    });
  }
})();
