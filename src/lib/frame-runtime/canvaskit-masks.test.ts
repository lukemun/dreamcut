import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import CanvasKitInit from 'canvaskit-wasm';
import {CanvasKitMasks,canvasKitMaskPlan,canvasKitCaptionMaskMatrix} from '../gpu-preview/canvaskit-masks';
const require=createRequire(import.meta.url);
const kit=CanvasKitInit({locateFile:()=>require.resolve('canvaskit-wasm/bin/canvaskit.wasm')});

test('caption UV mapping preserves offset, scale, and mirrored source coordinates',()=>{
 const m=canvasKitCaptionMaskMatrix([2,-4,.25,.5],200,100,50,25);
 const source=(x:number,y:number)=>[m[0]*x+m[2],m[4]*y+m[5]];
 assert.deepEqual(source(0,0),[-25,12.5]);
 assert.deepEqual(source(50,25),[75,-12.5]);
 assert.throws(()=>canvasKitCaptionMaskMatrix([0,1,0,0],20,20,20,20),/Invalid/);
});
test('mask plan rejects foreign GPU textures and malformed values before draw',()=>{
 assert.throws(()=>canvasKitMaskPlan({mask:{} as GPUTexture},10,10),/portable/);
 assert.throws(()=>canvasKitMaskPlan({featherMask:[0,10,0,3]},10,10),/Invalid/);
 assert.throws(()=>canvasKitMaskPlan({lineMask:[1,0,0,-1]},10,10),/Invalid/);
 const plan=canvasKitMaskPlan({featherMask:[0,10,3,3],lineMask:[1,0,5,2]},10,10);
 assert.deepEqual(plan.feather,[1,0,5,2,1,0,0,0]);
});
test('Skia mask shader preserves line direction, quantized feather, and actor isolation',async()=>{
 const k=await kit,s=k.MakeSurface(16,16)!;assert.ok(s);
 const c=s.getCanvas(),masks=new CanvasKitMasks(k),paint=new k.Paint();
 try{
  c.clear(k.BLUE);c.saveLayer();paint.setColor(k.RED);c.drawRect(k.LTRBRect(0,0,16,16),paint);
  masks.applyFeather(c,canvasKitMaskPlan({lineMask:[1,0,4,4]},16,16));c.restore();s.flush();
  const image=s.makeImageSnapshot();try{
   const pixels=image.readPixels(0,0,{width:16,height:16,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   assert.deepEqual(Array.from(pixels.slice(0,4)),[0,0,255,255]);
   assert.deepEqual(Array.from(pixels.slice(12*4,13*4)),[255,0,0,255]);
   assert.equal(pixels[4*4],32);assert.equal(pixels[4*4+2],223);
  }finally{image.delete();}
 }finally{paint.delete();masks.close();masks.close();s.delete();}
});
test('quadratic window removes only its hole and retains exterior pixels',async()=>{
 const k=await kit,s=k.MakeSurface(16,16)!,c=s.getCanvas(),masks=new CanvasKitMasks(k),paint=new k.Paint();
 try{
  c.clear(k.BLUE);c.save();masks.clipWindow(c,canvasKitMaskPlan({window:{rect:{x:4,y:4,width:8,height:8},radius:3}},16,16));
  paint.setColor(k.RED);c.drawPaint(paint);c.restore();s.flush();
  const image=s.makeImageSnapshot();try{
   const p=image.readPixels(0,0,{width:16,height:16,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   assert.deepEqual(Array.from(p.slice((8*16+8)*4,(8*16+8)*4+4)),[0,0,255,255]);
   assert.deepEqual(Array.from(p.slice(0,4)),[255,0,0,255]);
  }finally{image.delete();}
 }finally{paint.delete();masks.close();s.delete();}
});
test('caption alpha shader uses decal outside mapped mask and keeps source color',async()=>{
 const k=await kit,s=k.MakeSurface(16,16)!,c=s.getCanvas(),masks=new CanvasKitMasks(k),paint=new k.Paint();
 const image=k.MakeImage({width:2,height:2,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB},new Uint8Array([0,255,0,255,0,255,0,255,0,255,0,255,0,255,0,255]),8)!;
 try{
  c.clear(k.BLUE);c.saveLayer();paint.setColor(k.RED);c.drawPaint(paint);
  const plan=canvasKitMaskPlan({captionMask:{canvas:{width:2,height:2} as OffscreenCanvas,mapping:[2,2,-.5,-.5]}},16,16);
  masks.applyCaption(c,plan,image);c.restore();s.flush();
  const snapshot=s.makeImageSnapshot();try{
   const p=snapshot.readPixels(0,0,{width:16,height:16,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   assert.deepEqual(Array.from(p.slice(0,4)),[0,0,255,255]);
   assert.deepEqual(Array.from(p.slice((8*16+8)*4,(8*16+8)*4+4)),[255,0,0,255]);
  }finally{snapshot.delete();}
 }finally{image.delete();paint.delete();masks.close();s.delete();}
});
