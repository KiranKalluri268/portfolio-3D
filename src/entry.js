// The world study does not load the cinematic renderer, textures, or Lenis.
if (['free', 'guided', 'blackhole', 'wormhole'].includes(new URLSearchParams(location.search).get('world'))) {
  import('./experiments/freeWorld.js').then(({ createFreeWorld }) => createFreeWorld());
} else {
  import('./main.js');
}
