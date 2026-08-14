/* globals THREE dat Stats Observer*/
import * as THREE from 'three';
import { createCamera, createRenderer, createScene, createShaderProjectionPlane, loadTextures, createParticleSystem } from './graphics/render';
import { createStatsGUI } from './gui/statsGUI';
import { createConfigGUI } from './gui/datGUI';
import { ThreeDQualityManager } from './performance/ThreeDQualityManager';
import { createStoryOverlay } from './story/StoryOverlay';
import { createTunnel } from './graphics/tunnel';
import Lenis from 'lenis';


(async () => {

  const loadingOverlay = document.getElementById('loading-overlay')
  const loadingPercentage = document.getElementById('loading-percentage')
  const loadingStatus = document.getElementById('loading-status')
  const sourceLicenseLinks = document.getElementById('source-license-links')
  const transitionVeil = document.getElementById('transition-veil')
  const cockpitVignette = document.getElementById('cockpit-vignette')
  let loadingTargetProgress = 0
  let loadingDisplayedProgress = 0
  let loadingReadyToDismiss = false
  let entryGateArmed = false
  let entryHoldTimer = null
  const ENTRY_HOLD_DURATION_MS = 900
  const storyOverlay = createStoryOverlay()
  document.documentElement.classList.add('is-loading')
  window.scrollTo(0, 0)

  function setLoadingStage(message, progress) {
    loadingTargetProgress = Math.max(loadingTargetProgress, progress)
    if (loadingStatus) loadingStatus.textContent = message
  }

  function updateLoadingProgress(frameDeltaSeconds) {
    // Frame-rate independent easing. A fixed 0.08-per-frame lerp is ~0.2s at
    // 60fps but crawls to nearly a minute at 1fps — on exactly the slow devices
    // where everything is already loaded and the visitor is staring at 89%.
    // This reproduces the 60fps feel at any frame rate.
    const smoothing = 1 - Math.pow(1 - 0.08, Math.min(frameDeltaSeconds, 0.5) * 60)
    loadingDisplayedProgress += (loadingTargetProgress - loadingDisplayedProgress) * smoothing
    if (loadingTargetProgress >= 100 && loadingDisplayedProgress > 99.5) loadingDisplayedProgress = 100
    if (loadingPercentage) loadingPercentage.textContent = `${Math.floor(loadingDisplayedProgress)}%`
    if (loadingReadyToDismiss && loadingDisplayedProgress === 100 && !entryGateArmed) {
      armEntryGate()
    }
  }

  function armEntryGate() {
    entryGateArmed = true
    const usesTouch = window.matchMedia('(pointer: coarse)').matches
    if (loadingStatus) {
      loadingStatus.textContent = usesTouch
        ? 'Touch and hold to enter the spaceship'
        : 'Click and hold to enter the spaceship'
    }
    loadingOverlay?.classList.add('ready-to-enter')
    loadingOverlay?.addEventListener('pointerdown', startEntryHold)
    loadingOverlay?.addEventListener('pointerup', cancelEntryHold)
    loadingOverlay?.addEventListener('pointercancel', cancelEntryHold)
    loadingOverlay?.addEventListener('pointerleave', cancelEntryHold)
    window.addEventListener('keydown', handleEntryKeydown)
  }

  function startEntryHold(event) {
    if (!entryGateArmed || loadingOverlayDismissed || entryHoldTimer) return
    event.preventDefault()
    loadingOverlay?.setPointerCapture?.(event.pointerId)
    loadingOverlay?.classList.add('holding-entry')
    entryHoldTimer = window.setTimeout(enterSite, ENTRY_HOLD_DURATION_MS)
  }

  function cancelEntryHold() {
    if (entryHoldTimer) window.clearTimeout(entryHoldTimer)
    entryHoldTimer = null
    loadingOverlay?.classList.remove('holding-entry')
  }

  function handleEntryKeydown(event) {
    if (event.key === 'Enter') enterSite()
  }

  function enterSite() {
    if (!entryGateArmed || loadingOverlayDismissed) return

    cancelEntryHold()
    loadingOverlayDismissed = true
    loadingOverlay?.removeEventListener('pointerdown', startEntryHold)
    loadingOverlay?.removeEventListener('pointerup', cancelEntryHold)
    loadingOverlay?.removeEventListener('pointercancel', cancelEntryHold)
    loadingOverlay?.removeEventListener('pointerleave', cancelEntryHold)
    window.removeEventListener('keydown', handleEntryKeydown)
    document.documentElement.classList.remove('is-loading')
    lenis.start()
    loadingOverlay?.classList.add('loaded')
    loadingOverlay?.addEventListener('transitionend', () => loadingOverlay.remove(), { once: true })
  }

  setLoadingStage('Initializing renderer...', 3)

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
      bloomRadius: 1,
      particleScale: 1.0,
    },
    medium: {
      resolution: 0.75,
      maxPixelRatio: 1.25,
      quality: 'medium',
      bloomStrength: 1,
      bloomRadius: 1,
      particleScale: 1.0,
    },
    high: {
      resolution: 1.0,
      maxPixelRatio: 1.5,
      quality: 'high',
      bloomStrength: 1,
      bloomRadius: 1,
      particleScale: 1.0,
    },
  };

  // Initial loading and frame-time benchmark state.
  let texturesLoaded = false;
  let initialQualityBenchmarkComplete = false;
  let benchmarkStarted = false;
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
    show_lensing: { type: "b", value: true },
    // Defaults reproduce the black hole exactly — the values below are the
    // constants they replaced in the shader. The journey drives them.
    horizon_emission: { type: "f", value: 0.0 },
    horizon_color: { type: "v3", value: new THREE.Vector3(1.0, 0.98, 0.94) },
    disk_tint: { type: "v3", value: new THREE.Vector3(1.0, 1.0, 1.0) },
    bg_tint: { type: "v3", value: new THREE.Vector3(1.0, 1.0, 1.0) },
    space_color_plane: { type: "v3", value: new THREE.Vector3(0.01, 0.013, 0.03) },
    space_color_pole: { type: "v3", value: new THREE.Vector3(0.0, 0.0, 0.006) },
  }

  // The world we emerge into after the wormhole: warm sky, cool disk.
  const NEW_WORLD = {
    horizonEmission: 0.9,
    diskTint: new THREE.Vector3(0.62, 0.86, 1.0),
    bgTint: new THREE.Vector3(1.0, 0.82, 0.72),
    spaceColorPlane: new THREE.Vector3(0.045, 0.022, 0.028),
    spaceColorPole: new THREE.Vector3(0.012, 0.004, 0.008),
  }
  // Captured before anything drives them, so the return trip is exact.
  const OLD_WORLD = {
    diskTint: uniforms.disk_tint.value.clone(),
    bgTint: uniforms.bg_tint.value.clone(),
    spaceColorPlane: uniforms.space_color_plane.value.clone(),
    spaceColorPole: uniforms.space_color_pole.value.clone(),
  }

  // Phase boundaries, in viewport units of scroll. body height in style.css has
  // to cover departureEnd with room to spare.
  const JOURNEY = {
    approachEnd: 6.0,
    blackoutEnd: 7.5,
    tunnelEnd: 12.5,
    emergenceEnd: 14.0,
    departureEnd: 20.0,
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value))
  }

  function smoothstep(t) {
    return t * t * (3.0 - 2.0 * t)
  }

  // create scene, 3d context, etc.. instances
  const renderer = createRenderer()
  const { composer, bloomPass, scene, camera, renderPass, disposeScene } = createScene(renderer);
  document.body.appendChild(renderer.domElement)
  setLoadingStage('Loading assets...', 10)

  // init graphics — textures load async; ready resolves when all are done
  const { textures, ready, disposeTextures } = loadTextures(({ loaded, total }) => {
    setLoadingStage(`Loading assets... ${loaded} / ${total}`, 10 + (loaded / total) * 60)
  });
  setLoadingStage('Compiling black hole shader...', 18)
  const { mesh, changePerformanceQuality, disposeShaderPlane } = await createShaderProjectionPlane(uniforms);
  // add shader plane to scene
  scene.add(mesh);
  setLoadingStage('Initializing camera...', 22)

  // setup camera
  const { observer, cameraControl } = createCamera(renderer);
  scene.add(observer)
  setLoadingStage('Initializing particle field...', 26)

  // particle system — 3D stars rendered to offscreen target, lensed in shader
  const { 
    particleSceneLensed, 
    particleTargetLensed,
    particleSceneUnlensed, 
    particleTargetUnlensed,
    particleCamera,
    resizeParticleTargets,
    disposeParticleSystem
  } = createParticleSystem();
  uniforms.particle_texture.value = particleTargetLensed.texture;
  uniforms.particle_texture_unlensed.value = particleTargetUnlensed.texture;

  // The passage between the two worlds. Rendered through the same composer, so
  // it inherits bloom without a second post-processing chain.
  const { tunnelScene, tunnelCamera, updateTunnel, resizeTunnel, disposeTunnel } =
    createTunnel(window.innerWidth / window.innerHeight);
  let tunnelActive = false;
  ready.then(() => {
    uniforms.bg_texture.value = textures.get('bg1')
    uniforms.star_texture.value = textures.get('star')
    uniforms.disk_texture.value = textures.get('disk')
  });

  // GUI
  let cameraConfig, effectConfig, performanceConfig, bloomConfig, updateDiagnostics, disposeGUI;
  let qualityManager;
  ({ cameraConfig, effectConfig, performanceConfig, bloomConfig, updateDiagnostics, disposeGUI } = createConfigGUI(
    changePerformanceQuality,
    applyPerformancePreset,
    saveToScreenshot,
    applyConfigChange,
    isVisible => {
      stats.dom.style.display = isVisible ? 'block' : 'none'
    }
  ));
  const stats = createStatsGUI();
  stats.dom.style.display = 'none';
  document.body.appendChild(stats.dom);

  const DEFAULT_ELEVATION = 5 * Math.PI / 180 // 5° — default camera elevation above disk

  // Resize handler — only fires on actual window resize, not every frame
  let renderWidth = 0
  let renderHeight = 0
  let renderPixelRatio = 0
  let particleCameraFov = null
  let particleCameraAspect = null
  let lastDiagnosticsUpdate = 0

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
    resizeTunnel(window.innerWidth / window.innerHeight)
    uniforms.resolution.value.set(renderWidth, renderHeight)
  }

  function setPerformanceQuality(quality) {
    performanceConfig.quality = quality
    changePerformanceQuality(quality)
  }

  function applyConfigChange(group, property, value) {
    if (group === 'bloom') {
      bloomPass[property] = value
      return
    }

    if (group === 'camera') {
      if (property === 'fov') {
        observer.fov = value
        return
      }
      if (property === 'orbit') {
        observer.moving = value
        return
      }
      if (property === 'enableDrag') {
        cameraControl.enabled = value
      }
      return
    }

    const uniform = uniforms[property]
    if (group === 'effect' && uniform) {
      uniform.value = value
    }
  }

  function applyInitialConfig() {
    applyConfigChange('bloom', 'strength', bloomConfig.strength)
    applyConfigChange('bloom', 'radius', bloomConfig.radius)
    applyConfigChange('bloom', 'threshold', bloomConfig.threshold)
    applyConfigChange('camera', 'fov', cameraConfig.fov)
    applyConfigChange('camera', 'orbit', cameraConfig.orbit)
    applyConfigChange('camera', 'enableDrag', cameraConfig.enableDrag)
    for (const [property, value] of Object.entries(effectConfig)) {
      applyConfigChange('effect', property, value)
    }
  }

  function applyPerformancePreset(presetName, syncQualityManager = true) {
    const preset = PERFORMANCE_PRESETS[presetName] ?? PERFORMANCE_PRESETS.high

    performanceConfig.preset = presetName
    performanceConfig.particleScale = preset.particleScale
    bloomConfig.strength = preset.bloomStrength
    bloomConfig.radius = preset.bloomRadius
    applyConfigChange('bloom', 'strength', bloomConfig.strength)
    applyConfigChange('bloom', 'radius', bloomConfig.radius)
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
    benchmarkDeadlineMs: 15000,
    heavyFrameLimit: 5,
    heavyFrameWindowMs: 1500,
    cooldownMs: 7000,
    ignoredFramesAfterChange: 5,
    upgradeStableMs: 8000,
    mediumHeavyFrameLimit: 20,
    lowToMediumProbeMs: 8000,
    mediumProbeEvaluationMs: 4000,
    failedProbeCooldownMs: 20000,
    allowHighAutoUpgrade: false,
    onQualityDowngrade: (newTier, { reason }) => {
      console.log("Quality Manager: Downgraded to " + newTier + " (" + reason + ")");
      if (benchmarkStarted && !initialQualityBenchmarkComplete) {
        setLoadingStage(`Adjusting graphics to ${newTier}...`, 93)
      }
      applyPerformancePreset(newTier, false);
    },
    onQualityUpgrade: (newTier, { reason }) => {
      console.log("Quality Manager: Upgraded to " + newTier + " (" + reason + ")");
      if (benchmarkStarted && !initialQualityBenchmarkComplete) {
        setLoadingStage(`Testing ${newTier} graphics...`, 96)
      }
      applyPerformancePreset(newTier, false);
    },
    onWarmupComplete: ({ tier, heavyFrames, panicFrames, reason }) => {
      console.log(
        "Quality Manager: Warmup complete at " + tier +
        " (" + heavyFrames + " heavy frames, " + panicFrames + " panic frames, " + reason + ")"
      );
      setTimeout(() => {
        // A benchmark that ran out of wall-clock never sampled a usable frame,
        // so its zeroed counters are not evidence of spare capacity. Settle at
        // the safe tier and let the visitor in rather than probing upward.
        if (reason !== 'benchmark-deadline' && qualityManager.currentTier === 'low' && panicFrames === 0) {
          setLoadingStage('Testing Medium graphics...', 96)
          qualityManager.startMediumProbe()
          return
        }

        initialQualityBenchmarkComplete = true;
        setLoadingStage(`Selected ${qualityManager.currentTier} graphics`, 100)
        dismissLoadingOverlayIfReady();
      }, 0)
    },
    onMediumProbeComplete: ({ tier }) => {
      initialQualityBenchmarkComplete = true
      setLoadingStage(`Selected ${tier} graphics`, 100)
      dismissLoadingOverlayIfReady()
    },
  });

  applyPerformancePreset('medium', false);
  applyInitialConfig();
  handleResize()

  function handleVisibilityChange() {
    const now = performance.now();
    qualityManager.resetTiming(document.hidden ? null : now);
    lastframe = now;
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  ready
    .then(() => {
      texturesLoaded = true;
      benchmarkStarted = true;
      qualityManager.resetTiming(performance.now());
      setLoadingStage('Determining graphics settings for this device...', 90)
    })
    .catch((error) => {
      texturesLoaded = true;
      console.error('One or more textures failed to load.', error);
      benchmarkStarted = true;
      qualityManager.resetTiming(performance.now());
      setLoadingStage('Determining graphics settings for this device...', 90)
    });

  // Initialize Lenis for smooth scrolling
  const lenis = new Lenis({
    lerp: 0.1, // Smoothness
    smoothWheel: true,
  });
  lenis.stop();

  // start render loop immediately (renders black until textures arrive)
  // requestAnimationFrame passes a high-res timestamp automatically
  let animationFrameId = requestAnimationFrame(update);

  // The overlay is dismissed after textures load and the benchmark completes.


  // UPDATING

  function update(timeNow) {
    // Lenis needs the high-res timestamp
    if (timeNow) lenis.raf(timeNow);

    const frameTimestamp = timeNow ?? performance.now()
    delta = (frameTimestamp - lastframe) / 1000
    time += delta
    updateLoadingProgress(delta)

    // scroll logic
    const scrollViewportUnits = lenis.scroll / Math.max(1, window.innerHeight);
    storyOverlay.update(scrollViewportUnits)
    if (benchmarkStarted) qualityManager.update(frameTimestamp);
    if (frameTimestamp - lastDiagnosticsUpdate >= 250) {
      lastDiagnosticsUpdate = frameTimestamp
      updateDiagnostics(qualityManager.getDiagnostics())
    }

    // Frame-time quality sampling is handled by ThreeDQualityManager.

    // ── The journey ──
    // Fall toward the black hole, black out at the closest point, travel the
    // passage, and come out of a wormhole into a different sky. Every value
    // below is a pure function of scroll, so scrubbing backwards retraces it.
    const startDist = 25.0;
    const endDist = 5.1;      // closest point of the approach
    const closeDist = 1.8;    // where the frame goes black
    const emergeDist = 7.0;   // how close the wormhole is when we come out
    const departureDist = 40.0;
    const startElev = 60.0 * Math.PI / 180;
    const endElev = 5.0 * Math.PI / 180;

    const approachProgress = clamp01(scrollViewportUnits / JOURNEY.approachEnd);
    const closeProgress = clamp01(
      (scrollViewportUnits - JOURNEY.approachEnd) / (JOURNEY.blackoutEnd - JOURNEY.approachEnd));
    const tunnelProgress = clamp01(
      (scrollViewportUnits - JOURNEY.blackoutEnd) / (JOURNEY.tunnelEnd - JOURNEY.blackoutEnd));
    const emergeProgress = clamp01(
      (scrollViewportUnits - JOURNEY.tunnelEnd) / (JOURNEY.emergenceEnd - JOURNEY.tunnelEnd));
    const departureProgress = clamp01(
      (scrollViewportUnits - JOURNEY.emergenceEnd) / (JOURNEY.departureEnd - JOURNEY.emergenceEnd));

    const approachEase = smoothstep(approachProgress);
    const closeEase = smoothstep(closeProgress);
    const emergeEase = smoothstep(emergeProgress);
    const departureEase = smoothstep(departureProgress);

    // The raymarcher is only on either side of the passage. Between the two it
    // is not just hidden but skipped — that is where the frame budget for the
    // tunnel comes from.
    const inTunnel = scrollViewportUnits > JOURNEY.blackoutEnd
      && scrollViewportUnits <= JOURNEY.tunnelEnd;
    const inNewWorld = scrollViewportUnits > JOURNEY.tunnelEnd;

    sourceLicenseLinks?.classList.toggle('visible', scrollViewportUnits >= JOURNEY.departureEnd - 0.15)

    if (scrollViewportUnits <= JOURNEY.approachEnd) {
      cameraConfig.distance = startDist + (endDist - startDist) * approachEase;
    } else if (scrollViewportUnits <= JOURNEY.blackoutEnd) {
      cameraConfig.distance = endDist + (closeDist - endDist) * closeEase;
    } else if (inTunnel) {
      cameraConfig.distance = closeDist;
    } else {
      cameraConfig.distance = emergeDist + (departureDist - emergeDist) * departureEase;
    }

    // Hold the low elevation through the new world.
    if (!cameraConfig.enableDrag) {
      observer.elevationAngle = startElev + (endElev - startElev) * approachEase;
    }

    updateWorldAppearance(inNewWorld ? emergeEase : 0);
    updateTransitionVeil(closeProgress, tunnelProgress, emergeProgress, inTunnel);

    // Restrain bloom through the approach so the disk stays legible, then set it
    // per phase. Nothing here is allowed to sit at threshold 0 — that is what
    // bleached the whole back half of the journey before.
    const approachBloomStrength = bloomConfig.strength + (0.2 - bloomConfig.strength) * approachEase;
    const approachBloomThreshold = bloomConfig.threshold + (0.1 - bloomConfig.threshold) * approachEase;
    if (inTunnel) {
      bloomPass.strength = 0.9;
      bloomPass.radius = 1.0;
      bloomPass.threshold = 0.55;
    } else if (inNewWorld) {
      // The wormhole is an emitter now, so the threshold has to stay high
      // enough that its light blooms without taking the sky with it.
      bloomPass.strength = 0.95;
      bloomPass.radius = 1.0;
      bloomPass.threshold = 0.5;
    } else {
      bloomPass.strength = approachBloomStrength + (0.85 - approachBloomStrength) * closeEase;
      bloomPass.radius = bloomConfig.radius + (1.0 - bloomConfig.radius) * closeEase;
      bloomPass.threshold = approachBloomThreshold + (0.12 - approachBloomThreshold) * closeEase;
    }

    tunnelActive = inTunnel;
    if (inTunnel) {
      const reveal = clamp01((tunnelProgress - 0.10) / 0.14);
      updateTunnel(tunnelProgress, reveal, time);
    }

    const currentScrollY = lenis.scroll;
    const scrollDelta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // 1. Set continuous direction based on last scroll
    if (scrollDelta > 0) orbitDirection = 1;
    else if (scrollDelta < 0) orbitDirection = -1;

    // 2. Calculate target speed (base speed + scroll momentum)
    const extraSpeed = Math.abs(scrollDelta) * 0.1;
    // Spin hard only through the dive itself. The new world is meant to feel
    // like arriving somewhere, so it gets the ordinary idle drift back.
    const cinematicOrbitBoost = closeProgress > 0 && tunnelProgress <= 0 ? 10.1 : 1.0;
    const targetOrbitSpeed = (BASE_ORBIT_SPEED + extraSpeed) * orbitDirection * cinematicOrbitBoost;

    // 3. Smoothly accelerate/decelerate towards target speed
    currentOrbitSpeed += (targetOrbitSpeed - currentOrbitSpeed) * 5 * delta;

    // 4. Apply continuous momentum to camera
    observer.theta -= currentOrbitSpeed * delta;

    // update peripherals
    stats.update()

    // update renderer
    observer.distance = cameraConfig.distance
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
    animationFrameId = requestAnimationFrame(update)
    lastframe = frameTimestamp
  }

  function render() {
    // Swapping what the existing RenderPass points at is the whole handover —
    // bloom, sizing and the composer chain are shared by both worlds.
    if (tunnelActive) {
      renderPass.scene = tunnelScene
      renderPass.camera = tunnelCamera
      renderer.setRenderTarget(null)
      composer.render()
      return
    }

    renderPass.scene = scene
    renderPass.camera = camera

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

  // Blends the shader between the two worlds. At mix 0 every uniform holds the
  // value the black hole was built with, so the approach is untouched.
  function updateWorldAppearance(mix) {
    uniforms.horizon_emission.value = NEW_WORLD.horizonEmission * mix
    uniforms.disk_tint.value.lerpVectors(OLD_WORLD.diskTint, NEW_WORLD.diskTint, mix)
    uniforms.bg_tint.value.lerpVectors(OLD_WORLD.bgTint, NEW_WORLD.bgTint, mix)
    uniforms.space_color_plane.value.lerpVectors(
      OLD_WORLD.spaceColorPlane, NEW_WORLD.spaceColorPlane, mix)
    uniforms.space_color_pole.value.lerpVectors(
      OLD_WORLD.spaceColorPole, NEW_WORLD.spaceColorPole, mix)
  }

  let veilColor = ''
  let veilOpacity = -1
  let vignetteOpacity = -1

  // Black going in, white coming out. Both scene swaps happen while this is
  // fully opaque, so neither is ever visible.
  function updateTransitionVeil(closeProgress, tunnelProgress, emergeProgress, inTunnel) {
    let color = '#000000'
    let opacity = 0

    if (emergeProgress > 0) {
      color = '#ffffff'
      opacity = 1 - clamp01((emergeProgress - 0.10) / 0.45)
    } else if (tunnelProgress > 0) {
      if (tunnelProgress >= 0.86) {
        color = '#ffffff'
        opacity = (tunnelProgress - 0.86) / 0.14
      } else {
        // Held opaque for the first stretch so the horizon message lands on
        // black, then pulled back to reveal the passage.
        opacity = 1 - clamp01((tunnelProgress - 0.10) / 0.14)
      }
    } else {
      // Starts early: past this point the camera is inside the disk radius and
      // the frame is an undifferentiated grey wash, so there is nothing worth
      // holding on to before the dark.
      opacity = smoothstep(clamp01((closeProgress - 0.25) / 0.6))
    }

    if (color !== veilColor) {
      veilColor = color
      if (transitionVeil) transitionVeil.style.backgroundColor = color
    }
    if (opacity.toFixed(3) !== veilOpacity) {
      veilOpacity = opacity.toFixed(3)
      if (transitionVeil) transitionVeil.style.opacity = veilOpacity
    }

    const vignette = inTunnel
      ? clamp01((tunnelProgress - 0.10) / 0.14) * (1 - clamp01((tunnelProgress - 0.80) / 0.20))
      : 0
    if (vignette.toFixed(3) !== vignetteOpacity) {
      vignetteOpacity = vignette.toFixed(3)
      if (cockpitVignette) cockpitVignette.style.opacity = vignetteOpacity
    }
  }

  function updateUniforms() {
    uniforms.time.value = time

    uniforms.cam_pos.value = observer.position
    uniforms.cam_dir.value = observer.direction
    uniforms.cam_up.value = observer.up
    uniforms.fov.value = observer.fov

    uniforms.cam_vel.value = observer.velocity

    // sync particle camera to observer so 3D positions are correct
    const nextParticleAspect = window.innerWidth / window.innerHeight
    if (particleCameraFov !== observer.fov || particleCameraAspect !== nextParticleAspect) {
      particleCameraFov = observer.fov
      particleCameraAspect = nextParticleAspect
      particleCamera.fov = particleCameraFov
      particleCamera.aspect = particleCameraAspect
      particleCamera.updateProjectionMatrix()
    }
    particleCamera.position.copy(observer.position)
    particleCamera.up.copy(observer.up)
    particleCamera.lookAt(0, 0, 0)
    particleCamera.updateMatrixWorld()

  }

  function dismissLoadingOverlayIfReady() {
    if (loadingOverlayDismissed || !texturesLoaded || !initialQualityBenchmarkComplete) return;
    loadingTargetProgress = 100
    loadingReadyToDismiss = true
  }

  let appDisposed = false;
  function disposeApp() {
    if (appDisposed) return;
    appDisposed = true;

    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', disposeApp);
    cancelEntryHold();
    loadingOverlay?.removeEventListener('pointerdown', startEntryHold);
    loadingOverlay?.removeEventListener('pointerup', cancelEntryHold);
    loadingOverlay?.removeEventListener('pointercancel', cancelEntryHold);
    loadingOverlay?.removeEventListener('pointerleave', cancelEntryHold);
    window.removeEventListener('keydown', handleEntryKeydown);
    lenis.destroy();
    cameraControl.dispose();
    disposeGUI();
    storyOverlay.dispose();
    disposeParticleSystem();
    disposeTunnel();
    disposeShaderPlane();
    disposeScene();
    disposeTextures();
    renderer.dispose();
    renderer.domElement.remove();
    stats.dom.remove();
  }
  window.addEventListener('beforeunload', disposeApp);

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
