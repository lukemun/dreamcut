import { getMarkerSavedData } from './handwriting-packs';
type Stroke = { d: string; start: number; length: number };
type Glyph = { char: string; x: number; y: number; start: number; end: number; strokes: Stroke[] };
// Regions belong to the selected guide, not merely to the same letter ignoring case.
// A single-stroke lowercase guide has no regions and must not inherit a capital's mask.
// The saved data loads on demand (`loadHandwritingAssets(MARKER_SAVED_ASSET_KEY)`).
export function markerStrokeRegions(char: string): readonly string[] | undefined {
  const { guides, regions } = getMarkerSavedData();
  const guideKey = Object.hasOwn(guides, char) ? char : char.toUpperCase();
  return regions[guideKey];
}
export function markerStrokeProgress(stroke: Stroke, clock: number) {
  const progress = Math.min(1, Math.max(0, (clock - stroke.start) / stroke.length));
  // A pen accelerates after contact and slows before lifting.
  return (1 - Math.cos(Math.PI * progress)) / 2;
}
export function layoutMarker(text: string, maxWidth = Infinity, align: 'left'|'center'|'right' = 'left') {
  const { outlines, guides, metrics } = getMarkerSavedData();
  const glyphs: Glyph[] = []; let x=80, y=0, clock=0, row=0, previous='';
  const lines: {from:number;width:number}[]=[];
  const finish = () => { lines.push({from:row,width:x+80});row=glyphs.length;x=80;y+=1150;previous=''; };
  for (const char of text) {
    if (char==='\n') {finish();continue;}
    const outline=outlines[char as keyof typeof outlines];const advance=char === " " ? metrics.spaceAdvance : outline?.advance ?? 650;
    const pair=previous+char;
    const kern=metrics.kerning[pair as keyof typeof metrics.kerning] ?? 0;
    if(x>80 && x+kern+advance+80>maxWidth) finish();
    else x+=kern;
    previous=char;
    if (/\s/.test(char)) {x+=advance;clock+=18;continue;}
    const paths=guides[char as keyof typeof guides] ?? guides[char.toUpperCase() as keyof typeof guides] ?? [];
    const start=clock; const strokes:Stroke[]=[];
    for(const points of paths) {
      let length=0;for(let i=1;i<points.length;i++) length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
      if (!length) continue;
      strokes.push({d:points.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' '),start:clock,length});clock+=length+4;
    }
    if(!strokes.length)clock+=24;
    glyphs.push({char,x,y,start,end:clock,strokes});x+=advance;
  }
  finish();const width=Math.max(1,...lines.map(l=>l.width));
  lines.forEach((l,i)=>{const offset=align==='center'?(width-l.width)/2:align==='right'?width-l.width:0;for(let j=l.from;j<(lines[i+1]?.from??glyphs.length);j++)glyphs[j].x+=offset;});
  return {glyphs,width,height:y,duration:Math.max(1,clock)};
}
