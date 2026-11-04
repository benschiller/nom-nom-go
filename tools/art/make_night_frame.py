#!/usr/bin/env python3
"""Derive env.night.frame: the night truck front plate with the serving
window transparent, so the chef can layer behind it (no CSS clipping).

The window is a clean rounded rect in env.night.goodbye (measured
2026-11-04: x 550-936, y 310-582 in the 1600x900 plate). Everything
outside the window is copied pixel-for-pixel; the window interior
becomes alpha 0 with a 3px feather.

Run: python3 tools/art/make_night_frame.py
Writes generated_images/production/final/env.night.frame.webp; then run
tools/art/sync_game_art.py to ship it.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "game/public/art/env.night.goodbye.webp"
OUT = ROOT / "generated_images/production/final/env.night.frame.webp"
WINDOW = (550, 310, 937, 583)  # x0, y0, x1, y1 (inclusive-exclusive)
RADIUS = 18


def main() -> None:
    plate = Image.open(SRC).convert("RGB")
    mask = Image.new("L", plate.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(WINDOW, radius=RADIUS, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    alpha = Image.fromarray((255 - np.asarray(mask)).astype(np.uint8), "L")
    frame = plate.convert("RGBA")
    frame.putalpha(alpha)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frame.save(OUT, "WEBP", lossless=True, quality=100, method=6)
    print(f"wrote {OUT} {frame.size}")


if __name__ == "__main__":
    main()
