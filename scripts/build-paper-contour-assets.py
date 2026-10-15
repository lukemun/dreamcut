#!/usr/bin/env python3
"""Build recolorable contours on a padded reference canvas; never edits a timeline."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--output-dir', required=True, type=Path)
parser.add_argument('--widths', required=True, help='Comma-separated band widths')
parser.add_argument('--canvas-multiple', type=int, default=3)
args = parser.parse_args()
builder_path = Path(__file__).resolve().parents[1] / '.agents/skills/layered-paper-cutout/scripts/build_layered_paper_cutout.py'
spec = importlib.util.spec_from_file_location('paper_builder', builder_path)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
# Equivalent circular-distance implementation, accelerated for large padded assets.
try:
    from scipy.ndimage import distance_transform_edt
    builder.distance_from_foreground = lambda mask: distance_transform_edt(~mask) ** 2
except ImportError:
    pass  # The shared builder includes an exact dependency-free EDT fallback.
widths = [int(value) for value in args.widths.split(',')]
sys.argv = [str(builder_path), '--input', str(args.input), '--output-dir', str(args.output_dir / 'built'), '--grain', '0']
for index, width in enumerate(widths):
    sys.argv += ['--layer', f'{index + 1}:#ffffff:{width}:{1 + index * 0.4}']
builder.main()
receipt = json.loads((args.output_dir / 'built/derivation.json').read_text())
source = Image.open(args.input)
size = (source.width * args.canvas_multiple, source.height * args.canvas_multiple)
left, top, _, _ = receipt['source_crop']
offset = ((size[0] - source.width) // 2 + left - receipt['padding_pixels'], (size[1] - source.height) // 2 + top - receipt['padding_pixels'])
for index, layer in enumerate(receipt['layers']):
    contour = Image.open(args.output_dir / 'built' / layer['file'])
    bounds = contour.getbbox()
    if bounds[0] + offset[0] < 0 or bounds[1] + offset[1] < 0 or bounds[2] + offset[0] > size[0] or bounds[3] + offset[1] > size[1]:
        raise SystemExit('Contour clips the reference canvas; increase --canvas-multiple')
    canvas = Image.new('RGBA', size)
    canvas.alpha_composite(contour, offset)
    output = args.output_dir / f'gentle-paper-{index + 1}.png'
    canvas.save(output, optimize=True)
    layer['aligned_file'] = output.name
    layer['aligned_sha256'] = builder.sha256(output)
receipt.update(reference_canvas=list(source.size), aligned_canvas=list(size), reference_offset=list(offset))
(args.output_dir / 'derivation.json').write_text(json.dumps(receipt, indent=2) + '\n')
