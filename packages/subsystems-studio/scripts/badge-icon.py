#!/usr/bin/env python3
"""
Composite a bottom "LIGHT" ribbon onto the clean FileCity app icon.

Reads the pristine brand export (`icon.png`, exported from logo-component) and
writes a badged copy (`icon-light.png`) with a horizontal ribbon across the
bottom edge. The badged PNG is what `icon.iconset` is built from, so the
Electrobun ("Light") build reads as distinct from the heavier Electron desktop
app, which uses the same unbadged FileCity "P".

Re-run after re-exporting the base icon:
    python3 scripts/badge-icon.py [LABEL]

LABEL defaults to "LIGHT". The iconset is rebuilt by `scripts/make-iconset.sh`.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PKG = HERE.parent
SRC = PKG / "icon.png"
OUT = PKG / "icon-light.png"

# Ice Tangerine Dark palette (matches the FileCity mark + the rest of the app).
RIBBON = (255, 107, 53, 255)   # #ff6b35 orange — the brand primary
TEXT = (13, 39, 77, 255)       # #0d274d navy panel — reads as cut-out on orange

FONT_PATH = "/System/Library/Fonts/SFNS.ttf"


def main() -> None:
    label = (sys.argv[1] if len(sys.argv) > 1 else "LIGHT").upper()

    base = Image.open(SRC).convert("RGBA")
    w, h = base.size

    # Ribbon spans the full width, sitting on the bottom edge.
    band_h = round(h * 0.20)
    band_top = h - band_h

    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle([0, band_top, w, h], fill=RIBBON)

    # Fit the label to ~78% of the width with letter spacing for a badge look.
    tracking = round(band_h * 0.16)
    target_w = w * 0.78
    target_h = band_h * 0.52

    def measure(font: ImageFont.FreeTypeFont):
        widths = [draw.textbbox((0, 0), ch, font=font)[2] for ch in label]
        tw = sum(widths) + tracking * (len(label) - 1)
        ascent, descent = font.getmetrics()
        return tw, ascent + descent, widths

    size = band_h
    font = ImageFont.truetype(FONT_PATH, size)
    tw, th, widths = measure(font)
    scale = min(target_w / tw, target_h / th)
    size = max(8, round(size * scale))
    font = ImageFont.truetype(FONT_PATH, size)
    tw, th, widths = measure(font)

    # Center the tracked string horizontally and vertically within the band.
    x = (w - tw) / 2
    ascent, descent = font.getmetrics()
    y = band_top + (band_h - (ascent + descent)) / 2
    for ch, cw in zip(label, widths):
        draw.text((x, y), ch, font=font, fill=TEXT)
        x += cw + tracking

    out = Image.alpha_composite(base, overlay)
    out.save(OUT)
    print(f"badge-icon: wrote {OUT.relative_to(PKG)} with label {label!r}")


if __name__ == "__main__":
    main()
