import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import CanvasKitInit from 'canvaskit-wasm';
import {canvasKitRadialPlan,canvasKitRadialAlpha,CanvasKitRadialEffects} from '../gpu-preview/canvaskit-radial-effects';
const require=createRequire(import.meta.url),kit=CanvasKitInit({locateFile:()=>require.resolve('canvaskit-wasm/bin/canvaskit.wasm')});
test('iris uses each canvas half-axis and edge mask uses farthest corner',()=>{
 const p=canvasKitRadialPlan({radius:1,feather:.2,zoomBlur:40},1080,1920);
 assert.equal(p.edgeBlurSigma,40);assert.equal(canvasKitRadialAlpha(p,540,960,'iris'),1);
 assert.equal(canvasKitRadialAlpha(p,1080,960,'iris'),0);
 assert.ok(Math.abs(canvasKitRadialAlpha(p,1026,960,'iris')-.5)<1e-12);
 assert.equal(canvasKitRadialAlpha(p,540,960,'edge'),0);
 assert.equal(canvasKitRadialAlpha(p,1080,1920,'edge'),1);
 assert.ok(Math.abs(canvasKitRadialAlpha(p,1080,960,'edge')-(1/Math.SQRT2-.15)/.6)<1e-12);
 assert.equal(canvasKitRadialPlan({radius:2,feather:.08,zoomBlur:40},540,960).edgeBlurSigma,20);
 assert.equal(canvasKitRadialPlan({radius:2,feather:.08,zoomBlur:0},540,960).iris,null);
 assert.equal(canvasKitRadialAlpha(canvasKitRadialPlan({radius:0,feather:0,zoomBlur:0},100,100),50,50,'iris'),0);
 assert.throws(()=>canvasKitRadialPlan({radius:3,feather:0,zoomBlur:0},100,100),/Invalid/);
});
test('iris GPU-program logic renders its feather while preserving earlier actors',async()=>{
 const k=await kit,s=k.MakeSurface(20,40)!,c=s.getCanvas(),fx=new CanvasKitRadialEffects(k),paint=new k.Paint();
 try{
  c.clear(k.BLUE);c.saveLayer();paint.setColor(k.RED);c.drawPaint(paint);
  const plan=canvasKitRadialPlan({radius:1,feather:.4,zoomBlur:0},20,40);fx.applyIris(c,plan);c.restore();s.flush();
  const image=s.makeImageSnapshot();try{
   const p=image.readPixels(0,0,{width:20,height:40,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   for(const [x,y] of [[0,0],[10,20],[17,20],[10,34]]){
    const expected=Math.round(canvasKitRadialAlpha(plan,x+.5,y+.5,'iris')*255),i=(y*20+x)*4;
    assert.ok(Math.abs(p[i]-expected)<=1);assert.ok(Math.abs(p[i+2]-(255-expected))<=1);assert.equal(p[i+3],255);
   }
  }finally{image.delete();}
 }finally{paint.delete();fx.close();fx.close();s.delete();}
});
test('edge blur preserves center and modifies high frequency edges',async()=>{
 const k=await kit,s=k.MakeSurface(64,64)!,c=s.getCanvas(),fx=new CanvasKitRadialEffects(k),paint=new k.Paint();
 try{
  c.clear(k.WHITE);paint.setColor(k.BLACK);for(let x=0;x<64;x+=4)c.drawRect(k.LTRBRect(x,0,x+2,64),paint);
  const before=s.makeImageSnapshot();try{
   fx.drawEdgeBlur(c,canvasKitRadialPlan({radius:2,feather:.08,zoomBlur:40},64,64),before);s.flush();
   const after=s.makeImageSnapshot();try{
    const info={width:64,height:64,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB};
    const a=before.readPixels(0,0,info)!,b=after.readPixels(0,0,info)!;
    assert.equal(a[(32*64+32)*4],b[(32*64+32)*4]);
    assert.ok(b[(4*64+4)*4]>30,'Black edge stripes must blur toward gray');
    assert.ok(b[(4*64+6)*4]<225,'White edge stripes must blur toward gray');
    for(let i=3;i<b.length;i+=4)assert.equal(b[i],255);
   }finally{after.delete();}
  }finally{before.delete();}
 }finally{paint.delete();fx.close();s.delete();}
});
