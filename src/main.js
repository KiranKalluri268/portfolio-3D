/* globals THREE dat Stats Observer*/
import * as THREE from 'three';
import { createCamera, createRenderer, createScene, createShaderProjectionPlane, loadTextures, createParticleSystem } from './graphics/render';
import { createStatsGUI } from './gui/statsGUI';
import { createConfigGUI } from './gui/datGUI';
import { ThreeDQualityManager } from './performance/ThreeDQualityManager';
import { createStoryOverlay } from './story/StoryOverlay';
import Lenis from 'lenis';


(async () => {

  const loadingOverlay = document.getElementById('loading-overlay')
  const loadingPercentage = document.getElementById('loading-percentage')
  const loadingStatus = document.getElementById('loading-status')
  const sourceLicenseLinks = document.getElementById('source-license-links')
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

  function updateLoadingProgress() {
    loadingDisplayedProgress += (loadingTargetProgress - loadingDisplayedProgress) * 0.08
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
    show_lensing: { type: "b", value: true }
  }

  // create scene, 3d context, etc.. instances
  const renderer = createRenderer()
  const { composer, bloomPass, scene, disposeScene } = createScene(renderer);
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
    onWarmupComplete: ({ tier, heavyFrames, panicFrames }) => {
      console.log(
        "Quality Manager: Warmup complete at " + tier +
        " (" + heavyFrames + " heavy frames, " + panicFrames + " panic frames)"
      );
      setTimeout(() => {
        if (qualityManager.currentTier === 'low' && panicFrames === 0) {
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
    updateLoadingProgress()

    const frameTimestamp = timeNow ?? performance.now()
    delta = (frameTimestamp - lastframe) / 1000
    time += delta

    // scroll logic
    const scrollViewportUnits = lenis.scroll / Math.max(1, window.innerHeight);
    storyOverlay.update(scrollViewportUnits)
    if (benchmarkStarted) qualityManager.update(frameTimestamp);
    if (frameTimestamp - lastDiagnosticsUpdate >= 250) {
      lastDiagnosticsUpdate = frameTimestamp
      updateDiagnostics(qualityManager.getDiagnostics())
    }

    // Frame-time quality sampling is handled by ThreeDQualityManager.

    // ── Cinematic Camera Trajectory ──
    // 0.0 -> High Above (Dist: 25, Elev: 60°)
    // 1.0 -> Edge-On Rings (Dist: 4, Elev: 5°)
    const startDist = 25.0;
    const endDist = 5.1;
    const horizonDist = 1.8;
    const departureDist = 40.0;
    const startElev = 60.0 * Math.PI / 180;
    const endElev = 5.0 * Math.PI / 180;
    const approachEnd = 6.0;
    const bloomEnd = 7.5;
    const departureEnd = 18.0;

    const approachProgress = Math.max(0, Math.min(1, scrollViewportUnits / approachEnd));
    const bloomProgress = Math.max(0, Math.min(1, (scrollViewportUnits - approachEnd) / (bloomEnd - approachEnd)));
    const departureProgress = Math.max(0, Math.min(1, (scrollViewportUnits - bloomEnd) / (departureEnd - bloomEnd)));
    const approachEase = approachProgress * approachProgress * (3.0 - 2.0 * approachProgress);
    const bloomEase = bloomProgress * bloomProgress * (3.0 - 2.0 * bloomProgress);
    const departureEase = departureProgress * departureProgress * (3.0 - 2.0 * departureProgress);
    const entryRotationProgress = Math.max(0, Math.min(1, (bloomProgress - 0.9) / 0.1));
    const entryRotationEase = entryRotationProgress * entryRotationProgress * (3.0 - 2.0 * entryRotationProgress);
    const exitReorientationProgress = Math.max(0, Math.min(1, departureProgress / 0.66));
    const exitReorientationEase = exitReorientationProgress * exitReorientationProgress * (3.0 - 2.0 * exitReorientationProgress);
    const exitArc = Math.PI * 0.12 * departureEase;

    sourceLicenseLinks?.classList.toggle('visible', scrollViewportUnits >= departureEnd - 0.15)

    if (scrollViewportUnits <= approachEnd) {
      cameraConfig.distance = startDist + (endDist - startDist) * approachEase;
    } else if (scrollViewportUnits <= bloomEnd) {
      cameraConfig.distance = endDist + (horizonDist - endDist) * bloomEase;
    } else {
      cameraConfig.distance = horizonDist + (departureDist - horizonDist) * departureEase;
    }

    // Hold the low elevation through the transformed-world departure.
    if (!cameraConfig.enableDrag) {
      observer.elevationAngle = startElev + (endElev - startElev) * approachEase;
    }

    // Reduce bloom during approach for a clearer accretion disk, then ramp
    // from that restrained state into the transformed-world peak.
    const approachBloomStrength = bloomConfig.strength + (0.2 - bloomConfig.strength) * approachEase;
    const approachBloomThreshold = bloomConfig.threshold + (0.1 - bloomConfig.threshold) * approachEase;
    bloomPass.strength = approachBloomStrength + (3.0 - approachBloomStrength) * bloomEase;
    bloomPass.radius = bloomConfig.radius + (1.0 - bloomConfig.radius) * bloomEase;
    bloomPass.threshold = approachBloomThreshold + (0.0 - approachBloomThreshold) * bloomEase;

    const currentScrollY = lenis.scroll;
    const scrollDelta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // 1. Set continuous direction based on last scroll
    if (scrollDelta > 0) orbitDirection = 1;
    else if (scrollDelta < 0) orbitDirection = -1;

    // 2. Calculate target speed (base speed + scroll momentum)
    const extraSpeed = Math.abs(scrollDelta) * 0.1; 
    // Spin rapidly while crossing the near-horizon transition, then return to
    // normal once departure reaches the original closest distance again.
    const isInsideTransitionDistance = scrollViewportUnits > approachEnd && cameraConfig.distance <= endDist;
    const isHorizonViewFlipping = entryRotationProgress > 0 && departureProgress <= 0;
    const cinematicOrbitBoost = isInsideTransitionDistance && !isHorizonViewFlipping ? 10.1 : 1.0;
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
    applyExitTrajectory(exitArc, departureProgress)
    applyExitViewDirection(entryRotationEase, departureProgress, exitReorientationEase)

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

  function applyExitTrajectory(exitArc, departureProgress) {
    if (cameraConfig.enableDrag || departureProgress <= 0) return;

    observer.position.applyAxisAngle(observer.up, exitArc);
    observer.velocity.applyAxisAngle(observer.up, exitArc);
    observer.direction.copy(observer.position).negate().normalize();
  }

  function applyExitViewDirection(bloomEase, departureProgress, exitReorientationEase) {
    if (cameraConfig.enableDrag) return;

    const entryFlip = Math.PI * bloomEase;
    const departureFlip = Math.PI * (1.0 - exitReorientationEase);
    const yawOffset = departureProgress > 0 ? departureFlip : entryFlip;
    if (yawOffset <= 0.0001) return;

    observer.direction.applyAxisAngle(observer.up, yawOffset).normalize();
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
