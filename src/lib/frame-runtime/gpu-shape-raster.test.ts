import test from 'node:test';
import assert from 'node:assert/strict';
import {shapeFrameAt,type ShapeFrame} from '../timeline/shapes';
import {ShapeRasterCache,ShapeRasterVersion,shapePaintBounds,shapeRasterKey} from '../gpu-preview/shape-raster';

// Node has no OffscreenCanvas: record what each fake canvas is asked to do.
class FakeContext{
 calls:string[]=[];
 reset(){this.calls.push('reset');}
 translate(x:number,y:number){this.calls.push(`translate ${x} ${y}`);}
 rotate(){} scale(){} setLineDash(){} fill(){this.calls.push('fill');} stroke(){this.calls.push('stroke');}
 fillStyle='';strokeStyle='';lineWidth=1;
}
class FakeCanvas{static made=0;context=new FakeContext();constructor(public width:number,public height:number){FakeCanvas.made++;}getContext(){return this.context;}}
(globalThis as any).OffscreenCanvas??=FakeCanvas;
(globalThis as any).Path2D??=class{constructor(readonly d:string){}};
const calls=(canvas:OffscreenCanvas)=>(canvas as unknown as FakeCanvas).context.calls;

const W=1080,H=1920;
const props={shape_kind:'path',shape_fill:null,shape_stroke:'#1c1b19',shape_stroke_width:12,shape_taper:.35,shape_wobble:.12,shape_width:.3,shape_height:.2,shape_draw:.6,
 shape_contours:[{closed:false,points:[{x:0,y:0},{x:.4,y:.9,in:[-.2,.1],out:[.3,.4]},{x:1,y:.2}]}],media_offset_x:.3,media_offset_y:-.4,media_rotation:23,media_scale:1.4};

/** Every coordinate the frame paints, in output pixels (the transform the canvas applies). */
function paintedPoints(frame:ShapeFrame){
 const a=frame.rotationDeg*Math.PI/180,c=Math.cos(a)*frame.scale,s=Math.sin(a)*frame.scale,out:[number,number][]=[];
 const paths=[...(frame.fill?[frame.d]:[]),...frame.contours.filter(x=>x.drawn>0).map(x=>x.ink??x.d)];
 for(const d of paths){const v=(d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)??[]).map(Number);
  for(let i=0;i<v.length;i+=2)out.push([frame.centerX+c*v[i]-s*v[i+1],frame.centerY+s*v[i]+c*v[i+1]]);}
 return out;
}

test('paint bounds hold everything a shape paints, in whole output pixels, and are null only when nothing lands in the output',()=>{
 const clamp=(v:number,max:number)=>Math.min(max,Math.max(0,v));
 for(const draw of [.05,.6,1])for(const rotation of [0,23,90,-140])for(const [ox,oy] of [[0,0],[.3,-.4],[.98,.97],[-1.2,0],[3,3]]){
  const frame=shapeFrameAt({...props,shape_draw:draw,media_rotation:rotation,media_offset_x:ox,media_offset_y:oy},0,W,H);
  const box=shapePaintBounds(frame,W,H),points=paintedPoints(frame);
  if(!box){assert.ok(points.every(([x,y])=>x<-2||y<-2||x>W+2||y>H+2),'culled only when every painted point is off the output');continue;}
  assert.ok([box.x,box.y,box.width,box.height].every(Number.isSafeInteger)&&box.x>=0&&box.y>=0&&box.x+box.width<=W&&box.y+box.height<=H);
  for(const [x,y] of points){
   assert.ok(box.x<=clamp(Math.floor(x),W)&&box.x+box.width>=clamp(Math.ceil(x),W),`x ${x} in ${JSON.stringify(box)}`);
   assert.ok(box.y<=clamp(Math.floor(y),H)&&box.y+box.height>=clamp(Math.ceil(y),H),`y ${y} in ${JSON.stringify(box)}`);
  }
 }
});

test('a plain stroke is padded by the widest miter join; an undrawn outline paints nothing; unknown paths cover the output',()=>{
 const line={...props,shape_taper:0,shape_wobble:0,shape_draw:1,media_rotation:0,media_offset_x:-.2,media_offset_y:0,media_scale:1};
 const frame=shapeFrameAt(line,0,W,H);
 assert.ok(frame.contours.every(c=>c.ink===null));
 const box=shapePaintBounds(frame,W,H)!,xs=paintedPoints(frame).map(p=>p[0]);
 assert.ok(box.x<=Math.max(0,Math.min(...xs)-frame.strokeWidth*5)&&box.x+box.width>=Math.min(W,Math.max(...xs)+frame.strokeWidth*5));
 assert.equal(shapePaintBounds(shapeFrameAt({...props,shape_draw:0},0,W,H),W,H),null);
 for(const d of ['M 0 0 Q 5 5 9 9','M 0 0 a 5 5 0 1 1 9 9','M 0 0 L 1'])
  assert.deepEqual(shapePaintBounds({...frame,contours:frame.contours.map(c=>({...c,d}))},W,H),{x:0,y:0,width:W,height:H});
});

test('opacity is not part of a raster; every drawing input is',()=>{
 const frame=shapeFrameAt(props,0,W,H);
 assert.equal(shapeRasterKey({...frame,opacity:.2},W,H),shapeRasterKey(frame,W,H));
 for(const change of [{scale:frame.scale+1e-9},{centerX:frame.centerX+.5},{rotationDeg:1},{stroke:'#fff'},{strokeWidth:3},{fill:'#000'}])
  assert.notEqual(shapeRasterKey({...frame,...change},W,H),shapeRasterKey(frame,W,H));
 assert.notEqual(shapeRasterKey(shapeFrameAt({...props,shape_draw:.61},0,W,H),W,H),shapeRasterKey(frame,W,H));
 assert.notEqual(shapeRasterKey(frame,W,H+2),shapeRasterKey(frame,W,H));
});

test('a shape keeps one output-sized canvas: unchanged drawings are not redrawn, changed ones are reset and redrawn in place',()=>{
 const cache=new ShapeRasterCache(),at=(draw:number)=>shapeFrameAt({...props,shape_draw:draw},0,W,H);
 cache.beginFrame();
 const a=cache.raster('a',at(.6),W,H)!,b=cache.raster('b',at(.6),W,H)!;
 assert.notEqual(a.canvas,b.canvas,'each shape has its own canvas');
 assert.deepEqual([a.canvas.width,a.canvas.height],[W,H]);
 assert.ok(a.version instanceof ShapeRasterVersion);
 assert.equal(calls(a.canvas)[0],`translate ${at(.6).centerX} ${at(.6).centerY}`,'drawn unshifted at output scale');
 const drawn=calls(a.canvas).length;
 // Next frame, same inputs (opacity aside): the same raster, untouched.
 cache.beginFrame();
 assert.equal(cache.raster('a',{...at(.6),opacity:.3},W,H),a);
 assert.equal(calls(a.canvas).length,drawn);
 // Changed inputs in the frame after: the same canvas, reset first, with a new version.
 cache.beginFrame();
 const made=FakeCanvas.made,a2=cache.raster('a',at(.7),W,H)!;
 assert.equal(a2.canvas,a.canvas);assert.notEqual(a2.version,a.version);assert.equal(FakeCanvas.made,made);
 assert.deepEqual(calls(a.canvas).slice(drawn,drawn+2),['reset',`translate ${at(.7).centerX} ${at(.7).centerY}`]);
 // A second, different drawing of `a` in this frame gets its own canvas and leaves the first alone.
 const twice=cache.raster('a',at(.8),W,H)!;
 assert.notEqual(twice.canvas,a.canvas);assert.equal(cache.raster('a',at(.7),W,H),a2);
 // Nothing painted: no raster. A shape absent for a whole frame gives its canvas up.
 assert.equal(cache.raster('a',at(0),W,H),null);
 cache.beginFrame();
 assert.equal(b.canvas.width,1,'b was not drawn last frame');
 assert.notEqual(cache.raster('b',at(.6),W,H)!.canvas,b.canvas);
 // A new output size replaces the canvas.
 const resized=cache.raster('a',shapeFrameAt({...props,shape_draw:.7},0,W/2,H/2),W/2,H/2)!;
 assert.deepEqual([resized.canvas.width,resized.canvas.height],[W/2,H/2]);
});

test('scene draws hand each shape to the compositor as a vector draw, with no texture',async()=>{
 const {gpuSceneDraws}=await import('../gpu-preview/scene-draws');
 const shape=shapeFrameAt(props,0,W,H);
 const scene={width:W,height:H,layers:[{kind:'shape',element:{id:'s'},shape}]} as any;
 const [draw,...rest]=gpuSceneDraws(scene,new Map(),()=>undefined);
 assert.equal(rest.length,0);
 assert.deepEqual(draw,{shape:{id:'s',frame:shape},opacity:shape.opacity});
});
