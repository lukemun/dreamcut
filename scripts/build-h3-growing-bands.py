#!/usr/bin/env python3
"""Build fixed-palette paper bands that widen once per selected H3 beat."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from importlib.util import spec_from_file_location, module_from_spec


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "projects/scratchpad-layered-cutout/media/sources"
SPEC = spec_from_file_location("tracked_rings", ROOT / "scripts/build-h3-tracked-paper-rings.py")
RINGS = module_from_spec(SPEC)
SPEC.loader.exec_module(RINGS)
BASE_WIDTHS = [RINGS.WIDTHS[role] for role in RINGS.ROLES]
BASE_TOTAL = sum(BASE_WIDTHS)


def band_widths(total):
    widths = [round(width * total / BASE_TOTAL) for width in BASE_WIDTHS[:-1]]
    widths.append(total - sum(widths))
    if min(widths) <= 0:
        raise ValueError("All visible bands must have positive width")
    return widths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--poses", required=True, help="Comma-separated pose tokens in beat order")
    parser.add_argument("--start-radius", type=int, default=150)
    parser.add_argument("--end-radius", type=int, default=650)
    parser.add_argument("--canvas-factor", type=float, default=2.1, help="Transparent canvas size relative to the actor canvas")
    parser.add_argument("--suffix", default="v1")
    parser.add_argument("--source-dir", type=Path, default=SOURCES)
    args = parser.parse_args()
    poses = [token.strip() for token in args.poses.split(",") if token.strip()]
    if not poses or len(set(poses)) != len(poses):
        parser.error("Poses must be a nonempty unique sequence")
    if args.start_radius < BASE_TOTAL or args.end_radius <= args.start_radius:
        parser.error("Use a start radius of at least 150 and a larger ending radius")
    if args.canvas_factor < 2.1:
        parser.error("A factor below 2.1 would clip the final 650px paper sheet")
    receipts = []
    previous_widths = None
    for beat_index, pose in enumerate(poses):
        source = args.source_dir / f"h3-beat-pose-{pose}-subject-v1.png"
        actor = Image.open(source).convert("RGBA")
        total = round(args.start_radius + (args.end_radius - args.start_radius) * beat_index / max(1, len(poses) - 1))
        widths = band_widths(total)
        if previous_widths and any(current <= previous for current, previous in zip(widths, previous_widths)):
            raise ValueError(f"Band widths did not grow on beat {beat_index + 1}: {widths}")
        previous_widths = widths
        mask = np.asarray(actor.getchannel("A")) > 128
        canvas_width = round(actor.width * args.canvas_factor)
        canvas_height = round(actor.height * args.canvas_factor)
        offset_x = (canvas_width - actor.width) // 2
        offset_y = (canvas_height - actor.height) // 2
        large = np.zeros((canvas_height, canvas_width), dtype=bool)
        large[offset_y:offset_y + actor.height, offset_x:offset_x + actor.width] = mask
        distance = distance_transform_edt(~large)
        radius = 0
        for role, width in zip(RINGS.ROLES, widths):
            outer = radius + width
            alpha = RINGS.ring(distance, radius, outer)
            if np.any(alpha[0]) or np.any(alpha[-1]) or np.any(alpha[:, 0]) or np.any(alpha[:, -1]):
                raise ValueError(f"Source canvas clips beat {beat_index + 1} {role} at radius {outer}")
            output = args.source_dir / f"h3-grow-pose-{pose}-{role}-step-{beat_index + 1:02}-{args.suffix}.png"
            if output.exists():
                raise FileExistsError(output)
            image = Image.new("RGBA", (canvas_width, canvas_height), RINGS.COLORS[role] + (0,))
            image.putalpha(Image.fromarray(alpha))
            image.save(output, optimize=True)
            receipts.append({
                "beat": beat_index + 1, "pose": pose, "role": role,
                "inner_radius": radius, "outer_radius": outer, "visible_width": width,
                "source": source.name, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "output": output.name, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                "size": list(image.size),
            })
            radius = outer
        print(f"Beat {beat_index + 1:02}: pose {pose}, total {total}px, widths {widths}", flush=True)
    receipt = args.source_dir / f"h3-growing-bands-{args.suffix}-receipt.json"
    receipt.write_text(json.dumps({
        "recipe": "fixed-palette-stepwise-euclidean-bands-v1",
        "poses": poses, "start_radius": args.start_radius, "end_radius": args.end_radius,
        "canvas_factor": args.canvas_factor,
        "palette_order": RINGS.ROLES, "assets": receipts,
    }, indent=2) + "\n")
    print(receipt, flush=True)


if __name__ == "__main__":
    main()
