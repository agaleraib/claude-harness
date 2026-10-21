#!/usr/bin/env python3
"""Generate AppIcon.icns for a project launcher.

The mark is three streams fanning out from a shared node — generic enough for
any project, and legible at 16px where a logotype would not be. Colours come
from launcher.conf, so the Dock icon can match the app's own palette.

Usage:  python3 make-icon.py            # writes AppIcon.icns next to this file
Requires Pillow and macOS `iconutil`.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent

DEFAULTS = {
    "ICON_BG_TOP": "#14141a",
    "ICON_BG_BOTTOM": "#08080c",
    "ICON_ACCENT": "#5ba8a0",
    "ICON_NODE": "#e8e6e3",
}

# Sizes macOS expects inside an .iconset directory.
ICONSET = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png"),
]


def read_conf() -> dict[str, str]:
    """Pull the ICON_* assignments out of launcher.conf without running it."""
    conf = dict(DEFAULTS)
    path = HERE / "launcher.conf"
    if not path.exists():
        return conf
    pattern = re.compile(r'^\s*(ICON_[A-Z_]+)\s*=\s*"?([^"#\s]+)"?')
    for line in path.read_text().splitlines():
        match = pattern.match(line)
        if match and match.group(1) in conf:
            conf[match.group(1)] = match.group(2)
    return conf


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    if len(value) != 6:
        raise SystemExit(f"bad hex colour: #{value}")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def render(size: int, colors: dict[str, tuple[int, int, int]]) -> Image.Image:
    """Draw the icon at `size`, supersampled 4x then downscaled for clean edges."""
    scale = 4
    side = size * scale
    img = Image.new("RGBA", (side, side), (0, 0, 0, 0))

    gradient = Image.new("RGBA", (side, side))
    gdraw = ImageDraw.Draw(gradient)
    top, bottom = colors["bg_top"], colors["bg_bottom"]
    for y in range(side):
        t = y / max(side - 1, 1)
        gdraw.line(
            [(0, y), (side, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,),
        )

    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, side - 1, side - 1], radius=int(side * 0.225), fill=255
    )
    img.paste(gradient, (0, 0), mask)

    draw = ImageDraw.Draw(img)

    # Hairline inner border so the icon keeps an edge on dark Dock backgrounds.
    draw.rounded_rectangle(
        [1, 1, side - 2, side - 2],
        radius=int(side * 0.225),
        outline=(255, 255, 255, 26),
        width=max(1, int(side * 0.006)),
    )

    origin_x, origin_y = side * 0.24, side * 0.50
    thickness = max(1, int(side * 0.075))
    accent = colors["accent"]
    # (end x, end y, alpha) as fractions of the side.
    for end_x, end_y, alpha in [(0.76, 0.255, 255), (0.80, 0.500, 200), (0.72, 0.745, 140)]:
        cx, cy = side * end_x, side * end_y
        draw.line([(origin_x, origin_y), (cx, cy)], fill=accent + (alpha,), width=thickness)
        r = thickness / 2
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent + (alpha,))

    # Origin node last, so it sits above the stream roots.
    node_r = side * 0.072
    draw.ellipse(
        [origin_x - node_r, origin_y - node_r, origin_x + node_r, origin_y + node_r],
        fill=colors["node"] + (255,),
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> int:
    if shutil.which("iconutil") is None:
        print("iconutil not found — macOS only", file=sys.stderr)
        return 1

    conf = read_conf()
    colors = {
        "bg_top": rgb(conf["ICON_BG_TOP"]),
        "bg_bottom": rgb(conf["ICON_BG_BOTTOM"]),
        "accent": rgb(conf["ICON_ACCENT"]),
        "node": rgb(conf["ICON_NODE"]),
    }

    iconset = HERE / "AppIcon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()

    for size, name in ICONSET:
        render(size, colors).save(iconset / name)

    out = HERE / "AppIcon.icns"
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(out)], check=True)
    shutil.rmtree(iconset)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
