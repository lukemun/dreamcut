import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import CanvasKitInit from 'canvaskit-wasm';
import {canvasKitGridMattePlan,canvasKitGridMattePixels,makeCanvasKitGridMatteImage,applyCanvasKitGridMatte,drawCanvasKitGridLines} from '../gpu-preview/canvaskit-grid-matte';
const require=createRequire(import.meta.url),kit=CanvasKitInit({locateFile:()=>require.resolve('canvaskit-wasm/bin/canvaskit.wasm')});
const mask={source_url:'/api/projects/test/media/mask',source_start_seconds:3,fps:10,frame_count:20,width:6,height:2,source_sha256:'0'.repeat(64)};
const props={grid_matte_mask:mask,grid_matte_cell_size:360};
test('grid matte uses actual source frame, fits mask aspect, and retains authored lines',()=>{
 const p=canvasKitGridMattePlan(props,3.31,120,120)!;
 assert.equal(p.url,mask.source_url+'/00003.png');assert.deepEqual(p.rect,{x:0,y:40,width:120,height:40});
 assert.equal(p.columns,3);assert.equal(p.rows,1);
 assert.equal(p.lineWidth,120/1080);
 assert.equal(canvasKitGridMattePlan({...props,grid_matte_enabled:false},30,120,120),null);
 assert.equal(canvasKitGridMattePlan({...props,grid_matte_cell_size:0},30,120,120),null);
 assert.throws(()=>canvasKitGridMattePlan(props,2,120,120),/does not cover/);
 assert.equal(canvasKitGridMattePlan(props,3.01,120,120)!.url,mask.source_url+'/00000.png');
});
test('cell alpha uses shared red-channel area mean rather than source alpha',()=>{
 const plan=canvasKitGridMattePlan({...props,grid_matte_coverage:2},3,120,120)!;
 const data=new Uint8ClampedArray(6*2*4);
 for(let y=0;y<2;y++)for(let x=0;x<6;x++){const i=(y*6+x)*4;data[i]=x<2?0:x<4?64:255;data[i+1]=255;data[i+3]=0;}
 const output=canvasKitGridMattePixels(plan,{url:plan.url,data,width:6,height:2});
 assert.deepEqual(Array.from(output),[255,255,255,0,255,255,255,128,255,255,255,255]);
 assert.throws(()=>canvasKitGridMattePixels(plan,{url:'wrong-frame',data,width:6,height:2}),/frame mismatch/);
});
test('cell shader clips to fit rectangle, keeps picture sharp, lines survive zero alpha',async()=>{
 const k=await kit,s=k.MakeSurface(120,120)!,c=s.getCanvas(),paint=new k.Paint();
 const plan=canvasKitGridMattePlan({...props,grid_matte_line_width:8,grid_matte_line_opacity:1},3,120,120)!;
 const data=new Uint8Array([255,255,255,0,255,255,255,128,255,255,255,255]),image=makeCanvasKitGridMatteImage(k,plan,data);
 try{
  c.clear(k.BLUE);c.saveLayer();paint.setColor(k.RED);c.drawPaint(paint);
  paint.setColor(k.GREEN);c.drawRect(k.LTRBRect(99,50,100,70),paint);
  applyCanvasKitGridMatte(k,c,plan,image);c.restore();drawCanvasKitGridLines(k,c,plan);s.flush();
  const snapshot=s.makeImageSnapshot();try{
   const p=snapshot.readPixels(0,0,{width:120,height:120,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   const pixel=(x:number,y:number)=>Array.from(p.slice((y*120+x)*4,(y*120+x)*4+4));
   assert.deepEqual(pixel(100,20),[0,0,255,255]);
   assert.deepEqual(pixel(20,60),[0,0,255,255]);
   assert.deepEqual(pixel(60,60),[128,0,127,255]);
   assert.deepEqual(pixel(100,60),[255,0,0,255]);
   assert.deepEqual(pixel(99,60),[0,255,0,255],'One-pixel source detail stays sharp within a large cell');
   assert.ok(pixel(20,40)[2]<255,'Top line must remain visible over a zero-alpha cell');
  }finally{snapshot.delete();}
 }finally{image.delete();paint.delete();s.delete();}
});
