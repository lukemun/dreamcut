#!/usr/bin/env python3
"""Prepare a reusable grayscale contour-to-canvas distance field; never edits a timeline.
Requires Pillow, numpy and scipy. Mount at the scale recorded in the receipt.
"""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--input', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--model', choices=['normalized','metric'], default='normalized')
p.add_argument('--padding', type=float, default=2.1)
p.add_argument('--scale', type=float, default=1.89)
p.add_argument('--width', type=int, default=1080)
p.add_argument('--height', type=int, default=1920)
a = p.parse_args()
if a.padding < 1 or a.scale <= 0 or min(a.width, a.height) <= 0: p.error('Invalid canvas/scale/padding')
if a.output.exists(): raise FileExistsError(a.output)
source = Image.open(a.input).convert('RGBA'); w, h = source.size
cw, ch = round(w*a.padding), round(h*a.padding)
x, y = (cw-w)//2, (ch-h)//2
mask = np.zeros((ch,cw), bool); mask[y:y+h,x:x+w] = np.array(source.getchannel('A')) > 128
if not mask.any(): raise ValueError('Input has no subject alpha')
d = distance_transform_edt(~mask).astype(np.float32)
factor = min(a.width/cw, a.height/ch)*a.scale
vw, vh = a.width/factor, a.height/factor
yy, xx = np.ogrid[:ch,:cw]
e = np.maximum(0, np.minimum(vw/2-np.abs(xx-(cw-1)/2), vh/2-np.abs(yy-(ch-1)/2)))
q = np.divide(d, d+e, out=np.zeros_like(d), where=d+e>0)
encoded = np.rint(q*255).astype(np.uint8)
out = np.zeros((ch,cw,4), np.uint8);out[:,:,:3]=encoded[:,:,None];out[:,:,3]=(~mask)*255
if a.model == 'metric':
 out[:,:,0] = np.rint(np.clip(d/1024,0,1)*255).astype(np.uint8)
 out[:,:,1] = np.rint(np.clip(1-e/1024,0,1)*255).astype(np.uint8)
a.output.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(out).save(a.output)
receipt = dict(model='metric-edge-transfer-v1' if a.model == 'metric' else 'gray-edge-distance-v1', source=str(a.input.resolve()), source_sha256=hashlib.sha256(a.input.read_bytes()).hexdigest(), output=a.output.name, sha256=hashlib.sha256(a.output.read_bytes()).hexdigest(), width=a.width,height=a.height,padding=a.padding,media_scale=a.scale,field_size=[cw,ch])
a.output.with_suffix('.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(a.output)
