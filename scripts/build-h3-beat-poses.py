"""Prepare additional approved H3 sprite poses and matching regular paper rings."""
import hashlib
import json
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "projects/scratchpad-layered-cutout/media/sources"
def module(name, filename):
    spec = spec_from_file_location(name, ROOT / "scripts" / filename)
    loaded = module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded
pose = module("poses", "build-h3-paper-states.py")
rings = module("rings", "build-h3-tracked-paper-rings.py")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--frames", default="3,4,5,6,8,9,10,11,13,14,15,16")
parser.add_argument("--receipt-suffix", default="v1")
parser.add_argument("--subjects-only", action="store_true", help="Stabilize new source-video poses without making the legacy fixed-radius rings")
args = parser.parse_args()
frames = [f"{int(value):02}" if value.isdigit() else value for value in args.frames.split(",")]
stage_by_frame = {"03":1,"04":1,"05":2,"06":2,"07":3,"08":3,"09":3,"10":4,"11":4,"11a":4,"12":4,"13":5,"14":5,"15":6,"15a":6,"15b":6,"16":6}
first = Image.open(SOURCE / "h3-motion-alpha-01.png").convert("RGBA")
box = pose.bbox_and_anchor(first)
scale = 1574 / (box[3] - box[1] + 1)
receipt = []
for frame in frames:
    original = SOURCE / f"h3-motion-alpha-{frame}.png"
    source = Image.open(original).convert("RGBA")
    left, top, right, bottom, anchor = pose.bbox_and_anchor(source)
    actor = Image.new("RGBA", pose.CANVAS)
    resized = source.resize((round(source.width*scale), round(source.height*scale)), Image.Resampling.LANCZOS)
    actor.alpha_composite(resized, (round(459-anchor*scale), round(1743-bottom*scale)))
    def save(image, role):
        target = SOURCE / f"h3-beat-pose-{frame}-{role}-v1.png"
        if target.exists():
            raise FileExistsError(target)
        image.save(target, optimize=True)
        receipt.append({"source": original.name, "source_sha256": hashlib.sha256(original.read_bytes()).hexdigest(), "output":target.name,"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"size":list(image.size)})
    save(actor, "subject")
    if args.subjects_only:
        print(f"Prepared subject {frame}",flush=True)
        continue
    mask = np.asarray(actor.getchannel("A")) > 128
    large = np.zeros((actor.height*3,actor.width*3),dtype=bool)
    large[actor.height:actor.height*2,actor.width:actor.width*2] = mask
    distance = distance_transform_edt(~large)
    beat = stage_by_frame[frame]
    order = rings.ROLES[beat:]+rings.ROLES[:beat]
    radius = 0
    for role in order:
        outer = radius+rings.WIDTHS[role]
        alpha = rings.ring(distance,radius,outer)
        radius = outer
        if role not in rings.ROLES[:beat]:
            alpha = alpha[actor.height:actor.height*2,actor.width:actor.width*2]
        if np.any(alpha[0]) or np.any(alpha[-1]) or np.any(alpha[:,0]) or np.any(alpha[:,-1]):
            raise ValueError(f"Clipped ring: {frame} {role}")
        image = Image.new("RGBA",(alpha.shape[1],alpha.shape[0]),rings.COLORS[role]+(0,))
        image.putalpha(Image.fromarray(alpha))
        save(image,role)
    print(f"Prepared pose {frame}",flush=True)
(SOURCE / f"h3-beat-poses-{args.receipt_suffix}-receipt.json").write_text(json.dumps({"recipe":"existing-stabilization-and-v5-rings","frames":frames,"assets":receipt},indent=2)+"\n")
