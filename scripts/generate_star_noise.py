"""Generate a seamless data texture for the black-hole star shader.

Channel encoding matches fragmentShader.glsl:
  red   = normalized stellar temperature
  green = emitted brightness
  blue  = radial velocity encoded around 0.5
  alpha = opaque
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def add_star(
    texture: np.ndarray,
    x: int,
    y: int,
    temperature: float,
    brightness: float,
    velocity: float,
    radius: int,
) -> None:
    height, width, _ = texture.shape
    sigma = max(0.42, radius * 0.48)

    for dy in range(-radius, radius + 1):
        py = (y + dy) % height
        for dx in range(-radius, radius + 1):
            px = (x + dx) % width
            falloff = np.exp(-(dx * dx + dy * dy) / (2.0 * sigma * sigma))
            emitted = brightness * falloff
            if emitted <= texture[py, px, 1]:
                continue

            texture[py, px, 0] = temperature
            texture[py, px, 1] = emitted
            texture[py, px, 2] = velocity


def generate(width: int, height: int, seed: int, count: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    texture = np.zeros((height, width, 4), dtype=np.float32)
    texture[:, :, 2] = 0.5
    texture[:, :, 3] = 1.0

    # Uniform on a sphere: longitude is uniform and latitude follows asin(z).
    longitudes = rng.random(count)
    sphere_z = rng.uniform(-1.0, 1.0, count)
    latitudes = (np.arcsin(sphere_z) / np.pi) + 0.5
    xs = np.floor(longitudes * width).astype(np.int32)
    ys = np.floor(latitudes * height).astype(np.int32)

    # Most stars are dim single pixels; a small tail forms visible highlights.
    temperatures = np.clip(rng.beta(2.0, 2.2, count), 0.0, 1.0)
    brightnesses = 0.025 + rng.power(5.8, count) * 0.72
    velocities = np.clip(0.5 + rng.normal(0.0, 0.075, count), 0.18, 0.82)
    radii = np.zeros(count, dtype=np.int8)
    bright = brightnesses > 0.58
    very_bright = brightnesses > 0.70
    radii[bright] = 1
    radii[very_bright] = 1

    for x, y, temperature, brightness, velocity, radius in zip(
        xs, ys, temperatures, brightnesses, velocities, radii
    ):
        add_star(
            texture,
            int(x),
            int(y),
            float(temperature),
            float(brightness),
            float(velocity),
            int(radius),
        )

    # A few standout stars are deliberately sparse and still encode shader data.
    for _ in range(18):
        add_star(
            texture,
            int(rng.integers(0, width)),
            int(rng.integers(0, height)),
            float(rng.choice((0.12, 0.48, 0.82))),
            float(rng.uniform(0.82, 1.0)),
            float(np.clip(0.5 + rng.normal(0.0, 0.06), 0.25, 0.75)),
            int(rng.integers(1, 4)),
        )

    return Image.fromarray(np.uint8(np.clip(texture, 0.0, 1.0) * 255), mode="RGBA")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=4096)
    parser.add_argument("--height", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=24680)
    parser.add_argument("--count", type=int, default=85_000)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("assets/star_noise-generated.png"),
    )
    args = parser.parse_args()

    if args.width != args.height * 2:
        raise SystemExit("Equirectangular output must use a 2:1 width-to-height ratio.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    image = generate(args.width, args.height, args.seed, args.count)
    image.save(args.output, optimize=True)
    print(
        f"Generated {args.output} "
        f"({args.width}x{args.height}, stars={args.count}, seed={args.seed})"
    )


if __name__ == "__main__":
    main()
