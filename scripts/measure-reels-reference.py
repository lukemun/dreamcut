"""Measure a supplied Reels screenshot's UI ink inside explicitly selected search windows.

Usage: python3 scripts/measure-reels-reference.py screenshot.png [proof-directory]
Requires Pillow and numpy. Prints a JSON receipt and optionally diagnostic artifacts;
never mutates a project. Translucent control envelopes in the shared JSON are manual
pixel measurements; this recipe verifies foreground containment, not their edges.
Search windows identify controls in this reference, not a general UI detector.
"""
import hashlib
import json
import sys
from pathlib import Path
from collections import deque
from PIL import Image, ImageDraw
import numpy as np

path = sys.argv[1]
im = np.array(Image.open(path).convert("RGB"))
assert im.shape[:2] == (2622, 1206), "This measurement recipe requires the reviewed 1206×2622 reference"
windows = [
    ("status-left", (130, 65, 320, 130)),
    ("status-right", (850, 65, 1110, 130)),
    ("header", (40, 215, 1150, 305)),
    ("like", (1040, 1140, 1185, 1310)),
    ("comment", (1040, 1355, 1185, 1530)),
    ("repost", (1040, 1575, 1185, 1765)),
    ("share", (1040, 1810, 1185, 1980)),
    ("more", (1060, 2045, 1160, 2100)),
    ("creator-text", (195, 2055, 865, 2160)),
    ("caption", (40, 2200, 890, 2270)),
    ("audio-thumbnail", (1060, 2160, 1170, 2270)),
    ("navigation-icons", (210, 2420, 810, 2520)),
]
regions = []
for name, (x0, y0, x1, y1) in windows:
    rgb = im[y0:y1, x0:x1].astype(int)
    # Bright neutral foreground; header's translucent Friends text needs a lower floor.
    floor = 175 if name == "header" else 220
    mask = (rgb.min(2) >= floor) & ((rgb.max(2) - rgb.min(2)) <= 38)
    # Eight-connected foreground components remove isolated bright background noise.
    visited = np.zeros(mask.shape, dtype=bool)
    retained = []
    for y, x in zip(*np.where(mask)):
        if visited[y, x]:
            continue
        queue = deque([(int(y), int(x))])
        visited[y, x] = True
        component = []
        while queue:
            cy, cx = queue.popleft()
            component.append((cx, cy))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))
        if len(component) >= 18:
            retained.extend(component)
    assert retained, name
    pts = np.array(retained)
    lo, hi = pts.min(0), pts.max(0) + 1
    regions.append(dict(id=name, x=int(lo[0]+x0), y=int(lo[1]+y0),
                        width=int(hi[0]-lo[0]), height=int(hi[1]-lo[1]),
                        pixels=len(retained), search_window=[x0,y0,x1,y1]))
receipt = dict(width=1206, height=2622,
    sha256=hashlib.sha256(open(path, "rb").read()).hexdigest(),
    method="8-connected neutral foreground, min RGB 220 (header 175), channel spread <=38, components >=18 pixels; bounds are exclusive",
    regions=regions)
reference = json.loads((Path(__file__).resolve().parents[1] / "src/components/studio/timeline/reels-reference-zones.json").read_text())
assert receipt["sha256"] == reference["sha256"], "Screenshot differs from reviewed reference"
groups = {"header": ["status-left", "status-right", "header"],
          "actions": ["like", "comment", "repost", "share", "more", "audio-thumbnail"],
          "creator": ["creator-text"], "caption": ["caption"], "navigation": ["navigation-icons"]}
receipt["containment"] = []
for zone in reference["regions"]:
    for name in groups.get(zone["id"], []):
        ink = next(region for region in regions if region["id"] == name)
        clearance = [ink["x"]-zone["x"], ink["y"]-zone["y"],
                     zone["x"]+zone["width"]-ink["x"]-ink["width"],
                     zone["y"]+zone["height"]-ink["y"]-ink["height"]]
        assert min(clearance) >= 8, (zone["id"], name, clearance)
        receipt["containment"].append(dict(zone=zone["id"], ink=name, clearance_ltrb=clearance))
by_id = {zone["id"]: zone for zone in reference["regions"]}
lower_ids = ["template", "creator", "caption", "progress", "navigation"]
receipt["vertical_gaps"] = {
    f"{a}_to_{b}": by_id[b]["y"]-by_id[a]["y"]-by_id[a]["height"]
    for a,b in zip(lower_ids, lower_ids[1:])}
receipt["vertical_gaps"]["navigation_to_screen_bottom"] = reference["height"]-by_id["navigation"]["y"]-by_id["navigation"]["height"]
receipt["zone_note"] = reference["note"]
# Diagnostic annotation uses exactly the same bounds as the editor, without changing the source.
if len(sys.argv) > 2:
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    annotated = Image.fromarray(im).convert("RGB")
    drawing = ImageDraw.Draw(annotated, "RGBA")
    for region in reference["regions"]:
        x, y, w, h = (region[k] for k in ("x", "y", "width", "height"))
        drawing.rectangle((x, y, x+w, y+h), fill=(0, 0, 0, 35), outline=(0, 255, 230, 255), width=3)
        drawing.text((x+5, max(0, y-17)), region["id"], fill=(0,255,230,255))
    annotated.convert("RGB").save(output / "reels-reference-verified.png")
    merged = Image.fromarray(im).convert("RGB")
    guide = ImageDraw.Draw(merged, "RGBA")
    for polygon in reference["guidePolygons"]:
        points = [tuple(point) for point in polygon["points"]]
        guide.polygon(points, fill=(0, 0, 0, 61))
        guide.line(points + [points[0]], fill=(255,255,255,190), width=3)
    merged.save(output / "reels-merged-overlay.png")
    # Equal-scale comparison: unchanged source, old per-control outlines, merged guide.
    panels = [Image.fromarray(im), annotated, merged]
    comparison = Image.new("RGB", (3*402, 910), (24,32,40))
    labels = ["Original screenshot", "Measured controls", "Merged placement guide"]
    captions = ImageDraw.Draw(comparison)
    for i, (panel, label) in enumerate(zip(panels, labels)):
        comparison.paste(panel.resize((402,874), Image.Resampling.LANCZOS), (i*402,36))
        captions.text((i*402+12,12), label, fill="white")
    comparison.save(output / "reels-zones-comparison.png")
    (output / "measurement.json").write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt, indent=2))
