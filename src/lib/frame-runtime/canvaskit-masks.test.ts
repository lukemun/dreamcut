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
test('rounded crop at full roundness on a square crop draws a true circle in Skia',async()=>{
 const {gpuRoundedMask,roundedMaskAlpha}=await import('../gpu-preview/feather-mask');
 const k=await kit,W=64,H=32,s=k.MakeSurface(W,H)!,c=s.getCanvas(),masks=new CanvasKitMasks(k),paint=new k.Paint();
 // A 24 px square crop 4 px from the bottom-left corner of a 64x32 canvas.
 const mask={top:4/32,right:36/64,bottom:4/32,left:4/64};
 const rounded=gpuRoundedMask(mask,0,.5,W,H)!;
 assert.deepEqual(rounded,[16,16,12,12,12,0]);
 const plan=canvasKitMaskPlan({roundedMask:rounded,featherMask:[4,28,2,3]},W,H);
 assert.deepEqual(plan.feather,[16,16,12,12,2,12,0,0]);
 try{
  c.clear(k.TRANSPARENT);c.saveLayer();paint.setColor(k.RED);c.drawPaint(paint);masks.applyFeather(c,plan);c.restore();s.flush();
  const image=s.makeImageSnapshot();try{
   const p=image.readPixels(0,0,{width:W,height:H,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   const alpha=(x:number,y:number)=>p[(y*W+x)*4+3];
   assert.equal(alpha(16,16),255,'centre is opaque');
   assert.equal(alpha(5,5),0,'square corner is cut away');
   assert.equal(alpha(26,5),0,'other corner is cut away');
   assert.equal(alpha(5,16),255,'edge midpoint stays inside the circle');
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const d=Math.hypot(x+.5-16,y+.5-16);
    if(d<11)assert.equal(alpha(x,y),255,`inside ${x},${y}`);
    if(d>13)assert.equal(alpha(x,y),0,`outside ${x},${y}`);
    assert.ok(Math.abs(alpha(x,y)-Math.round(roundedMaskAlpha(rounded,x+.5,y+.5)*255))<=2,`CPU reference ${x},${y}`);
   }
  }finally{image.delete();}
 }finally{paint.delete();masks.close();s.delete();}
});
test('feathered rounded crop ramps inward from the rounded edge',async()=>{
 const {gpuRoundedMask,roundedMaskAlpha}=await import('../gpu-preview/feather-mask');
 const rounded=gpuRoundedMask({top:.25,right:.25,bottom:.25,left:.25},.1,.5,100,100)!;
 assert.deepEqual(rounded,[50,50,25,25,25,10]);
 assert.equal(roundedMaskAlpha(rounded,50,50),1);
 assert.equal(roundedMaskAlpha(rounded,50,25),0);
 assert.ok(Math.abs(roundedMaskAlpha(rounded,50,30)-.502)<.01);
 assert.equal(roundedMaskAlpha(rounded,28,28),0);
 assert.throws(()=>canvasKitMaskPlan({roundedMask:[0,0,0,1,1,0]},10,10),/Invalid/);
});
