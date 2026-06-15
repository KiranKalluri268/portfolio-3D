# Portfolio 3D

An interactive Three.js portfolio experience built around a cinematic
Schwarzschild black-hole journey.

## Development

```bash
npm install
npm run dev
```

Create the original procedural space textures with:

```bash
python scripts/generate_milkyway.py --output assets/milkyway-preview.jpg
python scripts/generate_star_noise.py
```

## Licensing

This project contains GPL-derived black-hole rendering work and is distributed
under the **GNU General Public License, version 3 or any later version**. See
[`LICENSE`](LICENSE) for the full terms.

The project also uses and derives from third-party work under compatible open
source licenses. Copyright, attribution, asset provenance, and dependency
details are recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The generated Milky Way and star-data textures are original project assets
created by the scripts in `scripts/`; they are covered by the project's GPL
license and do not incorporate the former CC BY-NC Milky Way image.
