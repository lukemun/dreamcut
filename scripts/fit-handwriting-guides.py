"""Refine AUTHORED pen waypoints onto a font's medial ink.
python scripts/fit-handwriting-guides.py PACK --guides authored-guides.json
Requires pillow, numpy, scipy, scikit-image. Never infers order from outlines:
waypoint sequence, stroke order and lifts are input. This is candidate preparation,
not natural-motion approval. Review every glyph afterward. Saves authored input.
"""
import argparse,json,pathlib,heapq,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize
p=argparse.ArgumentParser();p.add_argument('pack');p.add_argument('--guides',required=True);a=p.parse_args();root=pathlib.Path(a.pack)
manifest=json.loads((root/'manifest.json').read_text());outlines=json.loads((root/'outlines.json').read_text());authored=json.loads(pathlib.Path(a.guides).read_text());(root/'authored-guides.json').write_text(json.dumps(authored,separators=(',',':'))+'\n')
font=ImageFont.truetype(str(root/'source.ttf'),manifest['units_per_em']);result={};widths={};notes={}
def simplify(points,tolerance=.25):
 if len(points)<3:return points
 a=np.array(points[0]);b=np.array(points[-1]);pts=np.array(points);v=b-a;t=np.clip(((pts-a)@v)/(v@v or 1),0,1);dist=np.linalg.norm(pts-(a+t[:,None]*v),axis=1);i=int(np.argmax(dist))
 if dist[i]>tolerance:return simplify(points[:i+1],tolerance)[:-1]+simplify(points[i:],tolerance)
 return [points[0],points[-1]]
for c,g in outlines.items():
 bbox=font.getbbox(c,anchor='ls');im=Image.new('L',(bbox[2]-bbox[0]+8,bbox[3]-bbox[1]+8));ImageDraw.Draw(im).text((4-bbox[0],4-bbox[1]),c,font=font,fill=255,anchor='ls');im=im.crop(im.getbbox());originalSize=im.size
 scale=300/max(im.size);im=im.resize((max(8,round(im.width*scale)),max(8,round(im.height*scale))),Image.Resampling.LANCZOS);ink=np.array(im)>80;h,w=ink.shape
 skeleton=skeletonize(ink);nodes=np.argwhere(skeleton);tree=cKDTree(nodes);lookup={tuple(v):i for i,v in enumerate(nodes)};edges=[]
 for y,x in nodes:
  edges.append([(lookup[(y+dy,x+dx)],math.hypot(dx,dy))for dy in [-1,0,1]for dx in [-1,0,1]if (dy or dx)and(y+dy,x+dx)in lookup])
 def nearest(point):return int(tree.query([point[1]*(h-1)/100,point[0]*(w-1)/100])[1])
 def route(start,end):
  if start==end:return [start]
  dist={start:0};parent={};q=[(0,start)];seen=set()
  while q:
   cost,n=heapq.heappop(q)
   if n in seen:continue
   seen.add(n)
   if n==end:
    route=[n]
    while n!=start:n=parent[n];route.append(n)
    return route[::-1]
   for v,weight in edges[n]:
    d=cost+weight
    if d<dist.get(v,float('inf')):dist[v]=d;parent[v]=n;heapq.heappush(q,(d,v))
  return [start,end]
 paths=[];disconnected=0
 for stroke in authored[c]:
  # Densify only to retain the intended branch at loops/crossings.
  dense=[]
  for i in range(1,len(stroke)):
   v=np.array(stroke[i-1]);delta=np.array(stroke[i])-v;n=max(1,math.ceil(np.linalg.norm(delta)/8));dense.extend((v+delta*j/n).tolist()for j in range(n))
  dense.append(stroke[-1]);indexes=[nearest(p)for p in dense];r=[]
  for start,end in zip(indexes,indexes[1:]):
   section=route(start,end)
   if len(section)==2 and np.linalg.norm(nodes[start]-nodes[end])>2:disconnected+=1
   r.extend(section[:-1])
  r.append(indexes[-1]);pts=[[float(nodes[i][1])*100/(w-1),float(nodes[i][0])*100/(h-1)]for i in r];pts=simplify(pts)
  if len(pts)<2 or pts[0]==pts[-1]and len(pts)==2:
   x,y=pts[0];pts=[[x-.3,y],[x+.3,y]]
  paths.append([[round(x,3),round(y,3)]for x,y in pts])
 result[c]=paths
 # Measured nib in physical font units avoids a 100%-wide nib on narrow l/dots
 mask=Image.new('L',(w,h));d=ImageDraw.Draw(mask)
 for stroke in paths:d.line([(x*(w-1)/100,y*(h-1)/100)for x,y in stroke],fill=255,width=1)
 distances=distance_transform_edt(np.array(mask)==0)[ink];radius=float(np.max(distances));physicalPerPixel=max(g['bounds'][2]-g['bounds'][0],g['bounds'][3]-g['bounds'][1])/300
 nib=2*(radius+1.8)*physicalPerPixel;cap=manifest['units_per_em']*.18;widths[c]=round(min(nib,cap),3)
 notes[c]={'disconnected_segments':disconnected,'measured_nib_font_units':round(nib,3),'nib_capped':nib>cap,'status':'candidate_needs_intermediate_review'}
(root/'strokes.json').write_text(json.dumps(result,separators=(',',':'))+'\n');(root/'widths.json').write_text(json.dumps(widths,separators=(',',':'))+'\n');(root/'fitting.json').write_text(json.dumps(notes,indent=2)+'\n')
manifest['nib_units']='physical font units; uniform circular nib before glyph contour clipping';manifest['authorship']='OpenEdit-authored semantic waypoints, refined onto medial ink; outline order never used';(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(manifest['family'],len(result),'guides; capped:', ''.join(c for c,n in notes.items()if n['nib_capped']))
