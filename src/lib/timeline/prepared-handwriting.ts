import type { HandwritingPack } from './handwriting-packs';
export type PreparedStroke = { d: string; start: number; length: number };
export type PreparedGlyph = { char: string; x: number; y: number; start: number; end: number; strokes: PreparedStroke[] };
export const HANDWRITING_PEN_LIFT = 4;
/** Font spacing and writing order have separate authorities. No case substitutions. */
export function layoutPreparedHandwriting(pack: HandwritingPack, text: string, maxWidth = Infinity, align: 'left'|'center'|'right' = 'left', revealMode: 'saved_strokes'|'line_mask' = 'saved_strokes') {
  const m = pack.metrics;
  const glyphs: PreparedGlyph[] = [], lines: {from:number;width:number}[] = [];
  let x=m.paddingLeft, y=0, clock=0, from=0, previous='';
  const finish=()=>{lines.push({from,width:x+m.paddingRight});from=glyphs.length;x=m.paddingLeft;y+=m.lineHeight;previous='';};
  for(const char of text) {
    if(char==='\n'){finish();continue;}
    const outline=pack.outlines[char];
    const advance=/\s/.test(char)?m.spaceAdvance:outline?.advance??m.unitsPerEm*.65;
    const kern=m.kerning[previous+char]??0;
    if(x>m.paddingLeft && x+kern+advance+m.paddingRight>maxWidth) finish(); else x+=kern;
    previous=char;
    if(/\s/.test(char)){x+=advance;clock+=HANDWRITING_PEN_LIFT*2;continue;}
    const start=clock, strokes:PreparedStroke[]=[];
    for(const points of pack.strokes[char]??[]) {
      const bounds=outline?.bounds??[0,0,m.unitsPerEm,m.unitsPerEm];
      const sx=(bounds[2]-bounds[0])/m.unitsPerEm,sy=(bounds[3]-bounds[1])/m.unitsPerEm;
      let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot((points[i][0]-points[i-1][0])*sx,(points[i][1]-points[i-1][1])*sy);
      if(!Number.isFinite(length)||length<=0)continue;
      strokes.push({d:points.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' '),start:clock,length});clock+=length+HANDWRITING_PEN_LIFT;
    }
    if(revealMode === 'line_mask' && pack.lineStrokes?.[char]) {
      clock=start;strokes.length=0;
      for(const line of pack.lineStrokes[char]) {
        const length=line.clockLength ?? line.segments.reduce((n,s)=>n+s.length,0)/m.unitsPerEm*100;
        strokes.push({d:line.segments.map(s=>s.d).join(''),start:clock,length});
        clock+=length+HANDWRITING_PEN_LIFT;
      }
    }
    if(!strokes.length)clock+=24;
    glyphs.push({char,x,y,start,end:clock,strokes});x+=advance;
  }
  finish();const width=Math.max(1,...lines.map(l=>l.width));
  lines.forEach((l,i)=>{const shift=align==='center'?(width-l.width)/2:align==='right'?width-l.width:0;for(let j=l.from;j<(lines[i+1]?.from??glyphs.length);j++)glyphs[j].x+=shift;});
  return {glyphs,width,height:y,duration:Math.max(1,clock)};
}
