import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasKitBackdropScope} from '../gpu-preview/canvaskit-backdrop';
const canvas={width:320,height:180},root={known:true,isolated:false};
test('outer opacity and masks establish the edge sibling actor backdrop root',()=>{
 for(const props of [{media_opacity:.5},{mask_inset:[.2,0,0,0]},{mask_inset:[.2,0,0,0],mask_feather:.1}]){
  assert.equal(canvasKitBackdropScope(props,0,canvas,root),'actor');
 }
});
test('source alpha and inner iris/window/grade do not isolate sibling backdrop',()=>{
 for(const props of [{},{has_alpha:true},{iris_radius:.5},{window_open_duration:1},{grade_exposure_ev:1,color_grade_model:'linear-srgb-v1'}])assert.equal(canvasKitBackdropScope(props,.5,canvas,root),'scene');
});
test('known enclosing isolation and unknown wrappers stay distinct',()=>{
 assert.equal(canvasKitBackdropScope({},0,canvas,{known:true,isolated:true}),'actor');
 assert.equal(canvasKitBackdropScope({},0,canvas,{known:false,isolated:false}),'unresolved');
 assert.equal(canvasKitBackdropScope({media_opacity:.5},0,canvas,{known:false,isolated:false}),'actor');
});

import CanvasKitInit from 'canvaskit-wasm';
import {canvasKitBackdropInverse,canvasKitComposeSceneBackdrop} from '../gpu-preview/canvaskit-backdrop';
import {CanvasKitRadialEffects,canvasKitRadialPlan} from '../gpu-preview/canvaskit-radial-effects';
const kit=CanvasKitInit();
test('backdrop inverse maps rotated/scaled parent coordinates back to local pixels',()=>{
 const group={width:100,height:80,scale:2,translateX:12,translateY:-4,rotateZDeg:90};
 const m=canvasKitBackdropInverse(group,100,80);
 // Local (60,40) maps to world (62,56).
 assert.ok(Math.abs(m[0]*62+m[1]*56+m[2]-60)<1e-9);
 assert.ok(Math.abs(m[3]*62+m[4]*56+m[5]-40)<1e-9);
});
test('transparent actor edge blur samples prior actors while identity preserves them exactly',async()=>{
 const k=await kit,width=64,height=64,scene=k.MakeSurface(width,height)!,actor=k.MakeSurface(width,height)!,paint=new k.Paint(),fx=new CanvasKitRadialEffects(k);
 const info={width,height,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB};
 try{
  const base=scene.getCanvas();base.clear(k.WHITE);paint.setColor(k.BLACK);
  for(let x=0;x<width;x+=4)base.drawRect(k.LTRBRect(x,0,x+2,height),paint);
  const ac=actor.getCanvas();ac.clear(k.TRANSPARENT);paint.setColor(k.RED);ac.drawRect(k.LTRBRect(25,25,39,39),paint);
  scene.flush();actor.flush();const previous=scene.makeImageSnapshot(),foreground=actor.makeImageSnapshot();
  try{
   const composed=canvasKitComposeSceneBackdrop(k,scene,previous,foreground);
   try{
    // Disabled effect does not smear or repaint the background.
    fx.drawEdgeBlur(ac,canvasKitRadialPlan({radius:2,feather:.08,zoomBlur:0},width,height),composed.image);
    const identity=actor.makeImageSnapshot();try{assert.deepEqual(identity.readPixels(0,0,info),foreground.readPixels(0,0,info));}finally{identity.delete();}
    fx.drawEdgeBlur(ac,canvasKitRadialPlan({radius:2,feather:.08,zoomBlur:40},width,height),composed.image);actor.flush();
    const output=actor.makeImageSnapshot();try{
     base.drawImage(output,0,0);scene.flush();const result=scene.makeImageSnapshot();try{
      const pixels=result.readPixels(0,0,info)!;
      assert.ok(pixels[(4*width+4)*4]>30,'Transparent actor edge samples black/white background stripes');
      assert.ok(pixels[(4*width+6)*4]<225,'White background stripe receives blur too');
      assert.deepEqual([...pixels.slice((32*width+32)*4,(32*width+32)*4+4)],[255,0,0,255],'Unblurred center retains foreground');
     }finally{result.delete();}
    }finally{output.delete();}
   }finally{composed.delete();composed.delete();}
  }finally{previous.delete();foreground.delete();}
 }finally{fx.close();paint.delete();actor.delete();scene.delete();}
});

import {canvasKitBackdropAncestor,canvasKitBackdropProjectiveInverse} from '../gpu-preview/canvaskit-backdrop';
test('enclosing boundary filter/clip/opacity and media blend isolate; cube transform alone does not',()=>{
 const base={grid:false,animationOpacity:1,animationBlur:false,blend:'normal',spiral:false};
 const cube={type:'cube',opacity:1,filtered:false,clipped:false};
 assert.deepEqual(canvasKitBackdropAncestor({...base,transition:cube}),{known:true,isolated:false});
 for(const change of [{opacity:.5},{filtered:true},{clipped:true}])assert.deepEqual(canvasKitBackdropAncestor({...base,transition:{...cube,...change}}),{known:true,isolated:true});
 assert.deepEqual(canvasKitBackdropAncestor({...base,blend:'difference'}),{known:true,isolated:true});
 assert.equal(canvasKitBackdropAncestor({...base,transition:{...cube,type:'page_turn'}}).known,true);
 assert.equal(canvasKitBackdropAncestor({...base,spiral:true}).known,true);
});
test('perspective backdrop inversion round-trips the complete homography',()=>{
 const m=[1.2,.1,12,-.2,.9,4,.001,.002,1],inverse=canvasKitBackdropProjectiveInverse(m);
 const map=(m:readonly number[],p:number[])=>{const z=m[6]*p[0]+m[7]*p[1]+m[8];return [(m[0]*p[0]+m[1]*p[1]+m[2])/z,(m[3]*p[0]+m[4]*p[1]+m[5])/z];};
 for(const p of [[0,0],[30,50],[80,20]]){const result=map(inverse,map(m,p));assert.ok(Math.hypot(result[0]-p[0],result[1]-p[1])<1e-9);}
 assert.throws(()=>canvasKitBackdropProjectiveInverse(Array(9).fill(0)),/Singular/);
});
test('scene backdrop drawing samples through the whole actor projection before edge filtering',async()=>{
 const k=await kit,width=32,height=16,owner=k.MakeSurface(width,height)!,actor=k.MakeSurface(width,height)!,paint=new k.Paint();
 const info={width,height,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB};
 try{
  const c=owner.getCanvas();for(let x=0;x<width;x++){paint.setColor(k.Color(x*8,0,0,1));c.drawRect(k.LTRBRect(x,0,x+1,height),paint);}
  actor.getCanvas().clear(k.TRANSPARENT);owner.flush();actor.flush();const scene=owner.makeImageSnapshot(),front=actor.makeImageSnapshot();
  try{
   const result=canvasKitComposeSceneBackdrop(k,owner,scene,front,undefined,[1,0,10,0,1,0,0,0,1]);
   try{const p=result.image.readPixels(0,0,info)!;assert.equal(p[(5*width+5)*4],120,'Local pixel 5 samples scene pixel 15 under translated parent');}finally{result.delete();}
  }finally{scene.delete();front.delete();}
 }finally{paint.delete();actor.delete();owner.delete();}
});

test('ordinary grid, native opacity and filter wrappers resolve to supported actor-local backdrop',()=>{
 const base={grid:false,animationOpacity:1,animationBlur:false,blend:'normal',spiral:false};
 for(const change of [{grid:true},{animationOpacity:.4},{animationBlur:true},{animationClip:true},{blend:'difference'}]){
  const ancestor=canvasKitBackdropAncestor({...base,...change});
  assert.deepEqual(ancestor,{known:true,isolated:true});
  assert.equal(canvasKitBackdropScope({zoom_blur:30},.5,canvas,ancestor),'actor');
 }
 // Source opacity is owned by the outer media wrapper, not an invalid
 // scene-backdrop packet with opacity applied after sampling the scene.
 assert.equal(canvasKitBackdropScope({zoom_blur:30,media_opacity:.4},.5,canvas,canvasKitBackdropAncestor(base)),'actor');
});
