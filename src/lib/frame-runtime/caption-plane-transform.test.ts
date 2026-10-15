import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector4} from 'three';
import CanvasKitInit from 'canvaskit-wasm';
import {captionPlaneTransform,captionPlaneCss,projectCaptionPlanePoint} from '../timeline/caption-plane-transform';
import {resolveCaptionProps} from '../timeline/captions';
import {evaluateGpuScene} from '../gpu-preview/scene';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {setGpuTextAnchor} from '../gpu-preview/text-bounds';
import {canvasKitSourceMatrix} from '../gpu-preview/canvaskit-geometry';
import {canvasKitBlendMode} from '../gpu-preview/canvaskit-blend';
import type {CompositionElement} from '../render/composition-adapters';
const text=resolveCaptionProps({surfaceMode:'wall',surfacePerspectivePx:1000,surfaceDepthPx:-90,surfaceRotateXDeg:12,surfaceRotateYDeg:-18,surfaceRotateZDeg:7,surfaceSkewXDeg:4,surfaceSkewYDeg:-3,textScaleX:1.2,textScaleY:.8});
test('shared caption transform keeps Standard CSS order and matches independent homogeneous matrix math',()=>{
 const p=captionPlaneTransform(text,.9,15),r=Math.PI/180;
 assert.equal(captionPlaneCss(p),'perspective(1000px) translateZ(-90px) rotateX(12deg) rotateY(-18deg) rotateZ(22deg) skew(4deg, -3deg) scale(1.08, 0.7200000000000001)');
 const matrix=new Matrix4().set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,-1/p.perspective,1)
  .multiply(new Matrix4().makeTranslation(0,0,p.depth))
  .multiply(new Matrix4().makeRotationX(p.rotateX*r)).multiply(new Matrix4().makeRotationY(p.rotateY*r)).multiply(new Matrix4().makeRotationZ(p.rotateZ*r))
  .multiply(new Matrix4().set(1,Math.tan(p.skewX*r),0,0,Math.tan(p.skewY*r),1,0,0,0,0,1,0,0,0,0,1))
  .multiply(new Matrix4().makeScale(p.scaleX,p.scaleY,1));
 const anchor=[200,300] as const,translation=[17,-23] as const;
 for(const point of [[0,0],[100,200],[250,380],[400,600]] as const){
  const expected=new Vector4(point[0]-anchor[0],point[1]-anchor[1],0,1).applyMatrix4(matrix);
  const actual=projectCaptionPlanePoint(p,point,anchor,translation);
  assert.ok(Math.abs(actual[0]-(expected.x/expected.w+217))<1e-9);
  assert.ok(Math.abs(actual[1]-(expected.y/expected.w+277))<1e-9);
 }
 assert.throws(()=>projectCaptionPlanePoint({...p,perspective:0},[0,0],anchor),/Invalid caption plane/);
});
test('a flat caption plane emits no 3D function, so Standard does not composite and resample its glyphs',()=>{
 const flat=captionPlaneTransform(resolveCaptionProps({textScaleX:1.1}),.9,5);
 assert.equal(captionPlaneCss(flat),'rotateZ(5deg) skew(0deg, 0deg) scale(0.9900000000000001, 0.9)');
 // perspective() is the identity for a plane with no depth or tilt.
 const point=projectCaptionPlanePoint(flat,[120,40],[100,100]);
 const rz=5*Math.PI/180,x=20*.99,y=-60*.9;
 assert.ok(Math.abs(point[0]-(100+Math.cos(rz)*x-Math.sin(rz)*y))<1e-9&&Math.abs(point[1]-(100+Math.sin(rz)*x+Math.cos(rz)*y))<1e-9);
 assert.match(captionPlaneCss(captionPlaneTransform(resolveCaptionProps({surfaceMode:'wall',surfaceRotateYDeg:10}))),/^perspective\(/);
});
const actor:CompositionElement={id:'caption',type:'caption_text',source_url:null,timeline_start:0,duration:3,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props:{...text,text:'Wall',animationIn:'rotate_in',animationOut:'focus_settle',animationInDuration:1,animationOutDuration:1,styleVariant:'none'}};
test('wall packet places full caption filter before shared projection through repeated nonfade seeks',()=>{
 const canvas={width:320,height:568} as OffscreenCanvas,anchor=[160,284] as const;setGpuTextAnchor(canvas,anchor);
 for(const frame of [5,75,15,30,5]){
  const scene=evaluateGpuScene([actor],[],frame,320,568,'fixture'),layer=scene.layers[0];assert.equal(layer.kind,'caption');if(layer.kind!=='caption')continue;
  const packet=gpuSceneDraws(scene,new Map(),()=>canvas)[0];assert.ok(packet.captionPlane);assert.equal(packet.group,undefined);
  assert.equal(packet.postBlur?.x,(layer.blurPx??0)+text.surfaceBlurPx);assert.equal(packet.opacity,(layer.opacity??1)*text.surfaceOpacity);
  const matrix=canvasKitSourceMatrix(packet.captionPlane!,320,568,320,568);
  const point=[180,260] as const,expected=projectCaptionPlanePoint(captionPlaneTransform(text,layer.scale,layer.rotateZDeg),point,anchor,[layer.translation?.x??0,layer.translation?.y??0]);
  const w=matrix[6]*point[0]+matrix[7]*point[1]+matrix[8];
  assert.ok(Math.abs((matrix[0]*point[0]+matrix[1]*point[1]+matrix[2])/w-expected[0])<1e-4);
  assert.ok(Math.abs((matrix[3]*point[0]+matrix[4]*point[1]+matrix[5])/w-expected[1])<1e-4);
 }
});
test('CanvasKit local filtered caption is projected as a whole with shared outer blending',async()=>{
 const k=await CanvasKitInit(),surface=k.MakeSurface(64,64)!,paint=new k.Paint(),ink=new k.Paint();
 const scene=evaluateGpuScene([{...actor,props:{...actor.props,animationIn:'none',animationOut:'none',surfaceBlendMode:'multiply',surfaceRotateYDeg:20,surfaceRotateZDeg:18,surfaceBlurPx:2}}],[],30,64,64,'fixture');
 const canvas={width:64,height:64} as OffscreenCanvas;setGpuTextAnchor(canvas,[32,32]);const packet=gpuSceneDraws(scene,new Map(),()=>canvas)[0];
 const filter=k.ImageFilter.MakeBlur(packet.postBlur!.x,packet.postBlur!.y,k.TileMode.Decal,null)!;
 try{
  const c=surface.getCanvas();c.clear(k.Color(128,192,64));c.save();c.concat(canvasKitSourceMatrix(packet.captionPlane!,64,64,64,64));
  paint.setBlendMode(canvasKitBlendMode(k,packet.blend));paint.setAlphaf(packet.opacity);paint.setImageFilter(filter);c.saveLayer(paint);ink.setColor(k.Color(32,64,64));c.drawRect(k.LTRBRect(22,22,42,42),ink);c.restore();c.restore();surface.flush();
  const image=surface.makeImageSnapshot();try{
   const rgba=image.readPixels(0,0,{width:64,height:64,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   const center=(32*64+32)*4;assert.ok(rgba[center]<100);assert.ok(rgba[center+1]<140);assert.equal(rgba[center+3],255);
   assert.deepEqual([...rgba.slice(0,4)],[128,192,64,255]);
  }finally{image.delete();}
 }finally{filter.delete();paint.delete();ink.delete();surface.delete();}
});
