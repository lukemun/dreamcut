"""Prepare continuous vector nib paths from authored writing guides, never outline order.
Usage: python scripts/prepare-handwriting-lines.py PACK [--source-pack PACK]
Writes line-strokes.json and line-preparation.json only; never mutates projects.
Requires numpy, Pillow, scipy, scikit-image. Original saved assets remain unchanged.
"""
import argparse,json,pathlib,math,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter,binary_dilation,distance_transform_edt
from skimage.measure import find_contours,approximate_polygon
p=argparse.ArgumentParser();p.add_argument('pack');p.add_argument('--source-pack');p.add_argument('--resolution',type=int,default=320);p.add_argument('--use-fitted',action='store_true');a=p.parse_args();root=pathlib.Path(a.pack);source=pathlib.Path(a.source_pack)if a.source_pack else root
manifest=json.loads((source/'manifest.json').read_text());outlines=json.loads((source/'outlines.json').read_text());upem=manifest['units_per_em'];font=ImageFont.truetype(str(source/'source.ttf'),upem,layout_engine=ImageFont.Layout.BASIC)
authored_path=root/'line-authored-guides.json' if (root/'line-authored-guides.json').exists() else root/'authored-guides.json'
if authored_path.exists():authored=json.loads(authored_path.read_text())
else:
 old=json.loads((root/'strokes.json').read_text());extra=json.loads((root.parent/'comic-neue/authored-guides.json').read_text());authored={c:old.get(c,old.get(c.upper(),extra[c]))for c in outlines}
 (root/'line-authored-guides.json').write_text(json.dumps(authored,separators=(',',':'))+'\n');authored_path=root/'line-authored-guides.json'
fitted=json.loads((root/'strokes.json').read_text());result={};notes={}
def path_data(points):
 pts=np.array(points,float);d=f'M{pts[0,0]:.3f},{pts[0,1]:.3f}';samples=[]
 for i in range(len(pts)-1):
  q,r=pts[i],pts[i+1];before=pts[max(0,i-1)];after=pts[min(len(pts)-1,i+2)];c1=q+(r-before)/6;c2=r-(after-q)/6
  d+='C'+','.join(f'{v:.3f}'for v in [*c1,*c2,*r]);n=max(3,math.ceil((np.linalg.norm(c1-q)+np.linalg.norm(c2-c1)+np.linalg.norm(r-c2))/3));t=np.linspace(0,1,n)[:,None]
  samples.extend(((1-t)**3*q+3*(1-t)**2*t*c1+3*(1-t)*t**2*c2+t**3*r).tolist())
 sampled=np.array(samples);length=float(np.linalg.norm(np.diff(sampled,axis=0),axis=1).sum());return d,sampled,max(length,upem*.002)
for char,glyph in outlines.items():
 b=glyph['bounds'];ww=b[2]-b[0];hh=b[3]-b[1];r=a.resolution;w=max(20,round(r*ww/max(ww,hh)));h=max(20,round(r*hh/max(ww,hh)));sx=ww/w;sy=hh/h
 im=Image.new('L',(math.ceil(ww)+2,math.ceil(hh)+2));ImageDraw.Draw(im).text((-b[0],b[3]),char,font=font,anchor='ls',fill=255);im=im.resize((w,h),Image.Resampling.LANCZOS);ink=np.array(im)>32
 y,x=np.mgrid[0:h,0:w];query=np.c_[(x.flatten()+.5)*sx,(y.flatten()+.5)*sy];strokes=[];distances=[]
 for index,points in enumerate(fitted.get(char,authored[char]) if a.use_fitted else authored[char]):
  # Tiny detached marks use the already authored/fitted dot location. No contour ordering.
  if (char=='i' and index==0 and len(authored[char])>1) or (char=='B' and index==0 and manifest['font_id']!='yellowtail'):points=fitted[char][0]
  physical=np.array(points)*[ww/100,hh/100]
  if a.use_fitted or char=='B' and index==0:physical=approximate_polygon(physical,upem*.005)
  d,samples,length=path_data(physical);distance=cKDTree(samples).query(query)[0].reshape(h,w)
  strokes.append({'segments':[{'d':d,'width':0,'length':round(length,4)}]});distances.append(distance)
  if index==0: first_samples=samples
 owner=np.argmin(distances,axis=0)
 if char=='B' and len(strokes)>1:
  thickness=distance_transform_edt(ink,sampling=(sy,sx));ix=np.clip((first_samples[:,0]/sx).astype(int),0,w-1);iy=np.clip((first_samples[:,1]/sy).astype(int),0,h-1)
  radius=min(upem*.1,float(np.quantile(thickness[iy,ix],.8))*1.2+upem*.01)
  owner[distances[0]<radius]=0
 diagnostics=[]
 for index,stroke in enumerate(strokes):
  region=owner==index;selected=ink&region;radius=float(np.max(distances[index][selected]))if selected.any()else upem*.02
  width=round(2*(radius+max(sx,sy)*3+upem*.004),3);stroke['segments'][0]['width']=width
  if len(strokes)>1:
   # Only spatial gesture ownership is cached, never temporal reveal bands.
   # Smooth once, then overlap shared boundaries by a pixel to avoid alpha seams.
   field=gaussian_filter(region.astype(float),.65)>.45;field=binary_dilation(field,iterations=1)
   field=np.pad(field,3,mode='edge');paths=[]
   for contour in find_contours(np.pad(field,1),.5):
    polygon=approximate_polygon(contour,.35);points=[((v[1]-4+.5)*sx,(v[0]-4+.5)*sy)for v in polygon];paths.append('M'+'L'.join(f'{xx:.3f},{yy:.3f}'for xx,yy in points)+'Z')
   stroke['region']=''.join(paths)
  diagnostics.append({'width_font_units':width,'wide_nib':width>upem*.35,'source_ink_pixels':int(selected.sum())})
 result[char]=strokes;notes[char]={'strokes':diagnostics,'motion_review':'pending'}
# Preserve the actual accepted A, including its authored nib-width changes.
if manifest['font_id']=='pacifico':
 accepted=json.loads((root.parent.parent/'experiments/pacifico-line-mask/guides.json').read_text());points=np.array(fitted['A'][0])*[(outlines['A']['bounds'][2]-outlines['A']['bounds'][0])/upem,(outlines['A']['bounds'][3]-outlines['A']['bounds'][1])/upem];clock_length=float(np.linalg.norm(np.diff(points,axis=0),axis=1).sum());result['A']=[{'segments':accepted['characters']['A']['segments'],'clockLength':clock_length}];notes['A']['human_acceptance']='Pacifico A line-mask comparison accepted by creator; other glyphs not implied.'
(root/'line-strokes.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
receipt={'font_id':manifest['font_id'],'method':'Cubic authored pen paths in physical font units; continuous nib and optional smooth exclusive gesture regions. No outline-order motion or raster time bands.','source_guides_sha256':hashlib.sha256(authored_path.read_bytes()).hexdigest(),'source_fitted_sha256':hashlib.sha256((root/'strokes.json').read_bytes()).hexdigest(),'smoothing':'RDP tolerance 0.005 em, cubic interpolation of ordered medial fits' if a.use_fitted else 'Cubic interpolation of semantic waypoints','source_outline_sha256':hashlib.sha256((source/'outlines.json').read_bytes()).hexdigest(),'resolution':a.resolution,'characters':notes}
(root/'line-preparation.json').write_text(json.dumps(receipt,indent=2)+'\n');print(manifest['family'],len(result),'continuous vector glyphs; wide nib candidates:', ''.join(c for c,n in notes.items()if any(s['wide_nib']for s in n['strokes'])))
