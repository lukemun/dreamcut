#!/usr/bin/env python3
"""Rotate each growing H3 paper color one layer outward on every cut."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "projects/scratchpad-layered-cutout/media/sources"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCES)
    parser.add_argument("--input-suffix", default="v2")
    parser.add_argument("--output-suffix", default="v3")
    args = parser.parse_args()
    receipt_path = args.source_dir / f"h3-growing-bands-{args.input_suffix}-receipt.json"
    receipt = json.loads(receipt_path.read_text())
    roles = list(receipt["palette_order"])
    first_beat = {asset["role"]: asset for asset in receipt["assets"] if asset["beat"] == 1}
    if set(first_beat) != set(roles):
        raise ValueError("The input receipt lacks a complete first-beat palette")
    palette = {}
    for role in roles:
        with Image.open(args.source_dir / first_beat[role]["output"]) as image:
            palette[role] = image.convert("RGBA").getpixel((0, 0))[:3]
    outputs = []
    for asset in receipt["assets"]:
        beat = asset["beat"]
        layer_index = roles.index(asset["role"])
        # At the next cut, the former inner color occupies the next outer band.
        # The former outer color cycles into the inner band.
        color_role = roles[(layer_index - (beat - 1)) % len(roles)]
        source = args.source_dir / asset["output"]
        if hashlib.sha256(source.read_bytes()).hexdigest() != asset["sha256"]:
            raise ValueError(f"Source asset changed: {source}")
        output = args.source_dir / asset["output"].replace(
            f"-{args.input_suffix}.png", f"-{args.output_suffix}.png"
        )
        if output.exists():
            raise FileExistsError(output)
        with Image.open(source) as image:
            alpha = image.getchannel("A")
            recolored = Image.new("RGBA", image.size, palette[color_role] + (0,))
            recolored.putalpha(alpha)
            recolored.save(output, optimize=True)
        outputs.append({
            **asset,
            "color_role": color_role,
            "color_rgb": list(palette[color_role]),
            "input": asset["output"],
            "output": output.name,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        })
    new_receipt = {
        **{key: value for key, value in receipt.items() if key != "assets"},
        "recipe": "outward-one-layer-per-cut-growing-bands-v1",
        "input_receipt": receipt_path.name,
        "assets": outputs,
    }
    output_receipt = args.source_dir / f"h3-growing-bands-{args.output_suffix}-receipt.json"
    if output_receipt.exists():
        raise FileExistsError(output_receipt)
    output_receipt.write_text(json.dumps(new_receipt, indent=2) + "\n")
    print(output_receipt)


if __name__ == "__main__":
    main()
