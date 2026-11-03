"""Extract unchanged contours/metrics from a licensed font, never writing trajectories.
Usage: python scripts/prepare-handwriting-font.py SOURCE.ttf PACK_DIR --font-id ID --family NAME --source-url URL --license-file OFL.txt
Dependencies: fonttools, uharfbuzz. Variable fonts are pinned to weight 400.
Pair positioning uses HarfBuzz with ligatures disabled: glyph-by-glyph stroke packs
cannot silently substitute an unprepared ligature. Full shaping remains a limitation.
"""
import argparse, hashlib, json, pathlib, shutil
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
import uharfbuzz as hb

p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('pack');p.add_argument('--font-id',required=True);p.add_argument('--family',required=True);p.add_argument('--source-url',required=True);p.add_argument('--license-file',required=True)
p.add_argument('--license-id',default='OFL-1.1');a=p.parse_args();dest=pathlib.Path(a.pack);dest.mkdir(parents=True,exist_ok=True)
chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-:;\'"()[]/\\+&@#%=_*'
f=TTFont(a.source)
if 'fvar' in f: f=instantiateVariableFont(f,{'wght':400},inplace=False)
f.save(dest/'source.ttf');source=(dest/'source.ttf').read_bytes();gs=f.getGlyphSet();cmap=f.getBestCmap();outlines={}
for c in chars:
 name=cmap.get(ord(c))
 if not name: raise ValueError('Missing glyph '+c)
 pen=SVGPathPen(gs);gs[name].draw(pen);bounds=BoundsPen(gs);gs[name].draw(bounds)
 outlines[c]={'d':pen.getCommands(),'advance':f['hmtx'][name][0],'bounds':list(bounds.bounds)}
face=hb.Face(source);font=hb.Font(face);upem=f['head'].unitsPerEm;font.scale=(upem,upem);hb.ot_font_set_funcs(font)
def shaped(s):
 b=hb.Buffer();b.add_str(s);b.guess_segment_properties();hb.shape(font,b,{'liga':False,'clig':False,'calt':False});return sum(pos.x_advance for pos in b.glyph_positions)
kerning={}
for left in chars+' ':
 for right in chars+' ':
  v=shaped(left+right)-shaped(left)-shaped(right)
  if v:kerning[left+right]=v
bottom=min(g['bounds'][1] for g in outlines.values());top=max(g['bounds'][3] for g in outlines.values());left=min(g['bounds'][0] for g in outlines.values());overhang=max(g['bounds'][2]-g['advance'] for g in outlines.values())
metrics={'unitsPerEm':upem,'spaceAdvance':shaped(' '),'kerning':kerning,'baseline':top+upem*.08,'lineHeight':top-bottom+upem*.18,'paddingLeft':max(upem*.08,-left+upem*.03),'paddingRight':max(upem*.08,overhang+upem*.03),'shaping':'pair positioning; liga/clig/calt disabled'}
manifest={'schema_version':2,'font_id':a.font_id,'family':a.family,'source':a.source_url,'source_sha256':hashlib.sha256(pathlib.Path(a.source).read_bytes()).hexdigest(),'instance_sha256':hashlib.sha256(source).hexdigest(),'weight':400,'license':a.license_id,'units_per_em':upem,'coordinate_space':'Each glyph ink bounds normalized to 0–100, y down','supported_characters':chars,'review_receipt':'review.json','limitations':['Pen motion is reconstructed, not recovered from the font designer.','Contextual alternates and ligatures are not prepared; base glyphs and pair kerning are preserved.','Unprepared Unicode appears whole using the selected font.']}
for name,data in [('outlines',outlines),('metrics',metrics),('manifest',manifest)]: (dest/(name+'.json')).write_text(json.dumps(data,separators=(',',':'))+'\n')
shutil.copyfile(a.license_file,dest/'LICENSE')
print(a.family, len(outlines), 'glyphs;',len(kerning),'kerning pairs')
