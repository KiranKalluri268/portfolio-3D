"""Generate an original equirectangular Milky Way-style sky texture.

The output is horizontally seamless and intended for spherical environment
mapping. It does not use or transform any third-party source image.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def periodic_noise(width: int, height: int, rng: np.random.Generator, scale: int) -> np.ndarray:
    """Create smooth noise whose left and right edges match."""
    grid_w = max(8, width // scale)
    grid_h = max(4, height // scale)
    grid = rng.random((grid_h, grid_w), dtype=np.float32)

    tile = Image.fromarray(np.uint8(grid * 255), mode="L")
    tile = tile.resize((width, height), Image.Resampling.BICUBIC)
    noise = np.asarray(tile, dtype=np.float32) / 255.0

    # Blend the texture with a wrapped copy across a wide seam region.
    seam = max(32, width // 12)
    ramp = np.linspace(0.0, 1.0, seam, dtype=np.float32)[None, :]
    left = noise[:, :seam].copy()
    right = noise[:, -seam:].copy()
    blend = right * (1.0 - ramp) + left * ramp
    noise[:, :seam] = blend
    noise[:, -seam:] = blend
    return noise


def add_stars(
    image: np.ndarray,
    band_weight: np.ndarray,
    rng: np.random.Generator,
    count: int,
) -> None:
    height, width, _ = image.shape
    flat_weight = (0.15 + 0.85 * band_weight).ravel()
    flat_weight /= flat_weight.sum()

    indices = rng.choice(width * height, size=count, replace=True, p=flat_weight)
    ys, xs = np.divmod(indices, width)
    temperatures = rng.random(count)
    brightness = rng.power(5.0, count) * 1.7 + 0.08

    colors = np.empty((count, 3), dtype=np.float32)
    cool = temperatures < 0.28
    warm = temperatures > 0.78
    neutral = ~(cool | warm)
    colors[cool] = (0.62, 0.76, 1.0)
    colors[warm] = (1.0, 0.72, 0.45)
    colors[neutral] = (1.0, 0.96, 0.86)

    for channel in range(3):
        np.add.at(image[:, :, channel], (ys, xs), brightness * colors[:, channel])

    # Give a small subset a compact glow without turning the whole image soft.
    bright = brightness > 1.15
    for y, x, color, value in zip(ys[bright], xs[bright], colors[bright], brightness[bright]):
        for dy, dx, falloff in ((0, 1, 0.22), (0, -1, 0.22), (1, 0, 0.22), (-1, 0, 0.22)):
            image[(y + dy) % height, (x + dx) % width] += color * value * falloff


def add_feature_stars(image: np.ndarray, rng: np.random.Generator, count: int = 10) -> None:
    """Add a few isolated stars that remain prominent in the rendered scene."""
    height, width, _ = image.shape
    xs = rng.integers(0, width, size=count)
    ys = rng.integers(0, height, size=count)
    colors = np.array(
        ((0.72, 0.84, 1.0), (1.0, 0.96, 0.86), (1.0, 0.78, 0.56)),
        dtype=np.float32,
    )

    yy, xx = np.ogrid[:height, :width]
    for index, (x, y) in enumerate(zip(xs, ys)):
        color = colors[rng.integers(0, len(colors))]
        strength = rng.uniform(1.8, 2.8)
        radius = int(rng.integers(8, 15))
        dx = np.minimum(np.abs(xx - x), width - np.abs(xx - x))
        distance_squared = dx * dx + (yy - y) * (yy - y)
        halo = np.exp(-distance_squared / (2.0 * (radius * 0.55) ** 2))
        image += halo[:, :, None] * color * strength

        if index % 3 == 0:
            spike = np.exp(-np.abs(yy - y) / 0.65) * np.exp(-dx / (radius * 1.8))
            image += spike[:, :, None] * color * strength * 0.22


def generate(width: int, height: int, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    x = np.linspace(0.0, 2.0 * np.pi, width, endpoint=False, dtype=np.float32)[None, :]
    y = np.linspace(-1.0, 1.0, height, dtype=np.float32)[:, None]

    # A periodic, gently warped galactic plane.
    center = 0.08 * np.sin(x * 1.0 + 0.7) + 0.035 * np.sin(x * 3.0 - 0.9)
    latitude = y - center
    middle_width = 1.0 + 0.55 * np.exp(-(((x - np.pi) / 0.85) ** 2))
    broad_band = np.exp(-((latitude / (0.20 * middle_width)) ** 2))
    core = np.exp(-((latitude / (0.075 * middle_width)) ** 2))

    large_noise = periodic_noise(width, height, rng, scale=180)
    medium_noise = periodic_noise(width, height, rng, scale=70)
    fine_noise = periodic_noise(width, height, rng, scale=24)
    structure = 0.48 * large_noise + 0.34 * medium_noise + 0.18 * fine_noise

    # Dark dust lanes run through the brightest part of the galaxy.
    dust_noise = periodic_noise(width, height, rng, scale=45)
    dust_middle_width = 1.0 + 1.15 * np.exp(-(((x - np.pi) / 0.78) ** 2))
    dust_lane = np.exp(
        -(((latitude + 0.018 * np.sin(x * 5.0)) / (0.038 * dust_middle_width)) ** 2)
    )
    dust = dust_lane * np.clip((dust_noise - 0.35) * 1.8, 0.0, 1.0)

    image = np.zeros((height, width, 3), dtype=np.float32)
    image[:] = (0.0015, 0.002, 0.0045)

    cool_haze = broad_band * (0.035 + 0.18 * structure)
    center_brightness = 0.42 + 1.15 * np.exp(-(((x - np.pi) / 0.78) ** 2))
    warm_core = core * (0.055 + 0.42 * structure) * center_brightness
    image += cool_haze[:, :, None] * np.array((0.38, 0.52, 0.82), dtype=np.float32)
    image += warm_core[:, :, None] * np.array((1.0, 0.68, 0.38), dtype=np.float32)

    # Overlapping colored nebula layers embedded within the warm core.
    colored_clouds = (
        (0.65, 0.018, 0.30, 0.050, (0.90, 0.25, 0.58), 0.16),
        (1.48, -0.020, 0.38, 0.060, (0.55, 0.25, 0.95), 0.15),
        (2.32, 0.024, 0.34, 0.055, (0.16, 0.72, 0.68), 0.14),
        (3.02, -0.012, 0.42, 0.070, (1.00, 0.34, 0.16), 0.20),
        (3.72, 0.020, 0.32, 0.055, (0.86, 0.28, 0.72), 0.17),
        (4.50, -0.022, 0.38, 0.060, (0.20, 0.62, 0.82), 0.15),
        (5.35, 0.016, 0.30, 0.050, (0.95, 0.40, 0.18), 0.16),
    )
    cloud_texture = 0.30 + 0.70 * (0.55 * medium_noise + 0.45 * fine_noise)
    for cloud_x, cloud_y, radius_x, radius_y, color, strength in colored_clouds:
        dx = np.abs(x - cloud_x)
        dx = np.minimum(dx, 2.0 * np.pi - dx)
        cloud = np.exp(-((dx / radius_x) ** 2 + ((latitude - cloud_y) / radius_y) ** 2))
        image += cloud[:, :, None] * cloud_texture[:, :, None] * np.array(
            color, dtype=np.float32
        ) * strength

    image *= (1.0 - 0.72 * dust[:, :, None])

    add_stars(image, np.clip(0.2 + broad_band * 0.8, 0.0, 1.0), rng, count=105_000)
    add_feature_stars(image, rng)

    # Softly bloom only the brightest pixels and composite them back.
    base = np.clip(image, 0.0, 1.0)
    highlights = np.clip((base - 0.45) * 2.2, 0.0, 1.0)
    glow = Image.fromarray(np.uint8(highlights * 255), mode="RGB").filter(
        ImageFilter.GaussianBlur(radius=max(1.0, width / 3000.0))
    )
    glow_array = np.asarray(glow, dtype=np.float32) / 255.0
    image = np.clip(base + glow_array * 0.42, 0.0, 1.0)

    # Mild display gamma, preserving dark sky detail.
    image = np.power(image, 1.0 / 2.2)
    return Image.fromarray(np.uint8(np.clip(image, 0.0, 1.0) * 255), mode="RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=6000)
    parser.add_argument("--height", type=int, default=3000)
    parser.add_argument("--seed", type=int, default=73194)
    parser.add_argument("--quality", type=int, default=94)
    parser.add_argument("--output", type=Path, default=Path("assets/milkyway-generated.jpg"))
    args = parser.parse_args()

    if args.width != args.height * 2:
        raise SystemExit("Equirectangular output must use a 2:1 width-to-height ratio.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    image = generate(args.width, args.height, args.seed)
    image.save(args.output, quality=args.quality, subsampling=0, optimize=True)
    print(f"Generated {args.output} ({args.width}x{args.height}, seed={args.seed})")


if __name__ == "__main__":
    main()
