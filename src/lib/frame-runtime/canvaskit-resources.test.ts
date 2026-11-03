import test from 'node:test';
import assert from 'node:assert/strict';
import {CanvasKitCompositor,CANVASKIT_EXPORT_BUDGET_BYTES} from '../gpu-preview/canvaskit-compositor';

function fixture(usage:unknown){
 return Object.assign(Object.create(CanvasKitCompositor.prototype),{
  closed:false,lost:false,scale:1,baseBytes:8,activeBytes:16,cacheBudgetBytes:32,colorBudgetBytes:8,colors:{bytes:4},budgetBytes:100,
  kit:{BlendMode:{SrcOver:3}},
  canvas:{width:2,height:2},stage:{width:2,height:2},
  graphics:{getResourceCacheUsageBytes:()=>usage,setResourceCacheLimitBytes:()=>{}},
  surface:{getCanvas:()=>assert.fail('Over-budget packet must not begin drawing')},
 }) as CanvasKitCompositor;
}
test('missing Skia telemetry reserves configured cache instead of reporting NaN or zero',()=>{
 for(const usage of [undefined,null,NaN,Infinity,-1])assert.equal(fixture(usage).bytes,60);
 assert.equal(fixture(0).bytes,28);
 assert.equal(fixture(80).bytes,108,'Live allocation exceeding cache target must remain visible');
 const closed=fixture(undefined);Object.assign(closed,{closed:true});assert.equal(closed.bytes,0);
});
test('packet budget does not depend on the broken CanvasKit cache-limit getter',()=>{
 const f=fixture(undefined);
 assert.throws(()=>f.draw([{frame:{width:4,height:4} as OffscreenCanvas,
  transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],opacity:1}]),/layer exceeds budget/);
});

test('malformed portable color resources reject before any private frame draw',()=>{
 const f=fixture(undefined),layer={frame:{width:1,height:1} as OffscreenCanvas,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],opacity:1};
 assert.throws(()=>f.draw([{...layer,chroma:{color:'#00ff00',tolerance:NaN,softness:.1,spill:0}}]),/Invalid CanvasKit chroma/);
 assert.throws(()=>f.draw([{...layer,lut:{size:2,domainMin:[0,0,0],domainMax:[1,1,1],intensity:1}}]),/portable grade resource/);
});

test('multiple layers use peak live upload memory and surrender cache before drawing',()=>{
 const f=fixture(undefined);let cache=-1;
 Object.assign(f,{activeBytes:0,graphics:{setResourceCacheLimitBytes:(bytes:number)=>{cache=bytes;}},surface:{getCanvas:()=>{throw Error('accepted-packet');}}});
 const layer={frame:{width:3,height:3} as OffscreenCanvas,transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],opacity:1};
 // Five 72-byte actors exceed 100 bytes if retained together. One actor plus
 // base/color reservations fits with a 12-byte reusable cache.
 assert.throws(()=>f.draw(Array(5).fill(layer)),/accepted-packet/);
 assert.equal(cache,12);
});


test('bounded export allowance accepts an original photo while rejecting oversized uploads',()=>{
 const f=fixture(undefined);
 Object.assign(f,{baseBytes:1080*1920*8,colorBudgetBytes:4*1024*1024,cacheBudgetBytes:32*1024*1024,
  budgetBytes:CANVASKIT_EXPORT_BUDGET_BYTES,canvas:{width:1080,height:1920},stage:{width:1080,height:1920},
  surface:{getCanvas:()=>{throw Error('accepted-original');}}});
 const layer={frame:{width:4032,height:3024} as OffscreenCanvas,
  transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],opacity:1};
 assert.throws(()=>f.draw([layer]),/accepted-original/);
 assert.throws(()=>f.draw([{...layer,frame:{width:10000,height:10000} as OffscreenCanvas}]),/layer exceeds budget/);
});
