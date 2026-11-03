#!/usr/bin/env python3
"""Remove only edge-connected near-black backing from sprite-frame PNGs.

A global black key also erases dark shirt and hair detail. This small,
deterministic flood fill leaves enclosed black texture intact.
"""

from collections import deque
from pathlib import Path

from PIL import Image


SOURCES = Path("projects/scratchpad-layered-cutout/media/sources")
PAIRINGS = (("h3-motion", "h3-motion-alpha"), ("arm-cross", "arm-cross-alpha"))
BLACK_THRESHOLD = 12


def edge_connected_black_alpha(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index]:
            return
        r, g, b, _ = pixels[x, y]
        if max(r, g, b) > BLACK_THRESHOLD:
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    alpha = Image.new("L", (width, height), 255)
    alpha_pixels = alpha.load()
    for index, is_background in enumerate(visited):
        if is_background:
            alpha_pixels[index % width, index // width] = 0
    image.putalpha(alpha)
    image.save(destination, optimize=True)


if __name__ == "__main__":
    for source_prefix, output_prefix in PAIRINGS:
        for number in range(1, 17):
            suffix = f"{number:02d}.png"
            edge_connected_black_alpha(
                SOURCES / f"{source_prefix}-{suffix}",
                SOURCES / f"{output_prefix}-{suffix}",
            )
