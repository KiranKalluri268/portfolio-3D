import GUI from "lil-gui";

export function createConfigGUI(changePerformanceQuality, changePerformancePreset, saveScreenshot, onConfigChange) {

  const gui = new GUI()
  gui.hide();

  function handleKeydown(event) {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'c') {
      if (gui.domElement.style.display === 'none') {
        gui.show();
      } else {
        gui.hide();
      }
    }
  }
  window.addEventListener('keydown', handleKeydown);
  const performanceConfig = addPerformanceConfig();
  const { diagnosticsConfig, updateDiagnostics } = addDiagnostics();
  const bloomConfig = addBloomConfig();
  const cameraConfig = addCameraConfig();
  const effectConfig = addEffectConfig();
  addSaveToScreenshot();

  // impl

  function addPerformanceConfig() {
    const performanceConfig = {
      resolution: 1.0,
      quality: 'high',
      preset: 'high',
      particleScale: 1.0
    }
    const perfFolder = gui.addFolder('Performance');
    perfFolder.add(performanceConfig, 'resolution', [0.25, 0.5, 0.75, 0.9, 1.0, 2.0, 4.0]).listen();
    perfFolder.add(performanceConfig, 'quality', ['low', 'medium', 'high']).onChange(changePerformanceQuality).listen();
    perfFolder.add(performanceConfig, 'preset', ['low', 'medium', 'high']).onChange(changePerformancePreset).listen();
    perfFolder.open();

    return performanceConfig;
  }

  function addDiagnostics() {
    const diagnosticsConfig = {
      tier: 'medium',
      frameMs: '0.00',
      heavyFrames: 0,
      cooldownSeconds: '0.0',
      probeActive: false,
      probeSeconds: '0.0',
      probeHeavyFrames: 0,
      warmupComplete: false,
      reason: 'startup'
    };
    const diagnosticsFolder = gui.addFolder('Diagnostics');
    diagnosticsFolder.add(diagnosticsConfig, 'tier').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'frameMs').name('Frame Time (ms)').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'heavyFrames').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'cooldownSeconds').name('Cooldown (s)').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'probeActive').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'probeSeconds').name('Probe Time (s)').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'probeHeavyFrames').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'warmupComplete').listen().disable();
    diagnosticsFolder.add(diagnosticsConfig, 'reason').listen().disable();

    function updateDiagnostics(diagnostics) {
      diagnosticsConfig.tier = diagnostics.tier;
      diagnosticsConfig.frameMs = diagnostics.frameMs.toFixed(2);
      diagnosticsConfig.heavyFrames = diagnostics.heavyFrames;
      diagnosticsConfig.cooldownSeconds = (diagnostics.cooldownMs / 1000).toFixed(1);
      diagnosticsConfig.probeActive = diagnostics.probeActive;
      diagnosticsConfig.probeSeconds = (diagnostics.probeElapsedMs / 1000).toFixed(1);
      diagnosticsConfig.probeHeavyFrames = diagnostics.probeHeavyFrames;
      diagnosticsConfig.warmupComplete = diagnostics.warmupComplete;
      diagnosticsConfig.reason = diagnostics.reason;
    }

    return { diagnosticsConfig, updateDiagnostics };
  }

  function addBloomConfig() {
    const bloomConfig = {
      strength: 1,
      radius: 0.4,
      threshold: 0.6
    };

    const bloomFolder = gui.addFolder('Bloom')
    bloomFolder.add(bloomConfig, 'strength', 0.0, 3.0).onChange(value => onConfigChange('bloom', 'strength', value))
    bloomFolder.add(bloomConfig, 'radius', 0.0, 1.0).onChange(value => onConfigChange('bloom', 'radius', value))
    bloomFolder.add(bloomConfig, 'threshold', 0.0, 1.0).onChange(value => onConfigChange('bloom', 'threshold', value))

    return bloomConfig;
  }

  function addCameraConfig() {
    const cameraConfig = {
      distance: 25,
      orbit: true,
      fov: 90.0,
      enableDrag: false,    // off by default — visitors scroll only
      particleOrbit: false  // when on, particles slowly revolve around the BH
    }
    const observerFolder = gui.addFolder('Observer')
    observerFolder.add(cameraConfig, 'fov', 30, 90).onChange(value => onConfigChange('camera', 'fov', value))
    observerFolder.add(cameraConfig, 'orbit').onChange(value => onConfigChange('camera', 'orbit', value))
    observerFolder.add(cameraConfig, 'enableDrag').name('Mouse Drag').onChange(value => onConfigChange('camera', 'enableDrag', value))
    observerFolder.add(cameraConfig, 'particleOrbit').name('Particle Orbit')
    observerFolder.open()
    return cameraConfig
  }

  function addEffectConfig() {
    const effectConfig = {
      lorentz_transform: true,
      accretion_disk: true,
      use_disk_texture: true,
      doppler_shift: true,
      beaming: true,
      show_lensing: true  // toggle background distortion arcs from gravitational lensing
    }
    let effectFolder = gui.addFolder('Effects')
    effectFolder.add(effectConfig, 'lorentz_transform').onChange(value => onConfigChange('effect', 'lorentz_transform', value))
    effectFolder.add(effectConfig, 'doppler_shift').onChange(value => onConfigChange('effect', 'doppler_shift', value))
    effectFolder.add(effectConfig, 'beaming').onChange(value => onConfigChange('effect', 'beaming', value))
    effectFolder.add(effectConfig, 'accretion_disk').onChange(value => onConfigChange('effect', 'accretion_disk', value))
    effectFolder.add(effectConfig, 'use_disk_texture').onChange(value => onConfigChange('effect', 'use_disk_texture', value))
    effectFolder.add(effectConfig, 'show_lensing').name('Lensing Arcs').onChange(value => onConfigChange('effect', 'show_lensing', value))
    effectFolder.open()
    return effectConfig;
  }

  function addSaveToScreenshot() {
    const etcconf = {
      'save as an image': saveScreenshot
    }
    gui.add(etcconf, 'save as an image')
  }


  return {
    performanceConfig,
    bloomConfig,
    effectConfig,
    cameraConfig,
    diagnosticsConfig,
    updateDiagnostics,
    disposeGUI: () => {
      window.removeEventListener('keydown', handleKeydown);
      gui.destroy();
    }
  }
}
