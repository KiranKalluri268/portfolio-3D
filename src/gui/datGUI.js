import GUI from "lil-gui";

export function createConfigGUI(changePerformanceQuality, saveScreenshot) {

  const gui = new GUI()
  gui.hide();

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'c') {
      if (gui.domElement.style.display === 'none') {
        gui.show();
      } else {
        gui.hide();
      }
    }
  });
  const performanceConfig = addPerformanceConfig();
  const bloomConfig = addBloomConfig();
  const cameraConfig = addCameraConfig();
  const effectConfig = addEffectConfig();
  addSaveToScreenshot();

  // impl

  function addPerformanceConfig() {
    const performanceConfig = {
      resolution: 0.9,
      quality: 'low'
    }
    const perfFolder = gui.addFolder('Performance');
    perfFolder.add(performanceConfig, 'resolution', [0.25, 0.5, 0.75, 0.9, 1.0, 2.0, 4.0]);
    perfFolder.add(performanceConfig, 'quality', ['low', 'medium', 'high']).onChange(changePerformanceQuality);
    perfFolder.open();

    return performanceConfig;
  }

  function addBloomConfig() {
    const bloomConfig = {
      strength: 1,
      radius: 0.5,
      threshold: 0.55
    };

    const bloomFolder = gui.addFolder('Bloom')
    bloomFolder.add(bloomConfig, 'strength', 0.0, 3.0)
    bloomFolder.add(bloomConfig, 'radius', 0.0, 1.0)
    bloomFolder.add(bloomConfig, 'threshold', 0.0, 1.0)

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
    observerFolder.add(cameraConfig, 'fov', 30, 90)
    observerFolder.add(cameraConfig, 'orbit')
    observerFolder.add(cameraConfig, 'enableDrag').name('Mouse Drag')
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
    effectFolder.add(effectConfig, 'lorentz_transform')
    effectFolder.add(effectConfig, 'doppler_shift')
    effectFolder.add(effectConfig, 'beaming')
    effectFolder.add(effectConfig, 'accretion_disk')
    effectFolder.add(effectConfig, 'use_disk_texture')
    effectFolder.add(effectConfig, 'show_lensing').name('Lensing Arcs')
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
    cameraConfig
  }
}