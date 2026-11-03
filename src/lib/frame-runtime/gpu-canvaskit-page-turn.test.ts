import test from 'node:test';
import assert from 'node:assert/strict';
import type {CanvasKit,Surface,Canvas} from 'canvaskit-wasm';
import {pageTurnVisualPlan} from '../timeline/page-turn-plan';
import {canvasKitPageTurnPlan,canvasKitDrawPageTurn} from '../gpu-preview/canvaskit-page-turn';

test('page geometry retains segmented stills, two-sided pages and rigid video turns',()=>{
 for(const direction of ['from-left','from-right','from-top','from-bottom'] as const)for(const type of ['still','video_clip']){
  const at=(p:number)=>canvasKitPageTurnPlan({plan:pageTurnVisualPlan(p,{direction},type,360,640),width:360,height:640});
  const start=at(0),middle=at(.5),end=at(1);
  assert.ok(start.faces.length);assert.ok(start.faces.every(face=>!face.back));
  assert.ok(end.faces.some(face=>face.back));assert.ok(middle.faces.every(face=>face.matrix.every(Number.isFinite)));
  assert.equal(start.bytes,360*640*8);assert.deepEqual(middle,at(.5));
  assert.equal(start.faces.length,type==='still'&&(direction==='from-left'||direction==='from-right')?36:1);
 }
 const corner=canvasKitPageTurnPlan({plan:pageTurnVisualPlan(.4,{page_turn_origin:'bottom-right'},'still',360,640),width:360,height:640});
 assert.ok(corner.faces.every(face=>face.clip?.length===4));assert.ok(corner.faces.length<=28);
});

test('page rejects invalid geometry and releases source surface after callback failure',()=>{
 const plan={plan:pageTurnVisualPlan(.5,null,'still',320,180),width:320,height:180};
 assert.throws(()=>canvasKitPageTurnPlan({...plan,width:NaN}),/Invalid/);
 let deleted=0,draws=0;
 const surface={getCanvas:()=>({clear(){}}),delete(){deleted++;}} as unknown as Surface;
 const parent={makeSurface:()=>surface} as unknown as Surface;
 const output={getSaveCount:()=>1,restoreToCount(){},drawRect(){draws++;}} as unknown as Canvas;
 const kit={ColorType:{RGBA_8888:1},AlphaType:{Premul:1},ColorSpace:{SRGB:{}},TRANSPARENT:[0,0,0,0]} as unknown as CanvasKit;
 assert.throws(()=>canvasKitDrawPageTurn(kit,parent,output,canvasKitPageTurnPlan(plan),()=>{throw Error('missing tail');}),/missing tail/);
 assert.equal(deleted,1);assert.equal(draws,0);
});


test('rigid page does not reveal backside shadow before the authored quarter turn',()=>{
 for(const direction of ['from-left','from-right','from-top','from-bottom'] as const){
  const at=(p:number)=>canvasKitPageTurnPlan({plan:pageTurnVisualPlan(p,{direction},'video_clip',320,320),width:320,height:320});
  // 82.5 degrees: perspective reverses screen winding for some hinges,
  // but Standard has not exposed the reverse face or its box shadow yet.
  assert.ok(at(.5).faces.every(face=>!face.back));assert.equal(at(.5).faces.length,1);
  assert.ok(at(.6).faces.every(face=>face.back));assert.equal(at(.6).faces.length,1);
  assert.equal(at(90/165).faces.length,0);
 }
});


import {canvasKitPageBackdropContext} from '../gpu-preview/canvaskit-page-turn';
import CanvasKitInit from 'canvaskit-wasm';
test('page backdrop maps content crop before each homography and isolates clipped/back faces',()=>{
 const plan=canvasKitPageTurnPlan({plan:pageTurnVisualPlan(.2,{direction:'from-right'},'still',320,180),width:320,height:180});
 assert.ok(plan.faces.length>1);for(const face of plan.faces){const ctx=canvasKitPageBackdropContext(face),x=face.cropX,y=45,z=ctx.matrix[6]*x+ctx.matrix[7]*y+ctx.matrix[8],expectedZ=face.matrix[7]*y+face.matrix[8];assert.ok(Math.abs((ctx.matrix[0]*x+ctx.matrix[1]*y+ctx.matrix[2])/z-(face.matrix[1]*y+face.matrix[2])/expectedZ)<1e-7);assert.equal(ctx.isolated,face.back||!!face.clip);}
});
test('per-face page rendering supplies distinct mappings and retains bounded source surfaces',async()=>{
 const k=await CanvasKitInit(),surface=k.MakeSurface(64,64)!,paint=new k.Paint();paint.setColor(k.RED);
 const plan=canvasKitPageTurnPlan({plan:pageTurnVisualPlan(.15,{direction:'from-right'},'still',64,64),width:64,height:64});
 const contexts:number[][]=[];try{canvasKitDrawPageTurn(k,surface,surface.getCanvas(),plan,(c,context)=>{assert.ok(context);contexts.push(context.matrix);c.drawRect(k.LTRBRect(0,0,64,64),paint);},true);assert.equal(contexts.length,plan.faces.length);assert.ok(new Set(contexts.map(m=>JSON.stringify(m))).size>1);assert.equal(surface.getCanvas().getSaveCount(),1);}finally{paint.delete();surface.delete();}
});
