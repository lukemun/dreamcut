"""Cache trajectory-time ownership for glyph ink. Not an authoring tool.
python scripts/prepare-handwriting-sweeps.py PACK [--resolution 128] [--bands 64]
Every position belongs to one authored pen gesture and one nearest arc-length
interval. A broad nib cannot reach a later gesture or a later loop on the same
stroke. Completion reveals the union of owned regions, still inside exact font
contours; never switches to an unmasked glyph. Dependencies: numpy.
"""
import argparse,json,pathlib
import numpy as np
p=argparse.ArgumentParser();p.add_argument('pack');p.add_argument('--resolution',type=int,default=128);p.add_argument('--bands',type=int,default=64);a=p.parse_args();root=pathlib.Path(a.pack)
manifest=json.loads((root/'manifest.json').read_text());
guides=json.loads((root/'strokes.json').read_text());outlines=json.loads((root/'outlines.json').read_text());widths=json.loads((root/'widths.json').read_text());result={};r=a.resolution;bands=a.bands;unit=100/r
y,x=np.mgrid[0:r,0:r];x=(x+.5)*unit;y=(y+.5)*unit
for c,strokes in guides.items():
 bounds=outlines[c]['bounds'];sx=(bounds[2]-bounds[0])/100;sy=(bounds[3]-bounds[1])/100
 best=np.full((r,r),np.inf);owners=np.zeros((r,r),dtype=int);times=np.zeros((r,r))
 firstDistance=None;firstTimes=None
 for n,stroke in enumerate(strokes):
  localBest=np.full((r,r),np.inf);localTimes=np.zeros((r,r))
  pts=np.array(stroke,dtype=float)*[sx,sy];lengths=np.linalg.norm(np.diff(pts,axis=0),axis=1);total=sum(lengths);travel=0
  for i,length in enumerate(lengths):
   if not length:continue
   ax,ay=pts[i];dx,dy=pts[i+1]-pts[i];t=np.clip(((x*sx-ax)*dx+(y*sy-ay)*dy)/(dx*dx+dy*dy),0,1);dist=(x*sx-ax-t*dx)**2+(y*sy-ay-t*dy)**2;take=dist<best
   localTake=dist<localBest;localBest[localTake]=dist[localTake];localTimes[localTake]=(travel+t[localTake]*length)/total
   best[take]=dist[take];owners[take]=n;times[take]=(travel+t[take]*length)/total;travel+=length
  if n==0:firstDistance=localBest.copy();firstTimes=localTimes.copy()
 # B's descending stem owns its full narrow pen corridor at bowl junctions.
 # This prevents holes in the stem while keeping the distant bowls exclusive.
 if c=='B':
  stem=firstDistance<(min(widths[c],manifest['units_per_em']*.11)*.48)**2
  owners[stem]=0;times[stem]=firstTimes[stem]
 code=owners*bands+np.minimum(bands-1,np.floor(times*bands).astype(int));paths=[['' for _ in range(bands)]for _ in strokes];fragments={}
 # Merge adjacent row spans, keeping cell ownership unchanged. Extend only the
 # outside perimeter so mask antialiasing cannot clip the font's edge antialias.
 padX=manifest['units_per_em']*.04/sx;padY=manifest['units_per_em']*.04/sy
 active={}
 def flush(key,startRow,endRow):
  owner,start,end=key;xx=start*unit;yy=startRow*unit;ww=(end-start)*unit;hh=(endRow-startRow)*unit
  if start==0:xx-=padX;ww+=padX
  if end==r:ww+=padX
  if startRow==0:yy-=padY;hh+=padY
  if endRow==r:hh+=padY
  fragments.setdefault(owner,[]).append(f'M{xx:.3f},{yy:.3f}h{ww+.04:.3f}v{hh+.04:.3f}h-{ww+.04:.3f}z')
 for row in range(r):
  boundaries=np.r_[0,np.where(np.diff(code[row])!=0)[0]+1,r];current={(int(code[row,start]),int(start),int(end))for start,end in zip(boundaries,boundaries[1:])}
  for key in list(active):
   if key not in current:flush(key,active.pop(key),row)
  for key in current:active.setdefault(key,row)
 for key,startRow in active.items():flush(key,startRow,r)
 for owner,parts in fragments.items():paths[owner//bands][owner%bands]=''.join(parts)
 result[c]=paths
(root/'sweeps.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
manifest=json.loads((root/'manifest.json').read_text());manifest['stroke_regions']={'method':'Nearest physical trajectory + arc-length ownership; exact font contours remain final mask','file':'sweeps.json','resolution':r,'bands':bands,'generator':'scripts/prepare-handwriting-sweeps.py'};(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(manifest['family'], 'temporal ownership cached')
