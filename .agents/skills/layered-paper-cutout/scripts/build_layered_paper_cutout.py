#!/usr/bin/env python3
"""Build aligned, editable paper-contour PNGs from a transparent still."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


INF = 1e20


def parse_hex(value: str) -> tuple[int, int, int]:
    raw = value.removeprefix("#")
    if len(raw) != 6:
        raise argparse.ArgumentTypeError("colour must be #rrggbb")
    try:
        return tuple(int(raw[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]
    except ValueError as error:
        raise argparse.ArgumentTypeError("colour must be #rrggbb") from error


def parse_layer(value: str) -> dict[str, object]:
    parts = value.split(":")
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("layer must be role:#rrggbb:visible-width:smoothing")
    role, colour, width_text, smoothing_text = parts
    if not role or not role.replace("-", "").replace("_", "").isalnum():
        raise argparse.ArgumentTypeError("layer role must contain letters, digits, hyphens, or underscores")
    try:
        width = int(width_text)
        smoothing = float(smoothing_text)
    except ValueError as error:
        raise argparse.ArgumentTypeError("layer width and smoothing must be numeric") from error
    if width <= 0 or smoothing < 0:
        raise argparse.ArgumentTypeError("layer width must be positive and smoothing cannot be negative")
    return {"role": role, "rgb": parse_hex(colour), "visible_width": width, "smoothing": smoothing}


def edt_1d(values: np.ndarray) -> np.ndarray:
    """Squared Euclidean distance transform for one vector (Felzenszwalb/Huttenlocher)."""
    length = len(values)
    sites = np.zeros(length, dtype=np.int32)
    boundaries = np.empty(length + 1, dtype=np.float64)
    output = np.empty(length, dtype=np.float64)
    envelope = 0
    sites[0] = 0
    boundaries[0] = -INF
    boundaries[1] = INF
    for point in range(1, length):
        site = sites[envelope]
        crossing = ((values[point] + point * point) - (values[site] + site * site)) / (2 * point - 2 * site)
        while crossing <= boundaries[envelope]:
            envelope -= 1
            site = sites[envelope]
            crossing = ((values[point] + point * point) - (values[site] + site * site)) / (2 * point - 2 * site)
        envelope += 1
        sites[envelope] = point
        boundaries[envelope] = crossing
        boundaries[envelope + 1] = INF
    envelope = 0
    for point in range(length):
        while boundaries[envelope + 1] < point:
            envelope += 1
        delta = point - sites[envelope]
        output[point] = delta * delta + values[sites[envelope]]
    return output


def distance_from_foreground(mask: np.ndarray) -> np.ndarray:
    source = np.where(mask, 0.0, INF)
    vertical = np.empty_like(source, dtype=np.float64)
    for column in range(source.shape[1]):
        vertical[:, column] = edt_1d(source[:, column])
    distance = np.empty_like(vertical)
    for row in range(vertical.shape[0]):
        distance[row, :] = edt_1d(vertical[row, :])
    return distance


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Transparent PNG actor")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--layer", action="append", type=parse_layer, required=True,
                        help="role:#rrggbb:visible-width:smoothing; repeat front to back")
    parser.add_argument("--padding", type=int, default=None,
                        help="Transparent pixels around the cropped actor; defaults to widest radius plus smoothing overscan")
    parser.add_argument("--grain", type=float, default=2.1, help="Paper grain standard deviation")
    parser.add_argument("--seed", type=int, default=20260920)
    parser.add_argument("--preview", action="store_true", help="Also write a black-background stack preview")
    args = parser.parse_args()

    actor = Image.open(args.input).convert("RGBA")
    alpha = np.asarray(actor.getchannel("A"))
    visible = alpha >= 128
    rows, columns = np.where(visible)
    if not len(rows):
        raise SystemExit("input has no visible alpha")

    layers: list[dict[str, object]] = args.layer
    cumulative_radius = sum(int(layer["visible_width"]) for layer in layers)
    max_smoothing = max(float(layer["smoothing"]) for layer in layers)
    minimum_padding = cumulative_radius + int(np.ceil(max_smoothing * 2)) + 4
    padding = minimum_padding if args.padding is None else args.padding
    if padding < minimum_padding:
        raise SystemExit(f"padding {padding} is too small; use at least {minimum_padding}")

    left, top, right, bottom = columns.min(), rows.min(), columns.max() + 1, rows.max() + 1
    cropped = actor.crop((left, top, right, bottom))
    canvas_size = (cropped.width + padding * 2, cropped.height + padding * 2)
    aligned_actor = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    aligned_actor.alpha_composite(cropped, (padding, padding))
    aligned_mask = np.asarray(aligned_actor.getchannel("A")) >= 128
    distance_squared = distance_from_foreground(aligned_mask)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    subject_path = args.output_dir / "subject-paper.png"
    aligned_actor.save(subject_path, optimize=True)

    height, width = aligned_mask.shape
    random = np.random.default_rng(args.seed)
    grain = random.normal(0, args.grain, (height, width, 1))
    output_layers: list[dict[str, object]] = []
    radius = 0
    for layer in layers:
        radius += int(layer["visible_width"])
        smoothing = float(layer["smoothing"])
        binary = (distance_squared <= radius * radius).astype(np.uint8) * 255
        softened = Image.fromarray(binary, "L").filter(ImageFilter.GaussianBlur(smoothing))
        smoothed_alpha = np.asarray(softened, dtype=np.float32)
        clean_alpha = np.clip((smoothed_alpha - 104.0) * 3.2, 0, 255).astype(np.uint8)

        rgb = np.asarray(layer["rgb"], dtype=np.float32).reshape(1, 1, 3)
        paper = np.clip(rgb + grain, 0, 255).astype(np.uint8)
        rgba = np.empty((height, width, 4), dtype=np.uint8)
        rgba[:, :, :3] = paper
        rgba[:, :, 3] = clean_alpha
        filename = f"silhouette-{layer['role']}-paper.png"
        destination = args.output_dir / filename
        Image.fromarray(rgba, "RGBA").save(destination, optimize=True)
        output_layers.append({
            "file": filename,
            "role": layer["role"],
            "rgb": list(layer["rgb"]),
            "visible_band_width": layer["visible_width"],
            "cumulative_radius": radius,
            "edge_smoothing": smoothing,
            "sha256": sha256(destination),
        })

    if args.preview:
        preview = Image.new("RGBA", canvas_size, (0, 0, 0, 255))
        for layer in reversed(output_layers):
            preview.alpha_composite(Image.open(args.output_dir / str(layer["file"])).convert("RGBA"))
        preview.alpha_composite(aligned_actor)
        preview.convert("RGB").save(args.output_dir / "paper-stack-preview.png", quality=94)

    receipt = {
        "schema_version": 1,
        "recipe": "layered-paper-cutout-euclidean-distance-v1",
        "source": str(args.input.resolve()),
        "source_crop": [int(left), int(top), int(right), int(bottom)],
        "canvas_size": list(canvas_size),
        "padding_pixels": padding,
        "paper_texture_seed": args.seed,
        "paper_grain_standard_deviation": args.grain,
        "subject": {"file": subject_path.name, "sha256": sha256(subject_path)},
        "layers": output_layers,
        "image_generation_used": False,
    }
    (args.output_dir / "derivation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
