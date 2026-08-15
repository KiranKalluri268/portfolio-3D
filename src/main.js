/* globals THREE dat Stats Observer*/
import * as THREE from 'three';
import { createCamera, createRenderer, createScene, createShaderProjectionPlane, loadTextures, createParticleSystem } from './graphics/render';
import { createStatsGUI } from './gui/statsGUI';
import { createConfigGUI } from './gui/datGUI';
import { ThreeDQualityManager } from './performance/ThreeDQualityManager';
import { createStoryOverlay } from './story/StoryOverlay';
import { createTunnel } from './graphics/tunnel';
import { createPlanet } from './graphics/planet';
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
    planet_texture: { type: "t", value: null },
    planet_amount: { type: "f", value: 0.0 },
    show_lensing: { type: "b", value: true },
    // Defaults reproduce the black hole exactly — the values below are the
    // constants they replaced in the shader. The journey drives them.
    // throat_throughput at 0 collapses the horizon branch back to black, so the
    // whole approach is untouched however the rest of these are tuned.
    throat_throughput: { type: "f", value: 0.0 },
    disk_tint: { type: "v3", value: new THREE.Vector3(1.0, 1.0, 1.0) },
    bg_tint: { type: "v3", value: new THREE.Vector3(1.0, 1.0, 1.0) },
    space_color_plane: { type: "v3", value: new THREE.Vector3(0.01, 0.013, 0.03) },
    space_color_pole: { type: "v3", value: new THREE.Vector3(0.0, 0.0, 0.006) },
    // The far side. Rotated well away from the background's own 45° so the star
    // pattern through the throat is visibly not the star pattern around it.
    throat_sky_rotation: { type: "f", value: 160.0 },
    throat_color_plane: { type: "v3", value: new THREE.Vector3(0.16, 0.11, 0.26) },
    throat_color_pole: { type: "v3", value: new THREE.Vector3(0.05, 0.03, 0.12) },
    throat_star_gain: { type: "f", value: 4.0 },
    throat_nebula_gain: { type: "f", value: 1.1 },
    throat_rim_color: { type: "v3", value: new THREE.Vector3(0.75, 0.85, 1.0) },
    throat_rim_gain: { type: "f", value: 1.2 },
  }

  // Where we start: warm sky, and no accretion disk. The disk is the black
  // hole's tell — the dark gap between the horizon at r=1 and the disk's inner
  // edge at r=2 is the silhouette itself — so the wormhole does without one.
  const WORMHOLE = {
    throatThroughput: 1.0,
    diskTint: new THREE.Vector3(0.62, 0.86, 1.0),
    bgTint: new THREE.Vector3(1.0, 0.82, 0.72),
    spaceColorPlane: new THREE.Vector3(0.045, 0.022, 0.028),
    spaceColorPole: new THREE.Vector3(0.012, 0.004, 0.008),
  }
  // Where we come out. Captured before anything drives them, so these are the
  // values the shader was built with and the black hole is exactly itself.
  const BLACK_HOLE = {
    throatThroughput: 0.0,
    diskTint: uniforms.disk_tint.value.clone(),
    bgTint: uniforms.bg_tint.value.clone(),
    spaceColorPlane: uniforms.space_color_plane.value.clone(),
    spaceColorPole: uniforms.space_color_pole.value.clone(),
  }

  // Phase boundaries, in viewport units of scroll. body height in style.css has
  // to cover approachEnd with room to spare.
  //
  // The wormhole comes first and the black hole last, the order Interstellar
  // puts them in: cross to the throat, pass through it, and fall toward
  // Gargantua on the other side.
  const JOURNEY = {
    crossingEnd: 5.0,
    blackoutEnd: 6.5,
    tunnelEnd: 11.5,
    arrivalEnd: 13.0,
    approachEnd: 20.0,
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

  // Somewhere to arrive. Rendered to its own target and sampled by the shader —
  // see src/graphics/planet.js for why it does not share the particle ones.
  const {
    planetScene, planetTarget, planetCamera,
    updatePlanet, resizePlanetTarget, disposePlanet
  } = createPlanet(window.innerWidth, window.innerHeight);
  uniforms.planet_texture.value = planetTarget.texture;
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
    resizePlanetTarget(renderWidth, renderHeight)
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
    // Cross to the wormhole, go dark, travel the passage, and come out falling
    // toward the black hole. Every value below is a pure function of scroll, so
    // scrubbing backwards retraces it.
    const crossingStartDist = 22.0;
    const crossingNearDist = 5.4;   // as close as we get before the dark
    const closeDist = 1.8;          // held through the passage
    const arriveDist = 25.0;        // how far out we come up on the far side
    // Closest point of the fall, and the last frame of the journey. The black hole
    // subtends the same angle whatever the viewport, but portrait has far less
    // width for it to subtend that angle in — at the landscape distance it owns
    // the whole phone screen, leaving the planet nowhere to be and the disk
    // running off both edges. Backed off in proportion to how narrow it is.
    const viewportAspect = Math.max(window.innerWidth / window.innerHeight, 0.4);
    const narrowFraming = clamp01((1.2 - viewportAspect) / 0.8);
    const blackHoleDist = 5.1 * (1.0 + 0.55 * narrowFraming);
    // Nothing swings edge-on across the crossing, so the elevation only decides
    // how much of the star field sits above the horizon. Held flat: the whole
    // point of this half is that it is a straight line in.
    const crossingElev = 15.0 * Math.PI / 180;
    const startElev = 60.0 * Math.PI / 180;
    const endElev = 5.0 * Math.PI / 180;

    const crossingProgress = clamp01(scrollViewportUnits / JOURNEY.crossingEnd);
    const closeProgress = clamp01(
      (scrollViewportUnits - JOURNEY.crossingEnd) / (JOURNEY.blackoutEnd - JOURNEY.crossingEnd));
    const tunnelProgress = clamp01(
      (scrollViewportUnits - JOURNEY.blackoutEnd) / (JOURNEY.tunnelEnd - JOURNEY.blackoutEnd));
    const arrivalProgress = clamp01(
      (scrollViewportUnits - JOURNEY.tunnelEnd) / (JOURNEY.arrivalEnd - JOURNEY.tunnelEnd));
    const approachProgress = clamp01(
      (scrollViewportUnits - JOURNEY.arrivalEnd) / (JOURNEY.approachEnd - JOURNEY.arrivalEnd));

    const crossingEase = smoothstep(crossingProgress);
    const closeEase = smoothstep(closeProgress);
    const approachEase = smoothstep(approachProgress);

    // The raymarcher is only on either side of the passage. Between the two it
    // is not just hidden but skipped — that is where the frame budget for the
    // tunnel comes from.
    const inTunnel = scrollViewportUnits > JOURNEY.blackoutEnd
      && scrollViewportUnits <= JOURNEY.tunnelEnd;
    const pastTunnel = scrollViewportUnits > JOURNEY.tunnelEnd;

    sourceLicenseLinks?.classList.toggle('visible', scrollViewportUnits >= JOURNEY.approachEnd - 0.15)

    if (scrollViewportUnits <= JOURNEY.crossingEnd) {
      cameraConfig.distance = crossingStartDist + (crossingNearDist - crossingStartDist) * crossingEase;
    } else if (scrollViewportUnits <= JOURNEY.blackoutEnd) {
      cameraConfig.distance = crossingNearDist + (closeDist - crossingNearDist) * closeEase;
    } else if (inTunnel) {
      cameraConfig.distance = closeDist;
    } else {
      cameraConfig.distance = arriveDist + (blackHoleDist - arriveDist) * approachEase;
    }

    if (!cameraConfig.enableDrag) {
      observer.elevationAngle = pastTunnel
        ? startElev + (endElev - startElev) * approachEase
        : crossingElev;
    }

    // The two worlds swap outright rather than blending, because the swap happens
    // while the arrival veil is still fully opaque and nothing of it is on screen.
    updateWorldAppearance(pastTunnel ? 0 : 1);
    updateTransitionVeil(closeProgress, tunnelProgress, arrivalProgress, inTunnel);

    // Set per phase. Nothing here is allowed to sit at threshold 0 — that is what
    // bleached a whole half of the journey before.
    if (inTunnel) {
      bloomPass.strength = 0.9;
      bloomPass.radius = 1.0;
      bloomPass.threshold = 0.55;
    } else if (pastTunnel) {
      // Restrained through the fall so the disk stays legible rather than
      // blooming into a single white mass as it fills the frame.
      bloomPass.strength = bloomConfig.strength + (0.2 - bloomConfig.strength) * approachEase;
      bloomPass.radius = bloomConfig.radius;
      bloomPass.threshold = bloomConfig.threshold + (0.1 - bloomConfig.threshold) * approachEase;
    } else {
      // The throat is a light source and it grows to fill the frame on the way
      // in, so the threshold climbs with it — held at its opening value the
      // crossing washes out long before the dark arrives to cover it.
      bloomPass.strength = 0.95;
      bloomPass.radius = 1.0;
      bloomPass.threshold = 0.5 + 0.3 * Math.max(crossingEase, closeEase);
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
    // The hard cinematic spin used to belong to the dive into the black hole.
    // That dive is gone — the crossing is a straight line in, and the fall is
    // now where the journey ends rather than where it turns — so both halves
    // run on the ordinary idle drift.
    const targetOrbitSpeed = (BASE_ORBIT_SPEED + extraSpeed) * orbitDirection;

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

    // The planet belongs to the black hole's system, so it fades up shortly after
    // the arrival and rides the whole fall. Placed after the orbit has been
    // advanced, because it is positioned from the camera's own basis and would
    // otherwise sit a frame behind the camera it is framed against.
    const planetProgress = approachProgress
    uniforms.planet_amount.value = pastTunnel ? smoothstep(clamp01(planetProgress / 0.22)) : 0
    // Placed on every frame past the tunnel, not only on the ones it is visible
    // for. Gating the placement on the same flag as the draw left the mesh
    // wherever it was last put — including its initial position at the origin —
    // so the first frame after it faded up could sample a planet still sitting
    // inside the black hole.
    if (pastTunnel) {
      updatePlanet(planetProgress, observer, window.innerWidth / window.innerHeight)
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

    // Only drawn once there is something to draw, so the approach and the
    // passage pay nothing for it.
    if (uniforms.planet_amount.value > 0) {
      // The renderer's clear alpha is 1, which is right for the particle targets
      // because they composite additively and their alpha is never read. This one
      // is composited alpha-over, so clearing it opaque would paint a black frame
      // across the whole sky. Cleared transparent, and put back afterwards.
      renderer.setClearAlpha(0)
      renderer.setRenderTarget(planetTarget)
      renderer.clear()
      renderer.render(planetScene, planetCamera)
      renderer.setClearAlpha(1)
    }

    renderer.setRenderTarget(null)

    // Main ray-marching + bloom.
    composer.render()
  }

  // Blends the shader between the two worlds. At mix 1 it is the wormhole we set
  // out from; at mix 0 every uniform holds the value the shader was built with,
  // so the black hole we arrive at is exactly itself.
  function updateWorldAppearance(mix) {
    uniforms.throat_throughput.value = WORMHOLE.throatThroughput * mix
    // The GUI toggle owns the disk everywhere the journey does not. The journey
    // only ever overrides it downwards, and only for the wormhole half, which has
    // no disk to show.
    uniforms.accretion_disk.value = effectConfig.accretion_disk && mix <= 0
    uniforms.disk_tint.value.lerpVectors(BLACK_HOLE.diskTint, WORMHOLE.diskTint, mix)
    uniforms.bg_tint.value.lerpVectors(BLACK_HOLE.bgTint, WORMHOLE.bgTint, mix)
    uniforms.space_color_plane.value.lerpVectors(
      BLACK_HOLE.spaceColorPlane, WORMHOLE.spaceColorPlane, mix)
    uniforms.space_color_pole.value.lerpVectors(
      BLACK_HOLE.spaceColorPole, WORMHOLE.spaceColorPole, mix)
  }

  let veilColor = ''
  let veilOpacity = -1
  let vignetteOpacity = -1

  // Black going in, white coming out. Both scene swaps happen while this is
  // fully opaque, so neither is ever visible.
  function updateTransitionVeil(closeProgress, tunnelProgress, arrivalProgress, inTunnel) {
    let color = '#000000'
    let opacity = 0

    if (arrivalProgress > 0) {
      color = '#ffffff'
      opacity = 1 - clamp01((arrivalProgress - 0.05) / 0.35)
    } else if (tunnelProgress > 0) {
      if (tunnelProgress >= 0.92) {
        color = '#ffffff'
        opacity = (tunnelProgress - 0.92) / 0.08
      } else {
        // Held opaque for the first stretch so the horizon message lands on
        // black, then pulled back to reveal the passage.
        opacity = 1 - clamp01((tunnelProgress - 0.10) / 0.14)
      }
    } else {
      // Starts early and closes fast. The throat is a light source filling most of
      // the frame by this point, so a veil that is merely most of the way down
      // reads as a grey wash over a bright disc rather than as going dark — it has
      // to reach full black while there is still something behind it worth
      // covering, not ease toward it.
      opacity = smoothstep(clamp01((closeProgress - 0.05) / 0.5))
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
    disposePlanet();
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
