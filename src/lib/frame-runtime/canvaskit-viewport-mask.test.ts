import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import CanvasKitInit from 'canvaskit-wasm';
import {applyCanvasKitViewportMask,withCanvasKitViewportMask} from '../gpu-preview/canvaskit-viewport-mask';
const require=createRequire(import.meta.url);
test('viewport alpha stays fixed while caption moves, and reset restores unmasked drawing',async()=>{
 const k=await CanvasKitInit({locateFile:()=>require.resolve('canvaskit-wasm/bin/canvaskit.wasm')}),s=k.MakeSurface(8,8)!,m=k.MakeSurface(8,8)!,p=new k.Paint();p.setColor(k.WHITE);m.getCanvas().clear(k.TRANSPARENT);m.getCanvas().drawRect(k.LTRBRect(0,0,4,8),p);const image=m.makeImageSnapshot(),c=s.getCanvas();
 const draw=(x:number,masked:boolean)=>{c.clear(k.TRANSPARENT);c.saveLayer();c.save();c.translate(x,0);c.drawRect(k.LTRBRect(0,0,4,8),p);c.restore();if(masked)applyCanvasKitViewportMask(k,c,image,8,8);c.restore();const snap=s.makeImageSnapshot();try{return snap.readPixels(0,0,{width:8,height:8,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB}) as Uint8Array;}finally{snap.delete();}};
 const a=draw(2,true),b=draw(3,true),reset=draw(2,false);assert.equal(a[(3*8+3)*4+3],255);assert.equal(a[(3*8+4)*4+3],0);assert.equal(b[(3*8+4)*4+3],0);assert.equal(reset[(3*8+4)*4+3],255);image.delete();p.delete();m.delete();s.delete();
});

test('outer mask scope preserves scene background and save depth across repeated frames and rejects leaking actors',async()=>{
 const k=await CanvasKitInit({locateFile:()=>require.resolve('canvaskit-wasm/bin/canvaskit.wasm')}),s=k.MakeSurface(8,8)!,m=k.MakeSurface(8,8)!,paint=new k.Paint();paint.setColor(k.WHITE);m.getCanvas().clear(k.TRANSPARENT);m.getCanvas().drawRect(k.LTRBRect(0,0,4,8),paint);const mask=m.makeImageSnapshot(),c=s.getCanvas(),initial=c.getSaveCount();
 const draw=()=>{c.clear(k.RED);withCanvasKitViewportMask(k,c,mask,8,8,k.BlendMode.SrcOver,()=>c.drawRect(k.LTRBRect(0,0,8,8),paint));assert.equal(c.getSaveCount(),initial);const image=s.makeImageSnapshot();try{return image.readPixels(0,0,{width:8,height:8,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB}) as Uint8Array;}finally{image.delete();}};
 const first=draw();assert.deepEqual([...first.slice((4*8+6)*4,(4*8+6)*4+4)],[255,0,0,255]);assert.deepEqual(draw(),first);assert.throws(()=>withCanvasKitViewportMask(k,c,mask,8,8,k.BlendMode.SrcOver,()=>c.save()),/unbalanced/);assert.equal(c.getSaveCount(),initial);mask.delete();paint.delete();m.delete();s.delete();
});
