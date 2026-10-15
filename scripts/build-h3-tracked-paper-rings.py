"""Build pose-tracked, non-overlapping paper bands for the H3 contour beats."""

from pathlib import Path
import argparse
import hashlib
import json

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import distance_transform_edt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "projects/scratchpad-layered-cutout/media/sources"
POSES = [1, 4, 7, 10, 12, 14, 16]
ROLES = ["white", "blue", "green", "red", "yellow", "orange", "purple"]
WIDTHS = {"white": 10, "blue": 13, "green": 16, "red": 20, "yellow": 25, "orange": 30, "purple": 36}
COLORS = {
    "white": (247, 244, 235), "blue": (29, 105, 214),
    "green": (32, 176, 91), "red": (220, 55, 52),
    "yellow": (241, 194, 43), "orange": (239, 125, 50),
    "purple": (123, 75, 196),
}


def edge(distance: np.ndarray, radius: int, smoothing: float = 1.5) -> np.ndarray:
    binary = (distance <= radius).astype(np.uint8) * 255
    softened = Image.fromarray(binary).filter(ImageFilter.GaussianBlur(smoothing))
    return np.clip((np.asarray(softened, dtype=np.float32) - 110) * 8, 0, 255).astype(np.uint8)


def ring(distance: np.ndarray, inner: int, outer: int) -> np.ndarray:
    return np.clip(edge(distance, outer).astype(np.int16) - edge(distance, inner).astype(np.int16), 0, 255).astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE)
    parser.add_argument("--return-band-width", type=int, default=0,
                        help="Expand returned filled backing sheets by this many source pixels per color; zero keeps legacy rings.")
    parser.add_argument("--suffix", default="v5")
    parser.add_argument("--distance-fields", action="store_true", help="Write reusable RG16 distance maps for native animated contour widths")
    args = parser.parse_args()
    if args.return_band_width < 0:
        parser.error("return-band-width must be nonnegative")
    if args.return_band_width and args.suffix == "v5":
        parser.error("Expanded assets require a new suffix to preserve the original rings")
    receipts = []
    for beat, pose in enumerate(POSES):
        source = args.source_dir / f"h3-paper-pose-{pose:02}.png"
        actor = Image.open(source).convert("RGBA")
        mask = np.asarray(actor.getchannel("A")) > 128
        # The large return-paper source is displayed at scale 3 in the edit.
        # Embedding the 918x1912 actor at its center keeps pixel distances
        # identical to the opening stack after that existing transform.
        large = np.zeros((actor.height * 3, actor.width * 3), dtype=bool)
        large[actor.height:actor.height * 2, actor.width:actor.width * 2] = mask
        distance = distance_transform_edt(~large)
        if args.distance_fields:
            encoded = np.rint(np.clip(1 - distance / 1024, 0, 1) * 65535).astype(np.uint16)
            rgb = np.stack([(encoded >> 8).astype(np.uint8), (encoded & 255).astype(np.uint8), np.zeros_like(encoded, dtype=np.uint8)], axis=-1)
            path = args.source_dir / f"h3-contour-distance-pose-{pose:02}-v1.png"
            if path.exists():
                raise FileExistsError(f"Preserving existing derivative: {path}")
            Image.fromarray(rgb).save(path, optimize=True)
            receipts.append({"source": source.name, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "output": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "model": "rg-distance-1024-v1", "size": [actor.width * 3, actor.height * 3]})
            print(path.name)
            continue
        center = distance[actor.height:actor.height * 2, actor.width:actor.width * 2]
        # Rotate peeled front colors to the rear. The total radius stays 150px
        # throughout; purple moves inward as preceding colors disappear.
        order = ROLES[beat:] + ROLES[:beat]
        radius = 0
        for role in order:
            returned = role in ROLES[:beat]
            width = args.return_band_width if returned and args.return_band_width else WIDTHS[role]
            inner, outer = radius, radius + width
            radius = outer
            if returned:
                alpha = edge(distance, outer) if args.return_band_width else ring(distance, inner, outer)
                if np.any(alpha[0]) or np.any(alpha[-1]) or np.any(alpha[:, 0]) or np.any(alpha[:, -1]):
                    raise ValueError(f"Insufficient transparent overscan for pose {pose}, {role}, radius {outer}")
                rgba = Image.new("RGBA", (actor.width * 3, actor.height * 3), COLORS[role] + (0,))
                rgba.putalpha(Image.fromarray(alpha))
                path = args.source_dir / f"h3-cycle-return-pose-{pose:02}-{role}-{args.suffix}.png"
            else:
                if args.return_band_width:
                    continue  # Foreground rings are unchanged; reuse the existing sources.
                alpha = ring(center, inner, outer)
                rgba = Image.new("RGBA", actor.size, COLORS[role] + (0,))
                rgba.putalpha(Image.fromarray(alpha))
                path = args.source_dir / f"h3-cycle-ring-pose-{pose:02}-{role}-{args.suffix}.png"
            if args.return_band_width and path.exists():
                raise FileExistsError(f"Preserving existing derivative: {path}")
            rgba.save(path, optimize=True)
            receipts.append({"source": source.name, "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                             "output": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                             "inner_radius": inner, "outer_radius": outer, "filled": bool(args.return_band_width),
                             "size": rgba.size, "transparent_overscan": True})
            print(f"beat={beat} {role} {inner}:{outer} {path.name}")
        if not args.return_band_width:
            assert radius == 150
    if args.return_band_width or args.distance_fields:
        (args.source_dir / f"h3-paper-derivation-{args.suffix}.json").write_text(json.dumps({
            "recipe": "pose-tracked-outward-paper-v1", "return_band_width": args.return_band_width,
            "assets": receipts,
        }, indent=2) + "\n")


if __name__ == "__main__":
    main()
