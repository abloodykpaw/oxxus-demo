"""Generate transparent light/dark variants of the OXXUS logo PNG."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "oxxus-logo.png"
OUT_DIR = ROOT / "public"
PREVIEW_DIR = ROOT / "previews"


def is_background(r: int, g: int, b: int) -> bool:
    # Solid black (and near-black) baked into the asset
    return r <= 28 and g <= 28 and b <= 28


def is_electric_blue(r: int, g: int, b: int) -> bool:
    # Bright brand blue (checkmark, XX, underline)
    return b >= 140 and b > r + 25 and b > g + 15 and (b - min(r, g)) >= 40


def is_slate_subtitle(r: int, g: int, b: int) -> bool:
    # Desaturated slate used for CREDIT SOLUTIONS
    mx, mn = max(r, g, b), min(r, g, b)
    return 70 <= mx <= 190 and (mx - mn) <= 45 and b >= r - 5


def navy_to_light(r: int, g: int, b: int) -> tuple[int, int, int]:
    # Lift dark navy/ink into readable light tones while keeping hue bias
    brightness = (r + g + b) / 3
    t = max(0.0, min(1.0, brightness / 90.0))
    # Target: cool off-white / soft ice blue
    nr = int(210 + 35 * t)
    ng = int(220 + 28 * t)
    nb = int(235 + 18 * t)
    return (min(255, nr), min(255, ng), min(255, nb))


def process() -> None:
    img = Image.open(SRC).convert("RGBA")
    light_px: list[tuple[int, int, int, int]] = []
    dark_px: list[tuple[int, int, int, int]] = []

    for r, g, b, a in img.getdata():
        if is_background(r, g, b):
            light_px.append((0, 0, 0, 0))
            dark_px.append((0, 0, 0, 0))
            continue

        # Soft edge: near-black anti-alias → partial alpha
        if r <= 45 and g <= 45 and b <= 45:
            alpha = max(a, int((max(r, g, b) / 45) * 255))
            light_px.append((r, g, b, min(a, alpha // 3)))
            lr, lg, lb = navy_to_light(r, g, b)
            dark_px.append((lr, lg, lb, min(a, alpha // 2 + 40)))
            continue

        light_px.append((r, g, b, a))

        if is_electric_blue(r, g, b):
            # Keep / slightly brighten brand blue for dark surfaces
            dark_px.append((min(255, r + 10), min(255, g + 18), min(255, b + 8), a))
        elif is_slate_subtitle(r, g, b):
            dark_px.append((170, 188, 210, a))
        else:
            # Navy monogram + wordmark
            dark_px.append((*navy_to_light(r, g, b), a))

    light = Image.new("RGBA", img.size)
    dark = Image.new("RGBA", img.size)
    light.putdata(light_px)
    dark.putdata(dark_px)

    # Trim transparent margins a bit for cleaner layout
    bbox = light.getbbox()
    if bbox:
        light = light.crop(bbox)
        dark = dark.crop(bbox)

    targets = [
        (OUT_DIR / "oxxus-logo-light.png", light),
        (OUT_DIR / "oxxus-logo-dark.png", dark),
        (PREVIEW_DIR / "oxxus-logo-light.png", light),
        (PREVIEW_DIR / "oxxus-logo-dark.png", dark),
    ]
    for path, im in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        im.save(path, "PNG")
        print(f"wrote {path} ({im.size[0]}x{im.size[1]})")


if __name__ == "__main__":
    process()

