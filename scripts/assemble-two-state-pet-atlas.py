#!/usr/bin/env python3
"""Assemble a compact 6x2 desktop-pet atlas from generated transparent assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CELL_WIDTH = 192
CELL_HEIGHT = 208
ROWS = 2


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return opened.convert("RGBA")


def fit_to_cell(source: Image.Image) -> Image.Image:
    target = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    bbox = source.getbbox()
    if bbox is None:
        raise SystemExit("completed asset is empty after transparency processing")
    sprite = source.crop(bbox)
    scale = min((CELL_WIDTH - 10) / sprite.width, (CELL_HEIGHT - 10) / sprite.height, 1.0)
    if scale < 1.0:
        sprite = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.LANCZOS,
        )
    left = (CELL_WIDTH - sprite.width) // 2
    top = (CELL_HEIGHT - sprite.height) // 2
    target.alpha_composite(sprite, (left, top))
    return target


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    data = bytearray(image.convert("RGBA").tobytes())
    for index in range(0, len(data), 4):
        if data[index + 3] == 0:
            data[index : index + 4] = b"\x00\x00\x00\x00"
    return Image.frombytes("RGBA", image.size, bytes(data))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--running-frames", required=True)
    parser.add_argument("--completed", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--webp-output", required=True)
    args = parser.parse_args()

    running_root = Path(args.running_frames).expanduser().resolve()
    running_paths = sorted(running_root.glob("[0-9][0-9].png"))
    if not running_paths:
        raise SystemExit(f"no numbered running frames found in {running_root}")
    expected_names = [f"{index:02d}.png" for index in range(len(running_paths))]
    actual_names = [path.name for path in running_paths]
    if actual_names != expected_names:
        raise SystemExit(
            "running frames must be consecutively numbered from 00.png; "
            f"found {', '.join(actual_names)}"
        )
    columns = len(running_paths)

    atlas = Image.new(
        "RGBA",
        (columns * CELL_WIDTH, ROWS * CELL_HEIGHT),
        (0, 0, 0, 0),
    )
    for column, path in enumerate(running_paths):
        frame = load_rgba(path)
        if frame.size != (CELL_WIDTH, CELL_HEIGHT):
            raise SystemExit(f"running frame {path} is {frame.size}; expected 192x208")
        atlas.alpha_composite(frame, (column * CELL_WIDTH, 0))

    completed = fit_to_cell(load_rgba(Path(args.completed).expanduser().resolve()))
    atlas.alpha_composite(completed, (0, CELL_HEIGHT))
    atlas = clear_transparent_rgb(atlas)

    output = Path(args.output).expanduser().resolve()
    webp_output = Path(args.webp_output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    webp_output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output)
    atlas.save(webp_output, format="WEBP", lossless=True, quality=100, method=6, exact=True)
    print(f"wrote {output}")
    print(f"wrote {webp_output}")


if __name__ == "__main__":
    main()
