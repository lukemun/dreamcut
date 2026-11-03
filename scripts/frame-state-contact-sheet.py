"""Create review sheets only from paths referenced by a completed frame-state report.

Usage: python3 scripts/frame-state-contact-sheet.py report.json output-directory
Requires Pillow. Does not modify the report or any project timeline.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

report = json.loads(Path(sys.argv[1]).read_text())
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
states = report["states"]
for page, start in enumerate(range(0, len(states), 20), 1):
    sheet = Image.new("RGB", (1080, 2020), "#202a34")
    draw = ImageDraw.Draw(sheet)
    for index, state in enumerate(states[start:start+20]):
        x, y = (index % 5)*216, (index // 5)*505
        frame = Image.open(state["overlayPath"]).convert("RGB")
        frame.thumbnail((216,480))
        sheet.paste(frame, (x,y+25))
        draw.text((x+5,y+5), f'{state["atSeconds"]:.3f}s', fill="white")
    target = output / f"sheet-{page:02d}.jpg"
    sheet.save(target, quality=90)
    print(target)
