import test from 'node:test';
import assert from 'node:assert/strict';
import type {CanvasKit,Canvas,Surface} from 'canvaskit-wasm';
import {gpuCubeProjection} from '../gpu-preview/boundary-visual';
import {canvasKitProjectiveBoundaryPlan,canvasKitDrawProjectiveBoundary} from '../gpu-preview/canvaskit-projective-boundary';

test('cube boundary matrix preserves all projected corners and homogeneous perspective',()=>{
 for(const direction of ['from-left','from-right','from-top','from-bottom'] as const)for(const p of [.2,.5,.8]){
  const projected=gpuCubeProjection(p,'out',direction,320,180),plan=canvasKitProjectiveBoundaryPlan(projected,320,180),m=plan.matrix;
  assert.equal(plan.hidden,false);assert.equal(plan.bytes,320*180*8);
  for(const [i,[x,y]] of ([[0,0],[320,0],[320,180],[0,180]] as const).entries()){
   const w=m[6]*x+m[7]*y+m[8];assert.ok(Math.abs((m[0]*x+m[1]*y+m[2])/w-projected.quad[i][0])<1e-4);assert.ok(Math.abs((m[3]*x+m[4]*y+m[5])/w-projected.quad[i][1])<1e-4);
  }
  assert.ok(Math.abs(m[6])+Math.abs(m[7])>0);
 }
});

test('edge-on/back faces allocate nothing, malformed geometry rejects',()=>{
 const projection=gpuCubeProjection(0,'in','from-right',320,180);
 const plan=canvasKitProjectiveBoundaryPlan(projection,320,180);assert.equal(plan.hidden,true);assert.equal(plan.bytes,0);
 assert.equal(canvasKitProjectiveBoundaryPlan({...gpuCubeProjection(.5,'in','from-right',320,180),backfaceVisible:true},320,180).hidden,true);
 assert.throws(()=>canvasKitProjectiveBoundaryPlan({...projection,quad:[[NaN,0]]},320,180),/Invalid/);
 let calls=0;canvasKitDrawProjectiveBoundary({} as CanvasKit,{} as Surface,{} as Canvas,plan,320,180,()=>{calls++;});assert.equal(calls,0);
});

test('whole-actor callback precedes projection and resources release after callback failure',()=>{
 const calls:string[]=[];
 const actor={clear(){calls.push('clear');}} as unknown as Canvas;
 const image={delete(){calls.push('delete-image');}};
 const surface={getCanvas:()=>actor,flush(){calls.push('flush');},makeImageSnapshot:()=>image,delete(){calls.push('delete-surface');}};
 const parent={makeSurface:()=>surface} as unknown as Surface;
 const output={getSaveCount:()=>1,save(){calls.push('save');},concat(){calls.push('project');},drawImageRectOptions(){calls.push('publish-private');},restoreToCount(){calls.push('restore');}} as unknown as Canvas;
 class Paint{delete(){calls.push('delete-paint');}}
 const kit={Paint,ColorType:{RGBA_8888:1},AlphaType:{Premul:1},ColorSpace:{SRGB:{}},TRANSPARENT:[0,0,0,0],LTRBRect:(...x:number[])=>x,FilterMode:{Linear:1},MipmapMode:{None:1}} as unknown as CanvasKit;
 const plan=canvasKitProjectiveBoundaryPlan(gpuCubeProjection(.5,'in','from-right',320,180),320,180);
 canvasKitDrawProjectiveBoundary(kit,parent,output,plan,320,180,canvas=>{assert.equal(canvas,actor);calls.push('draw-actor');});
 assert.ok(calls.indexOf('draw-actor')<calls.indexOf('project'));assert.ok(calls.includes('delete-image'));assert.ok(calls.includes('delete-surface'));
 calls.length=0;assert.throws(()=>canvasKitDrawProjectiveBoundary(kit,parent,output,plan,320,180,()=>{throw Error('actor failed');}),/actor failed/);
 assert.ok(calls.includes('delete-surface'));assert.ok(calls.includes('delete-paint'));assert.ok(!calls.includes('publish-private'));
});
