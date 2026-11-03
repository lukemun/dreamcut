"""Clean saved presenter masks without modifying the original evidence."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
from mask_postprocess import fill_small_enclosed_holes

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--fill-all-enclosed', action='store_true')
parser.add_argument('--largest-component', action='store_true')
args = parser.parse_args()
destination = Path(args.output)
destination.mkdir(parents=True, exist_ok=False)
rows = []
for source in sorted(Path(args.input).glob('[0-9][0-9][0-9][0-9][0-9].png')):
    raw = np.asarray(Image.open(source).convert('L')) > 127
    subject = raw
    if args.largest_component:
        labels, count = ndimage.label(subject)
        if count:
            sizes = np.bincount(labels.ravel())
            sizes[0] = 0
            subject = labels == sizes.argmax()
    clean = ndimage.binary_fill_holes(subject) if args.fill_all_enclosed else fill_small_enclosed_holes(subject)
    remaining = ndimage.binary_fill_holes(clean) & ~clean
    Image.fromarray(clean.astype(np.uint8) * 255).save(destination / source.name)
    rows.append({'frame': source.name, 'filled_pixels': int((clean & ~raw).sum()), 'remaining_hole_pixels': int(remaining.sum())})
summary = {'frame_count': len(rows), 'filled_pixels': sum(r['filled_pixels'] for r in rows), 'frames_with_remaining_holes': sum(r['remaining_hole_pixels'] > 0 for r in rows)}
(destination.parent / 'mask-cleanup.json').write_text(json.dumps({'summary': summary, 'frames': rows}, indent=2))
print(json.dumps(summary))
