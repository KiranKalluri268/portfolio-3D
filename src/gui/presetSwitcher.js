// An always-visible preset dropdown, sitting next to the FPS meter.
//
// The lil-gui panel already has a preset control, but it is behind Ctrl+Alt+C,
// which no phone can press. Tier behaviour is most worth watching on exactly the
// devices that cannot open it — a mid-range Android on battery, ten minutes in,
// thermally throttled — so this is plain DOM, always mounted, and a native
// <select> so touch gets the OS picker rather than a hand-rolled menu.
//
// It always shows the tier actually running, whether that came from the
// benchmark or from a selection, so a safety downgrade during the fall is
// visible as it happens rather than inferred afterwards from the console.

const TIERS = ['low', 'medium', 'high'];

export function createPresetSwitcher({ onSelect }) {
  const select = document.createElement('select');
  select.id = 'preset-switcher';
  select.setAttribute('aria-label', 'Graphics preset');

  for (const tier of TIERS) {
    const option = document.createElement('option');
    option.value = tier;
    option.textContent = tier[0].toUpperCase() + tier.slice(1);
    select.appendChild(option);
  }

  select.addEventListener('change', () => onSelect(select.value));
  document.body.appendChild(select);

  function setTier(tier) {
    if (!TIERS.includes(tier) || select.value === tier) return;
    select.value = tier;
  }

  function dispose() {
    select.remove();
  }

  return { setTier, dispose };
}
