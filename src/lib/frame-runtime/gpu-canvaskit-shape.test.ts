import test from 'node:test';
import assert from 'node:assert/strict';
import type {CanvasKit,Canvas} from 'canvaskit-wasm';
import {shapeFrameAt} from '../timeline/shapes';
import {CanvasKitShapePaths,drawCanvasKitShape,validateCanvasKitShape} from '../gpu-preview/canvaskit-shape';

// A recording stand-in for the CanvasKit calls a shape makes; every object counts its deletes.
function fakeKit(){
 const log:string[]=[];let live=0;
 class Deletable{deleted=false;constructor(){live++;}delete(){assert.ok(!this.deleted,'deleted twice');this.deleted=true;live--;}}
 class Path extends Deletable{fill='';constructor(readonly d:string){super();}setFillType(type:string){this.fill=type;}
  makeDashed(on:number,off:number,phase:number){return new Path(`${this.d} dash ${on},${off},${phase}`);}
  makeStroked(o:{width:number;miter_limit:number;precision:number;join:string;cap:string}){return new Path(`${this.d} stroke ${o.width} ${o.join} ${o.cap} ${o.miter_limit} ${o.precision}`);}}
 class Paint extends Deletable{state:Record<string,unknown>={};
  setAntiAlias(v:boolean){this.state.aa=v;} setStyle(v:string){this.state.style=v;} setColor(v:number[]){this.state.color=v.join(',');}
  setAlphaf(v:number){this.state.alpha=v;} setStrokeWidth(v:number){this.state.width=v;} setStrokeCap(v:string){this.state.cap=v;}
  setStrokeJoin(v:string){this.state.join=v;} setStrokeMiter(v:number){this.state.miter=v;} setPathEffect(v:{intervals:number[]}|null){this.state.dash=v?v.intervals.join(','):null;}}
 class Dash extends Deletable{constructor(readonly intervals:number[]){super();}}
 const kit={
  Path:{MakeFromSVGString:(d:string)=>d.startsWith('M')?new Path(d):null},
  Paint,FillType:{EvenOdd:'evenodd',Winding:'nonzero'},PaintStyle:{Fill:'fill',Stroke:'stroke'},StrokeCap:{Butt:'butt'},StrokeJoin:{Miter:'miter'},
  PathEffect:{MakeDash:(intervals:number[])=>new Dash(intervals)},
  Color4f:(r:number,g:number,b:number,a:number)=>[r,g,b,a].map(v=>Math.round(v*255)),XYWHRect:(x:number,y:number,w:number,h:number)=>[x,y,w,h],
 } as unknown as CanvasKit;
 let saves=1;
 const canvas={
  getSaveCount:()=>saves,save:()=>{saves++;log.push('save');},saveLayer:(paint:Paint,rect:number[])=>{saves++;log.push(`layer ${paint.state.alpha} ${rect.join(',')}`);},
  restoreToCount:(n:number)=>{saves=n;log.push('restore');},translate:(x:number,y:number)=>log.push(`translate ${x} ${y}`),
  rotate:(deg:number)=>log.push(`rotate ${deg}`),scale:(s:number)=>log.push(`scale ${s}`),
  drawPath:(path:Path,paint:Paint)=>log.push(`draw ${path.fill} ${path.d.replace(/^M.*? (dash|stroke)/,'$1')} ${JSON.stringify(paint.state)}`),
 } as unknown as Canvas;
 return {kit,canvas,log,live:()=>live,saves:()=>saves};
}

const W=1080,H=1920;
const ring={shape_kind:'ellipse',shape_width:.3,shape_height:.3,shape_fill:'#ff0000',shape_stroke:'#00ff00',shape_stroke_width:10,shape_draw:.5,media_rotation:30,media_scale:1.5,media_offset_x:.2};

test('a filled, partly drawn outline is traced as an even-odd fill and one stroked dash, filled, in the shape transform', () => {
 const {kit,canvas,log,live,saves}=fakeKit(),paths=new CanvasKitShapePaths(kit),frame=shapeFrameAt(ring,0,W,H);
 drawCanvasKitShape(kit,canvas,paths,frame,1,W,H);
 assert.deepEqual(log.slice(0,4),['save',`translate ${frame.centerX} ${frame.centerY}`,'rotate 30','scale 1.5']);
 const draws=log.filter(line=>line.startsWith('draw'));
 assert.equal(draws.length,2);
 assert.match(draws[0],/^draw evenodd .*"style":"fill","color":"255,0,0,255"/);
 const contour=frame.contours[0];
 // The stroke is outlined on the CPU (as Chrome does for SVG) and filled: SVG's butt caps, miter joins, limit 4.
 assert.equal(draws[1],`draw nonzero dash ${contour.drawn},${contour.length+frame.strokeWidth},0 stroke ${frame.strokeWidth} miter butt 4 1.5 {"aa":true,"style":"fill","color":"0,255,0,255"}`);
 assert.equal(log.at(-1),'restore');assert.equal(saves(),1);
 // Paints and the dash are released; only the cached paths stay alive.
 assert.equal(live(),paths.size);
 paths.close();assert.equal(live(),0);
});

test('a translucent shape draws inside one layer clipped to its paint bounds; a fully drawn line has no dash', () => {
 const {kit,canvas,log}=fakeKit(),paths=new CanvasKitShapePaths(kit);
 drawCanvasKitShape(kit,canvas,paths,shapeFrameAt({...ring,shape_draw:1,shape_fill:null},0,W,H),.4,W,H);
 assert.match(log[0],/^layer 0.4 \d+,\d+,\d+,\d+$/);
 assert.ok(log.some(line=>/^draw nonzero stroke /.test(line)),'a fully drawn line is stroked without a dash');
 assert.ok(!log.some(line=>line.includes('evenodd')),'no fill');
 const before=log.length;
 drawCanvasKitShape(kit,canvas,paths,shapeFrameAt(ring,0,W,H),0,W,H);
 assert.equal(log.length,before,'an invisible shape draws nothing');
});

test('hand-drawn ink is a nonzero fill in the outline colour', () => {
 const {kit,canvas,log}=fakeKit(),paths=new CanvasKitShapePaths(kit);
 const frame=shapeFrameAt({...ring,shape_fill:null,shape_taper:.4,shape_wobble:.2},0,W,H);
 assert.ok(frame.contours[0].ink);
 drawCanvasKitShape(kit,canvas,paths,frame,1,W,H);
 const draws=log.filter(line=>line.startsWith('draw'));
 assert.equal(draws.length,1);assert.match(draws[0],/^draw nonzero M.*"style":"fill","color":"0,255,0,255"/);
});

test('paths are reused while unchanged, bounded by entries and text length, and deleted when evicted', () => {
 const {kit,live}=fakeKit(),paths=new CanvasKitShapePaths(kit,3,1000);
 const a=paths.path('M 0 0 L 1 1',true);
 assert.equal(paths.path('M 0 0 L 1 1',true),a,'same data and rule reuse the path');
 assert.notEqual(paths.path('M 0 0 L 1 1',false),a,'another fill rule is another path');
 paths.path('M 0 0 L 2 2',true);paths.path('M 0 0 L 1 1',true);paths.path('M 0 0 L 3 3',true);
 assert.equal(paths.size,3);assert.equal(live(),3);
 assert.ok((a as unknown as {deleted:boolean}).deleted===false,'the most recently used survive');
 assert.notEqual(paths.path('M 0 0 L 1 1',false),a,'the least recently used was evicted and is made again');
 paths.path(`M ${'1 '.repeat(600)}`,true);
 assert.ok(paths.bytes<=1000||paths.size===1,'text length bound');
 assert.equal(live(),paths.size,'every evicted path is deleted');
 assert.throws(()=>paths.path('not a path',true),/unreadable/);
 const outline=paths.stroke('M 0 0 L 9 9',4,5,10,1);
 assert.equal(paths.stroke('M 0 0 L 9 9',4,5,10,1),outline,'an unchanged stroke is outlined once');
 assert.notEqual(paths.stroke('M 0 0 L 9 9',4,6,10,1),outline,'more drawn is a new outline');
 assert.equal(live(),paths.size,'intermediate dash and source paths are deleted');
 paths.close();assert.equal(live(),0);assert.equal(paths.size,0);
});

test('frames that cannot be drawn exactly are refused before drawing', () => {
 const frame=shapeFrameAt(ring,0,W,H);
 assert.doesNotThrow(()=>validateCanvasKitShape(frame,1));
 assert.throws(()=>validateCanvasKitShape({...frame,fill:'red'},1),/colour/);
 assert.throws(()=>validateCanvasKitShape({...frame,scale:NaN},1),/Invalid/);
 assert.throws(()=>validateCanvasKitShape(frame,1.2),/Invalid/);
});

test('paths held for one shape are not evicted before it draws; reused paths keep their boxes', () => {
 const {kit,canvas,log,live}=fakeKit(),paths=new CanvasKitShapePaths(kit,1,1e9);
 // Two ink contours and a cache of one: the first contour's path must still be alive when drawn.
 const frame=shapeFrameAt({...ring,shape_kind:'star',shape_fill:'#ff0000',shape_draw:1,shape_taper:.4},0,W,H);
 drawCanvasKitShape(kit,canvas,paths,frame,.5,W,H);
 const draws=log.filter(line=>line.startsWith('draw'));
 assert.ok(draws.length>=2,'fill and ink drawn');
 assert.equal(paths.size,1,'trimmed back to its bound after the shape');
 assert.equal(live(),paths.size,'evicted paths are deleted');
 const layer=log[0];
 log.length=0;drawCanvasKitShape(kit,canvas,paths,frame,.5,W,H);
 assert.equal(log[0],layer,'the same layer bounds from cached boxes');
 paths.close();assert.equal(live(),0);
});
